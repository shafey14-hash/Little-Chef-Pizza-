// src/lib/app-push.js
//
// Native FCM push for the Android app — the React Native port of the
// website's js/app-push.js (Capacitor PushNotifications →
// @react-native-firebase/messaging).
//
// Backend contract (api/app-push-subscribe.js), both with a Bearer Supabase
// access token — profile id + role are resolved SERVER-SIDE:
//   POST { action: "subscribe",   token }  → saves the fcm_token on the profile
//   POST { action: "unsubscribe", token }  → detaches the device on logout
//
// Message states — the backend always sends notification + data { url, tag }:
//   • foreground: Android does not display tray notifications while the app
//     is open; the Supabase realtime subscriptions already refresh every
//     screen within a second (same reasoning as the website's
//     pushNotificationReceived → LCP_NOTIFY.poke), so nothing to do here.
//   • background / killed: Android itself renders the notification in the
//     system tray — nothing to do in JS.
//   • tapped: onNotificationOpenedApp (background) and
//     getInitialNotification (killed) map data.url onto an in-app screen —
//     /admin/orders.html → AdminOrders, anything else → Orders.
//
// Logout MUST call unregisterAppPush() BEFORE supabase.auth.signOut() — the
// unsubscribe request needs the still-live access token (the website's
// js/nav.js doLogout does exactly this).

import { Platform } from "react-native";
import messaging from "@react-native-firebase/messaging";
import { apiPostAuthed } from "./api";
import { supabase } from "./supabase";

let started = false;
let currentUserId = null;
let cachedToken = null;

// Killed/background data-only fallback — must be registered at module scope,
// synchronously as the JS bundle loads. Our backend always includes a
// notification block (Android renders those itself), so this normally never
// fires.
try {
  messaging().setBackgroundMessageHandler(async () => {});
} catch (e) {
  /* native Firebase missing (e.g. Expo Go) — push silently unavailable */
}

async function accessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session ? session.access_token : null;
}

async function registerToken(token) {
  cachedToken = token;
  if (!currentUserId || !token) return;
  try {
    const t = await accessToken();
    if (!t) return;
    await apiPostAuthed(
      "/api/app-push-subscribe",
      { action: "subscribe", token },
      t,
    );
  } catch (e) {
    console.warn("app push register failed (will retry next launch):", e.message);
  }
}

export async function startAppPush(user) {
  if (Platform.OS !== "android") return;
  currentUserId = user ? user.id : null;
  if (started) {
    // Same app session, possibly a different account (login/logout swap):
    // re-attach the token we already have to whoever is signed in now.
    if (cachedToken && currentUserId) await registerToken(cachedToken);
    return;
  }
  started = true;
  try {
    messaging().onTokenRefresh((t) => registerToken(t));
    const auth = await messaging().requestPermission();
    if (
      auth !== messaging.AuthorizationStatus.AUTHORIZED &&
      auth !== messaging.AuthorizationStatus.PROVISIONAL
    ) {
      console.warn(
        "Notifications blocked — enable them in phone Settings → Apps → Little Chef Pizza.",
      );
      return;
    }
    const token = await messaging().getToken();
    await registerToken(token);
  } catch (e) {
    console.error("FCM setup failed:", e.message);
  }
}

// Detach the JS-side account binding without touching the server row — the
// row keeps working (parity with the website, where a device is only
// detached on real logout).
export function stopAppPush() {
  currentUserId = null;
}

export async function unregisterAppPush() {
  const token = cachedToken;
  currentUserId = null;
  if (!token) return;
  try {
    const t = await accessToken();
    if (!t) return;
    await apiPostAuthed(
      "/api/app-push-subscribe",
      { action: "unsubscribe", token },
      t,
    );
  } catch (e) {
    /* the row dies on the next dead-token sweep anyway */
  }
}

// Map a push payload's data.url (the website path the backend picked) onto an
// in-app screen. Admin urls only resolve for admins — everyone else lands on
// the orders tab.
export function routeForUrl(url, isAdmin) {
  if (typeof url !== "string" || !url.startsWith("/")) return null;
  if (url.startsWith("/admin")) return isAdmin ? "AdminOrders" : "Orders";
  return "Orders";
}

// Register the tap-navigation listeners once. Returns a cleanup function.
export function initAppPushNav(onOpen) {
  let unsubOpened = () => {};
  try {
    unsubOpened = messaging().onNotificationOpenedApp((msg) => {
      const url = msg?.data?.url;
      if (url) onOpen(url);
    });
    messaging()
      .getInitialNotification()
      .then((msg) => {
        const url = msg?.data?.url;
        if (url) onOpen(url);
      })
      .catch(() => {});
  } catch (e) {
    /* native Firebase missing — nothing to wire */
  }
  return () => {
    try {
      unsubOpened();
    } catch (e) {}
  };
}
