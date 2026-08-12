/**
 * capture-store-screenshots.mjs — produce the Play Store screenshots from the
 * real app, at whatever form factor Play asks for.
 *
 * The phone set was captured ad hoc on 2026-08-09 and the script was never kept,
 * so when the tablet sizes turned out to need their own aspect ratio there was
 * nothing to re-run. Hence this file: the screenshots are a build artifact, and
 * a build artifact you cannot reproduce is a liability the first time the UI
 * changes.
 *
 *   node scripts/capture-store-screenshots.mjs            # every form factor
 *   node scripts/capture-store-screenshots.mjs tablet7    # just one
 *
 * Play's constraints, which are why the sizes are what they are:
 *   phone     no ratio constraint in practice; 1080x2400 matches the Pixel 6
 *   tablet7   16:9 or 9:16, each side 320-3840   -> 1080x1920
 *   tablet10  16:9 or 9:16, each side 1080-7680  -> 1440x2560
 *
 * Requires the dev server (npm run dev) and .env.test for the account whose
 * History holds the argument being photographed.
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.CAPTURE_BASE_URL || "http://localhost:5173/";
const OUT = path.resolve("store-screenshots");

const FORM_FACTORS = {
  phone:    { width: 1080, height: 2400, dsf: 3, prefix: "" },
  tablet7:  { width: 1080, height: 1920, dsf: 2, prefix: "tablet7-" },
  tablet10: { width: 1440, height: 2560, dsf: 2, prefix: "tablet10-" },
};

/** The one deliberate edit to what the app really shows.
 *
 *  `.cost-estimate` is the per-turn price under Submit. It is real UI and it is
 *  correct on the web — but Android has no purchase path at all, by design,
 *  because steering to an external payment is the part of Play's Payments policy
 *  with teeth. A reviewer seeing a price with no way to pay it is a question we
 *  do not need to invite. Delete this block and the screenshots show the app
 *  exactly as built. */
const HIDE_PRICE = ".cost-estimate { visibility: hidden !important; }";

/** Whose History gets photographed.
 *
 *  CAPTURE_EMAIL / CAPTURE_PASSWORD win; .env.test is the fallback. They are
 *  separate on purpose: .env.test belongs to the suite, and on 2026-08-12 its
 *  credentials did not sign in at all — no error shown, just a signed-out app —
 *  while the account holding the real arguments did. The suite never noticed
 *  because its auth specs assert the form renders rather than completing a
 *  login. So do not assume .env.test works just because tests are green. */
function creds() {
  if (process.env.CAPTURE_EMAIL) {
    return { email: process.env.CAPTURE_EMAIL, password: process.env.CAPTURE_PASSWORD };
  }
  const env = readFileSync(".env.test", "utf8");
  const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
  return { email: get("TEST_USER_EMAIL"), password: get("TEST_USER_PASSWORD") };
}

/** Selectors come from the same data-testids the web suite uses, rather than
 *  from roles or visible text — those move when copy changes, and a screenshot
 *  script that silently photographs the wrong screen is worse than one that
 *  fails. */
async function signIn(page, { email, password }) {
  await page.getByTestId("settings-btn").click();
  await page.waitForTimeout(600);
  await page.getByTestId("settings-account-toggle").click().catch(() => {});
  await page.waitForTimeout(400);
  const open = page.getByTestId("settings-signin-open");
  if (!(await open.isVisible().catch(() => false))) {
    await page.keyboard.press("Escape");   // already signed in
    return;
  }
  await open.click();
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
  await page.waitForTimeout(6000);
  await page.keyboard.press("Escape");

  // Fail loudly. A silent sign-out produces screenshots of an empty map, which
  // is the one outcome worse than no screenshots at all — it looks deliberate.
  await page.getByTestId("tab-history").click();
  await page.waitForTimeout(2500);
  if ((await page.getByTestId("history-row").count()) === 0) {
    throw new Error(
      `signed in as ${email} but History is empty — wrong account, wrong ` +
      `password, or nothing saved. Set CAPTURE_EMAIL / CAPTURE_PASSWORD.`);
  }
}

async function capture(browser, name, ff) {
  const ctx = await browser.newContext({
    viewport: { width: ff.width / ff.dsf, height: ff.height / ff.dsf },
    deviceScaleFactor: ff.dsf,
    isMobile: name === "phone",
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: HIDE_PRICE });

  await signIn(page, creds());
  await page.waitForTimeout(1500);

  mkdirSync(OUT, { recursive: true });
  /** Park the pointer in a corner first: hovering a tab leaves its tooltip on
   *  screen, and the first tablet run captured "visual argument map" floating
   *  over the header. */
  const shot = async (n) => {
    await page.mouse.move(2, 2);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `${ff.prefix}${n}.png`) });
  };

  // 1 — the map, loaded from History so it is a real argument, not a mock-up.
  // Chosen by title rather than by position: the rows are ordered by date, so
  // "the first one" silently becomes a different argument the next time anyone
  // saves anything. CAPTURE_ARGUMENT overrides.
  const wanted = process.env.CAPTURE_ARGUMENT || "Effectiveness of an Update";
  await page.getByTestId("tab-history").click();
  await page.waitForTimeout(1500);
  // Click the TITLE, not the row. The row container matches and accepts a click
  // without loading anything — verified 2026-08-12, and it fails silently, which
  // is how the first attempt produced a screenshot of an empty map.
  const row = page.getByTestId("history-row-title").filter({ hasText: wanted }).first();
  if (!(await row.count())) {
    const titles = await page.getByTestId("history-row-title").allTextContents();
    throw new Error(`no saved argument titled "${wanted}". Available: ${titles.join(" | ")}`);
  }
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await page.waitForTimeout(1000);
  const confirm = page.getByTestId("history-confirm-load");
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForTimeout(5000);
  await page.getByTestId("tab-map").click();
  await page.waitForTimeout(2500);
  // Same reasoning as the sign-in check: an empty map is a plausible-looking
  // screenshot of nothing, so refuse to produce one.
  if (await page.locator(".empty-state").count()) {
    throw new Error(`"${wanted}" did not load — the map is empty. Nothing was captured.`);
  }
  await shot("01-the-map");

  // 2 — a node's detail, which is where the tactic tags and their quotes live.
  // The map is a cytoscape canvas, so there is no element to target: probe a few
  // plausible spots and keep the shot only if a popup actually opened. Better a
  // missing screenshot than one of an empty map captioned "node detail".
  const box = await page.locator(".argument-map").boundingBox();
  let opened = false;
  for (const [fx, fy] of [[0.5, 0.22], [0.5, 0.35], [0.32, 0.45], [0.5, 0.5]]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(1200);
    if (await page.getByTestId("node-view-close-btn").isVisible().catch(() => false)) {
      opened = true;
      break;
    }
  }
  if (opened) {
    await shot("02-node-detail");
    await page.getByTestId("node-view-close-btn").click();
  } else {
    console.log("    (no node hit — skipped 02-node-detail)");
  }

  // 3 — the moderator's read on both speakers
  await page.getByTestId("tab-moderator").click();
  await page.waitForTimeout(3000);
  await shot("03-moderator");

  await ctx.close();
  console.log(`  ${name}: ${ff.width}x${ff.height} -> ${ff.prefix || "(phone)"}*.png`);
}

const only = process.argv[2];
const browser = await chromium.launch();
for (const [name, ff] of Object.entries(FORM_FACTORS)) {
  if (only && only !== name) continue;
  await capture(browser, name, ff);
}
await browser.close();
console.log("done —", OUT);
