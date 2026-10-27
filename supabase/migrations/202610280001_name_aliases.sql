-- ASKER V10: names the owner confirmed while reviewing incoming supplier lists.
-- A supplier's Arabic name (as read from the image) -> the item name used in V10 / PharmaFly.
-- New table only: no existing table, row or policy is changed. Same owner-only RLS as the other tables.
create table if not exists public.name_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_text text not null check (char_length(alias_text) between 2 and 250),
  alias_key text not null check (char_length(alias_key) between 2 and 250),
  target_name text not null check (char_length(target_name) between 2 and 250),
  target_code text check (target_code is null or char_length(target_code) <= 40),
  source text not null default 'incoming-review' check (source in ('incoming-review', 'import')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (alias_key, target_name)
);
create index if not exists name_aliases_alias_key_idx on public.name_aliases (alias_key);

alter table public.name_aliases enable row level security;
create policy "Owner alias access" on public.name_aliases
  for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

comment on table public.name_aliases is 'Owner-confirmed supplier name -> item name. Rollback: drop table public.name_aliases;';
