import { test, expect } from "@playwright/test";

// Clipboard write only — no AI, no network call.
test.describe("Settings — Help", () => {
  test("Contact Developer copies the support email to the clipboard", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("settings-btn").click();
    await page.getByTestId("settings-help-toggle").click();

    await page.getByTestId("settings-contact-dev").click();
    await expect(page.getByTestId("settings-email-copied")).toBeVisible();
    await expect(page.getByTestId("settings-email-copied")).toContainText("support@trolleysolution.com");

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe("support@trolleysolution.com");
  });
});
