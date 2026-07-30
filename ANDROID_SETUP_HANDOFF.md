# Android / Capacitor Setup Handoff — Linux

**Machine-specific: the Ubuntu box (`CF-53-2`).** For Windows see
`ANDROID_SETUP_WINDOWS.md`; nothing below about paths, KVM or `.bashrc` applies
there.

**Originally written 2026-06-04; corrected 2026-07-30** — see the auth and
blank-screen sections, both of which said things that are no longer true.

**Goal: Run the app on an Android emulator via Android Studio**

> **Action required on this machine.** `android/gradle.properties` used to pin
> `org.gradle.java.home=/home/alex/.local/jdk21`. That line was committed, so it
> broke every other machine and has been removed. Gradle now resolves the JDK
> from `JAVA_HOME`, so add this to `.bashrc` before the next Android build:
>
> ```bash
> export JAVA_HOME="$HOME/.local/jdk21"
> ```

---

## Current State (as of 2026-06-04)

- **App is running successfully on the emulator** via Android Studio (Medium Phone API 36).
- A debug APK has been built and exists at `android/app/build/outputs/apk/debug/app-debug.apk`.
- 4 GB swap file added to the machine to handle memory pressure.
- Android Studio launches the emulator **embedded inside its own panel** (not a separate window) — this is normal behavior.

---

## Machine / OS Info

- User: `alex` on `CF-53-2`
- CPU: Intel Core i5-3340M @ 2.70 GHz (2012 mobile chip, 4 threads) — old but functional with KVM
- RAM: 7.6 GB + 4 GB swap (swap added 2026-06-04, persisted in `/etc/fstab`)
- OS: Linux 5.4.0-216-generic (Ubuntu-based)
- Shell: bash
- KVM: enabled via ACL (`user:alex:rw-` on `/dev/kvm`) — hardware acceleration is working

---

## Key Paths

| Thing | Path |
|---|---|
| Android Studio binary | `~/android-studio/bin/studio.sh` |
| Android SDK | `~/Android/Sdk/` |
| ADB binary | `~/Android/Sdk/platform-tools/adb` (v35.0.2) |
| Emulator binary | `~/Android/Sdk/emulator/emulator` |
| Project | `~/apps/argument_mapper/` |
| Desktop launcher | `~/.local/share/applications/android-studio.desktop` |
| Debug APK | `~/apps/argument_mapper/android/app/build/outputs/apk/debug/app-debug.apk` |

---

## `.bashrc` PATH entries added (lines ~122-125)

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
export PATH="$HOME/Android/Sdk/platform-tools:$PATH"
export PATH=$PATH:~/android-sdk/cmdline-tools/latest/bin:~/android-sdk/platform-tools
```

The `$HOME/Android/Sdk/platform-tools` entry ensures the v41 ADB (v35.0.2) takes precedence over any system ADB.

---

## How to Launch Android Studio (must be from terminal)

```bash
source ~/.bashrc
~/android-studio/bin/studio.sh
```

**Do NOT launch from the OS app list** — it may not inherit the correct PATH and ADB may not connect.

---

## Running the App on the Emulator

1. Launch Android Studio from the terminal (above)
2. Select **Medium Phone API 36** as the target device (works better than Pixel 6 on this machine)
3. Click the green **Run ▶** button
4. The emulator appears **inside Android Studio** in the "Running Devices" panel on the right — not as a separate window
5. Wait for Gradle build to finish, then the app installs automatically

**Use snapshot boot — never cold boot.** Cold boot takes 5+ minutes on this hardware. In Device Manager, use `...` → launch normally (not cold boot) to resume from snapshot in ~30 seconds.

---

## Preferred AVD: Medium Phone API 36

The **Pixel 6 (API 37)** AVD exists but is more resource-hungry and had connection issues. The **Medium Phone API 36** boots faster and works reliably on this machine.

---

## ADB Connection Issue (if it occurs)

**Symptom**: `Unable to connect` / `Client not connected yet` in terminal output.

**Fix**:
```bash
adb kill-server
sleep 1
adb start-server
adb devices   # confirm emulator shows as "device"
```
Then click Run in Android Studio again.

**If still failing**: File > Settings > Languages & Frameworks > Android SDK → verify path is `/home/alex/Android/Sdk`

---

## Sideloading the Debug APK onto a Real Device

The debug APK can be installed on any Android device for testing:

1. On the device: enable **Developer Options** (tap Build Number 7× in Settings) and turn on **USB Debugging**
2. Connect via USB, then:
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Notes:
- Debug APK is functional but slower/larger than a release build
- It uses the live production backend (real API keys)
- For Play Store distribution, a signed release APK is needed (separate step)

---

## App Auth Behavior

> Updated 2026-07-30 — guest mode was deprecated. The previous text here said
> sign-in was optional with no hard gate; that is no longer true.

Sign-in is **required** before any AI analysis. Credits are metered per account,
so a turn cannot be attributed without one. Verified on the debug APK:

- Submitting a statement while signed out opens the sign-in modal and **discards
  the statement**. No AI call is made and nothing is charged.
- The **History** tab is hidden entirely when signed out.
- **Add Node** (`ctrl-add-node`) is still reachable signed out — it places a node
  directly with no AI call, so it isn't gated.

New accounts get a starter allowance of free credits; the running balance shows
under ⚙ → ACCOUNT (`settings-credits-amount`).

---

## Capacitor Project Setup

The Argument Mapper is a Vite/React app with a Capacitor Android project scaffolded at `android/`. Relevant files:

- `package.json` — `@capacitor/android`, `@capacitor/core`, `@capacitor/cli`,
  `@capacitor/device`, `@capacitor/clipboard`
- `vite.config.js` — build output goes to `dist/`; also splits vendor chunks
- `android/` — the Capacitor Android project opened in Android Studio
- `scripts/gradlew.mjs` — picks `gradlew` or `gradlew.bat` per platform
- `scripts/upload-apk.mjs` — uploads finished artifacts to Google Drive via rclone
- `QUICKSTART.md` — app feature guide
- `tests/apk/` — APK validation suites (`npm run validate:apk`)

Adding a Capacitor plugin requires `npx cap sync android` and a rebuild, and
commits changes to `android/capacitor.settings.gradle` and
`android/app/capacitor.build.gradle`.

To rebuild web assets and sync to Android before running:
```bash
npm run build:mobile   # ⚠️ NOT "npm run build" — see warning below
npx cap sync android
```
Then run from Android Studio.

> **Use `npm run build:mobile`, not plain `npm run build`.** It sets
> `BUILD_TARGET=mobile`, which makes the Vite `base` relative (`./`) instead of
> root-absolute (`/`).
>
> **The old "blank screen" warning here was out of date on two counts.** It
> claimed web builds use `/argument_mapper/` — `vite.config.js` actually uses
> `/`. And it claimed the wrong base produces a blank APK: tested 2026-07-30 by
> deliberately shipping a web-base build to the emulator, and it rendered
> correctly. Capacitor 8 serves the WebView from `https://localhost/`, not
> `file://`, so root-absolute asset paths still resolve.
>
> `build:mobile` remains correct and `npm run test:apk` still fails the build on
> absolute paths — but treat that as a convention check, not a live-bug guard.
> If `server.androidScheme` is ever set to `file`, the original failure returns.
>
> To build the full APK in one command: `npm run build:apk`

---

## Open Items

- [ ] Set up signed release APK / keystore for Play Store distribution
- [ ] Confirm desktop launcher (`android-studio.desktop`) PATH inheritance (currently unreliable — use terminal launch)
- [ ] Export `JAVA_HOME` in `.bashrc` on this machine (see the note at the top)
- [ ] Create an own-brand rclone `client_id` — the shared one rclone uses by
      default is being retired during 2026 and will stop working
- [ ] Versioned filenames for uploaded APKs; every build currently overwrites
      the same `app-debug.apk`, so there's no build history to match a tester's
      report against

## Done since the original handoff (2026-07-30)

- Google Drive auto-upload now actually fires. It never worked: the hook
  iterated `assembleDebug.outputs.files`, and `assemble*` are aggregation tasks
  that declare no outputs, so the loop body never ran.
- `npm run validate:apk` builds and validates the APK — 54 checks, static plus
  on-device, with an HTML screenshot report.
- Guest mode deprecated; see the auth section above.
