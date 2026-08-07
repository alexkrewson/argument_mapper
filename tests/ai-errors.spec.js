import { test, expect } from "./support/fixtures.js";

// A failed AI call has to say so. Free: the request never reaches the proxy, so
// no credits are spent and no map is built.
//
// This is the user-visible half of the timeout added to claude.js. The 120s
// timer itself is impractical to assert on directly — a test that waits two
// minutes to prove a timeout is a test nobody runs — but the contract that
// matters is the same either way: when a call cannot complete, the app says so
// instead of sitting there. Before the timeout existed, a request that hung
// rather than failed never rejected, so App.jsx's catch never ran and combined
// mode simply waited forever with an empty map and nothing on screen.

test.describe("AI errors — a failed call must never look like a slow one", () => {
  test("a dead connection surfaces an error instead of hanging", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-history").click();
    await page.getByTestId("history-new-argument").click();

    // Kill the proxy call before it leaves the browser.
    await page.route("**/functions/v1/claude-proxy", (route) => route.abort("failed"));

    await page.getByTestId("statement-textarea").fill("A hot dog is a sandwich.");
    await page.getByTestId("statement-submit").click();

    const errorBar = page.locator(".error-bar");
    await expect(errorBar).toBeVisible({ timeout: 30_000 });
    await expect(errorBar).not.toBeEmpty();

    // And the app must be usable again, not stuck behind a spinner.
    await expect(page.getByTestId("statement-submit")).toBeEnabled({ timeout: 15_000 });
  });
});
