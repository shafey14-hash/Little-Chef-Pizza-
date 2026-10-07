// src/config.js
//
// App-wide constants. The Supabase URL + anon key are public by design
// (same values as js/config.js on the website). The API base must be
// ABSOLUTE here because native fetch has no origin to be relative to.

import * as Application from "expo-application";

export const SUPABASE_URL = "https://lambfbjicnvqjrraerur.supabase.co";

export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhbWJmYmppY252cWpycmFlcnVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MDAyNzYsImV4cCI6MjEwNDE3NjI3Nn0.xJEDNyC8gyE5vYYmY4JjmtJr05AJnzrBkQoI_3Z6KSE";

export const API_BASE = "https://little-chef-pizza.vercel.app";

// Version gate: fetched at startup; if latestVersion > this build's
// version, the "new version available" modal points at the APK below.
export const VERSION_CHECK_URL = `${API_BASE}/app-version.json`;
export const APK_URL = `${API_BASE}/app.apk`;

// Native app version from app.json ("version"), e.g. "1.0.0".
export const APP_VERSION = Application.nativeApplicationVersion || "0.0.0";

// Restaurant center used server-side for delivery charge; kept here only
// for the "distance from shop" hint text if needed.
export const CENTER = { lat: 32.57349, lng: 74.0817 };

export function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}
