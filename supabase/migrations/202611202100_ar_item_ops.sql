-- 202611202100_ar_item_ops (NOT applied yet: needs the owner's approval on the phone)
-- Owner 2026-11-20 («زرار في كارت الصنف في البحث ادوس عليه يفتحلي قايمة عمليات اعملها عالصنف بعدين تتنفذ بالريموت على السيستم … جرد وطباعة باركود»; mockup mockups\item_card_actions_2026-11-20.png):
-- an operation chosen on an item from the search card waits here (status pending) until the LAPTOP carries it out on PharmaFly's own screens (a later phase: each screen is taught once and watched the first
-- times). Phase 1 only RECORDS it and lists it in «الحسابات ← العمليات», where a pending one can be cancelled. Nothing here writes to PharmaFly or prints.
--   kind 'barcode' = print qty labels (1 to 500) of the item's sticker barcode. (A count is not here: it is an ar_count_entries row, the existing count screen opened on the item.) More kinds come later.
-- OWNER ONLY (nobody else reads or writes it). The laptop takes the pending ones through the same database login it uses for its other jobs.
-- Rollback: drop table public.ar_item_ops;

create table if not exists public.ar_item_ops (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('barcode')),
  item_id bigint not null,
  item_name text check (item_name is null or char_length(item_name) <= 200),
  qty int not null default 1 check (qty between 1 and 500),
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'cancelled')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists ar_item_ops_status on public.ar_item_ops (status, created_at desc);
alter table public.ar_item_ops enable row level security;
drop policy if exists "Owner all ar item ops" on public.ar_item_ops;
create policy "Owner all ar item ops" on public.ar_item_ops for all to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
revoke all on public.ar_item_ops from anon;
grant select, insert, update, delete on public.ar_item_ops to authenticated;
