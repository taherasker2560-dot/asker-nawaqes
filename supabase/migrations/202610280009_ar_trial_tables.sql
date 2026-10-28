-- ASKER trial bot (asker-nawaqes-arabic.html), separate from V10: Arabic names for the shortage list and the
-- owner's yes/no on supplier lines. V10 tables are only read, never changed. New tables only; owner-only RLS.
-- Rollback: drop table public.ar_decisions; drop table public.ar_shortage_names;
create table if not exists public.ar_shortage_names (
  shortage_item_id uuid primary key references public.shortage_items(id) on delete cascade,
  arabic_name text not null check (char_length(arabic_name) between 2 and 250),
  status text not null default 'suggested' check (status in ('suggested','approved')),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create table if not exists public.ar_decisions (
  id uuid primary key default gen_random_uuid(),
  alias_key text not null check (char_length(alias_key) between 2 and 250),
  read_text text not null check (char_length(read_text) between 2 and 250),
  shortage_item_id uuid not null references public.shortage_items(id) on delete cascade,
  decision text not null check (decision in ('yes','no')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (alias_key, shortage_item_id)
);
alter table public.ar_shortage_names enable row level security;
alter table public.ar_decisions enable row level security;
create policy "Owner ar names" on public.ar_shortage_names for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
create policy "Owner ar decisions" on public.ar_decisions for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
