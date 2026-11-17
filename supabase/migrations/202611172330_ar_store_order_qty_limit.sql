-- 202611172330_ar_store_order_qty_limit (NOT applied yet: needs the owner's approval on the phone)
-- ASKER store, owner 2026-11-17: «لما حد يطلب أوردر من الموقع، المفروض لو طلب أزيد من الكمية المتاحة يطلع له تنبيه عشان ما يطلبش وبعد كده يلاقي الكمية ما جاتلوش مظبوطة. ده كلام مش مظبوط».
-- The site only knew «available / on order / unavailable», never how many. Now:
--   ar_store_boxes(packs, units) : the whole boxes a customer can be promised from a stock row: the main store's whole packs, or 1 when only loose units are left; at most 20 (the site's own limit per line).
--   ar_store_item_qty(ids)       : for the items in a customer's cart (at most 50 ids), the boxes available: {"max": {"<id>": n}}. Only items that are on the site and «available» and have a stock row; no row = no
--                                  limit. It never gives more than 20, so no stock above the order limit leaves the building (ar_stock itself stays owner-only: the numbers are not public, as decided 2026-11-09).
--   ar_store_place_order         : the same function as 202611120700 with one more check: a line above the boxes in stock is refused with error 'qty' and the items with their maximum, so a stale cart can never
--                                  place an order the pharmacy cannot fill. (ar_customer_place_order calls it, so the customer's link is covered too.)
-- Rollback: put back ar_store_place_order from 202611120700 and: drop function public.ar_store_item_qty(bigint[]); drop function public.ar_store_boxes(numeric, numeric);

create or replace function public.ar_store_boxes(p_packs numeric, p_units numeric)
 returns integer
 language sql
 immutable
 set search_path to ''
as $function$
  select least(20, case when coalesce(p_packs, 0) >= 1 then floor(p_packs)::int when coalesce(p_units, 0) > 0 then 1 else 0 end)
$function$;

create or replace function public.ar_store_item_qty(p_ids bigint[])
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_out jsonb;
begin
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 50 then return jsonb_build_object('ok', false, 'error', 'bad_items'); end if;
  select coalesce(jsonb_object_agg(i.id::text, public.ar_store_boxes(s.packs, s.units)), '{}'::jsonb) into v_out
    from public.ar_store_items i join public.ar_stock s on s.item_id = i.id
   where i.id = any (p_ids) and i.is_listed and not i.hidden and i.status = 'available' and public.ar_store_boxes(s.packs, s.units) > 0;
  return jsonb_build_object('ok', true, 'max', v_out);
end $function$;
revoke all on function public.ar_store_item_qty(bigint[]) from public;
grant execute on function public.ar_store_item_qty(bigint[]) to anon, authenticated;
create or replace function public.ar_store_place_order(p_name text, p_phone text, p_address text, p_notes text, p_items jsonb, p_rx text[] default null::text[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_lines jsonb := '[]'::jsonb; v_text jsonb := '[]'::jsonb; v_total numeric := 0; v_bad int := 0; v_n int; v_id bigint;
  v_nid int; v_ntext int; v_over jsonb;
  v_rx text[] := coalesce(p_rx, '{}'::text[]);
begin
  if exists (select 1 from public.ar_store_settings where id = 1 and not is_open) then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if v_phone ~ '^201[0-9]{9}$' then v_phone := substr(v_phone, 2); end if;
  if v_phone !~ '^01[0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'bad_phone'); end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  if char_length(btrim(coalesce(p_address, ''))) < 5 then return jsonb_build_object('ok', false, 'error', 'bad_address'); end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then return jsonb_build_object('ok', false, 'error', 'bad_items'); end if;
  v_n := jsonb_array_length(coalesce(p_items, '[]'::jsonb));
  if cardinality(v_rx) > 4 then return jsonb_build_object('ok', false, 'error', 'bad_rx'); end if;
  if cardinality(v_rx) > 0 and (select count(distinct o.name) from storage.objects o
        where o.bucket_id = 'ar-store-rx' and o.name = any(v_rx) and o.created_at > now() - interval '1 day') <> cardinality(v_rx) then
    return jsonb_build_object('ok', false, 'error', 'bad_rx');
  end if;
  if v_n > 30 or (v_n = 0 and cardinality(v_rx) = 0) then return jsonb_build_object('ok', false, 'error', 'bad_items'); end if;
  if (select count(*) from public.ar_store_orders where phone = v_phone and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  if v_n > 0 then
    select count(*) filter (where (e->>'id') ~ '^[0-9]{1,12}$'),
           count(*) filter (where e ? 'text' and not (e ? 'id'))
      into v_nid, v_ntext
      from jsonb_array_elements(p_items) e;
    if v_nid + v_ntext <> v_n or v_ntext > 10 then return jsonb_build_object('ok', false, 'error', 'bad_items'); end if;

    -- typed lines (not on the site): kept as text, no price
    if v_ntext > 0 then
      if exists (select 1 from jsonb_array_elements(p_items) e
                 where e ? 'text' and not (e ? 'id')
                   and char_length(regexp_replace(btrim(coalesce(e->>'text', '')), '\s+', ' ', 'g')) not between 2 and 120) then
        return jsonb_build_object('ok', false, 'error', 'bad_text');
      end if;
      select jsonb_agg(jsonb_build_object('name', regexp_replace(btrim(e->>'text'), '\s+', ' ', 'g'),
                                          'qty', least(greatest(coalesce((e->>'qty')::int, 1), 1), 20),
                                          'price', null, 'line_total', null, 'on_order', true, 'free_text', true))
        into v_text
        from jsonb_array_elements(p_items) e where e ? 'text' and not (e ? 'id');
    end if;

    if v_nid > 0 then
      with req as (
        select (e->>'id')::bigint as id, least(greatest(coalesce((e->>'qty')::int, 1), 1), 20) as qty
        from jsonb_array_elements(p_items) e where (e->>'id') ~ '^[0-9]{1,12}$'
      ), j as (
        select r.id, r.qty, i.name, i.price, (i.status = 'on_order') as later,
               (i.id is not null and i.is_listed and not i.hidden and not i.needs_rx
                and ((i.status = 'available' and i.price > 0) or i.status = 'on_order')) as ok
        from req r left join public.ar_store_items i on i.id = r.id
      )
      select count(*) filter (where not ok) + (v_nid - count(*)),
             jsonb_agg(case when later
                            then jsonb_build_object('id', id, 'name', name, 'qty', qty, 'price', null, 'line_total', null, 'on_order', true)
                            else jsonb_build_object('id', id, 'name', name, 'qty', qty, 'price', price, 'line_total', qty * price) end) filter (where ok),
             coalesce(sum(qty * price) filter (where ok and not later), 0)
      into v_bad, v_lines, v_total from j;
      if v_bad > 0 or v_lines is null then return jsonb_build_object('ok', false, 'error', 'item_not_available'); end if;

      -- more than the pharmacy has (owner 2026-11-17: «لو طلب أزيد من الكمية المتاحة يطلع له تنبيه … بعد كده يلاقي الكمية ما جاتلوش مظبوطة»): the main store's whole boxes (ar_stock, the same source the page's warning uses);
      -- an item with no stock row has no limit here (the stock list can lag the item list by hours), «on order» items have none
      select jsonb_agg(jsonb_build_object('id', q.id, 'name', i.name, 'max', q.boxes) order by q.id) into v_over
        from (select r.id, sum(r.qty) as qty, max(public.ar_store_boxes(s.packs, s.units)) as boxes
                from (select (e->>'id')::bigint as id, least(greatest(coalesce((e->>'qty')::int, 1), 1), 20) as qty
                        from jsonb_array_elements(p_items) e where (e->>'id') ~ '^[0-9]{1,12}$') r
                join public.ar_store_items i2 on i2.id = r.id and i2.status = 'available'
                join public.ar_stock s on s.item_id = r.id
               group by r.id) q
        join public.ar_store_items i on i.id = q.id
       where q.boxes > 0 and q.qty > q.boxes;
      if v_over is not null then return jsonb_build_object('ok', false, 'error', 'qty', 'items', v_over); end if;    end if;
    v_lines := coalesce(v_lines, '[]'::jsonb) || coalesce(v_text, '[]'::jsonb);
  end if;

  insert into public.ar_store_orders (customer_name, phone, address, notes, items, total, rx_paths)
  values (left(btrim(p_name), 80), v_phone, left(btrim(p_address), 300), nullif(left(btrim(coalesce(p_notes, '')), 500), ''),
          coalesce(v_lines, '[]'::jsonb), coalesce(v_total, 0), v_rx)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'order_id', v_id, 'total', coalesce(v_total, 0), 'items', coalesce(v_lines, '[]'::jsonb), 'rx', cardinality(v_rx));
end $function$;
