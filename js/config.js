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
  SUPABASE_URL: "",       // e.g. "https://abcd1234.supabase.co"
  SUPABASE_ANON_KEY: "",  // the "anon public" key from Project Settings → API
};
