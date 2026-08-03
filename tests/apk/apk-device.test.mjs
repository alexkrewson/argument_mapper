// Device-level APK validation — installs the APK on a connected emulator or
// phone, launches it, and inspects the live WebView over the Chrome DevTools
// Protocol.
//
// Static checks (apk-static.test.mjs) prove the APK is built correctly. These
// prove it actually *runs*: that it installs, launches, renders real content,
// and doesn't crash or log fatal errors.
//
//   npm run test:apk:device
//
// Skips cleanly (rather than failing) when no device is attached, so it is safe
// to run in a chain on a machine with no emulator booted.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  adb,
  connectedDevices,
  findAdb,
  findBuildTools,
  openWebViewCdp,
  cdpEvaluate,
  sleep,
} from "./support/android.mjs";
import { screenshotter } from "./support/app.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

const APK_PATH =
  process.env.APK_PATH ||
  path.join(repoRoot, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");

const PKG = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "capacitor.config.json"), "utf8"),
).appId;

const ARTIFACTS = path.join(repoRoot, "test-results", "apk");

// One shooter for the file. Each screenshotter() call carries its own frame
// counter, so making a second one here would restart numbering at 001 and let
// two frames land on the same filename.
const shot = screenshotter("device");

const hasDevice = findAdb() !== null && connectedDevices().length > 0;
const skip = hasDevice
  ? false
  : findAdb() === null
    ? "Android SDK/adb not found — install the SDK first"
    : "no device in 'device' state — start an emulator or plug in a phone";

let cdpUrl = null;

describe("APK device validation", { skip }, () => {
  before(async () => {
    fs.mkdirSync(ARTIFACTS, { recursive: true });

    assert.ok(fs.existsSync(APK_PATH), `APK not found at ${APK_PATH} — run: npm run build:apk`);

    // Clean slate: a leftover install with a different signature blocks the new one.
    adb(["uninstall", PKG]);
    adb(["logcat", "-c"]);

    const install = adb(["install", "-r", "-d", APK_PATH], { timeout: 300_000 });
    assert.equal(
      install.status,
      0,
      `adb install failed:\n${install.stdout}\n${install.stderr}`,
    );
    assert.doesNotMatch(
      `${install.stdout}${install.stderr}`,
      /Failure|INSTALL_FAILED/i,
      `adb install reported failure:\n${install.stdout}\n${install.stderr}`,
    );

    const launch = adb([
      "shell",
      "monkey",
      "-p",
      PKG,
      "-c",
      "android.intent.category.LAUNCHER",
      "1",
    ]);
    assert.equal(launch.status, 0, `failed to launch ${PKG}:\n${launch.stderr}`);

    // Poll rather than sleeping a fixed 8s and looking once. A minified
    // release build starts measurably slower than a debug one -- enough that
    // the single lookup missed the WebView on every run and reported it as
    // "could not reach the app's WebView over CDP... the app died before
    // rendering", which is a genuinely alarming message for what is only a
    // slower start. Every other suite already retries via connect().
    await sleep(3000);
    const deadline = Date.now() + 30_000;
    while (!cdpUrl && Date.now() < deadline) {
      cdpUrl = await openWebViewCdp(PKG);
      if (!cdpUrl) await sleep(1000);
    }
  });

  after(() => {
    adb(["shell", "am", "force-stop", PKG]);
    adb(["forward", "--remove-all"]);
  });

  test("APK signature verifies", () => {
    const buildTools = findBuildTools();
    if (!buildTools) {
      console.log("  (skipped — build-tools not installed, no apksigner available)");
      return;
    }
    const apksigner = path.join(
      buildTools,
      process.platform === "win32" ? "apksigner.bat" : "apksigner",
    );
    if (!fs.existsSync(apksigner)) {
      console.log("  (skipped — apksigner not present in build-tools)");
      return;
    }
    const res = spawnSync(apksigner, ["verify", "--print-certs", APK_PATH], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    assert.equal(res.status, 0, `apksigner verify failed:\n${res.stdout}\n${res.stderr}`);
  });

  test("package is installed on the device", () => {
    const { stdout } = adb(["shell", "pm", "list", "packages", PKG]);
    assert.match(stdout, new RegExp(PKG.replace(/\./g, "\\.")), `${PKG} not listed by pm`);
  });

  test("app process is alive after launch", () => {
    const { stdout } = adb(["shell", "pidof", PKG]);
    assert.ok(stdout.trim().length > 0, `${PKG} has no running process — it crashed on launch`);
  });

  test("app activity is in the foreground", () => {
    const { stdout } = adb(["shell", "dumpsys", "activity", "activities"]);
    assert.match(
      stdout,
      new RegExp(PKG.replace(/\./g, "\\.")),
      `${PKG} does not appear in the activity stack`,
    );
  });

  test("no fatal exceptions in logcat", () => {
    const { stdout } = adb(["logcat", "-d", "-v", "brief"]);
    const fatal = stdout
      .split("\n")
      .filter((l) => /FATAL EXCEPTION|AndroidRuntime.*(FATAL|E\/)|E AndroidRuntime/.test(l))
      .filter((l) => l.includes(PKG) || /FATAL EXCEPTION/.test(l));

    fs.writeFileSync(path.join(ARTIFACTS, "logcat.txt"), stdout, "utf8");
    assert.deepEqual(
      fatal,
      [],
      `fatal errors in logcat (full log at test-results/apk/logcat.txt):\n${fatal.join("\n")}`,
    );
  });

  test("WebView failed to load no local resources", () => {
    const { stdout } = adb(["logcat", "-d"]);
    // Capacitor logs asset load failures through the WebView console.
    const failures = stdout
      .split("\n")
      .filter((l) => /ERR_FILE_NOT_FOUND|net::ERR_|Failed to load resource/.test(l));
    assert.deepEqual(
      failures,
      [],
      `WebView reported resource load failures — the classic blank-screen signature:\n${failures.slice(0, 20).join("\n")}`,
    );
  });

  test("WebView is debuggable and reachable", () => {
    assert.ok(
      cdpUrl,
      "could not reach the app's WebView over CDP. On a debug build this " +
        "usually means the WebView never started — i.e. the app died before rendering.",
    );
  });

  test("DOM has actually rendered content (blank-screen detector)", async () => {
    if (!cdpUrl) return; // reported by the previous test
    const report = await cdpEvaluate(
      cdpUrl,
      `(() => {
         const root = document.getElementById('root') || document.body;
         return JSON.stringify({
           readyState: document.readyState,
           url: location.href,
           title: document.title,
           rootChildren: root ? root.children.length : 0,
           textLength: (document.body.innerText || '').trim().length,
           bodyHtmlLength: document.body.innerHTML.length,
         });
       })()`,
    );
    const dom = JSON.parse(report);
    console.log(`\n  WebView: ${JSON.stringify(dom, null, 2).replace(/\n/g, "\n  ")}\n`);

    assert.equal(dom.readyState, "complete", `document.readyState is '${dom.readyState}'`);
    assert.ok(
      dom.url.startsWith("file://") || dom.url.startsWith("http"),
      `unexpected WebView URL: ${dom.url}`,
    );
    assert.ok(
      dom.rootChildren > 0,
      "React root has no children — the bundle loaded but the app never mounted",
    );
    assert.ok(
      dom.textLength > 0,
      "WebView renders no text at all — this is the blank white screen",
    );
  });

  test("app-specific UI mounted (data-testid probes)", async () => {
    if (!cdpUrl) return;
    // Reuses the same selectors the Playwright suite relies on, so web and
    // mobile stay in sync: if these ids are renamed, both suites fail together.
    // tab-history is signed-in-only, so it's excluded — a guest launch won't have it.
    const expected = ["settings-btn", "tab-map", "tab-moderator", "tab-about"];
    const found = await cdpEvaluate(
      cdpUrl,
      `JSON.stringify(${JSON.stringify(expected)}
         .map(id => [id, !!document.querySelector('[data-testid="' + id + '"]')]))`,
    );
    const probes = JSON.parse(found);
    const missing = probes.filter(([, ok]) => !ok).map(([id]) => id);
    console.log(`  data-testid present: ${probes.filter(([, ok]) => ok).map(([id]) => id).join(", ")}`);

    // Captured before the assertion, so a failure leaves behind a picture of
    // what DID render. "expected UI did not render" is a much cheaper thing to
    // diagnose next to the screen it's describing.
    shot("UI probe — what actually mounted");

    assert.deepEqual(
      missing,
      [],
      `expected UI did not render: ${missing.join(", ")}. ` +
        "WebView has content but it isn't this app's guest-launch UI.",
    );
  });

  test("no uncaught JS errors after interaction", async () => {
    if (!cdpUrl) return;
    // Tap through the main tabs, then check nothing blew up.
    const errors = await cdpEvaluate(
      cdpUrl,
      `(async () => {
         const caught = [];
         const onErr = e => caught.push(String(e.message || e.reason));
         window.addEventListener('error', onErr);
         window.addEventListener('unhandledrejection', onErr);

         for (const id of ['tab-moderator', 'tab-about', 'tab-map']) {
           const el = document.querySelector('[data-testid="' + id + '"]');
           if (el) { el.click(); await new Promise(r => setTimeout(r, 600)); }
         }

         window.removeEventListener('error', onErr);
         window.removeEventListener('unhandledrejection', onErr);
         return JSON.stringify(caught);
       })()`,
      { timeout: 30_000 },
    );
    const caught = JSON.parse(errors);
    assert.deepEqual(caught, [], `JS errors while navigating tabs:\n${caught.join("\n")}`);
  });

  // Routed through screenshotter() rather than writing straight to ARTIFACTS,
  // so the frame reaches the report like every other step. This suite drives
  // the device over raw CDP instead of through App, so it gets no automatic
  // capture — this is its one deliberate frame, and it is the most valuable
  // one in the run: the first thing the app renders after a fresh install.
  test("captures a screenshot artifact", () => {
    const file = shot("app as launched");
    if (file) {
      console.log(`  screenshot: ${path.relative(repoRoot, file)}`);
      assert.ok(fs.statSync(file).size > 1000, "screenshot is suspiciously small");
    } else {
      console.log("  (screenshot unavailable on this device)");
    }
  });
});
