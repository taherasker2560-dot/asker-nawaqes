-- ASKER bot: WhatsApp Cloud API webhook, shadow mode (supabase/functions/arabic-shortages/wa.ts).
-- NOT applied yet: applying it needs the owner's explicit OK. Nothing uses this table until the Meta webhook is set up.
-- ar_wa_log: one row per message the official path received from a saved supplier's phone (ar_suppliers.phone).
-- Only for comparing with ar_inbox (same media_hash = the same photo the phone path sent) before the official path
-- replaces the phone path. Messages from other numbers (customers) are never stored. Rows older than 30 days are
-- cleared by the function. Written by the function with the service role; the owner may read it.
-- Rollback: drop table public.ar_wa_log;
create table if not exists public.ar_wa_log (
  id bigint generated always as identity primary key,
  wa_id text not null unique check (char_length(wa_id) between 1 and 200),
  at timestamptz not null,
  received_at timestamptz not null default now(),
  phone text not null check (phone ~ '^[0-9]{8,15}$'),
  suppliers text[] not null,
  kind text not null check (kind in ('text', 'image', 'pdf', 'sheet', 'file')),
  body_text text check (char_length(body_text) <= 20000),
  caption text check (char_length(caption) <= 2000),
  file_name text check (char_length(file_name) <= 120),
  media_hash text check (media_hash ~ '^[0-9a-f]{32}$'),
  mime text check (char_length(mime) <= 100),
  size integer,
  profile text check (char_length(profile) <= 80),
  error text check (char_length(error) <= 120)
);
create index if not exists ar_wa_log_at on public.ar_wa_log (at desc);
create index if not exists ar_wa_log_hash on public.ar_wa_log (media_hash) where media_hash is not null;
create index if not exists ar_wa_log_received on public.ar_wa_log (received_at);
alter table public.ar_wa_log enable row level security;
create policy "Owner reads ar wa log" on public.ar_wa_log for select to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
