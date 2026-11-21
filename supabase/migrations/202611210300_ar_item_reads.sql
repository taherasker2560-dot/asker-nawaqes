-- 202611210300_ar_item_reads (NOT applied yet: needs the owner's approval on the phone)
-- Owner 2026-11-20/21 («عاوز اوبشن اضيف المادة الفعالة بالتصوير وكلود يترجمها»; mockup mockups\item_active_photo_2026-11-21.png, his «ا»): in the item sheet «📷 صوّر المادة الفعالة من العلبة»
-- sends the photo here as a request; the LAPTOP's Claude (his own subscription, Hub\reader\ITEM_ACTIVE_READER.ps1, every minute) reads the active ingredient and strength PRINTED on the box,
-- gives it in English and in Arabic (translated from whichever language is printed), and sends it back; the sheet fills the two fields and the owner checks and saves (nothing reaches
-- ar_store_edits until he saves). The photo is kept only until it is read (img_b64 is emptied then); finished rows go after 30 days.
-- Read / ask / mark: the owner and «storeorders» staff (the same people who may edit the sheet). Written by the laptop only through the two functions below with its sync key.
--   status: pending (waiting for the laptop) · reading · done / failed (the laptop's answer) · applied (he saved it) · cancelled
--   result = {found, en, ar, printed ('en'|'ar'|'both'|'none'), confidence ('high'|'medium'|'low'), note}
-- Rollback: drop function public.ar_item_read_next(text); drop function public.ar_item_read_done(text, bigint, boolean, jsonb, text); drop table public.ar_item_reads;

create table if not exists public.ar_item_reads (
  id bigint generated always as identity primary key,
  item_id int not null,
  item_name text check (item_name is null or char_length(item_name) <= 250),
  img_b64 text check (img_b64 is null or (char_length(img_b64) <= 1200000 and img_b64 ~ '^[A-Za-z0-9+/=]+$')),
  status text not null default 'pending' check (status in ('pending', 'reading', 'done', 'failed', 'applied', 'cancelled')),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 4000)),
  error text check (error is null or char_length(error) <= 400),
  requested_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  done_at timestamptz
);
create index if not exists ar_item_reads_status on public.ar_item_reads (status, created_at);
create index if not exists ar_item_reads_item on public.ar_item_reads (item_id, created_at desc);
alter table public.ar_item_reads enable row level security;
revoke all on public.ar_item_reads from anon, authenticated;
grant select on public.ar_item_reads to authenticated;
grant insert (item_id, item_name, img_b64) on public.ar_item_reads to authenticated;
grant update (status) on public.ar_item_reads to authenticated;

drop policy if exists "Owner or storeorders staff read ar item reads" on public.ar_item_reads;
create policy "Owner or storeorders staff read ar item reads" on public.ar_item_reads for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid or (select public.ar_staff_can(array['storeorders']::text[])));
drop policy if exists "Owner or storeorders staff ask ar item reads" on public.ar_item_reads;
create policy "Owner or storeorders staff ask ar item reads" on public.ar_item_reads for insert to authenticated
  with check (status = 'pending' and requested_by = (select auth.uid())
    and ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid or (select public.ar_staff_can(array['storeorders']::text[]))));
-- a request can only be marked «applied» or «cancelled» from the page (the laptop's answer comes through ar_item_read_done)
drop policy if exists "Owner or storeorders staff mark ar item reads" on public.ar_item_reads;
create policy "Owner or storeorders staff mark ar item reads" on public.ar_item_reads for update to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid or (select public.ar_staff_can(array['storeorders']::text[])))
  with check (status in ('applied', 'cancelled')
    and ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid or (select public.ar_staff_can(array['storeorders']::text[]))));

-- ---------- the laptop ----------
-- the oldest waiting request (marked «reading»; one stuck in «reading» for 10 minutes goes back to waiting), or {"ok":true,"id":null}
create or replace function public.ar_item_read_next(p_key text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; r record;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_item_read_next'));
  update public.ar_item_reads set status = 'pending' where status = 'reading' and started_at < now() - interval '10 minutes';
  select id, item_id, item_name, img_b64 into r from public.ar_item_reads where status = 'pending' and img_b64 is not null order by created_at, id limit 1;
  if not found then return jsonb_build_object('ok', true, 'id', null); end if;
  update public.ar_item_reads set status = 'reading', started_at = now() where id = r.id;
  return jsonb_build_object('ok', true, 'id', r.id, 'item_id', r.item_id, 'item_name', r.item_name, 'img_b64', r.img_b64);
end $function$;
revoke all on function public.ar_item_read_next(text) from public;
grant execute on function public.ar_item_read_next(text) to anon, authenticated;

-- the laptop's answer: done (p_ok true, p_result) or failed (p_error); the photo is emptied; finished rows older than 30 days go
create or replace function public.ar_item_read_done(p_key text, p_id bigint, p_ok boolean, p_result jsonb default null, p_error text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; v_n int;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if p_ok and (p_result is null or jsonb_typeof(p_result) <> 'object') then raise exception 'result must be an object'; end if;
  update public.ar_item_reads
     set status = case when p_ok then 'done' else 'failed' end,
         result = case when p_ok then p_result else null end,
         error = case when p_ok then null else left(coalesce(p_error, 'failed'), 400) end,
         done_at = now(), img_b64 = null
   where id = p_id and status = 'reading';
  get diagnostics v_n = row_count;
  delete from public.ar_item_reads where created_at < now() - interval '30 days' and status in ('done', 'failed', 'applied', 'cancelled');
  return jsonb_build_object('ok', v_n = 1);
end $function$;
revoke all on function public.ar_item_read_done(text, bigint, boolean, jsonb, text) from public;
grant execute on function public.ar_item_read_done(text, bigint, boolean, jsonb, text) to anon, authenticated;
