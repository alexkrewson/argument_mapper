// Uploads a built APK/AAB to Google Drive via rclone.
//
// Invoked from android/app/build.gradle after assembleDebug / assembleRelease /
// bundleRelease. Replaces the old android/upload-apk.sh, which hardcoded bash
// and so could never run on Windows.
//
// No-ops (exit 0) when rclone or the remote isn't configured — a missing upload
// must never fail a build.
//
//   node scripts/upload-apk.mjs <path-to-apk>

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Gradle's exec runs from the Android project directory, not the repo root, so
// nothing here may be resolved relative to cwd. Anchor on this file instead.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const REMOTE = "gdrive";
const DEST = "AndroidBuilds/argument_mapper/";

const file = process.argv[2];
const say = (m) => console.log(`upload-apk: ${m}`);

if (!file || !fs.existsSync(file)) {
  say(`no such file: ${file ?? "(no argument)"} — skipping`);
  process.exit(0);
}

const rclone = spawnSync("rclone", ["version"], { encoding: "utf8", shell: process.platform === "win32" });
if (rclone.status !== 0) {
  say("rclone not on PATH — skipping upload (install rclone and run: rclone config)");
  process.exit(0);
}

const remotes = spawnSync("rclone", ["listremotes"], { encoding: "utf8", shell: process.platform === "win32" });
if (!(remotes.stdout || "").split(/\r?\n/).includes(`${REMOTE}:`)) {
  say(`remote "${REMOTE}:" not configured — skipping upload (run: rclone config)`);
  process.exit(0);
}

/**
 * Every build used to land on the same app-debug.apk, so Drive held exactly one
 * artifact and there was no way to match a tester's report to the build they
 * actually had. Uploads are now named
 *
 *     app-debug-v2-20260803-1146-d2b02fc.apk
 *
 * — versionCode, timestamp, and the commit it was built from. Sorting by name
 * gives chronological order, and the sha is what makes "which build was this?"
 * answerable months later. Anything unavailable is simply left out of the name
 * rather than guessed at.
 */
function buildStamp() {
  const parts = [];

  try {
    const gradle = fs.readFileSync(path.join(repoRoot, "android/app/build.gradle"), "utf8");
    const code = gradle.match(/versionCode\s+(\d+)/)?.[1];
    if (code) parts.push(`v${code}`);
  } catch {
    /* build.gradle moved or unreadable — omit rather than guess */
  }

  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  parts.push(
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`,
  );

  const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
    cwd: repoRoot,
    shell: process.platform === "win32",
  });
  if (sha.status === 0 && sha.stdout.trim()) {
    const dirty = spawnSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
      cwd: repoRoot,
      shell: process.platform === "win32",
    });
    // A build from a dirty tree does not correspond to any commit, and saying
    // so is the whole point — an unmarked sha would be a lie.
    parts.push(sha.stdout.trim() + (dirty.stdout?.trim() ? "-dirty" : ""));
  }

  return parts.join("-");
}

const ext = path.extname(file);
const target = `${path.basename(file, ext)}-${buildStamp()}${ext}`;

const mb = (fs.statSync(file).size / 1024 / 1024).toFixed(2);
say(`uploading ${file} (${mb} MB) to ${REMOTE}:${DEST}${target}`);

const res = spawnSync(
  "rclone",
  ["copyto", file, `${REMOTE}:${DEST}${target}`, "--stats-one-line"],
  { stdio: "inherit", shell: process.platform === "win32" },
);

if (res.status !== 0) {
  say(`rclone exited ${res.status} — upload failed, continuing anyway`);
  process.exit(0);
}
say("uploaded");
