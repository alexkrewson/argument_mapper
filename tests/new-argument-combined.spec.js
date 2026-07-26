import { test, expect } from "@playwright/test";

// NOTE: this test submits real statements to the production AI pipeline and
// spends real credit balance every run. It's tagged @costly and excluded from
// the default `npm run test:e2e` script — run it deliberately via
// `npm run test:e2e:full` (or `playwright test --grep @costly`).
test.describe("New argument — combined input mode", () => {
  test("creates an argument from a 4-line A/B conversation @costly", async ({ page }) => {
    test.setTimeout(240_000); // 4 sequential AI turns can take well over a minute
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

    await page.getByTestId("combined-textarea").fill(conversation);
    await page.getByTestId("statement-submit").click();

    // Processing runs turn-by-turn and can genuinely take a couple of minutes on
    // production. Rather than trust the transient "Processing turn N of 4" label
    // (which can outlive the actual work), poll for the real outcome: nodes
    // landing on the map. The AI may decompose a single statement into more than
    // one node (e.g. a rebuttal split into premise + conclusion), so assert a
    // floor, not an exact count — 4 statements in means at least 4 nodes out.
    const nodeBadges = page.locator(".type-badge");
    await expect(async () => {
      expect(await nodeBadges.count()).toBeGreaterThanOrEqual(4);
    }).toPass({ timeout: 220_000, intervals: [5_000] });
  });
});
