// Playwright reporter: turns each test's `report-shot:` attachments into the
// web half of the combined test report.
//
// Every test appears, including ones that captured nothing — a test with no
// steps is a fact worth showing, not a row to hide. (The previous version
// dropped them, which is how 12 of 13 spec files came to be missing from the
// report without anyone noticing.)
//
// Runs on every `playwright test` invocation regardless of which files or tags
// were selected, and rebuilds the combined document at the end so the report on
// disk always reflects the run that just finished.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { REPORT_DIR, shotsDir, writeManifest } from "./report-manifest.mjs";
import { buildCombinedReport } from "../../scripts/build-test-report.mjs";

const SHOT_PREFIX = "report-shot:";
const SUITE_ID = "web";

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

// The slug is truncated for readable filenames, so it is NOT unique on its own:
// a long describe title eats the budget and leaves only the first few letters of
// the test name. tests/ai-judgement.spec.js hit this exactly -- 76 of the 80
// characters went on "AI judgement — does the model reach the right conclusion",
// so "non-sequitur-genuine" and "non-sequitur-false-positive" both ended at
// "non-". Identical ids meant the retry-dedup below read the second as a rerun
// of the first, dropped it from the manifest, and overwrote its screenshots.
// Silently: the report simply had one fewer row than the run had tests.
// The hash is of the FULL key, so retries of one test still collide (which is
// what dedup wants) and two different tests never can.
const idFor = (key) =>
  `${slug(key)}-${crypto.createHash("sha1").update(key).digest("hex").slice(0, 6)}`;
const stripAnsi = (s) => String(s ?? "").replace(/\[[0-9;]*m/g, "");

export default class StepReporter {
  constructor() {
    this.tests = [];
    this.dir = null;
    this.seen = new Set();
  }

  onBegin() {
    // Deliberately NOT resetShots() here. The reporter runs on every
    // `playwright test` invocation including ones that execute nothing --
    // `--list`, a --grep that matches no test, a run aborted before the first
    // test. Wiping up front meant those silently destroyed the previous run's
    // screenshots and manifest. Orphans are pruned in onEnd instead, and only
    // when something actually ran.
    this.dir = shotsDir(SUITE_ID);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  onTestEnd(test, result) {
    const file = path.basename(test.location?.file || "");
    const title = test.titlePath().slice(3).join(" › ") || test.title;

    // Retries land here twice; keep the last attempt, which is the one the
    // run's exit code reflects.
    let id = idFor(`${file}-${title}`);
    if (this.seen.has(id)) this.tests = this.tests.filter((t) => t.id !== id);
    this.seen.add(id);

    const steps = [];
    const notes = [];
    let n = 0;

    for (const attachment of result.attachments) {
      if (attachment.name.startsWith(SHOT_PREFIX)) {
        const label = attachment.name.slice(SHOT_PREFIX.length);
        const name = `${id}-${String(++n).padStart(3, "0")}.png`;
        const dest = path.join(this.dir, name);
        try {
          if (attachment.path && fs.existsSync(attachment.path)) {
            fs.copyFileSync(attachment.path, dest);
          } else if (attachment.body) {
            fs.writeFileSync(dest, attachment.body);
          } else {
            continue;
          }
        } catch {
          continue; // the run is worth more than one frame
        }
        steps.push({ label, src: `shots/${SUITE_ID}/${name}` });
      } else if (attachment.body && attachment.contentType === "text/plain") {
        notes.push({ name: attachment.name, text: attachment.body.toString("utf8") });
      }
    }

    const status = result.status === "passed" ? "passed"
      : result.status === "skipped" ? "skipped"
      : "failed";

    this.tests.push({
      id,
      file,
      title,
      status,
      durationMs: result.duration,
      error: result.error ? stripAnsi(result.error.message) : null,
      notes,
      steps,
    });
  }

  onEnd() {
    if (this.tests.length === 0) {
      console.log("\nStep report: no tests ran — keeping the previous web results.");
      return;
    }

    // Drop screenshots from earlier runs that this one didn't produce, so the
    // shots directory can't grow without bound across runs.
    const keep = new Set(
      this.tests.flatMap((t) => t.steps.map((s) => path.basename(s.src))),
    );
    for (const name of fs.readdirSync(this.dir)) {
      if (!keep.has(name)) fs.rmSync(path.join(this.dir, name), { force: true });
    }

    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    writeManifest({
      id: SUITE_ID,
      label: "Web · Playwright",
      meta: `${stamp} · ${process.env.TEST_BASE_URL || "https://idisagree.trolleysolution.com"}`,
      tests: this.tests,
    });

    const shots = this.tests.reduce((n, t) => n + t.steps.length, 0);
    const out = buildCombinedReport();
    console.log(
      `\nStep report: ${path.relative(process.cwd(), out)} ` +
      `(${this.tests.length} web test${this.tests.length === 1 ? "" : "s"}, ${shots} screenshot${shots === 1 ? "" : "s"})`,
    );
  }
}

export { REPORT_DIR, shotsDir };
