/**
 * Check the two things that make an AI test fail for reasons that have nothing
 * to do with the app, and say so immediately.
 *
 * Both were mistaken for an API stall on 2026-08-08, for hours. claude-proxy
 * rejects a signed-out caller with 401 and an empty account with 402 BEFORE it
 * calls Anthropic, so nothing is charged and nothing reaches the call log —
 * which reads exactly like "the AI never answered". The test then waits out its
 * 90s idle budget and reports a stall. Seventeen of those in a row is a very
 * expensive way to be told you are logged out.
 *
 * Failing in the first second, naming the real cause, is the whole point.
 */
export async function preflight(page, { minCredits = 20 } = {}) {
  const base = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !anon) throw new Error("preflight: VITE_SUPABASE_URL / ANON_KEY missing — is .env present?");

  const auth = await (await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD }),
  })).json();
  if (!auth.access_token) throw new Error("preflight: could not sign in as the test account");

  const [profile] = await (await fetch(`${base}/rest/v1/profiles?select=credits_cents`, {
    headers: { apikey: anon, Authorization: `Bearer ${auth.access_token}`, "Accept-Profile": "argument_mapper" },
  })).json();
  const credits = profile?.credits_cents ?? 0;
  if (credits < minCredits) {
    throw new Error(
      `preflight: the test account has ${credits.toFixed(2)}c, below the ${minCredits}c floor. ` +
      `Top it up — every AI test below would otherwise fail as a 90s "stall" that is really a 402.`,
    );
  }

  // And the app has to actually be signed in: History only renders when it is.
  await page.goto("/");
  const signedIn = await page.getByTestId("tab-history").count();
  if (signedIn === 0) {
    throw new Error("preflight: the app is signed out — AI calls will 401 before reaching Anthropic");
  }
  return credits;
}
