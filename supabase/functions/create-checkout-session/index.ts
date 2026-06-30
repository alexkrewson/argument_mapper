import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405 });

  // Verify user JWT
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "sign_in_required" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "sign_in_required" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const { amount_cents, success_url, cancel_url } = await req.json();
  if (!amount_cents || amount_cents < 50) {
    return new Response(JSON.stringify({ error: "Minimum purchase is 50 cents" }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-04-10" });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: "iDisagree AI Credits",
          description: `${amount_cents >= 100 ? `$${(amount_cents / 100).toFixed(2)}` : `${amount_cents}¢`} of AI processing credits`,
        },
        unit_amount: amount_cents,  // Stripe uses cents
      },
      quantity: 1,
    }],
    mode: "payment",
    success_url: success_url || "https://idisagree.trolleysolution.com/?payment=success&session_id={CHECKOUT_SESSION_ID}",
    cancel_url:  cancel_url  || "https://idisagree.trolleysolution.com/?payment=cancelled",
    client_reference_id: user.id,
    metadata: {
      user_id:      user.id,
      credits_cents: String(amount_cents),
    },
  });

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200, headers: { "Content-Type": "application/json", ...CORS },
  });
});
