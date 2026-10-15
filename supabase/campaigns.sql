-- =========================================================================
-- Little Chef Pizza — campaigns.sql
-- Run this ONCE in the Supabase SQL Editor, AFTER order_workflow.sql
-- (it replaces create_order and handle_new_user with voucher-aware
-- versions of the same functions).
--
-- WHAT IT ADDS
--   campaigns — marketing campaigns. Seeded with "First 100 Customers":
--               the first 100 accounts ever created each get one voucher.
--   vouchers  — one row per granted discount, owned by a profile.
--   grant_welcome_voucher() — atomic "first N signups" grant. Called
--               automatically from handle_new_user() for every new
--               CUSTOMER profile. The counter lives on the campaign row
--               and is incremented under a row lock, so two signups at
--               the same instant can never over-grant past max_grants.
--   create_order() gains a 15th OPTIONAL param p_voucher_id:
--       * voucher must belong to the ordering profile, be unused and
--         unexpired (row locked FOR UPDATE — no double-spend),
--       * discount = round(subtotal * percent / 100, 2) — delivery fee
--         is never discounted,
--       * orders.discount + orders.voucher_code are written, and the
--         voucher is marked used, all inside the order transaction.
--
-- BACKWARD COMPATIBLE: p_voucher_id defaults to NULL, so already-installed
-- app builds that still call the 14-argument RPC keep working unchanged
-- (they simply never apply a voucher). The old 14-param function is
-- dropped so PostgREST resolves the RPC name to exactly one function.
-- =========================================================================

-- ------------------------------------------------------------- orders col
alter table public.orders add column if not exists voucher_code text;

-- -------------------------------------------------------------- campaigns
create table if not exists public.campaigns (
  id               uuid primary key default gen_random_uuid(),
  key              text not null unique,
  title            text not null,
  description      text not null default '',
  discount_percent int  not null check (discount_percent between 1 and 100),
  max_grants       int  not null default 100,
  granted_count    int  not null default 0,
  grant_reason     text not null default '',  -- shown to the customer ("why you got this")
  grant_on_signup  boolean not null default true,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

alter table public.campaigns enable row level security;

drop policy if exists "campaigns_public_read" on public.campaigns;
create policy "campaigns_public_read" on public.campaigns for select
  to anon, authenticated
  using (active or public.is_admin());

drop policy if exists "campaigns_admin_write" on public.campaigns;
create policy "campaigns_admin_write" on public.campaigns for all
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.campaigns to anon, authenticated;

-- --------------------------------------------------------------- vouchers
create table if not exists public.vouchers (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references public.campaigns(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id)  on delete cascade,
  code             text not null unique,
  discount_percent int  not null check (discount_percent between 1 and 100),
  reason           text not null default '',
  status           text not null default 'unused' check (status in ('unused','used')),
  used_order_id    uuid references public.orders(id) on delete set null,
  expires_at       timestamptz,               -- NULL = never expires
  created_at       timestamptz not null default now()
);

create index if not exists vouchers_profile_idx on public.vouchers (profile_id);
create index if not exists vouchers_campaign_idx on public.vouchers (campaign_id);

alter table public.vouchers enable row level security;

-- Customers see their own vouchers; admins see all. Writes happen ONLY
-- inside SECURITY DEFINER functions (grant + create_order) — clients get
-- no insert/update/delete policy, so nobody can mint or reuse a voucher.
drop policy if exists "vouchers_own_read" on public.vouchers;
create policy "vouchers_own_read" on public.vouchers for select
  to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());

grant select on public.vouchers to authenticated;

-- ------------------------------------------------------------------ seed
insert into public.campaigns (key, title, description, discount_percent, max_grants, grant_reason)
values (
  'first100',
  'First 100 Customers — 20% OFF',
  'The first 100 customers to create an account each get an automatic 20% discount voucher for their first order. No code entry needed — the voucher attaches itself at checkout and the saving is shown before you place the order.',
  20,
  100,
  'You are one of our first 100 customers! Thank you for joining Little Chef Pizza early — here is 20% off your first order.'
)
on conflict (key) do update set
  title            = excluded.title,
  description      = excluded.description,
  discount_percent = excluded.discount_percent,
  max_grants       = excluded.max_grants,
  grant_reason     = excluded.grant_reason;
-- NOTE: granted_count is deliberately NOT touched on conflict — re-running
-- this file never resets how many vouchers were already handed out.

-- ------------------------------------------------- grant_welcome_voucher
-- Not granted to anon/authenticated on purpose: only handle_new_user()
-- (SECURITY DEFINER, fired by the auth trigger) may call it.
create or replace function public.grant_welcome_voucher(p_profile_id uuid)
returns public.vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_key         text;
  v_percent     int;
  v_reason      text;
  v_code        text;
  v_voucher     public.vouchers;
  i             int;
begin
  if p_profile_id is null then
    return null;
  end if;

  -- Atomically claim one slot: picks the oldest active signup campaign with
  -- slots left, locks its row (concurrent signups queue here for
  -- microseconds), and re-checks granted_count < max_grants after the lock.
  with pick as (
    select id
      from public.campaigns
     where active and grant_on_signup and granted_count < max_grants
     order by created_at
     limit 1
     for update
  )
  update public.campaigns c
     set granted_count = c.granted_count + 1
    from pick
   where c.id = pick.id
  returning c.id, c.key, c.discount_percent, c.grant_reason
    into v_campaign_id, v_key, v_percent, v_reason;

  if not found then
    return null; -- campaign full or none active
  end if;

  for i in 1..5 loop
    v_code := upper(v_key) || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    begin
      insert into public.vouchers (campaign_id, profile_id, code, discount_percent, reason, status)
      values (v_campaign_id, p_profile_id, v_code, v_percent, v_reason, 'unused')
      returning * into v_voucher;
      return v_voucher;
    exception when unique_violation then
      continue; -- astronomically unlikely code collision — try a new one
    end;
  end loop;

  -- All retries collided: give the slot back and grant nothing.
  update public.campaigns set granted_count = granted_count - 1 where id = v_campaign_id;
  return null;
end;
$$;

-- ------------------------------------------------------- handle_new_user
-- Same profile insert as location_and_payments.sql, plus the welcome
-- voucher grant for customer signups (admins never get one).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer as $$
declare
  v_profile_id uuid;
begin
  insert into public.profiles (auth_user_id, username, full_name, phone, email, role, area, address)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'email', ''),
    coalesce(new.raw_user_meta_data->>'role', 'customer'),
    new.raw_user_meta_data->>'area',
    new.raw_user_meta_data->>'address'
  )
  returning id into v_profile_id;

  if coalesce(new.raw_user_meta_data->>'role', 'customer') = 'customer' then
    perform public.grant_welcome_voucher(v_profile_id);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------- create_order
-- Definitive voucher-aware version. Replaces the 14-param function from
-- order_workflow.sql; body identical except for the marked VOUCHER blocks.
drop function if exists public.create_order(
  jsonb, jsonb, text, text, text, text, text, text,
  double precision, double precision, text, text, text, boolean
);

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
  p_cancellation_acknowledged boolean,
  p_voucher_id uuid default null  -- VOUCHER: optional; old clients omit it
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
  -- VOUCHER
  v_discount numeric(10,2) := 0;
  v_voucher_id uuid;
  v_voucher_code text;
  v_voucher_percent int;
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

  -- VOUCHER: validate + lock. Must belong to the ordering profile, be
  -- unused and unexpired. FOR UPDATE blocks a concurrent second checkout
  -- from spending the same voucher; the loser then sees status='used' and
  -- gets the friendly exception below. Guests (v_profile_id NULL) can
  -- never match a voucher row.
  if p_voucher_id is not null then
    select id, code, discount_percent
      into v_voucher_id, v_voucher_code, v_voucher_percent
      from public.vouchers
     where id = p_voucher_id
       and profile_id = v_profile_id
       and status = 'unused'
       and (expires_at is null or expires_at > now())
     for update;
    if not found then
      raise exception 'This voucher is no longer available. Please refresh and try again.';
    end if;
    v_discount := round(v_subtotal * v_voucher_percent / 100.0, 2);
  end if;

  update public.orders
     set subtotal = v_subtotal,
         discount = v_discount,
         voucher_code = v_voucher_code,
         total = v_subtotal - v_discount
               + (case when p_order_type = 'delivery' then v_delivery_charge else 0 end)
   where id = v_order.id
   returning * into v_order;

  -- VOUCHER: spend it — same transaction, so a failed order can never
  -- burn a voucher.
  if v_voucher_id is not null then
    update public.vouchers
       set status = 'used', used_order_id = v_order.id
     where id = v_voucher_id;
  end if;

  return v_order;
end;
$$;

grant execute on function public.create_order(
  jsonb, jsonb, text, text, text, text, text, text,
  double precision, double precision, text, text, text, boolean, uuid
) to anon, authenticated;

-- ------------------------------------------------------- counter hygiene
-- Keeps campaigns.granted_count equal to the number of voucher rows that
-- actually exist. Safe to re-run any time; REQUIRED after deleting
-- customer accounts (their vouchers cascade away, so the counter must be
-- pulled back down or the campaign would look "full" with 0 vouchers out).
update public.campaigns c
   set granted_count = (
     select count(*) from public.vouchers v where v.campaign_id = c.id
   );
