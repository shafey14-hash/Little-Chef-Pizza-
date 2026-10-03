// api/push-notify.js
//
// A Vercel serverless endpoint with two jobs:
//
//  1. WEBHOOK (x-webhook-secret header) — called by the Postgres trigger in
//     supabase/push_notifications.sql whenever an order is created or its
//     status changes. Delivers through BOTH push channels:
//       • Web Push (VAPID)  → browsers, even when the tab/browser is closed
//       • FCM (native)      → the Android app, even when it is swiped away
//       • new order      → every admin device
//       • status changed → that customer's own devices
//
//  2. TEST (Authorization: Bearer <supabase access token>) — called by
//     js/notify.js when the user taps "Send test" in the bell panel. Sends
//     a test push to the caller's own devices only.
//
// Requires these Vercel env vars:
//   VAPID_PRIVATE_KEY   (secret — from your local APP-SECRETS-SETUP.txt)
//   VAPID_SUBJECT       (optional; mailto:you@gmail.com — defaults to the
//                        site URL)
//   EMAIL_WEBHOOK_SECRET (re-used here to authorize the DB trigger)
//   FCM_SERVICE_ACCOUNT (optional; full Firebase service-account JSON — only
//                        needed for the Android app channel. Missing = FCM
//                        silently skipped, Web Push keeps working.)

const webpush = require("web-push");
const {
  getUserFromAccessToken,
  bearerToken,
  dbRest,
} = require("./_lib/supabase-admin");
const { fcmConfigured, sendToAppTokens } = require("./_lib/fcm");

// Public by design — the same key also ships in js/config.js.
const VAPID_PUBLIC_KEY =
  "BCj0KkbG505EY3pEN_vGO2WFtC9v9U_1D4mrM9W8nn1MHpPwGR7yJwv0SPtJ_QEevDB1q6zOw_pQs8MQn6755Lc";
const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "https://little-chef-pizza.vercel.app";

let vapidReady = false;
function initVapid() {
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  if (!privateKey) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, privateKey);
    vapidReady = true;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────
// Notification content
// ─────────────────────────────────────────────────────────────
function payloadFor(event, order) {
  const n = order.order_number || "";
  const tag = `order-${n}`;

  if (event === "order_placed") {
    const type = (order.order_type || "").toUpperCase();
    return {
      title: "🔔 New Order Placed",
      body: `Order ${n} — Rs. ${order.total}${type ? ` (${type})` : ""}`,
      url: "/admin/orders.html",
      tag,
    };
  }

  const base = { url: "/customer/orders.html", tag };
  const status = order.status;
  if (status === "payment_verification")
    return { ...base, title: "Order Placed ⏳", body: `Order ${n} placed — payment is being verified.` };
  if (status === "pending")
    return { ...base, title: "Order Placed 🍕", body: `Order ${n} placed — waiting for the restaurant to confirm it.` };
  if (status === "confirmed")
    return { ...base, title: "Order Confirmed ✅", body: `Order ${n} has been confirmed by the restaurant.` };
  if (status === "out_for_delivery")
    return { ...base, title: "Out for Delivery 🛵", body: `Order ${n} is on its way to you!` };
  if (status === "delivered")
    return { ...base, title: "Order Delivered 🍕", body: `Order ${n} delivered. Enjoy your meal!` };
  if (status === "rejected") {
    if (order.rejection_reason === "cancelled")
      return { ...base, title: "Order Cancelled", body: `Order ${n} was cancelled.` };
    if (order.rejection_reason === "failed_delivery")
      return { ...base, title: "Delivery Failed", body: `Order ${n} — delivery failed. Please contact the restaurant.` };
    return { ...base, title: "Order Rejected", body: `Order ${n} was rejected by the restaurant.` };
  }
  return { ...base, title: "Order Update", body: `Order ${n} status updated.` };
}

// ─────────────────────────────────────────────────────────────
// Sending
// ─────────────────────────────────────────────────────────────
async function sendToSubscriptions(subs, payload) {
  let sent = 0;
  let removed = 0;
  await Promise.all(
    (subs || []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (err) {
        const code = err && err.statusCode;
        if (code === 404 || code === 410) {
          // Device unsubscribed / browser data wiped — drop the dead row.
          await dbRest(
            `push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`,
            { method: "DELETE" },
          );
          removed += 1;
        } else {
          console.error("push send failed:", code, err && err.body);
        }
      }
    }),
  );
  return { sent, removed };
}

async function subsFor(query) {
  const { data } = await dbRest(
    `push_subscriptions?${query}&select=endpoint,p256dh,auth`,
  );
  return Array.isArray(data) ? data : [];
}

// ── Android app channel (FCM) ─────────────────────────────────
// app_push_tokens rows for the same audience as the Web Push query above:
//   role=eq.admin              → every admin device
//   profile_id=eq.<id>         → one customer's devices
async function appTokensFor(query) {
  const { data } = await dbRest(
    `app_push_tokens?${query}&select=fcm_token`,
  );
  if (!Array.isArray(data)) return [];
  return data.map((r) => r.fcm_token).filter(Boolean);
}

async function pruneAppToken(token) {
  await dbRest(
    `app_push_tokens?fcm_token=eq.${encodeURIComponent(token)}`,
    { method: "DELETE" },
  );
}

// Fires the same payload at every app token; never throws — FCM is an
// add-on channel, a failure here must not break Web Push delivery.
async function sendFcm(query, payload) {
  if (!fcmConfigured()) return { sent: 0, removed: 0 };
  try {
    const tokens = await appTokensFor(query);
    if (!tokens.length) return { sent: 0, removed: 0 };
    return await sendToAppTokens(tokens, {
      ...payload,
      onDeadToken: pruneAppToken,
    });
  } catch (err) {
    console.error("FCM fan-out failed:", err.message);
    return { sent: 0, removed: 0 };
  }
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    if (!initVapid())
      return res
        .status(500)
        .json({ error: "VAPID_PRIVATE_KEY is not set on the server." });

    // ── 1. DB trigger webhook ──
    const secret = req.headers["x-webhook-secret"];
    if (secret && secret === process.env.EMAIL_WEBHOOK_SECRET) {
      const { event, order } = req.body || {};
      if (!event || !order)
        return res.status(400).json({ error: "Missing event/order." });

      const payload = payloadFor(event, order);
      let subs = [];
      let appQuery = "";
      if (event === "order_placed") {
        subs = await subsFor("role=eq.admin");
        appQuery = "role=eq.admin";
      } else {
        if (!order.user_id)
          return res
            .status(200)
            .json({ ok: true, sent: 0, note: "guest order — no devices" });
        subs = await subsFor(
          `profile_id=eq.${encodeURIComponent(order.user_id)}`,
        );
        appQuery = `profile_id=eq.${encodeURIComponent(order.user_id)}`;
      }

      const result = await sendToSubscriptions(subs, payload);
      const appResult = await sendFcm(appQuery, payload);
      return res.status(200).json({
        ok: true,
        ...result,
        appSent: appResult.sent,
        appRemoved: appResult.removed,
      });
    }

    // ── 2. "Send test" button — caller's own devices only ──
    const user = await getUserFromAccessToken(bearerToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const prof = await dbRest(
      `profiles?auth_user_id=eq.${encodeURIComponent(user.id)}&select=id,role`,
    );
    const profile = Array.isArray(prof.data) ? prof.data[0] : null;
    if (!profile) return res.status(403).json({ error: "No profile found." });

    const profQuery = `profile_id=eq.${encodeURIComponent(profile.id)}`;
    const subs = await subsFor(profQuery);
    // The APK has no Web Push, so a test must reach it through FCM alone —
    // fetch both audiences up front and only refuse when NEITHER exists.
    const appTokens = fcmConfigured() ? await appTokensFor(profQuery) : [];
    if (!subs.length && !appTokens.length)
      return res
        .status(200)
        .json({ ok: true, sent: 0, note: "This device isn't subscribed." });

    const testPayload = {
      title: "🍕 Test Notification",
      body: "Background notifications are working on this device. Order updates will arrive here even when the app is closed.",
      url:
        profile.role === "admin"
          ? "/admin/orders.html"
          : "/customer/orders.html",
      tag: "lcp-test",
    };
    const result = subs.length
      ? await sendToSubscriptions(subs, testPayload)
      : { sent: 0, removed: 0 };
    const appResult = appTokens.length
      ? await sendToAppTokens(appTokens, {
          ...testPayload,
          onDeadToken: pruneAppToken,
        })
      : { sent: 0, removed: 0 };
    return res
      .status(200)
      .json({ ok: true, ...result, appSent: appResult.sent });
  } catch (err) {
    console.error("push-notify failed:", err);
    return res.status(500).json({ error: "Unexpected error." });
  }
};
