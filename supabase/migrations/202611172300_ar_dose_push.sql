-- 202611172300_ar_dose_push (NOT applied yet: needs the owner's approval on the phone)
-- ASKER: «⏰ منبه الدوا» stage 2 (owner 2026-11-17: «زر منبه مواعيد الأدوية … ينطق بالصوت»; the same night: «انجز»). Stage 1 rings while the page is open on the customer's phone;
-- this makes the phone get a NOTIFICATION at each dose time even when the browser is closed: a tap opens the page, which rings and says the medicine's name (store/alarm.js).
--   ar_dose_push       : one row per phone that turned the notifications on: its push address and the TIMES OF DAY of its alarms ('08:00', '20:00': Cairo time).
--                        NO medicine name, NO customer, NO account: the server only knows «this phone wants a nudge at 08:00». Closed table (nobody reads it from outside).
--   ar_dose_save       : the customer's page saves its times (visitors and customers alike, like the chat's push address); an empty list removes the phone.
--   ar_dose_due        : the minute timer's function (service role only) takes the addresses due at one minute, once per minute (it marks them).
--   cron «ar-dose-tick»: every minute calls the function asker-dose (action tick), which sends an empty web push to those addresses (a dead address, 404/410, is dropped).
-- Nothing existing is changed or dropped. Rollback: select cron.unschedule('ar-dose-tick'); drop function public.ar_dose_due(text, text); drop function public.ar_dose_save(text, text[]);
--   drop table public.ar_dose_push;

create table if not exists public.ar_dose_push (
  endpoint text primary key check (char_length(endpoint) between 20 and 700 and endpoint ~ '^https://'),
  times text[] not null check (cardinality(times) between 1 and 40),
  last_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ar_dose_push enable row level security;

-- the page: this phone's times of day (the server keeps only the clock times)
create or replace function public.ar_dose_save(p_endpoint text, p_times text[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_times text[];
begin
  if p_endpoint is null or char_length(p_endpoint) not between 20 and 700 or p_endpoint !~ '^https://' then return jsonb_build_object('ok', false, 'error', 'endpoint'); end if;
  select coalesce(array_agg(distinct t order by t), '{}'::text[]) into v_times
    from unnest(coalesce(p_times, '{}'::text[])) as t where t ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  if cardinality(v_times) = 0 then
    delete from public.ar_dose_push where endpoint = p_endpoint;
    return jsonb_build_object('ok', true, 'times', 0);
  end if;
  v_times := v_times[1:40];
  if not exists (select 1 from public.ar_dose_push where endpoint = p_endpoint) and (select count(*) from public.ar_dose_push) >= 20000 then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;
  insert into public.ar_dose_push as t (endpoint, times) values (p_endpoint, v_times)
  on conflict (endpoint) do update set times = excluded.times, updated_at = now(), last_key = case when t.times = excluded.times then t.last_key else null end;
  return jsonb_build_object('ok', true, 'times', cardinality(v_times));
end $function$;
revoke all on function public.ar_dose_save(text, text[]) from public;
grant execute on function public.ar_dose_save(text, text[]) to anon, authenticated;

-- the minute timer (service role only): the addresses with a dose at this minute that were not sent for this minute yet; they are marked so a second call in the same minute sends nothing
create or replace function public.ar_dose_due(p_hhmm text, p_key text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_out jsonb;
begin
  if p_hhmm is null or p_hhmm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_key is null or char_length(p_key) > 40 then return '[]'::jsonb; end if;
  with due as (
    update public.ar_dose_push set last_key = p_key
     where p_hhmm = any (times) and last_key is distinct from p_key
    returning endpoint
  )
  select coalesce(jsonb_agg(endpoint), '[]'::jsonb) into v_out from due;
  return v_out;
end $function$;
revoke all on function public.ar_dose_due(text, text) from public;
revoke all on function public.ar_dose_due(text, text) from anon;
revoke all on function public.ar_dose_due(text, text) from authenticated;
grant execute on function public.ar_dose_due(text, text) to service_role;

-- every minute: the function sends the nudges (the same way the chat's night clean-up is called)
do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'ar-dose-tick') then perform cron.unschedule('ar-dose-tick'); end if;
  perform cron.schedule('ar-dose-tick', '* * * * *', $job$
    select net.http_post(
      url := 'https://qwrzdjdgvanmhaicncuk.supabase.co/functions/v1/asker-dose',
      body := '{"action":"tick"}'::jsonb,
      headers := '{"Content-Type":"application/json","Origin":"https://taherasker2560-dot.github.io"}'::jsonb,
      timeout_milliseconds := 20000
    );
  $job$);
end $cron$;
