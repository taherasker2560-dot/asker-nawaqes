-- ASKER trial bot: the owner's supplier companies and their WhatsApp numbers, so a list shared from WhatsApp is
-- read "باسم الشركة" and the ready message opens that company's chat. New table only; owner-only RLS.
-- Rollback: drop table public.ar_suppliers;
create table if not exists public.ar_suppliers (
  name text primary key check (char_length(name) between 2 and 80),
  phone text check (phone is null or phone ~ '^[0-9]{8,15}$'),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.ar_suppliers enable row level security;
create policy "Owner ar suppliers" on public.ar_suppliers for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
