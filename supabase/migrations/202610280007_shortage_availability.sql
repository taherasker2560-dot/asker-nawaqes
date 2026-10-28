-- ASKER V10: shortages a supplier's availability list showed (button «سجّل اللي وصل» after a Gemini report).
-- One row per shortage, supplier and day; the shortage list shows «متاح عند …» from the last 7 days.
-- New table only; owner-only RLS. Rollback: drop table public.shortage_availability;
create table if not exists public.shortage_availability (
  id uuid primary key default gen_random_uuid(),
  shortage_item_id uuid not null references public.shortage_items(id) on delete cascade,
  supplier text not null check (char_length(supplier) between 1 and 120),
  seen_on date not null,
  source_text text check (char_length(source_text) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (shortage_item_id, supplier, seen_on)
);
create index if not exists shortage_availability_seen_on on public.shortage_availability (seen_on);
alter table public.shortage_availability enable row level security;
create policy "Owner availability access" on public.shortage_availability
  for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
