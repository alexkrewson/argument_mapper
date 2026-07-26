# E2E tests — iDisagree

Generic rules (three tiers, `@costly` convention, screenshot policy, conditional
sections for auth/payments/AI) live in the shared rulebook, not here:

**`/home/alex/apps/shared/testing-guidelines.md`**

This file only covers what's specific to this project.

## Commands

- `npm run test:e2e` — Thorough tier. Excludes `@costly`. Safe to run anytime.
- `npm run test:e2e:full` — Thorough + Costly. Spends real AI credits and
  writes real data to the account in `.env.test` — run deliberately.
- `npm run test:e2e:report` — opens the last HTML report (screenshots, traces,
  attachments).

## Target

Defaults to production (`https://idisagree.trolleysolution.com`), per the
shared doc's "test against production by default" rule. Override with
`TEST_BASE_URL` to point at a local dev server instead.

## Current gap vs. the shared guidelines

The Thorough tier here is **not mocked** — `tests/auth.setup.js` logs into a
real Supabase account (credentials in `.env.test`, gitignored) and the suite
reads/writes real rows in the real `debates` table. The shared doc's stated
preference is a fully mocked backend for this tier ("zero cost and zero
flakiness from real network dependencies"). Scoping that out is tracked in
`maintenance_todo.txt`.

Until then: `.env.test` currently points at Alex's real account, not a
dedicated test account, which the shared doc also calls for under Costly
("not a real user's data or a real customer-facing balance"). Known
consequence: an early version of `node-lifecycle.spec.js`'s cleanup step
deleted a real debate by assuming "topmost History row = mine" — see
`[[feedback_test_cleanup_by_id]]` in project memory. Fixed by deleting-by-ID,
but the underlying exposure (tests running against real data) remains until
either a dedicated test account or a mocking layer is in place.

## Which conditional sections apply

- **Authentication** — yes, password-based sign-in (scriptable directly,
  no magic-link/OTP fallback needed).
- **Payments/billing** — yes, Stripe Checkout via `create-checkout-session`.
- **Real AI/LLM calls** — yes, Claude via Supabase Edge Functions. Always
  tagged `@costly`.
- **Third-party APIs without AI cost** — n/a.
- **Offline/local-only mode** — not implemented; see the mocking gap above.
