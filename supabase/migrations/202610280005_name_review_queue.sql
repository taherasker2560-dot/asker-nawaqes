-- ASKER V10: supplier names the bot read but could not tie to an item with confidence. Kept so the owner can
-- review them later («أسماء محتاجة مراجعة»); a line leaves the list when the owner chooses its item or drops it.
-- New table only; owner-only RLS. Rollback: drop table public.name_review_queue;
create table if not exists public.name_review_queue (
  id uuid primary key default gen_random_uuid(),
  alias_key text not null unique check (char_length(alias_key) between 2 and 250),
  read_text text not null check (char_length(read_text) between 2 and 250),
  english text,
  file_name text,
  last_seen timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.name_review_queue enable row level security;
create policy "Owner review queue access" on public.name_review_queue
  for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
