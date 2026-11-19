-- 202611190500_ar_waitlist (NOT applied yet: needs the owner's approval on the phone)
-- Owner 2026-11-19 (he explained his own routine, mockup mockups\waitlist_2026-11-19.png, then «ايوة»): when a customer asks for a medicine the pharmacy does not
-- have, he messages a supplier at once so he does not forget, takes the customer's number and writes the drug's name next to it; when the medicine arrives (he is entering
-- the purchase invoices) he puts it on the «waiting» shelf and calls the customers after the invoices; what a customer does not take he may have to return to the supplier
-- (slow mover, expensive for customers, short expiry) or keep: one month to return to a warehouse, one week to a distribution center. He decides; the system keeps the list.
--   ar_waitlist      : one row per customer request: the item (item_id = PharmaFly's item when it is one the system knows, else only the typed name), the customer's phone
--                      (01xxxxxxxxx) and name, the quantity, the supplier asked (vendor_id, from ar_vendors). status:
--                        waiting    asked from the supplier, not here yet
--                        arrived    here (found by the stock list, or «وصل» by hand): on the waiting shelf, the customer is to be called; called_at = he called / wrote
--                        delivered  the customer took it            returned  sent back to the supplier       kept  he keeps it in the pharmacy       cancelled
--                      stock_at_request = the stock (in boxes) at the moment of the request: the item counts as arrived when the stock list shows MORE than that.
--                      return_days = 30 (warehouse) or 7 (distribution center) from the supplier's kind, fixed when it arrives (null = the supplier's kind is not set yet).
--   ar_vendor_kinds  : the owner says once per supplier: warehouse or distribution center.
--   Functions (owner only; nobody else reads or writes; nothing here writes to PharmaFly or sends a message):
--     ar_waitlist_add(item, name, phone, customer name, qty, supplier)  ar_waitlist_set(id, action, supplier)  ar_waitlist_vendor_kind(supplier, kind)  ar_waitlist_overview()
--   ar_waitlist_overview() first marks as arrived what the stock list now shows, then returns: waiting, «call these» (arrived, not called), the leftovers («قرار الرجوع») with
--   what he needs to decide (sold in the last year in boxes, price, nearest expiry in stock, days left to return) and the suppliers with their kind. It does NOT label an item
--   «slow» or «expensive»: the numbers are shown, the decision stays his; only «expiry under 18 months» (his own rule of the short-dated report) is flagged.
-- Rollback: drop function public.ar_waitlist_overview(); drop function public.ar_waitlist_vendor_kind(bigint, text); drop function public.ar_waitlist_set(bigint, text, bigint);
--   drop function public.ar_waitlist_add(bigint, text, text, text, numeric, bigint); drop function public.ar_waitlist_return_days(bigint); drop function public.ar_waitlist_boxes(bigint);
--   drop function public.ar_waitlist_owner(); drop table public.ar_waitlist; drop table public.ar_vendor_kinds;

create table if not exists public.ar_vendor_kinds (
  vendor_id bigint primary key,
  kind text not null check (kind in ('warehouse', 'center')),
  updated_at timestamptz not null default now()
);
alter table public.ar_vendor_kinds enable row level security;
drop policy if exists "Owner reads ar vendor kinds" on public.ar_vendor_kinds;
create policy "Owner reads ar vendor kinds" on public.ar_vendor_kinds for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create table if not exists public.ar_waitlist (
  id bigint generated always as identity primary key,
  item_id bigint,
  item_name text not null check (char_length(item_name) between 2 and 200),
  phone text not null check (phone ~ '^01[0-9]{9}$'),
  customer_name text check (customer_name is null or char_length(customer_name) <= 80),
  qty numeric(8, 2) not null default 1 check (qty > 0 and qty <= 999),
  vendor_id bigint,
  vendor_name text check (vendor_name is null or char_length(vendor_name) <= 160),
  status text not null default 'waiting' check (status in ('waiting', 'arrived', 'delivered', 'returned', 'kept', 'cancelled')),
  stock_at_request numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  arrived_at timestamptz,
  arrived_by text check (arrived_by is null or arrived_by in ('stock', 'manual')),
  called_at timestamptz,
  return_days int check (return_days is null or return_days between 1 and 365),
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists ar_waitlist_open on public.ar_waitlist (status, created_at desc);
alter table public.ar_waitlist enable row level security;
drop policy if exists "Owner reads ar waitlist" on public.ar_waitlist;
create policy "Owner reads ar waitlist" on public.ar_waitlist for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create or replace function public.ar_waitlist_owner()
returns void
language plpgsql
stable
set search_path to ''
as $function$
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then raise exception 'owner only' using errcode = '42501'; end if;
end $function$;
revoke all on function public.ar_waitlist_owner() from public;
revoke all on function public.ar_waitlist_owner() from anon;
grant execute on function public.ar_waitlist_owner() to authenticated;

-- the stock of one item in boxes (loose units count as a part of a box); no stock row = 0
create or replace function public.ar_waitlist_boxes(p_item bigint)
returns numeric
language sql
stable
set search_path to ''
as $function$
  select coalesce((select coalesce(s.packs, 0) + case when coalesce(s.parts, 0) > 0 then coalesce(s.units, 0)::numeric / s.parts else 0 end
                     from public.ar_stock s where s.item_id = p_item), 0)
$function$;
revoke all on function public.ar_waitlist_boxes(bigint) from public;
revoke all on function public.ar_waitlist_boxes(bigint) from anon;
grant execute on function public.ar_waitlist_boxes(bigint) to authenticated;

-- 30 days to return to a warehouse, 7 to a distribution center; null while the supplier's kind is not set
create or replace function public.ar_waitlist_return_days(p_vendor bigint)
returns int
language sql
stable
set search_path to ''
as $function$
  select case (select k.kind from public.ar_vendor_kinds k where k.vendor_id = p_vendor) when 'warehouse' then 30 when 'center' then 7 else null end
$function$;
revoke all on function public.ar_waitlist_return_days(bigint) from public;
revoke all on function public.ar_waitlist_return_days(bigint) from anon;
grant execute on function public.ar_waitlist_return_days(bigint) to authenticated;

create or replace function public.ar_waitlist_add(p_item_id bigint, p_item_name text, p_phone text, p_name text, p_qty numeric default 1, p_vendor_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_name text := regexp_replace(btrim(coalesce(p_item_name, '')), '\s+', ' ', 'g');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_cname text := nullif(btrim(coalesce(p_name, '')), '');
  v_qty numeric := coalesce(p_qty, 1);
  v_vname text; v_id bigint; v_dup bigint;
begin
  perform public.ar_waitlist_owner();
  if p_item_id is not null then
    select i.name into v_name from public.ar_store_items i where i.id = p_item_id;
    if v_name is null then return jsonb_build_object('ok', false, 'error', 'item'); end if;
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 200 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  if v_phone ~ '^201[0-9]{9}$' then v_phone := substr(v_phone, 2); end if;
  if v_phone ~ '^1[0-9]{9}$' then v_phone := '0' || v_phone; end if;
  if v_phone !~ '^01[0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'phone'); end if;
  if v_cname is not null and char_length(v_cname) > 80 then v_cname := left(v_cname, 80); end if;
  if v_qty <= 0 or v_qty > 999 then return jsonb_build_object('ok', false, 'error', 'qty'); end if;
  if p_vendor_id is not null then
    select coalesce(nullif(v.name, ''), v.short) into v_vname from public.ar_vendors v where v.id = p_vendor_id;
    if v_vname is null then return jsonb_build_object('ok', false, 'error', 'vendor'); end if;
  end if;
  -- the same customer waiting for the same item is one row (a second tap is not a second request)
  select w.id into v_dup from public.ar_waitlist w
   where w.phone = v_phone and w.status in ('waiting', 'arrived')
     and ((p_item_id is not null and w.item_id = p_item_id) or (p_item_id is null and w.item_id is null and lower(w.item_name) = lower(v_name)))
   order by w.id desc limit 1;
  if v_dup is not null then return jsonb_build_object('ok', true, 'id', v_dup, 'dup', true); end if;
  insert into public.ar_waitlist (item_id, item_name, phone, customer_name, qty, vendor_id, vendor_name, stock_at_request)
  values (p_item_id, v_name, v_phone, v_cname, v_qty, p_vendor_id, v_vname, case when p_item_id is null then 0 else public.ar_waitlist_boxes(p_item_id) end)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'waiting');
end $function$;
revoke all on function public.ar_waitlist_add(bigint, text, text, text, numeric, bigint) from public;
revoke all on function public.ar_waitlist_add(bigint, text, text, text, numeric, bigint) from anon;
grant execute on function public.ar_waitlist_add(bigint, text, text, text, numeric, bigint) to authenticated;

create or replace function public.ar_waitlist_set(p_id bigint, p_action text, p_vendor_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  w public.ar_waitlist%rowtype;
  v_vname text;
begin
  perform public.ar_waitlist_owner();
  select * into w from public.ar_waitlist where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'missing'); end if;
  if p_action = 'arrived' then
    if w.status <> 'waiting' then return jsonb_build_object('ok', false, 'error', 'state'); end if;
    update public.ar_waitlist set status = 'arrived', arrived_at = now(), arrived_by = 'manual', return_days = public.ar_waitlist_return_days(w.vendor_id), updated_at = now() where id = p_id;
  elsif p_action = 'reopen' then
    if w.status <> 'arrived' then return jsonb_build_object('ok', false, 'error', 'state'); end if;
    update public.ar_waitlist set status = 'waiting', arrived_at = null, arrived_by = null, called_at = null, return_days = null, updated_at = now() where id = p_id;
  elsif p_action = 'called' then
    if w.status <> 'arrived' then return jsonb_build_object('ok', false, 'error', 'state'); end if;
    update public.ar_waitlist set called_at = coalesce(called_at, now()), updated_at = now() where id = p_id;
  elsif p_action in ('delivered', 'returned', 'kept') then
    if w.status <> 'arrived' then return jsonb_build_object('ok', false, 'error', 'state'); end if;
    update public.ar_waitlist set status = p_action, closed_at = now(), updated_at = now() where id = p_id;
  elsif p_action = 'cancelled' then
    if w.status not in ('waiting', 'arrived') then return jsonb_build_object('ok', false, 'error', 'state'); end if;
    update public.ar_waitlist set status = 'cancelled', closed_at = now(), updated_at = now() where id = p_id;
  elsif p_action = 'vendor' then
    if w.status not in ('waiting', 'arrived') then return jsonb_build_object('ok', false, 'error', 'state'); end if;
    select coalesce(nullif(v.name, ''), v.short) into v_vname from public.ar_vendors v where v.id = p_vendor_id;
    if v_vname is null then return jsonb_build_object('ok', false, 'error', 'vendor'); end if;
    update public.ar_waitlist set vendor_id = p_vendor_id, vendor_name = v_vname,
           return_days = case when status = 'arrived' then public.ar_waitlist_return_days(p_vendor_id) else return_days end, updated_at = now() where id = p_id;
  else
    return jsonb_build_object('ok', false, 'error', 'action');
  end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'action', p_action);
end $function$;
revoke all on function public.ar_waitlist_set(bigint, text, bigint) from public;
revoke all on function public.ar_waitlist_set(bigint, text, bigint) from anon;
grant execute on function public.ar_waitlist_set(bigint, text, bigint) to authenticated;

create or replace function public.ar_waitlist_vendor_kind(p_vendor_id bigint, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.ar_waitlist_owner();
  if p_kind not in ('warehouse', 'center') then return jsonb_build_object('ok', false, 'error', 'kind'); end if;
  if not exists (select 1 from public.ar_vendors v where v.id = p_vendor_id) then return jsonb_build_object('ok', false, 'error', 'vendor'); end if;
  insert into public.ar_vendor_kinds as k (vendor_id, kind) values (p_vendor_id, p_kind)
  on conflict (vendor_id) do update set kind = excluded.kind, updated_at = now();
  -- the ones already here from this supplier that had no countdown get it now
  update public.ar_waitlist set return_days = public.ar_waitlist_return_days(p_vendor_id), updated_at = now()
   where vendor_id = p_vendor_id and status = 'arrived';
  return jsonb_build_object('ok', true, 'vendor_id', p_vendor_id, 'kind', p_kind);
end $function$;
revoke all on function public.ar_waitlist_vendor_kind(bigint, text) from public;
revoke all on function public.ar_waitlist_vendor_kind(bigint, text) from anon;
grant execute on function public.ar_waitlist_vendor_kind(bigint, text) to authenticated;

create or replace function public.ar_waitlist_overview()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_items int[];
  v_out jsonb;
begin
  perform public.ar_waitlist_owner();
  -- what the stock list now shows more of than at the moment of the request has arrived
  update public.ar_waitlist w
     set status = 'arrived', arrived_at = now(), arrived_by = 'stock', return_days = public.ar_waitlist_return_days(w.vendor_id), updated_at = now()
   where w.status = 'waiting' and w.item_id is not null and public.ar_waitlist_boxes(w.item_id) > w.stock_at_request;
  select array_agg(distinct w.item_id::int) into v_items from public.ar_waitlist w where w.status = 'arrived' and w.item_id is not null;

  with base as (
    select w.*,
           coalesce(nullif(w.customer_name, ''), (select c.name from public.ar_customer_phones p join public.ar_customers c on c.id = p.customer_id
                                                   where p.phone = '20' || substr(w.phone, 2) limit 1)) as who,
           (select k.kind from public.ar_vendor_kinds k where k.vendor_id = w.vendor_id) as vkind
      from public.ar_waitlist w where w.status in ('waiting', 'arrived')
  ), sold as (
    select (l->>'i')::bigint as item_id,
           sum((l->>'p')::numeric + case when (l->>'k')::numeric > 0 then (l->>'u')::numeric / (l->>'k')::numeric else 0 end) as packs
      from public.ar_sales s, jsonb_array_elements(s.lines) l
     where v_items is not null and s.kind = 'sale' and s.items && v_items
       and (l->>'i') ~ '^[0-9]{1,9}$' and (l->>'p') ~ '^-?[0-9.]+$' and (l->>'u') ~ '^-?[0-9.]+$' and (l->>'k') ~ '^-?[0-9.]+$'
       and (l->>'i')::bigint = any (v_items::bigint[])
     group by 1
  )
  select jsonb_build_object(
    'ok', true,
    'waiting', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'item_id', b.item_id, 'item', b.item_name, 'qty', b.qty, 'phone', b.phone, 'who', b.who,
                         'vendor_id', b.vendor_id, 'vendor', b.vendor_name, 'vkind', b.vkind, 'days', floor(extract(epoch from (now() - b.created_at)) / 86400)::int) order by b.created_at)
                         from base b where b.status = 'waiting'), '[]'::jsonb),
    'call', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'item_id', b.item_id, 'item', b.item_name, 'qty', b.qty, 'phone', b.phone, 'who', b.who,
                         'vendor', b.vendor_name, 'by', b.arrived_by, 'return_days', b.return_days, 'arrived_at', b.arrived_at) order by b.arrived_at, b.id)
                         from base b where b.status = 'arrived' and b.called_at is null), '[]'::jsonb),
    'leftover', coalesce((select jsonb_agg(x.j order by x.left_days nulls last, x.arrived_at) from (
                    select b.arrived_at, case when b.return_days is null then null else b.return_days - floor(extract(epoch from (now() - b.arrived_at)) / 86400)::int end as left_days,
                           jsonb_build_object('id', b.id, 'item_id', b.item_id, 'item', b.item_name, 'qty', b.qty, 'phone', b.phone, 'who', b.who, 'vendor_id', b.vendor_id,
                             'vendor', b.vendor_name, 'vkind', b.vkind, 'called', b.called_at is not null, 'arrived_at', b.arrived_at,
                             'days_here', floor(extract(epoch from (now() - b.arrived_at)) / 86400)::int, 'return_days', b.return_days,
                             'left_days', case when b.return_days is null then null else b.return_days - floor(extract(epoch from (now() - b.arrived_at)) / 86400)::int end,
                             'sold_year', coalesce((select round(sd.packs, 1) from sold sd where sd.item_id = b.item_id), 0),
                             'price', (select coalesce(s.price, i.price) from public.ar_store_items i left join public.ar_stock s on s.item_id = i.id where i.id = b.item_id),
                             'exp_near', (select s.exp_near from public.ar_stock s where s.item_id = b.item_id),
                             'exp_short', coalesce((select s.exp_near < (current_date + interval '18 months') from public.ar_stock s where s.item_id = b.item_id), false)) as j
                      from base b where b.status = 'arrived') x), '[]'::jsonb),
    'vendors', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', coalesce(nullif(v.name, ''), v.short), 'short', v.short, 'kind', k.kind) order by v.last_invoice_at desc nulls last, v.id)
                           from (select * from public.ar_vendors where active order by last_invoice_at desc nulls last limit 60) v
                           left join public.ar_vendor_kinds k on k.vendor_id = v.id), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $function$;
revoke all on function public.ar_waitlist_overview() from public;
revoke all on function public.ar_waitlist_overview() from anon;
grant execute on function public.ar_waitlist_overview() to authenticated;
