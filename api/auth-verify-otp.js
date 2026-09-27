// api/auth-verify-otp.js
//
// Vercel endpoint: POST /api/auth-verify-otp
//
// Step 2 of signup — REPLACES sb.auth.verifyOtp(). Checks the code against
// OUR email_verification_codes table (not Supabase's), and on success marks
// the auth user confirmed via the service role. The frontend then signs the
// customer in with their password as usual.

const {
  updateAuthUser,
  findAuthUserByEmail,
  getVerificationCode,
  incrementCodeAttempts,
  deleteVerificationCode,
} = require("./_lib/supabase-admin");

const MAX_ATTEMPTS = 5;

module.exports = async (req, res) => {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { email, token } = req.body || {};
    if (!email || !token)
      return res.status(400).json({ error: "Email and code are required." });

    const cleanEmail = String(email).trim().toLowerCase();
    const row = await getVerificationCode(cleanEmail);
    if (!row)
      return res.status(400).json({
        error: "That code has expired. Please request a new one.",
      });

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

    // ── Confirmed — activate the account ──
    const userId = row.auth_user_id || (await findAuthUserByEmail(cleanEmail))?.id;
    if (!userId) {
      // Without a user to confirm, returning "verified" would strand the
      // customer in a verify→login→verify loop. Fail loudly instead; the
      // code row stays valid so they can retry after the underlying issue
      // (e.g. a deleted auth user) is fixed.
      console.error("auth-verify-otp: no auth user found for", cleanEmail);
      return res.status(500).json({ error: "Something went wrong. Please try again." });
    }
    const upd = await updateAuthUser(userId, { email_confirm: true });
    if (upd.status !== 200) {
      console.error("auth-verify-otp confirm failed:", upd.status, upd.data);
      return res
        .status(500)
        .json({ error: "Verification succeeded but activation failed. Please try again." });
    }

    await deleteVerificationCode(cleanEmail);
    return res.status(200).json({ ok: true, verified: true });
  } catch (err) {
    console.error("auth-verify-otp failed:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};
