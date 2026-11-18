-- 202611190200_ar_store_item_max (NOT applied yet: needs the owner's approval on the phone)
-- ASKER store, owner 2026-11-19: «لما عميل يجي يطلب صنف من على الموقع … هتعمل لي أوبشن إن أنا أحدد أقصى كمية من أصناف معينة، ولو مفيش رصيد في الصيدلية غير واحدة ما يوافقش على أكتر من الموجود أو من اللي أنا محدده».
-- The «not more than there is» half is migration 202611172330. This is the other half: the owner picks, per item, the most boxes one order may hold.
--   ar_store_items.max_per_order : smallint, null = no limit set by the owner (the site's own 20 per line stays); 1..20. The owner and the staff who handle site orders already have update on this table (policies «Owner ar store items»,
--                                  «Staff all ar_store_items»); the hub's sync never writes it (it lists its columns). The public may read it with the rest of the row: the cap is meant to be shown to the customer.
--   ar_store_item_qty(ids)       : the same call the cart already makes. «max» is now the smaller of the boxes in stock and the owner's cap (an item with no stock row, or on order, is limited by the cap alone); a new «cap» object names the items
--                                  where the OWNER's number is the one that binds (cap < boxes, or no boxes), so the page can say «أقصى كمية في الطلب الواحد N» instead of «المتاح عندنا».
--   ar_store_place_order         : the same function as 202611172330 with the over-check widened the same way: a line above min(boxes, cap) is refused with error 'qty'; each item now carries «cap» true/false. (ar_customer_place_order calls it, so a customer's link is covered too.)
-- Rollback: put back ar_store_item_qty and ar_store_place_order from 202611172330, then: alter table public.ar_store_items drop column max_per_order;

alter table public.ar_store_items add column if not exists max_per_order smallint;
alter table public.ar_store_items drop constraint if exists ar_store_items_max_per_order_check;
alter table public.ar_store_items add constraint ar_store_items_max_per_order_check check (max_per_order is null or max_per_order between 1 and 20);

create or replace function public.ar_store_item_qty(p_ids bigint[])
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_max jsonb; v_cap jsonb;
begin
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 50 then return jsonb_build_object('ok', false, 'error', 'bad_items'); end if;
  select coalesce(jsonb_object_agg(q.id::text, q.eff), '{}'::jsonb),
         coalesce(jsonb_object_agg(q.id::text, true) filter (where q.capped), '{}'::jsonb)
    into v_max, v_cap
    from (select b.id, least(b.boxes, b.cap) as eff, b.cap is not null and (b.boxes is null or b.cap < b.boxes) as capped
            from (select i.id, i.max_per_order::int as cap,
                         nullif(case when i.status = 'available' then public.ar_store_boxes(s.packs, s.units) end, 0) as boxes
                    from public.ar_store_items i left join public.ar_stock s on s.item_id = i.id
                   where i.id = any (p_ids) and i.is_listed and not i.hidden and i.status in ('available', 'on_order')) b) q
   where q.eff is not null;
  return jsonb_build_object('ok', true, 'max', v_max, 'cap', v_cap);
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

      -- more than the pharmacy has (2026-11-17) or more than the owner lets one order hold (2026-11-19, ar_store_items.max_per_order): the smaller of the two is the maximum.
      -- An item with no stock row has no stock limit here (the stock list can lag the item list by hours); «on order» items only have the owner's cap. A repeated id counts together.
      select jsonb_agg(jsonb_build_object('id', q.id, 'name', q.name, 'max', q.eff, 'cap', q.capped) order by q.id) into v_over
        from (select b.id, b.name, b.qty, least(b.boxes, b.cap) as eff, b.cap is not null and (b.boxes is null or b.cap < b.boxes) as capped
                from (select r.id, i.name, r.qty, i.max_per_order::int as cap,
                             nullif(case when i.status = 'available' then public.ar_store_boxes(s.packs, s.units) end, 0) as boxes
                        from (select (e->>'id')::bigint as id, sum(least(greatest(coalesce((e->>'qty')::int, 1), 1), 20)) as qty
                                from jsonb_array_elements(p_items) e where (e->>'id') ~ '^[0-9]{1,12}$' group by 1) r
                        join public.ar_store_items i on i.id = r.id
                        left join public.ar_stock s on s.item_id = r.id) b) q
       where q.eff is not null and q.qty > q.eff;
      if v_over is not null then return jsonb_build_object('ok', false, 'error', 'qty', 'items', v_over); end if;
    end if;
    v_lines := coalesce(v_lines, '[]'::jsonb) || coalesce(v_text, '[]'::jsonb);
  end if;

  insert into public.ar_store_orders (customer_name, phone, address, notes, items, total, rx_paths)
  values (left(btrim(p_name), 80), v_phone, left(btrim(p_address), 300), nullif(left(btrim(coalesce(p_notes, '')), 500), ''),
          coalesce(v_lines, '[]'::jsonb), coalesce(v_total, 0), v_rx)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'order_id', v_id, 'total', coalesce(v_total, 0), 'items', coalesce(v_lines, '[]'::jsonb), 'rx', cardinality(v_rx));
end $function$;
