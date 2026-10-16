// Credits a Google Play in-app purchase.
//
// The app sends { productId, purchaseToken } straight after Play's purchase
// sheet closes, and again on every launch for anything Play still reports as
// unconsumed. This function asks Google whether the token is real, credits it
// through grant_purchase (idempotent on the token), then CONSUMES it server
// side so the product can be bought again.
//
// ORDER MATTERS: grant first, consume second. If consume fails, the purchase
// stays unconsumed, the app re-submits it next launch, grant_purchase sees the
// token already recorded and does nothing, and consume gets another try. The
// reverse order could consume a purchase and then fail to credit it, and a
// consumed purchase is never reported to the app again — that money is lost.
//
// An unconsumed purchase is refunded by Google after three days, so a token
// that never reaches here costs the user nothing.
//
// Secrets: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON — the whole JSON key of a service
// account that has been invited in Play Console > Users and permissions with
// "View financial data" and "Manage orders and subscriptions".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PACKAGE_NAME = "com.alexkrewson.argumentmapper";

// The price list. The server decides what a product is worth, never the app.
// Keep in step with PLAY_PRODUCTS in src/utils/playBilling.js and with the
// products defined in Play Console > Monetize > One-time products.
const CREDITS_BY_PRODUCT: Record<string, number> = {
  credits_50:  50,
  credits_200: 200,
  credits_500: 500,
};

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

// ─── Google auth: service-account JWT -> access token ────────────────────────

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let cachedToken: { value: string; expires: number } | null = null;

async function googleAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;

  const sa = JSON.parse(Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")!);
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss:   sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud:   tokenUri,
    iat:   now,
    exp:   now + 3600,
  })}`;

  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  );

  const resp = await fetch(tokenUri, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  `${unsigned}.${b64url(sig)}`,
    }),
  });
  if (!resp.ok) throw new Error(`Google token exchange failed: ${resp.status} ${await resp.text()}`);
  const { access_token, expires_in } = await resp.json();
  cachedToken = { value: access_token, expires: Date.now() + expires_in * 1000 };
  return access_token;
}

const purchaseUrl = (productId: string, token: string) =>
  `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}` +
  `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "argument_mapper" } },
  );

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  const { data: { user } } = jwt ? await supabaseAdmin.auth.getUser(jwt) : { data: { user: null } };
  if (!user) return json({ error: "sign_in_required" }, 401);

  const { productId, purchaseToken } = await req.json().catch(() => ({}));
  const credits = CREDITS_BY_PRODUCT[productId];
  if (!credits || typeof purchaseToken !== "string" || !purchaseToken) {
    return json({ error: "unknown_product" }, 400);
  }

  let accessToken: string;
  try {
    accessToken = await googleAccessToken();
  } catch (err) {
    console.error(err);
    return json({ error: "verification_unavailable" }, 503);
  }

  const verify = await fetch(purchaseUrl(productId, purchaseToken), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (verify.status === 404 || verify.status === 400) {
    return json({ error: "invalid_purchase" }, 400);
  }
  if (!verify.ok) {
    console.error("Play verification failed:", verify.status, await verify.text());
    return json({ error: "verification_unavailable" }, 503);
  }
  const purchase = await verify.json();

  // purchaseState: 0 purchased, 1 cancelled, 2 pending.
  if (purchase.purchaseState === 2) return json({ pending: true }, 202);
  if (purchase.purchaseState !== 0) return json({ error: "not_purchased" }, 400);

  // The app tags every purchase it starts with the buyer's user id. A mismatch
  // means the purchase was made signed in as someone else on this phone; it
  // belongs to them and stays unconsumed until they sign in and claim it.
  // Absent (a promo code redeemed in the Play Store) goes to whoever claims it.
  const owner = purchase.obfuscatedExternalAccountId;
  if (owner && owner !== user.id) return json({ error: "other_account" }, 409);

  const { data, error } = await supabaseAdmin.rpc("grant_purchase", {
    p_user_id:       user.id,
    p_source:        "play",
    p_reference:     purchaseToken,
    p_credits_cents: credits,
    p_order_id:      purchase.orderId ?? null,
    p_product_id:    productId,
    // purchaseType is absent on a real purchase; 0 is a license tester's.
    p_is_test:       purchase.purchaseType === 0,
  });
  if (error) {
    console.error("grant_purchase failed:", error);
    return json({ error: "grant_failed" }, 500);
  }
  const { granted, balance } = data[0];

  // consumptionState: 0 not yet consumed, 1 consumed.
  if (purchase.consumptionState === 0) {
    const consume = await fetch(`${purchaseUrl(productId, purchaseToken)}:consume`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // Not fatal: the credit is already recorded, and the next launch retries.
    if (!consume.ok) console.error("Consume failed:", consume.status, await consume.text());
  }

  console.log(granted
    ? `Play: added ${credits}¢ to ${user.id} (${purchase.orderId ?? "no order id"})`
    : `Play: token already credited for ${user.id}; re-consumed`);

  return json({ granted, balance });
});
