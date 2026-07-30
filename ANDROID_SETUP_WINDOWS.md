# Android setup — Windows

Companion to `ANDROID_SETUP_HANDOFF.md`, which covers the Linux machine only.
Set up 2026-07-30 on Windows 11 (Ryzen 5 PRO 4650U, 15 GB RAM).

## Toolchain

| Thing | Path / version |
|---|---|
| JDK | Temurin 21.0.12 — `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot` |
| Android Studio | 2026.1.2 — `C:\Program Files\Android\Android Studio` |
| Android SDK | `C:\Users\Alex\AppData\Local\Android\Sdk` |
| Node | 22.23.1 (matches `.nvmrc`) |

User env vars set: `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, plus
`platform-tools`, `cmdline-tools\latest\bin`, and `emulator` on PATH.

SDK packages: `platform-tools`, `platforms;android-36`, `build-tools;36.0.0`,
`emulator`, `system-images;android-36;google_apis;x86_64`.

Installed headlessly via `sdkmanager` rather than Studio's first-run wizard.
Studio points at the same SDK.

## Build

```powershell
npm run build:apk          # build:mobile -> cap sync -> gradlew assembleDebug
npm run validate:apk       # the above, then the full APK test suite
```

Output: `android\app\build\outputs\apk\debug\app-debug.apk` (~4.3 MB).

First Gradle run downloads the 8.14.3 distribution (~3.5 min). Incremental
rebuilds are ~4s.

## Portability fixes applied

Three things were hardcoded to Linux and broke on Windows:

- `build:mobile` used `BUILD_TARGET=mobile vite build` — bash-only. Now uses
  `cross-env`.
- `build:apk` used `cd android && ./gradlew` — resolves under sh, not cmd. Now
  `node scripts/gradlew.mjs`, which picks `gradlew.bat` or `./gradlew`.
- `android/gradle.properties` set `org.gradle.java.home=/home/alex/.local/jdk21`.
  Removed — Gradle resolves JAVA_HOME. **The Linux machine now needs `JAVA_HOME`
  exported** (add to `.bashrc`) since it no longer gets the path from this file.

## The blank-screen warning is stale

`ANDROID_SETUP_HANDOFF.md` warns that `npm run build` (web base) produces a
blank-screen APK. Tested 2026-07-30: it doesn't anymore. Capacitor 8 serves the
WebView from `https://localhost/`, not `file://`, so root-absolute `/assets/…`
resolves. A deliberately web-base APK installed and rendered correctly on the
emulator, all 11 device checks passing.

`build:mobile` is still the right command and `test:apk` still fails the build
on absolute paths — but as a convention check, not a live-bug guard. If
`server.androidScheme` is ever set to `file`, the old failure returns.

## Gotchas

- After a `winget install`, an already-open shell has a stale PATH. Refresh with
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`
  or open a new window.
- `sdkmanager --licenses` ignores a piped PowerShell string. Redirect a file of
  `y` lines with `cmd /c "sdkmanager.bat --licenses < yes.txt"`.
- The system-image download stalls silently on flaky network. Kill `java`, clear
  `%ANDROID_HOME%\.temp`, rerun.
