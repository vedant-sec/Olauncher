# Progress Mirror Launcher

A single monorepo containing:

- **`web/`** — Progress Mirror, a Vite + TypeScript Canvas 2D web app (IndexedDB/localStorage, PWA, JSON export/import) that visualizes goals and actions as a “Then vs Now” map.
- **Android launcher** — a fork of [Olauncher](https://github.com/tanujnotes/Olauncher) (Kotlin, Android) that embeds the web app in a full-screen WebView as the home screen.

> Screenshot placeholder: add `docs/screenshot.png` and replace this line with `![Progress Mirror](docs/screenshot.png)`.

## Credits & License

This project is a fork of **[Olauncher](https://github.com/tanujnotes/Olauncher)** by [@tanujnotes](https://github.com/tanujnotes). Original Olauncher credit and GPL license are preserved.

**The whole repo is GPLv3.** See [LICENSE](./LICENSE).

## Project structure

```text
.
├── app/                  # Android launcher (Kotlin)
│   └── src/main/assets/mirror/   # Built web app (committed)
├── web/                  # Progress Mirror web app (Vite + TypeScript)
├── scripts/
│   └── build-web.sh      # Build web app into Android assets
├── build.gradle
└── README.md
```

## Run the web app on its own

Requirements: **Node.js 18+** (Vite 5 requires Node 18, 20, or 22+; Node 20+ recommended) and npm.

```bash
cd web
npm install
npm run dev
```

Vite will print a local URL (usually `http://localhost:5173`). For the launcher-embedded mode, open `http://localhost:5173/?launcher=1`.

## Build the Android launcher

Requirements: Android Studio (with Android SDK) or JDK + Android SDK command-line tools.

- **Android Studio:** open the repo root, let Gradle sync, then Run.
- **Command line:**

```bash
./gradlew assembleDebug
```

If `ANDROID_HOME` / `ANDROID_SDK_ROOT` is not set, configure the Android SDK first (Android Studio usually handles this).

## Rebuild after changing the web app

The Android app serves the built web files from `app/src/main/assets/mirror/`. After changing anything in `web/`:

```bash
scripts/build-web.sh
./gradlew assembleDebug
```

`scripts/build-web.sh` runs `npm install` and `npm run build` inside `web/`. The Vite build writes directly to `app/src/main/assets/mirror/` (see `web/vite.config.ts`).

## Set as the default home app

1. Install the debug/release APK on your Android device.
2. Press Home or go to **Settings > Apps > Default apps > Home app** (path varies by device).
3. Select this launcher as the default Home app.
4. Press Home to open Progress Mirror.

To get back to the previous launcher, change the default Home app in Android settings.

## Notes

- `web/node_modules/` and `web/dist/` are ignored; `app/src/main/assets/mirror/` is committed so Android can build without Node.
- `web/package-lock.json` is committed for reproducible installs.
