-- 202611130400_ar_count (owner 2026-11-13 «ا» on the count design; applied only after his «ا»)
-- ASKER: «جرد المخزون». The count records what was FOUND, as a difference per expiry batch against what PharmaFly held at
-- that moment (owner: «انت مش هتظبط ارصدة … انت هتحدد الحالة بس»): e.g. 1 box less of 10/2027; 1 box more of 12/2027 and 1
-- less of 09/2027 (dates mixed up); and a wrong section. Applied in PharmaFly later as the same difference on the balance
-- of that time (a box sold after the count is not given back). Nothing here writes to PharmaFly.
--   ar_count_entries: one row per item counted. The phone makes the id (no internet: kept on the phone, sent later).
--     result 'ok' = matches PharmaFly; 'diff' = see diffs / section_to.
--     diffs  = [{x: 'YYYY-MM' or null (no expiry), d: units found minus units in PharmaFly (a box = parts units)}]
--     system = PharmaFly's batches when it was counted [{x, k: packs, u: units}] (for the owner to read).
-- Owner: everything. Staff with «جرد المخزون» (count): read every entry (to see what is already counted), add their own,
-- correct their own until applied; never mark applied. The count data file asker-private/count/stock.json (laptop,
-- Hub\count\BUILD_COUNT.ps1) is readable by them too. What they do is logged under their names (ar_activity).
-- Rollback: drop table public.ar_count_entries; (and the storage policy back to 202611130200's)
create table if not exists public.ar_count_entries (
  id uuid primary key,
  item_id bigint not null,
  item_name text check (item_name is null or char_length(item_name) <= 120),
  counted_at timestamptz not null,
  created_by uuid default auth.uid(),
  result text not null check (result in ('ok', 'diff')),
  diffs jsonb not null default '[]'::jsonb check (jsonb_typeof(diffs) = 'array' and jsonb_array_length(diffs) <= 12),
  system jsonb check (system is null or jsonb_typeof(system) = 'array'),
  parts integer not null default 1 check (parts >= 1),
  section_from bigint,
  section_to bigint,
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'applied', 'cancelled')),
  applied_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists ar_count_entries_item on public.ar_count_entries (item_id, counted_at desc);
create index if not exists ar_count_entries_status on public.ar_count_entries (status, counted_at desc);
alter table public.ar_count_entries enable row level security;
drop policy if exists "Owner ar count entries" on public.ar_count_entries;
create policy "Owner ar count entries" on public.ar_count_entries for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Staff reads count entries" on public.ar_count_entries;
create policy "Staff reads count entries" on public.ar_count_entries for select to authenticated
  using (public.ar_staff_can(array['count']));
drop policy if exists "Staff adds own count entries" on public.ar_count_entries;
create policy "Staff adds own count entries" on public.ar_count_entries for insert to authenticated
  with check (public.ar_staff_can(array['count']) and created_by = auth.uid() and status = 'pending');
drop policy if exists "Staff corrects own count entries" on public.ar_count_entries;
create policy "Staff corrects own count entries" on public.ar_count_entries for update to authenticated
  using (public.ar_staff_can(array['count']) and created_by = auth.uid() and status = 'pending')
  with check (public.ar_staff_can(array['count']) and created_by = auth.uid() and status = 'pending');

-- what a staff member counted, under his name (ar_activity, migration 202611130200): the item's name is in item_name
create or replace function public.ar_log_staff() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.ar_is_staff() then return null; end if;
  r := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.ar_activity (user_id, tbl, op, info) values (auth.uid(), tg_table_name, lower(tg_op), jsonb_strip_nulls(jsonb_build_object(
    'id', r -> 'id', 'no', r -> 'no',
    'name', coalesce(r -> 'arabic_name', r -> 'product_name', r -> 'customer_name', r -> 'item_name', r -> 'name', r -> 'name_key', r -> 'supplier'),
    'status', r -> 'status', 'kind', r -> 'kind', 'total', r -> 'total', 'result', r -> 'result',
    'n', case when jsonb_typeof(r -> 'items') = 'array' then to_jsonb(jsonb_array_length(r -> 'items')) end)));
  return null;
end $$;
revoke all on function public.ar_log_staff() from public;
drop trigger if exists ar_log_staff on public.ar_count_entries;
create trigger ar_log_staff after insert or update or delete on public.ar_count_entries for each row execute function public.ar_log_staff();

-- the count data file for staff with «جرد المخزون» (the rest of the private files as in 202611130200)
drop policy if exists "Staff reads private files" on storage.objects;
create policy "Staff reads private files" on storage.objects for select to authenticated
  using (bucket_id = 'asker-private' and (
    (name = 'orders/drafts.json' and public.ar_staff_can(array['drafts'])) or
    (name = 'alerts/expiry.json' and public.ar_staff_can(array['expiry'])) or
    (name = 'alerts/alerts.json' and public.ar_staff_can(array['customers'])) or
    (name = 'count/stock.json' and public.ar_staff_can(array['count']))));
