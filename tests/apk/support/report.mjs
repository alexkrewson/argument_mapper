// Builds test-results/apk/report.html from results.json + the screenshot folders.
//
//   npm run test:apk:report              -> report.html, images referenced (~20 KB)
//   npm run test:apk:report -- --inline  -> report-standalone.html, images embedded
//
// The default keeps the report small and is what you open locally. Use --inline
// to hand a single file to someone outside this machine.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { findAdb } from "./android.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..", "..", "test-results", "apk");
const INLINE = process.argv.includes("--inline");
const OUT = path.join(root, INLINE ? "report-standalone.html" : "report.html");

const imgSrc = (group, file) =>
  INLINE
    ? `data:image/png;base64,${fs.readFileSync(path.join(root, group, file)).toString("base64")}`
    : `${group}/${file}`;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function deviceInfo() {
  const adb = findAdb();
  if (!adb) return { serial: "unknown", model: "unknown", release: "unknown", sdk: "unknown" };
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
  const file = path.join(root, "results.json");
  if (!fs.existsSync(file)) return [];
  const events = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      events.push(JSON.parse(t));
    } catch {
      /* partial line */
    }
  }
  return events
    .filter((e) => e.type === "test:pass" || e.type === "test:fail")
    .map((e) => ({
      name: e.data?.name ?? "(unnamed)",
      file: e.data?.file ? path.basename(e.data.file) : "",
      pass: e.type === "test:pass",
      skipped: Boolean(e.data?.skip),
      durationMs: e.data?.details?.duration_ms ?? 0,
      error: e.data?.details?.error?.message ?? e.data?.details?.error?.cause?.message ?? null,
      nesting: e.data?.nesting ?? 0,
    }))
    // Suite-level rollups duplicate their children; keep the leaves.
    .filter((t) => t.nesting > 0 || !events.some((e) => e.data?.name !== t.name));
}

function groups() {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      name: d.name,
      shots: fs
        .readdirSync(path.join(root, d.name))
        .filter((f) => f.endsWith(".png"))
        .sort(),
    }))
    .filter((g) => g.shots.length > 0);
}

const dev = deviceInfo();
const tests = parseResults();
const passed = tests.filter((t) => t.pass && !t.skipped).length;
const failed = tests.filter((t) => !t.pass).length;
const skipped = tests.filter((t) => t.skipped).length;
const shotGroups = groups();
const totalShots = shotGroups.reduce((n, g) => n + g.shots.length, 0);
const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);

const byFile = {};
for (const t of tests) (byFile[t.file] ||= []).push(t);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>iDisagree — APK test report</title>
<style>
  :root { color-scheme: dark; --bg:#0f1720; --panel:#182430; --line:#24323f;
          --fg:#e6edf3; --dim:#8fa3b5; --ok:#3fb950; --bad:#f85149; --warn:#d29922; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
         font:15px/1.55 ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif; }
  .wrap { max-width:1200px; margin:0 auto; padding:32px 20px 72px; }
  h1 { font-size:26px; margin:0 0 4px; }
  .sub { color:var(--dim); margin-bottom:24px; }
  .cards { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:28px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px;
          padding:14px 18px; min-width:120px; }
  .card b { display:block; font-size:24px; }
  .ok b { color:var(--ok); } .bad b { color:var(--bad); } .warn b { color:var(--warn); }
  .meta { color:var(--dim); font-size:13px; }
  h2 { font-size:18px; margin:32px 0 12px; padding-bottom:8px; border-bottom:1px solid var(--line); }
  table { width:100%; border-collapse:collapse; margin-bottom:8px; }
  td { padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  td.s { width:34px; text-align:center; }
  td.d { width:80px; text-align:right; color:var(--dim); font-variant-numeric:tabular-nums; }
  .err { color:var(--bad); font-family:ui-monospace,Consolas,monospace; font-size:12px;
         white-space:pre-wrap; padding:6px 10px 12px 44px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:14px; }
  figure { margin:0; background:var(--panel); border:1px solid var(--line);
           border-radius:10px; overflow:hidden; }
  figure img { width:100%; display:block; background:#000; cursor:zoom-in; }
  figcaption { padding:7px 9px; font-size:11.5px; color:var(--dim); word-break:break-all; }
  dialog { border:none; background:transparent; max-width:96vw; max-height:96vh; padding:0; }
  dialog::backdrop { background:rgba(0,0,0,.85); }
  dialog img { max-width:96vw; max-height:96vh; display:block; }
</style></head><body><div class="wrap">

<h1>iDisagree — APK test report</h1>
<div class="sub">${esc(stamp)} · ${esc(dev.model || "unknown device")} ·
  Android ${esc(dev.release)} (API ${esc(dev.sdk)}) · ${esc(dev.serial)}</div>

<div class="cards">
  <div class="card ok"><b>${passed}</b><span class="meta">passed</span></div>
  <div class="card ${failed ? "bad" : ""}"><b>${failed}</b><span class="meta">failed</span></div>
  <div class="card ${skipped ? "warn" : ""}"><b>${skipped}</b><span class="meta">skipped</span></div>
  <div class="card"><b>${totalShots}</b><span class="meta">screenshots</span></div>
</div>

${
  tests.length === 0
    ? `<p class="meta">No results.json found — run <code>npm run test:apk:all</code> first.</p>`
    : Object.entries(byFile)
        .map(
          ([file, list]) => `<h2>${esc(file || "tests")}</h2><table>${list
            .map(
              (t) => `<tr>
        <td class="s">${t.skipped ? "○" : t.pass ? "✓" : "✕"}</td>
        <td>${esc(t.name)}</td>
        <td class="d">${Math.round(t.durationMs)}ms</td></tr>${
          t.error ? `<tr><td colspan="3" class="err">${esc(t.error)}</td></tr>` : ""
        }`,
            )
            .join("")}</table>`,
        )
        .join("")
}

${shotGroups
  .map(
    (g) => `<h2>Screenshots — ${esc(g.name)} <span class="meta">(${g.shots.length})</span></h2>
<div class="grid">${g.shots
      .map(
        (s) => `<figure><img loading="lazy" src="${imgSrc(g.name, s)}" alt="${esc(s)}"
      onclick="zoom(this.src)"><figcaption>${esc(s.replace(/\.png$/, ""))}</figcaption></figure>`,
      )
      .join("")}</div>`,
  )
  .join("")}

<dialog id="lb" onclick="this.close()"><img id="lbimg" alt=""></dialog>
<script>
  function zoom(src){ const d=document.getElementById('lb');
    document.getElementById('lbimg').src=src; d.showModal(); }
</script>
</div></body></html>`;

fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(OUT, html, "utf8");
console.log(`report: ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
console.log(`  ${passed} passed, ${failed} failed, ${skipped} skipped, ${totalShots} screenshots`);
