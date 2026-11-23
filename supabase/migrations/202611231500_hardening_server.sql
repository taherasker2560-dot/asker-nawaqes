-- 202611231500_hardening_server (NOT applied yet: needs the owner's approval on the phone)
-- ASKER: the server half of the 2026-11-23 hardening review (SYSTEM_HARDENING_2026-11-23.md on the laptop; he said «ا» to the plan).
-- Every function below is the LIVE one (read from the database on 2026-11-23; the md5 of each body was compared with its migration file)
-- plus the one change named here. Nothing is dropped; no table or row is deleted by this file.
--   1) ar_sync_news      : «الحارس: …» / «الحارس لقى N حاجات» only in front of the guard's own lines (kind 'guard'). Lines of another kind
--                          (the invoice photos, kind 'invoice_photos', written by asker-chat) are said as they are, after the guard's.
--   2) security-3        : «🔄 رابط جديد» (ar_customer_link, new link for a customer that had one) also gives his chat a new secret, drops his
--                          chat and account push addresses; removing a house member (ar_member_remove) gives his old chat a new secret.
--   3) security-4        : ar_chat_send: at most 60 messages / 10 minutes for the anonymous chats together (the most ever seen: 4);
--                          uploads: also a size budget (ar_recent_upload_bytes: 15 MB an hour for chat files, 20 MB for prescriptions;
--                          the most ever seen in an hour: 0.43 MB and 0.14 MB); ar_orphan_uploads lists the uploads nobody refers to
--                          (the nightly cleanup in asker-chat removes them through the storage API).
--   4) security-5        : ar_dose_save, ar_chat_push_save and ar_account_push_save accept only the real push services' hosts
--                          (ar_push_host_ok). Every address saved today is fcm.googleapis.com.
--   5) pages-4           : the customer page's «آخر تحديث» is the time of the customers' own sync (ar_customers_sync_state, stamped by
--                          ar_customers_sync), not the newest row of ar_sync_log (any source, any status).
-- Rollback (nothing here changes data): apply the old text of each function (ar_sync_news = 202611230400, ar_customer_link = 202611132100,
--   ar_member_remove / ar_customer_view = 202611180200, ar_chat_send = 202611141400, ar_dose_save = 202611172300, ar_chat_push_save =
--   202611132330, ar_account_push_save = 202611182330; ar_customers_sync = the live text saved in supabase/rollbacks/202611231500_customers_sync_before.sql),
--   recreate the two upload policies as in 202611160900, then drop function public.ar_recent_upload_bytes(text), public.ar_orphan_uploads(int),
--   public.ar_push_host_ok(text); drop table public.ar_customers_sync_state.


-- ===== 1) ar_sync_news (the live function + block 0b only) =====
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
  v_gids bigint[];
  v_xids bigint[];
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
  select coalesce(array_agg(n.id order by n.id), '{}'),
         coalesce(array_agg(n.id order by n.id) filter (where n.kind = 'guard'), '{}'),
         coalesce(array_agg(n.id order by n.id) filter (where n.kind <> 'guard'), '{}')
    into v_nids, v_gids, v_xids from public.ar_laptop_news n where n.said_at is null;
  if cardinality(v_gids) = 1 then
    select 'الحارس: ' || n.body into v_guard from public.ar_laptop_news n where n.id = v_gids[1];
  elsif cardinality(v_gids) > 1 then
    select 'الحارس لقى ' || cardinality(v_gids) || ' حاجات: ' || string_agg(x.body, '، ' order by x.id)
           || case when cardinality(v_gids) > 3 then '، وكمان ' || (cardinality(v_gids) - 3) || ' في تقرير الحارس' else '' end
      into v_guard
      from (select n.id, n.body from public.ar_laptop_news n where n.id = any(v_gids) order by n.id limit 3) x;
  end if;
  -- another sender's lines (the invoice photos, kind 'invoice_photos', …) are said as they are, after the guard's own (migration 202611231500)
  if cardinality(v_xids) > 0 then
    select concat_ws('. ', nullif(v_guard, ''), string_agg(x.body, '. ' order by x.id)) into v_guard
      from (select n.id, n.body from public.ar_laptop_news n where n.id = any(v_xids) order by n.id) x;
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

-- ===== 2) security-3: a renewed link cuts the old holder off =====

create or replace function public.ar_customer_link(p_customer bigint, p_new boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text;
  v_had boolean;
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ar_customers c where c.id = p_customer) then
    return jsonb_build_object('ok', false, 'error', 'no_customer');
  end if;
  select l.token into v_token from public.ar_customer_links l where l.customer_id = p_customer;
  v_had := v_token is not null;
  if v_token is null or coalesce(p_new, false) then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.ar_customer_links (customer_id, token) values (p_customer, v_token)
    on conflict (customer_id) do update set token = excluded.token, created_at = now(), last_seen_at = null, seen_count = 0;
    if v_had then
      -- «🔄 رابط جديد» also cuts off whoever held the old link (review 2026-11-23 security-3): his chat gets a new secret (the old one is refused;
      -- the customer's own new link opens the same chat again through ar_chat_open(p_token)), and the old phones stop getting his pushes
      delete from public.ar_chat_push where chat_id in (select c.id from public.ar_chats c where c.customer_id = p_customer);
      update public.ar_chats set secret = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
       where customer_id = p_customer;
      delete from public.ar_account_push where customer_id = p_customer;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'token', v_token);
end $function$;

create or replace function public.ar_member_remove(p_token text, p_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id bigint; v_n int;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select l.customer_id into v_id from public.ar_customer_links l where l.token = p_token;
  if v_id is null then
    if exists (select 1 from public.ar_customer_members m where m.token = p_token) then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
    return jsonb_build_object('ok', false, 'error', 'link');
  end if;
  update public.ar_chats set member_id = null, secret = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') where member_id = p_id and exists (select 1 from public.ar_customer_members m where m.id = p_id and m.customer_id = v_id);
  delete from public.ar_customer_members where id = p_id and customer_id = v_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'no_member'); end if;
  return jsonb_build_object('ok', true);
end $function$;


-- ===== 3) security-4: strangers cannot fill the free database and storage =====
-- the global cap on messages is inside ar_chat_send:

create or replace function public.ar_chat_send(p_secret text, p_kind text, p_body text default null, p_media text default null, p_seconds int default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid; v_sup text; v_body text := nullif(btrim(coalesce(p_body, '')), ''); v_msg bigint; v_anon boolean;
begin
  if p_secret is null or p_secret !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'chat'); end if;
  select id, supplier, (customer_id is null and supplier is null and member_id is null) into v_id, v_sup, v_anon from public.ar_chats where secret = p_secret;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'chat'); end if;
  if p_kind is null or p_kind not in ('text', 'photo', 'voice', 'file') or (p_kind = 'file' and v_sup is null) then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;
  if p_kind = 'text' and (v_body is null or char_length(v_body) > 2000) then return jsonb_build_object('ok', false, 'error', 'bad_text'); end if;
  if p_kind <> 'text' then
    if p_media is null or p_media !~ ('^c/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.'
                                      || case p_kind when 'voice' then 'wav' when 'file' then '(pdf|xlsx|xls)' else '(jpg|png|webp)' end || '$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'ar-chat' and o.name = p_media and o.created_at > now() - interval '1 hour')
       or exists (select 1 from public.ar_chat_messages m where m.media = p_media) then
      return jsonb_build_object('ok', false, 'error', 'bad_media');
    end if;
    if p_kind = 'voice' and (p_seconds is null or p_seconds not between 1 and 180) then return jsonb_build_object('ok', false, 'error', 'bad_media'); end if;
    if p_kind = 'voice' then v_body := null; end if; -- the words come from asker-chat, never from the page
    if p_kind = 'file' then v_body := nullif(btrim(left(regexp_replace(coalesce(v_body, ''), '[<>\r\n\t]+', ' ', 'g'), 120)), ''); end if;
  end if;
  -- no flood: 20 messages every 5 minutes in one chat (a warehouse: 60, a list can be many photos)
  if (select count(*) from public.ar_chat_messages where chat_id = v_id and sender = 'customer' and at > now() - interval '5 minutes')
     >= (case when v_sup is null then 20 else 60 end) then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  -- a global cap for the chats nobody vouches for (not linked to a customer, not a warehouse, not a house member): 60 messages every 10 minutes
  -- all together (review 2026-11-23 security-4: strangers filling the free database). The most ever seen in 10 minutes is 4.
  if v_anon and (select count(*) from public.ar_chat_messages m join public.ar_chats c on c.id = m.chat_id
                  where m.sender = 'customer' and m.at > now() - interval '10 minutes'
                    and c.customer_id is null and c.supplier is null and c.member_id is null) >= 60 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  insert into public.ar_chat_messages (chat_id, sender, kind, body, media, seconds)
  values (v_id, 'customer', p_kind, left(v_body, 2000), case when p_kind = 'text' then null else p_media end, case when p_kind = 'voice' then p_seconds end)
  returning id into v_msg;
  update public.ar_chats set last_at = now(), last_from = 'customer',
    waiting = case when v_sup is null then waiting + 1 else 0 end,
    last_text = left(case p_kind when 'photo' then '📷 صورة' when 'voice' then '🎤 فويس' when 'file' then '📄 ' || coalesce(v_body, 'ملف') else v_body end, 200)
   where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_msg);
end $function$;


-- the size budget: bytes uploaded in the last hour (a SECURITY DEFINER helper, like ar_recent_uploads: an anonymous caller cannot read storage.objects)
create or replace function public.ar_recent_upload_bytes(p_bucket text) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]{1,12}$' then (o.metadata->>'size')::bigint else 0 end), 0)::bigint
    from storage.objects o where o.bucket_id = p_bucket and o.created_at > now() - interval '1 hour';
$$;
revoke execute on function public.ar_recent_upload_bytes(text) from public;
grant execute on function public.ar_recent_upload_bytes(text) to anon, authenticated;

drop policy if exists "Anyone uploads chat files" on storage.objects;
create policy "Anyone uploads chat files" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'ar-chat'
              and name ~ '^c/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|wav|pdf|xlsx|xls)$'
              and public.ar_recent_uploads('ar-chat') < 60
              and public.ar_recent_upload_bytes('ar-chat') < 15728640);

drop policy if exists "Anyone uploads store prescriptions" on storage.objects;
create policy "Anyone uploads store prescriptions" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'ar-store-rx'
              and name ~ '^rx/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{20,40}\.(jpg|png|webp|heic|pdf)$'
              and public.ar_recent_uploads('ar-store-rx') < 30
              and public.ar_recent_upload_bytes('ar-store-rx') < 20971520);

-- the uploads nobody refers to: over 2 days old (a chat message takes a file only in its first hour, an order in its first day) and in no
-- message (ar_chat_messages.media) and no store order (ar_store_orders.rx_paths). Only names of the shape anonymous visitors can upload.
-- It lists; the nightly cleanup in asker-chat removes them through the storage API (deleting rows would leave the files behind).
create or replace function public.ar_orphan_uploads(p_limit int default 500) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('bucket', x.bucket_id, 'name', x.name)), '[]'::jsonb)
    from (select o.bucket_id, o.name
            from storage.objects o
           where o.created_at < now() - interval '2 days'
             and ((o.bucket_id = 'ar-chat'
                   and o.name ~ '^c/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|wav|pdf|xlsx|xls)$'
                   and not exists (select 1 from public.ar_chat_messages m where m.media = o.name))
               or (o.bucket_id = 'ar-store-rx'
                   and o.name ~ '^rx/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{20,40}\.(jpg|png|webp|heic|pdf)$'
                   and not exists (select 1 from public.ar_store_orders so where o.name = any (so.rx_paths))))
           order by o.created_at
           limit greatest(1, least(coalesce(p_limit, 500), 1000))) x;
$$;
revoke execute on function public.ar_orphan_uploads(int) from public, anon, authenticated;
grant execute on function public.ar_orphan_uploads(int) to service_role;

-- ===== 4) security-5: only the real push services' hosts =====
-- Chrome / Edge / Samsung (fcm.googleapis.com), Firefox (updates.push.services.mozilla.com), Safari (*.push.apple.com), Windows (*.notify.windows.com).
-- The host must be followed by «/», so «https://fcm.googleapis.com@evil.example/» is refused.
create or replace function public.ar_push_host_ok(p_endpoint text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)+push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)/', false);
$$;
revoke execute on function public.ar_push_host_ok(text) from public, anon, authenticated;


create or replace function public.ar_dose_save(p_endpoint text, p_times text[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_times text[];
begin
  if p_endpoint is null or char_length(p_endpoint) not between 20 and 700 or not public.ar_push_host_ok(p_endpoint) then return jsonb_build_object('ok', false, 'error', 'endpoint'); end if;
  select coalesce(array_agg(distinct t order by t), '{}'::text[]) into v_times
    from unnest(coalesce(p_times, '{}'::text[])) as t where t ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  if cardinality(v_times) = 0 then
    delete from public.ar_dose_push where endpoint = p_endpoint;
    return jsonb_build_object('ok', true, 'times', 0);
  end if;
  v_times := v_times[1:40];
  if not exists (select 1 from public.ar_dose_push where endpoint = p_endpoint) and (select count(*) from public.ar_dose_push) >= 20000 then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;
  insert into public.ar_dose_push as t (endpoint, times) values (p_endpoint, v_times)
  on conflict (endpoint) do update set times = excluded.times, updated_at = now(), last_key = case when t.times = excluded.times then t.last_key else null end;
  return jsonb_build_object('ok', true, 'times', cardinality(v_times));
end $function$;

create or replace function public.ar_chat_push_save(p_secret text, p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
begin
  if p_secret is null or p_secret !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'chat'); end if;
  select id into v_id from public.ar_chats where secret = p_secret;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'chat'); end if;
  if p_endpoint is null or not public.ar_push_host_ok(p_endpoint) or char_length(p_endpoint) > 1000 then return jsonb_build_object('ok', false, 'error', 'bad_endpoint'); end if;
  if (select count(*) from public.ar_chat_push where chat_id = v_id) >= 5 then
    delete from public.ar_chat_push where endpoint in (select endpoint from public.ar_chat_push where chat_id = v_id order by created_at limit 1);
  end if;
  insert into public.ar_chat_push (endpoint, chat_id) values (p_endpoint, v_id)
  on conflict (endpoint) do update set chat_id = excluded.chat_id, created_at = now();
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.ar_account_push_save(p_token text, p_endpoint text, p_on boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint;
  v_last timestamp without time zone;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  if p_endpoint is null or char_length(p_endpoint) not between 20 and 700 or not public.ar_push_host_ok(p_endpoint) then return jsonb_build_object('ok', false, 'error', 'endpoint'); end if;
  select l.customer_id into v_id from public.ar_customer_links l where l.token = p_token;
  if v_id is null then
    if exists (select 1 from public.ar_customer_members m where m.token = p_token) then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
    return jsonb_build_object('ok', false, 'error', 'link');
  end if;
  if coalesce(p_on, true) is false then
    delete from public.ar_account_push where endpoint = p_endpoint and customer_id = v_id;
    return jsonb_build_object('ok', true, 'on', false);
  end if;
  if not exists (select 1 from public.ar_account_push where endpoint = p_endpoint) then
    if (select count(*) from public.ar_account_push where customer_id = v_id) >= 10 then return jsonb_build_object('ok', false, 'error', 'max'); end if;
    if (select count(*) from public.ar_account_push) >= 20000 then return jsonb_build_object('ok', false, 'error', 'full'); end if;
  end if;
  select max(m.at) into v_last from public.ar_customer_moves m where m.customer_id = v_id;
  insert into public.ar_account_push as t (endpoint, customer_id, last_at) values (p_endpoint, v_id, v_last)
  on conflict (endpoint) do update
    set customer_id = excluded.customer_id, updated_at = now(),
        last_at = case when t.customer_id = excluded.customer_id then t.last_at else excluded.last_at end;
  return jsonb_build_object('ok', true, 'on', true);
end $function$;


-- ===== 5) pages-4: the customers' own sync time =====
create table if not exists public.ar_customers_sync_state (
  id int primary key check (id = 1),
  synced_at timestamptz not null
);
alter table public.ar_customers_sync_state enable row level security;
revoke all on public.ar_customers_sync_state from anon, authenticated;
grant select on public.ar_customers_sync_state to authenticated;
drop policy if exists "Owner reads ar customers sync state" on public.ar_customers_sync_state;
create policy "Owner reads ar customers sync state" on public.ar_customers_sync_state for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
-- until the next sync stamps it: the time of the newest change (never later than the real last sync, so it can only look older)
insert into public.ar_customers_sync_state (id, synced_at)
  select 1, max(c.updated_at) from public.ar_customers c having max(c.updated_at) is not null
  on conflict (id) do nothing;


CREATE OR REPLACE FUNCTION public.ar_customers_sync(p_key text, p_customers jsonb, p_moves jsonb, p_gone jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_hash text; v_nc int; v_nm int; v_ng int; v_c int := 0; v_m int := 0; v_g int := 0;
  v_num text := '^-?[0-9]{1,12}(\.[0-9]+)?$';
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if jsonb_typeof(coalesce(p_customers, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_moves, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_gone, '[]'::jsonb)) <> 'array' then raise exception 'rows must be arrays'; end if;
  v_nc := jsonb_array_length(coalesce(p_customers, '[]'::jsonb));
  v_nm := jsonb_array_length(coalesce(p_moves, '[]'::jsonb));
  v_ng := jsonb_array_length(coalesce(p_gone, '[]'::jsonb));
  if v_nc > 5000 or v_nm > 5000 then raise exception 'batch too big (max 5000)'; end if;
  if v_ng > 2000 then raise exception 'too many gone (max 2000)'; end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_customers_sync'));

  if v_nc > 0 then
    insert into public.ar_customers as t (id, name, credit_limit, balance, last_at, last_kind, moves, updated_at)
    select (e->>'id')::bigint,
           left(btrim(e->>'name'), 120),
           case when (e->>'credit_limit') ~ v_num then round((e->>'credit_limit')::numeric, 2) end,
           case when (e->>'balance') ~ v_num then round((e->>'balance')::numeric, 2) else 0 end,
           case when (e->>'last_at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$' then (e->>'last_at')::timestamp end,
           case when e->>'last_kind' in ('sale', 'return', 'payment', 'refund') then e->>'last_kind' end,
           case when (e->>'moves') ~ '^[0-9]{1,9}$' then (e->>'moves')::int else 0 end,
           now()
    from jsonb_array_elements(p_customers) e
    where (e->>'id') ~ '^[0-9]{1,12}$' and char_length(btrim(coalesce(e->>'name', ''))) between 1 and 120
    on conflict (id) do update set
      name = excluded.name, credit_limit = excluded.credit_limit, balance = excluded.balance, last_at = excluded.last_at,
      last_kind = excluded.last_kind, moves = excluded.moves, updated_at = now()
    where (t.name, t.credit_limit, t.balance, t.last_at, t.last_kind, t.moves)
          is distinct from (excluded.name, excluded.credit_limit, excluded.balance, excluded.last_at, excluded.last_kind, excluded.moves);
    get diagnostics v_c = row_count;
  end if;

  if v_nm > 0 then
    insert into public.ar_customer_moves as t (id, customer_id, at, kind, total, paid, balance, items, updated_at)
    select (e->>'id')::bigint,
           (e->>'customer_id')::bigint,
           (e->>'at')::timestamp,
           e->>'kind',
           case when (e->>'total') ~ v_num then round((e->>'total')::numeric, 2) else 0 end,
           case when (e->>'paid') ~ v_num then round((e->>'paid')::numeric, 2) else 0 end,
           case when (e->>'balance') ~ v_num then round((e->>'balance')::numeric, 2) end,
           case when jsonb_typeof(e->'items') = 'array' and jsonb_array_length(e->'items') <= 300 then e->'items' end,
           now()
    from jsonb_array_elements(p_moves) e
    where (e->>'id') ~ '^-?[0-9]{1,15}$' and (e->>'customer_id') ~ '^[0-9]{1,12}$'
      and (e->>'at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'
      and e->>'kind' in ('sale', 'return', 'payment', 'refund')
    on conflict (id) do update set
      customer_id = excluded.customer_id, at = excluded.at, kind = excluded.kind, total = excluded.total,
      paid = excluded.paid, balance = excluded.balance, items = excluded.items, updated_at = now()
    where (t.customer_id, t.at, t.kind, t.total, t.paid, t.balance, t.items)
          is distinct from (excluded.customer_id, excluded.at, excluded.kind, excluded.total, excluded.paid, excluded.balance, excluded.items);
    get diagnostics v_m = row_count;
  end if;

  if v_ng > 0 then
    delete from public.ar_customer_moves
    where id in (select (g #>> '{}')::bigint from jsonb_array_elements(p_gone) g where (g #>> '{}') ~ '^-?[0-9]{1,15}$');
    get diagnostics v_g = row_count;
  end if;
  -- when the customers' own sync last went through (even with nothing new): the page's «آخر تحديث» (review 2026-11-23 pages-4)
  insert into public.ar_customers_sync_state as s (id, synced_at) values (1, now())
    on conflict (id) do update set synced_at = excluded.synced_at;
  return jsonb_build_object('ok', true, 'customers', v_c, 'moves', v_m, 'gone', v_g);
end $function$;

create or replace function public.ar_customer_view(p_token text, p_before_at timestamp without time zone default null::timestamp without time zone, p_before_id bigint default null::bigint, p_limit integer default 100, p_preview boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id bigint; v_mid bigint; v_mname text; v_show boolean; v_acc boolean;
  v_name text; v_balance numeric; v_moves jsonb; v_n int; v_month jsonb; v_data timestamptz; v_phone text;
  v_lim int := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_start timestamp := date_trunc('month', now() at time zone 'Africa/Cairo');
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select r.customer_id, r.member_id, r.member_name, r.show_balance, r.on_account into v_id, v_mid, v_mname, v_show, v_acc from public.ar_member_resolve(p_token) r;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select c.name, c.balance into v_name, v_balance from public.ar_customers c where c.id = v_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'link'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'at', m.at, 'kind', m.kind, 'total', m.total,
                                               'paid', case when v_show then m.paid end, 'balance', case when v_show then m.balance end, 'items', m.items) order by m.at desc, m.id desc), '[]'::jsonb),
         count(*)
    into v_moves, v_n
    from (select x.id, x.at, x.kind, x.total, x.paid, x.balance, x.items from public.ar_customer_moves x
           where x.customer_id = v_id
             and (v_show or x.kind in ('sale', 'return'))
             and (p_before_at is null or (x.at, x.id) < (p_before_at, coalesce(p_before_id, 9223372036854775807)))
           order by x.at desc, x.id desc
           limit v_lim) m;

  if p_before_at is null then
    -- the first page: when he opened it (the owner of the account on his link, a house member on his own row; not for the pharmacy's own look), this month's sums (only when he may see the account), when the data came, his saved number (the account owner's only)
    if not coalesce(p_preview, false) then
      if v_mid is null then
        update public.ar_customer_links set last_seen_at = now(), seen_count = seen_count + 1
         where customer_id = v_id and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
      else
        update public.ar_customer_members set last_seen_at = now(), seen_count = seen_count + 1
         where id = v_mid and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
      end if;
    end if;
    if v_show then
      select jsonb_build_object('bought', coalesce(sum(m.total) filter (where m.kind in ('sale', 'return')), 0),
                                'paid', coalesce(sum(m.paid), 0))
        into v_month
        from public.ar_customer_moves m where m.customer_id = v_id and m.at >= v_start;
    end if;
    select s.synced_at into v_data from public.ar_customers_sync_state s where s.id = 1;
    if v_mid is null then
      select p.phone into v_phone from public.ar_customer_phones p where p.customer_id = v_id order by p.updated_at limit 1;
    end if;
  end if;

  return jsonb_build_object('ok', true,
    'customer', jsonb_build_object('id', v_id, 'name', v_name, 'balance', case when v_show then v_balance end),
    'stopped', exists (select 1 from public.ar_customer_stops s where s.customer_id = v_id),
    'me', case when v_mid is null then jsonb_build_object('role', 'owner')
               else jsonb_build_object('role', 'member', 'id', v_mid, 'name', v_mname, 'show_balance', v_show, 'on_account', v_acc) end,
    'month', v_month, 'data_at', v_data, 'phone', v_phone,
    'moves', v_moves, 'more', v_n = v_lim);
end $function$;
