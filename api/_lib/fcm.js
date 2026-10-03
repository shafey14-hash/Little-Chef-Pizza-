// api/_lib/fcm.js
//
// Firebase Cloud Messaging (HTTP v1) sender for the Android app.
//
// Why this exists: the APK is a Capacitor WebView, and WebViews have NO Push
// API — the browser-style Web Push (web-push/VAPID) used for desktop browsers
// simply cannot reach an installed app. Native FCM can: a message sent here
// is shown by Android itself in the notification shade even when the app was
// swiped away, exactly like WhatsApp/food apps.
//
// Auth is Firebase's standard service-account OAuth2 dance, done by hand with
// Node's built-in crypto (RS256 JWT → OAuth access token → v1 send). No npm
// dependencies were added for this on purpose — Vercel installs the root
// package.json as-is and fewer moving parts means fewer breakages.
//
// Required Vercel env var (set in the Vercel dashboard, NEVER in git/chat):
//   FCM_SERVICE_ACCOUNT — the FULL JSON of the Firebase service account key
//     (Firebase Console → Project settings → Service accounts →
//      "Generate new private key"). project_id is read from the same JSON.
//
// When the env var is missing/invalid every function degrades to a no-op, so
// the rest of /api/push-notify (Web Push for browsers) keeps working before
// Firebase is set up.

const crypto = require("crypto");

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const MESSAGING_SCOPE =
  "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_TTL_SECONDS = 3600;
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // re-sign 5 min before expiry

let serviceAccount = null;
let serviceAccountFailed = false;

function getServiceAccount() {
  if (serviceAccount) return serviceAccount;
  if (serviceAccountFailed) return null;
  try {
    const raw = process.env.FCM_SERVICE_ACCOUNT || "";
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed.client_email ||
      !parsed.private_key ||
      !parsed.project_id ||
      typeof parsed.private_key !== "string" ||
      !parsed.private_key.includes("BEGIN PRIVATE KEY")
    ) {
      throw new Error("FCM_SERVICE_ACCOUNT is missing client_email/private_key/project_id");
    }
    serviceAccount = parsed;
    return serviceAccount;
  } catch (err) {
    serviceAccountFailed = true;
    console.error("FCM: FCM_SERVICE_ACCOUNT invalid:", err.message);
    return null;
  }
}

function fcmConfigured() {
  return !!getServiceAccount();
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

// ── OAuth2 access token (JWT bearer, RS256 signed with the service account) ──
let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt - REFRESH_MARGIN_MS) {
    return cachedToken;
  }
  const sa = getServiceAccount();
  if (!sa) throw new Error("FCM service account is not configured.");

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: MESSAGING_SCOPE,
      aud: TOKEN_URI,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    }),
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(sa.private_key, "base64url");
  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer" +
      `&assertion=${encodeURIComponent(jwt)}`,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`FCM OAuth failed: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  }
  cachedToken = data.access_token;
  cachedTokenExpiresAt = Date.now() + (data.expires_in || TOKEN_TTL_SECONDS) * 1000;
  return cachedToken;
}

// ── Sending ────────────────────────────────────────────────────

/**
 * Send one FCM message to every token in `tokens` (array of fcm_token strings).
 * `payload` is the same shape the Web Push code uses: { title, body, url, tag }.
 * Returns { sent, removed } — `removed` counts tokens Firebase rejected as
 * dead (unregistered/invalid) so the caller can prune them from the DB.
 */
async function sendToAppTokens(tokens, payload) {
  const sa = getServiceAccount();
  if (!sa) return { sent: 0, removed: 0 };
  const list = (tokens || []).filter(Boolean);
  if (!list.length) return { sent: 0, removed: 0 };

  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error("FCM token fetch failed:", err.message);
    return { sent: 0, removed: 0 };
  }

  let sent = 0;
  let removed = 0;
  await Promise.all(
    list.map(async (token) => {
      try {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token,
                notification: {
                  title: String(payload.title || "Little Chef Pizza"),
                  body: String(payload.body || "You have a new update."),
                },
                data: {
                  url: String(payload.url || "/customer/orders.html"),
                  tag: String(payload.tag || "lcp-order"),
                },
                android: { priority: "HIGH" },
              },
            }),
          },
        );
        if (res.ok) {
          sent += 1;
          return;
        }
        const errBody = await res.json().catch(() => ({}));
        const status =
          errBody && errBody.error && errBody.error.status ? errBody.error.status : "";
        const dead =
          res.status === 404 ||
          status === "UNREGISTERED" ||
          status === "NOT_FOUND" ||
          (res.status === 400 && status === "INVALID_ARGUMENT");
        if (dead) {
          removed += 1;
          if (typeof payload.onDeadToken === "function") {
            try {
              await payload.onDeadToken(token);
            } catch (e) {
              /* pruning is best-effort */
            }
          }
        } else {
          console.error("FCM send failed:", res.status, JSON.stringify(errBody).slice(0, 200));
        }
      } catch (err) {
        console.error("FCM send error:", err.message);
      }
    }),
  );
  return { sent, removed };
}

module.exports = { fcmConfigured, getAccessToken, sendToAppTokens };
