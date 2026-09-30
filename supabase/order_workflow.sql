-- =========================================================================
-- Little Chef Pizza — order_workflow.sql
-- Run this ONCE in the Supabase SQL Editor, AFTER location_and_payments.sql.
-- Safe to run again any time — every statement is idempotent (create or
-- replace / add column if not exists / guarded checks).
--
-- What this changes:
--
--   1. New order status: 'confirmed'. Every order is now explicitly
--      confirmed by the restaurant before it can go out for delivery:
--        COD       : pending  -> (admin Confirm)  confirmed -> out_for_delivery -> delivered
--        EasyPaisa : payment_verification -> (admin Approve) confirmed -> out_for_delivery -> delivered
--      Any order can be declined by the restaurant (-> rejected).
--
--   2. New admin-only RPCs: confirm_order() and reject_order()
--      (pending -> confirmed / pending -> rejected).
--
--   3. approve_payment() now moves the order straight to 'confirmed'
--      (it used to stop at 'pending').
--
--   4. mark_out_for_delivery() is now only allowed from 'confirmed',
--      so nothing ships before the restaurant has confirmed it.
--
--   5. create_order() — THIS FILE CONTAINS THE DEFINITIVE VERSION, and it
--      replaces whichever create_order() the database currently has:
--        * items/deals arrive as name + unit_price from the browser (the
--          menu is a client-side catalog — see js/seed-data.js), and are
--          re-validated here; subtotal/total are computed here.
--        * delivery charge is DISTANCE-BASED:
--            up to 3 km   -> FREE delivery (charge 0)
--            3 km to 5 km -> normal charge (site_settings.delivery_charge, default 250)
--            over 5 km    -> delivery refused
--          Distance is computed server-side (Haversine) — the browser's
--          own check stays a UX convenience only.
--
--   6. Legacy constraint cleanup: the old "delivery orders need a
--      delivery_area" check is dropped (the map-picked full address
--      replaced the area concept), and any historical status CHECK
--      constraints are replaced by one canonical constraint that also
--      allows 'confirmed'.
--
--   7. Re-creates cancel_order() / mark_failed_delivery() and adds
--      lookup_email_by_phone() if they are missing — older projects were
--      set up without them, which made those buttons/login-by-phone fail.
--      (lookup_email_by_phone is only created when absent, so a working
--      live variant is never overwritten.)
-- =========================================================================

-- ------------------------------------------------ status set + new columns
-- Drops EVERY check constraint that constrains only the status column
-- (earlier schema revisions named them differently), then installs one
-- canonical constraint. Left untouched: payment_status / payment_method /
-- order_type checks and anything spanning several columns.
-- `not valid` = enforced for every new or updated row, while historical
-- rows with any old status value are tolerated.
do $$
declare
  v_con text;
begin
  for v_con in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.orders'::regclass
      and c.contype = 'c'
      and c.conkey = (
        select array_agg(a.attnum)
        from pg_attribute a
        where a.attrelid = c.conrelid and a.attname = 'status' and not a.attisdropped
      )
  loop
    execute format('alter table public.orders drop constraint %I', v_con);
  end loop;
end $$;

alter table public.orders add constraint orders_status_check
  check (status in ('payment_verification','pending','confirmed','out_for_delivery','delivered','rejected'))
  not valid;

-- The original schema required a non-null delivery_area for delivery
-- orders. The map-picked full address replaced the old "area" concept and
-- create_order() validates the address itself — so this legacy constraint
-- has to go, or every delivery order insert would fail.
alter table public.orders drop constraint if exists delivery_requires_area_address;

alter table public.orders add column if not exists rejection_reason text;
alter table public.orders add column if not exists confirmed_at timestamptz;

-- =========================================================================
-- New admin-only transitions: confirm_order / reject_order.
-- Like the other transition functions, each checks public.is_admin()
-- itself — the frontend buttons are just UI, these are the real boundary.
-- =========================================================================

create or replace function public.confirm_order(p_order_id uuid) returns public.orders
language plpgsql security definer as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'Not authorized.'; end if;
  update public.orders set status = 'confirmed', confirmed_at = now()
    where id = p_order_id and status = 'pending'
    returning * into v_order;
  if v_order.id is null then raise exception 'Order not found or not pending confirmation.'; end if;
  return v_order;
end;
$$;

create or replace function public.reject_order(p_order_id uuid) returns public.orders
language plpgsql security definer as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'Not authorized.'; end if;
  update public.orders set status = 'rejected', rejected_at = now(), rejection_reason = 'rejected'
    where id = p_order_id and status = 'pending'
    returning * into v_order;
  if v_order.id is null then raise exception 'Order not found or not pending confirmation.'; end if;
  return v_order;
end;
$$;

grant execute on function public.confirm_order(uuid) to authenticated;
grant execute on function public.reject_order(uuid) to authenticated;

-- =========================================================================
-- Existing transitions, updated for the confirmed step.
-- =========================================================================

-- Approving an EasyPaisa payment now lands the order in 'confirmed'
-- (payment proof checked AND order accepted in one admin action).
create or replace function public.approve_payment(p_order_id uuid) returns public.orders
language plpgsql security definer as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'Not authorized.'; end if;
  update public.orders set status = 'confirmed', payment_status = 'paid',
    payment_verified_at = now(), confirmed_at = now()
    where id = p_order_id and status = 'payment_verification'
    returning * into v_order;
  if v_order.id is null then raise exception 'Order not found or not awaiting payment verification.'; end if;
  return v_order;
end;
$$;

-- Orders can only leave for delivery once the restaurant has confirmed them.
create or replace function public.mark_out_for_delivery(p_order_id uuid) returns public.orders
language plpgsql security definer as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'Not authorized.'; end if;
  update public.orders set status = 'out_for_delivery', out_for_delivery_at = now()
    where id = p_order_id and status = 'confirmed'
    returning * into v_order;
  if v_order.id is null then raise exception 'Order not found or not confirmed.'; end if;
  return v_order;
end;
$$;

create or replace function public.reject_payment(p_order_id uuid) returns public.orders
language plpgsql security definer as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'Not authorized.'; end if;
  update public.orders set status = 'rejected', rejected_at = now()
    where id = p_order_id and status = 'payment_verification'
    returning * into v_order;
  if v_order.id is null then raise exception 'Order not found or not awaiting payment verification.'; end if;
  return v_order;
end;
$$;

grant execute on function public.approve_payment(uuid) to authenticated;
grant execute on function public.mark_out_for_delivery(uuid) to authenticated;
grant execute on function public.reject_payment(uuid) to authenticated;

-- =========================================================================
-- create_order() — THE definitive order-creation function.
--
-- This is the item/deal contract the frontend actually sends
-- (js/cart.js toOrderPayload -> js/db.js orders.create): each line carries
-- its display NAME and its UNIT PRICE from the browser, because the menu
-- lives client-side in js/seed-data.js — the DB holds no product/deal
-- rows to look them up. The server still owns everything that matters:
--   * every field is re-validated here (never trusted from the browser),
--   * delivery radius + distance are recomputed here (Haversine),
--   * delivery charge: 0 within 3 km, else site_settings.delivery_charge
--     (default 250) between 3 km and 5 km, refused beyond 5 km,
--   * subtotal / total are computed here from the submitted lines.
-- The display name (which already carries size/option suffixes, e.g.
-- "Soft Drink 1.5 Liter (Coke)") is stored verbatim; product_id / deal_id
-- are stored as NULL because live orders run against the client catalog.
-- =========================================================================
drop function if exists public.create_order(jsonb, jsonb, text, text, text, text, text, boolean); -- legacy 8-param signature

create or replace function public.create_order(
  p_items jsonb,
  p_deals jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_alt_contact_phone text,
  p_customer_email text,
  p_order_type text,
  p_delivery_address text,
  p_delivery_lat double precision,
  p_delivery_lng double precision,
  p_special_instructions text,
  p_payment_method text,          -- 'cod' | 'easypaisa'
  p_payment_screenshot_path text, -- required if payment_method = 'easypaisa'
  p_cancellation_acknowledged boolean
) returns public.orders
language plpgsql security definer as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_subtotal numeric(10,2) := 0;
  v_order public.orders;
  v_item jsonb;
  v_deal jsonb;
  v_name text;
  v_price numeric(10,2);
  v_qty int;
  v_line_total numeric(10,2);
  v_delivery_charge numeric(10,2) := 0;
  v_center_lat double precision := 32.57349;
  v_center_lng double precision := 74.08170;
  v_radius_km double precision := 5;
  v_free_radius_km double precision := 3;
  v_distance_km double precision;
  v_status text;
begin
  if p_customer_name is null or length(trim(p_customer_name)) < 2 then
    raise exception 'Please enter your name.';
  end if;
  if p_customer_phone is null or p_customer_phone !~ '^[0-9+\-\s]{7,15}$' then
    raise exception 'Please enter a valid phone number.';
  end if;
  if p_alt_contact_phone is not null and length(trim(p_alt_contact_phone)) > 0
     and p_alt_contact_phone !~ '^[0-9+\-\s]{7,15}$' then
    raise exception 'Please enter a valid alternative phone number.';
  end if;
  if p_order_type not in ('delivery','takeaway','dine-in') then
    raise exception 'Please choose an order type.';
  end if;
  if p_payment_method not in ('cod','easypaisa') then
    raise exception 'Please choose a payment method.';
  end if;
  if not coalesce(p_cancellation_acknowledged, false) then
    raise exception 'Please confirm you understand the cancellation policy.';
  end if;
  -- Admin accounts can't place customer orders — the real enforcement behind
  -- the checkout-page guard, so a "Restaurant Admin" test order can never
  -- reach the admin panel again even via a direct RPC call.
  if public.is_admin() then
    raise exception 'Admin accounts cannot place customer orders. Please log out and order with a customer account.';
  end if;

  if p_order_type = 'delivery' then
    if p_delivery_address is null or length(trim(p_delivery_address)) < 5 then
      raise exception 'Please enter your full delivery address.';
    end if;
    if p_delivery_lat is null or p_delivery_lng is null then
      raise exception 'Please select your delivery location on the map before ordering.';
    end if;
    -- Haversine distance, computed server-side — the browser's own radius
    -- check is only a UX convenience, this is the real enforcement.
    v_distance_km := 2 * 6371 * asin(sqrt(
      power(sin(radians(p_delivery_lat - v_center_lat) / 2), 2) +
      cos(radians(v_center_lat)) * cos(radians(p_delivery_lat)) *
      power(sin(radians(p_delivery_lng - v_center_lng) / 2), 2)
    ));
    if v_distance_km > v_radius_km then
      raise exception 'Delivery is only available within 5 km. You are too far.';
    end if;
    if v_distance_km <= v_free_radius_km then
      v_delivery_charge := 0; -- free delivery within 3 km
    else
      select (value #>> '{}')::numeric into v_delivery_charge from public.site_settings where key = 'delivery_charge';
      v_delivery_charge := coalesce(v_delivery_charge, 250);
    end if;
  end if;

  if p_payment_method = 'easypaisa' and (p_payment_screenshot_path is null or length(trim(p_payment_screenshot_path)) = 0) then
    raise exception 'Please upload your EasyPaisa payment screenshot.';
  end if;

  v_status := case when p_payment_method = 'easypaisa' then 'payment_verification' else 'pending' end;

  v_order.id := gen_random_uuid();
  v_order.order_number := public.generate_daily_order_number();

  insert into public.orders (
    id, order_number, user_id, customer_type, customer_name, customer_phone,
    alt_contact_phone, customer_email, order_type, delivery_area, delivery_address,
    delivery_lat, delivery_lng, special_instructions,
    subtotal, delivery_charge, discount, total,
    status, payment_method, payment_screenshot_path, cancellation_acknowledged
  ) values (
    v_order.id, v_order.order_number, v_profile_id, case when v_profile_id is null then 'guest' else 'customer' end,
    trim(p_customer_name), trim(p_customer_phone),
    nullif(trim(coalesce(p_alt_contact_phone, '')), ''), nullif(trim(coalesce(p_customer_email, '')), ''),
    p_order_type, null,
    case when p_order_type = 'delivery' then p_delivery_address else null end,
    case when p_order_type = 'delivery' then p_delivery_lat else null end,
    case when p_order_type = 'delivery' then p_delivery_lng else null end,
    nullif(trim(coalesce(p_special_instructions, '')), ''),
    0, case when p_order_type = 'delivery' then v_delivery_charge else 0 end, 0, 0,
    v_status, p_payment_method, p_payment_screenshot_path, true
  ) returning * into v_order;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    if v_name is null then
      raise exception 'One of the items in your bucket is missing its name.';
    end if;
    -- Price arrives from the browser — validate the raw shape first, then
    -- cast (a failed regex never reaches the cast), then bound it.
    if coalesce(v_item->>'unit_price', '') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'Invalid price for "%".', v_name;
    end if;
    v_price := round((v_item->>'unit_price')::numeric, 2);
    if v_price <= 0 or v_price > 100000 then
      raise exception 'Invalid price for "%".', v_name;
    end if;

    v_qty := case when coalesce(v_item->>'qty', '') ~ '^[0-9]{1,3}$' then (v_item->>'qty')::int else 1 end;
    v_qty := greatest(1, least(50, v_qty));
    v_line_total := v_price * v_qty;
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_snapshot, quantity, line_total)
    values (v_order.id, null, left(v_name, 200), v_price, v_qty, v_line_total);
  end loop;

  for v_deal in select * from jsonb_array_elements(coalesce(p_deals, '[]'::jsonb)) loop
    v_name := nullif(trim(coalesce(v_deal->>'name', '')), '');
    if v_name is null then
      raise exception 'One of the deals in your bucket is missing its name.';
    end if;
    if coalesce(v_deal->>'unit_price', '') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'Invalid price for "%".', v_name;
    end if;
    v_price := round((v_deal->>'unit_price')::numeric, 2);
    if v_price <= 0 or v_price > 100000 then
      raise exception 'Invalid price for "%".', v_name;
    end if;

    v_qty := case when coalesce(v_deal->>'qty', '') ~ '^[0-9]{1,3}$' then (v_deal->>'qty')::int else 1 end;
    v_qty := greatest(1, least(20, v_qty));
    v_line_total := v_price * v_qty;
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_deals (order_id, deal_id, deal_name_snapshot, deal_price_snapshot, quantity, line_total)
    values (v_order.id, null, left(v_name, 200), v_price, v_qty, v_line_total);
  end loop;

  if v_subtotal = 0 then
    raise exception 'Your bucket is empty.';
  end if;

  update public.orders
    set subtotal = v_subtotal,
        total = v_subtotal + (case when p_order_type = 'delivery' then v_delivery_charge else 0 end)
    where id = v_order.id
    returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.create_order(
  jsonb, jsonb, text, text, text, text, text, text, double precision, double precision, text, text, text, boolean
) to anon, authenticated;

-- =========================================================================
-- Legacy helpers referenced by the app but missing from older setups.
-- Dropped by argument type first (so it always matches a live variant,
-- whatever its return type), then recreated — running this file again
-- never stacks overloads.
-- =========================================================================

drop function if exists public.cancel_order(uuid);

create or replace function public.cancel_order(p_order_id uuid) returns public.orders
language plpgsql security definer as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'Not authorized.'; end if;
  update public.orders set status = 'rejected', rejected_at = now(), rejection_reason = 'cancelled'
    where id = p_order_id and status in ('pending','confirmed')
    returning * into v_order;
  if v_order.id is null then raise exception 'Order not found or already past the point of cancellation.'; end if;
  return v_order;
end;
$$;

drop function if exists public.mark_failed_delivery(uuid);

create or replace function public.mark_failed_delivery(p_order_id uuid) returns public.orders
language plpgsql security definer as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'Not authorized.'; end if;
  update public.orders set status = 'rejected', rejected_at = now(), rejection_reason = 'failed_delivery'
    where id = p_order_id and status = 'out_for_delivery'
    returning * into v_order;
  if v_order.id is null then raise exception 'Order not found or not out for delivery.'; end if;
  return v_order;
end;
$$;

grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.mark_failed_delivery(uuid) to authenticated;

-- Phone -> email resolution for "log in with email OR phone".
-- Created only when it does not exist yet, so a working live definition
-- is never overwritten. (If phone login ever misbehaves, delete the
-- function and re-run this file to get this fallback definition.)
do $guard$
begin
  if to_regprocedure('public.lookup_email_by_phone(text)') is null then
    execute $fn$
      create function public.lookup_email_by_phone(p_phone text) returns text
      language sql security definer stable as $body$
        select coalesce(nullif(trim(p.email), ''), u.email)
        from public.profiles p
        join auth.users u on u.id = p.auth_user_id
        where length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) >= 7
          and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
              = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
        limit 1;
      $body$;
    $fn$;
    execute 'grant execute on function public.lookup_email_by_phone(text) to anon, authenticated';
  end if;
end
$guard$;
