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

## APK tests (`tests/apk/`)

Separate from the Playwright suite — validates the built Android APK, not the
web app. Everything except `test:apk:costly` is free: nodes are placed with
**Add Node**, which makes no AI call.

| Command | Needs | Cost |
|---|---|---|
| `test:apk` | nothing | free, ~1s |
| `test:apk:device` | device | free |
| `test:apk:flows` | device + `.env.test` | free |
| `test:apk:turns` | device + `.env.test` | free |
| `test:apk:settings` | device + `.env.test` | free |
| `test:apk:all` | device + `.env.test` | free, ~10 min |
| `test:apk:costly` | device + `.env.test` | **~3¢ of credits** |
| `test:apk:report` | a prior run | free |
| `validate:apk` | device + `.env.test` | free — build, all, report |

- **static** — APK as an archive: signature, relative asset paths, inlined
  Supabase config. Catches a broken build before any emulator time.
- **device** — installs, launches, inspects the live WebView over CDP.
- **flows** — node lifecycle: add, popup, edit, type change, undo/redo, retract,
  delete confirm/cancel, tab rendering.
- **turns** — speaker naming before and mid-flow, turn handover, per-author edit
  permissions, concede semantics.
- **settings** — every interactive control. Two deliberate exclusions:
  `settings-delete-confirm-yes` (wipes account data) is opened and cancelled but
  never confirmed, and Buy Credits is opened and closed without starting checkout.

`test:apk:all` runs with `--test-concurrency=1`. The suites share one device and
one app instance, so parallel files corrupt each other's state.

Suites clean up by node **id**, never by position — see the cleanup incident
below.

Artifacts land in `test-results/apk/`; `test:apk:report` renders them into
`report.html` with every screenshot and per-test timings. Zip the directory to
share it.

### Known failure

`copy map JSON` fails on Android: `navigator.clipboard.writeText` is denied
inside the WebView, so the button silently does nothing in the APK while working
on web. Fix is `@capacitor/clipboard` on native. The test asserts the working
behaviour, so it stays red until that lands.

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

**Resolved 2026-07-30:** `.env.test` now points at a dedicated plus-addressed
test account (`alex.krewson+idisagree-test@gmail.com`), not the real one, so
the suite no longer reads or writes real debates. The mocking gap above still
stands — the tier still hits a real Supabase and a real network.

Historical note worth keeping: an early version of `node-lifecycle.spec.js`'s
cleanup deleted a real debate by assuming "topmost History row = mine" — see
`[[feedback_test_cleanup_by_id]]` in project memory. Fixed by deleting-by-ID.
The APK suites follow the same rule and clean up by node id, never by position.

## Which conditional sections apply

- **Authentication** — yes, password-based sign-in (scriptable directly,
  no magic-link/OTP fallback needed).
- **Payments/billing** — yes, Stripe Checkout via `create-checkout-session`.
- **Real AI/LLM calls** — yes, Claude via Supabase Edge Functions. Always
  tagged `@costly`.
- **Third-party APIs without AI cost** — n/a.
- **Offline/local-only mode** — not implemented; see the mocking gap above.
