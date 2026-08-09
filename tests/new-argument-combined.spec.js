import { test, expect } from "./support/fixtures.js";
import { combinedBudgetMs, waitForCombinedRun } from "./support/waitForCombined.js";

// NOTE: this test submits real statements to the production AI pipeline and
// spends real credit balance every run. It's tagged @costly and excluded from
// the default `npm run test:e2e` script — run it deliberately via
// `npm run test:e2e:full` (or `playwright test --grep @costly`).
test.describe("New argument — combined input mode", () => {
  test("creates an argument from a 4-line A/B conversation @costly", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByTestId("tab-history").click();
    await page.getByTestId("history-new-argument").click();

    await page.getByTestId("controls-chevron").click();
    await page.getByTestId("ctrl-combined").click();

    const conversation = [
      "User A: A hot dog is clearly a sandwich — it's just filling enclosed by bread.",
      "User B: A hot dog isn't a sandwich because the bread is one hinged piece, not two separate slices.",
      "User A: Plenty of accepted sandwiches use hinged bread, like a submarine or a taco-style roll.",
      "User B: Cultural convention already treats hot dogs as their own food category, regardless of bread structure.",
    ].join("\n");
    test.setTimeout(combinedBudgetMs(conversation) + 60_000);

    await page.getByTestId("combined-textarea").fill(conversation);
    await page.getByTestId("statement-submit").click();

    // Completion semantics and the wait strategy live in the shared helper —
    // it waits on progress rather than a flat total, so a slow run and a
    // genuinely stalled one report differently instead of both surfacing as
    // "element not visible after 220s".
    await waitForCombinedRun(page, conversation);
    // Back in Turns mode. Not toBeVisible(): a finished run hides the chrome.
      await expect(page.getByTestId("statement-textarea")).toBeAttached();

    // The AI may decompose a single statement into more than one node (e.g. a
    // rebuttal split into premise + conclusion), so assert a floor, not an
    // exact count — 4 statements in means at least 4 nodes out.
    const nodeBadges = page.locator(".type-badge");
    expect(await nodeBadges.count()).toBeGreaterThanOrEqual(4);

    await page.waitForTimeout(1500); // let the auto-fit layout animation settle
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach("final-map.png", { body: screenshot, contentType: "image/png" });
  });
});
