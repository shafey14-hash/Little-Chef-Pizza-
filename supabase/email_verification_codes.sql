-- =========================================================================
-- Little Chef Pizza — email_verification_codes.sql
-- Run this ONCE in the Supabase SQL Editor, any time before/with deploying
-- the custom OTP endpoints (api/auth-signup.js, api/auth-verify-otp.js,
-- api/auth-resend-otp.js).
--
-- These codes replace Supabase's own signup emails: our serverless functions
-- generate the 6-digit code, store it here, and email it through Gmail SMTP
-- with the branded template built in code. Verification checks THIS table.
-- =========================================================================

create table if not exists public.email_verification_codes (
  email        text primary key,             -- lowercased customer email
  code         text not null,                -- 6-digit OTP
  auth_user_id uuid,                         -- pre-filled so verify never has to look it up
  attempts     int not null default 0,       -- wrong-code attempts (max 5 in the API)
  expires_at   timestamptz not null,         -- code dies here
  created_at   timestamptz not null default now()
);

-- RLS ON with deliberately NO policies: anon/authenticated clients cannot
-- read or write codes at all. Only the service_role key (our Vercel
-- functions) can — that's the whole point.
alter table public.email_verification_codes enable row level security;

create index if not exists idx_email_codes_expires
  on public.email_verification_codes (expires_at);
