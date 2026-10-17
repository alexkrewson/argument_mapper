import { Capacitor } from "@capacitor/core";

// Every push renames every chunk: vite.config.js stamps the commit into the
// entry, and the lazy chunks import from the entry by name. A tab opened before
// a deploy then asks for a chunk that no longer exists, and Cloudflare answers
// with index.html and a 200, so the import fails as "error loading dynamically
// imported module" (Sentry IDISAGREE-4). The tab is just out of date, and a
// reload is the whole fix.
//
// Web only. The APK serves its chunks from the phone, so a failed import there
// is a real bug, and reloading would only hide it.

const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically imported/i;
const LAST_RELOAD_KEY = "stale-chunk-reload-at";
// One reload per minute at most. If the fresh page fails the same way, the
// problem isn't a stale tab, and looping would make it unreportable.
const MIN_GAP_MS = 60_000;

let reloading = false;

export function isStaleChunkError(err) {
  return STALE.test(String(err?.message ?? err ?? ""));
}

/** True once a reload has been started, so the error behind it isn't reported. */
export function isReloadingForStaleChunk() {
  return reloading;
}

function reloadOnce() {
  let last = 0;
  try { last = Number(sessionStorage.getItem(LAST_RELOAD_KEY)) || 0; } catch { /* storage blocked */ }
  if (Date.now() - last < MIN_GAP_MS) return false;
  try { sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now())); } catch { /* storage blocked */ }
  reloading = true;
  window.location.reload();
  return true;
}

export function initStaleChunkReload() {
  if (Capacitor.isNativePlatform()) return;

  // Vite's own signal, for imports that go through its preload helper.
  window.addEventListener("vite:preloadError", (e) => {
    if (reloadOnce()) e.preventDefault();
  });

  // Imports inside dependencies (Capacitor's `web: () => import("./web")`)
  // don't always go through that helper, and surface as a plain rejection.
  window.addEventListener("unhandledrejection", (e) => {
    if (isStaleChunkError(e.reason) && reloadOnce()) e.preventDefault();
  });
}
