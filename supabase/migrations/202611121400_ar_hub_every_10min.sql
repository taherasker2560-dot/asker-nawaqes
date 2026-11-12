-- 202611121400_ar_hub_every_10min (NOT applied yet: the owner said «ا» 2026-11-12 ~13:15 to this plan; applying needs his «طبّق»)
-- ASKER: the laptop updates everything after every FlyBackup partial copy (~every 10 minutes), the voice says it once an hour,
-- and only what changed is uploaded (owner's job, decided 2026-11-12 ~12:30 in the photos session, plan OK «ا»).
--   ar_store_sync_delta : the store items that changed since the laptop's last good send, and the ones gone (hidden, never
--                         deleted). Logs a STORE_OK row like the full send, so «the laptop is alive» and the voice work as before.
--   ar_stock_sync_delta : the stock rows that changed, the ones gone (removed, as the full send does), and every row gets the
--                         run's data time (the stock page shows the newest, the voice waits for the oldest).
--   ar_sync_news        : block 4) «البوت اتحدث كله، لحد الساعة …» is said at most once in 55 minutes (once an hour), not after
--                         every send. Everything else in the function is unchanged (copied from the live one, 202611112300).
-- The full sends (ar_store_sync / ar_stock_sync) stay as they are: the laptop uses them once a day to check everything.
-- Both delta functions refuse a send that would leave far fewer items (a half-restored database), like the full ones.
-- Rollback: drop function public.ar_store_sync_delta(text, jsonb, jsonb, text, integer);
--           drop function public.ar_stock_sync_delta(text, jsonb, jsonb, text, integer);
--           and re-apply 202611112300_ar_sync_news_one_sentence.sql (the voice after every send).

create or replace function public.ar_store_sync_delta(p_key text, p_items jsonb, p_gone jsonb, p_data_at text, p_total integer)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; v_n int; v_g int; v_up int := 0; v_hidden int := 0; v_listed int; v_status text := 'OK'; v_ar int := 0;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_gone, '[]'::jsonb)) <> 'array' then
    raise exception 'items and gone must be arrays';
  end if;
  v_n := jsonb_array_length(coalesce(p_items, '[]'::jsonb));
  v_g := jsonb_array_length(coalesce(p_gone, '[]'::jsonb));
  if v_n > 6000 then raise exception 'batch too big (max 6000)'; end if;
  if v_g > 1000 then raise exception 'too many gone (max 1000)'; end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_store_sync'));
  select count(*) into v_listed from public.ar_store_items where is_listed;
  -- the laptop's whole list now: far fewer than what is listed = a half-restored database, refused
  if p_total is null or p_total < 1 or (v_listed >= 1000 and p_total < 0.3 * v_listed) then
    v_status := 'REFUSED_TOO_FEW';
  else
    if v_n > 0 then
      insert into public.ar_store_items as t (id, name, status, price, cat, needs_rx, popular_rank, is_listed, seen_run, data_at, updated_at)
      select (e->>'id')::bigint,
             left(btrim(e->>'name'), 250),
             e->>'status',
             case when e->>'status' = 'available' and (e->>'price')::numeric > 0 then round((e->>'price')::numeric, 2) end,
             left(e->>'cat', 40),
             coalesce((e->>'needs_rx')::boolean, false),
             case when (e->>'popular_rank') ~ '^[0-9]{1,3}$' and (e->>'popular_rank')::int between 1 and 200 then (e->>'popular_rank')::int end,
             true, 'delta', p_data_at, now()
      from jsonb_array_elements(p_items) e
      where (e->>'id') ~ '^[0-9]{1,12}$' and char_length(btrim(coalesce(e->>'name', ''))) >= 2
        and e->>'status' in ('available', 'on_order', 'unavailable')
      on conflict (id) do update set
        name = excluded.name, status = excluded.status, price = excluded.price, cat = excluded.cat,
        needs_rx = excluded.needs_rx, popular_rank = excluded.popular_rank, is_listed = true, data_at = excluded.data_at,
        updated_at = case when (t.name, t.status, t.price, t.cat, t.needs_rx, t.popular_rank, t.is_listed)
                            is distinct from (excluded.name, excluded.status, excluded.price, excluded.cat, excluded.needs_rx, excluded.popular_rank, true)
                          then now() else t.updated_at end;
      get diagnostics v_up = row_count;
    end if;
    if v_g > 0 then
      update public.ar_store_items set is_listed = false, updated_at = now()
      where is_listed and id in (select (g #>> '{}')::bigint from jsonb_array_elements(p_gone) g where (g #>> '{}') ~ '^[0-9]{1,12}$');
      get diagnostics v_hidden = row_count;
    end if;
    if v_up > 0 then v_ar := public.ar_store_fill_arabic(); end if;
  end if;
  insert into public.ar_sync_log (source, data_at, dry_run, status, sent, listed, active_before, active_after, details, announced_at)
  values ('store delta', p_data_at, false, 'STORE_' || v_status, v_n, p_total, v_listed,
          (select count(*) from public.ar_store_items where is_listed),
          jsonb_build_object('changed', v_up, 'hidden', v_hidden, 'arabic_changed', v_ar), now());
  return jsonb_build_object('ok', v_status = 'OK', 'status', v_status, 'batch', v_n, 'upserted', v_up, 'hidden', v_hidden,
                            'listed', v_listed, 'arabic_changed', v_ar);
end $function$;
revoke all on function public.ar_store_sync_delta(text, jsonb, jsonb, text, integer) from public;
grant execute on function public.ar_store_sync_delta(text, jsonb, jsonb, text, integer) to anon, authenticated;

create or replace function public.ar_stock_sync_delta(p_key text, p_rows jsonb, p_gone jsonb, p_data_at text, p_total integer)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; v_n int; v_g int; v_up int := 0; v_gone int := 0; v_have int; v_status text := 'OK';
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_gone, '[]'::jsonb)) <> 'array' then
    raise exception 'rows and gone must be arrays';
  end if;
  v_n := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  v_g := jsonb_array_length(coalesce(p_gone, '[]'::jsonb));
  if v_n > 6000 then raise exception 'batch too big (max 6000)'; end if;
  if v_g > 1000 then raise exception 'too many gone (max 1000)'; end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_stock_sync'));
  select count(*) into v_have from public.ar_stock;
  if p_total is null or p_total < 1 or (v_have >= 1000 and p_total < 0.3 * v_have) then
    v_status := 'REFUSED_TOO_FEW';
  else
    if v_n > 0 then
      insert into public.ar_stock as t (item_id, name, packs, units, parts, exp_near, other, seen_run, data_at, updated_at)
      select (e->>'id')::bigint,
             left(btrim(e->>'name'), 250),
             greatest(0, round(coalesce((e->>'packs')::numeric, 0), 2)),
             greatest(0, round(coalesce((e->>'units')::numeric, 0), 2)),
             case when (e->>'parts') ~ '^[0-9]{1,5}$' and (e->>'parts')::int between 1 and 10000 then (e->>'parts')::int end,
             case when (e->>'exp') ~ '^\d{4}-\d{2}-\d{2}$' then (e->>'exp')::date end,
             case when jsonb_typeof(e->'other') = 'array' and jsonb_array_length(e->'other') <= 10 then e->'other' else '[]'::jsonb end,
             'delta', p_data_at, now()
      from jsonb_array_elements(p_rows) e
      where (e->>'id') ~ '^[0-9]{1,12}$' and char_length(btrim(coalesce(e->>'name', ''))) >= 2
        and (e->>'packs') ~ '^[0-9]+(\.[0-9]+)?$' and (e->>'units') ~ '^[0-9]+(\.[0-9]+)?$'
      on conflict (item_id) do update set
        name = excluded.name, packs = excluded.packs, units = excluded.units, parts = excluded.parts, exp_near = excluded.exp_near,
        other = excluded.other, data_at = excluded.data_at,
        updated_at = case when (t.name, t.packs, t.units, t.parts, t.exp_near, t.other)
                            is distinct from (excluded.name, excluded.packs, excluded.units, excluded.parts, excluded.exp_near, excluded.other)
                          then now() else t.updated_at end;
      get diagnostics v_up = row_count;
    end if;
    if v_g > 0 then
      delete from public.ar_stock
      where item_id in (select (g #>> '{}')::bigint from jsonb_array_elements(p_gone) g where (g #>> '{}') ~ '^[0-9]{1,12}$');
      get diagnostics v_gone = row_count;
    end if;
    -- every row is now as of this run's data (the page shows the newest time, the voice waits for the oldest)
    update public.ar_stock set data_at = p_data_at where data_at is distinct from p_data_at;
    update public.ar_stock s set arabic_name = i.arabic_name, price = i.price
      from public.ar_store_items i
      where i.id = s.item_id and (s.arabic_name, s.price) is distinct from (i.arabic_name, i.price);
  end if;
  return jsonb_build_object('ok', v_status = 'OK', 'status', v_status, 'batch', v_n, 'upserted', v_up, 'removed', v_gone, 'had', v_have);
end $function$;
revoke all on function public.ar_stock_sync_delta(text, jsonb, jsonb, text, integer) from public;
grant execute on function public.ar_stock_sync_delta(text, jsonb, jsonb, text, integer) to anon, authenticated;

-- the voice: the same function as 202611112300 (live), block 4) said at most once in 55 minutes
create or replace function public.ar_sync_news(p_key text, p_peek boolean default false)
returns "text/plain"
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text;
  v_ids bigint[];
  v_last public.ar_sync_log%rowtype;
  v_say text := '';
  v_warn text := '';
  v_last_ok timestamptz;
  v_last_list timestamptz;
  v_said timestamptz;
  v_hours int;
  v_orders text := '';
  v_oids bigint[];
  v_data text := '';
  v_store_at timestamptz;
  v_store_data text;
  v_stock_data text;
  v_ts timestamp;
  v_h int;
  v_m int;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{32,128}$' then
    raise exception 'bad key' using errcode = '28000';
  end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  if not exists (select 1 from public.ar_inbox_keys k where k.key_hash = v_hash)
     and not exists (select 1 from public.ar_sync_keys k where k.key_hash = v_hash) then
    raise exception 'bad key' using errcode = '28000';
  end if;

  -- 1) the laptop stopped sending. Any send counts as «alive» (the shortage list, or the store / stock items): over 6 hours
  --    without any = «اللاب ما بعتش حاجة». The shortage list has its own, longer limit: 30 hours.
  select max(l.at) into v_last_ok from public.ar_sync_log l where not l.dry_run and l.status in ('ok', 'STORE_OK');
  if v_last_ok is not null and v_last_ok < now() - interval '6 hours' then
    select a.said_at into v_said from public.ar_sync_alerts a where a.kind = 'stale';
    if v_said is null or v_said < now() - interval '6 hours' then
      v_hours := floor(extract(epoch from (now() - v_last_ok)) / 3600);
      v_warn := 'تنبيه: اللاب ما بعتش حاجة من ' || v_hours || ' ساعة، شوف اللابتوب';
      if not coalesce(p_peek, false) then
        insert into public.ar_sync_alerts (kind, said_at) values ('stale', now())
          on conflict (kind) do update set said_at = excluded.said_at;
      end if;
    end if;
  end if;
  select max(l.at) into v_last_list from public.ar_sync_log l where not l.dry_run and l.status = 'ok';
  if v_warn = '' and v_last_list is not null and v_last_list < now() - interval '30 hours' then
    select a.said_at into v_said from public.ar_sync_alerts a where a.kind = 'stale_list';
    if v_said is null or v_said < now() - interval '6 hours' then
      v_hours := floor(extract(epoch from (now() - v_last_list)) / 3600);
      v_warn := 'تنبيه: النواقص ماتحدّثتش من ' || v_hours || ' ساعة، دوس حدّث النواقص دلوقتي أو شوف اللابتوب';
      if not coalesce(p_peek, false) then
        insert into public.ar_sync_alerts (kind, said_at) values ('stale_list', now())
          on conflict (kind) do update set said_at = excluded.said_at;
      end if;
    end if;
  end if;
  -- 2) list updates not said yet: only a refused list is said (a warning); a good one is covered by the sentence of block 4)
  select coalesce(array_agg(l.id order by l.id), '{}') into v_ids
    from public.ar_sync_log l where not l.dry_run and l.announced_at is null;
  if cardinality(v_ids) > 0 then
    select * into v_last from public.ar_sync_log l where l.id = v_ids[cardinality(v_ids)];
    if v_last.status like 'refused%' then
      v_say := 'تحديث النواقص اترفض لأن القايمة الجديدة فيها مشكلة، والبوت لسه على القايمة القديمة';
    end if;
    if not coalesce(p_peek, false) then
      update public.ar_sync_log set announced_at = now() where id = any(v_ids);
    end if;
  end if;

  -- 3) store site orders not said yet (prescription-only orders said as «طلب روشتة»)
  select coalesce(array_agg(o.id order by o.id), '{}') into v_oids
    from public.ar_store_orders o where o.announced_at is null and o.status = 'new';
  if cardinality(v_oids) = 1 then
    select case when jsonb_array_length(o.items) = 0
                then 'طلب روشتة جديد من الموقع رقم ' || o.id || '، ' || o.customer_name
                else 'طلب جديد من الموقع رقم ' || o.id || '، ' || o.customer_name || '، '
                     || jsonb_array_length(o.items) || ' صنف، ' || trim(to_char(o.total, 'FM999999990.##')) || ' جنيه'
                     || case when cardinality(o.rx_paths) > 0 then '، ومعاه روشتة' else '' end
           end
      into v_orders from public.ar_store_orders o where o.id = v_oids[1];
  elsif cardinality(v_oids) > 1 then
    v_orders := cardinality(v_oids) || ' طلبات جديدة من الموقع، شوف تبويب طلبات الموقع';
  end if;
  if cardinality(v_oids) > 0 and not coalesce(p_peek, false) then
    update public.ar_store_orders set announced_at = now() where id = any(v_oids);
  end if;

  -- 4) the update is done (list, orders, store items, then stock): one sentence, said once per store send and only when the
  --    stock has the same data; since 2026-11-12 the laptop updates every ~10 minutes, so it is said at most once in 55
  --    minutes (once an hour, with the newest time)
  select l.at, l.data_at into v_store_at, v_store_data
    from public.ar_sync_log l where not l.dry_run and l.status = 'STORE_OK' order by l.at desc, l.id desc limit 1;
  select a.said_at into v_said from public.ar_sync_alerts a where a.kind = 'data';
  if v_store_at is not null and (v_said is null or (v_store_at > v_said and v_said < now() - interval '55 minutes')) then
    select min(s.data_at) into v_stock_data from public.ar_stock s;
    if v_stock_data is not null and v_stock_data >= coalesce(v_store_data, '') then
      v_data := 'البوت اتحدث كله';
      if v_store_data ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}' then
        v_ts := left(v_store_data, 16)::timestamp;
        v_h := extract(hour from v_ts)::int % 12;
        if v_h = 0 then v_h := 12; end if;
        v_m := extract(minute from v_ts)::int;
        v_data := v_data || '، لحد الساعة ' || v_h
          || case when v_m = 0 then ''
                  when v_m = 1 then ' ودقيقة'
                  when v_m = 2 then ' ودقيقتين'
                  when v_m = 15 then ' وربع'
                  when v_m = 30 then ' ونص'
                  when v_m <= 10 then ' و' || v_m || ' دقايق'
                  else ' و' || v_m || ' دقيقة' end;
      end if;
      if not coalesce(p_peek, false) then
        insert into public.ar_sync_alerts (kind, said_at) values ('data', now())
          on conflict (kind) do update set said_at = excluded.said_at;
      end if;
    end if;
  end if;

  return btrim(concat_ws('. ', nullif(v_orders, ''), nullif(v_warn, ''), nullif(v_data, ''), nullif(v_say, '')));
end;
$function$;
