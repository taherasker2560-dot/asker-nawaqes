-- 202611150100_ar_adam (NOT applied yet: needs the owner's approval on the phone)
-- ASKER: «آدم», the owner's hands-free voice assistant (owner 2026-11-14: «لما اقول ادم هو ينتبه، فاقول له على الحاجه يجيبها … ولا
-- مايك ولا ما مايكش، حتى لو الشاشه مضلمه ومقفوله» / «يفهم كلامي زي ما سعادتك بتفهمه» / «عايزه يتحكم في البوت … يتحكم بدالي»).
-- The phone app (Android, adam-android/) hears the word offline, turns the request into text and puts it in a queue here. The
-- laptop's Claude Code (Hub\adam\ADAM_WORKER.ps1, on the owner's own subscription) takes the oldest waiting request, answers
-- and writes the reply back; the phone speaks it. Nobody but the owner's own devices can use it: every call carries a device
-- key (64 hex), only its sha256 is stored here (ar_adam_keys), exactly like the inbox keys.
--   ar_adam_keys      : key_hash, role 'phone' (asks and reads the answer) or 'laptop' (takes requests, answers, does the confirmed
--                       changes). The owner manages the rows; nothing else reads them.
--   ar_adam_requests  : one row per thing the owner said (or «أيوه» / «لا»); reply = what Adam says, shows and does.
--   ar_adam_state     : when the laptop last asked for work (the phone says «اللاب مقفول» when it did not for 90 seconds).
-- THE GATE: anything that sends to someone or changes an account never runs from the brain's own say-so. The brain only
-- PROPOSES it (reply.confirm = what Adam will say and do). The phone speaks it and waits for the owner's «أيوه»; only that
-- spoken answer creates a confirm request (ar_adam_ask with p_confirm_of, once, within 5 minutes), and ar_adam_do refuses any
-- change that is not tied to such a request. PharmaFly is never written (no function here touches it).
-- Rollback: drop function public.ar_adam_ask(text, text, text, bigint, text); drop function public.ar_adam_get(text, bigint);
--   drop function public.ar_adam_claim(text); drop function public.ar_adam_answer(text, bigint, boolean, jsonb);
--   drop function public.ar_adam_do(text, bigint, text, jsonb); drop function public.ar_adam_role(text);
--   drop table public.ar_adam_requests; drop table public.ar_adam_state; drop table public.ar_adam_keys;

create table if not exists public.ar_adam_keys (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  role text not null check (role in ('phone', 'laptop')),
  label text,
  created_at timestamptz not null default now()
);
alter table public.ar_adam_keys enable row level security;
drop policy if exists "Owner all ar adam keys" on public.ar_adam_keys;
create policy "Owner all ar adam keys" on public.ar_adam_keys for all to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create table if not exists public.ar_adam_requests (
  id bigint generated always as identity primary key,
  convo text not null check (char_length(convo) between 1 and 64),
  body text not null check (char_length(body) between 1 and 1500),
  confirm_of bigint references public.ar_adam_requests (id) on delete set null,
  answer text check (answer in ('yes', 'no')),
  status text not null default 'new' check (status in ('new', 'working', 'done', 'error')),
  reply jsonb,
  tries int not null default 0,
  created_at timestamptz not null default now(),
  picked_at timestamptz,
  done_at timestamptz,
  confirmed_at timestamptz
);
create index if not exists ar_adam_requests_status_id on public.ar_adam_requests (status, id);
create index if not exists ar_adam_requests_convo_id on public.ar_adam_requests (convo, id desc);
create index if not exists ar_adam_requests_created on public.ar_adam_requests (created_at);
create unique index if not exists ar_adam_requests_one_confirm on public.ar_adam_requests (confirm_of) where confirm_of is not null;
alter table public.ar_adam_requests enable row level security;
drop policy if exists "Owner all ar adam requests" on public.ar_adam_requests;
create policy "Owner all ar adam requests" on public.ar_adam_requests for all to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create table if not exists public.ar_adam_state (
  id int primary key check (id = 1),
  laptop_seen_at timestamptz
);
alter table public.ar_adam_state enable row level security;
drop policy if exists "Owner reads ar adam state" on public.ar_adam_state;
create policy "Owner reads ar adam state" on public.ar_adam_state for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

-- the role of a device key ('phone' / 'laptop'), or null; internal: not callable from outside
create or replace function public.ar_adam_role(p_key text)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select k.role from public.ar_adam_keys k
   where p_key is not null and p_key ~ '^[0-9a-f]{64}$'
     and k.key_hash = encode(sha256(convert_to(p_key, 'utf8')), 'hex');
$function$;
revoke all on function public.ar_adam_role(text) from public;
revoke all on function public.ar_adam_role(text) from anon;
revoke all on function public.ar_adam_role(text) from authenticated;

-- the phone: a new request (what the owner said), or his answer to a confirmation (p_confirm_of = the request that asked,
-- p_answer = 'yes' / 'no'). Returns {ok, id, laptop_ok}.
create or replace function public.ar_adam_ask(p_key text, p_convo text, p_body text, p_confirm_of bigint default null, p_answer text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint; v_orig record; v_laptop boolean;
begin
  if public.ar_adam_role(p_key) is distinct from 'phone' then return jsonb_build_object('ok', false, 'error', 'key'); end if;
  if p_convo is null or char_length(p_convo) not between 1 and 64 then return jsonb_build_object('ok', false, 'error', 'convo'); end if;
  if p_body is null or char_length(btrim(p_body)) = 0 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if (select count(*) from public.ar_adam_requests r where r.created_at > now() - interval '1 minute') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'rate');
  end if;
  select (s.laptop_seen_at > now() - interval '90 seconds') into v_laptop from public.ar_adam_state s where s.id = 1;
  if p_confirm_of is not null then
    if p_answer is null or p_answer not in ('yes', 'no') then return jsonb_build_object('ok', false, 'error', 'answer'); end if;
    select r.id, r.convo, r.status, r.reply, r.done_at into v_orig from public.ar_adam_requests r where r.id = p_confirm_of;
    if v_orig.id is null or v_orig.convo <> p_convo or v_orig.status <> 'done' or jsonb_typeof(v_orig.reply -> 'confirm') is distinct from 'object'
       or v_orig.done_at < now() - interval '5 minutes' or exists (select 1 from public.ar_adam_requests c where c.confirm_of = p_confirm_of) then
      return jsonb_build_object('ok', false, 'error', 'no_pending');
    end if;
    if p_answer = 'no' then
      insert into public.ar_adam_requests (convo, body, confirm_of, answer, status, reply, picked_at, done_at)
      values (p_convo, left(p_body, 1500), p_confirm_of, 'no', 'done', jsonb_build_object('speak', 'تمام، ماعملتش حاجة', 'show', 'اتلغى'), now(), now())
      returning id into v_id;
    else
      insert into public.ar_adam_requests (convo, body, confirm_of, answer, confirmed_at)
      values (p_convo, left(p_body, 1500), p_confirm_of, 'yes', now())
      returning id into v_id;
    end if;
  else
    insert into public.ar_adam_requests (convo, body) values (p_convo, left(btrim(p_body), 1500)) returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'laptop_ok', coalesce(v_laptop, false));
end $function$;

-- the phone: where a request stands
create or replace function public.ar_adam_get(p_key text, p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_r record; v_laptop boolean;
begin
  if public.ar_adam_role(p_key) is distinct from 'phone' then return jsonb_build_object('ok', false, 'error', 'key'); end if;
  select r.status, r.reply into v_r from public.ar_adam_requests r where r.id = p_id and r.created_at > now() - interval '1 day';
  select (s.laptop_seen_at > now() - interval '90 seconds') into v_laptop from public.ar_adam_state s where s.id = 1;
  if v_r.status is null then return jsonb_build_object('ok', false, 'error', 'none'); end if;
  return jsonb_build_object('ok', true, 'status', v_r.status, 'reply', v_r.reply, 'laptop_ok', coalesce(v_laptop, false));
end $function$;

-- the laptop: «I am here» + the oldest waiting request (null when none). A request that stayed «working» for 4 minutes goes
-- back to the queue once, then ends with an apology; one that waited 3 hours (the laptop was off) ends quietly.
create or replace function public.ar_adam_claim(p_key text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_r record; v_hist jsonb; v_confirm jsonb;
begin
  if public.ar_adam_role(p_key) is distinct from 'laptop' then return jsonb_build_object('ok', false, 'error', 'key'); end if;
  -- «I am here»: written at most every 20 seconds (the laptop asks every 2 seconds)
  insert into public.ar_adam_state (id, laptop_seen_at) values (1, now())
  on conflict (id) do update set laptop_seen_at = excluded.laptop_seen_at where public.ar_adam_state.laptop_seen_at < now() - interval '20 seconds';
  update public.ar_adam_requests set status = 'new', picked_at = null where status = 'working' and picked_at < now() - interval '4 minutes' and tries < 2;
  update public.ar_adam_requests set status = 'error', done_at = now(),
         reply = jsonb_build_object('speak', 'حصلت مشكلة عندي، جرّب تاني', 'show', 'حصلت مشكلة عندي، جرّب تاني')
   where status = 'working' and picked_at < now() - interval '4 minutes' and tries >= 2;
  update public.ar_adam_requests set status = 'error', done_at = now(),
         reply = jsonb_build_object('speak', 'الطلب ده اتأخر كتير، اسألني تاني', 'show', 'الطلب اتأخر', 'late', true)
   where status = 'new' and created_at < now() - interval '3 hours';
  delete from public.ar_adam_requests where id in (select x.id from public.ar_adam_requests x where x.created_at < now() - interval '7 days' limit 50);
  select r.id, r.convo, r.body, r.confirm_of, r.answer into v_r
    from public.ar_adam_requests r where r.status = 'new' order by r.id limit 1 for update skip locked;
  if v_r.id is null then return null; end if;
  update public.ar_adam_requests set status = 'working', picked_at = now(), tries = tries + 1 where id = v_r.id;
  select coalesce(jsonb_agg(jsonb_build_object('q', h.body, 'speak', h.reply ->> 'speak', 'show', h.reply ->> 'show') order by h.id), '[]'::jsonb) into v_hist
    from (select x.id, x.body, x.reply from public.ar_adam_requests x
           where x.convo = v_r.convo and x.id < v_r.id and x.status = 'done' and x.confirm_of is null and x.created_at > now() - interval '30 minutes'
           order by x.id desc limit 6) h;
  if v_r.confirm_of is not null then
    select o.reply -> 'confirm' into v_confirm from public.ar_adam_requests o where o.id = v_r.confirm_of;
  end if;
  return jsonb_build_object('ok', true, 'id', v_r.id, 'convo', v_r.convo, 'body', v_r.body, 'confirm_of', v_r.confirm_of,
                            'answer', v_r.answer, 'confirm', v_confirm, 'history', v_hist);
end $function$;

-- the laptop: the reply (or the failure) of a request it took
create or replace function public.ar_adam_answer(p_key text, p_id bigint, p_ok boolean, p_reply jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_n int;
begin
  if public.ar_adam_role(p_key) is distinct from 'laptop' then return jsonb_build_object('ok', false, 'error', 'key'); end if;
  update public.ar_adam_requests set status = case when coalesce(p_ok, false) then 'done' else 'error' end, reply = p_reply, done_at = now()
   where id = p_id and status = 'working';
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n = 1);
end $function$;

-- the laptop: a change to the bot's own data, ONLY for a request the owner confirmed by voice (a confirm request with
-- answer 'yes', being worked on now). What exists: stop / allow a customer's credit (the same rows the bot's buttons write).
create or replace function public.ar_adam_do(p_key text, p_request bigint, p_action text, p_args jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_req record; v_cust bigint;
begin
  if public.ar_adam_role(p_key) is distinct from 'laptop' then return jsonb_build_object('ok', false, 'error', 'key'); end if;
  select r.id into v_req from public.ar_adam_requests r
   where r.id = p_request and r.status = 'working' and r.answer = 'yes' and r.confirm_of is not null and r.confirmed_at is not null
     and r.confirmed_at > now() - interval '10 minutes';
  if v_req.id is null then return jsonb_build_object('ok', false, 'error', 'not_confirmed'); end if;
  if p_action in ('stop_credit', 'allow_credit') then
    begin
      v_cust := (p_args ->> 'customer_id')::bigint;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'customer');
    end;
    if v_cust is null or not exists (select 1 from public.ar_customers c where c.id = v_cust) then return jsonb_build_object('ok', false, 'error', 'no_customer'); end if;
    if p_action = 'stop_credit' then
      insert into public.ar_customer_stops (customer_id) values (v_cust) on conflict (customer_id) do nothing;
    else
      delete from public.ar_customer_stops where customer_id = v_cust;
    end if;
    return jsonb_build_object('ok', true, 'action', p_action, 'customer_id', v_cust);
  end if;
  return jsonb_build_object('ok', false, 'error', 'unknown_action');
end $function$;

do $$
declare f text;
begin
  foreach f in array array['ar_adam_ask(text, text, text, bigint, text)', 'ar_adam_get(text, bigint)', 'ar_adam_claim(text)',
                           'ar_adam_answer(text, bigint, boolean, jsonb)', 'ar_adam_do(text, bigint, text, jsonb)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
