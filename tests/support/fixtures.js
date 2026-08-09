// Drop-in replacement for `@playwright/test` that records a screenshot after
// every UI action, so each spec produces a step-by-step visual trace without
// anyone having to sprinkle reportShot() calls through it.
//
//   import { test, expect } from "./support/fixtures.js";
//
// That one-line import swap is the whole integration. Explicit reportShot()
// calls still work and still land in the same report — use them when a step
// deserves a better name than the action itself provides, or to capture a
// state that no action produced (an animation settling, an AI turn finishing).
//
// WHY PATCH THE PROTOTYPE rather than wrap `page`: actions are invoked on
// Locators (`page.getByTestId(x).click()`), and locators are created on demand
// all over the specs. Wrapping `page` would catch page.goto() and nothing else.
//
// SAFE ONLY BECAUSE THIS SUITE IS SERIAL. The patch reads a module-level
// "current test" pointer, which is correct with playwright.config.js's
// `workers: 1` + `fullyParallel: false`. If this suite is ever parallelised,
// the pointer has to become per-worker state or the screenshots will be filed
// against whichever test happens to be running.
//
// Set REPORT_STEPS=0 to switch capture off — useful when iterating on a single
// spec and the screenshots are just latency.

import { test as base, expect } from "@playwright/test";
import { describeAction } from "./report-manifest.mjs";

const CAPTURE = process.env.REPORT_STEPS !== "0";

// Actions worth a frame. Read-only calls (isVisible, textContent, count) are
// deliberately absent: they change nothing, so a screenshot of the result is
// the same picture as the step before it.
const ACTIONS = [
  "click", "dblclick", "fill", "press", "check", "uncheck",
  "selectOption", "setInputFiles", "hover", "tap",
];

let current = null;   // { page, testInfo, n }
let patched = false;

async function capture(label) {
  if (!current) return;
  const { page, testInfo } = current;
  const n = ++current.n;
  try {
    if (page.isClosed()) return;
    const file = testInfo.outputPath(`step-${String(n).padStart(3, "0")}.png`);
    await page.screenshot({ path: file, fullPage: true, timeout: 5000 });
    await testInfo.attach(`report-shot:${label}`, { path: file, contentType: "image/png" });
  } catch {
    // A screenshot is never worth failing a test over. Navigations, closed
    // pages and mid-animation timeouts all land here; the step is simply
    // missing from the report rather than taking the run down with it.
  }
}

function patchLocatorPrototype(page) {
  if (patched) return;
  const proto = Object.getPrototypeOf(page.locator("body"));
  for (const action of ACTIONS) {
    const original = proto[action];
    if (typeof original !== "function") continue;
    proto[action] = async function (...args) {
      const result = await original.apply(this, args);
      if (current) {
        const value = action === "fill" || action === "press" || action === "selectOption"
          ? args[0]
          : null;
        await capture(describeAction(action, String(this), value));
      }
      return result;
    };
  }

  const gotoOriginal = Object.getPrototypeOf(page).goto;
  if (typeof gotoOriginal === "function") {
    Object.getPrototypeOf(page).goto = async function (...args) {
      const result = await gotoOriginal.apply(this, args);
      if (current) await capture(describeAction("goto", args[0]));
      return result;
    };
  }
  patched = true;
}

// ── Every test gets its OWN session ──────────────────────────────────────────
//
// storageState alone does not work here, and the way it fails is silent.
// Supabase ROTATES refresh tokens on use: the suite saves one session at setup
// and hands the same refresh token to every test context, so the first context
// to refresh invalidates it for all the others. They get 400 from
// /auth/v1/token, their session is cleared, and they run SIGNED OUT — looking
// perfectly normal until an AI call returns 401 and the app opens the sign-in
// modal instead of building a map.
//
// That is what 17 "combined run stalled: no new node for 90s after 0 node(s)"
// failures were on 2026-08-08. It looked like an API stall for most of a day:
// nothing was charged, single calls always worked, and claude-proxy logged
// nothing, because it rejects on auth BEFORE it ever calls Anthropic.
//
// A fresh password grant per test costs one request and shares no refresh
// token, so there is nothing to rotate out from under anyone.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const STORAGE_KEY = SUPABASE_URL ? `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token` : null;

async function freshSession() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.TEST_USER_EMAIL,
      password: process.env.TEST_USER_PASSWORD,
    }),
  });
  if (!res.ok) throw new Error(`could not mint a test session: ${res.status} ${await res.text()}`);
  return res.json();
}

export const test = base.extend({
  // Playwright calls this second argument `use` by convention. It is named
  // runTest here because eslint-plugin-react-hooks matches React's use() hook
  // on the name alone and flags `await use(page)` inside a try block. Renaming
  // is free — Playwright passes it positionally — and beats two suppressions.
  page: async ({ page }, runTest, testInfo) => {
    // Only for tests that expect to be signed in. A spec that opts out with an
    // empty storageState (tests/map-styling.spec.js) must stay signed out.
    if (STORAGE_KEY && process.env.TEST_USER_EMAIL) {
      const { origins } = await page.context().storageState();
      const wantsAuth = origins.some((o) => o.localStorage?.some((e) => e.name === STORAGE_KEY));
      if (wantsAuth) {
        const session = await freshSession();
        await page.addInitScript(
          ([key, value]) => window.localStorage.setItem(key, value),
          [STORAGE_KEY, JSON.stringify(session)],
        );
      }
    }
    if (CAPTURE) {
      patchLocatorPrototype(page);
      current = { page, testInfo, n: 0 };
    }
    try {
      await runTest(page);
    } finally {
      current = null;
    }
  },
});

/**
 * Explicit capture, for a state worth showing that no locator action produced —
 * a modal that appeared on its own, a map after the AI finished. The automatic
 * wrapper only fires on locator ACTIONS, so without this the interesting moment
 * between two clicks never reaches the report.
 */
export async function shot(label) {
  await capture(label);
}

export { expect };
