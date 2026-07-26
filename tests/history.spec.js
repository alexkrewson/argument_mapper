import { test, expect } from "@playwright/test";

// Read-only: loading a saved debate just fetches stored map_data, no AI call —
// safe to run as often as you like.
test.describe("History", () => {
  test("shows saved debates and loads the most recent one", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-history").click();

    const rows = page.getByTestId("history-row");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    expect(await rows.count()).toBeGreaterThan(0);

    const firstTitle = page.getByTestId("history-row-title").first();
    const titleText = (await firstTitle.textContent())?.trim();
    await firstTitle.click();

    await expect(page.getByTestId("tab-map")).toHaveClass(/tab-btn--active/);
    await expect(page.locator(".type-badge").first()).toBeVisible({ timeout: 10_000 });

    console.log(`Loaded most recent debate: "${titleText}"`);
  });
});
