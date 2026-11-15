-- 202611150500_ar_bag_moves (owner 2026-11-15: «أعلم عليها، أدوس أختار بمربع كده … وأعمل تحويل يخيرني ما بين الحقائب دي كلها، عشان لو
-- أنا عايز أنقل حاجة من حقيبة لحقيبة»; applied only after his OK on his phone)
-- ASKER «الحقائب»: in «المشتريات ← نواقص ← الحقائب» the owner ticks items and moves them to another bag. A bag is a PharmaFly bag
-- (Items.VendorIDBag, its Cards id as text), 'pv' = «نواقص كل الشركات» (Items.ReOrderVisible = 1) or 'gs' = «النواقص العامة»
-- (Items.ReorderDifficult = 1; his second button, same day: «ارجاع الى النواقص العامة»). Each move is RECORDED here
-- (from_bag = where PharmaFly has the item now); the page shows the item in its new bag at once («⏳ لسه في فارمافلاي») and marks the
-- move done when the laptop's next copy shows the item in that bag. Nothing here writes to PharmaFly: making the moves on PharmaFly's
-- own item card is a later step with its own approval (he will teach it). Owner only.
-- Rollback: drop table public.ar_bag_moves;

create table if not exists public.ar_bag_moves (
  id bigint generated always as identity primary key,
  item_id bigint not null check (item_id > 0),
  item_name text check (item_name is null or char_length(item_name) <= 200),
  from_bag text not null check (from_bag ~ '^(pv|gs|[0-9]{1,12})$'),
  to_bag text not null check (to_bag ~ '^(pv|gs|[0-9]{1,12})$'),
  -- the item's numbers when it was moved (stock, a month's sales, need), so it still shows if it leaves the shortages
  item jsonb check (item is null or (jsonb_typeof(item) = 'object' and pg_column_size(item) <= 2000)),
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz,
  check (to_bag <> from_bag)
);
-- one open move per item: moving it again closes the old one first (the page does it)
create unique index if not exists ar_bag_moves_one_open on public.ar_bag_moves (item_id) where status = 'pending';
create index if not exists ar_bag_moves_recent on public.ar_bag_moves (created_at desc);

alter table public.ar_bag_moves enable row level security;
drop policy if exists "Owner all ar bag moves" on public.ar_bag_moves;
create policy "Owner all ar bag moves" on public.ar_bag_moves for all to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
grant select, insert, update on public.ar_bag_moves to authenticated;
