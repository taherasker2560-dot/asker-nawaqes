-- 202611141400_ar_chat_suppliers (NOT applied yet: needs the owner's approval on the phone)
-- ASKER: the warehouses send their lists from our messages page (owner 2026-11-14: «احنا هنعمل له رابط زيه زي العملاء …
-- نسجلهم هم جوه البوت … الربط بتاعهم بالرقم»). One link for everyone (store.html#chat): the page asks the phone number
-- first; a number saved for a warehouse in «الوارد ← الشركات» (ar_suppliers.phone, or ar_supplier_phones added from a
-- chat) opens that warehouse's chat with no name asked, and what it sends goes to «الوارد» under the warehouse's name
-- (the function arabic-shortages, action «chat-inbox», reads it like the phone's WhatsApp inbox). Any other number is a
-- customer, as before («خدمة العملاء»). Two names with the same number: the one naming a person «(…)» is taken.
--   ar_chats.supplier            : the warehouse of this chat (null = a customer)
--   ar_chat_messages.inbox_at    : when a warehouse's message was taken into the inbox (once); kind 'file' = PDF / Excel
--   ar_inbox.via / chat_msg      : 'link' = came from the messages page (which message); announced_at: said on the phone
--   ar_suppliers.link_sent_at    : when the owner sent the link from the bot («📲 ابعتله الرابط»)
--   ar_supplier_phones           : more numbers of a warehouse (a new rep), added from a chat («🏬 ده مندوب مخزن»)
--   ar_sync_news                 : block 3c «وصل وارد من …» (live definition of 202611140130 + this block only)
-- Rollback: drop function public.ar_chat_make_supplier(uuid, text, text); drop function public.ar_supplier_of(text);
--   apply 202611140200's ar_chat_open, 202611132330's ar_chat_read / ar_chat_send and 202611140130's ar_sync_news again;
--   drop table public.ar_supplier_phones; alter table public.ar_chats drop column supplier;
--   alter table public.ar_chat_messages drop column inbox_at (and its old kind / media checks back);
--   alter table public.ar_inbox drop column via, drop column chat_msg, drop column announced_at;
--   alter table public.ar_suppliers drop column link_sent_at; the bucket and upload policy of 202611132330 back.

alter table public.ar_suppliers add column if not exists link_sent_at timestamptz;

create table if not exists public.ar_supplier_phones (
  phone text primary key check (phone ~ '^201[0-9]{9}$'),
  supplier text not null references public.ar_suppliers (name) on update cascade on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.ar_supplier_phones enable row level security;
drop policy if exists "Owner ar supplier phones" on public.ar_supplier_phones;
create policy "Owner ar supplier phones" on public.ar_supplier_phones for all to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Staff all ar_supplier_phones" on public.ar_supplier_phones;
create policy "Staff all ar_supplier_phones" on public.ar_supplier_phones for all to authenticated
  using ((select public.ar_staff_can(array['read', 'suppliers']::text[])))
  with check ((select public.ar_staff_can(array['read', 'suppliers']::text[])));

alter table public.ar_chats add column if not exists supplier text
  references public.ar_suppliers (name) on update cascade on delete set null;

alter table public.ar_chat_messages add column if not exists inbox_at timestamptz;
alter table public.ar_chat_messages drop constraint if exists ar_chat_messages_kind_check;
alter table public.ar_chat_messages add constraint ar_chat_messages_kind_check check (kind in ('text', 'photo', 'voice', 'file'));
alter table public.ar_chat_messages drop constraint if exists ar_chat_messages_media_check;
alter table public.ar_chat_messages add constraint ar_chat_messages_media_check
  check (media is null or media ~ '^c/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|wav|pdf|xlsx|xls)$');
create index if not exists ar_chat_messages_inbox on public.ar_chat_messages (chat_id, id) where inbox_at is null and sender = 'customer';

alter table public.ar_inbox add column if not exists via text check (via is null or via = 'link');
alter table public.ar_inbox add column if not exists chat_msg bigint;
alter table public.ar_inbox add column if not exists announced_at timestamptz;
create unique index if not exists ar_inbox_one_chat_msg on public.ar_inbox (chat_msg) where chat_msg is not null;

-- the warehouses' files: PDF and Excel too (the page uploads under c/<day>/<random>.<ext>, as for photos)
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'audio/wav', 'application/pdf',
                                  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
 where id = 'ar-chat';
drop policy if exists "Anyone uploads chat files" on storage.objects;
create policy "Anyone uploads chat files" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'ar-chat' and name ~ '^c/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|wav|pdf|xlsx|xls)$');

-- the warehouse of a phone number (01xxxxxxxxx): only used inside the functions below
create or replace function public.ar_supplier_of(p_phone text)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (select s.name from public.ar_suppliers s where s.phone = '2' || p_phone order by (s.name ~ '\(.+\)') desc, s.name limit 1),
    (select p.supplier from public.ar_supplier_phones p where p.phone = '2' || p_phone));
$function$;
revoke all on function public.ar_supplier_of(text) from public;
revoke all on function public.ar_supplier_of(text) from anon;
revoke all on function public.ar_supplier_of(text) from authenticated;

-- the page opens its chat: its secret, a credit customer's account link, or the phone number first (a warehouse's number
-- needs no name; anyone else is asked his name: «need_name»)
create or replace function public.ar_chat_open(p_secret text default null, p_token text default null, p_name text default null, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_chat public.ar_chats%rowtype; v_cust bigint; v_name text; v_phone text; v_sup text;
  v_new text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if p_secret ~ '^[0-9a-f]{64}$' then
    select * into v_chat from public.ar_chats where secret = p_secret;
    if found then return jsonb_build_object('ok', true, 'secret', v_chat.secret, 'name', v_chat.name, 'linked', v_chat.customer_id is not null, 'supplier', v_chat.supplier); end if;
  end if;
  if p_token ~ '^[0-9a-f]{64}$' then
    select c.id, c.name into v_cust, v_name
      from public.ar_customer_links l join public.ar_customers c on c.id = l.customer_id where l.token = p_token;
    if v_cust is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;
    select * into v_chat from public.ar_chats where customer_id = v_cust;
    if found then return jsonb_build_object('ok', true, 'secret', v_chat.secret, 'name', v_chat.name, 'linked', true); end if;
    select case when p.phone ~ '^201[0-9]{9}$' then substr(p.phone, 2) end into v_phone
      from public.ar_customer_phones p where p.customer_id = v_cust order by p.updated_at limit 1;
    insert into public.ar_chats (secret, customer_id, name, phone) values (v_new, v_cust, left(v_name, 120), v_phone);
    return jsonb_build_object('ok', true, 'secret', v_new, 'name', v_name, 'linked', true);
  end if;
  v_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if v_phone ~ '^201[0-9]{9}$' then v_phone := substr(v_phone, 2); end if;
  if v_phone !~ '^01[0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'bad_phone'); end if;
  v_sup := public.ar_supplier_of(v_phone);
  if v_sup is null then
    if v_name = '' then return jsonb_build_object('ok', false, 'error', 'need_name'); end if;
    if char_length(v_name) not between 2 and 60 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  end if;
  -- no flood of new chats: 10 a day for one number, 30 every 10 minutes for everyone (the page: «جرب تاني بعد شوية»)
  if (select count(*) from public.ar_chats where phone = v_phone and created_at > now() - interval '1 day') >= 10
     or (select count(*) from public.ar_chats where created_at > now() - interval '10 minutes') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  insert into public.ar_chats (secret, name, phone, supplier) values (v_new, left(coalesce(v_sup, v_name), 120), v_phone, v_sup);
  return jsonb_build_object('ok', true, 'secret', v_new, 'name', coalesce(v_sup, v_name), 'linked', false, 'supplier', v_sup);
end $function$;
revoke all on function public.ar_chat_open(text, text, text, text) from public;
grant execute on function public.ar_chat_open(text, text, text, text) to anon, authenticated;

-- the page reads its chat; a warehouse's page also learns it is one (the owner may mark it later from the bot)
create or replace function public.ar_chat_read(p_secret text, p_after bigint default 0)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid; v_name text; v_sup text; v_msgs jsonb;
begin
  if p_secret is null or p_secret !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'chat'); end if;
  select id, name, supplier into v_id, v_name, v_sup from public.ar_chats where secret = p_secret;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'chat'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'at', m.at, 'sender', m.sender, 'kind', m.kind, 'body', m.body,
                                               'seconds', m.seconds) order by m.id), '[]'::jsonb)
    into v_msgs
    from (select * from public.ar_chat_messages x where x.chat_id = v_id and x.id > coalesce(p_after, 0) order by x.id limit 300) m;
  return jsonb_build_object('ok', true, 'name', v_name, 'supplier', v_sup, 'messages', v_msgs);
end $function$;
revoke all on function public.ar_chat_read(text, bigint) from public;
grant execute on function public.ar_chat_read(text, bigint) to anon, authenticated;

-- the page sends: text, a photo, a voice note, or (a warehouse only) a PDF / Excel file with its name. A warehouse's
-- messages never wait for an answer in «خدمة العملاء» (they go to «الوارد»), and it may send more at once (60 in 5 minutes).
create or replace function public.ar_chat_send(p_secret text, p_kind text, p_body text default null, p_media text default null, p_seconds int default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid; v_sup text; v_body text := nullif(btrim(coalesce(p_body, '')), ''); v_msg bigint;
begin
  if p_secret is null or p_secret !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'chat'); end if;
  select id, supplier into v_id, v_sup from public.ar_chats where secret = p_secret;
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
  insert into public.ar_chat_messages (chat_id, sender, kind, body, media, seconds)
  values (v_id, 'customer', p_kind, left(v_body, 2000), case when p_kind = 'text' then null else p_media end, case when p_kind = 'voice' then p_seconds end)
  returning id into v_msg;
  update public.ar_chats set last_at = now(), last_from = 'customer',
    waiting = case when v_sup is null then waiting + 1 else 0 end,
    last_text = left(case p_kind when 'photo' then '📷 صورة' when 'voice' then '🎤 فويس' when 'file' then '📄 ' || coalesce(v_body, 'ملف') else v_body end, 200)
   where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_msg);
end $function$;
revoke all on function public.ar_chat_send(text, text, text, text, int) from public;
grant execute on function public.ar_chat_send(text, text, text, text, int) to anon, authenticated;

-- «🏬 ده مندوب مخزن» (the owner, on a chat whose number is not saved): the number joins a warehouse (or a new one), and
-- every chat of that number becomes the warehouse's; the bot then asks arabic-shortages to take its messages to «الوارد»
create or replace function public.ar_chat_make_supplier(p_chat uuid, p_supplier text default null, p_new text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_c public.ar_chats%rowtype; v_name text; v_have text; v_wa text;
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    raise exception 'owner only' using errcode = '42501';
  end if;
  select * into v_c from public.ar_chats where id = p_chat;
  if not found then return jsonb_build_object('ok', false, 'error', 'chat'); end if;
  if v_c.customer_id is not null or v_c.phone is null then return jsonb_build_object('ok', false, 'error', 'not_cash'); end if;
  v_wa := '2' || v_c.phone;
  if nullif(btrim(coalesce(p_new, '')), '') is not null then
    v_name := left(regexp_replace(btrim(p_new), '\s+', ' ', 'g'), 80);
    if char_length(v_name) < 2 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
    if exists (select 1 from public.ar_suppliers where name = v_name) then return jsonb_build_object('ok', false, 'error', 'exists'); end if;
    insert into public.ar_suppliers (name, phone) values (v_name, v_wa);
  else
    select name, phone into v_name, v_have from public.ar_suppliers where name = p_supplier;
    if v_name is null then return jsonb_build_object('ok', false, 'error', 'supplier'); end if;
    if v_have is null then
      update public.ar_suppliers set phone = v_wa, updated_at = now() where name = v_name;
    elsif v_have <> v_wa then
      insert into public.ar_supplier_phones (phone, supplier) values (v_wa, v_name)
      on conflict (phone) do update set supplier = excluded.supplier, added_at = now();
    end if;
  end if;
  update public.ar_chats set supplier = v_name, waiting = 0 where phone = v_c.phone and customer_id is null;
  return jsonb_build_object('ok', true, 'supplier', v_name, 'secret', v_c.secret);
end $function$;
revoke all on function public.ar_chat_make_supplier(uuid, text, text) from public;
revoke all on function public.ar_chat_make_supplier(uuid, text, text) from anon;
grant execute on function public.ar_chat_make_supplier(uuid, text, text) to authenticated;

-- the phone's voice (Tasker reads ar_sync_news): the live definition with block 3c added
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

  return btrim(concat_ws('. ', nullif(v_hub, ''), nullif(v_orders, ''), nullif(v_chats, ''), nullif(v_link, ''), nullif(v_warn, ''), nullif(v_data, ''), nullif(v_say, '')));
end;
$function$;
