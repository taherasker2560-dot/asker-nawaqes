-- 202611152300_ar_order_qty (NOT applied yet: the owner said «انا اللي هحدد الكميه بتاعت امر الشراء، وانت تتعلم منها عشان قدام بعد كده
-- تبقى انت ممكن تحط الارقام اللي انا بطلبها على طول» 2026-11-15 and «فتحت لك الموبايل»).
-- ASKER: what the owner typed as the quantity of an item in «الطلبيات ← تعديل الأصناف»: one row per PharmaFly item, the LAST number he
-- chose (qty), the laptop's suggestion at that time (suggested, to see how far apart they are) and the supplier of that order. The
-- orders page starts that item at his number (the box is blue) the next time it appears, in any order.
-- Written by the owner's own sign-in (the page upserts on «change»), read by the owner only. Nothing here touches PharmaFly.
-- Rollback: drop table public.ar_order_qty;
create table if not exists public.ar_order_qty (
  item_id bigint primary key check (item_id > 0),
  item_name text check (item_name is null or char_length(item_name) <= 250),
  qty int not null check (qty between 1 and 100000),
  suggested int check (suggested is null or suggested between 0 and 100000),
  supplier text check (supplier is null or char_length(supplier) <= 40),
  updated_at timestamptz not null default now()
);
alter table public.ar_order_qty enable row level security;
drop policy if exists "Owner reads ar order qty" on public.ar_order_qty;
create policy "Owner reads ar order qty" on public.ar_order_qty for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Owner adds ar order qty" on public.ar_order_qty;
create policy "Owner adds ar order qty" on public.ar_order_qty for insert to authenticated
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Owner changes ar order qty" on public.ar_order_qty;
create policy "Owner changes ar order qty" on public.ar_order_qty for update to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
