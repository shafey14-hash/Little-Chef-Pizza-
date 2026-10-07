/**
 * sw.js — Little Chef Pizza service worker.
 *
 * Lives at the site root so its scope covers every page ("/"). Its only
 * job is background push: the browser wakes this worker when a push
 * arrives from our server (api/push-notify.js) — even when the site tab
 * or the whole browser window was closed — and the worker shows a system
 * notification. Clicking the notification focuses an open tab or opens
 * the orders page.
 *
 * This file must ALWAYS stay at the root (not js/sw.js), otherwise the
 * worker can't control the whole origin.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Little Chef Pizza";
  const options = {
    body: data.body || "You have a new update from Little Chef Pizza.",
    icon: "/assets/images/logo/logo-badge.png",
    badge: "/assets/images/logo/logo-badge.png",
    tag: data.tag || "lcp-order",
    renotify: true,
    data: { url: data.url || "/customer/orders.html" },
    // Custom sound for browser notifications (Chrome on Android/Desktop).
    // Place your sound file at /assets/sounds/notification.mp3
    // Most browsers do NOT support the 'sound' field in showNotification —
    // instead we message the open page to play it (see the message below).
    // Some Android browsers (Samsung Internet) do honour this field:
    sound: "/assets/sounds/notification.mp3",
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      // Tell every open tab of this site to play the custom sound.
      // js/notify.js listens for this message and plays the audio.
      return self.clients.matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: "LCP_PLAY_SOUND" });
          });
        });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) ||
    "/customer/orders.html";
  const targetUrl = new URL(target, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch (e) {
              /* navigation not allowed — the focused tab is still fine */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
    })(),
  );
});
