-- =========================================================================
-- Little Chef Pizza — app_push.sql
-- Run this ONCE in the Supabase SQL Editor (after push_notifications.sql).
--
-- WHAT IT DOES — native push notifications for the Android app
--   Creates public.app_push_tokens: one row per Android device that the
--   installed app registered for push. The rows are written ONLY by
--   /api/app-push-subscribe (service role) — RLS is on with no policies, so
--   nothing in the browser can read them.
--
--   The existing trigger trg_order_push (from push_notifications.sql) already
--   calls /api/push-notify on every order insert / status change; that
--   endpoint now fans out through BOTH channels:
--     • Web Push (push_subscriptions) → browsers
--     • FCM        (app_push_tokens)   → the installed Android app, even when
--       it was swiped away from recent apps
--   so NO trigger change is needed here.
--
-- Safe to re-run (idempotent): create table if not exists + create index if
-- not exists.
-- =========================================================================

create table if not exists public.app_push_tokens (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'customer' check (role in ('customer', 'admin')),
  fcm_token   text not null unique,
  platform    text not null default 'android',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists app_push_tokens_profile_idx
  on public.app_push_tokens (profile_id);

-- RLS on, NO policies on purpose: only the service role (used by
-- /api/app-push-subscribe and /api/push-notify) can touch this table.
alter table public.app_push_tokens enable row level security;
