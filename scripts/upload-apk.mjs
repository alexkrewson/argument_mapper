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

const mb = (fs.statSync(file).size / 1024 / 1024).toFixed(2);
say(`uploading ${file} (${mb} MB) to ${REMOTE}:${DEST}`);

const res = spawnSync("rclone", ["copy", file, `${REMOTE}:${DEST}`, "--stats-one-line"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (res.status !== 0) {
  say(`rclone exited ${res.status} — upload failed, continuing anyway`);
  process.exit(0);
}
say("uploaded");
