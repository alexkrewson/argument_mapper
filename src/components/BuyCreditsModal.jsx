import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "../utils/supabase";
import { isPlayBillingPlatform, loadPlayProducts, buyWithPlay } from "../utils/playBilling";

const PROD_ORIGIN = "https://idisagree.trolleysolution.com";

const PACKS = [
  { label: "50¢", cents: 50,  desc: "Starter" },
  { label: "$2",  cents: 200, desc: "Standard" },
  { label: "$5",  cents: 500, desc: "Value" },
];

const creditLabel = (cents) => (cents >= 100 ? `$${cents / 100}` : `${cents}¢`);

export default function BuyCreditsModal({ onClose, user, onPurchased }) {
  const play = isPlayBillingPlatform();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [notice, setNotice]   = useState(null);
  // Play products with their local prices; null while loading.
  const [playProducts, setPlayProducts] = useState(play ? null : []);

  useEffect(() => {
    if (!play) return;
    let live = true;
    loadPlayProducts()
      .then((products) => {
        if (!live) return;
        setPlayProducts(products);
        if (products.length === 0) setError("Top-ups aren't available right now. Try again later.");
      })
      .catch((err) => {
        if (!live) return;
        setPlayProducts([]);
        // BILLING_UNAVAILABLE: no Play Store, or an install that didn't come
        // from Play (a sideloaded or debug build).
        setError(err.code === "BILLING_UNAVAILABLE"
          ? "Google Play purchases aren't available on this device."
          : "Couldn't reach Google Play. Check your connection and try again.");
      });
    return () => { live = false; };
  }, [play]);

  const handlePlayBuy = async (productId) => {
    if (!user) { setError("Please sign in first."); return; }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await buyWithPlay(productId, user.id);
      if (result.pending) {
        setNotice("Payment pending. Your credits will appear once Google Play confirms it.");
        return;
      }
      onPurchased?.(result.balance);
      onClose();
    } catch (err) {
      if (err.code === "USER_CANCELED") return;
      // Paid, but our server couldn't confirm it yet. Play holds the purchase
      // unconsumed and the next launch claims it, so the money isn't lost.
      setError(err.status
        ? "Payment received, but your credits haven't landed yet. They'll be added the next time you open the app."
        : "The purchase didn't go through. You haven't been charged.");
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = async (cents) => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first.");

      // Capacitor's Android/iOS WebView reports window.location.origin as
      // https://localhost regardless of the real deployed domain, so the
      // native app must use the production origin instead.
      const origin     = Capacitor.isNativePlatform()
        ? `${PROD_ORIGIN}/`
        : `${window.location.origin}${window.location.pathname}`;
      const successUrl = `${origin}?payment=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl  = `${origin}?payment=cancelled`;

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ amount_cents: cents, success_url: successUrl, cancel_url: cancelUrl }),
        }
      );
      if (!resp.ok) throw new Error("Couldn't create checkout session. Try again.");
      const { url } = await resp.json();
      window.open(url, "_blank");
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="concession-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="concession-modal credits-modal" onClick={(e) => e.stopPropagation()}>
        <button className="credits-modal-close" data-testid="credits-modal-close" onClick={onClose}>✕</button>
        <h2 className="credits-modal-title">Buy AI Credits</h2>
        <p className="credits-modal-sub">Credits are deducted based on actual token usage.</p>

        {play ? (
          playProducts === null ? (
            <p className="credits-modal-note" data-testid="credits-play-loading">Loading prices from Google Play…</p>
          ) : (
            <div className="credits-packs">
              {playProducts.map((p) => (
                <button
                  key={p.productId}
                  className="credits-pack-btn"
                  onClick={() => handlePlayBuy(p.productId)}
                  disabled={loading}
                  data-testid={`credits-pack-${p.cents}`}
                >
                  <span className="credits-pack-amount">{creditLabel(p.cents)}</span>
                  <span className="credits-pack-desc">{p.price}</span>
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="credits-packs">
            {PACKS.map((pack) => (
              <button
                key={pack.cents}
                className="credits-pack-btn"
                onClick={() => handleBuy(pack.cents)}
                disabled={loading}
                data-testid={`credits-pack-${pack.cents}`}
              >
                <span className="credits-pack-amount">{pack.label}</span>
                <span className="credits-pack-desc">{pack.desc}</span>
              </button>
            ))}
          </div>
        )}

        {error && <p className="credits-modal-error" data-testid="credits-modal-error">{error}</p>}
        {notice && <p className="credits-modal-note" data-testid="credits-modal-notice">{notice}</p>}

        <p className="credits-modal-note">
          {play
            ? "Paid through Google Play. The amount shown on each pack is the AI credit you receive; the price beneath it is what Google Play charges in your currency."
            : "You'll be taken to Stripe's secure checkout in a new tab. Credits appear in your account within seconds of payment."}
        </p>
      </div>
    </div>
  );
}
