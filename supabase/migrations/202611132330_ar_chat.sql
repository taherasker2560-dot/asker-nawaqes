-- 202611132330_ar_chat (NOT applied yet: needs the owner's approval on the phone)
-- ASKER: «متصفح الرسائل», part 1 (owner 2026-11-13, IDEAS: «لو عملنا متصفح رسائل خاص بينا … وعملنا ليه رابط، بيترد عليه
-- بشكل تلقائي على الواتس، العميل يدوس عليه يوصل ويتواصل معانا من طريق المتصفح الرسائل بتاعنا … نقدر نستخدمه بعد كده
-- في شغلنا الاوتوماتيكي»). His answers: everything (the bot answers the easy ones later, orders, every chat kept); the link
-- comes from WhatsApp Business's own «رسالة الترحيب»; a trial week where the bot only drafts (part 2); a notification on the
-- customer's phone when we answer; text, photos and voice notes.
--   ar_chats          : one chat per credit customer (from his account link) or per phone that opened one (a cash customer:
--                       name + number once). Its 64-hex secret stays on the customer's phone.
--   ar_chat_messages  : what was said: text, a photo or a voice note (the file in the private bucket ar-chat; a voice note's
--                       words are written in body by the function asker-chat).
--   ar_chat_push      : the customer's phone(s) to notify when the pharmacy answers (web push, no payload).
-- The customer's page only uses the functions below with the chat's secret: ar_chat_open, ar_chat_read, ar_chat_send,
-- ar_chat_push_save. The owner, and staff with «خدمة العملاء» (perm 'care'), read the tables and answer with ar_chat_reply.
-- Rollback: drop function public.ar_chat_reply(uuid, text); drop function public.ar_chat_push_save(text, text);
--   drop function public.ar_chat_send(text, text, text, text, int); drop function public.ar_chat_read(text, bigint);
--   drop function public.ar_chat_open(text, text, text, text); drop table public.ar_chat_push;
--   drop table public.ar_chat_messages; drop table public.ar_chats;
--   delete the storage policies «… chat files» and the bucket ar-chat (empty it first).

create table if not exists public.ar_chats (
  id uuid primary key default gen_random_uuid(),
  secret text not null unique check (secret ~ '^[0-9a-f]{64}$'),
  customer_id bigint,
  name text not null check (char_length(name) between 1 and 120),
  phone text check (phone is null or phone ~ '^01[0-9]{9}$'),
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  last_from text not null default 'customer' check (last_from in ('customer', 'pharmacy')),
  waiting int not null default 0 check (waiting >= 0),
  last_text text check (last_text is null or char_length(last_text) <= 200)
);
create unique index if not exists ar_chats_customer on public.ar_chats (customer_id) where customer_id is not null;
create index if not exists ar_chats_last on public.ar_chats (last_at desc);
create index if not exists ar_chats_phone on public.ar_chats (phone, created_at);

create table if not exists public.ar_chat_messages (
  id bigint generated always as identity primary key,
  chat_id uuid not null references public.ar_chats (id) on delete cascade,
  at timestamptz not null default now(),
  sender text not null check (sender in ('customer', 'pharmacy')),
  kind text not null check (kind in ('text', 'photo', 'voice')),
  body text check (body is null or char_length(body) <= 2000),
  media text check (media is null or media ~ '^c/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|wav)$'),
  seconds int check (seconds is null or seconds between 1 and 180),
  sent_by uuid
);
create index if not exists ar_chat_messages_chat on public.ar_chat_messages (chat_id, id);

create table if not exists public.ar_chat_push (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  chat_id uuid not null references public.ar_chats (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ar_chat_push_chat on public.ar_chat_push (chat_id);

-- who reads: the owner, and staff with «خدمة العملاء»; nobody writes directly (the functions below do)
alter table public.ar_chats enable row level security;
alter table public.ar_chat_messages enable row level security;
alter table public.ar_chat_push enable row level security;
drop policy if exists "Owner reads ar chats" on public.ar_chats;
create policy "Owner reads ar chats" on public.ar_chats for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Staff select ar_chats" on public.ar_chats;
create policy "Staff select ar_chats" on public.ar_chats for select to authenticated
  using ((select public.ar_staff_can(array['care']::text[])));
drop policy if exists "Owner reads ar chat messages" on public.ar_chat_messages;
create policy "Owner reads ar chat messages" on public.ar_chat_messages for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Staff select ar_chat_messages" on public.ar_chat_messages;
create policy "Staff select ar_chat_messages" on public.ar_chat_messages for select to authenticated
  using ((select public.ar_staff_can(array['care']::text[])));

-- the files: the customer's page uploads a photo or a voice note under c/<day>/<random>.<ext>; the owner and staff with
-- «خدمة العملاء» read them (the customer's page never reads files back)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ar-chat', 'ar-chat', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'audio/wav'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Anyone uploads chat files" on storage.objects;
create policy "Anyone uploads chat files" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'ar-chat' and name ~ '^c/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|wav)$');
drop policy if exists "Owner reads chat files" on storage.objects;
create policy "Owner reads chat files" on storage.objects for select to authenticated
  using (bucket_id = 'ar-chat' and (select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Staff reads chat files" on storage.objects;
create policy "Staff reads chat files" on storage.objects for select to authenticated
  using (bucket_id = 'ar-chat' and (select public.ar_staff_can(array['care']::text[])));

-- the customer's page opens its chat: with its secret (kept on the phone), or a credit customer's account link (his chat),
-- or a name and a number (a cash customer, once)
create or replace function public.ar_chat_open(p_secret text default null, p_token text default null, p_name text default null, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_chat public.ar_chats%rowtype; v_cust bigint; v_name text; v_phone text;
  v_new text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if p_secret ~ '^[0-9a-f]{64}$' then
    select * into v_chat from public.ar_chats where secret = p_secret;
    if found then return jsonb_build_object('ok', true, 'secret', v_chat.secret, 'name', v_chat.name, 'linked', v_chat.customer_id is not null); end if;
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
  if char_length(v_name) not between 2 and 60 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  if v_phone !~ '^01[0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'bad_phone'); end if;
  -- no flood of new chats: 3 an hour for one number, 30 every 10 minutes for everyone
  if (select count(*) from public.ar_chats where phone = v_phone and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.ar_chats where created_at > now() - interval '10 minutes') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  insert into public.ar_chats (secret, name, phone) values (v_new, v_name, v_phone);
  return jsonb_build_object('ok', true, 'secret', v_new, 'name', v_name, 'linked', false);
end $function$;
revoke all on function public.ar_chat_open(text, text, text, text) from public;
grant execute on function public.ar_chat_open(text, text, text, text) to anon, authenticated;

-- the customer's page reads its chat (newer than p_after; at most 300 a call). Files are not given back: their kind only.
create or replace function public.ar_chat_read(p_secret text, p_after bigint default 0)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid; v_name text; v_msgs jsonb;
begin
  if p_secret is null or p_secret !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'chat'); end if;
  select id, name into v_id, v_name from public.ar_chats where secret = p_secret;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'chat'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'at', m.at, 'sender', m.sender, 'kind', m.kind, 'body', m.body,
                                               'seconds', m.seconds) order by m.id), '[]'::jsonb)
    into v_msgs
    from (select * from public.ar_chat_messages x where x.chat_id = v_id and x.id > coalesce(p_after, 0) order by x.id limit 300) m;
  return jsonb_build_object('ok', true, 'name', v_name, 'messages', v_msgs);
end $function$;
revoke all on function public.ar_chat_read(text, bigint) from public;
grant execute on function public.ar_chat_read(text, bigint) to anon, authenticated;

-- the customer sends: text (1–2000), or a photo / voice note he just uploaded to ar-chat (within the hour)
create or replace function public.ar_chat_send(p_secret text, p_kind text, p_body text default null, p_media text default null, p_seconds int default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid; v_body text := nullif(btrim(coalesce(p_body, '')), ''); v_msg bigint;
begin
  if p_secret is null or p_secret !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'chat'); end if;
  select id into v_id from public.ar_chats where secret = p_secret;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'chat'); end if;
  if p_kind not in ('text', 'photo', 'voice') then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
  if p_kind = 'text' and (v_body is null or char_length(v_body) > 2000) then return jsonb_build_object('ok', false, 'error', 'bad_text'); end if;
  if p_kind <> 'text' then
    if p_media is null or p_media !~ ('^c/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.' || case when p_kind = 'voice' then 'wav' else '(jpg|png|webp)' end || '$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'ar-chat' and o.name = p_media and o.created_at > now() - interval '1 hour')
       or exists (select 1 from public.ar_chat_messages m where m.media = p_media) then
      return jsonb_build_object('ok', false, 'error', 'bad_media');
    end if;
    if p_kind = 'voice' and (p_seconds is null or p_seconds not between 1 and 180) then return jsonb_build_object('ok', false, 'error', 'bad_media'); end if;
    if p_kind = 'voice' then v_body := null; end if; -- the words come from asker-chat, never from the page
  end if;
  -- no flood: 20 messages every 5 minutes in one chat
  if (select count(*) from public.ar_chat_messages where chat_id = v_id and sender = 'customer' and at > now() - interval '5 minutes') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  insert into public.ar_chat_messages (chat_id, sender, kind, body, media, seconds)
  values (v_id, 'customer', p_kind, left(v_body, 2000), case when p_kind = 'text' then null else p_media end, case when p_kind = 'voice' then p_seconds end)
  returning id into v_msg;
  update public.ar_chats set last_at = now(), last_from = 'customer', waiting = waiting + 1,
    last_text = left(case p_kind when 'photo' then '📷 صورة' when 'voice' then '🎤 فويس' else v_body end, 200)
   where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_msg);
end $function$;
revoke all on function public.ar_chat_send(text, text, text, text, int) from public;
grant execute on function public.ar_chat_send(text, text, text, text, int) to anon, authenticated;

-- the customer's phone asks to be told when the pharmacy answers (a push address of a browser's push service)
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
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then return jsonb_build_object('ok', false, 'error', 'bad_endpoint'); end if;
  if (select count(*) from public.ar_chat_push where chat_id = v_id) >= 5 then
    delete from public.ar_chat_push where endpoint in (select endpoint from public.ar_chat_push where chat_id = v_id order by created_at limit 1);
  end if;
  insert into public.ar_chat_push (endpoint, chat_id) values (p_endpoint, v_id)
  on conflict (endpoint) do update set chat_id = excluded.chat_id, created_at = now();
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.ar_chat_push_save(text, text) from public;
grant execute on function public.ar_chat_push_save(text, text) to anon, authenticated;

-- the pharmacy answers (the owner, or staff with «خدمة العملاء»)
create or replace function public.ar_chat_reply(p_chat uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_body text := nullif(btrim(coalesce(p_body, '')), ''); v_msg bigint;
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid and not (select public.ar_staff_can(array['care']::text[])) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_body is null or char_length(v_body) > 2000 then return jsonb_build_object('ok', false, 'error', 'bad_text'); end if;
  if not exists (select 1 from public.ar_chats where id = p_chat) then return jsonb_build_object('ok', false, 'error', 'chat'); end if;
  insert into public.ar_chat_messages (chat_id, sender, kind, body, sent_by) values (p_chat, 'pharmacy', 'text', v_body, (select auth.uid()))
  returning id into v_msg;
  update public.ar_chats set last_at = now(), last_from = 'pharmacy', waiting = 0, last_text = left(v_body, 200) where id = p_chat;
  return jsonb_build_object('ok', true, 'id', v_msg);
end $function$;
revoke all on function public.ar_chat_reply(uuid, text) from public;
revoke all on function public.ar_chat_reply(uuid, text) from anon;
grant execute on function public.ar_chat_reply(uuid, text) to authenticated;
