import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, "..", "playwright", ".auth", "user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error("TEST_USER_EMAIL / TEST_USER_PASSWORD not set — copy .env.test.example or export them.");
  }

  await page.goto("/");
  await page.getByTestId("settings-btn").click();
  await page.getByTestId("settings-account-toggle").click();
  await page.getByTestId("settings-signin-open").click();

  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();

  await expect(page.getByTestId("tab-history")).toBeVisible({ timeout: 15_000 });

  await page.context().storageState({ path: authFile });
});
