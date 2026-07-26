import { test, expect } from "@playwright/test";

// Runs signed-out — overrides the shared storageState with a blank one.
// Only exercises client-side mode switching in the auth modal; never submits
// a real sign-up/sign-in/password-reset request.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Auth modal — navigation", () => {
  test("switches between sign in, sign up, and forgot password without submitting", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("settings-btn").click();
    await page.getByTestId("settings-account-toggle").click();
    await page.getByTestId("settings-signin-open").click();

    await expect(page.getByTestId("auth-email")).toBeVisible();
    await expect(page.getByTestId("auth-password")).toBeVisible();
    await expect(page.getByTestId("auth-submit")).toHaveText("Sign in");

    // → Sign up
    await page.getByTestId("auth-toggle-signup").click();
    await expect(page.getByTestId("auth-submit")).toHaveText("Create account");
    await expect(page.locator("text=Have an account? Sign in")).toBeVisible();

    // → back to sign in
    await page.locator("text=Have an account? Sign in").click();
    await expect(page.getByTestId("auth-submit")).toHaveText("Sign in");

    // → Forgot password
    await page.getByTestId("auth-toggle-forgot").click();
    await expect(page.locator("text=Send code")).toBeVisible();
    await expect(page.getByTestId("auth-password")).not.toBeVisible(); // only email on this screen

    // → back to sign in
    await page.locator("text=Back to sign in").click();
    await expect(page.getByTestId("auth-submit")).toHaveText("Sign in");
  });

  test("sign-in requires both fields (native HTML validation blocks empty submit)", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("settings-btn").click();
    await page.getByTestId("settings-account-toggle").click();
    await page.getByTestId("settings-signin-open").click();

    await page.getByTestId("auth-submit").click();
    // Submitting with an empty required field keeps the modal open — the
    // browser's own validation stops the form before onSubmit ever fires.
    await expect(page.getByTestId("auth-email")).toBeVisible();
    const isInvalid = await page.getByTestId("auth-email").evaluate((el) => !el.checkValidity());
    expect(isInvalid).toBe(true);
  });
});
