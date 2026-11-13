-- 202611132100_ar_customer_links (NOT applied yet: needs the owner's approval on the phone)
-- ASKER: a personal link for every credit customer (owner 2026-11-13, IDEAS row 1: «رابط نبعته للعملاء يبقى عنده القدرة إن
-- هو يخش على حسابه بس هو لوحده … ولما وقوف يظهر له إن هو موقوف، وفي نفس الوقت يبقى يقدر يطلب من المخزن بتاعنا أو يطلب حاجات
-- نجيبها له»). His answers: the account and ordering together («ج»); «موقوف» = his own button for now («ج مؤقتا»); a stopped
-- customer orders cash only («ب»); the others choose on account or cash («ب»); the full statement with the items («أ»).
--   ar_customer_links : one secret per customer (64 hex). The link is store.html#me=<secret>. «رابط جديد» replaces it and the
--                       old one stops at once. Only the owner reads it (to send the same link again).
--   ar_customer_stops : a row = the owner stopped this customer's credit («وقّف الآجل»); deleting the row = «رجّع الآجل».
--   ar_store_orders   : + customer_id and pay ('account' | 'cash') for an order placed from a customer's link.
--   ar_customer_view(secret, before…)  : that customer's own account and statement, nothing else.
--   ar_customer_place_order(secret, …) : an order from the link (the store's own checks and prices), on account only when
--                                        the customer is not stopped.
--   ar_customer_link(customer, new)    : the owner gets the customer's secret (made the first time, or a new one).
-- Rollback: drop function public.ar_customer_place_order(text, text, text, text, jsonb, text[], text);
--   drop function public.ar_customer_view(text, timestamp, bigint, int); drop function public.ar_customer_link(bigint, boolean);
--   alter table public.ar_store_orders drop constraint if exists ar_store_orders_pay_check;
--   alter table public.ar_store_orders drop column if exists pay, drop column if exists customer_id;
--   drop table public.ar_customer_stops; drop table public.ar_customer_links;

create table if not exists public.ar_customer_links (
  customer_id bigint primary key,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  seen_count int not null default 0 check (seen_count >= 0)
);
alter table public.ar_customer_links enable row level security;
drop policy if exists "Owner reads ar customer links" on public.ar_customer_links;
create policy "Owner reads ar customer links" on public.ar_customer_links for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create table if not exists public.ar_customer_stops (
  customer_id bigint primary key,
  stopped_at timestamptz not null default now(),
  stopped_by uuid default auth.uid()
);
alter table public.ar_customer_stops enable row level security;
drop policy if exists "Owner all ar customer stops" on public.ar_customer_stops;
create policy "Owner all ar customer stops" on public.ar_customer_stops for all to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
-- staff see who is stopped (the customers' list, «البيع المؤقت» on credit, the site's orders); only the owner stops
drop policy if exists "Staff select ar_customer_stops" on public.ar_customer_stops;
create policy "Staff select ar_customer_stops" on public.ar_customer_stops for select to authenticated
  using ((select public.ar_staff_can(array['customers', 'credit', 'tempsale', 'storeorders']::text[])));

alter table public.ar_store_orders add column if not exists customer_id bigint;
alter table public.ar_store_orders add column if not exists pay text;
alter table public.ar_store_orders drop constraint if exists ar_store_orders_pay_check;
alter table public.ar_store_orders add constraint ar_store_orders_pay_check check (pay is null or pay in ('account', 'cash'));

-- the owner: the customer's secret (the same one each time, or a new one when p_new; the old one stops working)
create or replace function public.ar_customer_link(p_customer bigint, p_new boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text;
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ar_customers c where c.id = p_customer) then
    return jsonb_build_object('ok', false, 'error', 'no_customer');
  end if;
  select l.token into v_token from public.ar_customer_links l where l.customer_id = p_customer;
  if v_token is null or coalesce(p_new, false) then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.ar_customer_links (customer_id, token) values (p_customer, v_token)
    on conflict (customer_id) do update set token = excluded.token, created_at = now(), last_seen_at = null, seen_count = 0;
  end if;
  return jsonb_build_object('ok', true, 'token', v_token);
end $function$;
revoke all on function public.ar_customer_link(bigint, boolean) from public;
revoke all on function public.ar_customer_link(bigint, boolean) from anon;
grant execute on function public.ar_customer_link(bigint, boolean) to authenticated;

-- the customer's page: his account and his statement (newest first, p_limit movements a call, older ones with p_before_*)
create or replace function public.ar_customer_view(p_token text, p_before_at timestamp default null, p_before_id bigint default null, p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint; v_name text; v_balance numeric; v_moves jsonb; v_n int; v_month jsonb; v_data timestamptz; v_phone text;
  v_lim int := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_start timestamp := date_trunc('month', now() at time zone 'Africa/Cairo');
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select c.id, c.name, c.balance into v_id, v_name, v_balance
    from public.ar_customer_links l join public.ar_customers c on c.id = l.customer_id
   where l.token = p_token;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'at', m.at, 'kind', m.kind, 'total', m.total, 'paid', m.paid,
                                               'balance', m.balance, 'items', m.items) order by m.at desc, m.id desc), '[]'::jsonb),
         count(*)
    into v_moves, v_n
    from (select x.id, x.at, x.kind, x.total, x.paid, x.balance, x.items from public.ar_customer_moves x
           where x.customer_id = v_id
             and (p_before_at is null or (x.at, x.id) < (p_before_at, coalesce(p_before_id, 9223372036854775807)))
           order by x.at desc, x.id desc
           limit v_lim) m;

  if p_before_at is null then
    -- the first page: when he opened it (for the owner), this month's sums, when the data came, his saved number
    update public.ar_customer_links set last_seen_at = now(), seen_count = seen_count + 1
     where customer_id = v_id and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
    select jsonb_build_object('bought', coalesce(sum(m.total) filter (where m.kind in ('sale', 'return')), 0),
                              'paid', coalesce(sum(m.paid), 0))
      into v_month
      from public.ar_customer_moves m where m.customer_id = v_id and m.at >= v_start;
    select s.at into v_data from public.ar_sync_log s order by s.id desc limit 1;
    select p.phone into v_phone from public.ar_customer_phones p where p.customer_id = v_id order by p.updated_at limit 1;
  end if;

  return jsonb_build_object('ok', true,
    'customer', jsonb_build_object('id', v_id, 'name', v_name, 'balance', v_balance),
    'stopped', exists (select 1 from public.ar_customer_stops s where s.customer_id = v_id),
    'month', v_month, 'data_at', v_data, 'phone', v_phone,
    'moves', v_moves, 'more', v_n = v_lim);
end $function$;
revoke all on function public.ar_customer_view(text, timestamp, bigint, int) from public;
grant execute on function public.ar_customer_view(text, timestamp, bigint, int) to anon, authenticated;

-- an order from the customer's link: the store's own function does every check and price; then the order is marked with
-- the customer and how he pays. On account only when he is not stopped (the page shows «كاش بس» too).
create or replace function public.ar_customer_place_order(p_token text, p_phone text, p_address text, p_notes text, p_items jsonb, p_rx text[] default null::text[], p_pay text default 'account')
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint; v_name text; v_res jsonb; v_pay text := coalesce(p_pay, 'account');
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select c.id, c.name into v_id, v_name
    from public.ar_customer_links l join public.ar_customers c on c.id = l.customer_id
   where l.token = p_token;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  if v_pay not in ('account', 'cash') then return jsonb_build_object('ok', false, 'error', 'bad_pay'); end if;
  if v_pay = 'account' and exists (select 1 from public.ar_customer_stops s where s.customer_id = v_id) then
    return jsonb_build_object('ok', false, 'error', 'stopped');
  end if;
  v_res := public.ar_store_place_order(v_name, p_phone, p_address, p_notes, p_items, p_rx);
  if coalesce((v_res->>'ok')::boolean, false) then
    update public.ar_store_orders set customer_id = v_id, pay = v_pay where id = (v_res->>'order_id')::bigint;
  end if;
  return v_res || jsonb_build_object('pay', v_pay);
end $function$;
revoke all on function public.ar_customer_place_order(text, text, text, text, jsonb, text[], text) from public;
grant execute on function public.ar_customer_place_order(text, text, text, text, jsonb, text[], text) to anon, authenticated;
