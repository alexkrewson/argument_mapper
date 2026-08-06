// Crash reporting.
//
// Exists for closed testing: without it a tester's bug report is "it crashed"
// with nothing behind it, and the reporter is usually the only person who can
// reproduce it. Sentry rather than Crashlytics because this is a Capacitor
// WebView app — almost every failure here is a JavaScript error, which
// Crashlytics captures poorly and Sentry captures natively; @sentry/capacitor
// still picks up genuine native crashes on top.
//
// NO-OPS WITHOUT A DSN, deliberately and silently in production. Tests, local
// dev and any checkout without VITE_SENTRY_DSN behave exactly as before, and
// the 55 APK checks don't start reporting themselves as real users.
//
// WHERE THE DSN LIVES: it is a write-only ingest key and is safe to inline in
// a public bundle — that's what it's designed for. Web reads it from
// Cloudflare Pages > Settings > Variables; the APK bakes in whatever was in
// .env at build time, exactly like the Supabase anon key.

import * as Sentry from "@sentry/capacitor";
import * as SentryReact from "@sentry/react";
import { Capacitor } from "@capacitor/core";

const DSN = import.meta.env.VITE_SENTRY_DSN;

/**
 * Breadcrumb categories that can carry the user's own words.
 *
 * This is the part worth being careful about: people paste real arguments —
 * with real names, real grievances — into this app. `console` breadcrumbs pick
 * up anything logged (App.jsx logs map JSON and AI usage), and `dom`
 * breadcrumbs record the text of whatever was clicked, which on this UI is
 * frequently a node's statement. Neither is worth a privacy incident, and a
 * stack trace is what actually diagnoses a crash.
 */
const CONTENT_BEARING = new Set(["console", "dom", "ui.click", "ui.input"]);

/**
 * The Android emulator the APK suite runs on, recognised from the WebView UA:
 *
 *   Mozilla/5.0 (Linux; Android 16; sdk_gphone64_x86_64 Build/BE2A...; wv) ...
 *
 * This exists because enabling the DSN made the test suites into reporters. The
 * debug APK bakes in whatever .env holds, so from 2026-08-05 every device run
 * was one broken assertion away from filing an issue indistinguishable from a
 * tester's crash — on a project whose whole purpose is telling us what twelve
 * strangers hit.
 *
 * Matched on the user agent rather than solved by building the test APK without
 * a DSN, because 08-03 settled that the suite tests the build that ships. The
 * APK the emulator runs is byte-identical to the one a tester would get; only
 * the transmission is suppressed, and only when the hardware is fake.
 */
const EMULATOR = /sdk_gphone|google_sdk|Android SDK built for|Emulator/i;

function isEmulator() {
  return typeof navigator !== "undefined" && EMULATOR.test(navigator.userAgent || "");
}

function scrubBreadcrumb(crumb) {
  if (CONTENT_BEARING.has(crumb.category)) return null;
  // Query strings on Supabase REST calls carry row ids and filter values.
  if (crumb.data?.url) {
    crumb.data.url = String(crumb.data.url).split("?")[0];
  }
  return crumb;
}

function scrubEvent(event) {
  // Dropped here rather than by skipping init, deliberately: init still runs on
  // the emulator, so the suite goes on proving that the shipping startup path
  // works. Returning null is the last gate before the network.
  if (isEmulator()) return null;

  // sendDefaultPii is already false; this is the belt to that's braces.
  delete event.user;
  delete event.request?.cookies;
  delete event.request?.headers;
  if (event.request?.url) event.request.url = String(event.request.url).split("?")[0];
  return event;
}

export function initMonitoring() {
  if (!DSN) {
    if (import.meta.env.DEV) {
      console.info("monitoring: VITE_SENTRY_DSN not set — crash reporting is off");
    }
    return false;
  }

  // Never report from a dev server. `npm run dev` reads the same .env a build
  // does, and the Playwright suite drives that dev server — so the day a DSN
  // existed, this machine started filing its own crashes as production issues.
  // Nothing is lost by dropping them: whoever caused the crash is already
  // watching the terminal it printed in.
  if (import.meta.env.DEV) {
    console.info("monitoring: dev server — crash reporting is off");
    return false;
  }

  Sentry.init(
    {
      dsn: DSN,
      release: typeof __APP_RELEASE__ === "string" ? __APP_RELEASE__ : undefined,
      environment: Capacitor.isNativePlatform() ? "android" : "web",

      // Errors only. Performance tracing would burn the free tier's quota on
      // data nobody is going to read during a 14-day test round.
      tracesSampleRate: 0,

      // No IP addresses, no user identifiers. We can tell which build and
      // which platform a crash came from, which is what actually helps.
      sendDefaultPii: false,

      beforeBreadcrumb: scrubBreadcrumb,
      beforeSend: scrubEvent,
    },
    SentryReact.init,
  );
  return true;
}

/** The boundary component, so main.jsx doesn't need to know the vendor. */
export const ErrorBoundary = SentryReact.ErrorBoundary;

/**
 * Report something we caught and handled but still want to know about.
 * Safe to call when monitoring is off — Sentry's no-op client swallows it.
 */
export function reportError(error, context) {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
