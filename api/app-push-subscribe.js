// api/app-push-subscribe.js
//
// A Vercel serverless endpoint — called by the Android app (js/app-push.js,
// only inside the Capacitor WebView) when Firebase hands the device a fresh
// FCM registration token, and on logout to detach the device.
//
// The caller proves who they are with their Supabase access token; the
// service role then writes the FCM token into public.app_push_tokens
// (see supabase/app_push.sql). The profile id + role are looked up
// SERVER-SIDE from that token — never trusted from the request body.
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
    const token = String(body.token || "").trim();

    // FCM registration tokens are ~160-char URL-safe base64 strings.
    if (!token || token.length < 20 || token.length > 4096 || /\s/.test(token))
      return res.status(400).json({ error: "Invalid FCM token." });

    if (action === "unsubscribe") {
      await dbRest(
        `app_push_tokens?fcm_token=eq.${encodeURIComponent(token)}`,
        { method: "DELETE" },
      );
      return res.status(200).json({ ok: true });
    }

    const { status } = await dbRest("app_push_tokens?on_conflict=fcm_token", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: {
        profile_id: profile.id,
        role: profile.role === "admin" ? "admin" : "customer",
        fcm_token: token,
        platform: "android",
        updated_at: new Date().toISOString(),
      },
    });
    if (status !== 200 && status !== 201 && status !== 204)
      return res.status(500).json({ error: "Could not save the token." });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("app-push-subscribe failed:", err);
    return res.status(500).json({ error: "Unexpected error." });
  }
};
