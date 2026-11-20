-- 202611201700_ar_vendor_contacts (NOT applied yet: needs the owner's approval on the phone)
-- Owner 2026-11-20 («خليهم ٣ ارقام: تليسيلز هنطلب منه، موزع هنبعتله بيان مرتجعات، محاسب نبعتله كشف حساب ونحدث منه قايمة المخزن»; mockup mockups\vendor_numbers_2026-11-20.png):
-- up to three numbers for each supplier company (a PharmaFly card in ar_vendors), one per job:
--   telesales   : the missing-item request («طلب مش موجود») and the orders are sent to him;
--   distributor : the returns statement (كشف المرتجعات) is sent to him;
--   accountant  : the account statement (the link to the company's own page) is sent to him, and the warehouse list is updated from him.
-- The numbers are picked from the owner's number book (ar_contacts) in «الحسابات ← الموردين»; the page opens WhatsApp on the number with the message ready, he presses send.
-- OWNER ONLY (nobody else reads or writes it); nothing here is sent.
-- Rollback: drop table public.ar_vendor_contacts;

create table if not exists public.ar_vendor_contacts (
  vendor_id bigint not null,
  role text not null check (role in ('telesales', 'distributor', 'accountant')),
  phone text not null check (phone ~ '^[0-9]{8,15}$'),
  name text check (name is null or char_length(name) <= 120),
  updated_at timestamptz not null default now(),
  primary key (vendor_id, role)
);
alter table public.ar_vendor_contacts enable row level security;
drop policy if exists "Owner ar vendor contacts" on public.ar_vendor_contacts;
create policy "Owner ar vendor contacts" on public.ar_vendor_contacts for all to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
revoke all on public.ar_vendor_contacts from anon;
grant select, insert, update, delete on public.ar_vendor_contacts to authenticated;
