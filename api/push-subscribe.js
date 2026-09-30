// api/push-subscribe.js
//
// A Vercel serverless endpoint — called by the browser (js/notify.js) when
// a logged-in user taps "Enable background notifications" (or turns them
// off) in the bell panel.
//
// The caller proves who they are with their Supabase access token; the
// service role then writes the browser's push subscription into
// public.push_subscriptions (see supabase/push_notifications.sql). The
// profile id + role are looked up SERVER-SIDE from that token — never
// trusted from the request body.
//
// Requires these Vercel env vars (already set for the other endpoints):
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

const {
  getUserFromAccessToken,
  bearerToken,
  dbRest,
} = require("./_lib/supabase-admin");

module.exports = async (req, res) => {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = await getUserFromAccessToken(bearerToken(req));
    if (!user) return res.status(401).json({ error: "Please log in again." });

    const prof = await dbRest(
      `profiles?auth_user_id=eq.${encodeURIComponent(user.id)}&select=id,role`,
    );
    const profile = Array.isArray(prof.data) ? prof.data[0] : null;
    if (prof.status !== 200 || !profile)
      return res
        .status(403)
        .json({ error: "No profile found for this account." });

    const body = req.body || {};
    const action = body.action === "unsubscribe" ? "unsubscribe" : "subscribe";
    const sub = body.subscription || {};
    const endpoint = String(sub.endpoint || "").trim();

    if (!endpoint.startsWith("https://"))
      return res.status(400).json({ error: "Invalid subscription endpoint." });

    if (action === "unsubscribe") {
      await dbRest(
        `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
        { method: "DELETE" },
      );
      return res.status(200).json({ ok: true });
    }

    const p256dh = String((sub.keys && sub.keys.p256dh) || "").trim();
    const auth = String((sub.keys && sub.keys.auth) || "").trim();
    if (!p256dh || !auth)
      return res.status(400).json({ error: "Subscription keys missing." });

    const { status } = await dbRest("push_subscriptions?on_conflict=endpoint", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: {
        profile_id: profile.id,
        role: profile.role === "admin" ? "admin" : "customer",
        endpoint,
        p256dh,
        auth,
        user_agent: String(req.headers["user-agent"] || "").slice(0, 300),
        updated_at: new Date().toISOString(),
      },
    });
    if (status !== 200 && status !== 201 && status !== 204)
      return res.status(500).json({ error: "Could not save the subscription." });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("push-subscribe failed:", err);
    return res.status(500).json({ error: "Unexpected error." });
  }
};
