// Merges whatever suite manifests exist into test-results/report/index.html.
//
//   npm run report              -> index.html, screenshots referenced (small)
//   npm run report -- --inline  -> report-standalone.html, screenshots embedded
//
// Both suites call buildCombinedReport() at the end of their own run, so the
// document is always current without anyone remembering to rebuild it. Running
// this by hand is for re-rendering after a template change, or for producing
// the standalone file to hand to someone who doesn't have the repo.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReportHtml } from "../tests/support/report-html.mjs";
import { REPORT_DIR, readManifests } from "../tests/support/report-manifest.mjs";

// Inlining the PNGs as-is produces a ~70 MB file, which is not a thing anyone
// can email or open comfortably — so the standalone path re-encodes to JPEG at
// a capped width first. Chromium does the encoding because Playwright is
// already a devDependency here and Node has no built-in image encoder; if it
// can't be loaded we fall back to raw PNG and say so, since a large report
// still beats no report.
// Tuned so a full run lands comfortably under the ~30 MB that mail and chat
// tools tend to reject. This is the PORTABLE copy — index.html keeps the
// original full-resolution PNGs, and that is the one to open when you need to
// inspect a screenshot closely. Raise via REPORT_INLINE_WIDTH /
// REPORT_INLINE_QUALITY when fidelity matters more than the file being sendable.
const INLINE_MAX_WIDTH = Number(process.env.REPORT_INLINE_WIDTH) || 820;
const INLINE_QUALITY = Number(process.env.REPORT_INLINE_QUALITY) || 0.55;

async function openEncoder() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return null;
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  return {
    async encode(buffer) {
      return page.evaluate(
        async ([b64, maxWidth, quality]) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const scale = Math.min(1, maxWidth / img.naturalWidth);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          const ctx = canvas.getContext("2d");
          // Screenshots of dark UIs go transparent-black without this.
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/jpeg", quality);
        },
        [buffer.toString("base64"), INLINE_MAX_WIDTH, INLINE_QUALITY],
      );
    },
    close: () => browser.close(),
  };
}

/** Swap referenced screenshots for data: URIs so the file stands alone. */
async function inlineShots(suites) {
  const encoder = await openEncoder();
  if (!encoder) console.log("  (playwright unavailable — inlining PNGs uncompressed)");
  const cache = new Map();

  const resolve = async (src) => {
    if (cache.has(src)) return cache.get(src);
    const file = path.join(REPORT_DIR, src);
    let uri = null;
    if (fs.existsSync(file)) {
      const buffer = fs.readFileSync(file);
      try {
        uri = encoder
          ? await encoder.encode(buffer)
          : `data:image/png;base64,${buffer.toString("base64")}`;
      } catch {
        uri = `data:image/png;base64,${buffer.toString("base64")}`;
      }
    }
    cache.set(src, uri);
    return uri;
  };

  const out = [];
  for (const suite of suites) {
    const tests = [];
    for (const test of suite.tests) {
      const steps = [];
      for (const step of test.steps) {
        if (!step.src || step.src.startsWith("data:")) {
          steps.push(step);
          continue;
        }
        steps.push({ ...step, src: await resolve(step.src) });
      }
      tests.push({ ...test, steps });
    }
    out.push({ ...suite, tests });
  }

  await encoder?.close();
  return out;
}

function write(suites, inline) {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const html = buildReportHtml({ title: "iDisagree — test report", stamp, suites });
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = path.join(REPORT_DIR, inline ? "report-standalone.html" : "index.html");
  fs.writeFileSync(out, html, "utf8");
  return out;
}

/** Synchronous, referenced-image build. This is what the suite reporters call. */
export function buildCombinedReport() {
  return write(readManifests(), false);
}

/** Single-file build with compressed images. Async because encoding is. */
export async function buildStandaloneReport() {
  return write(await inlineShots(readManifests()), true);
}

// Only act as a CLI when invoked directly — the reporters import this module.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const inline = process.argv.includes("--inline");
  const out = inline ? await buildStandaloneReport() : buildCombinedReport();
  const suites = readManifests();
  const tests = suites.reduce((n, s) => n + s.tests.length, 0);
  const shots = suites.reduce((n, s) => n + s.tests.reduce((m, t) => m + t.steps.length, 0), 0);
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`report: ${out} (${kb} KB)`);
  console.log(
    `  ${suites.length} suite${suites.length === 1 ? "" : "s"}, ${tests} tests, ${shots} screenshots`,
  );
  if (suites.length < 2) {
    console.log("  note: only one suite present — run the other to fill in the rest.");
  }
}
