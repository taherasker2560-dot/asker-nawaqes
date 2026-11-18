-- 202611182330_ar_account_push (NOT applied yet: needs the owner's approval on the phone)
-- ASKER: «🔔 تنبيه حركة الحساب» (owner 2026-11-18: «نضيف عند العميل تنبيهات لحركة الحساب، مش بس إشعارات تنبيه بالصوت»; then «أيوه، ابدأ» to «الإشعار يقول: فيه حركة جديدة على حسابك من غير
-- مبالغ»). A credit customer who turns it on gets a phone notification whenever the pharmacy's system brings a NEW movement of his account (a sale or a payment: the laptop sync runs about
-- every 10 minutes). The push carries NOTHING (the same way as the chat's and the dose alarm's): the notification always says «فيه حركة جديدة على حسابك», never an amount or a name.
--   ar_account_push       : one row per phone that turned it on: its push address, the customer it belongs to, and the time of the latest movement already notified (or already there when it
--                           subscribed: the old movements never notify). Closed table (nobody reads it from outside).
--   ar_account_push_save  : the customer's page (his own link, the OWNER of the account only: a person of his house is refused with 'not_owner') turns it on / off for this phone.
--   ar_account_push_due   : the timer's function (service role only): the addresses whose customer has a movement newer than the last one notified; they are marked, so one batch of
--                           movements gives one notification.
--   cron «ar-account-tick»: every 5 minutes calls the function asker-account-push (action tick), which sends the empty push (a dead address, 404/410, is dropped).
-- Nothing existing is changed or dropped. Rollback: select cron.unschedule('ar-account-tick'); drop function public.ar_account_push_due(); drop function public.ar_account_push_save(text, text, boolean);
--   drop table public.ar_account_push;

create table if not exists public.ar_account_push (
  endpoint text primary key check (char_length(endpoint) between 20 and 700 and endpoint ~ '^https://'),
  customer_id bigint not null,
  last_at timestamp without time zone,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ar_account_push_customer on public.ar_account_push (customer_id);
alter table public.ar_account_push enable row level security;

-- the page: turn it on (p_on true) or off (false) for this phone, with the customer's own link (the owner's: the people of his house have a link too, and are refused)
create or replace function public.ar_account_push_save(p_token text, p_endpoint text, p_on boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint;
  v_last timestamp without time zone;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  if p_endpoint is null or char_length(p_endpoint) not between 20 and 700 or p_endpoint !~ '^https://' then return jsonb_build_object('ok', false, 'error', 'endpoint'); end if;
  select l.customer_id into v_id from public.ar_customer_links l where l.token = p_token;
  if v_id is null then
    if exists (select 1 from public.ar_customer_members m where m.token = p_token) then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
    return jsonb_build_object('ok', false, 'error', 'link');
  end if;
  if coalesce(p_on, true) is false then
    delete from public.ar_account_push where endpoint = p_endpoint and customer_id = v_id;
    return jsonb_build_object('ok', true, 'on', false);
  end if;
  if not exists (select 1 from public.ar_account_push where endpoint = p_endpoint) then
    if (select count(*) from public.ar_account_push where customer_id = v_id) >= 10 then return jsonb_build_object('ok', false, 'error', 'max'); end if;
    if (select count(*) from public.ar_account_push) >= 20000 then return jsonb_build_object('ok', false, 'error', 'full'); end if;
  end if;
  select max(m.at) into v_last from public.ar_customer_moves m where m.customer_id = v_id;
  insert into public.ar_account_push as t (endpoint, customer_id, last_at) values (p_endpoint, v_id, v_last)
  on conflict (endpoint) do update
    set customer_id = excluded.customer_id, updated_at = now(),
        last_at = case when t.customer_id = excluded.customer_id then t.last_at else excluded.last_at end;
  return jsonb_build_object('ok', true, 'on', true);
end $function$;
revoke all on function public.ar_account_push_save(text, text, boolean) from public;
grant execute on function public.ar_account_push_save(text, text, boolean) to anon, authenticated;

-- the timer (service role only): the addresses whose customer has a movement newer than the last one notified; marked as notified (so a second call sends nothing)
create or replace function public.ar_account_push_due()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_out jsonb;
begin
  with latest as (
    select c.customer_id, (select max(m.at) from public.ar_customer_moves m where m.customer_id = c.customer_id) as max_at
      from (select distinct customer_id from public.ar_account_push) c
  ), due as (
    update public.ar_account_push p set last_at = l.max_at, updated_at = now()
      from latest l
     where l.customer_id = p.customer_id and l.max_at is not null and (p.last_at is null or l.max_at > p.last_at)
    returning p.endpoint
  )
  select coalesce(jsonb_agg(endpoint), '[]'::jsonb) into v_out from due;
  return v_out;
end $function$;
revoke all on function public.ar_account_push_due() from public;
revoke all on function public.ar_account_push_due() from anon;
revoke all on function public.ar_account_push_due() from authenticated;
grant execute on function public.ar_account_push_due() to service_role;

-- every 5 minutes: the function sends the nudges (the same way the dose alarm's minute timer is called)
do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'ar-account-tick') then perform cron.unschedule('ar-account-tick'); end if;
  perform cron.schedule('ar-account-tick', '*/5 * * * *', $job$
    select net.http_post(
      url := 'https://qwrzdjdgvanmhaicncuk.supabase.co/functions/v1/asker-account-push',
      body := '{"action":"tick"}'::jsonb,
      headers := '{"Content-Type":"application/json","Origin":"https://taherasker2560-dot.github.io"}'::jsonb,
      timeout_milliseconds := 20000
    );
  $job$);
end $cron$;
