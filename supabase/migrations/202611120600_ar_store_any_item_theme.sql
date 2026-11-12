-- Store site, owner 2026-11-12:
-- 1) «الاصناف المش موجوده تقدر تضيفها للطلب من غير سعرها مش نضيفها فى الملحوظات عشان فى مرحله تانيه هنضيفها للنواقص بالمزامنه»
--    - an item marked «صعب طلبه» in PharmaFly (status 'unavailable') is ordered like «بالطلب»: no price, on_order = true
--    - a line the customer typed (not on the site): {"text": "...", "qty": n} becomes
--      {"name": text, "qty", "price": null, "line_total": null, "on_order": true, "free_text": true}; 2-120 letters, max 10 such lines
-- 2) «نفس اعدادات البوت … اقدر اغير فيها براحتى او العميل يقدر كمان»: the site's default color and night look,
--    set by the owner from the bot; each customer can still change them on his phone.
-- Nothing else changes: prices and the total still come only from ar_store_items, same limits (30 lines, 20 each, 5 orders/hour).

alter table public.ar_store_settings add column if not exists theme_color text;
alter table public.ar_store_settings add column if not exists theme_night boolean not null default false;
do $$ begin
  alter table public.ar_store_settings add constraint ar_store_settings_theme_color_chk
    check (theme_color is null or theme_color ~ '^[a-z]{2,12}$' or theme_color ~ '^c:#[0-9a-f]{6}$');
exception when duplicate_object then null; end $$;

create or replace function public.ar_store_place_order(p_name text, p_phone text, p_address text, p_notes text, p_items jsonb, p_rx text[] default null::text[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_lines jsonb := '[]'::jsonb; v_text jsonb := '[]'::jsonb; v_total numeric := 0; v_bad int := 0; v_n int; v_id bigint;
  v_nid int; v_ntext int;
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
        select r.id, r.qty, i.name, i.price, (i.status in ('on_order', 'unavailable')) as later,
               (i.id is not null and i.is_listed and not i.hidden and not i.needs_rx
                and ((i.status = 'available' and i.price > 0) or i.status in ('on_order', 'unavailable'))) as ok
        from req r left join public.ar_store_items i on i.id = r.id
      )
      select count(*) filter (where not ok) + (v_nid - count(*)),
             jsonb_agg(case when later
                            then jsonb_build_object('id', id, 'name', name, 'qty', qty, 'price', null, 'line_total', null, 'on_order', true)
                            else jsonb_build_object('id', id, 'name', name, 'qty', qty, 'price', price, 'line_total', qty * price) end) filter (where ok),
             coalesce(sum(qty * price) filter (where ok and not later), 0)
      into v_bad, v_lines, v_total from j;
      if v_bad > 0 or v_lines is null then return jsonb_build_object('ok', false, 'error', 'item_not_available'); end if;
    end if;
    v_lines := coalesce(v_lines, '[]'::jsonb) || coalesce(v_text, '[]'::jsonb);
  end if;

  insert into public.ar_store_orders (customer_name, phone, address, notes, items, total, rx_paths)
  values (left(btrim(p_name), 80), v_phone, left(btrim(p_address), 300), nullif(left(btrim(coalesce(p_notes, '')), 500), ''),
          coalesce(v_lines, '[]'::jsonb), coalesce(v_total, 0), v_rx)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'order_id', v_id, 'total', coalesce(v_total, 0), 'items', coalesce(v_lines, '[]'::jsonb), 'rx', cardinality(v_rx));
end $function$;
