-- =========================================================================
-- Little Chef Pizza — policies.sql
-- Row Level Security + the one trusted RPC function that is allowed to
-- write orders. Run AFTER schema.sql and seed.sql.
-- =========================================================================

-- --------------------------------------------------------------- helpers
create or replace function public.current_profile_id() returns uuid
language sql stable as $$
  select id from public.profiles where auth_user_id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select exists (
    select 1 from public.profiles where auth_user_id = auth.uid() and role = 'admin'
  )
$$;

-- ------------------------------------------------------------- profiles
alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth_user_id = auth.uid() or public.is_admin());

create policy "profiles_update_own" on public.profiles
  for update using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid() and role = (select role from public.profiles where auth_user_id = auth.uid()));
  -- the WITH CHECK re-reads the existing role, so a client can never smuggle role='admin' into an update

-- Row creation happens via a SECURITY DEFINER trigger/function tied to
-- Supabase Auth signup (see functions/on_signup.sql), never a direct insert
-- from the client — so there is no public INSERT policy on profiles at all.

-- ----------------------------------------------------- public catalog data
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.deals enable row level security;
alter table public.deal_items enable row level security;
alter table public.delivery_areas enable row level security;

create policy "catalog_public_read" on public.categories for select using (true);
create policy "products_public_read" on public.products for select using (true);
create policy "deals_public_read" on public.deals for select using (true);
create policy "deal_items_public_read" on public.deal_items for select using (true);
create policy "delivery_areas_public_read" on public.delivery_areas for select using (true);

create policy "products_admin_write" on public.products for all using (public.is_admin()) with check (public.is_admin());
create policy "deals_admin_write" on public.deals for all using (public.is_admin()) with check (public.is_admin());
create policy "deal_items_admin_write" on public.deal_items for all using (public.is_admin()) with check (public.is_admin());
create policy "categories_admin_write" on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy "delivery_areas_admin_write" on public.delivery_areas for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------------ orders
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_deals enable row level security;

-- Customers can see only their own orders. Admin can see everything.
-- Guests have NO select access to the orders table at all (enforced by
-- omitting any policy that would grant it to the anon role).
create policy "orders_select_own_or_admin" on public.orders
  for select using (user_id = public.current_profile_id() or public.is_admin());

-- No direct INSERT policy for anon/authenticated — all order creation goes
-- through public.create_order() below, which validates everything
-- server-side before writing. This blocks clients from ever forging a
-- total, a price, or an order status directly.

-- Admin may update status only (delivered), never any financial fields.
create policy "orders_admin_update_status" on public.orders
  for update using (public.is_admin())
  with check (public.is_admin());

create policy "order_items_select_via_order" on public.order_items
  for select using (
    exists (select 1 from public.orders o where o.id = order_id and (o.user_id = public.current_profile_id() or public.is_admin()))
  );
create policy "order_deals_select_via_order" on public.order_deals
  for select using (
    exists (select 1 from public.orders o where o.id = order_id and (o.user_id = public.current_profile_id() or public.is_admin()))
  );

-- =========================================================================
-- create_order(): the ONLY way rows ever land in orders/order_items/order_deals.
-- SECURITY DEFINER so it can write on behalf of anon (guest) callers too,
-- but it independently re-derives every price/availability/total from the
-- current catalog — the client's numbers are never trusted.
-- Mirrors LCP_DB.orders.create() in js/db.js exactly.
-- =========================================================================
create or replace function public.create_order(
  p_items jsonb,             -- [{product_id, size, qty}]
  p_deals jsonb,              -- [{deal_id, qty}]
  p_customer_name text,
  p_customer_phone text,
  p_order_type text,
  p_delivery_area text,
  p_delivery_address text,
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
  v_delivery_charge numeric(10,2);
begin
  if p_customer_name is null or length(trim(p_customer_name)) < 2 then
    raise exception 'Please enter your name.';
  end if;
  if p_customer_phone is null or p_customer_phone !~ '^[0-9+\-\s]{7,15}$' then
    raise exception 'Please enter a valid phone number.';
  end if;
  if p_order_type not in ('delivery','takeaway','dine-in') then
    raise exception 'Please choose an order type.';
  end if;
  if not coalesce(p_cancellation_acknowledged, false) then
    raise exception 'Please confirm you understand the cancellation policy.';
  end if;

  if p_order_type = 'delivery' then
    if not exists (select 1 from public.delivery_areas where name = p_delivery_area and active) then
      raise exception 'Sorry, delivery is currently unavailable at your selected location.';
    end if;
    if p_delivery_address is null or length(trim(p_delivery_address)) < 5 then
      raise exception 'Please enter your full delivery address.';
    end if;
  end if;

  v_order.id := gen_random_uuid();
  v_order.order_number := public.next_order_number();

  insert into public.orders (
    id, order_number, user_id, customer_type, customer_name, customer_phone,
    order_type, delivery_area, delivery_address, subtotal, delivery_charge, discount, total,
    status, cancellation_acknowledged
  ) values (
    v_order.id, v_order.order_number, v_profile_id, case when v_profile_id is null then 'guest' else 'customer' end,
    trim(p_customer_name), trim(p_customer_phone), p_order_type,
    case when p_order_type = 'delivery' then p_delivery_area else null end,
    case when p_order_type = 'delivery' then p_delivery_address else null end,
    0, null, 0, 0, 'pending', true
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

  select (value #>> '{}')::numeric into v_delivery_charge from public.site_settings where key = 'delivery_charge';
  -- delivery_charge remains NULL/TBD until the restaurant finalizes and updates site_settings

  update public.orders
    set subtotal = v_subtotal, delivery_charge = case when p_order_type='delivery' then v_delivery_charge else null end,
        total = v_subtotal + coalesce(case when p_order_type='delivery' then v_delivery_charge else null end, 0)
    where id = v_order.id
    returning * into v_order;

  return v_order;
end;
$$;

-- Guests (anon) and logged-in customers may both call this function;
-- everything inside it is validated, so this is safe to expose broadly.
grant execute on function public.create_order to anon, authenticated;

-- Admin-only: mark an order delivered (kept as its own narrow function so
-- clients never issue a raw UPDATE that could also change price/status fields together).
create or replace function public.mark_order_delivered(p_order_id uuid) returns public.orders
language plpgsql security definer as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'Not authorized.'; end if;
  update public.orders set status = 'delivered', delivered_at = now()
    where id = p_order_id and status = 'pending'
    returning * into v_order;
  if v_order.id is null then raise exception 'Order not found or already delivered.'; end if;
  return v_order;
end;
$$;
grant execute on function public.mark_order_delivered to authenticated;
