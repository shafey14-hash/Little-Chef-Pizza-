/**
 * app-push.js — native Firebase push for the installed Android app.
 *
 * Loaded ONLY inside the Capacitor APK (nav.js injects it when
 * Capacitor.isNativePlatform() is true). A WebView has no Web Push API, so
 * background notifications reach the app through Firebase Cloud Messaging
 * instead: Android shows them in the notification shade even when the app
 * was swiped away, and this file bridges the plugin with our backend —
 *
 *   registration                 → POST the FCM token to /api/app-push-subscribe
 *   registrationError            → log; the bell panel's web-push path stays hidden
 *   pushNotificationReceived     → app is OPEN: nudge the bell engine
 *                                  (LCP_NOTIFY.poke) so the popup/toast and
 *                                  the order lists update instantly; the
 *                                  Supabase realtime subscription underneath
 *                                  already dedupes, so no double toasts
 *   pushNotificationActionPerformed → notification tapped: go to the page the
 *                                  payload asked for (orders / admin orders)
 *
 * Logout detaches the device via /api/app-push-subscribe { action:"unsubscribe" }.
 */
const LCP_APP_PUSH = (() => {
  let started = false;
  let listenersBound = false;
  let currentUserId = null;
  let cachedToken = null;

  function nativePush() {
    if (!window.Capacitor?.isNativePlatform?.()) return null;
    const push = window.Capacitor.Plugins?.PushNotifications;
    return push || null;
  }

  async function api(path, body) {
    const base = ((LCP_CONFIG && LCP_CONFIG.API_BASE_URL) || "").replace(
      /\/+$/,
      "",
    );
    const token = await LCP_DB?.auth?.getAccessToken?.();
    if (!token) throw new Error("Not signed in.");
    const res = await fetch(base + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  async function registerToken(token) {
    cachedToken = token;
    if (!currentUserId) return; // guest — nothing to attach the device to
    try {
      await api("/api/app-push-subscribe", { action: "subscribe", token });
    } catch (err) {
      console.warn("app push register failed (will retry next launch):", err.message);
    }
  }

  function bindListeners(push) {
    if (listenersBound) return;
    listenersBound = true;

    push.addListener("registration", (t) => {
      if (t && t.value) registerToken(t.value);
    });

    push.addListener("registrationError", (err) => {
      console.error("FCM registration error:", err?.error || err);
    });

    push.addListener("pushNotificationReceived", () => {
      // App is in the foreground — the realtime subscription + bell engine
      // surface the update (toast + badge) within a second. Poking them here
      // only covers the rare moment the websocket is reconnecting.
      try {
        LCP_NOTIFY?.poke?.();
      } catch (e) {
        /* bell not running on this page — realtime still covers us */
      }
    });

    push.addListener("pushNotificationActionPerformed", (action) => {
      const url = action?.notification?.data?.url;
      if (typeof url === "string" && url.startsWith("/")) {
        window.location.href = url;
      }
    });
  }

  async function start(user) {
    const push = nativePush();
    if (!push) return;
    currentUserId = user ? user.id : null;
    if (started) {
      // Same app session, possibly a different account (login/logout swap):
      // re-attach the token we already have to whoever is signed in now.
      if (cachedToken && currentUserId) registerToken(cachedToken);
      return;
    }
    started = true;
    bindListeners(push);

    try {
      const perm = await push.requestPermissions();
      if (perm.receive !== "granted") return; // user said no — stay quiet
      await push.register(); // fires "registration" with the FCM token
    } catch (err) {
      console.error("FCM setup failed:", err?.message || err);
    }
  }

  async function unregister() {
    const token = cachedToken;
    currentUserId = null;
    if (!token) return;
    try {
      const base = ((LCP_CONFIG && LCP_CONFIG.API_BASE_URL) || "").replace(
        /\/+$/,
        "",
      );
      const authToken = await LCP_DB?.auth?.getAccessToken?.();
      if (!authToken) return;
      await fetch(base + "/api/app-push-subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ action: "unsubscribe", token }),
      });
    } catch (e) {
      /* row dies on the next dead-token sweep anyway */
    }
  }

  return { start, unregister };
})();
