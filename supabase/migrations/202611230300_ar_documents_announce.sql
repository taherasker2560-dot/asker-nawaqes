-- 202611230300_ar_documents_announce (needs the owner's approval on the phone)
-- Owner 2026-11-17 (the training period): «أول ما الصور تيجي تنبهني». Until 11-23 a Claude task on the laptop checked every 10 minutes
-- and opened a whole conversation each time (483 of them, ~300 MB of memory a run). Owner 11-23: «عاوزين نخفف الحمل عالرامات باى حاجه
-- شغاله تلقائى فى شغلنا ملهاش لازمه». Now the server does it by itself, with no laptop and no Claude:
--   ar_documents.announced_at = when the owner's phones were told about this photo (null = not yet);
--   pg_cron 'ar-docs-tick' every 5 minutes → function asker-chat {action:'docs'}: the 'new' photos not told yet → marked, one push to
--   the owner's phones (08:00–23:59 Cairo; a night photo at 08:00); the phone's worker asks «what» and shows «وصلت N صور فواتير».
-- Everything already in the table was told by the old task (checked 11-23 02:5x: 1 row, from 11-21), so it is marked told now.
-- Rollback: select cron.unschedule('ar-docs-tick'); drop index if exists public.ar_documents_untold; alter table public.ar_documents drop column if exists announced_at;

alter table public.ar_documents add column if not exists announced_at timestamptz;
update public.ar_documents set announced_at = now() where announced_at is null;
create index if not exists ar_documents_untold on public.ar_documents (received_at) where announced_at is null and status = 'new';

select cron.unschedule(jobid) from cron.job where jobname = 'ar-docs-tick';
select cron.schedule('ar-docs-tick', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://qwrzdjdgvanmhaicncuk.supabase.co/functions/v1/asker-chat',
    body := '{"action":"docs"}'::jsonb,
    headers := '{"Content-Type":"application/json","Origin":"https://taherasker2560-dot.github.io"}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);
