-- 202611141600_ar_store_edits (owner 2026-11-14: «تنزل لي كل الصور … وتعمل لي اوبشن تعديل لما الاقي مشكله فيها … اضيف صوره
-- تانية او احذف الصوره الغلط» + «كل صنف يبقى تحتيه بيان عنه»; applied only after his «ا»)
-- The store site shows every photo we found and a description under each item. The owner (or a staff member with
-- «storeorders») fixes an item from the site itself: another photo, no photo, his own description, or no description.
--   ar_store_edits: one row per fixed item; everyone reads it (the site is public), only the owner / storeorders write it.
--   ar-store-img: public bucket for the photos he picks; written only by the function asker-store-img (service key).
-- Rollback: drop table public.ar_store_edits; delete from storage.objects where bucket_id = 'ar-store-img';
--   delete from storage.buckets where id = 'ar-store-img';

create table if not exists public.ar_store_edits (
  item_id bigint primary key,
  img text check (img is null or img ~ '^e/[0-9]{1,12}-[0-9a-f]{8,32}\.(jpg|png|webp)$'),
  img_off boolean not null default false,
  descr jsonb check (descr is null or (jsonb_typeof(descr) = 'object' and octet_length(descr::text) <= 4000)),
  desc_off boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.ar_store_edits enable row level security;

drop policy if exists "Everyone reads ar store edits" on public.ar_store_edits;
create policy "Everyone reads ar store edits" on public.ar_store_edits for select to anon, authenticated using (true);
drop policy if exists "Owner ar store edits" on public.ar_store_edits;
create policy "Owner ar store edits" on public.ar_store_edits for all to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Staff all ar_store_edits" on public.ar_store_edits;
create policy "Staff all ar_store_edits" on public.ar_store_edits for all to authenticated
  using ((select public.ar_staff_can(array['storeorders']))) with check ((select public.ar_staff_can(array['storeorders'])));

revoke all on public.ar_store_edits from anon;
grant select on public.ar_store_edits to anon;
grant select, insert, update, delete on public.ar_store_edits to authenticated;

-- a staff member's fixes show under his name in «النشاط» (same trigger as the other tables)
drop trigger if exists ar_log_staff on public.ar_store_edits;
create trigger ar_log_staff after insert or update or delete on public.ar_store_edits for each row execute function public.ar_log_staff();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ar-store-img', 'ar-store-img', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
