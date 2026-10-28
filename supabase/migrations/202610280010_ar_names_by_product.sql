-- ASKER trial bot: Arabic names and the owner's answers kept per product (English name, upper case, single
-- spaces) instead of per shortage row, so an item that leaves the shortage list and is added again later keeps
-- its approved Arabic name. Data copied from ar_shortage_names / ar_decisions (those stay, unused).
-- Rollback: drop table public.ar_answers; drop table public.ar_names;
create table if not exists public.ar_names (
  name_key text primary key check (char_length(name_key) between 1 and 250),
  english_name text not null,
  arabic_name text not null check (char_length(arabic_name) between 2 and 250),
  status text not null default 'suggested' check (status in ('suggested','approved')),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create table if not exists public.ar_answers (
  id uuid primary key default gen_random_uuid(),
  alias_key text not null check (char_length(alias_key) between 2 and 250),
  read_text text not null check (char_length(read_text) between 2 and 250),
  name_key text not null check (char_length(name_key) between 1 and 250),
  decision text not null check (decision in ('yes','no')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (alias_key, name_key)
);
alter table public.ar_names enable row level security;
alter table public.ar_answers enable row level security;
create policy "Owner ar names by product" on public.ar_names for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
create policy "Owner ar answers" on public.ar_answers for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
insert into public.ar_names (name_key, english_name, arabic_name, status, updated_at)
select distinct on (k) k, s.product_name, n.arabic_name, n.status, n.updated_at
from public.ar_shortage_names n join public.shortage_items s on s.id = n.shortage_item_id,
lateral (select upper(btrim(regexp_replace(s.product_name, '\s+', ' ', 'g'))) as k) x
order by k, (n.status = 'approved') desc, n.updated_at desc
on conflict (name_key) do nothing;
insert into public.ar_answers (alias_key, read_text, name_key, decision, created_at)
select d.alias_key, d.read_text, upper(btrim(regexp_replace(s.product_name, '\s+', ' ', 'g'))), d.decision, d.created_at
from public.ar_decisions d join public.shortage_items s on s.id = d.shortage_item_id
on conflict (alias_key, name_key) do nothing;
