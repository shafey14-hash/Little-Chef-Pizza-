// api/_lib/supabase-admin.js
//
// Tiny zero-dependency helpers that talk to Supabase with the SERVICE ROLE
// key (server-side only — never expose that key to the browser). Used by the
// custom OTP endpoints to create/confirm users and store verification codes,
// replacing Supabase's own email flow entirely.
//
// Requires these Vercel env vars:
//   SUPABASE_URL             e.g. https://lambfbjicnvqjrraerur.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  (Project Settings → API → service_role key)

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function assertConfig() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars (set them on Vercel).",
    );
  }
}

async function goTrue(path, { method = "GET", body } = {}) {
  assertConfig();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

/** Create a user. Leave them UNconfirmed — our own OTP email confirms them. */
async function createAuthUser({ email, password, userMetadata }) {
  const { status, data } = await goTrue("users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: false,
      user_metadata: userMetadata,
    },
  });
  return { status, data };
}

/** Update a user (confirm email, change password, refresh metadata...). */
async function updateAuthUser(userId, attrs) {
  const { status, data } = await goTrue(`users/${userId}`, {
    method: "PUT",
    body: attrs,
  });
  return { status, data };
}

/** Find an auth user by email (paginated scan of the admin users list). */
async function findAuthUserByEmail(email) {
  const needle = String(email || "").trim().toLowerCase();
  if (!needle) return null;
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { status, data } = await goTrue(
      `users?page=${page}&per_page=${perPage}`,
    );
    if (status !== 200 || !Array.isArray(data.users)) return null;
    const found = data.users.find(
      (u) => String(u.email || "").toLowerCase() === needle,
    );
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
    if (page > 50) return null; // safety cap — this site has far fewer users
  }
}

/**
 * The auth user behind a caller-supplied Supabase access token. The token is
 * verified against GoTrue itself (a forged or expired one simply fails), so
 * endpoints that act on "the caller's own account" can trust the result.
 * Returns null when the token is missing/invalid.
 */
async function getUserFromAccessToken(token) {
  assertConfig();
  if (!token || typeof token !== "string") return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) return null;
  const data = await res.json().catch(() => null);
  return data && data.id ? data : null;
}

/** Reads "Bearer <token>" out of an incoming request's headers. */
function bearerToken(req) {
  const raw =
    (req.headers &&
      (req.headers.authorization || req.headers.Authorization)) ||
    "";
  const match = /^Bearer\s+(.+)$/i.exec(String(raw).trim());
  return match ? match[1] : null;
}

/** Raw PostgREST call with the service role (bypasses RLS by design). */
async function dbRest(path, { method = "GET", prefer, body } = {}) {
  assertConfig();
  const headers = {
    apikey: SERVICE_ROLE,
    Authorization: `Bearer ${SERVICE_ROLE}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// ── email_verification_codes helpers ─────────────────────────
// Table is created by supabase/email_verification_codes.sql. RLS is enabled
// with NO policies, so only the service role can read/write it.

async function getVerificationCode(email) {
  const { status, data } = await dbRest(
    `email_verification_codes?email=eq.${encodeURIComponent(
      String(email).trim().toLowerCase(),
    )}&select=*`,
  );
  if (status !== 200 || !Array.isArray(data) || data.length === 0) return null;
  return data[0];
}

async function saveVerificationCode({ email, code, userId, expiresMinutes = 10 }) {
  const { status, data } = await dbRest("email_verification_codes", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: {
      email: String(email).trim().toLowerCase(),
      code: String(code),
      auth_user_id: userId || null,
      attempts: 0,
      expires_at: new Date(
        Date.now() + expiresMinutes * 60 * 1000,
      ).toISOString(),
    },
  });
  return { status, data };
}

async function incrementCodeAttempts(email) {
  const row = await getVerificationCode(email);
  if (!row) return;
  await dbRest(
    `email_verification_codes?email=eq.${encodeURIComponent(row.email)}`,
    {
      method: "PATCH",
      body: { attempts: (row.attempts || 0) + 1 },
    },
  );
}

async function deleteVerificationCode(email) {
  await dbRest(
    `email_verification_codes?email=eq.${encodeURIComponent(
      String(email).trim().toLowerCase(),
    )}`,
    { method: "DELETE" },
  );
}

/** Housekeeping: drop codes that already expired. */
async function pruneExpiredCodes() {
  await dbRest("email_verification_codes?expires_at=lt.now()", {
    method: "DELETE",
  });
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits, no leading-zero trap
}

module.exports = {
  createAuthUser,
  updateAuthUser,
  findAuthUserByEmail,
  getUserFromAccessToken,
  bearerToken,
  dbRest,
  getVerificationCode,
  saveVerificationCode,
  incrementCodeAttempts,
  deleteVerificationCode,
  pruneExpiredCodes,
  generateOtp,
};
