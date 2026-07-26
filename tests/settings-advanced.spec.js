import { test, expect } from "@playwright/test";

// All local state + localStorage — no AI, no Supabase writes.
test.describe("Settings — Advanced", () => {
  test("Game Mode and Point Sounds toggles flip state and persist", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("settings-btn").click();
    await page.getByTestId("settings-advanced-toggle").click();

    const gameModeToggle = page.getByTestId("settings-game-mode-toggle");
    const soundsToggle = page.getByTestId("settings-game-sounds-toggle");

    // Starts off by default in a fresh profile.
    await expect(gameModeToggle).toHaveAttribute("aria-checked", "false");

    // Sounds toggle is a no-op while Game Mode is off.
    await expect(soundsToggle).toHaveAttribute("aria-checked", "false");
    await soundsToggle.click();
    await expect(soundsToggle).toHaveAttribute("aria-checked", "false"); // no-op, still off

    await gameModeToggle.click();
    await expect(gameModeToggle).toHaveAttribute("aria-checked", "true");
    expect(await page.evaluate(() => localStorage.getItem("gameModePoints"))).toBe("true");

    // Now that Game Mode is on, sounds should be clickable.
    await soundsToggle.click();
    await expect(soundsToggle).toHaveAttribute("aria-checked", "true");
    expect(await page.evaluate(() => localStorage.getItem("gameSounds"))).toBe("true");

    // Reset to defaults so we don't leave the account in a changed state.
    await soundsToggle.click();
    await gameModeToggle.click();
    expect(await page.evaluate(() => localStorage.getItem("gameModePoints"))).toBe("false");
    expect(await page.evaluate(() => localStorage.getItem("gameSounds"))).toBe("false");
  });

  test("Copy map JSON copies the current argument map to the clipboard", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("settings-btn").click();
    await page.getByTestId("settings-advanced-toggle").click();

    const copyBtn = page.getByTestId("settings-copy-json");
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();
    await expect(copyBtn).toHaveText("✓ Copied!");

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    const parsed = JSON.parse(clipboardText);
    expect(parsed).toHaveProperty("argument_map");
  });
});
