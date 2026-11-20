-- 202611201900_ar_phone_contacts (NOT applied yet: needs the owner's approval on the phone)
-- Owner 2026-11-20 (option «أ»: «نخلي حفظ الارقام في تطبيقنا ونعمله اوبشن يتخزن بشكل تلقائي في سجل ارقام الهاتف وجوجل»): the server side of the phone app «دفتر الأرقام» (contacts-android/).
--   System → phone: a number saved in the system (ar_contacts, source 'typed') that is not yet written into the phone has pushed_at null; the app asks for them (ar_phone_pending),
--                   writes them into the phone's contacts and tells back (ar_phone_ack).
--   Phone → system: every 10 days the app sends every contact of the phone in chunks (ar_phone_push_rows into ar_phone_contacts), then ar_phone_finish checks the count (a partial sync
--                   changes nothing) and marks the sync done. The LAPTOP then merges it into ar_contacts (Hub\contacts\MERGE_PHONE_CONTACTS.ps1: a new number comes CLOSED to the staff,
--                   a typed number is never changed, nothing is deleted) and sets ar_phone_syncs.merged_at.
--   Keys: each phone has its own key (64 hex, made here by ar_phone_link() for the owner, shown once); only its sha256 is stored (ar_phone_keys). The app calls the functions with the
--         public key + this key; a wrong key does nothing. ar_phone_link / ar_phone_status are the owner's (the system's «اربط التطبيق» / the status line); nobody else reads these tables.
-- Rollback: drop function public.ar_phone_status(); drop function public.ar_phone_link(); drop function public.ar_phone_finish(text, bigint, int); drop function public.ar_phone_push_rows(text, bigint, jsonb);
--   drop function public.ar_phone_ack(text, text[]); drop function public.ar_phone_pending(text); drop function public.ar_phone_key_ok(text); drop table public.ar_phone_syncs; drop table public.ar_phone_contacts;
--   drop table public.ar_phone_keys; alter table public.ar_contacts drop column pushed_at;

alter table public.ar_contacts add column if not exists pushed_at timestamptz;

create table if not exists public.ar_phone_keys (
  key_hash text primary key,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create table if not exists public.ar_phone_contacts (
  contact_id bigint primary key,
  name text not null default '' check (char_length(name) <= 200),
  phones text[] not null default '{}' check (cardinality(phones) <= 20),
  sync_id bigint not null,
  seen_at timestamptz not null default now()
);
create table if not exists public.ar_phone_syncs (
  sync_id bigint primary key,
  n int not null default 0,
  done boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  merged_at timestamptz
);
do $$
declare t text;
begin
  foreach t in array array['ar_phone_keys', 'ar_phone_contacts', 'ar_phone_syncs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Owner %s" on public.%I', t, t);
    execute format('create policy "Owner %s" on public.%I for all to authenticated using ((select auth.uid()) = %L::uuid) with check ((select auth.uid()) = %L::uuid)', t, t, 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c', 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c');
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- the phone's key is a known one (and it is marked as used now)
create or replace function public.ar_phone_key_ok(p_key text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare v_hash text;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{32,128}$' then return false; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_phone_keys set last_used_at = now() where key_hash = v_hash;
  return found;
end $function$;
revoke all on function public.ar_phone_key_ok(text) from public, anon, authenticated;

-- the numbers waiting to be written into the phone: [{phone, name}] (the ones typed in the system, 50 at a time)
create or replace function public.ar_phone_pending(p_key text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.ar_phone_key_ok(p_key) then raise exception 'bad key' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('phone', x.phone, 'name', x.name) order by x.updated_at, x.phone)
                     from (select c.phone, c.name, c.updated_at from public.ar_contacts c where c.source = 'typed' and c.pushed_at is null order by c.updated_at, c.phone limit 50) x), '[]'::jsonb);
end $function$;

-- the phone wrote them (or already had them): they are not asked again; returns how many
create or replace function public.ar_phone_ack(p_key text, p_phones text[])
returns int
language plpgsql
security definer
set search_path to ''
as $function$
declare n int;
begin
  if not public.ar_phone_key_ok(p_key) then raise exception 'bad key' using errcode = '42501'; end if;
  if coalesce(cardinality(p_phones), 0) = 0 or cardinality(p_phones) > 200 then return 0; end if;
  update public.ar_contacts set pushed_at = now() where phone = any (p_phones) and source = 'typed' and pushed_at is null;
  get diagnostics n = row_count;
  return n;
end $function$;

-- one chunk of the phone's contacts: [{id, name, phones[]}] (at most 500 contacts, 20 numbers each); returns how many were taken
create or replace function public.ar_phone_push_rows(p_key text, p_sync bigint, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path to ''
as $function$
declare n int;
begin
  if not public.ar_phone_key_ok(p_key) then raise exception 'bad key' using errcode = '42501'; end if;
  if p_sync is null or p_sync <= 0 or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'bad rows' using errcode = '22023'; end if;
  insert into public.ar_phone_syncs (sync_id) values (p_sync) on conflict (sync_id) do nothing;
  insert into public.ar_phone_contacts (contact_id, name, phones, sync_id)
  select (r ->> 'id')::bigint, left(coalesce(r ->> 'name', ''), 200),
         coalesce((select array_agg(left(p, 40)) from (select jsonb_array_elements_text(case when jsonb_typeof(r -> 'phones') = 'array' then r -> 'phones' else '[]'::jsonb end) p limit 20) q), '{}'),
         p_sync
    from jsonb_array_elements(p_rows) r
   where (r ->> 'id') ~ '^[0-9]{1,18}$'
  on conflict (contact_id) do update set name = excluded.name, phones = excluded.phones, sync_id = excluded.sync_id, seen_at = now();
  get diagnostics n = row_count;
  return n;
end $function$;

-- the sync is complete when the count matches: then the contacts of older syncs (gone from the phone) leave the staging table and the sync is «done»
create or replace function public.ar_phone_finish(p_key text, p_sync bigint, p_n int)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare got int;
begin
  if not public.ar_phone_key_ok(p_key) then raise exception 'bad key' using errcode = '42501'; end if;
  select count(*)::int into got from public.ar_phone_contacts where sync_id = p_sync;
  if p_n is null or p_n <= 0 or got <> p_n then return jsonb_build_object('ok', false, 'got', got); end if;
  delete from public.ar_phone_contacts where sync_id <> p_sync;
  update public.ar_phone_syncs set n = got, done = true, finished_at = now() where sync_id = p_sync;
  return jsonb_build_object('ok', true, 'n', got);
end $function$;

do $$
declare f text;
begin
  foreach f in array array['ar_phone_pending(text)', 'ar_phone_ack(text, text[])', 'ar_phone_push_rows(text, bigint, jsonb)', 'ar_phone_finish(text, bigint, int)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

-- the owner makes this phone's key (shown ONCE: the page opens the app with it); only the hash stays here
create or replace function public.ar_phone_link()
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare v_key text;
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then raise exception 'owner only' using errcode = '42501'; end if;
  v_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.ar_phone_keys (key_hash, label) values (encode(sha256(convert_to(v_key, 'UTF8')), 'hex'), 'phone ' || to_char(now(), 'YYYY-MM-DD'));
  -- only the newest 3 keys stay valid: an old phone's key stops working after a few new links
  delete from public.ar_phone_keys where key_hash not in (select k.key_hash from public.ar_phone_keys k order by k.created_at desc, k.key_hash limit 3);
  return v_key;
end $function$;
revoke all on function public.ar_phone_link() from public, anon;
grant execute on function public.ar_phone_link() to authenticated;

-- the owner's status line: how many numbers wait for the phone, the last complete sync (and whether the laptop merged it), the phones linked and when each last talked
create or replace function public.ar_phone_status()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then raise exception 'owner only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'pending', (select count(*) from public.ar_contacts where source = 'typed' and pushed_at is null),
    'last_sync', (select jsonb_build_object('n', s.n, 'finished_at', s.finished_at, 'merged_at', s.merged_at) from public.ar_phone_syncs s where s.done order by s.sync_id desc limit 1),
    'phones', coalesce((select jsonb_agg(jsonb_build_object('label', k.label, 'created_at', k.created_at, 'last_used_at', k.last_used_at) order by k.created_at desc) from public.ar_phone_keys k), '[]'::jsonb));
end $function$;
revoke all on function public.ar_phone_status() from public, anon;
grant execute on function public.ar_phone_status() to authenticated;
