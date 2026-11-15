-- 202611150600_ar_po_items (owner 2026-11-15: «الامر الشراء ده انا بعمله للبوت نفسه، عشان البوت بعد كده هياخد امر الشراء ده ويحلله ويشوف
-- هيبعت كل صنف منه لاي مورد … هو اللي بيختار مش انا»; plan approved «أيوه، ابدأ»; applied only after his OK on his phone)
-- ASKER «أمر الشرا»: in «المشتريات ← نواقص ← الحقائب» he ticks what he wants to buy and presses «🛒 أمر شراء»; each item is one open
-- line here. The laptop's order advisor (Hub\orders\BUILD_ORDER_DRAFTS.ps1) reads the open lines (read only) and builds «الطلبيات»
-- from them ONLY, choosing the supplier of each item itself (best discount, the 11-09 rules). Nothing here writes to PharmaFly and
-- nothing is sent: sending stays his tap in «الطلبيات». 'ordered' is for the next step (what was really ordered, checked against the
-- next day's invoice). Owner only.
-- Rollback: drop table public.ar_po_items;

create table if not exists public.ar_po_items (
  id bigint generated always as identity primary key,
  item_id bigint not null check (item_id > 0),
  item_name text check (item_name is null or char_length(item_name) <= 200),
  -- the bag it was in when he ordered it (a PharmaFly bag id, 'pv' = «نواقص كل الشركات», 'gs' = «النواقص العامة»)
  bag text check (bag is null or bag ~ '^(pv|gs|[0-9]{1,12})$'),
  qty numeric(10, 2) not null default 1 check (qty > 0 and qty <= 100000),
  -- the item's numbers when ordered (stock, a month's sales, minimum, need, last purchase)
  item jsonb check (item is null or (jsonb_typeof(item) = 'object' and pg_column_size(item) <= 2000)),
  status text not null default 'open' check (status in ('open', 'ordered', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);
-- an item is once in the open purchase order
create unique index if not exists ar_po_items_one_open on public.ar_po_items (item_id) where status = 'open';
create index if not exists ar_po_items_recent on public.ar_po_items (created_at desc);

alter table public.ar_po_items enable row level security;
drop policy if exists "Owner all ar po items" on public.ar_po_items;
create policy "Owner all ar po items" on public.ar_po_items for all to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
grant select, insert, update on public.ar_po_items to authenticated;
