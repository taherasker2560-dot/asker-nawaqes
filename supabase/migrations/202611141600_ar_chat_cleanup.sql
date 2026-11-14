-- 202611141600_ar_chat_cleanup (NOT applied yet: needs the owner's approval on the phone)
-- ASKER: things are deleted by themselves (owner 2026-11-14 «انت ظبط حوار مسح الرسائل … في حاجات كتيرة المفروض بتتمسح»,
-- his choice «ب: 7 أيام»). The server's free plan has 1 GB for files; a warehouse's camera photo from the link is about 1 MB
-- and was kept twice (the messages page and «الوارد»).
--   * every night at 04:00 Cairo (02:00 UTC) pg_cron asks the function asker-chat «cleanup» (pg_net): messages with their
--     photos / voice notes / files after 7 days; a warehouse's files an hour after they went to «الوارد» (arabic-shortages
--     also removes them as it reads them); the inbox's photos after 30 days. The invoices (ar-inbox docs/) and the customers'
--     statements are never touched. The function deletes only what is past its time, so it needs no key.
--   * ar_chat_delete_message(p_id): the owner deletes one message in «الرسايل» (the bot removes its file first).
-- Rollback: select cron.unschedule('ar-chat-cleanup'); drop function public.ar_chat_delete_message(bigint);
--   (the extensions pg_cron / pg_net may stay; drop extension pg_cron; drop extension pg_net; if nothing else uses them)

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.ar_chat_delete_message(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_n int;
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    raise exception 'owner only' using errcode = '42501';
  end if;
  delete from public.ar_chat_messages where id = p_id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n = 1, 'deleted', v_n);
end $function$;
revoke all on function public.ar_chat_delete_message(bigint) from public;
revoke all on function public.ar_chat_delete_message(bigint) from anon;
grant execute on function public.ar_chat_delete_message(bigint) to authenticated;

-- once a night (applied twice: one job)
select cron.unschedule(jobid) from cron.job where jobname = 'ar-chat-cleanup';
select cron.schedule('ar-chat-cleanup', '0 2 * * *', $job$
  select net.http_post(
    url := 'https://qwrzdjdgvanmhaicncuk.supabase.co/functions/v1/asker-chat',
    body := '{"action":"cleanup"}'::jsonb,
    headers := '{"Content-Type":"application/json","Origin":"https://taherasker2560-dot.github.io"}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
