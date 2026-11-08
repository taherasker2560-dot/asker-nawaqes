-- ASKER bot: documents for the owner (owner's request 2026-11-08). Photos/PDFs from the pharmacy's own WhatsApp group
-- (purchase invoices, credit notes, collection receipts, water/electricity bills) and photos the owner uploads from
-- the page («فواتير» tab). They are kept, never read by Gemini: Claude reads them later on the laptop and enters the
-- purchase invoices into PharmaFly with the owner; the receipts are kept for the expenses work later.
-- ar_doc_chats: which WhatsApp chats are documents chats. Filled by the owner (the group's name is not written in this
-- public repository). Anything else from such a chat (text, voice, stickers) is ignored by the function.
-- Files live in the existing private bucket ar-inbox under docs/ (the owner already reads that bucket); the owner may
-- upload there from the page; the function writes with the service role.
-- Rollback: drop policy "Owner uploads documents" on storage.objects; drop table public.ar_documents;
-- drop table public.ar_doc_chats; (files under ar-inbox/docs/ can be deleted from the dashboard).
create table if not exists public.ar_doc_chats (
  name text primary key check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
create table if not exists public.ar_documents (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  source text not null default 'whatsapp' check (source in ('whatsapp', 'upload')),
  chat text check (char_length(chat) <= 80),
  file_path text not null unique check (file_path like 'docs/%'),
  kind text not null default 'image' check (kind in ('image', 'pdf')),
  batch uuid,
  note text check (char_length(note) <= 500),
  -- filled when Claude reads it: purchase invoice, credit note, collection receipt, utility bill, something else
  doc_type text check (doc_type in ('purchase', 'credit', 'collection', 'utility', 'other')),
  -- new = waiting; entered = entered in PharmaFly; kept = kept for the expenses; skipped = not a document
  status text not null default 'new' check (status in ('new', 'entered', 'kept', 'skipped')),
  supplier text check (char_length(supplier) <= 120),
  doc_no text check (char_length(doc_no) <= 60),
  total numeric(12, 2),
  handled_at timestamptz,
  handled_note text check (char_length(handled_note) <= 500)
);
create index if not exists ar_documents_received on public.ar_documents (received_at desc);
alter table public.ar_doc_chats enable row level security;
alter table public.ar_documents enable row level security;
create policy "Owner ar doc chats" on public.ar_doc_chats for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
create policy "Owner ar documents" on public.ar_documents for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
create policy "Owner uploads documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'ar-inbox' and name like 'docs/%' and auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
