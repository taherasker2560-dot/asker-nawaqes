-- 202611191200_ar_return_marks (NOT applied yet: needs the owner's approval on the phone)
-- Owner 2026-11-19 (on the «الصلاحيات ← فواتير» list, then «ا» on the plan): an item of the short-dated list can be marked «return it to the supplier»; the marks make a
-- statement per supplier that he shares on WhatsApp so the staff prepare the goods; a staff member he gives the switch «returns» (⚙️ ← الموظفين) sees the statement and ticks
-- «prepared»; when the return invoice (PharmaFly names it «~<the purchase's number>») reaches ar_vendor_moves, the mark closes by itself («returned»). This is also what a later
-- automatic return reads.
--   ar_return_marks : one row per marked lot = one purchase invoice (move_id, vendor, PharmaFly number, day entered) + item + expiry + the units to return (k units in a box).
--     status: marked (owner decided) · prepared (staff / owner ticked it) · returned (the return invoice was entered) · cancelled (owner took the mark off).
--     One open mark per invoice + item + expiry (a second tap changes the quantity). returned_units counts what the return invoices took so far.
--   Functions (nothing here writes to PharmaFly or sends a message):
--     ar_return_mark(move, item, expiry, units)   owner only: checks the lot is on that purchase invoice and the units are not more than bought; names are copied so the row stands alone
--     ar_return_unmark(id)                        owner only: cancels an open mark
--     ar_return_prepare(id, done)                 owner, or a staff member with the switch «returns»: marked <-> prepared (who and when are written)
--     ar_return_sync()                            owner only: closes the marks that a return invoice «~<number>» of the same supplier, entered after the mark, covers
--   Tables: the owner reads all; a staff member with «returns» reads the open ones. Nobody writes except through the functions.
-- Rollback: drop function public.ar_return_sync(); drop function public.ar_return_prepare(bigint, boolean); drop function public.ar_return_unmark(bigint);
--   drop function public.ar_return_mark(bigint, bigint, date, numeric); drop function public.ar_return_who(); drop function public.ar_return_owner(); drop table public.ar_return_marks;

create table if not exists public.ar_return_marks (
  id bigint generated always as identity primary key,
  move_id bigint not null,
  vendor_id bigint not null,
  vendor_name text,
  code text,
  invoiced_at timestamp,
  item_id bigint not null,
  item_name text not null,
  item_ar text,
  expiry date,
  k int not null default 1 check (k >= 1),
  units numeric(12, 2) not null check (units > 0),
  returned_units numeric(12, 2) not null default 0 check (returned_units >= 0),
  status text not null default 'marked' check (status in ('marked', 'prepared', 'returned', 'cancelled')),
  marked_at timestamptz not null default now(),
  prepared_at timestamptz,
  prepared_by text check (prepared_by is null or char_length(prepared_by) <= 80),
  returned_at timestamptz,
  cancelled_at timestamptz
);
create unique index if not exists ar_return_marks_open on public.ar_return_marks (move_id, item_id, (coalesce(expiry, date '1900-01-01'))) where status in ('marked', 'prepared');
create index if not exists ar_return_marks_status on public.ar_return_marks (status, marked_at desc);
alter table public.ar_return_marks enable row level security;
drop policy if exists "Owner reads ar return marks" on public.ar_return_marks;
create policy "Owner reads ar return marks" on public.ar_return_marks for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Staff reads open ar return marks" on public.ar_return_marks;
create policy "Staff reads open ar return marks" on public.ar_return_marks for select to authenticated
  using (status in ('marked', 'prepared') and (select public.ar_staff_can(array['returns'])));

create or replace function public.ar_return_owner()
returns void
language plpgsql
stable
set search_path to ''
as $function$
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then raise exception 'owner only' using errcode = '42501'; end if;
end $function$;
revoke all on function public.ar_return_owner() from public;
revoke all on function public.ar_return_owner() from anon;
grant execute on function public.ar_return_owner() to authenticated;

-- who is acting: the owner, or an active staff member who has the switch «returns» (his name); anybody else is refused
create or replace function public.ar_return_who()
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare v_name text;
begin
  if (select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then return 'المالك'; end if;
  if (select public.ar_staff_can(array['returns'])) then
    select s.name into v_name from public.ar_staff s where s.user_id = (select auth.uid());
    return coalesce(v_name, 'موظف');
  end if;
  raise exception 'not allowed' using errcode = '42501';
end $function$;
revoke all on function public.ar_return_who() from public;
revoke all on function public.ar_return_who() from anon;
grant execute on function public.ar_return_who() to authenticated;

create or replace function public.ar_return_mark(p_move bigint, p_item bigint, p_x date, p_units numeric)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  m record;
  v_units numeric := round(coalesce(p_units, 0), 2);
  v_bought numeric; v_k numeric; v_en text; v_ar text; v_vname text; v_id bigint;
begin
  perform public.ar_return_owner();
  select v.vendor_id, v.code, v.at, v.lines into m from public.ar_vendor_moves v where v.id = p_move and v.kind = 'purchase';
  if not found then return jsonb_build_object('ok', false, 'error', 'move'); end if;
  -- the lot on that invoice (the same item and expiry on two lines adds up)
  select coalesce(sum((abs(coalesce((e->>'p')::numeric, 0)) + abs(coalesce((e->>'b')::numeric, 0))) * greatest(coalesce((e->>'k')::numeric, 1), 1) + abs(coalesce((e->>'u')::numeric, 0))), 0),
         coalesce(max(greatest(coalesce((e->>'k')::numeric, 1), 1)), 1)
    into v_bought, v_k
    from jsonb_array_elements(case when jsonb_typeof(m.lines) = 'array' then m.lines else '[]'::jsonb end) e
   where (e->>'i')::bigint = p_item and nullif(e->>'x', '')::date is not distinct from p_x;
  if v_bought <= 0 then return jsonb_build_object('ok', false, 'error', 'line'); end if;
  if v_units <= 0 or v_units > v_bought then return jsonb_build_object('ok', false, 'error', 'units'); end if;
  select i.name, nullif(i.arabic_name, '') into v_en, v_ar from public.ar_store_items i where i.id = p_item;
  if v_en is null then v_en := '#' || p_item::text; end if;
  select coalesce(nullif(v.short, ''), v.name) into v_vname from public.ar_vendors v where v.id = m.vendor_id;
  select r.id into v_id from public.ar_return_marks r
   where r.move_id = p_move and r.item_id = p_item and r.expiry is not distinct from p_x and r.status in ('marked', 'prepared');
  if v_id is not null then
    update public.ar_return_marks set units = v_units, k = v_k::int where id = v_id;
    return jsonb_build_object('ok', true, 'id', v_id, 'dup', true);
  end if;
  insert into public.ar_return_marks (move_id, vendor_id, vendor_name, code, invoiced_at, item_id, item_name, item_ar, expiry, k, units)
  values (p_move, m.vendor_id, v_vname, m.code, m.at, p_item, v_en, v_ar, p_x, v_k::int, v_units)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;
revoke all on function public.ar_return_mark(bigint, bigint, date, numeric) from public;
revoke all on function public.ar_return_mark(bigint, bigint, date, numeric) from anon;
grant execute on function public.ar_return_mark(bigint, bigint, date, numeric) to authenticated;

create or replace function public.ar_return_unmark(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_status text;
begin
  perform public.ar_return_owner();
  select r.status into v_status from public.ar_return_marks r where r.id = p_id;
  if v_status is null then return jsonb_build_object('ok', false, 'error', 'missing'); end if;
  if v_status not in ('marked', 'prepared') then return jsonb_build_object('ok', false, 'error', 'state'); end if;
  update public.ar_return_marks set status = 'cancelled', cancelled_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end $function$;
revoke all on function public.ar_return_unmark(bigint) from public;
revoke all on function public.ar_return_unmark(bigint) from anon;
grant execute on function public.ar_return_unmark(bigint) to authenticated;

create or replace function public.ar_return_prepare(p_id bigint, p_done boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_who text := public.ar_return_who(); v_status text;
begin
  select r.status into v_status from public.ar_return_marks r where r.id = p_id;
  if v_status is null then return jsonb_build_object('ok', false, 'error', 'missing'); end if;
  if v_status not in ('marked', 'prepared') then return jsonb_build_object('ok', false, 'error', 'state'); end if;
  if coalesce(p_done, true) then
    update public.ar_return_marks set status = 'prepared', prepared_at = now(), prepared_by = v_who where id = p_id;
  else
    update public.ar_return_marks set status = 'marked', prepared_at = null, prepared_by = null where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'status', case when coalesce(p_done, true) then 'prepared' else 'marked' end, 'by', v_who);
end $function$;
revoke all on function public.ar_return_prepare(bigint, boolean) from public;
revoke all on function public.ar_return_prepare(bigint, boolean) from anon;
grant execute on function public.ar_return_prepare(bigint, boolean) to authenticated;

-- closes the marks that a return invoice already covers: PharmaFly names a return «~<the purchase's number>», so the return of THIS purchase from the SAME supplier,
-- entered after the mark, with the item on a line, counts (what other marks of the same invoice + item already took is left out)
create or replace function public.ar_return_sync()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare r record; v_got numeric; v_new numeric; v_closed int := 0; v_touched int := 0;
begin
  perform public.ar_return_owner();
  for r in select * from public.ar_return_marks where status in ('marked', 'prepared') order by marked_at, id loop
    select coalesce(sum(abs(coalesce((e->>'p')::numeric, 0)) * greatest(coalesce((e->>'k')::numeric, 1), 1) + abs(coalesce((e->>'u')::numeric, 0))), 0) into v_got
      from public.ar_vendor_moves v,
           lateral jsonb_array_elements(case when jsonb_typeof(v.lines) = 'array' then v.lines else '[]'::jsonb end) e
     where v.kind = 'return' and v.vendor_id = r.vendor_id and v.code = '~' || r.code
       and v.at >= (r.marked_at at time zone 'Africa/Cairo') and (e->>'i')::bigint = r.item_id;
    v_got := v_got - coalesce((select sum(o.returned_units) from public.ar_return_marks o
                                where o.id <> r.id and o.vendor_id = r.vendor_id and o.code = r.code and o.item_id = r.item_id), 0);
    v_new := least(r.units, greatest(v_got, 0));
    if v_new > r.returned_units then
      v_touched := v_touched + 1;
      if v_new >= r.units then
        update public.ar_return_marks set returned_units = v_new, status = 'returned', returned_at = now() where id = r.id;
        v_closed := v_closed + 1;
      else
        update public.ar_return_marks set returned_units = v_new where id = r.id;
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'closed', v_closed, 'touched', v_touched);
end $function$;
revoke all on function public.ar_return_sync() from public;
revoke all on function public.ar_return_sync() from anon;
grant execute on function public.ar_return_sync() to authenticated;
