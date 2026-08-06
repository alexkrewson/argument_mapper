// Shared helpers for the device-level APK suite: locating the Android SDK,
// driving adb, and talking to the app's WebView over the Chrome DevTools
// Protocol.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const isWindows = process.platform === "win32";
const exe = (name) => (isWindows ? `${name}.exe` : name);

/** Candidate Android SDK roots, most explicit first. */
function sdkCandidates() {
  const home = os.homedir();
  return [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    isWindows ? path.join(home, "AppData", "Local", "Android", "Sdk") : null,
    path.join(home, "Android", "Sdk"),
    path.join(home, "Library", "Android", "sdk"),
  ].filter(Boolean);
}

export function findSdk() {
  for (const root of sdkCandidates()) {
    if (fs.existsSync(path.join(root, "platform-tools", exe("adb")))) return root;
  }
  return null;
}

export function findAdb() {
  const sdk = findSdk();
  return sdk ? path.join(sdk, "platform-tools", exe("adb")) : null;
}

/** Newest build-tools dir, used for apksigner/aapt2. */
export function findBuildTools() {
  const sdk = findSdk();
  if (!sdk) return null;
  const dir = path.join(sdk, "build-tools");
  if (!fs.existsSync(dir)) return null;
  const versions = fs
    .readdirSync(dir)
    .filter((d) => fs.statSync(path.join(dir, d)).isDirectory())
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return versions.length ? path.join(dir, versions[0]) : null;
}

export function adb(args, { timeout = 120_000 } = {}) {
  const bin = findAdb();
  if (!bin) throw new Error("adb not found — is the Android SDK installed?");
  const res = spawnSync(bin, args, { encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 });
  return {
    status: res.status,
    stdout: (res.stdout || "").trim(),
    stderr: (res.stderr || "").trim(),
  };
}

/** Device serials in the `device` state (excludes offline/unauthorized). */
export function connectedDevices() {
  const bin = findAdb();
  if (!bin) return [];
  const { stdout } = adb(["devices"]);
  return stdout
    .split("\n")
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length >= 2 && p[1] === "device")
    .map((p) => p[0]);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll `probe` until it returns something truthy, or give up and throw.
 *
 * THIS EXISTS BECAUSE THE SAME BUG HAS BEEN WRITTEN FOUR TIMES IN THESE SUITES,
 * and every instance reported itself as something else:
 *
 *   - an 8s sleep after launch          -> "settings-btn not found", read as a
 *                                          broken build (2026-08-03, four red
 *                                          runs, most of a day)
 *   - a 220s budget for a combined run  -> read as a product bug; the same
 *                                          conversation later passed in 1.7m
 *   - waiting for a CDP target to exist -> "blank screen", on an app that had
 *                                          simply not finished mounting
 *   - asking isSignedIn() once          -> "sign-in modal did not open", on an
 *                                          app that was already signed in
 *
 * Each was an assertion racing a state that was still settling, and none of the
 * messages pointed at timing. The rule that would have prevented all four: wait
 * on the condition you are about to assert, not on something that usually
 * happens near it.
 *
 * `what` is not decoration — it becomes the timeout message, so the failure says
 * which condition never arrived. A helper that throws "timed out" reintroduces
 * exactly the diagnosis problem this exists to remove.
 *
 * Returns the probe's value, so `const el = await waitFor(...)` works. A probe
 * that throws is treated as "not yet": transient CDP errors during startup are
 * the normal case, not a reason to abort.
 */
export async function waitFor(probe, { what, timeout = 30_000, interval = 250 } = {}) {
  if (!what) throw new Error("waitFor needs a `what` — the timeout message depends on it");
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await probe();
      if (last) return last;
    } catch {
      last = undefined;
    }
    await sleep(interval);
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${what}`);
}

/**
 * Locate the debuggable WebView belonging to `pkg`, forward it to a local TCP
 * port, and return its CDP websocket URL.
 *
 * Only works on debug builds — release APKs disable WebView debugging, so
 * callers should treat a null return as "not inspectable", not "broken".
 */
export async function openWebViewCdp(pkg, localPort = 9222) {
  const { stdout: sockets } = adb(["shell", "cat", "/proc/net/unix"]);
  const match = sockets
    .split("\n")
    .map((l) => l.match(/@?(webview_devtools_remote_(\d+))/))
    .filter(Boolean)
    .map((m) => ({ name: m[1], pid: m[2] }));

  if (!match.length) return null;

  // Prefer the socket whose pid belongs to our package.
  const { stdout: psOut } = adb(["shell", "ps", "-A"]);
  const ourPids = psOut
    .split("\n")
    .filter((l) => l.includes(pkg))
    .map((l) => l.trim().split(/\s+/)[1]);

  const target = match.find((m) => ourPids.includes(m.pid)) || match[0];

  adb(["forward", "--remove", `tcp:${localPort}`]);
  const fwd = adb(["forward", `tcp:${localPort}`, `localabstract:${target.name}`]);
  if (fwd.status !== 0) return null;

  // The DevTools endpoint needs a moment after forwarding.
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${localPort}/json/list`);
      const pages = await res.json();
      const page = pages.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // endpoint not up yet
    }
    await sleep(500);
  }
  return null;
}

/**
 * A persistent CDP connection.
 *
 * One socket per evaluation exhausts the DevTools endpoint after a few hundred
 * calls and starts timing out mid-suite, so hold the socket open and multiplex
 * on message id, reconnecting only when it actually drops.
 */
export class CdpSession {
  constructor(wsUrl, pkg = null) {
    this.wsUrl = wsUrl;
    this.pkg = pkg;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  #open() {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(this.wsUrl);
      } catch (e) {
        return reject(new Error(`CDP socket create failed: ${e.message}`));
      }
      const timer = setTimeout(() => reject(new Error("CDP connect timeout")), 15_000);

      ws.addEventListener("open", () => {
        clearTimeout(timer);
        this.ws = ws;
        resolve();
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        if (this.ws === ws) this.ws = null;
        reject(new Error("CDP socket error"));
      });
      ws.addEventListener("close", () => {
        if (this.ws === ws) this.ws = null;
        for (const [, p] of this.pending) p.reject(new Error("CDP socket closed"));
        this.pending.clear();
      });
      ws.addEventListener("message", (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`CDP error: ${JSON.stringify(msg.error)}`));
        else p.resolve(msg.result);
      });
    });
  }

  async #ensure() {
    if (this.ws && this.ws.readyState === 1) return;
    try {
      await this.#open();
    } catch (e) {
      // The WebView may have been recreated (relaunch, tab churn) — re-resolve.
      if (!this.pkg) throw e;
      const fresh = await openWebViewCdp(this.pkg);
      if (!fresh) throw e;
      this.wsUrl = fresh;
      await this.#open();
    }
  }

  async #send(method, params, timeout) {
    await this.#ensure();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timeout after ${timeout}ms`));
      }, timeout);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  async evaluate(expression, { timeout = 30_000 } = {}) {
    const params = { expression, returnByValue: true, awaitPromise: true };
    let res;
    try {
      res = await this.#send("Runtime.evaluate", params, timeout);
    } catch (e) {
      if (!/closed|timeout|socket/i.test(e.message)) throw e;
      this.ws = null; // one reconnect-and-retry
      res = await this.#send("Runtime.evaluate", params, timeout);
    }
    const r = res?.result;
    if (r?.subtype === "error") throw new Error(`Eval threw: ${r.description}`);
    return r?.value;
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* already gone */
    }
    this.ws = null;
  }
}

/** One-shot evaluate. Prefer CdpSession when making many calls. */
export async function cdpEvaluate(wsUrl, expression, { timeout = 15_000 } = {}) {
  const ws = new WebSocket(wsUrl);
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP connect timeout")), timeout);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener("error", (e) => {
        clearTimeout(timer);
        reject(new Error(`CDP socket error: ${e.message ?? "unknown"}`));
      });
    });

    const id = Math.floor(Math.random() * 1e6);
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP evaluate timeout")), timeout);
      ws.addEventListener("message", (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id !== id) return;
        clearTimeout(timer);
        if (msg.error) return reject(new Error(`CDP error: ${JSON.stringify(msg.error)}`));
        const r = msg.result?.result;
        if (r?.subtype === "error") return reject(new Error(`Eval threw: ${r.description}`));
        resolve(r?.value);
      });
      ws.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      );
    });
    return result;
  } finally {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }
}
