-- ASKER bot: photos from two suppliers at the same time. WhatsApp saves every photo in one folder, without its chat,
-- so when two suppliers announce photos within 3 minutes the phone cannot tell whose photo is whose.
-- ar_inbox_media: one row per photo/file notification of a saved company (written by the function, service role).
-- ar_inbox.maybe: the companies a photo may come from when that happens (null = sure); the owner picks one in the page.
-- Rollback: alter table public.ar_inbox drop column maybe; drop table public.ar_inbox_media;
create table if not exists public.ar_inbox_media (
  id bigserial primary key,
  supplier text not null check (char_length(supplier) between 1 and 80),
  at timestamptz not null default now()
);
create index if not exists ar_inbox_media_at on public.ar_inbox_media (at desc);
alter table public.ar_inbox_media enable row level security;
create policy "Owner ar inbox media" on public.ar_inbox_media for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
alter table public.ar_inbox add column if not exists maybe text[];
