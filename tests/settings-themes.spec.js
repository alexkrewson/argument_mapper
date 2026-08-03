import { test, expect } from "./support/fixtures.js";

// Read-only in the sense that it never touches AI or Supabase writes — just
// localStorage — free to run anytime.
test.describe("Settings — Themes", () => {
  test("switching themes updates the active swatch and persists across reload", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("settings-btn").click();
    await page.getByTestId("settings-themes-toggle").click();

    const ember = page.getByTestId("theme-option-ember");
    await expect(ember).toBeVisible();
    await ember.click();

    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("ember");

    await page.reload();
    await page.getByTestId("settings-btn").click();
    await page.getByTestId("settings-themes-toggle").click();
    await expect(page.getByTestId("theme-option-ember")).toHaveClass(/theme-option--active/);

    // Switch back to the default so we don't leave the account on a changed theme.
    await page.getByTestId("theme-option-classic").click();
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("classic");
  });
});
