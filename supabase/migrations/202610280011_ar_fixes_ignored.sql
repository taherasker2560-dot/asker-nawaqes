-- ASKER trial bot: the owner's Arabic reading corrections (ar_fixes) and names marked «مش مهم» (ar_ignored).
-- New tables only; owner-only RLS. Rollback: drop table public.ar_fixes; drop table public.ar_ignored;
create table if not exists public.ar_fixes (
  read_key text primary key check (char_length(read_key) between 2 and 250),
  read_text text not null check (char_length(read_text) between 2 and 250),
  corrected_text text not null check (char_length(corrected_text) between 2 and 250),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.ar_ignored (
  alias_key text primary key check (char_length(alias_key) between 2 and 250),
  read_text text not null check (char_length(read_text) between 2 and 250),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.ar_fixes enable row level security;
alter table public.ar_ignored enable row level security;
create policy "Owner ar fixes" on public.ar_fixes for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
create policy "Owner ar ignored" on public.ar_ignored for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
