import { test, expect } from "./support/fixtures.js";

test.describe("Settings — Account", () => {
  test("Delete my data shows a confirmation that can be cancelled without deleting anything", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("settings-btn").click();
    await page.getByTestId("settings-account-toggle").click();

    await page.getByTestId("settings-delete-data-btn").click();
    await expect(page.getByTestId("settings-delete-confirm")).toBeVisible();
    await expect(page.getByTestId("settings-delete-confirm")).toContainText("can't be undone");

    // Deliberately never click "Yes, delete everything" — this test only
    // proves the confirmation gate exists and Cancel backs out cleanly.
    await page.getByTestId("settings-delete-confirm-cancel").click();
    await expect(page.getByTestId("settings-delete-confirm")).not.toBeVisible();
    await expect(page.getByTestId("settings-user-email")).toBeVisible();
  });

  test("Sign out clears the session and shows the sign-in option again", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("settings-btn").click();
    await page.getByTestId("settings-account-toggle").click();
    await page.getByTestId("settings-signout").click();

    // Sign-out is async (Supabase auth state change propagates via a
    // listener); wait for its visible effect — History leaving the tab bar —
    // before re-opening settings. This test's context is discarded after the
    // run — it never touches the shared playwright/.auth/user.json storage
    // state used by other tests.
    await expect(page.getByTestId("tab-history")).not.toBeVisible();
    // The Account section is already expanded from earlier in this test —
    // only the outer dropdown's open/closed state reset when it auto-closed
    // on sign-out, so we only need to reopen the panel, not re-toggle Account.
    await page.getByTestId("settings-btn").click();
    await expect(page.getByTestId("settings-signin-open")).toBeVisible();
  });
});
