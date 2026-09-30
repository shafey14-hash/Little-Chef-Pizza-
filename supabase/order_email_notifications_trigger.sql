-- =========================================================================
-- Little Chef Pizza — order_email_notifications_trigger.sql
-- Run this ONCE in the Supabase SQL Editor (after schema.sql, seed.sql,
-- policies.sql, auth_and_admin.sql, storage_policies.sql and
-- location_and_payments.sql).
--
-- WHAT IT DOES
--   Whenever an order is created OR its status changes, this trigger calls
--   the Vercel endpoint /api/send-order-email, which emails the customer a
--   fully branded HTML email (order placed / payment confirmed / out for
--   delivery / delivered / rejected) built entirely in code. The database
--   never sends email itself — it just nudges our own API.
--
-- BEFORE RUNNING — replace the two placeholders below:
--   1. https://YOUR-SITE.vercel.app  → your real Vercel deployment URL
--   2. YOUR_WEBHOOK_SECRET           → any long random string; then set the
--      SAME string as EMAIL_WEBHOOK_SECRET in your Vercel env vars.
--
-- Requires the pg_net extension (enabled by default on Supabase). If the
-- run errors with a permission problem on net.http_post, also run:
--   grant usage on schema net to postgres;
--   grant all on table net.http_request_queue to postgres;
--   grant all on table net._http_response to postgres;
-- =========================================================================

create or replace function public.notify_order_email() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event  text;
  v_items  jsonb;
  v_deals  jsonb;
begin
  -- Only email on INSERT, or when the status column actually changed.
  if tg_op = 'INSERT' then
    v_event := 'order_placed';
  elsif old.status is distinct from new.status then
    v_event := 'status_changed';
  else
    return new;
  end if;

  -- Guest orders and old rows may have no email on file — skip quietly.
  if new.customer_email is null or btrim(new.customer_email) = '' then
    return new;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', product_name_snapshot,
           'qty',  quantity,
           'total', line_total)), '[]'::jsonb)
    into v_items from public.order_items where order_id = new.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', deal_name_snapshot,
           'qty',  quantity,
           'total', line_total)), '[]'::jsonb)
    into v_deals from public.order_deals where order_id = new.id;

  perform net.http_post(
    url := 'https://YOUR-SITE.vercel.app/api/send-order-email',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-webhook-secret', 'YOUR_WEBHOOK_SECRET'
    ),
    body := jsonb_build_object(
      'event', v_event,
      'order', jsonb_build_object(
        'order_number',   new.order_number,
        'customer_name',  new.customer_name,
        'customer_email', new.customer_email,
        'status',         new.status,
        'rejection_reason', new.rejection_reason,
        'order_type',     new.order_type,
        'payment_method', new.payment_method,
        'total',          new.total,
        'phone',          new.customer_phone,
        'address',        new.delivery_address,
        'items',          v_items,
        'deals',          v_deals
      )
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_order_email on public.orders;
create trigger trg_order_email
  after insert or update of status on public.orders
  for each row execute function public.notify_order_email();
