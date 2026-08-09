import { test, expect } from "./support/fixtures.js";
import { reportShot } from "./support/reportShot.js";
import { combinedBudgetMs, waitForCombinedRun } from "./support/waitForCombined.js";

/**
 * Exploratory @costly tests — not strict correctness checks. These submit
 * intentionally messy, low-substance, hostile back-and-forths (in the spirit
 * of the real "Everything Sucks" debate) through the combined-mode AI
 * pipeline and capture how the app maps them: does it find real claims
 * buried in the sniping, flag ad hominem/non-sequitur tactics, or just choke
 * and produce a thin map?
 *
 * Each test spends real AI credits and deliberately leaves its debate in
 * History (not cleaned up) so it can be opened and inspected manually — the
 * point is to look at the result, not just assert on it. Every meaningful
 * step (each node landing, the final map, the Moderator tab with Etiquette
 * points on) is captured via reportShot(), on top of the per-action capture
 * every test gets from support/fixtures.js — see test-results/report/index.html
 * after any run.
 */

async function submitCombinedWithStepShots(page, testInfo, conversation) {
  await page.goto("/");
  await page.getByTestId("tab-history").click();
  await page.getByTestId("history-new-argument").click();

  await page.getByTestId("controls-chevron").click();
  await page.getByTestId("ctrl-combined").click();
  await page.getByTestId("combined-textarea").fill(conversation);
  await page.getByTestId("statement-submit").click();

  // Completion semantics, the idle-vs-total reasoning, and the diagnosis on
  // failure all live in the shared helper. The per-node callback is what keeps
  // intermediate stages of the build-up in the report, not just the final tree.
  await waitForCombinedRun(page, conversation, (count) =>
    reportShot(page, testInfo, `after node ${count}`),
  );

  // Back in Turns mode. Not toBeVisible(): a finished run hides the chrome.
      await expect(page.getByTestId("statement-textarea")).toBeAttached();
  await expect(page.locator(".type-badge").first()).toBeVisible();

  // Give the map a moment to finish its auto-fit layout animation before
  // the final screenshot.
  await page.waitForTimeout(1500);
  await reportShot(page, testInfo, "final map");
}

async function attachMapReport(page, testInfo, conversation) {
  await testInfo.attach("input-conversation.txt", {
    body: conversation,
    contentType: "text/plain",
  });

  const summary = await page.evaluate(() => {
    const badges = Array.from(document.querySelectorAll(".type-badge"));
    return badges.map((b) => b.textContent);
  });
  console.log(`Node types produced (${summary.length}):`, summary.join(", "));
  await testInfo.attach("node-types.txt", {
    body: summary.join("\n") || "(no nodes)",
    contentType: "text/plain",
  });
}

async function shotModeratorWithEtiquette(page, testInfo) {
  await page.getByTestId("settings-btn").click();
  await page.getByTestId("settings-advanced-toggle").click();
  const etiquetteToggle = page.getByTestId("settings-game-mode-toggle");
  if ((await etiquetteToggle.getAttribute("aria-checked")) !== "true") {
    await etiquetteToggle.click();
  }
  await page.keyboard.press("Escape"); // close the settings dropdown
  await page.getByTestId("tab-moderator").click();
  await page.waitForTimeout(500); // let the moderator panel's own render/animation settle
  await reportShot(page, testInfo, "moderator tab — etiquette points on");
}

test.describe("Messy arguments — AI mapping of hostile/low-substance debates", () => {
  // Large, high-DPI viewport so every screenshot has room to fit the whole
  // tree (fitToSafeZone re-fits to whatever viewport is present at launch)
  // and renders at retina sharpness instead of the default 1280x720 @1x.
  test.use({ viewport: { width: 1920, height: 1600 }, deviceScaleFactor: 2 });

  test("personal-attacks-over-chores @costly", async ({ page }, testInfo) => {
    const conversation = [
      "User A: You never do the dishes, you're just lazy.",
      "User B: Oh here we go again, you're such a control freak.",
      "User A: I'm not a control freak, I just don't want to live in a pigsty because you can't be bothered.",
      "User B: Whatever, at least I don't obsess over every little thing like you do.",
      "User A: It's not a little thing when the kitchen smells like a dumpster for three days.",
      "User B: You're so dramatic, it's literally one plate.",
    ].join("\n");
    // Derived from the conversation rather than a flat 240s, with headroom
    // over the helper's own cap so a slow run reports its diagnosis instead of
    // being cut off by Playwright's timeout first.
    test.setTimeout(combinedBudgetMs(conversation) + 60_000);

    await submitCombinedWithStepShots(page, testInfo, conversation);
    await attachMapReport(page, testInfo, conversation);
    await shotModeratorWithEtiquette(page, testInfo);
  });

  test("sarcastic-non-sequitur-pizza-fight @costly", async ({ page }, testInfo) => {
    const conversation = [
      "User A: Pineapple belongs on pizza and you know it.",
      "User B: Sure, and I guess you think ketchup belongs on steak too.",
      "User A: What does that even have to do with anything? At least I'm not afraid of trying new things.",
      "User B: Oh please, you just like being contrarian for attention.",
      "User A: Wow, real mature. Anyway pineapple is objectively fine on pizza.",
      "User B: \"Objectively.\" Sure. Whatever helps you sleep at night.",
    ].join("\n");
    test.setTimeout(combinedBudgetMs(conversation) + 60_000);

    await submitCombinedWithStepShots(page, testInfo, conversation);
    await attachMapReport(page, testInfo, conversation);
    await shotModeratorWithEtiquette(page, testInfo);
  });
});
