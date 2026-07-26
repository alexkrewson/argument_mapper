import { test, expect } from "@playwright/test";

// Local UI state only — name editing, turn switching, and mode switching
// never call the AI or hit the network until you actually Submit/Process.
test.describe("Statement input — controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-history").click();
    await page.getByTestId("history-new-argument").click();
  });

  test("editing your name and shuffling updates the turn label", async ({ page }) => {
    const nameInput = page.getByTestId("speaker-name-input");
    await expect(nameInput).toHaveValue("User A");

    await nameInput.fill("Test Speaker");
    await expect(nameInput).toHaveValue("Test Speaker");

    const shuffleBtn = page.getByTestId("speaker-name-refresh");
    await shuffleBtn.click();
    await expect(nameInput).not.toHaveValue("Test Speaker");
    await expect(nameInput).not.toHaveValue("");
  });

  test("Skip Turn alternates the active speaker", async ({ page }) => {
    const nameInput = page.getByTestId("speaker-name-input");
    await expect(nameInput).toHaveValue("User A");

    await page.getByTestId("controls-chevron").click();
    await page.getByTestId("ctrl-skip").click();
    await expect(nameInput).toHaveValue("User B");

    await page.getByTestId("ctrl-skip").click();
    await expect(nameInput).toHaveValue("User A");
  });

  test("switching between Turns and Combined mode swaps the input area", async ({ page }) => {
    await page.getByTestId("controls-chevron").click();

    await expect(page.getByTestId("statement-textarea")).toBeVisible();
    await expect(page.getByTestId("statement-submit")).toHaveText("Submit");

    await page.getByTestId("ctrl-combined").click();
    await expect(page.getByTestId("combined-textarea")).toBeVisible();
    await expect(page.getByTestId("statement-submit")).toHaveText("Process");
    await expect(page.getByTestId("ctrl-combined")).toHaveClass(/ctrl-btn--dormant/);

    await page.getByTestId("ctrl-turns").click();
    await expect(page.getByTestId("statement-textarea")).toBeVisible();
    await expect(page.getByTestId("statement-submit")).toHaveText("Submit");
    await expect(page.getByTestId("ctrl-turns")).toHaveClass(/ctrl-btn--dormant/);
  });
});
