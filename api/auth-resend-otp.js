// api/auth-resend-otp.js
//
// Vercel endpoint: POST /api/auth-resend-otp
//
// REPLACES sb.auth.resend(). Only valid for users who exist but are not
// confirmed yet — generates a fresh code, stores it, and emails it with the
// branded template. Throttled to one resend per email per 60 seconds.

const {
  BRAND,
  masterLayout,
  greeting,
  otpCodeBox,
  alertBox,
  sendMail,
} = require("./_lib/email-template");
const {
  findAuthUserByEmail,
  getVerificationCode,
  saveVerificationCode,
  pruneExpiredCodes,
  generateOtp,
} = require("./_lib/supabase-admin");

const C = BRAND.colors;
const FONT_F = "'Segoe UI',Helvetica,Arial,sans-serif";
const OTP_MINUTES = 10;
const RESEND_THROTTLE_MS = 60 * 1000;

async function sendOtpEmail(email, code, firstName) {
  const body = `
    ${greeting(
      firstName || "there",
      `Here's your new verification code for <strong>${BRAND.name}</strong>. Enter it on the website to verify your email address.`,
    )}
    ${otpCodeBox(code, OTP_MINUTES)}
    ${alertBox(
      C.warnBg,
      C.gold,
      C.warn,
      "<strong>Important:</strong> Never share your verification code with anyone. If you didn't request this code, please ignore this email.",
    )}
    <p style="margin:0;color:${C.inkSoft};font-size:0.88rem;line-height:1.7;font-family:${FONT_F};">
      See you soon at ${BRAND.name}! 🍕
    </p>`;

  await sendMail({
    to: email,
    subject: `Your New Verification Code — ${BRAND.name}`,
    previewText: `Your new ${BRAND.name} verification code is: ${code}`,
    text:
      `Hi ${firstName || "there"},\n\n` +
      `Your new ${BRAND.name} verification code is: ${code}\n\n` +
      `It expires in ${OTP_MINUTES} minutes.\n\n` +
      `${BRAND.name} — ${BRAND.phone}`,
    html: masterLayout({
      previewText: `Your new verification code: ${code}`,
      bannerBg: C.warnBg,
      bannerBorderColor: C.gold,
      bannerTextColor: C.warn,
      bannerLabel: "🔐 &nbsp; Email Verification Required",
      bodyHTML: body,
    }),
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { email } = req.body || {};
    if (!email || !String(email).includes("@"))
      return res.status(400).json({ error: "A valid email is required." });

    const cleanEmail = String(email).trim().toLowerCase();

    const user = await findAuthUserByEmail(cleanEmail);
    if (!user)
      return res.status(400).json({
        error: "No account found for this email. Please sign up first.",
      });
    if (user.email_confirmed_at)
      return res.status(400).json({
        error: "This email is already verified. Please log in instead.",
      });

    await pruneExpiredCodes();
    const existing = await getVerificationCode(cleanEmail);
    if (
      existing &&
      Date.now() - new Date(existing.created_at).getTime() < RESEND_THROTTLE_MS
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
    await sendOtpEmail(cleanEmail, code, firstName);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("auth-resend-otp failed:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};
