import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const APP_ID = "argument_mapper";

Deno.serve(async (req) => {
  const sig    = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!sig || !secret) {
    return new Response("Missing signature or webhook secret", { status: 400 });
  }

  const body = await req.text();
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-04-10" });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, secret);
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Ignore anything this app didn't sell. Stripe delivers every completion to
    // every enabled endpoint on the account, and this account is shared with
    // Analyzer -- whose users live in the same auth.users, so an unmarked
    // sibling event would credit argument_mapper.profiles without erroring.
    //
    // 200, not 400: a sibling app's event is correctly delivered and correctly
    // ignored. Reporting failure would buy retries and a red error rate on a
    // perfectly healthy endpoint.
    //
    // A session created before this deploy carries no marker and is ignored too.
    // Deploy create-checkout-session FIRST so nothing legitimate is in flight
    // without one.
    if (session.metadata?.app !== APP_ID) {
      return new Response(`Ignoring session from ${session.metadata?.app ?? "an unmarked app"}`, { status: 200 });
    }

    const userId       = session.client_reference_id;
    const creditsCents = parseFloat(session.metadata?.credits_cents ?? "0");

    if (!userId || creditsCents <= 0) {
      return new Response("Missing user_id or credits_cents in session metadata", { status: 400 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "argument_mapper" } },
    );

    // grant_purchase, not add_credits: it records the session id in
    // credit_purchases and credits in the same transaction, so a Stripe retry
    // of an event we already handled is a no-op instead of a second top-up.
    const { data, error } = await supabaseAdmin.rpc("grant_purchase", {
      p_user_id:       userId,
      p_source:        "stripe",
      p_reference:     session.id,
      p_credits_cents: creditsCents,
      p_order_id:      typeof session.payment_intent === "string" ? session.payment_intent : null,
      p_is_test:       !event.livemode,
    });

    if (error) {
      console.error("Failed to add credits:", error);
      return new Response("Failed to add credits", { status: 500 });
    }

    const granted = data?.[0]?.granted;
    console.log(granted
      ? `Added ${creditsCents}¢ credits to user ${userId}`
      : `Session ${session.id} already credited; ignoring the repeat`);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
