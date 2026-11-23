-- 202611230400_ar_laptop_news (NOT applied yet: needs the owner's approval on the phone)
-- ASKER: «الحارس» (owner 2026-11-23, «عاوز اعيد تنضيف السيستم و اقويه … بحيث يكون مفيهوش غلطه فى الحاجات اللى معرفهاش», then «ا» on the
-- hardening plan: «a daily check that tells his phone in one Arabic line per problem, only when something is wrong»). The laptop's guard
-- (Hub\guard\GUARD.ps1: tasks, the update's steps, the night copy and OneDrive, disk and RAM, the server's timers and advisors, GitHub)
-- sends its lines here, and the phone's voice says them: Tasker reads ar_sync_news every 2 minutes, the channel that reaches him today
-- (the system's own web push has no phone of the pharmacy saved right now).
--   ar_laptop_news      : a line the laptop wants said, said ONCE (said_at). Closed table: only the owner reads it.
--   ar_laptop_beat      : when each laptop sender last ran (kind 'guard'), so the phone also says it when the guard itself stops.
--   ar_laptop_news_add  : the laptop's call, with its sync key (ar_sync_keys, like ar_hub_heartbeat): up to 10 lines of 200 letters; a line
--                         that already waits to be said is not added twice; lines said over 30 days ago are cleaned up.
--   ar_sync_news        : the LIVE function (read from the database on 2026-11-23) + new block 0b) after the update warning:
--                           one line «الحارس: …»; several «الحارس لقى N حاجات: …، …» (three at most, then «وكمان N في تقرير الحارس»);
--                           and «الحارس ما اشتغلش من N ساعة، شوف اللابتوب» when its last run is over 30 hours old (again every 12 hours).
--                         A peek (p_peek) says it and marks nothing. Everything else of the function is unchanged.
-- Nothing existing is dropped. Rollback: apply the function of 202611152200_ar_sync_news_notes.sql with the word fix of 202611180030 (or the
--   definition saved in the PR), then drop function public.ar_laptop_news_add(text, text, text[]); drop table public.ar_laptop_news;
--   drop table public.ar_laptop_beat; delete from public.ar_sync_alerts where kind = 'guard_stale';

create table if not exists public.ar_laptop_news (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  body text not null check (char_length(body) between 1 and 200),
  said_at timestamptz
);
create index if not exists ar_laptop_news_waiting on public.ar_laptop_news (id) where said_at is null;
alter table public.ar_laptop_news enable row level security;
revoke all on public.ar_laptop_news from anon, authenticated;
grant select on public.ar_laptop_news to authenticated;
drop policy if exists "Owner reads ar laptop news" on public.ar_laptop_news;
create policy "Owner reads ar laptop news" on public.ar_laptop_news for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create table if not exists public.ar_laptop_beat (
  kind text primary key check (kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  at timestamptz not null default now()
);
alter table public.ar_laptop_beat enable row level security;
revoke all on public.ar_laptop_beat from anon, authenticated;
grant select on public.ar_laptop_beat to authenticated;
drop policy if exists "Owner reads ar laptop beat" on public.ar_laptop_beat;
create policy "Owner reads ar laptop beat" on public.ar_laptop_beat for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create or replace function public.ar_laptop_news_add(p_key text, p_kind text, p_lines text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text;
  v_line text;
  v_added int := 0;
  v_i int := 0;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{32,128}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if p_kind is null or p_kind !~ '^[a-z][a-z0-9_]{0,39}$' then raise exception 'bad kind' using errcode = '22023'; end if;
  insert into public.ar_laptop_beat as b (kind, at) values (p_kind, now())
    on conflict (kind) do update set at = excluded.at;
  foreach v_line in array coalesce(p_lines, '{}'::text[]) loop
    v_i := v_i + 1;
    exit when v_i > 10;
    v_line := btrim(left(coalesce(v_line, ''), 200));
    continue when v_line = '';
    if not exists (select 1 from public.ar_laptop_news n where n.kind = p_kind and n.body = v_line and n.said_at is null) then
      insert into public.ar_laptop_news (kind, body) values (p_kind, v_line);
      v_added := v_added + 1;
    end if;
  end loop;
  delete from public.ar_laptop_news n where n.said_at < now() - interval '30 days';
  return jsonb_build_object('ok', true, 'added', v_added);
end $function$;
grant execute on function public.ar_laptop_news_add(text, text, text[]) to anon, authenticated;

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
  v_link text := '';
  v_iids uuid[];
  v_pres public.ar_presence%rowtype;
  v_n int;
  v_notes text := '';
  v_guard text := '';
  v_nids bigint[];
  v_beat timestamptz;
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
        v_hub := 'تنبيه: السيستم ما اتحدثش من '
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
      v_hub := 'السيستم رجع يتحدث تاني';
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

  -- 0b) the laptop's guard «الحارس» (owner 2026-11-23, migration 202611230400): each line it sent is said once, three at most
  --     in one sentence; and the guard itself stopping (its last run over 30 hours old) is said every 12 hours
  select coalesce(array_agg(n.id order by n.id), '{}') into v_nids from public.ar_laptop_news n where n.said_at is null;
  if cardinality(v_nids) = 1 then
    select 'الحارس: ' || n.body into v_guard from public.ar_laptop_news n where n.id = v_nids[1];
  elsif cardinality(v_nids) > 1 then
    select 'الحارس لقى ' || cardinality(v_nids) || ' حاجات: ' || string_agg(x.body, '، ' order by x.id)
           || case when cardinality(v_nids) > 3 then '، وكمان ' || (cardinality(v_nids) - 3) || ' في تقرير الحارس' else '' end
      into v_guard
      from (select n.id, n.body from public.ar_laptop_news n where n.id = any(v_nids) order by n.id limit 3) x;
  end if;
  if cardinality(v_nids) > 0 and not coalesce(p_peek, false) then
    update public.ar_laptop_news set said_at = now() where id = any(v_nids);
  end if;
  select b.at into v_beat from public.ar_laptop_beat b where b.kind = 'guard';
  if v_beat is not null and v_beat < now() - interval '30 hours' then
    select a.said_at into v_said from public.ar_sync_alerts a where a.kind = 'guard_stale';
    if v_said is null or v_said < now() - interval '12 hours' then
      v_guard := concat_ws('. ', nullif(v_guard, ''),
        'الحارس ما اشتغلش من ' || floor(extract(epoch from (now() - v_beat)) / 3600)::int || ' ساعة، شوف اللابتوب');
      if not coalesce(p_peek, false) then
        insert into public.ar_sync_alerts (kind, said_at) values ('guard_stale', now())
          on conflict (kind) do update set said_at = excluded.said_at;
      end if;
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
      v_say := 'تحديث النواقص اترفض لأن القايمة الجديدة فيها مشكلة، والسيستم لسه على القايمة القديمة';
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
  -- 3b) customers who wrote on our messages page and wait for an answer (owner 2026-11-14 «نخلي السيستم يقول رسالة عميل»):
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
  -- 3c) what a warehouse sent from its link on our messages page (owner 2026-11-14): said once, with the shortages in it
  select coalesce(array_agg(i.id order by i.received_at), '{}') into v_iids
    from public.ar_inbox i where i.via = 'link' and i.announced_at is null and i.received_at > now() - interval '1 day';
  if cardinality(v_iids) > 0 then
    select case when count(distinct i.supplier) = 1
                then 'وصل وارد من ' || min(i.supplier)
                     || case when sum(i.sure) > 0 then '، فيه ' || sum(i.sure) || ' صنف من النواقص' else '' end
                else 'وصل وارد من ' || count(distinct i.supplier) || ' مخازن: ' || string_agg(distinct i.supplier, ' و')
           end
      into v_link from public.ar_inbox i where i.id = any(v_iids);
    if not coalesce(p_peek, false) then
      update public.ar_inbox set announced_at = now() where id = any(v_iids);
    end if;
  end if;

  -- 3d) the notepad (owner 2026-11-15 «مفكرة صوتية … تفكرني وانا في الصيدلية»): the laptop says he is in the pharmacy (ar_presence, a word
  --     fresher than 25 minutes): said ONCE per arrival (ar_presence.since), up to three of the notes that wait for the pharmacy, then
  --     «وكمان N». An arrival with no notes waiting is used up too, so a note he writes while he is there is not read back to him.
  select * into v_pres from public.ar_presence p where p.id = 1;
  if found and v_pres.at_pharmacy and v_pres.checked_at >= now() - interval '25 minutes' then
    select a.said_at into v_said from public.ar_sync_alerts a where a.kind = 'notes_arrival';
    if v_said is null or v_said < v_pres.since then
      select count(*) into v_n from public.ar_notes n where n.status = 'open' and n.place = 'pharmacy';
      if v_n = 1 then
        select 'انت في الصيدلية، افتكر: ' || left(n.text, 80) into v_notes from public.ar_notes n where n.status = 'open' and n.place = 'pharmacy';
      elsif v_n > 1 then
        select 'انت في الصيدلية، عندك ' || v_n || ' حاجة تفتكرها: ' || string_agg(x.t, '، ' order by x.created_at)
               || case when v_n > 3 then '، وكمان ' || (v_n - 3) else '' end
          into v_notes
          from (select left(n.text, 80) as t, n.created_at from public.ar_notes n
                 where n.status = 'open' and n.place = 'pharmacy' order by n.created_at limit 3) x;
      end if;
      if not coalesce(p_peek, false) then
        insert into public.ar_sync_alerts (kind, said_at) values ('notes_arrival', now())
          on conflict (kind) do update set said_at = excluded.said_at;
      end if;
    end if;
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
      v_data := 'السيستم اتحدث كله';
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

  return btrim(concat_ws('. ', nullif(v_hub, ''), nullif(v_guard, ''), nullif(v_notes, ''), nullif(v_orders, ''), nullif(v_chats, ''), nullif(v_link, ''), nullif(v_warn, ''), nullif(v_data, ''), nullif(v_say, '')));
end;
$function$;
