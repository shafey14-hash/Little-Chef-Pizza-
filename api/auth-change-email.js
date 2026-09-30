// api/auth-change-email.js
//
// Vercel endpoint: POST /api/auth-change-email
//
// Step 1 of the verified email-change flow (customer profile → Edit Details).
// The caller proves who they are with their Supabase access token; we then
// email a 6-digit code to the NEW address. The change itself only happens in
// auth-verify-email-change.js once that code comes back — so a typo can never
// move the account onto an address the customer doesn't control.

const {
  BRAND,
  masterLayout,
  greeting,
  otpCodeBox,
  alertBox,
  sendMail,
} = require("./_lib/email-template");
const {
  getUserFromAccessToken,
  bearerToken,
  findAuthUserByEmail,
  getVerificationCode,
  saveVerificationCode,
  pruneExpiredCodes,
  generateOtp,
} = require("./_lib/supabase-admin");

const C = BRAND.colors;
const FONT_F = "'Segoe UI',Helvetica,Arial,sans-serif";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_MINUTES = 10;
const RESEND_THROTTLE_MS = 60 * 1000;

async function sendChangeEmailOtp(newEmail, code, firstName) {
  const body = `
    ${greeting(
      firstName || "there",
      `You asked to change the email on your <strong>${BRAND.name}</strong> account to this address. Enter the verification code below to confirm the change.`,
    )}
    ${otpCodeBox(code, OTP_MINUTES)}
    ${alertBox(
      C.warnBg,
      C.gold,
      C.warn,
      "<strong>Important:</strong> If you didn't request this change, please ignore this email — your account's email stays exactly as it is. Never share your verification code with anyone.",
    )}
    <p style="margin:0;color:${C.inkSoft};font-size:0.88rem;line-height:1.7;font-family:${FONT_F};">
      Thanks for choosing ${BRAND.name}! 🍕
    </p>`;

  await sendMail({
    to: newEmail,
    subject: `Confirm Your New Email — ${BRAND.name}`,
    previewText: `Your ${BRAND.name} email change code is: ${code}`,
    text:
      `Hi ${firstName || "there"},\n\n` +
      `You asked to change your ${BRAND.name} account email to this address.\n\n` +
      `Your verification code is: ${code}\n\n` +
      `It expires in ${OTP_MINUTES} minutes. If you didn't request this change, ignore this email — nothing will happen.\n\n` +
      `${BRAND.name} — ${BRAND.phone}`,
    html: masterLayout({
      previewText: `Confirm your new email: ${code}`,
      bannerBg: C.infoBg,
      bannerBorderColor: C.gold,
      bannerTextColor: C.info,
      bannerLabel: "✉️ &nbsp; Confirm Your New Email",
      bodyHTML: body,
    }),
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = await getUserFromAccessToken(bearerToken(req));
    if (!user)
      return res
        .status(401)
        .json({ error: "Your session has expired. Please log in again." });

    const { new_email } = req.body || {};
    if (!new_email || !EMAIL_RE.test(String(new_email).trim()))
      return res.status(400).json({ error: "Please enter a valid email address." });

    const cleanEmail = String(new_email).trim().toLowerCase();
    if (user.email && String(user.email).toLowerCase() === cleanEmail)
      return res
        .status(400)
        .json({ error: "This is already your current email address." });

    const existing = await findAuthUserByEmail(cleanEmail);
    if (existing && existing.id !== user.id)
      return res
        .status(409)
        .json({ error: "This email is already in use by another account." });

    await pruneExpiredCodes();
    const pending = await getVerificationCode(cleanEmail);
    if (
      pending &&
      Date.now() - new Date(pending.created_at).getTime() < RESEND_THROTTLE_MS
    ) {
      return res.status(429).json({
        error: "Please wait a minute before requesting another code.",
      });
    }

    const code = generateOtp();
    await saveVerificationCode({
      email: cleanEmail,
      code,
      userId: user.id,
      expiresMinutes: OTP_MINUTES,
    });

    const firstName =
      (user.user_metadata && user.user_metadata.full_name
        ? String(user.user_metadata.full_name).split(" ")[0]
        : "") || "there";
    await sendChangeEmailOtp(cleanEmail, code, firstName);

    return res.status(200).json({ ok: true, email: cleanEmail });
  } catch (err) {
    console.error("auth-change-email failed:", err);
    return res
      .status(500)
      .json({ error: "Something went wrong. Please try again." });
  }
};
