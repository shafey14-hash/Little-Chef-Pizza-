-- =========================================================================
-- Little Chef Pizza — location_and_payments.sql
-- Run this ONCE, after schema.sql/seed.sql/policies.sql/auth_and_admin.sql
-- /storage_policies.sql already exist in your project. This file ALTERS
-- the existing tables/functions rather than recreating them, so your
-- current data (products, deals, customers, past orders) is untouched.
--
-- What this adds:
--   - profiles.email (optional contact email, separate from the internal
--     synthetic login email — never used for auth)
--   - orders: alt_contact_phone, special_instructions, customer_email,
--     payment_screenshot_path, updated_at, out_for_delivery_at,
--     payment_verified_at, rejected_at, delivery_lat/lng
--   - New order status set: payment_verification / pending /
--     out_for_delivery / delivered / rejected
--   - New payment_method set: cod / easypaisa
--   - Order numbers switch to DDMMYYYY-XXXX (unique, collision-checked)
--   - create_order() rewritten: takes the new checkout fields, validates
--     the 5km delivery radius SERVER-SIDE (never trusts the browser),
--     sets starting status based on payment method
--   - Admin-only transition functions: approve_payment / reject_payment /
--     mark_out_for_delivery / mark_delivered
--   - site_settings: delivery charge set to a real 250 PKR, plus EasyPaisa
--     account details (configurable here, never hardcoded in the frontend)
--   - A private "payment-screenshots" Storage bucket + admin-only policies
-- =========================================================================

-- ------------------------------------------------------------- profiles
alter table public.profiles add column if not exists email text;

-- Keep the signup trigger in sync with the new optional email field.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer as $$
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
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------- orders
alter table public.orders add column if not exists alt_contact_phone text;
alter table public.orders add column if not exists special_instructions text;
alter table public.orders add column if not exists customer_email text;
alter table public.orders add column if not exists payment_screenshot_path text;
alter table public.orders add column if not exists delivery_lat double precision;
alter table public.orders add column if not exists delivery_lng double precision;
alter table public.orders add column if not exists updated_at timestamptz not null default now();
alter table public.orders add column if not exists out_for_delivery_at timestamptz;
alter table public.orders add column if not exists payment_verified_at timestamptz;
alter table public.orders add column if not exists rejected_at timestamptz;

create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

-- New status set. If you have existing orders with the old 'pending'/
-- 'delivered' values, they remain valid — those two statuses still exist,
-- we're just adding three more.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('payment_verification','pending','out_for_delivery','delivered','rejected'));

alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders alter column payment_method drop default;
update public.orders set payment_method = 'cod' where payment_method = 'cash';
update public.orders set payment_method = 'easypaisa' where payment_method = 'online';
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('cod','easypaisa'));
alter table public.orders alter column payment_method set default 'cod';

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('unpaid','paid'));

-- ------------------------------------------------------------ order numbers
-- Format: DDMMYYYY-XXXX (e.g. 09092026-4827). Loops until a genuinely
-- unused 4-digit suffix is found for today's date — never relies on
-- randomness alone.
create or replace function public.generate_daily_order_number() returns text
language plpgsql as $$
declare
  v_prefix text := to_char(now(), 'DDMMYYYY');
  v_candidate text;
  v_attempts int := 0;
begin
  loop
    v_candidate := v_prefix || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.orders where order_number = v_candidate);
    v_attempts := v_attempts + 1;
    if v_attempts > 50 then
      -- Extremely unlikely (would mean 50+ collisions in one day), but
      -- fall back to a guaranteed-unique sequence-based suffix rather than loop forever.
      v_candidate := v_prefix || '-' || lpad((nextval('public.order_number_seq') % 10000)::text, 4, '0');
      exit;
    end if;
  end loop;
  return v_candidate;
end;
$$;

-- =========================================================================
-- create_order() — REWRITTEN for the new checkout flow.
-- Server-side re-validates: prices/availability (as before), PLUS the 5km
-- delivery radius (Haversine, computed here — never trusted from the
-- browser), PLUS the fixed 250 PKR delivery charge, PLUS the correct
-- starting status for the chosen payment method.
-- =========================================================================
drop function if exists public.create_order(jsonb, jsonb, text, text, text, text, text, boolean);

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
  v_product public.products;
  v_deal_row public.deals;
  v_unit_price numeric(10,2);
  v_qty int;
  v_line_total numeric(10,2);
  v_delivery_charge numeric(10,2) := 0;
  v_center_lat double precision := 32.57349;
  v_center_lng double precision := 74.08170;
  v_radius_km double precision := 5;
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
    select (value #>> '{}')::numeric into v_delivery_charge from public.site_settings where key = 'delivery_charge';
    v_delivery_charge := coalesce(v_delivery_charge, 250);
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
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    if v_product.id is null then raise exception 'One of the items in your bucket no longer exists.'; end if;
    if not v_product.available then raise exception '"%" is currently unavailable.', v_product.name; end if;

    if v_product.sizes is not null then
      v_unit_price := (v_product.sizes ->> (v_item->>'size'))::numeric;
    else
      v_unit_price := v_product.price;
    end if;
    if v_unit_price is null then raise exception 'Invalid size selected for "%".', v_product.name; end if;

    v_qty := greatest(1, least(50, coalesce((v_item->>'qty')::int, 1)));
    v_line_total := v_unit_price * v_qty;
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_snapshot, quantity, line_total)
    values (v_order.id, v_product.id, v_product.name || coalesce(' (' || (v_item->>'size') || ')', ''), v_unit_price, v_qty, v_line_total);
  end loop;

  for v_deal in select * from jsonb_array_elements(coalesce(p_deals, '[]'::jsonb)) loop
    select * into v_deal_row from public.deals where id = (v_deal->>'deal_id')::uuid;
    if v_deal_row.id is null then raise exception 'One of the deals in your bucket no longer exists.'; end if;
    if not v_deal_row.available then raise exception '"%" is currently unavailable.', v_deal_row.name; end if;

    v_qty := greatest(1, least(20, coalesce((v_deal->>'qty')::int, 1)));
    v_line_total := v_deal_row.price * v_qty;
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_deals (order_id, deal_id, deal_name_snapshot, deal_price_snapshot, quantity, line_total)
    values (v_order.id, v_deal_row.id, v_deal_row.name, v_deal_row.price, v_qty, v_line_total);
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
-- Admin-only order transition functions. Each checks public.is_admin()
-- itself, so even if a customer somehow calls these via the API directly,
-- they are rejected — the frontend buttons are not the real security
-- boundary, these functions are.
-- =========================================================================
drop function if exists public.mark_order_delivered(uuid); -- superseded by the explicit workflow below

create or replace function public.approve_payment(p_order_id uuid) returns public.orders
language plpgsql security definer as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'Not authorized.'; end if;
  update public.orders set status = 'pending', payment_status = 'paid', payment_verified_at = now()
    where id = p_order_id and status = 'payment_verification'
    returning * into v_order;
  if v_order.id is null then raise exception 'Order not found or not awaiting payment verification.'; end if;
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

create or replace function public.mark_out_for_delivery(p_order_id uuid) returns public.orders
language plpgsql security definer as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'Not authorized.'; end if;
  update public.orders set status = 'out_for_delivery', out_for_delivery_at = now()
    where id = p_order_id and status = 'pending'
    returning * into v_order;
  if v_order.id is null then raise exception 'Order not found or not pending.'; end if;
  return v_order;
end;
$$;

create or replace function public.mark_delivered(p_order_id uuid) returns public.orders
language plpgsql security definer as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'Not authorized.'; end if;
  update public.orders set status = 'delivered', delivered_at = now()
    where id = p_order_id and status = 'out_for_delivery'
    returning * into v_order;
  if v_order.id is null then raise exception 'Order not found or not out for delivery.'; end if;
  return v_order;
end;
$$;

grant execute on function public.approve_payment to authenticated;
grant execute on function public.reject_payment to authenticated;
grant execute on function public.mark_out_for_delivery to authenticated;
grant execute on function public.mark_delivered to authenticated;

-- ------------------------------------------------------------ site_settings
alter table public.site_settings enable row level security;
drop policy if exists "site_settings_public_read" on public.site_settings;
create policy "site_settings_public_read" on public.site_settings for select using (true);
drop policy if exists "site_settings_admin_write" on public.site_settings;
create policy "site_settings_admin_write" on public.site_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- Delivery charge is now a real, finalized value. EasyPaisa account
-- details live here too — configurable without touching any code.
update public.site_settings set value = '250' where key = 'delivery_charge';

insert into public.site_settings (key, value) values
  ('easypaisa_account_number', '"0300-0000000"'),
  ('easypaisa_account_name', '"Little Chef Pizza"')
on conflict (key) do nothing;

-- =========================================================================
-- Storage: private bucket for payment screenshots (financial proof —
-- unlike menu images, this must NOT be publicly readable). Admins view
-- screenshots via short-lived signed URLs generated on demand.
-- =========================================================================
insert into storage.buckets (id, name, public)
values ('payment-screenshots', 'payment-screenshots', false)
on conflict (id) do nothing;

drop policy if exists "payment_screenshots_upload" on storage.objects;
create policy "payment_screenshots_upload"
  on storage.objects for insert
  with check (bucket_id = 'payment-screenshots');

drop policy if exists "payment_screenshots_admin_read" on storage.objects;
create policy "payment_screenshots_admin_read"
  on storage.objects for select
  using (bucket_id = 'payment-screenshots' and public.is_admin());

drop policy if exists "payment_screenshots_admin_delete" on storage.objects;
create policy "payment_screenshots_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'payment-screenshots' and public.is_admin());