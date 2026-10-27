-- ASKER V10: the owner's corrections of Gemini readings (text as read -> correct Arabic text).
-- Applied before item matching on later readings. New table only; same owner-only RLS as the other tables.
-- Rollback: drop table public.reading_fixes;
create table if not exists public.reading_fixes (
  id uuid primary key default gen_random_uuid(),
  read_key text not null unique check (char_length(read_key) between 2 and 250),
  read_text text not null check (char_length(read_text) between 2 and 250),
  corrected_text text not null check (char_length(corrected_text) between 2 and 250),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.reading_fixes enable row level security;
create policy "Owner fix access" on public.reading_fixes
  for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
