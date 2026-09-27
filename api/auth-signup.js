// api/auth-signup.js
//
// Vercel endpoint: POST /api/auth-signup
//
// Step 1 of customer signup — REPLACES Supabase's own signup email. Creates
// the auth user via the service role (unconfirmed), generates our own 6-digit
// OTP, stores it in email_verification_codes, and emails it with the fully
// branded template from code. No Supabase/default email is ever sent, so the
// "Confirm your email address" plain-text message is gone for good.
//
// If the email is already registered:
//   - confirmed   → 409 "An account with this email already exists."
//   - unconfirmed → refresh password/details and send a fresh code instead
//     (covers users who signed up earlier but never finished verifying).

const {
  BRAND,
  masterLayout,
  greeting,
  otpCodeBox,
  alertBox,
  sendMail,
} = require("./_lib/email-template");
const {
  createAuthUser,
  updateAuthUser,
  findAuthUserByEmail,
  saveVerificationCode,
  pruneExpiredCodes,
  generateOtp,
} = require("./_lib/supabase-admin");

const C = BRAND.colors;
const FONT_F = "'Segoe UI',Helvetica,Arial,sans-serif";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_MINUTES = 10;

function bad(res, status, error) {
  return res.status(status).json({ error });
}

async function sendOtpEmail(email, code, firstName) {
  const body = `
    ${greeting(
      firstName || "there",
      `Welcome to <strong>${BRAND.name}</strong>! Use the verification code below to confirm your email address and finish creating your account.`,
    )}
    ${otpCodeBox(code, OTP_MINUTES)}
    ${alertBox(
      C.warnBg,
      C.gold,
      C.warn,
      "<strong>Important:</strong> If you didn't create this account, please ignore this email. Never share your verification code with anyone.",
    )}
    <p style="margin:0;color:${C.inkSoft};font-size:0.88rem;line-height:1.7;font-family:${FONT_F};">
      Thank you for choosing ${BRAND.name}. We can't wait to serve you! 🍕
    </p>`;

  await sendMail({
    to: email,
    subject: `Your Verification Code — ${BRAND.name}`,
    previewText: `Your ${BRAND.name} verification code is: ${code}`,
    text:
      `Hi ${firstName || "there"},\n\n` +
      `Your ${BRAND.name} verification code is: ${code}\n\n` +
      `It expires in ${OTP_MINUTES} minutes. If you didn't create an account, ignore this email.\n\n` +
      `${BRAND.name} — ${BRAND.phone}`,
    html: masterLayout({
      previewText: `Your verification code: ${code}`,
      bannerBg: C.warnBg,
      bannerBorderColor: C.gold,
      bannerTextColor: C.warn,
      bannerLabel: "🔐 &nbsp; Email Verification Required",
      bodyHTML: body,
    }),
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");

  try {
    const { full_name, email, phone, alt_phone, area, address, password } =
      req.body || {};

    // ── Basic validation (mirrors the frontend checks) ──
    if (!full_name || !String(full_name).trim())
      return bad(res, 400, "Please enter your full name.");
    if (!email || !EMAIL_RE.test(String(email).trim()))
      return bad(res, 400, "Please enter a valid email address.");
    if (!password || String(password).length < 6)
      return bad(res, 400, "Password must be at least 6 characters.");
    if (!phone || !String(phone).trim())
      return bad(res, 400, "Please enter your phone number.");

    const cleanEmail = String(email).trim().toLowerCase();
    const firstName = String(full_name).trim().split(" ")[0];
    const metadata = {
      full_name: String(full_name).trim(),
      phone: String(phone).trim(),
      alt_phone: alt_phone ? String(alt_phone).trim() : null,
      area: area ? String(area).trim() : null,
      address: address ? String(address).trim() : null,
      role: "customer", // server-side only — a client can never pick another role
      email: cleanEmail, // handle_new_user() copies metadata.email into profiles.email
    };

    await pruneExpiredCodes();

    // ── Try to create a brand-new user ──
    const created = await createAuthUser({
      email: cleanEmail,
      password: String(password),
      userMetadata: metadata,
    });

    if (created.status === 200 || created.status === 201) {
      const code = generateOtp();
      await saveVerificationCode({
        email: cleanEmail,
        code,
        userId: created.data.id,
        expiresMinutes: OTP_MINUTES,
      });
      await sendOtpEmail(cleanEmail, code, firstName);
      return res.status(200).json({ ok: true, email: cleanEmail });
    }

    const msg = JSON.stringify(created.data || {});
    if (!/already been registered|already exists/i.test(msg)) {
      console.error("auth-signup createUser failed:", created.status, msg);
      return bad(res, 500, "Something went wrong creating your account. Please try again.");
    }

    // ── Email already registered ──
    const existing = await findAuthUserByEmail(cleanEmail);
    if (!existing) {
      return bad(res, 500, "Something went wrong. Please try again.");
    }
    if (existing.email_confirmed_at) {
      return bad(res, 409, "An account with this email already exists.");
    }

    // Unconfirmed user signing up again → refresh their details and resend.
    await updateAuthUser(existing.id, {
      password: String(password),
      user_metadata: { ...existing.user_metadata, ...metadata },
    });
    const code = generateOtp();
    await saveVerificationCode({
      email: cleanEmail,
      code,
      userId: existing.id,
      expiresMinutes: OTP_MINUTES,
    });
    await sendOtpEmail(cleanEmail, code, firstName);
    return res.status(200).json({ ok: true, email: cleanEmail, resent: true });
  } catch (err) {
    console.error("auth-signup failed:", err);
    return bad(res, 500, "Something went wrong. Please try again.");
  }
};
