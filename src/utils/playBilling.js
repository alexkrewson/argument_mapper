// Google Play credit top-ups for the Android app.
//
// Play's Payments policy requires Play Billing for anything bought to be used
// inside an app installed from Play, so on Android this replaces the Stripe
// checkout the web app uses. Both routes land in the same ledger
// (argument_mapper.credit_purchases) through the same grant_purchase function.
//
// The native half is android/.../PlayBillingPlugin.java. It never consumes a
// purchase; the play-purchase Edge Function does, after crediting it. Anything
// Play still reports as unconsumed is therefore something we have not yet
// credited, and claimUnconsumedPurchases() re-submits it.

import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "./supabase";

const PlayBilling = registerPlugin("PlayBilling");

/**
 * What each Play product is worth. play-purchase holds the authoritative copy
 * (CREDITS_BY_PRODUCT) — this one is for display only. The price comes from
 * Play, in the buyer's own currency.
 */
export const PLAY_PRODUCTS = [
  { productId: "credits_50",  cents: 50,  desc: "Starter"  },
  { productId: "credits_200", cents: 200, desc: "Standard" },
  { productId: "credits_500", cents: 500, desc: "Value"    },
];

export const isPlayBillingPlatform = () => Capacitor.getPlatform() === "android";

/**
 * Products as Play prices them for this user. A product missing from Play
 * Console, or not yet active, is simply left out rather than failing the list.
 */
export async function loadPlayProducts() {
  const { products } = await PlayBilling.getProducts({
    productIds: PLAY_PRODUCTS.map((p) => p.productId),
  });
  const byId = new Map(products.map((p) => [p.productId, p]));
  return PLAY_PRODUCTS.filter((p) => byId.has(p.productId))
    .map((p) => ({ ...p, price: byId.get(p.productId).price }));
}

async function claim(purchase) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw Object.assign(new Error("Please sign in first."), { code: "sign_in_required" });

  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/play-purchase`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ productId: purchase.productId, purchaseToken: purchase.purchaseToken }),
  });
  const body = await resp.json().catch(() => ({}));
  if (resp.status === 202) return { pending: true };
  if (!resp.ok) throw Object.assign(new Error(body.error || "claim_failed"), { code: body.error, status: resp.status });
  return body; // { granted, balance }
}

/**
 * Buys one product. Resolves with { balance } once the credit is recorded, or
 * { pending: true } for a payment Play hasn't settled (cash, some bank
 * transfers) — that one is credited by claimUnconsumedPurchases() later.
 * Rejects with code "USER_CANCELED" if the sheet is dismissed.
 */
export async function buyWithPlay(productId, userId) {
  const purchase = await PlayBilling.purchase({ productId, accountId: userId });
  if (purchase.state === "pending") return { pending: true };
  return claim(purchase);
}

/**
 * Credits anything Play holds that we haven't: a purchase interrupted before
 * the server saw it, a pending payment that has since cleared, or a Play Store
 * promo code. Belongs to whoever is signed in unless the purchase was tagged
 * with a different user id — those are left for their owner.
 * Returns the latest balance, or null if nothing was claimed.
 */
export async function claimUnconsumedPurchases(userId) {
  const { purchases } = await PlayBilling.getUnconsumedPurchases();
  let balance = null;
  for (const p of purchases) {
    if (p.state !== "purchased") continue;
    if (p.accountId && p.accountId !== userId) continue;
    try {
      const result = await claim(p);
      if (result.balance != null) balance = result.balance;
    } catch (err) {
      // One bad token must not strand the rest; it is retried next launch.
      console.warn("play: claim failed", err.code || err.message);
    }
  }
  return balance;
}

/** Pending payments that clear while the app is open arrive here. */
export function onPlayPurchasesUpdated(handler) {
  const sub = PlayBilling.addListener("purchasesUpdated", handler);
  return () => { sub.then((s) => s.remove()); };
}
