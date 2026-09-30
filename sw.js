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
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
