-- 202611121200_ar_customer_phones_statements (NOT applied yet: the owner said «ا» 2026-11-12 to this plan)
-- ASKER: send a customer's statement on WhatsApp straight to the customer (owner 2026-11-12: «عايز طريقة من جوه البوت يتبعت
-- مباشر … امال انا حاطط الرقم ليه»).
--   ar_customer_phones : the customer's WhatsApp number, picked by the owner from his phone's contacts (or typed). The same
--                        number will identify the customer later (when he asks for his statement).
--   bucket ar-statements: the statement PDFs the bot makes on the phone. Private; the customer gets a signed link (30 days)
--                        inside the WhatsApp message the owner sends.
-- Owner only (names, numbers and what customers bought are private). Nothing here sends a message.
-- Rollback: drop policy "Owner uploads statements" on storage.objects; drop policy "Owner reads statements" on storage.objects;
--           drop policy "Owner deletes statements" on storage.objects; (delete the files, then) delete from storage.buckets
--           where id = 'ar-statements'; drop table public.ar_customer_phones;
create table if not exists public.ar_customer_phones (
  customer_id bigint primary key,
  phone text not null check (phone ~ '^[0-9]{8,15}$'),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  last_sent_at timestamptz,
  last_sent_from timestamp,
  updated_at timestamptz not null default now()
);
create index if not exists ar_customer_phones_phone on public.ar_customer_phones (phone);
alter table public.ar_customer_phones enable row level security;
drop policy if exists "Owner ar customer phones" on public.ar_customer_phones;
create policy "Owner ar customer phones" on public.ar_customer_phones for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ar-statements', 'ar-statements', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
drop policy if exists "Owner uploads statements" on storage.objects;
create policy "Owner uploads statements" on storage.objects for insert to authenticated
  with check (bucket_id = 'ar-statements' and name ~ '^s/[0-9]{4}-[0-9]{2}/[0-9a-f-]{20,40}\.pdf$'
              and auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Owner reads statements" on storage.objects;
create policy "Owner reads statements" on storage.objects for select to authenticated
  using (bucket_id = 'ar-statements' and auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Owner deletes statements" on storage.objects;
create policy "Owner deletes statements" on storage.objects for delete to authenticated
  using (bucket_id = 'ar-statements' and auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
