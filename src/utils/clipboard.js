import { Capacitor } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";

/**
 * Copy text on both web and Android.
 *
 * The Android WebView denies navigator.clipboard.writeText outright
 * ("NotAllowedError: Write permission denied") even on the https://localhost
 * origin Capacitor serves from, and the document.execCommand('copy') fallback
 * returns false there too. Only the native plugin works, so route to it.
 *
 * Returns whether the copy actually succeeded — callers must not show a
 * "copied!" confirmation without checking.
 */
export async function copyText(text) {
  try {
    if (Capacitor.isNativePlatform()) {
      await Clipboard.write({ string: text });
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.warn("copyText failed:", err);
    return false;
  }
}
