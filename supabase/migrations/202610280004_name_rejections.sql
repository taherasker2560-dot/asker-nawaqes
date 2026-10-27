-- ASKER V10: items the owner said a supplier name is NOT (button «مش ده» / «مش واحد منهم»).
-- The function drops these items from that name's suggestions on later readings. New table only; owner-only RLS.
-- Rollback: drop table public.name_rejections;
create table if not exists public.name_rejections (
  id uuid primary key default gen_random_uuid(),
  alias_key text not null check (char_length(alias_key) between 2 and 250),
  alias_text text not null check (char_length(alias_text) between 2 and 250),
  target_name text not null check (char_length(target_name) between 1 and 250),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (alias_key, target_name)
);
alter table public.name_rejections enable row level security;
create policy "Owner rejection access" on public.name_rejections
  for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
