// api/push-notify.js
//
// A Vercel serverless endpoint with two jobs:
//
//  1. WEBHOOK (x-webhook-secret header) — called by the Postgres trigger in
//     supabase/push_notifications.sql whenever an order is created or its
//     status changes. Sends a Web Push notification via the browser's own
//     push service, so it arrives even when the site is closed:
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

const webpush = require("web-push");
const {
  getUserFromAccessToken,
  bearerToken,
  dbRest,
} = require("./_lib/supabase-admin");

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

      let subs = [];
      if (event === "order_placed") {
        subs = await subsFor("role=eq.admin");
      } else {
        if (!order.user_id)
          return res
            .status(200)
            .json({ ok: true, sent: 0, note: "guest order — no devices" });
        subs = await subsFor(
          `profile_id=eq.${encodeURIComponent(order.user_id)}`,
        );
      }

      const result = await sendToSubscriptions(subs, payloadFor(event, order));
      return res.status(200).json({ ok: true, ...result });
    }

    // ── 2. "Send test" button — caller's own devices only ──
    const user = await getUserFromAccessToken(bearerToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const prof = await dbRest(
      `profiles?auth_user_id=eq.${encodeURIComponent(user.id)}&select=id,role`,
    );
    const profile = Array.isArray(prof.data) ? prof.data[0] : null;
    if (!profile) return res.status(403).json({ error: "No profile found." });

    const subs = await subsFor(
      `profile_id=eq.${encodeURIComponent(profile.id)}`,
    );
    if (!subs.length)
      return res
        .status(200)
        .json({ ok: true, sent: 0, note: "This device isn't subscribed." });

    const result = await sendToSubscriptions(subs, {
      title: "🍕 Test Notification",
      body: "Background notifications are working on this device. Order updates will arrive here even when the app is closed.",
      url:
        profile.role === "admin"
          ? "/admin/orders.html"
          : "/customer/orders.html",
      tag: "lcp-test",
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("push-notify failed:", err);
    return res.status(500).json({ error: "Unexpected error." });
  }
};
