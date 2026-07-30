// Static APK validation — no emulator, no adb, ~1s.
//
// Primary job: catch the blank-screen bug from ANDROID_SETUP_HANDOFF.md, where
// an absolute Vite base path produces an APK that installs and launches but
// renders nothing, because file:// can't resolve `/assets/...`.
//
//   npm run test:apk

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

const APK_PATH =
  process.env.APK_PATH ||
  path.join(repoRoot, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");

// Capacitor copies dist/ to here inside the APK.
const WEB_ROOT = "assets/public/";

const apkExists = fs.existsSync(APK_PATH);

if (!apkExists) {
  // One clear failure beats eight "cancelledByParent" cascades from a before hook.
  test("APK exists", () => {
    assert.fail(`No APK at ${APK_PATH}\n  Build it first:  npm run build:apk`);
  });
}

const zip = apkExists ? new AdmZip(APK_PATH) : null;
const entries = zip ? zip.getEntries().map((e) => e.entryName) : [];
const readText = (name) => {
  const entry = zip?.getEntry(name);
  return entry ? zip.readAsText(entry) : null;
};
const indexHtml = apkExists ? readText(`${WEB_ROOT}index.html`) : null;
const refsIn = (html) =>
  [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);

describe("APK static validation", { skip: apkExists ? false : "APK not built" }, () => {
  test("archive has Android structure", () => {
    assert.ok(entries.includes("AndroidManifest.xml"), "missing AndroidManifest.xml");
    assert.ok(entries.includes("resources.arsc"), "missing resources.arsc");
    assert.ok(
      entries.some((e) => /^classes\d*\.dex$/.test(e)),
      "no classes.dex — APK contains no compiled code",
    );
  });

  test("APK is signed", () => {
    // AGP 8 debug builds are v2/v3-only: nothing in META-INF, signature lives in
    // the APK Signing Block instead. Detect its magic rather than zip entries.
    const v2 = fs.readFileSync(APK_PATH).includes(Buffer.from("APK Sig Block 42", "latin1"));
    const v1 = entries.some((e) => /^META-INF\/.*\.(RSA|DSA|EC)$/i.test(e));
    assert.ok(v1 || v2, "no v1 or v2+ signature found — APK won't install");
  });

  test("web assets were synced in", () => {
    assert.ok(
      entries.some((e) => e.startsWith(WEB_ROOT)),
      `nothing under ${WEB_ROOT} — did 'npx cap sync android' run?`,
    );
    assert.ok(indexHtml, `${WEB_ROOT}index.html missing`);
  });

  test("index.html uses relative asset paths", () => {
    // Capacitor 8 serves from https://localhost, so root-absolute refs currently
    // still resolve — verified 2026-07-30 by shipping a web-base build to the
    // emulator and watching it render fine. This stays a hard failure anyway:
    // it means build:mobile was skipped, and the moment server.androidScheme
    // changes to `file` the same build goes blank with no other warning.
    const absolute = refsIn(indexHtml).filter((r) => r.startsWith("/") && !r.startsWith("//"));
    assert.deepEqual(
      absolute,
      [],
      `root-absolute refs: ${absolute.join(", ")}\n` +
        "Built with 'npm run build' instead of 'npm run build:mobile'.",
    );
  });

  test("referenced local assets exist in the APK", () => {
    const local = refsIn(indexHtml).filter(
      (r) => !/^(https?:)?\/\//i.test(r) && !r.startsWith("data:") && !r.startsWith("#"),
    );
    assert.ok(local.length > 0, "index.html references no local assets — suspicious");

    const missing = local.filter((ref) => {
      const rel = ref.replace(/^\.\//, "").replace(/^\//, "").split(/[?#]/)[0];
      return !entries.includes(`${WEB_ROOT}${rel}`);
    });
    assert.deepEqual(missing, [], `referenced but absent from APK: ${missing.join(", ")}`);
  });

  test("Supabase config was inlined and points at a real backend", () => {
    // Vite inlines VITE_* at build time. Missing .env yields literal `undefined`,
    // so createClient() throws and the app dies immediately after launch.
    //
    // Scanning the whole bundle for "localhost" is useless here — supabase-js
    // carries its own `http://localhost:9999` default constant. Only the value
    // actually handed to createClient matters.
    const js = entries
      .filter((e) => e.startsWith(WEB_ROOT) && e.endsWith(".js"))
      .map((e) => readText(e) || "")
      .join("\n");

    const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
    assert.ok(
      url,
      "no Supabase URL in bundle — VITE_SUPABASE_URL was unset at build time. Create .env, rebuild.",
    );
    assert.doesNotMatch(
      js,
      /createClient\(\s*["']https?:\/\/(localhost|127\.0\.0\.1)/i,
      "createClient points at a dev server — unreachable from a device",
    );
    assert.doesNotMatch(js, /createClient\(\s*(void 0|undefined)/, "createClient got undefined");
  });

  test("reports metadata", () => {
    const { size, mtime } = fs.statSync(APK_PATH);
    console.log(
      `\n  ${path.relative(repoRoot, APK_PATH)}` +
        `\n  ${(size / 1024 / 1024).toFixed(2)} MB · built ${mtime.toISOString()}` +
        `\n  ${entries.length} entries · ${entries.filter((e) => e.startsWith(WEB_ROOT)).length} web assets\n`,
    );
  });
});
