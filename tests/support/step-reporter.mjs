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
import { REPORT_DIR, resetShots, shotsDir, writeManifest } from "./report-manifest.mjs";
import { buildCombinedReport } from "../../scripts/build-test-report.mjs";

const SHOT_PREFIX = "report-shot:";
const SUITE_ID = "web";

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const stripAnsi = (s) => String(s ?? "").replace(/\[[0-9;]*m/g, "");

export default class StepReporter {
  constructor() {
    this.tests = [];
    this.dir = null;
    this.seen = new Set();
  }

  onBegin() {
    this.dir = resetShots(SUITE_ID);
  }

  onTestEnd(test, result) {
    const file = path.basename(test.location?.file || "");
    const title = test.titlePath().slice(3).join(" › ") || test.title;

    // Retries land here twice; keep the last attempt, which is the one the
    // run's exit code reflects.
    let id = slug(`${file}-${title}`);
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
