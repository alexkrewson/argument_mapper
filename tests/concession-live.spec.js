import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, shot } from "./support/fixtures.js";

try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"));
} catch { /* a clean clone has no .env */ }

// The confirm/decline path, against a real AI response.
//
// Everything in tests/possible-concession.spec.js seeds the metadata by hand,
// which proves the app renders and stores it but says nothing about the half
// that has never been exercised end to end: Claude reading "you're right, I'll
// grant that" as a concession, App.jsx stripping the rating it set, queueing it,
// and the two ways out of that modal. Two turns each, ~8p a test.
//
//   npm run test:web:concession
//
// Tagged @costly as well as @concession, because `npm run test:web` inverts on
// @costly alone and would otherwise spend credits on the free tier.

const OPENING = "A hot dog bun is bread with a filling in it, so a hot dog is a sandwich.";
const CONCEDING = "You're right, I'll grant that the bun is bread. But structure still isn't how we sort food.";

/** Reads the full map, metadata and all, the way the app's own Copy button does. */
async function readMap(page) {
  await page.getByTestId("settings-btn").click();
  await page.getByTestId("settings-advanced-toggle").click();
  await page.getByTestId("settings-copy-json").click();
  const raw = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("Escape");
  return JSON.parse(raw);
}

async function submit(page, text) {
  await page.getByTestId("statement-textarea").fill(text);
  await page.getByTestId("statement-submit").click();
}

async function cleanup(page, id) {
  await page.evaluate(async ({ id, base, anon }) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    const token = JSON.parse(localStorage.getItem(key)).access_token;
    await fetch(`${base}/rest/v1/debates?id=eq.${id}`, { method: "DELETE",
      headers: { apikey: anon, Authorization: `Bearer ${token}`,
                 "Accept-Profile": "argument_mapper", "Content-Profile": "argument_mapper" } });
  }, { id, base: process.env.VITE_SUPABASE_URL, anon: process.env.VITE_SUPABASE_ANON_KEY });
}

/** Opens with A, then has B concede. Returns the debate id and the modal locator. */
async function runToConcession(page) {
  await page.goto("/");
  await page.getByTestId("tab-history").click();
  await page.getByTestId("history-new-argument").click();
  const insert = page.waitForResponse(
    (r) => r.url().includes("/rest/v1/debates") && r.request().method() === "POST");

  await submit(page, OPENING);
  await expect(page.locator(".type-badge").first()).toBeVisible({ timeout: 150_000 });
  await shot("after A's opening statement");

  // Submitting hands the turn over, so this is B conceding A's point.
  await submit(page, CONCEDING);
  const modal = page.getByTestId("concession-modal");
  await expect(modal).toBeVisible({ timeout: 150_000 });
  await shot("Claude read that as a concession and asked");

  const id = (await (await insert).json()).id;
  return { id, modal };
}

test.describe("Concessions against a live AI", () => {
  test("confirming settles it, and leaves no suggestion behind @costly @concession", async ({ page }) => {
    test.setTimeout(360_000);
    const { id, modal } = await runToConcession(page);

    await expect(modal).toContainText("concede this point");
    await page.getByTestId("concession-confirm").click();
    await expect(modal).toBeHidden();
    await shot("after confirming");

    const map = await readMap(page);
    const nodes = map.argument_map.nodes;
    const conceded = nodes.find((n) => n.metadata?.agreed_by);
    expect(conceded, "confirming wrote no agreed_by").toBeTruthy();
    expect(conceded.rating).toBe("up");
    // A settled concession must not also be a question.
    expect(nodes.some((n) => n.metadata?.possible_concession)).toBe(false);
    await expect(page.locator(`[data-node-id="${conceded.id}"]`)).not.toContainText("possible concession");
    await shot("settled: rated, and no badge");

    await cleanup(page, id);
  });

  test("declining leaves a possible concession and changes nothing else @costly @concession", async ({ page }) => {
    test.setTimeout(360_000);
    const { id, modal } = await runToConcession(page);

    await page.getByTestId("concession-dismiss").click();
    await expect(modal).toBeHidden();
    await shot("after declining");

    const map = await readMap(page);
    const nodes = map.argument_map.nodes;
    const flagged = nodes.find((n) => n.metadata?.possible_concession);
    expect(flagged, "declining left no suggestion behind").toBeTruthy();

    // The whole point: a declined concession is recorded, not applied.
    expect(flagged.rating ?? null).toBeNull();
    expect(flagged.metadata.agreed_by ?? null).toBeNull();
    expect(nodes.every((n) => !n.rating)).toBe(true);
    await expect(page.locator(`[data-node-id="${flagged.id}"]`)).toContainText("possible concession");
    await shot("declined: badged, and nothing applied");

    // And the quote it was inferred from is what makes it judgeable.
    expect(flagged.metadata.possible_concession.text, "no phrase recorded").toBeTruthy();

    await cleanup(page, id);
  });
});
