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
import { connectedDevices, findAdb, sleep, waitFor } from "./support/android.mjs";
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

  // The credit balance arrives from an async profiles query, so it is not there
  // the instant the ACCOUNT section opens. Both tests below used to read it once
  // and pass by luck: they failed only in the FULL suite, where the emulator is
  // busy enough for the query to lose the race, and passed on their own every
  // time. That is the fifth instance of this file's oldest mistake -- asserting
  // on state that is still settling -- so it waits on the thing it asserts.
  const waitForCredits = () =>
    waitFor(() => app.exists("settings-credits-amount"),
      { what: "the credit balance to load from profiles", timeout: 15_000 });

  test("ACCOUNT section reveals credits, email, sign-out and delete-data", async () => {
    await app.ensureSection("settings-account-toggle", "settings-user-email");
    await waitForCredits();
    shot("account-section");
    for (const id of [
      "settings-credits-amount",
      "settings-user-email",
      "settings-signout",
      "settings-delete-data-btn",
    ]) {
      assert.ok(await app.exists(id), `missing ${id}`);
    }
    // The balance still shows; only the purchase path is gone. See the
    // buy-credits test below for why this is asserted rather than dropped.
    assert.equal(
      await app.exists("settings-buy-credits"),
      false,
      "Top up button is present on Android — violates Play's Payments policy",
    );
  });

  test("account shows the signed-in email and a credit balance", async () => {
    await app.ensureSection("settings-account-toggle", "settings-user-email");
    await waitForCredits();
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

  // Inverted 2026-08-03. This used to open the Stripe modal; on Android that is
  // now a policy violation rather than a feature. Play's Payments policy wants
  // Play Billing for credits consumed in-app, so the whole purchase path is
  // web-only. Asserting ABSENCE here is what keeps it that way -- if someone
  // later removes the isNativePlatform() guard, this test is what notices.
  // The web equivalent still runs: tests/buy-credits.spec.js.
  test("Buy Credits is not reachable on Android", async () => {
    await app.ensureSection("settings-account-toggle", "settings-credits-amount");
    shot("no-buy-credits-on-native");

    assert.equal(await app.exists("settings-buy-credits"), false, "Top up button is reachable");
    assert.equal(await app.exists("credits-modal-close"), false, "credits modal rendered unprompted");

    // The balance is still shown -- users should know where they stand even
    // when they can't top up from here.
    assert.ok(await app.exists("settings-credits-amount"), "credit balance is missing too");
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

  // Account deletion is behind a second confirmation because it removes the
  // shared login, not just this app's data. Never clicks the final confirm --
  // that would delete the account .env.test depends on.
  test("account deletion needs a second, separate confirmation", async () => {
    await app.ensureSection("settings-account-toggle", "settings-delete-data-btn");
    await app.click("settings-delete-data-btn");
    await sleep(1200);

    // The option only appears once the delete-account function supports the
    // GET probe. Against an older deployment it's hidden on purpose, so treat
    // that as a pass with a note rather than a failure.
    if (!(await app.exists("settings-delete-account-btn"))) {
      console.log("  account-delete hidden — delete-account function not yet deployed");
      await app.click("settings-delete-confirm-cancel");
      await sleep(1000);
      return;
    }

    assert.equal(
      await app.exists("settings-delete-account-yes"),
      false,
      "final account-delete confirm is reachable in one click",
    );

    await app.click("settings-delete-account-btn");
    await sleep(1200);
    shot("delete-account-confirm");
    assert.ok(await app.exists("settings-delete-account-confirm"), "no second confirmation");
    assert.ok(await app.exists("settings-delete-account-yes"), "no final confirm button");

    // Wording varies with whether the login is actually used elsewhere, but
    // every variant must say the sign-in itself is going away.
    const warning = await app.bodyText();
    assert.match(warning, /removes your sign-in/i, "confirmation doesn't say the login is deleted");

    await app.click("settings-delete-confirm-cancel");
    await sleep(1200);
    assert.equal(await app.exists("settings-delete-confirm"), false, "cancel left the dialog open");
    assert.ok(await app.isSignedIn(), "still signed in after cancelling");
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
