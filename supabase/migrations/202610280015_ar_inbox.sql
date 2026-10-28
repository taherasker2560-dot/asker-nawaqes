-- ASKER bot: incoming lists forwarded automatically from the owner's phone (Tasker reads WhatsApp Business).
-- ar_inbox_keys: sha256 of the phone's key (the key itself is shown once in the page and never stored).
-- ar_inbox: one row per forwarded message (text, image, PDF or Excel) with its matching result.
-- Storage bucket ar-inbox (private): the original files. Owner-only RLS; the function writes with the service role.
-- Rollback: drop table public.ar_inbox; drop table public.ar_inbox_keys; delete the ar-inbox bucket.
create table if not exists public.ar_inbox_keys (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.ar_inbox (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  sender text not null check (char_length(sender) between 1 and 80),
  supplier text,
  kind text not null check (kind in ('text', 'image', 'pdf', 'sheet')),
  body_text text check (char_length(body_text) <= 20000),
  file_path text,
  status text not null default 'new' check (status in ('new', 'seen', 'error')),
  error text,
  rows jsonb not null default '[]'::jsonb,
  sure int not null default 0,
  review int not null default 0
);
create index if not exists ar_inbox_received on public.ar_inbox (received_at desc);
alter table public.ar_inbox_keys enable row level security;
alter table public.ar_inbox enable row level security;
create policy "Owner ar inbox keys" on public.ar_inbox_keys for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
create policy "Owner ar inbox" on public.ar_inbox for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
insert into storage.buckets (id, name, public, file_size_limit) values ('ar-inbox', 'ar-inbox', false, 8388608)
  on conflict (id) do nothing;
create policy "Owner reads ar-inbox files" on storage.objects for select to authenticated
  using (bucket_id = 'ar-inbox' and auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
