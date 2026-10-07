create or replace function public.track_order(p_order_number text)
returns json
language plpgsql security definer as $$
declare
  v_order record;
  v_items json;
begin
  select o.id, o.order_number, o.status, o.rejection_reason, o.created_at
  into v_order
  from public.orders o
  where o.order_number = trim(p_order_number);

  if not found then
    return null;
  end if;

  select json_agg(json_build_object(
    'name', coalesce(i.product_name_snapshot, i.deal_name_snapshot),
    'quantity', i.quantity,
    'size', i.size_snapshot
  ))
  into v_items
  from (
    select product_name_snapshot, null as deal_name_snapshot, quantity, size_snapshot
    from public.order_items where order_id = v_order.id
    union all
    select null, deal_name_snapshot, quantity, null
    from public.order_deals where order_id = v_order.id
  ) i;

  return json_build_object(
    'order_number', v_order.order_number,
    'status', v_order.status,
    'rejection_reason', v_order.rejection_reason,
    'created_at', v_order.created_at,
    'items', coalesce(v_items, '[]'::json)
  );
end;
$$;
