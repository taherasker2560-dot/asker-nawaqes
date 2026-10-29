-- ASKER bot: the items the owner ordered today («اتطلب»). When the page opens a company's message in WhatsApp, each
-- item in it gets a row here. Those items are left out of the next company's message the same day, shown as «اتطلب»,
-- and not said again by the phone when another company sends them. The owner can undo a mark (the row is deleted).
-- Keyed by the product name (name_key, like ar_names), so a new shortage file does not lose them.
-- New table only; owner-only RLS; the function reads it with the service role.
-- Rollback: drop table public.ar_orders;
create table if not exists public.ar_orders (
  id uuid primary key default gen_random_uuid(),
  name_key text not null check (char_length(name_key) between 1 and 250),
  product_name text not null check (char_length(product_name) between 1 and 250),
  supplier text check (supplier is null or char_length(supplier) between 1 and 80),
  ordered_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists ar_orders_ordered_at on public.ar_orders (ordered_at desc);
alter table public.ar_orders enable row level security;
create policy "Owner ar orders" on public.ar_orders for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
