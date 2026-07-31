// Bumps the Android versionCode (and optionally versionName) in
// android/app/build.gradle.
//
// Play rejects any upload whose versionCode isn't strictly greater than the
// last one, and the failure only surfaces at upload time. Keeping the source of
// truth in build.gradle where Android expects it, rather than deriving it from
// git — rebases and squashes can make a commit count go backwards.
//
//   npm run version:bump              1 -> 2
//   npm run version:bump -- 1.1.0     1 -> 2, versionName "1.1.0"

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRADLE = path.join(__dirname, "..", "android", "app", "build.gradle");

let src = fs.readFileSync(GRADLE, "utf8");

const codeMatch = src.match(/versionCode\s+(\d+)/);
if (!codeMatch) {
  console.error("could not find versionCode in android/app/build.gradle");
  process.exit(1);
}
const current = Number(codeMatch[1]);
const next = current + 1;
src = src.replace(/versionCode\s+\d+/, `versionCode ${next}`);

const newName = process.argv[2];
let nameNote = "";
if (newName) {
  if (!/^\d+\.\d+(\.\d+)?$/.test(newName)) {
    console.error(`versionName "${newName}" should look like 1.2 or 1.2.3`);
    process.exit(1);
  }
  const nameMatch = src.match(/versionName\s+"([^"]+)"/);
  src = src.replace(/versionName\s+"[^"]+"/, `versionName "${newName}"`);
  nameNote = `, versionName ${nameMatch ? nameMatch[1] : "?"} -> ${newName}`;
}

fs.writeFileSync(GRADLE, src, "utf8");
console.log(`versionCode ${current} -> ${next}${nameNote}`);
console.log("Remember: Play requires this to increase on every upload.");
