-- 202611171900_ar_customer_regular (NOT applied yet: needs the owner's approval on the phone)
-- ASKER: «اللي باخده دايمًا» and «أدويتي المزمنة» on the customer's own page (owner 2026-11-17: «زرارين كده، كل زرار فيهم بيان بالأصناف،
-- واحد بيان بالأصناف اللي العميل بياخدها على الحساب دايما، وزرار تاني بيان بالأصناف بتاعة المزمن وتحذيراتها اللي احنا عاملينها في الصفحة
-- لينا، تبقى باينة عندهم هنا»; he said «ا» to the mockup customer_regular_buttons_2026-11-17.png).
-- The laptop (Hub\chronic\BUILD_CHRONIC.ps1) already finds, for every credit customer, the items he buys again and again at a steady
-- gap (the list «العملاء ← 💊 مزمن ← كل المعتادين»). That list went to the owner only (a private bucket file). Now the same rows
-- are also kept here, so a customer can read HIS OWN rows with his link secret:
--   ar_customer_regular       : one row per customer + item: the item's PharmaFly name, the usual gap in days, how many refills,
--                               the packs last time, the date of the last refill. Closed table: the owner reads it, nobody else.
--   ar_customer_regular_sync  : the laptop replaces the whole list with its sync key (the same key as ar_customers_sync).
--                               An empty list changes nothing (a failed read on the laptop must never wipe the table).
--   ar_customer_regular_view  : the customer's own rows by his link secret (the same secret as ar_customer_view), nothing else:
--                               + the store's Arabic name and «available» for each item. «Late / soon» is worked out on his phone
--                               from the date, so it is right every day without a new upload.
-- Nothing existing is changed or dropped.
-- Rollback: drop function public.ar_customer_regular_view(text); drop function public.ar_customer_regular_sync(text, jsonb);
--           drop table public.ar_customer_regular;

create table if not exists public.ar_customer_regular (
  customer_id bigint not null,
  item_id bigint not null,
  name text not null check (char_length(name) between 1 and 300),
  gap int not null check (gap between 1 and 1000),
  times int not null check (times between 1 and 10000),
  q numeric(10, 2) not null default 0 check (q >= 0),
  last date not null,
  updated_at timestamptz not null default now(),
  primary key (customer_id, item_id)
);
alter table public.ar_customer_regular enable row level security;
drop policy if exists "Owner reads ar customer regular" on public.ar_customer_regular;
create policy "Owner reads ar customer regular" on public.ar_customer_regular for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

-- the laptop: the whole list of the regular items (rows: c = customer id, i = item id, n = name, gap, times, q, last = yyyy-mm-dd)
create or replace function public.ar_customer_regular_sync(p_key text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; v_n int; v_in int := 0; v_gone int := 0;
  v_num text := '^[0-9]{1,8}(\.[0-9]+)?$';
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'rows must be an array'; end if;
  v_n := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  if v_n > 3000 then raise exception 'too many rows (max 3000)'; end if;
  if v_n = 0 then return jsonb_build_object('ok', true, 'rows', 0, 'gone', 0, 'skipped', true); end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_customer_regular_sync'));
  with src as (
    select distinct on (x.c, x.i) x.c, x.i, x.n, x.gap, x.times, x.q, x.last
      from (select (e->>'c')::bigint as c, (e->>'i')::bigint as i, left(btrim(e->>'n'), 300) as n,
                   (e->>'gap')::int as gap, (e->>'times')::int as times,
                   case when (e->>'q') ~ v_num then round((e->>'q')::numeric, 2) else 0 end as q,
                   (e->>'last')::date as last
              from jsonb_array_elements(p_rows) e
             where (e->>'c') ~ '^[0-9]{1,15}$' and (e->>'i') ~ '^[0-9]{1,15}$' and btrim(coalesce(e->>'n', '')) <> ''
               and (e->>'gap') ~ '^[0-9]{1,4}$' and (e->>'times') ~ '^[0-9]{1,5}$' and (e->>'last') ~ '^\d{4}-\d{2}-\d{2}$') x
     where x.gap between 1 and 1000 and x.times between 1 and 10000
     order by x.c, x.i
  ), up as (
    insert into public.ar_customer_regular as t (customer_id, item_id, name, gap, times, q, last, updated_at)
    select s.c, s.i, s.n, s.gap, s.times, s.q, s.last, now() from src s
    on conflict (customer_id, item_id) do update
      set name = excluded.name, gap = excluded.gap, times = excluded.times, q = excluded.q, last = excluded.last, updated_at = now()
    returning 1
  ), del as (
    delete from public.ar_customer_regular d
     where not exists (select 1 from src s where s.c = d.customer_id and s.i = d.item_id)
    returning 1
  )
  select (select count(*) from up), (select count(*) from del) into v_in, v_gone;
  return jsonb_build_object('ok', true, 'rows', v_in, 'gone', v_gone);
end $function$;
revoke all on function public.ar_customer_regular_sync(text, jsonb) from public;
grant execute on function public.ar_customer_regular_sync(text, jsonb) to anon, authenticated;

-- the customer's page: his own regular items (by his link secret), newest refill first
create or replace function public.ar_customer_regular_view(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint; v_rows jsonb; v_at timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select l.customer_id into v_id from public.ar_customer_links l where l.token = p_token;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('i', r.item_id, 'n', r.name, 'ar', nullif(btrim(coalesce(s.arabic_name, '')), ''),
                                               'gap', r.gap, 'times', r.times, 'q', r.q, 'last', r.last,
                                               'avail', coalesce(s.status = 'available', false)) order by r.last desc, r.item_id), '[]'::jsonb),
         max(r.updated_at)
    into v_rows, v_at
    from public.ar_customer_regular r left join public.ar_store_items s on s.id = r.item_id
   where r.customer_id = v_id;
  return jsonb_build_object('ok', true, 'rows', v_rows, 'at', v_at);
end $function$;
revoke all on function public.ar_customer_regular_view(text) from public;
grant execute on function public.ar_customer_regular_view(text) to anon, authenticated;
