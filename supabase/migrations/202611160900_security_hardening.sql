-- 2026-11-16 security hardening: PROPOSED, NOT APPLIED. Needs the owner's OK on the plan first.
-- Review: D:\pharmayaqez\SECURITY_REVIEW_2026-11-16.md. After his OK this becomes a migration in the bot repo
-- (supabase/migrations/202611161200_security_hardening.sql), goes through a PR + CI, and is applied from Manual mode on his phone.
-- Every statement is additive or a revoke; the rollback of each is written beside it.

-- 1) The anonymous role keeps SELECT on the ONE public table only. Today it holds every privilege on 67 tables and RLS alone
--    stops it (verified: a stranger gets rows from ar_store_edits only). A table without these grants is also not listed in
--    the public API description, and a future table no longer starts open to strangers.
revoke all on all tables in schema public from anon;
grant select on public.ar_store_edits to anon;            -- policy «Everyone reads ar store edits» (public by design)
revoke all on all sequences in schema public from anon;   -- anonymous writes go through SECURITY DEFINER functions, which do not need them
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
-- rollback: grant all on all tables in schema public to anon;  grant usage, select on all sequences in schema public to anon;
--           alter default privileges for role postgres in schema public grant all on tables to anon;

-- 2) Trigger functions are not meant to be called through the API (a trigger fires without the caller's EXECUTE right).
revoke execute on function public.ar_customer_phones_max() from public, anon, authenticated;
revoke execute on function public.ar_log_staff() from public, anon, authenticated;
-- rollback: grant execute on function public.ar_customer_phones_max() to public, anon, authenticated; (same for ar_log_staff)

-- 3) One flood limit for ALL visitors together, like ar_chats already has (30 chats / 10 minutes): store orders.
--    The per-phone limit (5 an hour) is beaten by changing the phone number. Normal days have a handful of orders.
create or replace function public.ar_store_orders_flood() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.ar_store_orders o where o.created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'busy' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.ar_store_orders_flood() from public, anon, authenticated;
drop trigger if exists ar_store_orders_flood on public.ar_store_orders;
create trigger ar_store_orders_flood before insert on public.ar_store_orders for each row execute function public.ar_store_orders_flood();
-- rollback: drop trigger ar_store_orders_flood on public.ar_store_orders; drop function public.ar_store_orders_flood();

-- 4) The same for anonymous uploads (customer chat files and prescription photos): 60 / 10 minutes together for chat files,
--    30 / 10 minutes for prescriptions. The count runs in a SECURITY DEFINER helper because an anonymous caller cannot read
--    storage.objects, so a count inside the policy would always see zero.
create or replace function public.ar_recent_uploads(p_bucket text) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from storage.objects o where o.bucket_id = p_bucket and o.created_at > now() - interval '10 minutes';
$$;
revoke execute on function public.ar_recent_uploads(text) from public;
grant execute on function public.ar_recent_uploads(text) to anon, authenticated;

drop policy if exists "Anyone uploads chat files" on storage.objects;
create policy "Anyone uploads chat files" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'ar-chat'
              and name ~ '^c/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|wav|pdf|xlsx|xls)$'
              and public.ar_recent_uploads('ar-chat') < 60);

drop policy if exists "Anyone uploads store prescriptions" on storage.objects;
create policy "Anyone uploads store prescriptions" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'ar-store-rx'
              and name ~ '^rx/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{20,40}\.(jpg|png|webp|heic|pdf)$'
              and public.ar_recent_uploads('ar-store-rx') < 30);
-- rollback: recreate both policies without the last condition (their text is above), then drop function public.ar_recent_uploads(text).

-- NOT in this migration (owner decisions):
--   * Authentication -> Sign In / Providers -> «Allow new users to sign up» OFF: a dashboard switch, only he can press it.
--     Staff accounts are made by the asker-staff function through the admin API, so it keeps working.
--   * Dropping the three old backup tables (ar_inbox_backup_20261029, ar_shortages_active_before_20261030, ar_shortages_backup_20261104,
--     0.7 MB in all): harmless, and the nightly backup holds the database; drop them only on his word.
