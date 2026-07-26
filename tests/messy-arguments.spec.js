import { test, expect } from "@playwright/test";

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
 * point is to look at the result, not just assert on it. Full-page
 * screenshots of the final map are attached to the HTML report
 * (npm run test:e2e:report) for every run, pass or fail.
 */

async function submitCombined(page, conversation) {
  await page.goto("/");
  await page.getByTestId("tab-history").click();
  await page.getByTestId("history-new-argument").click();

  await page.getByTestId("controls-chevron").click();
  await page.getByTestId("ctrl-combined").click();
  await page.getByTestId("combined-textarea").fill(conversation);
  await page.getByTestId("statement-submit").click();

  // Combined mode processes every turn sequentially in one background loop,
  // then App.jsx auto-switches inputMode back to "turns" when the whole
  // thing finishes (src/App.jsx:934) — so waiting for the plain statement
  // textarea to reappear is the real completion signal. (A node-count
  // threshold is not enough: it can pass after turn 1 while turns 2-6 are
  // still running, and since Playwright tears the page down at the end of
  // the test, that would silently truncate the AI's in-flight work and save
  // a half-processed debate to the real account.)
  await expect(page.getByTestId("statement-textarea")).toBeVisible({ timeout: 220_000 });

  const nodeBadges = page.locator(".type-badge");
  await expect(nodeBadges.first()).toBeVisible();

  // Give the map a moment to finish its auto-fit layout animation before
  // screenshotting.
  await page.waitForTimeout(1500);
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

  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach("final-map.png", { body: screenshot, contentType: "image/png" });
}

test.describe("Messy arguments — AI mapping of hostile/low-substance debates", () => {
  test("personal-attacks-over-chores @costly", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const conversation = [
      "User A: You never do the dishes, you're just lazy.",
      "User B: Oh here we go again, you're such a control freak.",
      "User A: I'm not a control freak, I just don't want to live in a pigsty because you can't be bothered.",
      "User B: Whatever, at least I don't obsess over every little thing like you do.",
      "User A: It's not a little thing when the kitchen smells like a dumpster for three days.",
      "User B: You're so dramatic, it's literally one plate.",
    ].join("\n");

    await submitCombined(page, conversation);
    await attachMapReport(page, testInfo, conversation);
  });

  test("sarcastic-non-sequitur-pizza-fight @costly", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const conversation = [
      "User A: Pineapple belongs on pizza and you know it.",
      "User B: Sure, and I guess you think ketchup belongs on steak too.",
      "User A: What does that even have to do with anything? At least I'm not afraid of trying new things.",
      "User B: Oh please, you just like being contrarian for attention.",
      "User A: Wow, real mature. Anyway pineapple is objectively fine on pizza.",
      "User B: \"Objectively.\" Sure. Whatever helps you sleep at night.",
    ].join("\n");

    await submitCombined(page, conversation);
    await attachMapReport(page, testInfo, conversation);
  });
});
