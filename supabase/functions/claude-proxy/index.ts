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
    { db: { schema: "argument_mapper" } },
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
    // Logged, because a rejection here is invisible everywhere else. This
    // function returns before it ever calls Anthropic, so nothing is charged and
    // ai_call_log stayed empty -- which reads exactly like "the API never
    // answered". On 2026-08-08 that cost hours twice: once as an expired session
    // returning 401, once as this. A refusal is a fact worth recording.
    try {
      await supabaseAdmin.from("ai_call_log").insert({
        user_id: user.id, status: 402, duration_ms: 0, attempts: 0,
        outcome: "out_of_credits",
      });
    } catch { /* diagnostics must never break the call they describe */ }
    return new Response(JSON.stringify({ error: "out_of_credits", credits: profile?.credits_cents ?? 0 }), {
      status: 402, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // Forward to Anthropic
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return new Response("Server misconfiguration", { status: 500, headers: CORS });

  const body = await req.text();

  // A call to Anthropic that never returns used to hang here forever. There was
  // no timeout, so the platform killed the whole invocation at its wall-clock
  // limit -- 200.0s, to within 20ms, over dozens of invocations on 2026-08-08 --
  // having logged nothing at all between boot and shutdown. The client saw a
  // stall it could only report as "no response"; nothing was charged, because
  // the deduction only runs on a response that arrived; and 22 costly tests died
  // that way while Anthropic reported no incident.
  //
  // Budgets are chosen against that 200s ceiling: two attempts of 70s plus a 2s
  // backoff is 142s worst case, so a hung upstream now fails cleanly INSIDE the
  // function instead of being killed outside it. A healthy turn measures 20-45s,
  // so 70s does not cut off legitimate work.
  const ATTEMPT_TIMEOUT_MS = 70_000;

  async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
    const delays = [1000, 2000, 4000];
    let lastResponse: Response | null = null;
    let timedOut = false;
    for (let i = 0; i < maxRetries; i++) {
      attemptsUsed = i + 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (response.status !== 529) return response;
        lastResponse = response;
      } catch (err) {
        // Only a timeout is worth another go, and only once: a second 70s wait
        // would put the total past the wall-clock limit this exists to avoid.
        if ((err as Error).name !== "AbortError") { outcome = "exception"; throw err; }
        timedOut = true;
        outcome = "timeout";
        if (i >= 1) break;
      } finally {
        clearTimeout(timer);
      }
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, delays[i]));
    }
    if (!lastResponse && timedOut) {
      return new Response(
        JSON.stringify({ error: "upstream_timeout", message: "The AI did not respond in time. Please try again." }),
        { status: 504, headers: { "Content-Type": "application/json" } },
      );
    }
    return lastResponse!;
  }

  const callStarted = Date.now();
  let attemptsUsed = 0;
  let outcome = "ok";

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
  const durationMs = Date.now() - callStarted;
  if (outcome === "ok" && !anthropicResponse.ok) outcome = "http_error";

  // Record how the call behaved. Metadata only -- never the prompt, never the
  // reply. The ratelimit block is the point: Anthropic reports its quota state
  // on every response, which is exactly what was missing when this stalled.
  const logCall = async (usage?: { input_tokens?: number; output_tokens?: number }) => {
    try {
      const rl: Record<string, string> = {};
      for (const [k, v] of anthropicResponse.headers) {
        if (k.startsWith("anthropic-ratelimit") || k === "retry-after") rl[k] = v;
      }
      await supabaseAdmin.from("ai_call_log").insert({
        user_id: user.id,
        status: outcome === "timeout" ? null : anthropicResponse.status,
        duration_ms: durationMs,
        attempts: attemptsUsed,
        outcome,
        input_tokens: usage?.input_tokens ?? null,
        output_tokens: usage?.output_tokens ?? null,
        ratelimit: Object.keys(rl).length ? rl : null,
      });
    } catch {
      // Diagnostics must never break the call they are describing.
    }
  };

  // Deduct actual token cost
  let creditsRemaining = profile.credits_cents;
  let loggedUsage: { input_tokens?: number; output_tokens?: number } | undefined;
  if (anthropicResponse.ok) {
    try {
      const responseData = JSON.parse(responseText);
      loggedUsage = responseData.usage;
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

  await logCall(loggedUsage);

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
