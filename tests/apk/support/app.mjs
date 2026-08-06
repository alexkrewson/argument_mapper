// Drives the running app inside the APK's WebView over CDP.
//
// Everything here is free — no AI calls. The one costly action (submitting a
// statement for analysis) lives in submitStatement(), used only by the @costly
// suite.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { adb, findAdb, openWebViewCdp, CdpSession, sleep, waitFor } from "./android.mjs";
import { redactValue } from "../../support/report-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.join(__dirname, "..", "..", "..");
export const PKG = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "capacitor.config.json"), "utf8"),
).appId;

export function loadTestEnv() {
  const file = path.join(repoRoot, ".env.test");
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

// Overridable so the suites can be pointed at a RELEASE build, which is what
// actually ships. apk-device.test.mjs already honoured APK_PATH; these suites
// did not, so "the tests pass" only ever meant "the debug build passes" —
// which says nothing about minification, shrinking or the release manifest.
//
//   APK_PATH=android/app/build/outputs/apk/release/app-release.apk npm run test:apk:all
const APK_PATH = process.env.APK_PATH
  ? path.resolve(process.env.APK_PATH)
  : path.join(repoRoot, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");

/**
 * Push the freshly built APK before relaunching.
 *
 * `build:apk` builds but does not install, and only apk-device installs as part
 * of its own setup. Without this, running a suite on its own silently tests
 * whatever build happens to be on the device — which looks like a failing
 * assertion about missing UI rather than a stale install.
 */
function installCurrentApk() {
  if (!fs.existsSync(APK_PATH)) return "no-apk";
  const res = adb(["install", "-r", "-d", APK_PATH], { timeout: 300_000 });
  if (res.status === 0) return "installed";

  // `adb install -r` cannot change an app's signing key, so switching between
  // a debug build and a release one fails here rather than at the assertion
  // that eventually notices. Uninstalling first is the only way across, and
  // it is safe: this is a test device and the app keeps nothing locally that
  // matters (session included -- the suites sign in).
  const output = `${res.stderr || ""}${res.stdout || ""}`;
  if (output.includes("INSTALL_FAILED_UPDATE_INCOMPATIBLE")) {
    adb(["uninstall", PKG]);
    const retry = adb(["install", "-r", "-d", APK_PATH], { timeout: 300_000 });
    if (retry.status === 0) return "installed-after-uninstall";
    return `install-failed: ${retry.stderr || retry.stdout}`;
  }
  return `install-failed: ${output}`;
}

/** Present on every screen, signed in or out — so it means "the UI is up". */
const READY_MARKER = "settings-btn";

export async function connect({ relaunch = false, install = relaunch } = {}) {
  if (install) {
    const result = installCurrentApk();
    if (result.startsWith("install-failed")) throw new Error(result);
  }
  if (relaunch) {
    adb(["shell", "am", "force-stop", PKG]);
    await sleep(1200);
    adb(["shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1"]);
    await sleep(2500);
  }

  // The WebView appears a little after the process does, so reaching for CDP
  // once can miss it on a loaded emulator.
  const url = await waitFor(() => openWebViewCdp(PKG), {
    what: `the app's WebView over CDP (${PKG}) — the process may have died before rendering`,
    timeout: 30_000,
    interval: 1000,
  });

  const app = instrument(new App(new CdpSession(url, PKG)));
  if (!relaunch) return app;

  // This used to be a flat 8s sleep after launch, and it was the single
  // largest source of false failures in these suites — four separate red runs
  // on 2026-08-03 alone, surfacing as "settings-btn not found" inside signIn()
  // or as a readyState assertion, none of which named the real cause. A cold
  // start on a busy emulator is simply not a fixed cost. Wait for the UI to
  // actually exist instead; a genuinely broken build still fails, just with a
  // message that says so.
  await waitFor(() => app.exists(READY_MARKER), {
    what:
      `[data-testid="${READY_MARKER}"] to render — the WebView is up, so this is a ` +
      "render/bundle failure rather than a slow start",
    timeout: 45_000,
    interval: 1000,
  });
  return app;
}

// ── Step capture ────────────────────────────────────────────────────────────
//
// Every device action goes through App, so instrumenting these five methods
// gives the report a screenshot per step for all the APK suites at once — no
// per-test bookkeeping, and nothing to remember when writing a new test.
// Composite helpers (signIn, addNode, newDebate) call these internally, so
// their sub-steps get captured too, which is usually what you want when a
// multi-stage helper is the thing that broke.
//
// The recorder is whatever screenshotter() most recently created, and each
// step is timestamped so report.mjs can file it against the test that was
// running at the time — node:test has no "current test" handle to ask.
//
// REPORT_STEPS=0 switches this off. Worth doing when iterating on one suite:
// each screencap is roughly half a second over adb, so full capture adds a
// minute or two to a complete run.

const AUTO_CAPTURE = {
  click: (id) => `Tap ${friendly(id)}`,
  setValue: (id, value) => `Type into ${friendly(id)} — "${truncate(redactValue(id, value))}"`,
  selectValue: (id, value) => `Choose "${truncate(value)}" in ${friendly(id)}`,
  tapNode: (id) => (id ? `Open node ${id}` : "Open the first node"),
  pickTheme: (name) => `Pick the ${name} theme`,
};

const truncate = (v) => (String(v).length > 60 ? `${String(v).slice(0, 57)}…` : String(v));
const friendly = (id) => String(id).replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

let recorder = null;

function instrument(app) {
  if (process.env.REPORT_STEPS === "0") return app;
  for (const [name, describe] of Object.entries(AUTO_CAPTURE)) {
    const original = app[name].bind(app);
    app[name] = async (...args) => {
      const result = await original(...args);
      try {
        recorder?.(describe(...args));
      } catch {
        // A missing frame is not worth failing a device test over.
      }
      return result;
    };
  }
  return app;
}

const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;

export class App {
  constructor(session) {
    this.session = session;
  }

  eval(expr, opts) {
    return this.session.evaluate(expr, opts);
  }

  close() {
    this.session.close();
  }

  tid(id) {
    return `[data-testid="${id}"]`;
  }

  exists(id) {
    return this.eval(`!!${q(this.tid(id))}`);
  }

  async click(id) {
    const r = await this.eval(`(() => { const e = ${q(this.tid(id))};
      if (!e) return 'missing'; e.click(); return 'ok'; })()`);
    if (r === "missing") throw new Error(`click: [data-testid="${id}"] not found`);
    return r;
  }

  /** React-controlled inputs ignore a plain .value assignment. */
  async setValue(id, value) {
    const r = await this.eval(`(() => {
      const el = ${q(this.tid(id))};
      if (!el) return 'missing';
      const Proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(Proto.prototype, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'ok';
    })()`);
    if (r === "missing") throw new Error(`setValue: [data-testid="${id}"] not found`);
    await sleep(250);
    return r;
  }

  async selectValue(id, value) {
    return this.eval(`(() => {
      const el = ${q(this.tid(id))};
      if (!el) return 'missing';
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.value;
    })()`);
  }

  bodyText() {
    return this.eval(`(document.body.innerText || '').trim()`);
  }

  /** Reaches the live cytoscape instance the way the plugin registers it. */
  cy(expr) {
    return this.eval(`(() => {
      let cy = null;
      for (const el of document.querySelectorAll('div')) if (el._cyreg?.cy) { cy = el._cyreg.cy; break; }
      if (!cy) return null;
      return ${expr};
    })()`);
  }

  async nodeCount() {
    return Number(await this.cy("cy.nodes().length"));
  }

  async nodeIds() {
    return JSON.parse((await this.cy("JSON.stringify(cy.nodes().map(n => n.id()))")) || "[]");
  }

  /** Opens the detail popup for a node by id (or the first node). */
  async tapNode(id = null) {
    const r = await this.cy(
      id
        ? `(() => { const n = cy.getElementById(${JSON.stringify(id)}); if (!n || !n.length) return 'missing'; n.emit('tap'); return 'ok'; })()`
        : `(() => { const ns = cy.nodes(); if (!ns.length) return 'missing'; ns[0].emit('tap'); return 'ok'; })()`,
    );
    await sleep(1500);
    return r;
  }

  async isSignedIn() {
    return this.exists("tab-history");
  }

  async signIn(email, password) {
    // Auth restore lands AFTER first paint. connect() returns the moment
    // READY_MARKER exists, but isSignedIn() can only see tab-history, which was
    // measured 104ms and 210ms behind it on two cold starts here. Asking once
    // lands inside that window often enough to kill a before() hook, and the
    // failure is maximally misleading: an app that IS signed in goes hunting
    // for a sign-in modal, finds none of the three routes, and reports
    // "sign-in modal did not open" — which reads like a broken auth UI.
    // Costs the full window only when genuinely signed out, once per suite.
    //
    // The timeout is swallowed because "still signed out after 5s" is the
    // ordinary case here, not a failure — it just means we go on to open the
    // form below.
    const already = await waitFor(() => this.isSignedIn(), {
      what: "the restored session to appear (tab-history)",
      timeout: 5000,
    }).catch(() => false);
    if (already) return "already";

    // The form reaches the screen three different ways depending on where the
    // app was left: already inline, behind the ACCOUNT section, or via the
    // gate that fires on a submit attempt.
    if (!(await this.exists("auth-submit"))) {
      await this.openSettings();
      if (await this.exists("settings-account-toggle") && !(await this.exists("settings-signin-open"))) {
        await this.click("settings-account-toggle");
        await sleep(900);
      }
      if (await this.exists("settings-signin-open")) {
        await this.click("settings-signin-open");
        await sleep(1200);
      }
    }
    if (!(await this.exists("auth-submit"))) {
      await this.closeSettings();
      await this.click("tab-map");
      await sleep(600);
      await this.setValue("statement-textarea", "sign-in trigger");
      await this.click("statement-submit");
      await sleep(2500);
    }
    if (!(await this.exists("auth-submit"))) throw new Error("sign-in modal did not open");
    await this.setValue("auth-email", email);
    await this.setValue("auth-password", password);
    await this.click("auth-submit");

    // Deliberately NOT waitFor(): this loop has a fail-fast arm, and waitFor
    // treats a throwing probe as "not yet". A rejected password would be
    // swallowed and reported 25s later as a timeout instead of as the rejection
    // it is. When a wait has a second exit condition, hand-roll it.
    //
    // Poll rather than sleeping once and checking. A fixed 6s wait was enough
    // on a freshly booted emulator and not enough on a loaded one, which made
    // whole suites fail in their before() hook — 37 tests cancelled by one
    // slow network round trip, reported as "sign-in did not complete" with no
    // hint that the cause was timing. A real rejection still fails fast,
    // because auth-error is checked every pass.
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      const err = await this.eval(`${q('[data-testid="auth-error"]')}?.innerText ?? ''`);
      if (err) throw new Error(`sign-in failed: ${err}`);
      if (await this.isSignedIn()) return "ok";
      await sleep(1000);
    }
    throw new Error("sign-in did not complete within 25s");
  }

  /** Free — places a node directly, no AI call, no credit spend. */
  async addNode(content, type = null) {
    await this.click("tab-map");
    await sleep(600);
    await this.click("ctrl-add-node");
    await sleep(1500);
    if (!(await this.exists("node-edit-content"))) throw new Error("add-node popup did not open");
    await this.setValue("node-edit-content", content);
    if (type) await this.selectValue("node-edit-type", type);
    const before = await this.nodeIds();
    await this.click("node-edit-save");
    await sleep(2500);
    const after = await this.nodeIds();
    const added = after.filter((id) => !before.includes(id));
    return added[0] ?? null;
  }

  async deleteNode(id) {
    await this.tapNode(id);
    if (!(await this.exists("node-delete-btn"))) return "no-delete-btn";
    await this.click("node-delete-btn");
    await sleep(900);
    if (await this.exists("node-delete-confirm-btn")) await this.click("node-delete-confirm-btn");
    await sleep(2000);
    return "ok";
  }

  async closePopup() {
    if (await this.exists("node-edit-cancel")) {
      await this.click("node-edit-cancel");
      await sleep(900);
    }
    if (await this.exists("node-view-close-btn")) {
      await this.click("node-view-close-btn");
      await sleep(900);
    }
  }

  /** Settings dropdown latches open; always pair open with close. */
  async closeSettings() {
    if (await this.exists("settings-dropdown")) {
      await this.click("settings-btn");
      await sleep(800);
    }
  }

  async openSettings() {
    if (!(await this.exists("settings-dropdown"))) {
      await this.click("settings-btn");
      await sleep(900);
    }
  }

  /**
   * Section toggles latch and their state survives across runs, so a blind
   * click is as likely to collapse as expand. Drive to the wanted state by
   * checking for a child that only exists while expanded.
   */
  async ensureSection(toggleId, childId) {
    await this.openSettings();
    if (await this.exists(childId)) return "already";
    await this.click(toggleId);
    await sleep(900);
    if (!(await this.exists(childId))) throw new Error(`${toggleId} did not reveal ${childId}`);
    return "expanded";
  }

  /** The input placeholder is the reliable carrier of the active speaker name. */
  async turnPlaceholder() {
    return this.eval(`${q('[data-testid="statement-textarea"]')}?.placeholder ?? null`);
  }

  async speakerName() {
    const p = await this.turnPlaceholder();
    const m = p && p.match(/^(.+?),\s/);
    return m ? m[1] : null;
  }

  /** Node payload straight from cytoscape — the source of truth for attribution. */
  async nodeData(id) {
    const raw = await this.cy(`JSON.stringify(cy.getElementById(${JSON.stringify(id)}).data())`);
    return raw ? JSON.parse(raw) : null;
  }

  async allNodeData() {
    return JSON.parse((await this.cy("JSON.stringify(cy.nodes().map(n => n.data()))")) || "[]");
  }

  async themeState() {
    return JSON.parse(
      await this.eval(`JSON.stringify({
        dark: document.documentElement.getAttribute('data-dark'),
        lcars: document.documentElement.getAttribute('data-lcars'),
      })`),
    );
  }

  /** Theme presets carry no testid; match on the "Name\nAccent · Accent" card text. */
  async themeCards() {
    return JSON.parse(
      await this.eval(`JSON.stringify([...document.querySelectorAll('button,[role=button]')]
        .map(e => (e.innerText || '').trim())
        .filter(t => /·/.test(t))
        .map(t => t.split('\\n')[0].trim()))`),
    );
  }

  async pickTheme(name) {
    const r = await this.eval(`(() => {
      const el = [...document.querySelectorAll('button,[role=button]')]
        .find(e => /·/.test(e.innerText || '') && (e.innerText||'').trim().split('\\n')[0].trim() === ${JSON.stringify(name)});
      if (!el) return 'missing'; el.click(); return 'ok';
    })()`);
    await sleep(1200);
    return r;
  }

  async concede(id) {
    await this.tapNode(id);
    if (!(await this.exists("node-concede-btn"))) return "no-concede-btn";
    const label = await this.eval(`${q('[data-testid="node-concede-btn"]')}?.innerText`);
    await this.click("node-concede-btn");
    await sleep(2500);
    await this.closePopup();
    return label;
  }

  async concedeLabel(id) {
    await this.tapNode(id);
    const label = await this.eval(`${q('[data-testid="node-concede-btn"]')}?.innerText ?? null`);
    const canEdit = await this.exists("node-view-edit-btn");
    await this.closePopup();
    return { label, canEdit };
  }

  /** Clears the map so a suite starts from a known state. */
  async newDebate() {
    await this.closeSettings();
    if (await this.exists("tab-history")) {
      await this.click("tab-history");
      await sleep(1500);
      if (await this.exists("history-new-argument")) {
        await this.click("history-new-argument");
        await sleep(2500);
      }
    }
    await this.click("tab-map");
    await sleep(1200);
    return this.nodeCount();
  }

  /** COSTLY — real Claude call, real credit spend. */
  async submitStatement(text, { timeoutMs = 120_000 } = {}) {
    await this.click("tab-map");
    await sleep(500);
    await this.setValue("statement-textarea", text);
    const before = await this.nodeCount();
    await this.click("statement-submit");

    // Hand-rolled for the same reason as signIn's completion loop: the
    // auth-submit arm has to fail fast, and waitFor reads a throwing probe as
    // "not yet".
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(3000);
      if (await this.exists("auth-submit")) throw new Error("submit was rejected — not signed in");
      const now = await this.nodeCount();
      if (now > before) return { before, after: now };
    }
    throw new Error(`no new nodes within ${timeoutMs}ms`);
  }
}

/**
 * Screenshot helper writing into test-results/apk/<group>/.
 *
 * Also registers itself as the active step recorder (see instrument() above)
 * and appends a timestamped line to steps.jsonl, which is how report.mjs pairs
 * each frame with the test that produced it. Explicit shot("label") calls and
 * auto-captured actions go through the same path, so they interleave in the
 * report in the order they actually happened.
 */
export function screenshotter(group) {
  const dir = path.join(repoRoot, "test-results", "apk", group);
  fs.mkdirSync(dir, { recursive: true });
  const log = path.join(repoRoot, "test-results", "apk", "steps.jsonl");
  let n = 0;

  const shoot = (label) => {
    const safe = String(label).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60);
    const name = `${String(++n).padStart(3, "0")}-${safe}.png`;
    const file = path.join(dir, name);
    const r = spawnSync(findAdb(), ["exec-out", "screencap", "-p"], {
      maxBuffer: 64 * 1024 * 1024,
      encoding: "buffer",
    });
    const ok = r.status === 0 && r.stdout?.length > 1000;
    if (ok) fs.writeFileSync(file, r.stdout);
    fs.appendFileSync(
      log,
      `${JSON.stringify({ ts: Date.now(), group, label: String(label), file: ok ? `${group}/${name}` : null })}\n`,
    );
    return ok ? file : null;
  };

  recorder = shoot;
  return shoot;
}
