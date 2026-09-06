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
};
