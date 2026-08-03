// Turns the APK run into the Android half of the combined test report.
//
//   npm run test:apk:report              -> refreshes test-results/report/index.html
//   npm run report -- --inline           -> single-file copy to hand to someone else
//
// Reads three things the run leaves behind:
//   results.json   one JSON line per test (tests/apk/support/json-reporter.mjs)
//   steps.jsonl    one line per screenshot, timestamped (screenshotter())
//   <group>/*.png  the screenshots themselves
//
// node:test has no way to ask "which test is running?", so steps are paired to
// tests by time: each test event carries its end timestamp and duration, and a
// step belongs to whichever test's window contains it. That holds because the
// APK suites run with --test-concurrency=1 — they share one device and one app
// instance, so they cannot overlap. If that ever changes, this pairing breaks
// before the tests do, and silently.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { findAdb } from "./android.mjs";
import { REPORT_DIR, resetShots, writeManifest } from "../../support/report-manifest.mjs";
import { buildCombinedReport, buildStandaloneReport } from "../../../scripts/build-test-report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..", "..");
const apkRoot = path.join(repoRoot, "test-results", "apk");
const SUITE_ID = "apk";

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

function deviceInfo() {
  const adb = findAdb();
  if (!adb) return { serial: "unknown", model: "unknown", release: "?", sdk: "?" };
  const get = (args) => spawnSync(adb, args, { encoding: "utf8" }).stdout?.trim() ?? "";
  return {
    serial: (get(["devices"]).split("\n")[1] || "").split(/\s+/)[0] || "none",
    model: get(["shell", "getprop", "ro.product.model"]),
    release: get(["shell", "getprop", "ro.build.version.release"]),
    sdk: get(["shell", "getprop", "ro.build.version.sdk"]),
  };
}

/** node:test's json reporter emits one JSON object per line. */
function parseResults() {
  const file = path.join(apkRoot, "results.json");
  if (!fs.existsSync(file)) return [];
  const events = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      events.push(JSON.parse(t));
    } catch {
      /* partial line from an interrupted run */
    }
  }
  return events
    .filter((e) => e.type === "test:pass" || e.type === "test:fail")
    // Suite-level rollups repeat their children and would swallow every step
    // in the file into one entry; keep the leaves.
    .filter((e) => (e.data?.nesting ?? 0) > 0)
    .map((e) => {
      const duration = e.data?.details?.duration_ms ?? 0;
      const end = e.ts ?? 0;
      return {
        name: e.data?.name ?? "(unnamed)",
        file: e.data?.file ? path.basename(e.data.file) : "",
        status: e.data?.skip ? "skipped" : e.type === "test:pass" ? "passed" : "failed",
        durationMs: duration,
        start: end - duration,
        end,
        error:
          e.data?.details?.error?.message ??
          e.data?.details?.error?.cause?.message ??
          null,
      };
    });
}

function parseSteps() {
  const file = path.join(apkRoot, "steps.jsonl");
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* partial line */
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

export function buildApkManifest() {
  const dev = deviceInfo();
  const tests = parseResults();
  const steps = parseSteps();
  const shotsOut = resetShots(SUITE_ID);

  const used = new Set();
  const entries = tests.map((t) => {
    const id = slug(`${t.file}-${t.name}`);
    let n = 0;
    const mine = steps.filter((s, i) => {
      if (used.has(i)) return false;
      // Inclusive of the start edge: the first action of a test frequently
      // lands on the same millisecond the test began.
      const inWindow = s.ts >= t.start && s.ts <= t.end;
      if (inWindow) used.add(i);
      return inWindow;
    });

    const mySteps = [];
    for (const s of mine) {
      if (!s.file) continue;
      const src = path.join(apkRoot, s.file);
      if (!fs.existsSync(src)) continue;
      const name = `${id}-${String(++n).padStart(3, "0")}.png`;
      try {
        fs.copyFileSync(src, path.join(shotsOut, name));
      } catch {
        continue;
      }
      mySteps.push({ label: s.label, src: `shots/${SUITE_ID}/${name}` });
    }

    return {
      id,
      file: t.file,
      title: t.name,
      status: t.status,
      durationMs: t.durationMs,
      error: t.error,
      notes: [],
      steps: mySteps,
    };
  });

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  writeManifest({
    id: SUITE_ID,
    label: "Android · APK on device",
    meta: `${stamp} · ${dev.model || "unknown device"} · Android ${dev.release} (API ${dev.sdk}) · ${dev.serial}`,
    tests: entries,
  });

  return entries;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const entries = buildApkManifest();
  const shots = entries.reduce((n, t) => n + t.steps.length, 0);
  const out = process.argv.includes("--inline")
    ? await buildStandaloneReport()
    : buildCombinedReport();
  console.log(`report: ${out}`);
  console.log(`  ${entries.length} APK tests, ${shots} screenshots`);
  if (entries.length === 0) {
    console.log("  note: no results.json — run `npm run test:apk:all` first.");
  }
  console.log(`  manifests: ${REPORT_DIR}`);
}
