# Android / Capacitor Setup Handoff

**Last updated: 2026-06-04**
**Goal: Run the Argument Mapper app on an Android emulator via Android Studio**

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

Sign-in is **optional** — users can use the app as guests immediately. Sign-in is only nudged when a user has unsaved nodes ("Sign in to keep it"). There is no hard gate requiring auth before use.

---

## Capacitor Project Setup

The Argument Mapper is a Vite/React app with a Capacitor Android project scaffolded at `android/`. Relevant files:

- `package.json` — has `@capacitor/android`, `@capacitor/core`, `@capacitor/cli`
- `vite.config.js` — build output goes to `dist/`
- `android/` — the Capacitor Android project opened in Android Studio
- `QUICKSTART.md` — project-level quickstart notes

To rebuild web assets and sync to Android before running:
```bash
npm run build
npx cap sync android
```
Then run from Android Studio.

---

## Open Items

- [ ] Set up signed release APK / keystore for Play Store distribution
- [ ] Confirm desktop launcher (`android-studio.desktop`) PATH inheritance (currently unreliable — use terminal launch)
