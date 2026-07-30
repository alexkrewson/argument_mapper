// Confirms the live site is actually serving the current local build.
//
// A Cloudflare deploy can report success while the site keeps serving a cached
// or older bundle, and a failed Git-triggered build is completely silent from
// outside. Comparing the entry-bundle filename is the cheapest honest check:
// Vite hashes it by content, so a match means the deployed JS is the JS we
// just built.
//
//   npm run deploy:verify

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, "..", "dist");
const SITE = process.env.DEPLOY_URL || "https://idisagree.trolleysolution.com/";
const ATTEMPTS = 12;
const GAP_MS = 15_000;

const entryOf = (html) => {
  const m = html.match(/<script[^>]+src="[^"]*?assets\/(index-[A-Za-z0-9_-]+\.js)"/);
  return m ? m[1] : null;
};

if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("no dist/index.html — run `npm run build` first");
  process.exit(1);
}

const expected = entryOf(fs.readFileSync(path.join(dist, "index.html"), "utf8"));
if (!expected) {
  console.error("could not find the entry bundle in dist/index.html");
  process.exit(1);
}
console.log(`expecting: ${expected}`);

for (let i = 1; i <= ATTEMPTS; i++) {
  let live = null;
  try {
    const res = await fetch(SITE, { cache: "no-store", headers: { "cache-control": "no-cache" } });
    live = entryOf(await res.text());
  } catch (err) {
    console.log(`  ${i}/${ATTEMPTS} fetch failed: ${err.message}`);
  }

  if (live === expected) {
    console.log(`live matches after ~${((i - 1) * GAP_MS) / 1000}s — deploy confirmed`);
    process.exit(0);
  }
  console.log(`  ${i}/${ATTEMPTS} live=${live ?? "?"} — waiting`);
  if (i < ATTEMPTS) await new Promise((r) => setTimeout(r, GAP_MS));
}

console.error(
  `\nlive site never served ${expected}.\n` +
    "The deploy did not take effect. Check the Cloudflare Pages build log for\n" +
    "project 'idisagree' — a Git-triggered build that fails is silent from here.",
);
process.exit(1);
