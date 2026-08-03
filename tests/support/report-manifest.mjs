// Where each suite drops its results so the combined report can pick them up.
//
// Web and Android runs happen at different times, on different tooling, and
// often hours apart — so neither builds the combined document directly. Each
// writes a manifest plus its screenshots into test-results/report/, and
// scripts/build-test-report.mjs merges whatever is present. Running only one
// suite therefore refreshes only that half of the report and leaves the other
// half as it was, which is what you want when iterating on one of them.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.join(__dirname, "..", "..");
export const REPORT_DIR = path.join(repoRoot, "test-results", "report");

/** Suite ordering in the report; anything unlisted sorts after these, alphabetically. */
const SUITE_ORDER = ["web", "apk"];

export function shotsDir(suiteId) {
  return path.join(REPORT_DIR, "shots", suiteId);
}

/** Wipe a suite's screenshots so a re-run doesn't leave orphans from the last one. */
export function resetShots(suiteId) {
  const dir = shotsDir(suiteId);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeManifest(manifest) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `${manifest.id}.json`);
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2), "utf8");
  return file;
}

export function readManifests() {
  if (!fs.existsSync(REPORT_DIR)) return [];
  return fs
    .readdirSync(REPORT_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(REPORT_DIR, f), "utf8"));
      } catch {
        return null; // a half-written manifest from an interrupted run
      }
    })
    .filter((m) => m && Array.isArray(m.tests))
    .sort((a, b) => {
      const ai = SUITE_ORDER.indexOf(a.id), bi = SUITE_ORDER.indexOf(b.id);
      if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      return String(a.id).localeCompare(String(b.id));
    });
}

/**
 * Fields whose typed value must never reach the report.
 *
 * The report is a shareable artifact — it gets opened by other people and
 * handed around as a single file — and auth.setup.js types the real .env.test
 * password on every run. Screenshots are safe on their own (the browser renders
 * dots), but the step LABEL quotes what was typed, so without this the password
 * would sit in the HTML in plain text.
 */
const SECRET = /pass(word)?|secret|token|api[-_]?key|otp|pin\b/i;

export function redactValue(target, value) {
  if (value == null || value === "") return value;
  return SECRET.test(String(target)) ? "••••••••" : value;
}

/**
 * Turn an action into a sentence a reader who doesn't know the codebase can
 * follow. "click settings-btn" is what the runner sees; "Click Settings" is
 * what belongs in a report. Falls back to the raw target when there's no
 * friendlier name available, which is better than inventing one.
 */
export function describeAction(action, target, value) {
  value = redactValue(target, value);
  const verb = {
    click: "Click", dblclick: "Double-click", fill: "Type into", press: "Press key in",
    check: "Tick", uncheck: "Untick", selectOption: "Choose in", setInputFiles: "Attach file to",
    hover: "Hover over", tap: "Tap", goto: "Open", setValue: "Type into", selectValue: "Choose in",
  }[action] || action;

  const name = friendlyTarget(target);
  if (action === "goto") return `Open ${target}`;
  if (value != null && value !== "") {
    const short = String(value).length > 60 ? `${String(value).slice(0, 57)}…` : String(value);
    return `${verb} ${name} — "${short}"`;
  }
  return `${verb} ${name}`;
}

/** getByTestId('settings-btn') -> "Settings btn"; leaves anything unrecognised alone. */
export function friendlyTarget(target) {
  const raw = String(target ?? "").trim();
  const testId = raw.match(/getByTestId\((?:'|")([^'"]+)(?:'|")\)/)?.[1]
    ?? raw.match(/\[data-testid="([^"]+)"\]/)?.[1]
    ?? (/^[a-z0-9-]+$/i.test(raw) ? raw : null);
  if (!testId) return raw.replace(/^Locator@/, "");
  return testId.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
