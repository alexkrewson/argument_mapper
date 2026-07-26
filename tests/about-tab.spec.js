import { test, expect } from "@playwright/test";

// Fully static content — nav collapse and section-scroll are the only
// interactive parts.
test.describe("About tab", () => {
  test("nav collapses/expands and section links scroll the content", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-about").click();

    const scrollContainer = page.locator(".about-scroll");
    await expect(scrollContainer).toBeVisible();
    const startTop = await scrollContainer.evaluate((el) => el.scrollTop);

    await page.getByTestId("about-nav-link-pricing").click();
    await expect
      .poll(() => scrollContainer.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(startTop);

    await expect(page.locator("#pricing")).toBeVisible();

    await page.getByTestId("about-nav-toggle").click();
    await expect(page.locator(".about-nav")).toHaveClass(/about-nav--collapsed/);
    await page.getByTestId("about-nav-toggle").click();
    await expect(page.locator(".about-nav")).not.toHaveClass(/about-nav--collapsed/);
  });
});
