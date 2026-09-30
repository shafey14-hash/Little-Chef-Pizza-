// api/auth-verify-email-change.js
//
// Vercel endpoint: POST /api/auth-verify-email-change
//
// Step 2 of the verified email-change flow. The caller proves who they are
// with their Supabase access token AND with the 6-digit code we emailed to
// the new address (auth-change-email.js). Only then does the auth user's
// email actually move — and profiles.email is kept in step so the
// email/phone login lookup still resolves.

const {
  getUserFromAccessToken,
  bearerToken,
  getVerificationCode,
  incrementCodeAttempts,
  deleteVerificationCode,
  updateAuthUser,
  dbRest,
} = require("./_lib/supabase-admin");

const MAX_ATTEMPTS = 5;

module.exports = async (req, res) => {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = await getUserFromAccessToken(bearerToken(req));
    if (!user)
      return res
        .status(401)
        .json({ error: "Your session has expired. Please log in again." });

    const { email, token } = req.body || {};
    if (!email || !token)
      return res.status(400).json({ error: "Email and code are required." });

    const cleanEmail = String(email).trim().toLowerCase();
    const row = await getVerificationCode(cleanEmail);
    if (!row)
      return res.status(400).json({
        error: "That code has expired. Please request a new one.",
      });

    // A code is only ever valid for the account that requested it.
    if (row.auth_user_id && row.auth_user_id !== user.id)
      return res
        .status(403)
        .json({ error: "This code was requested by a different account." });

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await deleteVerificationCode(cleanEmail);
      return res.status(400).json({
        error: "That code has expired. Please request a new one.",
      });
    }

    if ((row.attempts || 0) >= MAX_ATTEMPTS)
      return res.status(400).json({
        error: "Too many incorrect attempts. Please request a new code.",
      });

    if (String(row.code) !== String(token).trim()) {
      await incrementCodeAttempts(cleanEmail);
      return res.status(400).json({
        error: "That code is incorrect. Please check your email and try again.",
      });
    }

    // ── Verified — move the account onto the new address ──
    const upd = await updateAuthUser(user.id, {
      email: cleanEmail,
      email_confirm: true,
    });
    if (upd.status !== 200) {
      console.error(
        "auth-verify-email-change update failed:",
        upd.status,
        upd.data,
      );
      return res.status(500).json({
        error:
          "Verification succeeded but the email change failed. Please try again.",
      });
    }

    // profiles.email powers the email/phone login lookup — keep it in step.
    await dbRest(`profiles?auth_user_id=eq.${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: { email: cleanEmail },
    });

    await deleteVerificationCode(cleanEmail);
    return res.status(200).json({ ok: true, email: cleanEmail });
  } catch (err) {
    console.error("auth-verify-email-change failed:", err);
    return res
      .status(500)
      .json({ error: "Something went wrong. Please try again." });
  }
};
