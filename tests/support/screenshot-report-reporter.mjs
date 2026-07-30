// Custom Playwright reporter: compiles every `report-shot:<label>` image
// attachment (see tests/support/reportShot.js) into a single scrollable HTML
// document, grouped by test, in capture order. Runs automatically on every
// `playwright test` invocation regardless of which files/tags were selected —
// tests that don't use reportShot() simply don't appear in it. See the
// "Desired screenshots" section of /home/alex/apps/shared/testing-guidelines.md
// for why this exists.
import fs from "node:fs";
import path from "node:path";

const SHOT_PREFIX = "report-shot:";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatMs(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default class ScreenshotReportReporter {
  constructor(options = {}) {
    this.outputFile = options.outputFile || "playwright-report/screenshot-report.html";
    this.cases = [];
  }

  onTestEnd(test, result) {
    const shots = [];
    const notes = [];
    for (const attachment of result.attachments) {
      if (attachment.name.startsWith(SHOT_PREFIX) && attachment.body) {
        shots.push({
          label: attachment.name.slice(SHOT_PREFIX.length),
          base64: attachment.body.toString("base64"),
          contentType: attachment.contentType,
        });
      } else if (attachment.body && attachment.contentType === "text/plain") {
        notes.push({ name: attachment.name, text: attachment.body.toString("utf8") });
      }
    }
    if (shots.length === 0) return;
    this.cases.push({
      title: test.titlePath().slice(2).join(" › ") || test.title,
      status: result.status,
      durationMs: result.duration,
      notes,
      shots,
    });
  }

  onEnd() {
    if (this.cases.length === 0) return;
    const totalShots = this.cases.reduce((n, c) => n + c.shots.length, 0);
    fs.mkdirSync(path.dirname(this.outputFile), { recursive: true });
    fs.writeFileSync(this.outputFile, buildHtml(this.cases));
    console.log(
      `\nScreenshot report: ${this.outputFile} ` +
      `(${this.cases.length} test${this.cases.length === 1 ? "" : "s"}, ${totalShots} screenshot${totalShots === 1 ? "" : "s"})`
    );
  }
}

function buildHtml(cases) {
  const sections = cases.map((c) => `
  <section class="case">
    <div class="case-head">
      <h2 class="case-title">${escapeHtml(c.title)}</h2>
      <div class="case-stats">
        <span class="status status--${c.status}">${escapeHtml(c.status)}</span>
        · ${formatMs(c.durationMs)} · ${c.shots.length} screenshot${c.shots.length === 1 ? "" : "s"}
      </div>
    </div>
    ${c.notes.map((n) => `
    <div class="note">
      <p class="note-label">${escapeHtml(n.name)}</p>
      <pre>${escapeHtml(n.text)}</pre>
    </div>`).join("")}
    ${c.shots.map((s) => `
    <figure class="shot">
      <figcaption>${escapeHtml(s.label)}</figcaption>
      <div class="shot-scroll">
        <img src="data:${s.contentType};base64,${s.base64}" alt="${escapeHtml(s.label)}" loading="lazy" />
      </div>
    </figure>`).join("")}
  </section>`).join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Screenshot report</title>
<style>
  :root {
    --bg: #f8fafc; --panel: #ffffff; --border: #e2e8f0;
    --text-active: #0f172a; --text-dormant: #64748b;
    --accent: #b45309; --accent-soft: #fef3ea;
    --good: #16a34a; --bad: #dc2626; --warn: #b45309;
    --mono: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b1220; --panel: #111a2c; --border: #22314a;
      --text-active: #f1f5f9; --text-dormant: #92a1b5;
      --accent: #e08a3e; --accent-soft: #241a10;
    }
  }
  :root[data-theme="dark"] {
    --bg: #0b1220; --panel: #111a2c; --border: #22314a;
    --text-active: #f1f5f9; --text-dormant: #92a1b5;
    --accent: #e08a3e; --accent-soft: #241a10;
  }
  :root[data-theme="light"] {
    --bg: #f8fafc; --panel: #ffffff; --border: #e2e8f0;
    --text-active: #0f172a; --text-dormant: #64748b;
    --accent: #b45309; --accent-soft: #fef3ea;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text-active);
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.5;
  }
  header { max-width: 900px; margin: 0 auto; padding: 40px 24px 20px; }
  header .eyebrow {
    font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--accent); margin: 0 0 8px;
  }
  header h1 { font-size: 24px; font-weight: 650; margin: 0; text-wrap: balance; }
  main { max-width: 900px; margin: 0 auto; padding: 20px 24px 80px; display: flex; flex-direction: column; gap: 48px; }
  section.case { border: 1px solid var(--border); border-radius: 14px; background: var(--panel); overflow: hidden; }
  .case-head {
    padding: 18px 24px; border-bottom: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap;
  }
  .case-title { font-size: 16px; font-weight: 600; margin: 0; }
  .case-stats {
    font-family: var(--mono); font-size: 12.5px; color: var(--text-dormant);
    white-space: nowrap; font-variant-numeric: tabular-nums;
  }
  .status { font-weight: 600; }
  .status--passed { color: var(--good); }
  .status--failed, .status--timedOut { color: var(--bad); }
  .status--skipped { color: var(--warn); }
  .note { padding: 14px 24px; border-bottom: 1px solid var(--border); background: var(--accent-soft); }
  .note-label {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--text-dormant); margin: 0 0 6px;
  }
  .note pre { margin: 0; font-family: var(--mono); font-size: 12.5px; white-space: pre-wrap; word-break: break-word; }
  figure.shot { margin: 0; border-bottom: 1px solid var(--border); }
  figure.shot:last-child { border-bottom: none; }
  figcaption {
    padding: 10px 24px; font-family: var(--mono); font-size: 12px; letter-spacing: 0.03em;
    text-transform: uppercase; color: var(--text-dormant); background: var(--panel);
  }
  .shot-scroll { overflow-x: auto; }
  .shot-scroll img { display: block; width: 100%; height: auto; }
</style>
</head>
<body>
<header>
  <p class="eyebrow">Playwright · auto-generated</p>
  <h1>Screenshot report</h1>
</header>
<main>
${sections}
</main>
</body>
</html>`;
}
