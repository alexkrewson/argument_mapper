// Cross-platform Gradle wrapper launcher.
//
// npm scripts run under cmd.exe on Windows and sh elsewhere, so a literal
// "cd android && ./gradlew" only works on Linux/macOS. This picks the right
// wrapper for the platform and forwards every argument through to it.
//
//   node scripts/gradlew.mjs assembleDebug

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const androidDir = path.join(__dirname, "..", "android");
const isWindows = process.platform === "win32";
// Absolute path: with shell:true, cmd resolves a bare name against PATH, not cwd.
const wrapper = path.join(androidDir, isWindows ? "gradlew.bat" : "gradlew");

const result = spawnSync(wrapper, process.argv.slice(2), {
  cwd: androidDir,
  stdio: "inherit",
  shell: isWindows,
});

if (result.error) {
  console.error(`Failed to run ${wrapper}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
