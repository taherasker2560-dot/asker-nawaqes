-- 202611221800_ar_item_reads_new_item (NOT applied yet: needs the owner's approval on the phone)
-- Owner 2026-11-22 («الاصناف الجديده في المشتريات اللي بيعرضها عليا في السيستم، يبقى فيها اوبشن صوره ادخله بيها، يقوم جاي عامل الصنف منها», then «مراجعه الفواتير بس»;
-- mockup mockups\new_item_photo_2026-11-22.jpg): a line of «🧾 مراجعة الفواتير» that is NOT in PharmaFly yet («جديد») gets «📷 صوّر العلبة». The photo goes into the same queue as the
-- item sheet's active-ingredient photo (public.ar_item_reads, 202611210300); the LAPTOP's Claude (his own subscription, Hub\reader\ITEM_ACTIVE_READER.ps1 every minute) reads the box:
-- the English name the pharmacy's way, the form, the count in the box, the company, the printed price, the active ingredient. The page shows it under the line; he keeps it or types his
-- own name (answers['N<line>'] of the review row, like the 'L' prices and 'R' rejects). When the invoice is entered the invoices conversation makes the PharmaFly card from it, and the page
-- then sets the box photo as the new item's photo (the asker-store-img function, his own session).
--   kind      'active' (the item sheet, item_id required) | 'new_item' (a review line: review_id + line_n required, item_id empty until the card exists)
--   img_b64   for 'new_item' it is KEPT after the reading (it becomes the item's photo); emptied for 'active' as before
-- New-item photos: the owner only (the review page is his). The laptop reads them with ar_item_read_next (now also returns kind / review / line and the invoice's supplier) and lists a
-- review's readings with ar_item_read_list (photo included) when it enters that invoice.
-- Rollback: drop function public.ar_item_read_list(text, bigint); then re-run 202611210300's two functions; alter table public.ar_item_reads drop constraint ar_item_reads_what,
--   drop constraint ar_item_reads_kind, drop column line_n, drop column review_id, drop column kind; delete the 'new_item' rows first and set item_id not null again.

alter table public.ar_item_reads alter column item_id drop not null;
alter table public.ar_item_reads add column if not exists kind text not null default 'active';
alter table public.ar_item_reads add column if not exists review_id bigint references public.ar_invoice_reviews (id) on delete cascade;
alter table public.ar_item_reads add column if not exists line_n text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ar_item_reads_kind') then
    alter table public.ar_item_reads add constraint ar_item_reads_kind check (kind in ('active', 'new_item'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ar_item_reads_what') then
    alter table public.ar_item_reads add constraint ar_item_reads_what check (
      (kind = 'active' and item_id is not null and review_id is null)
      or (kind = 'new_item' and review_id is not null and line_n is not null and char_length(line_n) <= 20));
  end if;
end $$;
create index if not exists ar_item_reads_review on public.ar_item_reads (review_id, line_n) where review_id is not null;

grant insert (item_id, item_name, img_b64, kind, review_id, line_n) on public.ar_item_reads to authenticated;

-- asking: the owner or an active staff member for the item sheet (as since 202611211500); a new-item photo of a review only the owner
drop policy if exists "Owner or storeorders staff ask ar item reads" on public.ar_item_reads;
create policy "Owner or storeorders staff ask ar item reads" on public.ar_item_reads for insert to authenticated
  with check (status = 'pending' and requested_by = (select auth.uid())
    and ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid or ((select public.ar_is_staff()) and kind = 'active')));

-- ---------- the laptop ----------
-- the oldest waiting request (marked «reading»; one stuck in «reading» for 10 minutes goes back to waiting), or {"ok":true,"id":null}; a new-item photo comes with its invoice's supplier
create or replace function public.ar_item_read_next(p_key text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; r record; v_sup text;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_item_read_next'));
  update public.ar_item_reads set status = 'pending' where status = 'reading' and started_at < now() - interval '10 minutes';
  select id, item_id, item_name, img_b64, kind, review_id, line_n into r from public.ar_item_reads where status = 'pending' and img_b64 is not null order by created_at, id limit 1;
  if not found then return jsonb_build_object('ok', true, 'id', null); end if;
  update public.ar_item_reads set status = 'reading', started_at = now() where id = r.id;
  if r.review_id is not null then select supplier into v_sup from public.ar_invoice_reviews where id = r.review_id; end if;
  return jsonb_build_object('ok', true, 'id', r.id, 'item_id', r.item_id, 'item_name', r.item_name, 'img_b64', r.img_b64,
    'kind', r.kind, 'review_id', r.review_id, 'line_n', r.line_n, 'supplier', v_sup);
end $function$;
revoke all on function public.ar_item_read_next(text) from public;
grant execute on function public.ar_item_read_next(text) to anon, authenticated;

-- the laptop's answer: done (p_ok true, p_result) or failed (p_error); the photo is emptied, except a new item's (it becomes the item's photo); finished rows older than 30 days go
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
         done_at = now(), img_b64 = case when kind = 'new_item' then img_b64 else null end
   where id = p_id and status = 'reading';
  get diagnostics v_n = row_count;
  delete from public.ar_item_reads where created_at < now() - interval '30 days' and status in ('done', 'failed', 'applied', 'cancelled');
  return jsonb_build_object('ok', v_n = 1);
end $function$;
revoke all on function public.ar_item_read_done(text, bigint, boolean, jsonb, text) from public;
grant execute on function public.ar_item_read_done(text, bigint, boolean, jsonb, text) to anon, authenticated;

-- a review's new-item photos for the invoices conversation (newest reading per line first; cancelled ones left out): id, line, status, the reading and the photo
create or replace function public.ar_item_read_list(p_key text, p_review bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; v_rows jsonb;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'line_n', x.line_n, 'status', x.status, 'result', x.result, 'error', x.error,
           'img_b64', x.img_b64, 'created_at', x.created_at) order by x.line_n, x.created_at desc), '[]'::jsonb)
    into v_rows
    from public.ar_item_reads x
   where x.review_id = p_review and x.kind = 'new_item' and x.status <> 'cancelled';
  return jsonb_build_object('ok', true, 'rows', v_rows);
end $function$;
revoke all on function public.ar_item_read_list(text, bigint) from public;
grant execute on function public.ar_item_read_list(text, bigint) to anon, authenticated;
