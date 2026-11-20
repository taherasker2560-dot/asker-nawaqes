-- 202611201500_ar_contacts_private (NOT applied yet: needs the owner's approval on the phone)
-- Owner 2026-11-20 («خلى دفتر التليفونات عالسيستم عادى و ادينى اوبشن اعلم عالناس المخصوص اللى مش عاوز المستخدمين يتعاملو معاهم», then «ا» to: staff see the cash + account customers,
-- «غيرهم» start private until he opens the ones he wants): the number book (202611201300) stays whole; each number can be marked «🔒 خاص» (private) = he sees it, the staff never do
-- (not the name, not the number, not in a search). And the staff get a new section, «الانتظار» (key `wait`, one switch like the others): they add a request («طلب مش موجود»), see
-- who is waiting and who to call, mark «called / delivered / cancelled». They never see the returns decisions, the suppliers' kinds, nor a private number. Nothing here is sent.
--   ar_contacts.private      : true = hidden from staff. Backfill (only the first time this runs): the «غيرهم» of his Google import (kind other, source google) start private; cash, account and
--                              everything typed in the form start open.
--   Staff policies           : select the open rows (not private) with the `wait` switch; insert a typed number (private false, source typed, never over an existing number); no update, no delete.
--   ar_waitlist_who()        : 'owner' or 'staff' (active, `wait` open) or refuses. The waiting-list functions use it: staff may add, read the waiting / call lists, and set called / delivered / cancelled;
--                              the returns list («قرار الرجوع») and the suppliers come back empty for them, and arrived / reopen / returned / kept / vendor / vendor kind stay the owner's.
--   ar_contacts_private(phones, flag) : owner only, marks many numbers at once.
--   The staff's own adds and changes in these two tables are written under their name by the existing trigger (ar_activity), when it exists.
-- Rollback: drop function public.ar_contacts_private(text[], boolean); drop policy "Staff reads open ar contacts" on public.ar_contacts; drop policy "Staff adds ar contacts" on public.ar_contacts;
--   drop policy "Staff reads ar waitlist" on public.ar_waitlist; alter table public.ar_contacts drop column private; and put back the 202611190500 bodies of ar_waitlist_add / _set / _overview
--   (they call public.ar_waitlist_owner() again), then drop function public.ar_waitlist_who().

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ar_contacts' and column_name = 'private') then
    alter table public.ar_contacts add column private boolean not null default false;
    update public.ar_contacts set private = true where kind = 'other' and source = 'google';
  end if;
end $$;
create index if not exists ar_contacts_private on public.ar_contacts (private);

drop policy if exists "Staff reads open ar contacts" on public.ar_contacts;
create policy "Staff reads open ar contacts" on public.ar_contacts for select to authenticated
  using ((select public.ar_staff_can(array['wait'])) and private = false);
drop policy if exists "Staff adds ar contacts" on public.ar_contacts;
create policy "Staff adds ar contacts" on public.ar_contacts for insert to authenticated
  with check ((select public.ar_staff_can(array['wait'])) and private = false and source = 'typed');

drop policy if exists "Staff reads ar waitlist" on public.ar_waitlist;
create policy "Staff reads ar waitlist" on public.ar_waitlist for select to authenticated
  using ((select public.ar_staff_can(array['wait'])));

-- who is asking: 'owner', or 'staff' with the `wait` section open, otherwise refused
create or replace function public.ar_waitlist_who()
returns text
language plpgsql
stable
set search_path to ''
as $function$
begin
  if (select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then return 'owner'; end if;
  if public.ar_staff_can(array['wait']) then return 'staff'; end if;
  raise exception 'owner only' using errcode = '42501';
end $function$;
revoke all on function public.ar_waitlist_who() from public;
revoke all on function public.ar_waitlist_who() from anon;
grant execute on function public.ar_waitlist_who() to authenticated;

-- the owner marks one or many numbers private (true) or open (false); returns how many changed
create or replace function public.ar_contacts_private(p_phones text[], p_private boolean)
returns int
language plpgsql
security definer
set search_path to ''
as $function$
declare n int;
begin
  perform public.ar_waitlist_owner();
  if p_private is null or coalesce(array_length(p_phones, 1), 0) = 0 or array_length(p_phones, 1) > 5000 then return 0; end if;
  update public.ar_contacts set private = p_private, updated_at = now() where phone = any (p_phones) and private is distinct from p_private;
  get diagnostics n = row_count;
  return n;
end $function$;
revoke all on function public.ar_contacts_private(text[], boolean) from public;
revoke all on function public.ar_contacts_private(text[], boolean) from anon;
grant execute on function public.ar_contacts_private(text[], boolean) to authenticated;

-- add a request: the owner or a staff member with `wait`
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
  v_vname text; v_id bigint; v_dup bigint; v_who text;
begin
  v_who := public.ar_waitlist_who();
  if v_who = 'staff' then p_vendor_id := null; end if;   -- choosing the supplier is the owner's
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

-- one action on a request: staff may only mark called / delivered / cancelled
create or replace function public.ar_waitlist_set(p_id bigint, p_action text, p_vendor_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  w public.ar_waitlist%rowtype;
  v_vname text; v_who text;
begin
  v_who := public.ar_waitlist_who();
  if v_who = 'staff' and p_action not in ('called', 'delivered', 'cancelled') then raise exception 'owner only' using errcode = '42501'; end if;
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

-- the lists: a staff member gets who is waiting and who to call; the returns decisions and the suppliers come back empty for him
create or replace function public.ar_waitlist_overview()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_items int[];
  v_out jsonb;
  v_who text;
begin
  v_who := public.ar_waitlist_who();
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
     where v_who = 'owner' and v_items is not null and s.kind = 'sale' and s.items && v_items
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
    'leftover', case when v_who <> 'owner' then '[]'::jsonb else coalesce((select jsonb_agg(x.j order by x.left_days nulls last, x.arrived_at) from (
                    select b.arrived_at, case when b.return_days is null then null else b.return_days - floor(extract(epoch from (now() - b.arrived_at)) / 86400)::int end as left_days,
                           jsonb_build_object('id', b.id, 'item_id', b.item_id, 'item', b.item_name, 'qty', b.qty, 'phone', b.phone, 'who', b.who, 'vendor_id', b.vendor_id,
                             'vendor', b.vendor_name, 'vkind', b.vkind, 'called', b.called_at is not null, 'arrived_at', b.arrived_at,
                             'days_here', floor(extract(epoch from (now() - b.arrived_at)) / 86400)::int, 'return_days', b.return_days,
                             'left_days', case when b.return_days is null then null else b.return_days - floor(extract(epoch from (now() - b.arrived_at)) / 86400)::int end,
                             'sold_year', coalesce((select round(sd.packs, 1) from sold sd where sd.item_id = b.item_id), 0),
                             'price', (select coalesce(s.price, i.price) from public.ar_store_items i left join public.ar_stock s on s.item_id = i.id where i.id = b.item_id),
                             'exp_near', (select s.exp_near from public.ar_stock s where s.item_id = b.item_id),
                             'exp_short', coalesce((select s.exp_near < (current_date + interval '18 months') from public.ar_stock s where s.item_id = b.item_id), false)) as j
                      from base b where b.status = 'arrived') x), '[]'::jsonb) end,
    'vendors', case when v_who <> 'owner' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', coalesce(nullif(v.name, ''), v.short), 'short', v.short, 'kind', k.kind) order by v.last_invoice_at desc nulls last, v.id)
                           from (select * from public.ar_vendors where active order by last_invoice_at desc nulls last limit 60) v
                           left join public.ar_vendor_kinds k on k.vendor_id = v.id), '[]'::jsonb) end
  ) into v_out;
  return v_out;
end $function$;
revoke all on function public.ar_waitlist_overview() from public;
revoke all on function public.ar_waitlist_overview() from anon;
grant execute on function public.ar_waitlist_overview() to authenticated;

-- what a staff member adds or changes here is written under his name (the trigger of 202611130200), when it is there
do $$
declare t text;
begin
  if to_regprocedure('public.ar_log_staff()') is null then return; end if;
  foreach t in array array['ar_waitlist', 'ar_contacts'] loop
    execute format('drop trigger if exists ar_log_staff on public.%I', t);
    execute format('create trigger ar_log_staff after insert or update or delete on public.%I for each row execute function public.ar_log_staff()', t);
  end loop;
end $$;
