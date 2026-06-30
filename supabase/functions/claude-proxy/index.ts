import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// Claude Sonnet 4.5 pricing in cents per token (2x markup over API cost)
const INPUT_CENTS_PER_TOKEN  = 0.000_6;  // $3 / MTok × 2
const OUTPUT_CENTS_PER_TOKEN = 0.003_0;  // $15 / MTok × 2

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

  // Fetch or create profile
  let { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("credits_cents")
    .eq("id", user.id)
    .single();

  if (!profile) {
    const { data: created } = await supabaseAdmin
      .from("profiles")
      .insert({ id: user.id })
      .select("credits_cents")
      .single();
    profile = created;
  }

  if (!profile || profile.credits_cents <= 0) {
    return new Response(JSON.stringify({ error: "out_of_credits", credits: profile?.credits_cents ?? 0 }), {
      status: 402, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // Forward to Anthropic
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return new Response("Server misconfiguration", { status: 500, headers: CORS });

  const body = await req.text();

  async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
    const delays = [1000, 2000, 4000];
    let lastResponse: Response | null = null;
    for (let i = 0; i < maxRetries; i++) {
      const response = await fetch(url, options);
      if (response.status !== 529) return response;
      lastResponse = response;
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, delays[i]));
    }
    return lastResponse!;
  }

  const anthropicResponse = await fetchWithRetry(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body,
  });

  const responseText = await anthropicResponse.text();

  // Deduct actual token cost
  let creditsRemaining = profile.credits_cents;
  if (anthropicResponse.ok) {
    try {
      const responseData = JSON.parse(responseText);
      if (responseData.usage) {
        const cost =
          responseData.usage.input_tokens  * INPUT_CENTS_PER_TOKEN +
          responseData.usage.output_tokens * OUTPUT_CENTS_PER_TOKEN;
        const { data: newBalance } = await supabaseAdmin.rpc("deduct_credits", {
          p_user_id: user.id,
          p_amount:  cost,
        });
        if (newBalance != null) creditsRemaining = newBalance;
      }
    } catch {
      // Don't fail the response if deduction bookkeeping errors
    }
  }

  return new Response(responseText, {
    status: anthropicResponse.status,
    headers: {
      "Content-Type":                "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "X-Credits-Remaining",
      "X-Credits-Remaining":         String(creditsRemaining),
    },
  });
});
