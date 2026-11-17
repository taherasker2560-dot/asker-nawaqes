-- 202611180100_ar_customer_alarms (NOT applied yet: needs the owner's approval on the phone)
-- ASKER, owner 2026-11-18: «أنا الصفحة اللي بشوف فيها صفحة العميل زي ما بيشوفها، أقدر أتحكم في المنبه. لو هو مش عارف يظبط المنبه هظبطه له أنا من عندي».
-- The customer's own alarms stay on his phone (stage 1, no server). The ones the PHARMACY sets for him are kept here, so they reach his phone:
--   ar_customer_alarms           : one row per customer, the alarms the pharmacy set for him: [{id, name, say, times:['08:00',...], on}]. Closed table (RPCs only).
--   ar_alarm_items_clean(jsonb)  : the one place that cleans a list (at most 20 alarms, names up to 80 characters, valid HH:MM times, no duplicates).
--   ar_customer_alarms_view      : the customer's own page asks by his link secret (the same secret as ar_customer_view): only HIS rows.
--   ar_customer_alarms_admin_get / _set : the owner, or staff with the customers permission (the «👁 شوف صفحته» look), by the customer's link secret.
-- Nothing existing is changed or dropped. Rollback: drop the three functions and the helper, then drop table public.ar_customer_alarms.

create table if not exists public.ar_customer_alarms (
  customer_id bigint primary key,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.ar_customer_alarms enable row level security;

create or replace function public.ar_alarm_items_clean(p_items jsonb)
returns jsonb
language sql
immutable
set search_path to ''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'say', e.say, 'times', e.times, 'on', e.is_on) order by e.ord), '[]'::jsonb)
    from (select a.ord, a.x->>'id' as id, left(btrim(a.x->>'name'), 80) as name, left(btrim(coalesce(a.x->>'say', '')), 80) as say,
                 case when (a.x->>'on') in ('true', 'false') then (a.x->>'on')::boolean else true end as is_on,
                 (select coalesce(jsonb_agg(s.t order by s.t), '[]'::jsonb)
                    from (select distinct t from jsonb_array_elements_text(case when jsonb_typeof(a.x->'times') = 'array' then a.x->'times' else '[]'::jsonb end) as t
                           where t ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') s) as times
            from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) with ordinality as a(x, ord)
           where jsonb_typeof(a.x) = 'object' and (a.x->>'id') ~ '^[A-Za-z0-9_-]{1,40}$' and btrim(coalesce(a.x->>'name', '')) <> ''
           order by a.ord limit 20) e
   where jsonb_array_length(e.times) > 0
$function$;

-- the customer's page: the alarms the pharmacy set for him (by his link secret)
create or replace function public.ar_customer_alarms_view(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint; v_items jsonb; v_at timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select l.customer_id into v_id from public.ar_customer_links l where l.token = p_token;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select a.items, a.updated_at into v_items, v_at from public.ar_customer_alarms a where a.customer_id = v_id;
  return jsonb_build_object('ok', true, 'items', coalesce(v_items, '[]'::jsonb), 'at', v_at);
end $function$;
revoke all on function public.ar_customer_alarms_view(text) from public;
grant execute on function public.ar_customer_alarms_view(text) to anon, authenticated;

-- the owner (or staff with «العملاء»): read and replace the alarms for the customer whose link secret is given
create or replace function public.ar_customer_alarms_admin_get(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint; v_items jsonb;
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid and not (select public.ar_staff_can(array['customers']::text[])) then
    raise exception 'owner or staff only' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select l.customer_id into v_id from public.ar_customer_links l where l.token = p_token;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select a.items into v_items from public.ar_customer_alarms a where a.customer_id = v_id;
  return jsonb_build_object('ok', true, 'items', coalesce(v_items, '[]'::jsonb));
end $function$;
revoke all on function public.ar_customer_alarms_admin_get(text) from public;
revoke all on function public.ar_customer_alarms_admin_get(text) from anon;
grant execute on function public.ar_customer_alarms_admin_get(text) to authenticated;

create or replace function public.ar_customer_alarms_admin_set(p_token text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint; v_items jsonb;
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid and not (select public.ar_staff_can(array['customers']::text[])) then
    raise exception 'owner or staff only' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select l.customer_id into v_id from public.ar_customer_links l where l.token = p_token;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  v_items := public.ar_alarm_items_clean(p_items);
  if jsonb_array_length(v_items) = 0 then
    delete from public.ar_customer_alarms where customer_id = v_id;
  else
    insert into public.ar_customer_alarms (customer_id, items, updated_by) values (v_id, v_items, (select auth.uid()))
    on conflict (customer_id) do update set items = excluded.items, updated_at = now(), updated_by = excluded.updated_by;
  end if;
  return jsonb_build_object('ok', true, 'items', v_items);
end $function$;
revoke all on function public.ar_customer_alarms_admin_set(text, jsonb) from public;
revoke all on function public.ar_customer_alarms_admin_set(text, jsonb) from anon;
grant execute on function public.ar_customer_alarms_admin_set(text, jsonb) to authenticated;
