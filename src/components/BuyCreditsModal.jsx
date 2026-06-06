import { useState } from "react";
import { supabase } from "../utils/supabase";

const PACKS = [
  { label: "50¢", cents: 50,  desc: "Starter" },
  { label: "$2",  cents: 200, desc: "Standard" },
  { label: "$5",  cents: 500, desc: "Value" },
];

export default function BuyCreditsModal({ onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handleBuy = async (cents) => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in first.");

      const origin     = `${window.location.origin}${window.location.pathname}`;
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
        <button className="credits-modal-close" onClick={onClose}>✕</button>
        <h2 className="credits-modal-title">Buy AI Credits</h2>
        <p className="credits-modal-sub">Credits are deducted based on actual token usage.</p>

        <div className="credits-packs">
          {PACKS.map((pack) => (
            <button
              key={pack.cents}
              className="credits-pack-btn"
              onClick={() => handleBuy(pack.cents)}
              disabled={loading}
            >
              <span className="credits-pack-amount">{pack.label}</span>
              <span className="credits-pack-desc">{pack.desc}</span>
            </button>
          ))}
        </div>

        {error && <p className="credits-modal-error">{error}</p>}

        <p className="credits-modal-note">
          You'll be taken to Stripe's secure checkout in a new tab. Credits appear in your account within seconds of payment.
        </p>
      </div>
    </div>
  );
}
