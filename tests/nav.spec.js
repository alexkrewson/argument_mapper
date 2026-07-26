import { test, expect } from "@playwright/test";

// Read-only UI smoke checks — no AI calls, safe to run as often as you like.
test.describe("Navigation & settings", () => {
  test("switches between Map / Moderator / History / About tabs", async ({ page }) => {
    await page.goto("/");

    for (const tab of ["tab-moderator", "tab-history", "tab-about", "tab-map"]) {
      await page.getByTestId(tab).click();
      await expect(page.getByTestId(tab)).toHaveClass(/tab-btn--active/);
    }
  });

  test("settings dropdown opens and shows signed-in account state", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("settings-btn").click();
    await expect(page.getByTestId("settings-dropdown")).toBeVisible();

    await page.getByTestId("settings-account-toggle").click();
    await expect(page.getByTestId("settings-user-email")).toBeVisible();
    await expect(page.getByTestId("settings-signout")).toBeVisible();
  });

  test("signed-in session persists across a reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("tab-history")).toBeVisible(); // auth-gated, proves signed in

    await page.reload();
    await expect(page.getByTestId("tab-history")).toBeVisible();
    await page.getByTestId("settings-btn").click();
    await page.getByTestId("settings-account-toggle").click();
    await expect(page.getByTestId("settings-user-email")).toBeVisible();
  });
});
