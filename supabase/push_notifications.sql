-- =========================================================================
-- Little Chef Pizza — push_notifications.sql
-- Run this ONCE in the Supabase SQL Editor (after schema.sql, seed.sql,
-- policies.sql, auth_and_admin.sql, storage_policies.sql,
-- location_and_payments.sql and order_workflow.sql).
--
-- WHAT IT DOES — background push notifications
--   1. Creates public.push_subscriptions: one row per browser/device that
--      a logged-in user has switched push notifications ON for. The rows
--      are written ONLY by /api/push-subscribe (service role) — RLS is on
--      with no policies, so nothing in the browser can read them.
--   2. Adds trg_order_push on public.orders: whenever an order is created
--      or its status changes, Postgres calls our Vercel endpoint
--      /api/push-notify, which sends a Web Push notification:
--        • new order          → all admin devices
--        • status changed     → that customer's devices
--      The push is delivered by the browser's push service, so it arrives
--      even when the site is closed and not in recent apps — as long as
--      the user once tapped "Enable background notifications" in the bell
--      panel and their browser (Chrome/Edge/Firefox) supports Web Push.
--
-- BEFORE RUNNING — replace ONE placeholder:
--     YOUR_WEBHOOK_SECRET → the SAME long random string you already set as
--     EMAIL_WEBHOOK_SECRET in your Vercel env vars (the email trigger uses
--     it too — re-use it, no new secret needed).
--
-- Requires the pg_net extension — already enabled if you ran
-- order_email_notifications_trigger.sql. If you get permission errors on
-- net.http_post, run these once:
--   grant usage on schema net to postgres;
--   grant all on table net.http_request_queue to postgres;
--   grant all on table net._http_response to postgres;
--
-- This file is safe to re-run (idempotent): create table if not exists +
-- create or replace function + drop trigger if exists.
-- =========================================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'customer' check (role in ('customer', 'admin')),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

-- RLS on, NO policies on purpose: only the service role (used by
-- /api/push-subscribe and /api/push-notify) can touch this table.
alter table public.push_subscriptions enable row level security;

-- =========================================================================
-- The trigger: nudge /api/push-notify on order create / status change.
-- =========================================================================
create or replace function public.notify_order_push() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := 'order_placed';
  elsif old.status is distinct from new.status then
    v_event := 'status_changed';
  else
    return new;
  end if;

  perform net.http_post(
    url := 'https://little-chef-pizza.vercel.app/api/push-notify',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-webhook-secret', 'YOUR_WEBHOOK_SECRET'
    ),
    body := jsonb_build_object(
      'event', v_event,
      'order', jsonb_build_object(
        'order_number',     new.order_number,
        'user_id',          new.user_id,
        'status',           new.status,
        'rejection_reason', new.rejection_reason,
        'order_type',       new.order_type,
        'payment_method',   new.payment_method,
        'total',            new.total,
        'customer_name',    new.customer_name
      )
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_order_push on public.orders;
create trigger trg_order_push
  after insert or update of status on public.orders
  for each row execute function public.notify_order_push();
