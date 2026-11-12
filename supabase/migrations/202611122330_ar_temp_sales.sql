-- 202611122330_ar_temp_sales (owner «ماشي» 2026-11-12 on the screen; applied only after his «ا»)
-- ASKER: «البيع المؤقت». At rush hour the owner records a sale in the bot in seconds (by the PharmaFly sticker's barcode, the
-- item's name or its code); later, when it is quiet, the sales are entered into PharmaFly (by hand, or by Claude on his order).
--   ar_temp_sales: one row per temp sale. The phone makes the id, so a sale saved twice (no internet, then again) stays one
--   row. items = [{c: PharmaFly item code, n: name, q: quantity, u: 'pack' | 'unit', p: price of one at that time}].
--   customer_id null = cash (نقدي). status: pending (مستنية) -> entered (اتدخلت في فارمافلاي, with its invoice number when
--   known) or cancelled.
-- Owner only. Nothing here writes to PharmaFly.
-- Rollback: drop table public.ar_temp_sales;
create table if not exists public.ar_temp_sales (
  id uuid primary key,
  no bigint generated always as identity,
  sold_at timestamptz not null,
  customer_id bigint,
  customer_name text check (customer_name is null or char_length(customer_name) <= 120),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 60),
  total numeric(12,2) not null default 0 check (total >= 0),
  paid numeric(12,2) check (paid is null or paid >= 0),
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'entered', 'cancelled')),
  entered_ticket bigint,
  entered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ar_temp_sales_status on public.ar_temp_sales (status, sold_at desc);
alter table public.ar_temp_sales enable row level security;
drop policy if exists "Owner ar temp sales" on public.ar_temp_sales;
create policy "Owner ar temp sales" on public.ar_temp_sales for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
