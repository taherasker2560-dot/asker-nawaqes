-- ASKER bot: when a photo is already stored but has no ar_inbox row, the function asks when it was stored. Stored
-- minutes ago = the owner deleted it from the page (the phone still re-sends the newest photos): not read again.
-- Older = an old copy (read again, as before). Read-only, for the function's service role only.
-- Rollback: drop function public.ar_inbox_file_at(text);
create or replace function public.ar_inbox_file_at(p text) returns timestamptz
  language sql stable security definer set search_path = ''
  as $$ select created_at from storage.objects where bucket_id = 'ar-inbox' and name = p $$;
revoke all on function public.ar_inbox_file_at(text) from public, anon, authenticated;
grant execute on function public.ar_inbox_file_at(text) to service_role;
