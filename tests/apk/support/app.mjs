// Drives the running app inside the APK's WebView over CDP.
//
// Everything here is free — no AI calls. The one costly action (submitting a
// statement for analysis) lives in submitStatement(), used only by the @costly
// suite.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { adb, findAdb, openWebViewCdp, CdpSession, sleep } from "./android.mjs";

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

const APK_PATH = path.join(
  repoRoot, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk",
);

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
  return res.status === 0 ? "installed" : `install-failed: ${res.stderr || res.stdout}`;
}

export async function connect({ relaunch = false, install = relaunch } = {}) {
  if (install) {
    const result = installCurrentApk();
    if (result.startsWith("install-failed")) throw new Error(result);
  }
  if (relaunch) {
    adb(["shell", "am", "force-stop", PKG]);
    await sleep(1200);
    adb(["shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1"]);
    await sleep(8000);
  }
  const url = await openWebViewCdp(PKG);
  if (!url) throw new Error("could not reach the app WebView over CDP");
  return new App(new CdpSession(url, PKG));
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
    if (await this.isSignedIn()) return "already";

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
    await sleep(6000);
    const err = await this.eval(`${q('[data-testid="auth-error"]')}?.innerText ?? ''`);
    if (err) throw new Error(`sign-in failed: ${err}`);
    if (!(await this.isSignedIn())) throw new Error("sign-in did not complete");
    return "ok";
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

/** Screenshot helper writing into test-results/apk/<group>/. */
export function screenshotter(group) {
  const dir = path.join(repoRoot, "test-results", "apk", group);
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  return (label) => {
    const file = path.join(dir, `${String(++n).padStart(2, "0")}-${label}.png`);
    const r = spawnSync(findAdb(), ["exec-out", "screencap", "-p"], {
      maxBuffer: 64 * 1024 * 1024,
      encoding: "buffer",
    });
    if (r.status === 0 && r.stdout?.length > 1000) {
      fs.writeFileSync(file, r.stdout);
      return file;
    }
    return null;
  };
}
