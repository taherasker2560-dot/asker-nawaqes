-- 202611271700_ar_photo_new (owner 2026-11-27: «انا عاوز صور الصنف الجديد تبقى اول الاصناف فى صور مطلوبه دانا عامل اصناف مطلوبه مخصوص عشانها و قايلك انها تدخل تلقائى اما باقى الاصناف انا اللى
-- هدخلها من اصناف الفواتير»; applied only with his approval)
--   A NEW item (a line of a prepared invoice with no card in PharmaFly yet) goes into «صور مطلوبة» BY THE SERVER, the moment the invoice is prepared: no page has to be open.
--   ar_photo_new: one row per such line. gone = the line was rejected or the invoice cancelled (kept by the trigger); removed_at = the owner's ✕ (never brought back).
--   The box photo taken from the list is the same request as the review card's «📷 صوّر العلبة» (ar_item_reads, kind 'new_item'): the laptop reads it, it shows under the invoice line,
--   and it becomes the new card's photo. So a user with «صور مطلوبة» may now ask such a reading, but only for a line that is on the list.
--   The nightly cleaning of finished invoice cards keeps a card while its new item's box is still wanted (30 days at most), or the line would leave the list 12 hours after entry.
-- Idempotent. Rollback: drop trigger ar_photo_new_from_review on public.ar_invoice_reviews; drop function public.ar_photo_new_from_review(); drop table public.ar_photo_new;
--   then re-run the function of 202611231500_ar_invoice_reviews_clean.sql and the «ask ar item reads» policy of 202611221800.

create table if not exists public.ar_photo_new (
  review_id bigint not null references public.ar_invoice_reviews (id) on delete cascade,
  line_n text not null check (char_length(line_n) between 1 and 20),
  name text not null check (char_length(name) between 1 and 250),
  supplier text check (supplier is null or char_length(supplier) <= 120),
  gone boolean not null default false,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (review_id, line_n)
);
alter table public.ar_photo_new enable row level security;

drop policy if exists "Owner ar photo new" on public.ar_photo_new;
create policy "Owner ar photo new" on public.ar_photo_new for all to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Staff reads ar photo new" on public.ar_photo_new;
create policy "Staff reads ar photo new" on public.ar_photo_new for select to authenticated
  using (removed_at is null and not gone and (select public.ar_staff_can(array['photos'])));

-- rows are made by the trigger only; the page may take one off (✕)
revoke all on public.ar_photo_new from anon, authenticated;
grant select on public.ar_photo_new to authenticated;
grant update (removed_at) on public.ar_photo_new to authenticated;

-- the lines of one invoice -> the list: a line with no card (no id, or 0) is a new item
create or replace function public.ar_photo_new_sync(p_review bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v record; l jsonb; v_n text; v_name text; v_gone boolean;
begin
  select id, supplier, status, lines, answers into v from public.ar_invoice_reviews where id = p_review;
  if not found or jsonb_typeof(v.lines) is distinct from 'array' then return; end if;
  for l in select value from jsonb_array_elements(v.lines) loop
    v_n := l ->> 'n';
    continue when v_n is null or char_length(v_n) not between 1 and 20;
    continue when case when coalesce(l ->> 'id', '') ~ '^[0-9]+$' then (l ->> 'id')::numeric > 0 else false end;
    v_name := btrim(left(btrim(coalesce(nullif(btrim(l ->> 'name'), ''), l ->> 'paper', '')), 250));
    continue when v_name = '';
    v_gone := v.status = 'cancelled' or coalesce(v.answers -> ('R' || v_n) ->> 'v', '') = 'reject';
    insert into public.ar_photo_new (review_id, line_n, name, supplier, gone) values (v.id, v_n, v_name, left(v.supplier, 120), v_gone)
    on conflict (review_id, line_n) do update set name = excluded.name, supplier = excluded.supplier, gone = excluded.gone;
  end loop;
  -- a cancelled invoice takes all its lines off, also one that is no longer in it
  if v.status = 'cancelled' then update public.ar_photo_new set gone = true where review_id = v.id; end if;
end $function$;
revoke all on function public.ar_photo_new_sync(bigint) from public, anon, authenticated;

create or replace function public.ar_photo_new_from_review()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  begin
    perform public.ar_photo_new_sync(new.id);
  exception when others then
    -- the photo list must never stop an invoice from being prepared or approved
    raise warning 'ar_photo_new: invoice % not listed: %', new.id, sqlerrm;
  end;
  return null;
end $function$;
revoke all on function public.ar_photo_new_from_review() from public, anon, authenticated;

drop trigger if exists ar_photo_new_from_review on public.ar_invoice_reviews;
create trigger ar_photo_new_from_review after insert or update of lines, answers, status, supplier on public.ar_invoice_reviews
  for each row execute function public.ar_photo_new_from_review();

-- the invoices already on the server
select public.ar_photo_new_sync(id) from public.ar_invoice_reviews;

-- asking a reading: as before (the owner anything; an active staff member the item sheet's photo), and now a user with «صور مطلوبة» the box of a NEW line that is on the list
drop policy if exists "Owner or storeorders staff ask ar item reads" on public.ar_item_reads;
create policy "Owner or storeorders staff ask ar item reads" on public.ar_item_reads for insert to authenticated
  with check (status = 'pending' and requested_by = (select auth.uid())
    and ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid
      or ((select public.ar_is_staff()) and kind = 'active')
      or (kind = 'new_item' and (select public.ar_staff_can(array['photos']))
          and exists (select 1 from public.ar_photo_new p where p.review_id = ar_item_reads.review_id and p.line_n = ar_item_reads.line_n and p.removed_at is null and not p.gone))));

create or replace function public.ar_invoice_reviews_clean()
returns integer
language sql
security definer
set search_path to ''
as $function$
  with gone as (
    delete from public.ar_invoice_reviews v
    where v.status in ('entered', 'cancelled')
      and coalesce(v.done_at, v.approved_at, v.created_at) < now() - interval '12 hours'
      and not exists (select 1 from public.ar_item_reads r where r.review_id = v.id and r.status in ('pending', 'reading', 'done'))
      and not exists (select 1 from public.ar_photo_new p where p.review_id = v.id and p.removed_at is null and not p.gone and p.added_at > now() - interval '30 days'
        and not exists (select 1 from public.ar_item_reads a where a.review_id = p.review_id and a.line_n = p.line_n and a.kind = 'new_item' and a.status = 'applied'))
    returning 1
  )
  select count(*)::integer from gone;
$function$;
revoke all on function public.ar_invoice_reviews_clean() from public, anon, authenticated;
