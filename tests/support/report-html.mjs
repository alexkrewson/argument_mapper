// Shared HTML builder for the test report.
//
// Both suites feed this: the Playwright reporter (tests/support/step-reporter.mjs)
// and the APK report builder (tests/apk/support/report.mjs). scripts/build-test-report.mjs
// merges whatever manifests exist into one document.
//
// Kept deliberately dependency-free and self-contained — the report is meant to
// be opened straight off disk, or handed to someone else as a single file, with
// no server and no build step.
//
// Manifest shape (see tests/support/report-manifest.mjs for the writer):
//   { id, label, meta, tests: [
//       { id, file, title, status, durationMs, error, notes[], steps[] } ] }
//   step: { label, detail, src }   src = relative path OR data: URI

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function formatMs(ms) {
  const n = Number(ms) || 0;
  if (n < 1000) return `${Math.round(n)}ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.floor(n / 60_000)}m ${Math.round((n % 60_000) / 1000)}s`;
}

const ICON = { passed: "✓", failed: "✕", skipped: "○" };

/** Group a suite's tests by source file, preserving first-seen order. */
function byFile(tests) {
  const out = new Map();
  for (const t of tests) {
    const key = t.file || "(unknown)";
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(t);
  }
  return [...out.entries()];
}

function countStatuses(tests) {
  return {
    passed: tests.filter((t) => t.status === "passed").length,
    failed: tests.filter((t) => t.status === "failed").length,
    skipped: tests.filter((t) => t.status === "skipped").length,
    steps: tests.reduce((n, t) => n + (t.steps?.length ?? 0), 0),
  };
}

function renderStep(step, index) {
  const label = escapeHtml(step.label || `step ${index + 1}`);
  const detail = step.detail ? `<p class="step-detail">${escapeHtml(step.detail)}</p>` : "";
  const img = step.src
    ? `<button class="step-shot" type="button" data-src="${escapeHtml(step.src)}" aria-label="Enlarge ${label}">
         <img src="${escapeHtml(step.src)}" alt="${label}" loading="lazy" decoding="async" />
       </button>`
    : `<p class="step-noshot">no screenshot captured</p>`;
  return `
  <li class="step">
    <div class="step-head">
      <span class="step-n">${index + 1}</span>
      <span class="step-label" title="${label}">${label}</span>
    </div>
    ${detail}
    ${img}
  </li>`;
}

function renderTest(suiteId, test) {
  const steps = test.steps ?? [];
  const notes = test.notes ?? [];
  return `
  <article class="test" id="${escapeHtml(`${suiteId}--${test.id}`)}" data-status="${escapeHtml(test.status)}">
    <header class="test-head">
      <div class="test-title-row">
        <span class="dot dot--${escapeHtml(test.status)}" aria-hidden="true">${ICON[test.status] ?? "·"}</span>
        <h3 class="test-title">${escapeHtml(test.title)}</h3>
      </div>
      <div class="test-meta">
        <span class="pill pill--${escapeHtml(test.status)}">${escapeHtml(test.status)}</span>
        <span>${escapeHtml(test.file || "")}</span>
        <span>${formatMs(test.durationMs)}</span>
        <span>${steps.length} step${steps.length === 1 ? "" : "s"}</span>
      </div>
    </header>
    ${test.error ? `<pre class="test-error">${escapeHtml(test.error)}</pre>` : ""}
    ${notes.map((n) => `
    <details class="note">
      <summary>${escapeHtml(n.name)}</summary>
      <pre>${escapeHtml(n.text)}</pre>
    </details>`).join("")}
    ${steps.length
      ? `<ol class="steps">${steps.map(renderStep).join("")}</ol>`
      : `<p class="test-empty">No UI steps — this check asserts on state rather than driving the interface.</p>`}
  </article>`;
}

function renderSidebar(suites) {
  return suites.map((suite) => {
    const c = countStatuses(suite.tests);
    const files = byFile(suite.tests).map(([file, tests]) => {
      const fc = countStatuses(tests);
      return `
      <details class="nav-file" ${fc.failed ? "open" : ""}>
        <summary>
          <span class="nav-file-name">${escapeHtml(file)}</span>
          <span class="nav-file-count${fc.failed ? " is-bad" : ""}">${tests.length}</span>
        </summary>
        <ul class="nav-tests">
          ${tests.map((t) => `
          <li>
            <a href="#${escapeHtml(`${suite.id}--${t.id}`)}" data-status="${escapeHtml(t.status)}">
              <span class="dot dot--${escapeHtml(t.status)}" aria-hidden="true">${ICON[t.status] ?? "·"}</span>
              <span class="nav-test-title">${escapeHtml(t.title)}</span>
            </a>
          </li>`).join("")}
        </ul>
      </details>`;
    }).join("");

    return `
    <details class="nav-suite" open>
      <summary>
        <span class="nav-suite-name">${escapeHtml(suite.label)}</span>
        <span class="nav-suite-stat">${c.passed}/${suite.tests.length}</span>
      </summary>
      ${suite.meta ? `<p class="nav-suite-meta">${escapeHtml(suite.meta)}</p>` : ""}
      ${files || `<p class="nav-suite-meta">No tests recorded.</p>`}
    </details>`;
  }).join("");
}

export function buildReportHtml({ title = "Test report", stamp = "", suites = [] } = {}) {
  const all = suites.flatMap((s) => s.tests);
  const total = countStatuses(all);

  const main = suites.map((suite) => {
    const c = countStatuses(suite.tests);
    return `
  <section class="suite" id="suite-${escapeHtml(suite.id)}">
    <div class="suite-head">
      <h2>${escapeHtml(suite.label)}</h2>
      <p class="suite-meta">${escapeHtml(suite.meta || "")}</p>
      <div class="suite-stats">
        <span class="stat stat--passed"><b>${c.passed}</b> passed</span>
        <span class="stat${c.failed ? " stat--failed" : ""}"><b>${c.failed}</b> failed</span>
        <span class="stat${c.skipped ? " stat--skipped" : ""}"><b>${c.skipped}</b> skipped</span>
        <span class="stat"><b>${c.steps}</b> screenshots</span>
      </div>
    </div>
    ${byFile(suite.tests).map(([file, tests]) => `
    <div class="file-group">
      <h3 class="file-name">${escapeHtml(file)}</h3>
      ${tests.map((t) => renderTest(suite.id, t)).join("")}
    </div>`).join("")}
  </section>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root {
    color-scheme: light dark;
    --bg:#f6f7f9; --panel:#fff; --panel-2:#fbfcfd; --line:#e3e8ee;
    --fg:#111827; --dim:#5b6675;
    --ok:#15803d; --bad:#b91c1c; --warn:#a16207; --accent:#b45309;
    --mono:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;
    --sidebar:310px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:#0c111b; --panel:#131a27; --panel-2:#0f1622; --line:#243044;
      --fg:#e8edf4; --dim:#93a1b4;
      --ok:#4ade80; --bad:#f87171; --warn:#fbbf24; --accent:#f0a65a;
    }
  }
  :root[data-theme="light"] {
    --bg:#f6f7f9; --panel:#fff; --panel-2:#fbfcfd; --line:#e3e8ee;
    --fg:#111827; --dim:#5b6675;
    --ok:#15803d; --bad:#b91c1c; --warn:#a16207; --accent:#b45309;
  }
  :root[data-theme="dark"] {
    --bg:#0c111b; --panel:#131a27; --panel-2:#0f1622; --line:#243044;
    --fg:#e8edf4; --dim:#93a1b4;
    --ok:#4ade80; --bad:#f87171; --warn:#fbbf24; --accent:#f0a65a;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.55 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  }
  a { color:inherit; }

  /* ── Layout ─────────────────────────────────────────────── */
  .shell { display:grid; grid-template-columns:var(--sidebar) minmax(0,1fr); min-height:100vh; }
  .sidebar {
    position:sticky; top:0; align-self:start; height:100vh; overflow-y:auto;
    background:var(--panel-2); border-right:1px solid var(--line); padding:18px 14px 40px;
  }
  .content { min-width:0; padding:26px 30px 90px; }

  /* ── Sidebar ────────────────────────────────────────────── */
  .brand { font-size:15px; font-weight:650; margin:0 0 2px; }
  .brand-sub { font-family:var(--mono); font-size:11.5px; color:var(--dim); margin:0 0 14px; }
  .totals { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
  .totals span {
    font-family:var(--mono); font-size:11.5px; padding:3px 8px;
    border:1px solid var(--line); border-radius:999px; background:var(--panel);
  }
  .totals .t-pass { color:var(--ok); } .totals .t-fail { color:var(--bad); }
  .filter {
    width:100%; padding:7px 10px; margin-bottom:6px; font:inherit; font-size:13px;
    background:var(--panel); color:var(--fg); border:1px solid var(--line); border-radius:8px;
  }
  .only-fails {
    display:flex; align-items:center; gap:7px; font-size:12.5px; color:var(--dim);
    margin:0 0 14px; cursor:pointer; user-select:none;
  }
  .nav-suite, .nav-file { border-bottom:1px solid var(--line); }
  .nav-suite > summary, .nav-file > summary {
    cursor:pointer; list-style:none; display:flex; align-items:center; gap:8px;
    padding:9px 4px; font-weight:600;
  }
  .nav-suite > summary::-webkit-details-marker,
  .nav-file > summary::-webkit-details-marker { display:none; }
  .nav-suite > summary::before, .nav-file > summary::before {
    content:"▸"; color:var(--dim); font-size:11px; transition:transform .12s ease; flex:0 0 auto;
  }
  .nav-suite[open] > summary::before, .nav-file[open] > summary::before { transform:rotate(90deg); }
  .nav-suite-name { flex:1; font-size:13.5px; }
  .nav-suite-stat, .nav-file-count {
    font-family:var(--mono); font-size:11px; color:var(--dim);
    border:1px solid var(--line); border-radius:999px; padding:1px 7px;
  }
  .nav-file-count.is-bad { color:var(--bad); border-color:var(--bad); }
  .nav-suite-meta { font-size:11.5px; color:var(--dim); margin:0 0 8px 16px; }
  .nav-file { border-bottom:none; margin-left:14px; }
  .nav-file > summary { padding:6px 4px; font-weight:500; }
  .nav-file-name { flex:1; font-family:var(--mono); font-size:12px; color:var(--dim); }
  .nav-tests { list-style:none; margin:0 0 6px; padding:0 0 0 18px; }
  .nav-tests a {
    display:flex; gap:7px; align-items:baseline; padding:4px 6px; border-radius:6px;
    text-decoration:none; font-size:12.5px; color:var(--fg);
  }
  .nav-tests a:hover { background:var(--panel); }
  .nav-tests a.is-current { background:var(--panel); box-shadow:inset 2px 0 0 var(--accent); }
  .nav-test-title { min-width:0; }

  /* ── Status marks ───────────────────────────────────────── */
  .dot { font-weight:700; flex:0 0 auto; }
  .dot--passed { color:var(--ok); } .dot--failed { color:var(--bad); } .dot--skipped { color:var(--warn); }
  .pill {
    font-family:var(--mono); font-size:11px; text-transform:uppercase; letter-spacing:.05em;
    padding:2px 8px; border-radius:999px; border:1px solid var(--line);
  }
  .pill--passed { color:var(--ok); } .pill--failed { color:var(--bad); border-color:var(--bad); }
  .pill--skipped { color:var(--warn); }

  /* ── Content ────────────────────────────────────────────── */
  .suite { margin-bottom:52px; }
  .suite-head { border-bottom:1px solid var(--line); padding-bottom:14px; margin-bottom:22px; }
  .suite-head h2 { font-size:21px; margin:0 0 4px; }
  .suite-meta { color:var(--dim); font-size:13px; margin:0 0 10px; font-family:var(--mono); }
  .suite-stats { display:flex; flex-wrap:wrap; gap:14px; font-size:13px; color:var(--dim); }
  .stat b { color:var(--fg); font-size:17px; margin-right:4px; }
  .stat--passed b { color:var(--ok); } .stat--failed b { color:var(--bad); } .stat--skipped b { color:var(--warn); }
  .file-group { margin-bottom:30px; }
  .file-name {
    font-family:var(--mono); font-size:12.5px; color:var(--dim); font-weight:500;
    text-transform:none; letter-spacing:.02em; margin:0 0 10px;
  }
  .test {
    background:var(--panel); border:1px solid var(--line); border-radius:12px;
    padding:16px 18px; margin-bottom:14px; scroll-margin-top:18px;
  }
  .test[data-status="failed"] { border-color:var(--bad); }
  .test-title-row { display:flex; gap:9px; align-items:baseline; }
  .test-title { font-size:15.5px; font-weight:600; margin:0; }
  .test-meta {
    display:flex; flex-wrap:wrap; gap:12px; align-items:center;
    font-family:var(--mono); font-size:11.5px; color:var(--dim); margin-top:8px;
  }
  .test-error {
    margin:12px 0 0; padding:11px 13px; border-radius:8px; border:1px solid var(--bad);
    background:color-mix(in srgb, var(--bad) 8%, transparent);
    color:var(--bad); font-family:var(--mono); font-size:12px;
    white-space:pre-wrap; word-break:break-word; overflow-x:auto;
  }
  /* Deliberately quiet. Roughly a fifth of the suite asserts on process, file
     or logcat state and has no interface to photograph — that is normal, and
     the note should read as a footnote rather than as a missing screenshot. */
  .test-empty { color:var(--dim); font-size:11.5px; margin:10px 0 0; font-style:italic; opacity:.75; }
  .note { margin-top:12px; border:1px solid var(--line); border-radius:8px; background:var(--panel-2); }
  .note > summary { cursor:pointer; padding:8px 12px; font-family:var(--mono); font-size:12px; color:var(--dim); }
  .note pre { margin:0; padding:0 12px 12px; font-family:var(--mono); font-size:12px; white-space:pre-wrap; word-break:break-word; }

  /* ── Steps ──────────────────────────────────────────────── */
  .steps {
    list-style:none; margin:16px 0 0; padding:0;
    display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:16px;
  }
  .step { border:1px solid var(--line); border-radius:10px; overflow:hidden; background:var(--panel-2); }
  .step-head { display:flex; gap:8px; align-items:baseline; padding:9px 11px; }
  .step-n {
    font-family:var(--mono); font-size:10.5px; color:var(--dim);
    border:1px solid var(--line); border-radius:999px; padding:1px 6px; flex:0 0 auto;
  }
  /* Clamped so a long typed value can't push its card's screenshot out of line
     with the rest of the row. Full text stays available via the title tooltip. */
  .step-label {
    font-size:12.5px; word-break:break-word;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
  }
  .step-head { min-height:38px; }
  .step-detail { margin:0 11px 9px; font-family:var(--mono); font-size:11px; color:var(--dim); word-break:break-word; }
  .step-shot { display:block; width:100%; padding:0; border:0; border-top:1px solid var(--line); background:#000; cursor:zoom-in; }
  .step-shot img { display:block; width:100%; height:auto; }
  .step-noshot { margin:0 11px 11px; font-size:11.5px; color:var(--dim); }

  /* ── Lightbox ───────────────────────────────────────────── */
  dialog#lb { border:none; padding:0; background:transparent; max-width:96vw; max-height:96vh; }
  dialog#lb::backdrop { background:rgba(0,0,0,.86); }
  dialog#lb img { display:block; max-width:96vw; max-height:96vh; }

  .is-hidden { display:none !important; }

  @media (max-width: 900px) {
    .shell { grid-template-columns:1fr; }
    .sidebar { position:static; height:auto; border-right:none; border-bottom:1px solid var(--line); }
    .content { padding:20px 16px 60px; }
  }
</style>
</head>
<body>
<div class="shell">
  <nav class="sidebar">
    <p class="brand">${escapeHtml(title)}</p>
    <p class="brand-sub">${escapeHtml(stamp)}</p>
    <div class="totals">
      <span class="t-pass">${total.passed} passed</span>
      <span class="${total.failed ? "t-fail" : ""}">${total.failed} failed</span>
      <span>${total.steps} shots</span>
    </div>
    <input class="filter" id="filter" type="search" placeholder="Filter tests…" aria-label="Filter tests" />
    <label class="only-fails"><input type="checkbox" id="onlyFails" /> Failures only</label>
    ${renderSidebar(suites)}
  </nav>
  <main class="content">
    ${main || `<p>No results. Run a suite first.</p>`}
  </main>
</div>

<dialog id="lb"><img id="lbimg" alt="" /></dialog>

<script>
(function () {
  // Lightbox
  var lb = document.getElementById('lb'), lbimg = document.getElementById('lbimg');
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.step-shot');
    if (btn) { lbimg.src = btn.dataset.src; lb.showModal(); return; }
    if (e.target === lb || e.target === lbimg) lb.close();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && lb.open) lb.close(); });

  // Filter + failures-only, applied to both the sidebar and the content pane.
  var filter = document.getElementById('filter');
  var onlyFails = document.getElementById('onlyFails');
  function apply() {
    var q = filter.value.trim().toLowerCase();
    var failsOnly = onlyFails.checked;
    document.querySelectorAll('.test').forEach(function (el) {
      var t = el.querySelector('.test-title').textContent.toLowerCase();
      var ok = (!q || t.indexOf(q) >= 0) && (!failsOnly || el.dataset.status === 'failed');
      el.classList.toggle('is-hidden', !ok);
    });
    document.querySelectorAll('.nav-tests a').forEach(function (a) {
      var t = a.querySelector('.nav-test-title').textContent.toLowerCase();
      var ok = (!q || t.indexOf(q) >= 0) && (!failsOnly || a.dataset.status === 'failed');
      a.parentElement.classList.toggle('is-hidden', !ok);
    });
    // Hide file groups and nav files that ended up empty.
    document.querySelectorAll('.file-group').forEach(function (g) {
      var any = [].some.call(g.querySelectorAll('.test'), function (t) { return !t.classList.contains('is-hidden'); });
      g.classList.toggle('is-hidden', !any);
    });
    document.querySelectorAll('.nav-file').forEach(function (f) {
      var any = [].some.call(f.querySelectorAll('.nav-tests li'), function (li) { return !li.classList.contains('is-hidden'); });
      f.classList.toggle('is-hidden', !any);
      if (any && (q || failsOnly)) f.open = true;
    });
  }
  filter.addEventListener('input', apply);
  onlyFails.addEventListener('change', apply);

  // Highlight the sidebar entry for whichever test is on screen.
  var links = {};
  document.querySelectorAll('.nav-tests a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var a = links[entry.target.id];
      if (a) a.classList.toggle('is-current', entry.isIntersecting);
    });
  }, { rootMargin: '-10% 0px -75% 0px' });
  document.querySelectorAll('.test').forEach(function (t) { obs.observe(t); });
})();
</script>
</body>
</html>`;
}
