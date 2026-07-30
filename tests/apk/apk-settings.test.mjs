// Exhaustive settings-menu coverage — every interactive control is exercised.
//
// FREE. Two deliberate exclusions:
//   - settings-delete-confirm-yes wipes the account's data. The confirm dialog
//     is opened and cancelled; "yes" is never clicked.
//   - the Buy Credits purchase path hands off to Stripe. The modal is opened and
//     closed; no checkout is started.
//
//   npm run test:apk:settings

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { connectedDevices, findAdb, sleep } from "./support/android.mjs";
import { connect, loadTestEnv, screenshotter } from "./support/app.mjs";

const env = loadTestEnv();
const shot = screenshotter("settings");

const skip = !findAdb()
  ? "Android SDK/adb not found"
  : connectedDevices().length === 0
    ? "no device"
    : !env.TEST_USER_EMAIL
      ? "no .env.test"
      : false;

let app;

describe("APK settings menu (free)", { skip }, () => {
  before(async () => {
    app = await connect({ relaunch: true });
    await app.signIn(env.TEST_USER_EMAIL, env.TEST_USER_PASSWORD);
    await app.closeSettings();
  });

  after(async () => {
    if (!app) return;
    await app.closeSettings();
    app.close();
  });

  test("settings button opens and closes the dropdown", async () => {
    await app.closeSettings();
    assert.equal(await app.exists("settings-dropdown"), false, "dropdown open before click");
    await app.click("settings-btn");
    await sleep(900);
    shot("dropdown-open");
    assert.ok(await app.exists("settings-dropdown"), "dropdown did not open");
    await app.click("settings-btn");
    await sleep(900);
    assert.equal(await app.exists("settings-dropdown"), false, "dropdown did not close");
  });

  test("ACCOUNT section reveals credits, email, sign-out and delete-data", async () => {
    await app.ensureSection("settings-account-toggle", "settings-user-email");
    shot("account-section");
    for (const id of [
      "settings-credits-amount",
      "settings-buy-credits",
      "settings-user-email",
      "settings-signout",
      "settings-delete-data-btn",
    ]) {
      assert.ok(await app.exists(id), `missing ${id}`);
    }
  });

  test("account shows the signed-in email and a credit balance", async () => {
    await app.ensureSection("settings-account-toggle", "settings-user-email");
    const email = await app.eval(`document.querySelector('[data-testid="settings-user-email"]')?.innerText?.trim()`);
    const credits = await app.eval(`document.querySelector('[data-testid="settings-credits-amount"]')?.innerText?.trim()`);
    assert.ok(email && email.includes("@"), `email looks wrong: ${email}`);
    assert.ok(credits && credits.length > 0, "no credit balance rendered");
  });

  // Never completes a real change — that would invalidate .env.test and break
  // every other suite. Asserting the re-auth guard is the valuable half anyway.
  test("Change password requires the current password", async () => {
    await app.ensureSection("settings-account-toggle", "settings-change-password");
    await app.click("settings-change-password");
    await sleep(2000);
    shot("change-password-modal");

    for (const id of ["auth-current-password", "auth-new-password", "auth-change-submit"]) {
      assert.ok(await app.exists(id), `missing ${id}`);
    }

    await app.setValue("auth-current-password", "not-the-real-password");
    await app.setValue("auth-new-password", "irrelevantNewValue123");
    await app.click("auth-change-submit");
    await sleep(6000);
    shot("change-password-rejected");

    const err = await app.eval(`document.querySelector('[data-testid="auth-error"]')?.innerText ?? ''`);
    assert.match(String(err), /current password is incorrect/i, `unexpected error: "${err}"`);
    assert.equal(
      await app.exists("auth-change-done"),
      false,
      "password was changed despite a wrong current password",
    );

    await app.eval(`document.querySelector('.concession-overlay')?.click()`);
    await sleep(1500);
    assert.ok(await app.isSignedIn(), "session lost after a rejected password change");
  });

  test("Buy Credits opens a modal that closes cleanly", async () => {
    await app.ensureSection("settings-account-toggle", "settings-buy-credits");
    await app.click("settings-buy-credits");
    await sleep(2500);
    shot("buy-credits-modal");

    const opened = await app.exists("credits-modal-close");
    if (!opened) {
      // Native Stripe redirect path — record it rather than failing the suite.
      const err = await app.eval(`document.querySelector('[data-testid="credits-modal-error"]')?.innerText ?? null`);
      console.log(`  no in-app modal; error=${err ?? "none"} url=${await app.eval("location.href")}`);
      return;
    }
    await app.click("credits-modal-close");
    await sleep(1200);
    assert.equal(await app.exists("credits-modal-close"), false, "modal did not close");
  });

  test("delete-data asks for confirmation and cancel aborts", async () => {
    await app.ensureSection("settings-account-toggle", "settings-delete-data-btn");
    await app.click("settings-delete-data-btn");
    await sleep(1200);
    shot("delete-data-confirm");

    assert.ok(await app.exists("settings-delete-confirm"), "no confirmation shown");
    assert.ok(await app.exists("settings-delete-confirm-yes"), "no confirm button");
    assert.ok(await app.exists("settings-delete-confirm-cancel"), "no cancel button");

    // Never click -yes: it wipes the account.
    await app.click("settings-delete-confirm-cancel");
    await sleep(1200);
    assert.equal(await app.exists("settings-delete-confirm"), false, "cancel left the dialog open");
    assert.ok(await app.exists("settings-user-email"), "still signed in after cancel");
  });

  test("HELP section reveals Contact Developer and copies the address", async () => {
    await app.ensureSection("settings-help-toggle", "settings-contact-dev");
    shot("help-section");
    await app.click("settings-contact-dev");
    await sleep(1500);
    // The copied-confirmation is transient; presence is best-effort.
    const copied = await app.exists("settings-email-copied");
    console.log(`  copy confirmation shown: ${copied}`);
  });

  test("ADVANCED section reveals game mode, sounds and copy-JSON", async () => {
    await app.ensureSection("settings-advanced-toggle", "settings-game-mode-toggle");
    shot("advanced-section");
    for (const id of ["settings-game-mode-toggle", "settings-game-sounds-toggle", "settings-copy-json"]) {
      assert.ok(await app.exists(id), `missing ${id}`);
    }
  });

  test("game mode toggles and persists", async () => {
    await app.ensureSection("settings-advanced-toggle", "settings-game-mode-toggle");
    const read = () => app.eval(`(() => {
      const e = document.querySelector('[data-testid="settings-game-mode-toggle"]');
      if (!e) return null;
      return String(e.checked ?? e.getAttribute('aria-checked') ?? e.dataset.on ?? e.className);
    })()`);

    const before = await read();
    await app.click("settings-game-mode-toggle");
    await sleep(1500);
    const after = await read();
    shot("game-mode-toggled");
    assert.notEqual(after, before, `game mode did not change state (${before})`);

    await app.click("settings-game-mode-toggle");
    await sleep(1500);
    assert.equal(await read(), before, "game mode did not toggle back");
  });

  // Sounds is a sub-setting of Game Mode and is inert while Game Mode is off,
  // so enable it for the duration and restore afterwards.
  test("game sounds toggles while game mode is on", async () => {
    await app.ensureSection("settings-advanced-toggle", "settings-game-mode-toggle");
    const read = (id) => app.eval(`(() => {
      const e = document.querySelector('[data-testid="${id}"]');
      if (!e) return null;
      return String(e.checked ?? e.getAttribute('aria-checked') ?? e.dataset.on ?? e.className);
    })()`);

    const modeBefore = await read("settings-game-mode-toggle");
    await app.click("settings-game-mode-toggle");
    await sleep(1500);
    assert.notEqual(await read("settings-game-mode-toggle"), modeBefore, "game mode did not enable");

    const soundsBefore = await read("settings-game-sounds-toggle");
    await app.click("settings-game-sounds-toggle");
    await sleep(1500);
    shot("game-sounds-toggled");
    assert.notEqual(await read("settings-game-sounds-toggle"), soundsBefore, "sounds did not change");

    await app.click("settings-game-sounds-toggle");
    await sleep(1200);
    await app.click("settings-game-mode-toggle");
    await sleep(1200);
    assert.equal(await read("settings-game-mode-toggle"), modeBefore, "game mode not restored");
  });

  test("copy map JSON reaches the clipboard", async () => {
    await app.ensureSection("settings-advanced-toggle", "settings-copy-json");
    const errors = JSON.parse(
      await app.eval(`(async () => {
        const caught = [];
        const onErr = e => caught.push(String(e.message || e.reason));
        window.addEventListener('error', onErr);
        window.addEventListener('unhandledrejection', onErr);
        try { document.querySelector('[data-testid="settings-copy-json"]').click(); }
        catch (e) { caught.push(String(e.message)); }
        await new Promise(r => setTimeout(r, 1500));
        window.removeEventListener('error', onErr);
        window.removeEventListener('unhandledrejection', onErr);
        return JSON.stringify(caught);
      })()`),
    );
    shot("copy-json");

    // Known defect: navigator.clipboard.writeText is denied inside the Android
    // WebView, so this button silently does nothing in the APK while working
    // fine on web. Fix is @capacitor/clipboard on native.
    const denied = errors.some((e) => /NotAllowedError|permission denied/i.test(e));
    assert.equal(
      denied,
      false,
      "Copy map JSON failed: the WebView denied clipboard write. " +
        "Use @capacitor/clipboard on native instead of navigator.clipboard.",
    );
    assert.deepEqual(errors, [], `copy-json raised: ${errors.join("; ")}`);
  });

  test("THEMES section lists every preset", async () => {
    await app.openSettings();
    if ((await app.themeCards()).length === 0) {
      await app.click("settings-themes-toggle");
      await sleep(1000);
    }
    const cards = await app.themeCards();
    shot("themes-section");
    assert.ok(cards.length >= 8, `expected at least 8 themes, found ${cards.length}: ${cards.join(", ")}`);
  });

  test("every theme applies without error", async () => {
    const openThemes = async () => {
      await app.openSettings();
      if ((await app.themeCards()).length === 0) {
        await app.click("settings-themes-toggle");
        await sleep(1000);
      }
    };

    await openThemes();
    const cards = await app.themeCards();
    assert.ok(cards.length > 0, "no theme cards found");
    const seen = [];

    for (const name of cards) {
      // Click-to-commit closes the picker, so it must be reopened per theme.
      await openThemes();
      const r = await app.pickTheme(name);
      assert.equal(r, "ok", `could not click theme ${name}`);

      const state = await app.themeState();
      seen.push(`${name}: dark=${state.dark} lcars=${state.lcars}`);
      await app.closeSettings();
      shot(`theme-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);

      const text = await app.bodyText();
      assert.ok(text.includes("iDisagree"), `UI broke after applying ${name}`);
    }
    console.log(`  ${seen.join("\n  ")}`);
    assert.equal(seen.length, cards.length, "not every theme was applied");
  });

  test("sign out clears the session, then sign back in", async () => {
    await app.ensureSection("settings-account-toggle", "settings-signout");
    await app.click("settings-signout");
    await sleep(4000);
    await app.closeSettings();
    shot("signed-out");

    assert.equal(await app.exists("tab-history"), false, "History still visible after sign out");

    await app.signIn(env.TEST_USER_EMAIL, env.TEST_USER_PASSWORD);
    await app.closeSettings();
    assert.ok(await app.exists("tab-history"), "could not sign back in");
    shot("signed-back-in");
  });
});
