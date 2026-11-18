-- «👥 المستخدمين» (owner 2026-11-18: «ليه مش مخليني أشوف الناس اللي بتسجل في الموقع، والناس اللي بتنزل الأبليكيشن، والناس اللي بتنزل الموقع … وأبقى شايف
-- لما يطلعوا أو يشيلوا الموقع أو يشيلوا الأبليكيشن»; he approved the mockup with «ا»).
-- ONE owner-only list of every person who uses the site or the apps: the credit customers by their link, the people of their houses, the site accounts. For each:
-- when the link was sent / the account made, the last open and how many, whether he installed the site, whether his phone has «منبه الدوا», and the hard sign of
-- a removal. A browser never says when an app is removed, so the page shows «غالبًا شاله» from the last open; the only hard signs we can get are:
--   * a push address the push service no longer knows (404/410) for a person's chat: asker-chat writes it into ar_push_gone (chat id + time);
--   * «منبه الدوا» (alarm-android) saying «I am here» once a day through ar_app_ping (an anonymous random id: how many phones have it, how many stopped).
-- «منبه الدوا» on a person's phone: the site knows it (the app opened from its button: store/alarm.js keeps asker_dose_app = 1) and tells the server through
-- ar_app_seen with the person's own secret (a customer's or member's link, or a site account's session); at most once per 12 hours per person.
-- Rollback: drop function public.ar_people_list(); drop function public.ar_app_seen(text, text); drop function public.ar_app_ping(text, text);
--   drop table public.ar_app_installs; drop table public.ar_push_gone;
--   alter table public.ar_customer_links drop column app_at; alter table public.ar_customer_members drop column app_at; alter table public.ar_site_users drop column app_at;

alter table public.ar_customer_links add column if not exists app_at timestamptz;
alter table public.ar_customer_members add column if not exists app_at timestamptz;
alter table public.ar_site_users add column if not exists app_at timestamptz;

-- «منبه الدوا» phones (no person: a random id the app makes on its first run)
create table if not exists public.ar_app_installs (
  id text primary key check (id ~ '^[0-9a-f]{32}$'),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  pings integer not null default 1 check (pings >= 1),
  version text check (version is null or char_length(version) <= 20)
);
alter table public.ar_app_installs enable row level security;
revoke all on table public.ar_app_installs from anon, authenticated;

-- a person's push address that died (the push service answered 404/410): written by asker-chat with the service key
create table if not exists public.ar_push_gone (
  id bigint generated always as identity primary key,
  chat_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists ar_push_gone_chat on public.ar_push_gone (chat_id, at desc);
alter table public.ar_push_gone enable row level security;
revoke all on table public.ar_push_gone from anon, authenticated;

-- the app: «I am here» (anyone may call it: it only keeps a random id and a time; at most 300 new phones an hour, one update per phone per 30 minutes)
create or replace function public.ar_app_ping(p_id text, p_version text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_new integer;
  v_version text := nullif(left(btrim(coalesce(p_version, '')), 20), '');
begin
  if p_id is null or p_id !~ '^[0-9a-f]{32}$' then return jsonb_build_object('ok', false, 'error', 'id'); end if;
  if exists (select 1 from public.ar_app_installs where id = p_id) then
    update public.ar_app_installs set last_at = now(), pings = pings + 1, version = coalesce(v_version, version)
     where id = p_id and last_at < now() - interval '30 minutes';
    return jsonb_build_object('ok', true);
  end if;
  select count(*) into v_new from public.ar_app_installs where first_at > now() - interval '1 hour';
  if v_new >= 300 then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  insert into public.ar_app_installs (id, version) values (p_id, v_version) on conflict (id) do nothing;
  return jsonb_build_object('ok', true);
end $function$;

-- the site: «this person's phone has «منبه الدوا»» (his own secret only; nothing else changes)
create or replace function public.ar_app_seen(p_token text default null, p_site_token text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  r record;
  v_uid bigint;
begin
  if p_token is not null and p_token ~ '^[0-9a-f]{64}$' then
    select * into r from public.ar_member_resolve(p_token) limit 1;
    if r.customer_id is not null then
      if r.member_id is not null then
        update public.ar_customer_members set app_at = now() where id = r.member_id and (app_at is null or app_at < now() - interval '12 hours');
      else
        update public.ar_customer_links set app_at = now() where customer_id = r.customer_id and (app_at is null or app_at < now() - interval '12 hours');
      end if;
      return jsonb_build_object('ok', true);
    end if;
  end if;
  if p_site_token is not null and p_site_token ~ '^[0-9a-f]{64}$' then
    select s.user_id into v_uid from public.ar_site_sessions s where s.token_hash = encode(sha256(convert_to(p_site_token, 'UTF8')), 'hex');
    if v_uid is not null then
      update public.ar_site_users set app_at = now() where id = v_uid and (app_at is null or app_at < now() - interval '12 hours');
      return jsonb_build_object('ok', true);
    end if;
  end if;
  return jsonb_build_object('ok', false, 'error', 'who');
end $function$;

-- the owner's list (owner only, like ar_site_users_stats): every person, newest open first; and the anonymous «منبه الدوا» phones
create or replace function public.ar_people_list()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_people jsonb;
  v_apps jsonb;
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    raise exception 'owner only' using errcode = '42501';
  end if;
  with gone as (
    select chat_id, max(at) as at from public.ar_push_gone group by chat_id
  ), people as (
    select 'customer'::text as kind, l.customer_id as id, c.name, ph.phone, null::text as platform, null::text as of_name,
           l.created_at as since_at, l.last_seen_at, l.seen_count as opens, l.installed_at, l.app_at,
           (select max(g.at) from public.ar_chats ch join gone g on g.chat_id = ch.id where ch.customer_id = l.customer_id and ch.member_id is null) as push_gone_at
      from public.ar_customer_links l
      left join public.ar_customers c on c.id = l.customer_id
      left join lateral (select p.phone from public.ar_customer_phones p where p.customer_id = l.customer_id order by p.updated_at desc nulls last limit 1) ph on true
    union all
    select 'member', m.id, m.name, null, null, c.name, m.created_at, m.last_seen_at, m.seen_count, null, m.app_at,
           (select max(g.at) from public.ar_chats ch join gone g on g.chat_id = ch.id where ch.member_id = m.id)
      from public.ar_customer_members m
      left join public.ar_customers c on c.id = m.customer_id
    union all
    select 'site', u.id, u.name, u.phone, u.platform, null, u.created_at, u.last_seen_at, u.opens, u.installed_at, u.app_at, null
      from public.ar_site_users u
  )
  select coalesce(jsonb_agg(to_jsonb(p) order by p.last_seen_at desc nulls last, p.since_at desc), '[]'::jsonb)
    into v_people
    from (select * from people order by last_seen_at desc nulls last, since_at desc limit 3000) p;
  select jsonb_build_object(
      'total', count(*),
      'active7', count(*) filter (where last_at > now() - interval '7 days'),
      'silent3', count(*) filter (where last_at <= now() - interval '3 days'))
    into v_apps from public.ar_app_installs;
  return jsonb_build_object('ok', true, 'people', v_people, 'apps', v_apps, 'at', now());
end $function$;

revoke all on function public.ar_app_ping(text, text), public.ar_app_seen(text, text), public.ar_people_list() from public;
revoke all on function public.ar_app_ping(text, text), public.ar_app_seen(text, text), public.ar_people_list() from anon, authenticated;
grant execute on function public.ar_app_ping(text, text), public.ar_app_seen(text, text) to anon, authenticated;
grant execute on function public.ar_people_list() to authenticated;
