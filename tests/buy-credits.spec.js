import { test, expect } from "./support/fixtures.js";

// Creating a Stripe Checkout Session costs nothing until it's actually paid —
// unpaid sessions just expire on their own. This test verifies the real
// checkout redirect is produced, then closes the tab without paying.
test.describe("Buy Credits — Stripe checkout", () => {
  test("Top up opens the modal and a pack button redirects to Stripe Checkout", async ({ page, context }) => {
    await page.goto("/");
    await page.getByTestId("settings-btn").click();
    await page.getByTestId("settings-account-toggle").click();

    await page.getByTestId("settings-buy-credits").click();
    await expect(page.getByTestId("credits-pack-50")).toBeVisible();
    await expect(page.getByTestId("credits-pack-200")).toBeVisible();
    await expect(page.getByTestId("credits-pack-500")).toBeVisible();

    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      page.getByTestId("credits-pack-50").click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).toContain("checkout.stripe.com");
    await popup.close();
  });

  test("closing the modal via the X button works without buying anything", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("settings-btn").click();
    await page.getByTestId("settings-account-toggle").click();
    await page.getByTestId("settings-buy-credits").click();

    await expect(page.getByTestId("credits-modal-close")).toBeVisible();
    await page.getByTestId("credits-modal-close").click();
    await expect(page.getByTestId("credits-modal-close")).not.toBeVisible();
  });
});
