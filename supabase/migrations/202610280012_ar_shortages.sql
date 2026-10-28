-- ASKER trial bot: its own shortage list, separate from V10's shortage_items (owner's choice, 28 Oct 2026).
-- Filled from an Excel/CSV file or typed lines in asker-nawaqes-arabic.html; new names are added, existing ones kept.
-- name_key = the product name upper case with single spaces (same key as ar_names / ar_answers).
-- New table only; owner-only RLS. Rollback: drop table public.ar_shortages;
create table if not exists public.ar_shortages (
  id uuid primary key default gen_random_uuid(),
  name_key text not null unique check (char_length(name_key) between 2 and 250),
  product_name text not null check (char_length(product_name) between 2 and 250),
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.ar_shortages enable row level security;
create policy "Owner ar shortages" on public.ar_shortages for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
-- Starting point: a copy of V10's active shortage names, so the trial bot keeps working until the owner uploads his
-- own file (which then replaces this list). V10's shortage_items is only read.
insert into public.ar_shortages (name_key, product_name, created_by)
select distinct on (k) k, btrim(regexp_replace(product_name, '\s+', ' ', 'g')), 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid
from public.shortage_items, lateral (select upper(btrim(regexp_replace(product_name, '\s+', ' ', 'g'))) as k) x
where is_active and char_length(k) between 2 and 250
order by k, id
on conflict (name_key) do nothing;
