/**
 * config.js — Supabase project connection details.
 *
 * SUPABASE_ANON_KEY is a public/"publishable" key. It is MEANT to sit in
 * browser code — this file is fine to commit to git. Real data protection
 * comes from Postgres Row Level Security (see supabase/policies.sql), not
 * from hiding this key.
 *
 * NEVER put your service_role / secret key here or anywhere in this repo.
 *
 * Fill these in after creating your Supabase project (Project Settings →
 * API). Until you do, the site keeps running in local demo mode via
 * js/db.js + localStorage — nothing breaks.
 */
const LCP_CONFIG = {
  SUPABASE_URL: "https://lambfbjicnvqjrraerur.supabase.co", // e.g. "https://lambfbjicnvqjrraerur.supabase.co"
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhbWJmYmppY252cWpycmFlcnVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MDAyNzYsImV4cCI6MjEwNDE3NjI3Nn0.xJEDNyC8gyE5vYYmY4JjmtJr05AJnzrBkQoI_3Z6KSE", // the "anon public" key from Project Settings → API

  // Base URL of the serverless API (OTP + order emails). Leave EMPTY when
  // the site and /api are deployed together on Vercel (same origin).
  // Set it only if the site is hosted separately, e.g.
  // API_BASE_URL: "https://little-chef-pizza.vercel.app"
  API_BASE_URL: "",

  // Web Push — public VAPID key. Public by design (browsers need it to
  // subscribe this device to background notifications); the matching
  // PRIVATE key lives ONLY in Vercel env vars, never in this repo.
  VAPID_PUBLIC_KEY:
    "BCj0KkbG505EY3pEN_vGO2WFtC9v9U_1D4mrM9W8nn1MHpPwGR7yJwv0SPtJ_QEevDB1q6zOw_pQs8MQn6755Lc",
};
