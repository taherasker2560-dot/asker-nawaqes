-- 202611140130_ar_sync_news_chat (NOT applied yet: needs the owner's approval on the phone)
-- ASKER: the phone's voice says «رسالة جديدة من عميل في الرسايل، من …» (owner 2026-11-14: the web notification of the bot reached
-- his phone silently; «نخلي البوت يقول رسالة عميل. كويس كده»). Same function as live (pg_get_functiondef of 2026-11-14,
-- = 202611131800) with block 3b) and the sentence joined after the orders. ar_chats.announced_at keeps what was said.
-- Rollback: apply 202611131800_ar_hub_watch.sql's ar_sync_news again; alter table public.ar_chats drop column announced_at.

alter table public.ar_chats add column if not exists announced_at timestamptz;
CREATE OR REPLACE FUNCTION public.ar_sync_news(p_key text, p_peek boolean DEFAULT false)
 RETURNS "text/plain"
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_w public.ar_hub_watch%rowtype;
  v_hub text := '';
  v_alert timestamptz;
  v_back timestamptz;
  v_mins int;
  v_chats text := '';
  v_cids uuid[];
begin
  if p_key is null or p_key !~ '^[0-9a-f]{32,128}$' then
    raise exception 'bad key' using errcode = '28000';
  end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  if not exists (select 1 from public.ar_inbox_keys k where k.key_hash = v_hash)
     and not exists (select 1 from public.ar_sync_keys k where k.key_hash = v_hash) then
    raise exception 'bad key' using errcode = '28000';
  end if;

  -- 0) the update every 10 minutes (owner 2026-11-13 «أيوه نبّهني»): the laptop's watcher row (ar_hub_watch)
  select * into v_w from public.ar_hub_watch w where w.id = 1;
  if found then
    select a.said_at into v_alert from public.ar_sync_alerts a where a.kind = 'hub_alert';
    select a.said_at into v_back from public.ar_sync_alerts a where a.kind = 'hub_back';
    if v_w.at >= now() - interval '20 minutes' and v_w.open and v_w.stuck_since is not null
       and v_w.stuck_since <= now() - interval '30 minutes' and v_w.stuck_seen <= now() - interval '10 minutes' then
      -- the laptop is alive, the pharmacy makes copies, and one has waited 30+ minutes
      if v_alert is null or v_alert < now() - interval '30 minutes' then
        v_mins := floor(extract(epoch from (now() - v_w.stuck_since)) / 60);
        v_hub := 'تنبيه: البوت ما اتحدثش من '
          || case when v_mins < 120 then v_mins || ' دقيقة' else (v_mins / 60) || ' ساعة' end
          || ' والصيدلية شغالة، شوف اللابتوب';
      end if;
    elsif v_w.open and v_w.at < now() - interval '30 minutes' and v_w.at >= now() - interval '6 hours' then
      -- the laptop went silent while the pharmacy was open (after 6 hours block 1 says it)
      if v_alert is null or v_alert < now() - interval '30 minutes' then
        v_mins := floor(extract(epoch from (now() - v_w.at)) / 60);
        v_hub := 'تنبيه: اللاب بطّل يبعت من '
          || case when v_mins < 120 then v_mins || ' دقيقة' else (v_mins / 60) || ' ساعة' end
          || ' والصيدلية شغالة، شوف اللابتوب';
      end if;
    elsif v_alert is not null and (v_back is null or v_back < v_alert)
          and v_w.stuck_since is null and v_w.at >= now() - interval '20 minutes' then
      -- fixed after a warning: said once
      v_hub := 'البوت رجع يتحدث تاني';
      if not coalesce(p_peek, false) then
        insert into public.ar_sync_alerts (kind, said_at) values ('hub_back', now())
          on conflict (kind) do update set said_at = excluded.said_at;
      end if;
    end if;
    if v_hub like 'تنبيه:%' and not coalesce(p_peek, false) then
      insert into public.ar_sync_alerts (kind, said_at) values ('hub_alert', now())
        on conflict (kind) do update set said_at = excluded.said_at;
    end if;
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
  -- 3b) customers who wrote on our messages page and wait for an answer (owner 2026-11-14 «نخلي البوت يقول رسالة عميل»):
  --     said once per new message (a chat is said again only when the customer writes after it was said)
  select coalesce(array_agg(c.id order by c.last_at), '{}') into v_cids
    from public.ar_chats c
   where c.waiting > 0 and c.last_from = 'customer' and (c.announced_at is null or c.announced_at < c.last_at);
  if cardinality(v_cids) = 1 then
    select 'رسالة جديدة من عميل في الرسايل، من ' || c.name into v_chats from public.ar_chats c where c.id = v_cids[1];
  elsif cardinality(v_cids) > 1 then
    v_chats := cardinality(v_cids) || ' عملاء كتبولك في الرسايل، شوف خدمة العملاء';
  end if;
  if cardinality(v_cids) > 0 and not coalesce(p_peek, false) then
    update public.ar_chats set announced_at = now() where id = any(v_cids);
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

  return btrim(concat_ws('. ', nullif(v_hub, ''), nullif(v_orders, ''), nullif(v_chats, ''), nullif(v_warn, ''), nullif(v_data, ''), nullif(v_say, '')));
end;
$function$;
