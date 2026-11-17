-- Store site, owner 2026-11-17: «حسابات العملاء من غير باسورد، لكن الناس اللي هتنزّل الموقع هنعمله بباسورد حتى نعرف عدد المستخدمين»
-- and, to «الحساب إجباري جوه التطبيق»: anyone who opens the INSTALLED app without a customer's link makes an account once (name, mobile, password).
-- Customers keep their link (no password) and are counted apart. The browser site needs no account.
--
--   ar_site_users      : the people (mobile is unique; the password is stored as a bcrypt hash, never the password)
--   ar_site_sessions   : one row per phone that is signed in (only the SHA-256 of the token is kept)
--   ar_site_attempts   : failed sign-ins, to lock a mobile for 15 minutes after 8 failures
--   ar_customer_links.installed_at : first time a customer's link was opened inside the installed app
-- The tables have row security on and NO policy and no grant: nothing reads or writes them except the functions below (security definer).
-- Functions for visitors: ar_site_signup / ar_site_login / ar_site_me / ar_site_logout / ar_site_customer_open.
-- Functions for the owner only: ar_site_users_stats (the numbers + the latest users), ar_site_user_reset (a new temporary password to send on WhatsApp),
-- ar_site_user_delete. A visitor's account never reaches a customer's account (no link between the two).
-- Honest limits: a browser never says when an app is removed («غالبًا شالوه» = not opened for 30 days); the mobile number is not verified by a code (no SMS).

create table if not exists public.ar_site_users (
  id bigserial primary key,
  phone text not null unique check (phone ~ '^01[0125][0-9]{8}$'),
  name text not null check (char_length(name) between 2 and 60),
  pw_hash text not null,
  platform text check (platform in ('android', 'ios', 'desktop', 'other')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  opens int not null default 0 check (opens >= 0),
  installed_at timestamptz,
  pw_changed_at timestamptz
);
create table if not exists public.ar_site_sessions (
  token_hash text primary key,
  user_id bigint not null references public.ar_site_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists ar_site_sessions_user_idx on public.ar_site_sessions (user_id);
create table if not exists public.ar_site_attempts (
  id bigserial primary key,
  phone text not null,
  at timestamptz not null default now()
);
create index if not exists ar_site_attempts_phone_idx on public.ar_site_attempts (phone, at);
alter table public.ar_customer_links add column if not exists installed_at timestamptz;

alter table public.ar_site_users enable row level security;
alter table public.ar_site_sessions enable row level security;
alter table public.ar_site_attempts enable row level security;
revoke all on table public.ar_site_users, public.ar_site_sessions, public.ar_site_attempts from anon, authenticated;
revoke all on sequence public.ar_site_users_id_seq, public.ar_site_attempts_id_seq from anon, authenticated;

-- a mobile number written any way (+20, 0020, spaces) → 01xxxxxxxxx (anything else stays as digits and fails the check)
create or replace function public.ar_site_phone(p text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case when d2 ~ '^1[0125][0-9]{8}$' then '0' || d2 else d2 end
  from (
    select case when d ~ '^0020[0-9]{10}$' then substr(d, 4)
                when d ~ '^20[0-9]{10}$' then substr(d, 3)
                else d end as d2
    from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) a
  ) b
$function$;

create or replace function public.ar_site_platform(p text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case when p in ('android', 'ios', 'desktop', 'other') then p else null end
$function$;

create or replace function public.ar_site_new_session(p_user bigint)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.ar_site_sessions (token_hash, user_id)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_user);
  return v_token;
end $function$;
revoke all on function public.ar_site_new_session(bigint) from public, anon, authenticated;

create or replace function public.ar_site_signup(p_name text, p_phone text, p_password text, p_platform text default null, p_standalone boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_phone text := public.ar_site_phone(p_phone);
  v_name text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 60);
  v_id bigint;
begin
  if char_length(v_name) < 2 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  if v_phone !~ '^01[0125][0-9]{8}$' then return jsonb_build_object('ok', false, 'error', 'bad_phone'); end if;
  if char_length(coalesce(p_password, '')) < 6 or octet_length(p_password) > 72 then
    return jsonb_build_object('ok', false, 'error', 'bad_password');
  end if;
  -- a flood of made-up accounts: at most 100 new ones an hour
  if (select count(*) from public.ar_site_users where created_at > now() - interval '1 hour') >= 100 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  if exists (select 1 from public.ar_site_users where phone = v_phone) then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end if;
  insert into public.ar_site_users (phone, name, pw_hash, platform, last_seen_at, opens, installed_at)
  values (v_phone, v_name, extensions.crypt(p_password, extensions.gen_salt('bf', 8)), public.ar_site_platform(p_platform), now(), 1,
          case when coalesce(p_standalone, false) then now() end)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'token', public.ar_site_new_session(v_id),
                            'user', jsonb_build_object('id', v_id, 'name', v_name, 'phone', v_phone));
end $function$;

create or replace function public.ar_site_login(p_phone text, p_password text, p_platform text default null, p_standalone boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_phone text := public.ar_site_phone(p_phone);
  u public.ar_site_users%rowtype;
begin
  if v_phone !~ '^01[0125][0-9]{8}$' then return jsonb_build_object('ok', false, 'error', 'bad'); end if;
  if (select count(*) from public.ar_site_attempts where phone = v_phone and at > now() - interval '15 minutes') >= 8 then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  select * into u from public.ar_site_users where phone = v_phone;
  -- the same answer for a wrong password and for a mobile with no account
  if not found or u.pw_hash is distinct from extensions.crypt(coalesce(p_password, ''), u.pw_hash) then
    delete from public.ar_site_attempts where at < now() - interval '1 day';
    insert into public.ar_site_attempts (phone) values (v_phone);
    return jsonb_build_object('ok', false, 'error', 'bad');
  end if;
  delete from public.ar_site_attempts where phone = v_phone;
  update public.ar_site_users
     set last_seen_at = now(), opens = opens + 1, platform = coalesce(public.ar_site_platform(p_platform), platform),
         installed_at = case when coalesce(p_standalone, false) and installed_at is null then now() else installed_at end
   where id = u.id;
  return jsonb_build_object('ok', true, 'token', public.ar_site_new_session(u.id),
                            'user', jsonb_build_object('id', u.id, 'name', u.name, 'phone', u.phone));
end $function$;

-- every time the site opens with a saved session: valid or not, and the «opened» / «installed» marks (an open counts once per 30 minutes)
create or replace function public.ar_site_me(p_token text, p_event text default 'open', p_platform text default null, p_standalone boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_hash text := encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  v_uid bigint;
  u public.ar_site_users%rowtype;
begin
  select s.user_id into v_uid from public.ar_site_sessions s where s.token_hash = v_hash;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  update public.ar_site_sessions set last_seen_at = now() where token_hash = v_hash;
  update public.ar_site_users
     set opens = opens + case when last_seen_at is null or last_seen_at < now() - interval '30 minutes' then 1 else 0 end,
         last_seen_at = now(),
         platform = coalesce(public.ar_site_platform(p_platform), platform),
         installed_at = case when (coalesce(p_standalone, false) or p_event = 'installed') and installed_at is null then now() else installed_at end
   where id = v_uid
  returning * into u;
  return jsonb_build_object('ok', true, 'user', jsonb_build_object('id', u.id, 'name', u.name, 'phone', u.phone));
end $function$;

create or replace function public.ar_site_logout(p_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  delete from public.ar_site_sessions where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  return jsonb_build_object('ok', true);
end $function$;

-- a customer's link opened inside the installed app (customers have no password: the link is the key)
create or replace function public.ar_site_customer_open(p_token text, p_standalone boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if coalesce(p_standalone, false) and p_token ~ '^[0-9a-f]{64}$' then
    update public.ar_customer_links set installed_at = now() where token = p_token and installed_at is null;
  end if;
  return jsonb_build_object('ok', true);
end $function$;

-- the owner: the numbers and the latest users
create or replace function public.ar_site_users_stats()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_users jsonb;
  v_customers jsonb;
  v_recent jsonb;
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    raise exception 'owner only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'total', count(*),
    'today', count(*) filter (where (created_at at time zone 'Africa/Cairo')::date = v_today),
    'last7', count(*) filter (where created_at > now() - interval '7 days'),
    'opened_today', count(*) filter (where (last_seen_at at time zone 'Africa/Cairo')::date = v_today),
    'opened7', count(*) filter (where last_seen_at > now() - interval '7 days'),
    'installed', count(*) filter (where installed_at is not null),
    'removed', count(*) filter (where installed_at is not null and (last_seen_at is null or last_seen_at < now() - interval '30 days')),
    'android', count(*) filter (where platform = 'android'),
    'ios', count(*) filter (where platform = 'ios'))
    into v_users from public.ar_site_users;
  select jsonb_build_object(
    'opened', count(*) filter (where last_seen_at is not null),
    'installed', count(*) filter (where installed_at is not null))
    into v_customers from public.ar_customer_links;
  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_recent from (
    select id, name, phone, platform, created_at, last_seen_at, installed_at
      from public.ar_site_users order by greatest(created_at, coalesce(last_seen_at, created_at)) desc limit 30) r;
  return jsonb_build_object('ok', true, 'users', v_users, 'customers', v_customers, 'recent', v_recent);
end $function$;

-- «نسيت الباسورد»: the owner gives a new temporary 6-digit one (he sends it on WhatsApp); the phone is signed out
create or replace function public.ar_site_user_reset(p_user bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_pw text := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    raise exception 'owner only' using errcode = '42501';
  end if;
  update public.ar_site_users set pw_hash = extensions.crypt(v_pw, extensions.gen_salt('bf', 8)), pw_changed_at = now() where id = p_user;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_user'); end if;
  delete from public.ar_site_sessions where user_id = p_user;
  delete from public.ar_site_attempts where phone = (select phone from public.ar_site_users where id = p_user);
  return jsonb_build_object('ok', true, 'password', v_pw);
end $function$;

create or replace function public.ar_site_user_delete(p_user bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    raise exception 'owner only' using errcode = '42501';
  end if;
  delete from public.ar_site_users where id = p_user;
  return jsonb_build_object('ok', found);
end $function$;

revoke all on function public.ar_site_signup(text, text, text, text, boolean), public.ar_site_login(text, text, text, boolean),
  public.ar_site_me(text, text, text, boolean), public.ar_site_logout(text), public.ar_site_customer_open(text, boolean),
  public.ar_site_users_stats(), public.ar_site_user_reset(bigint), public.ar_site_user_delete(bigint) from public;
grant execute on function public.ar_site_signup(text, text, text, text, boolean), public.ar_site_login(text, text, text, boolean),
  public.ar_site_me(text, text, text, boolean), public.ar_site_logout(text), public.ar_site_customer_open(text, boolean) to anon, authenticated;
grant execute on function public.ar_site_users_stats(), public.ar_site_user_reset(bigint), public.ar_site_user_delete(bigint) to authenticated;
