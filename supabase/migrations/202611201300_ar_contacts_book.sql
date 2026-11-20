-- 202611201300_ar_contacts_book (NOT applied yet: needs the owner's approval on the phone)
-- Owner 2026-11-20 («اكتب الرقم يظهر الاسم لو متسجل … او اكتب الاسم يتملا الرقم الاتنين سوا … ويتبنيله سجل طلبات»; mockup mockups\waitlist_contacts_2026-11-20.png): the numbers of
-- his phone's contacts as a book inside the system, for the «📝 طلب مش موجود» form of the waiting list: type a number and the name appears (when it is in the book), type a name and the
-- number fills, and every request keeps building the customer's history by his number (ar_waitlist already has it). OWNER ONLY: nobody else reads, searches or writes it; nothing here is sent.
--   ar_contacts : phone (01xxxxxxxxx for an Egyptian mobile, otherwise the digits as they are, 8 to 15), name, kind (cash = a customer who pays cash, saved as «عميل …» with the drug beside it;
--                 account = a customer with an account; other), last_item (the drug written beside a cash customer's name in his phone: an old request, shown as «قديم»),
--                 source (google = the 2026-11-20 import of his Google contacts, typed = added from the form).
-- Rollback: drop table public.ar_contacts;

create table if not exists public.ar_contacts (
  phone text primary key check (phone ~ '^[0-9]{8,15}$'),
  name text not null check (char_length(name) between 1 and 120),
  kind text not null default 'other' check (kind in ('cash', 'account', 'other')),
  last_item text check (last_item is null or char_length(last_item) <= 200),
  source text not null default 'google' check (source in ('google', 'typed')),
  updated_at timestamptz not null default now()
);
create index if not exists ar_contacts_kind on public.ar_contacts (kind);
alter table public.ar_contacts enable row level security;
drop policy if exists "Owner ar contacts" on public.ar_contacts;
create policy "Owner ar contacts" on public.ar_contacts for all to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
revoke all on public.ar_contacts from anon;
grant select, insert, update, delete on public.ar_contacts to authenticated;
