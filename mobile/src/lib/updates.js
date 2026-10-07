// src/lib/updates.js
//
// expo-updates OTA + the major-version gate (master prompt B + C).
//
// OTA (release builds only): on launch, check EAS Update; if a newer bundle
// exists, download it quietly and reload once ready — the app heals itself
// without a Play-Store round-trip. JS-only fixes ship this way.
//
// Version gate: fetch /app-version.json from the website (a static file, so
// every launch sees the newest values). If the installed app's version is
// below minVersion, the caller shows the blocking "A new version of the app
// is available!" modal that links to the APK — native code / schema changes
// ship this way, because OTA cannot touch them.
//
// Shafey workflow on every release: bump "version" in mobile/app.json, build
// the APK, and raise "minVersion" in app-version.json whenever the new build
// MUST be installed (default copy shows when "message" is empty).

import Constants from "expo-constants";
import * as Updates from "expo-updates";

export const APK_URL = "https://little-chef-pizza.vercel.app/app.apk";
export const VERSION_URL =
  "https://little-chef-pizza.vercel.app/app-version.json";

function parseVersion(v) {
  const m = String(v || "").match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
}

export function isOutdated(appVersion, minVersion) {
  const a = parseVersion(appVersion);
  const m = parseVersion(minVersion);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== m[i]) return a[i] < m[i];
  }
  return false;
}

// Fire-and-forget; never throws into the caller's launch path.
export function initOtaUpdates() {
  if (__DEV__ || !Updates.isEnabled) return;
  (async () => {
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return;
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (e) {
      console.warn("OTA update check failed:", e.message);
    }
  })();
}

// Resolves with the /app-version.json payload when the installed version is
// below minVersion, otherwise null (fetch/parse failures never block the app).
export async function checkMinVersion() {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const appVersion = Constants.expoConfig?.version || "0.0.0";
    return isOutdated(appVersion, data.minVersion) ? data : null;
  } catch (e) {
    return null;
  }
}
