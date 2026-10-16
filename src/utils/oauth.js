// Google sign-in, on web and in the Android app.
//
// Web is one call: a full-page redirect to Google and back, and supabase-js
// takes the ?code= out of the URL on return (detectSessionInUrl).
//
// Android cannot do that. Google refuses OAuth inside an embedded WebView
// (disallowed_useragent), and the app IS a WebView. So the sign-in page opens
// in a Custom Tab — a real Chrome, which Google accepts — and Supabase
// redirects to NATIVE_REDIRECT, a custom scheme the manifest routes back to
// MainActivity. The appUrlOpen listener below exchanges the code for a
// session. The PKCE verifier that makes the code redeemable never left the
// WebView's storage, which is why an intercepted redirect is harmless.

import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "./supabase";

// Must be listed in Supabase > Authentication > URL Configuration > Redirect
// URLs, or Supabase silently falls back to the Site URL — which opens the WEB
// app in the Custom Tab and leaves this app signed out.
export const NATIVE_REDIRECT = "com.alexkrewson.argumentmapper://auth-callback";

/** Fired on window when the native round trip fails; detail is a message. */
export const OAUTH_ERROR_EVENT = "idisagree:oauth-error";

export async function signInWithGoogle() {
  if (!Capacitor.isNativePlatform()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    if (error) throw error;
    return; // the page is navigating away
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
  });
  if (error) throw error;
  await Browser.open({ url: data.url });
}

async function handleRedirect(url) {
  if (!url?.startsWith(NATIVE_REDIRECT)) return;
  // Android closes the tab by bringing the singleTask activity forward; this
  // is for the platforms where it doesn't, and harmless where it does.
  Browser.close().catch(() => {});

  const params = new URL(url).searchParams;
  const code = params.get("code");
  const fail = (message) =>
    window.dispatchEvent(new CustomEvent(OAUTH_ERROR_EVENT, { detail: message }));

  if (!code) {
    // Cancelling on Google's screen lands here with error=access_denied.
    fail(params.get("error_description") || "Google sign-in didn't complete.");
    return;
  }
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) fail(error.message);
}

/** Call once at startup. No-op on web. */
export function initNativeOAuth() {
  if (!Capacitor.isNativePlatform()) return;
  CapacitorApp.addListener("appUrlOpen", ({ url }) => handleRedirect(url));
  // If Android killed the app while the tab was open, the redirect relaunches
  // it cold, and the URL arrives as the launch URL rather than as an event.
  CapacitorApp.getLaunchUrl().then((launch) => handleRedirect(launch?.url)).catch(() => {});
}
