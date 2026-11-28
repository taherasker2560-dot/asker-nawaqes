-- 202611281800_ar_return_entered (owner 2026-11-28: «↩️ رجّعه» on «الأصناف يوم بيوم», then on «المرتجع يتسجل في فارمافلاي إمتى؟»: «اه على طول، اول ما يتعمل، اول ما اديك القرار،
-- اول ما ادوس على الزرار»). Applied only with his approval on the phone.
--   1) A mark whose return is already entered in PharmaFly («~<the purchase's number>») STAYS on the staff list until it is prepared: entering no longer closes it.
--      returned_units / returned_at say it is entered; status goes to 'returned' only when it is entered AND prepared (whichever comes second closes it).
--   2) The laptop's purchase robot reads the open marks not entered yet and says what it is doing on each (robot_state / robot_note / robot_at), with its key
--      (the same key check as the laptop's other functions); it can also run the sync after PharmaFly's copy.
--   Nothing here writes to PharmaFly or sends a message.
-- Rollback: drop function public.ar_return_robot_set(text, bigint, text, text); drop function public.ar_return_todo(text); drop function public.ar_return_sync_key(text);
--   drop function public.ar_return_sync_core(); alter table public.ar_return_marks drop column robot_state, drop column robot_note, drop column robot_at;
--   then create again ar_return_sync() and ar_return_prepare(bigint, boolean) as in 202611191200_ar_return_marks.sql.

alter table public.ar_return_marks add column if not exists robot_state text check (robot_state is null or robot_state in ('typing', 'saved', 'stopped'));
alter table public.ar_return_marks add column if not exists robot_note text check (robot_note is null or char_length(robot_note) <= 300);
alter table public.ar_return_marks add column if not exists robot_at timestamptz;

-- the sync itself (no caller check): what the return invoices «~<code>» of the same supplier, entered after the mark, took of the item
create or replace function public.ar_return_sync_core()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare r record; v_got numeric; v_new numeric; v_closed int := 0; v_touched int := 0;
begin
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
        -- entered in full: it closes only if the goods were prepared too; else it stays on the staff list, marked «entered»
        update public.ar_return_marks set returned_units = v_new, returned_at = now(),
               status = case when r.status = 'prepared' then 'returned' else r.status end,
               robot_state = case when robot_state is null then null else 'saved' end
         where id = r.id;
        if r.status = 'prepared' then v_closed := v_closed + 1; end if;
      else
        update public.ar_return_marks set returned_units = v_new where id = r.id;
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'closed', v_closed, 'touched', v_touched);
end $function$;
revoke all on function public.ar_return_sync_core() from public, anon, authenticated;

-- the owner's page (as before, same name and answer)
create or replace function public.ar_return_sync()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.ar_return_owner();
  return public.ar_return_sync_core();
end $function$;
revoke all on function public.ar_return_sync() from public, anon;
grant execute on function public.ar_return_sync() to authenticated;

-- prepared: the owner or a staff member with «returns»; a mark already entered in full closes now ('returned')
create or replace function public.ar_return_prepare(p_id bigint, p_done boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_who text := public.ar_return_who(); m record; v_status text;
begin
  select r.status, r.units, r.returned_units into m from public.ar_return_marks r where r.id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'missing'); end if;
  if m.status not in ('marked', 'prepared') then return jsonb_build_object('ok', false, 'error', 'state'); end if;
  if coalesce(p_done, true) then
    v_status := case when m.returned_units >= m.units then 'returned' else 'prepared' end;
    update public.ar_return_marks set status = v_status, prepared_at = now(), prepared_by = v_who where id = p_id;
  else
    v_status := 'marked';
    update public.ar_return_marks set status = 'marked', prepared_at = null, prepared_by = null where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'status', v_status, 'by', v_who);
end $function$;
revoke all on function public.ar_return_prepare(bigint, boolean) from public, anon;
grant execute on function public.ar_return_prepare(bigint, boolean) to authenticated;

-- the laptop's key (the same check as its other functions)
create or replace function public.ar_return_key_ok(p_key text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_hash text;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
end $function$;
revoke all on function public.ar_return_key_ok(text) from public, anon, authenticated;

-- the sync, run by the laptop after PharmaFly's copy arrived (the robot checks what it entered)
create or replace function public.ar_return_sync_key(p_key text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.ar_return_key_ok(p_key);
  return public.ar_return_sync_core();
end $function$;
revoke all on function public.ar_return_sync_key(text) from public;
grant execute on function public.ar_return_sync_key(text) to anon, authenticated;

-- what the robot has to enter: the open marks not entered in full, oldest first, with the lot (invoice, item, expiry, units, units in a box)
create or replace function public.ar_return_todo(p_key text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.ar_return_key_ok(p_key);
  return jsonb_build_object('ok', true, 'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'move_id', r.move_id, 'vendor_id', r.vendor_id, 'vendor_name', r.vendor_name, 'code', r.code, 'invoiced_at', r.invoiced_at,
      'item_id', r.item_id, 'item_name', r.item_name, 'expiry', r.expiry, 'k', r.k, 'units', r.units, 'returned_units', r.returned_units,
      'status', r.status, 'marked_at', r.marked_at, 'robot_state', r.robot_state, 'robot_note', r.robot_note, 'robot_at', r.robot_at) order by r.marked_at, r.id)
    from public.ar_return_marks r where r.status in ('marked', 'prepared') and r.returned_units < r.units), '[]'::jsonb));
end $function$;
revoke all on function public.ar_return_todo(text) from public;
grant execute on function public.ar_return_todo(text) to anon, authenticated;

-- the robot says what it is doing on a mark: typing / saved / stopped (+ a short note), or '' to clear
create or replace function public.ar_return_robot_set(p_key text, p_id bigint, p_state text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_state text := nullif(btrim(coalesce(p_state, '')), '');
begin
  perform public.ar_return_key_ok(p_key);
  if v_state is not null and v_state not in ('typing', 'saved', 'stopped') then return jsonb_build_object('ok', false, 'error', 'state'); end if;
  update public.ar_return_marks set robot_state = v_state, robot_note = left(nullif(btrim(coalesce(p_note, '')), ''), 300), robot_at = now()
   where id = p_id and status in ('marked', 'prepared');
  if not found then return jsonb_build_object('ok', false, 'error', 'missing'); end if;
  return jsonb_build_object('ok', true, 'id', p_id);
end $function$;
revoke all on function public.ar_return_robot_set(text, bigint, text, text) from public;
grant execute on function public.ar_return_robot_set(text, bigint, text, text) to anon, authenticated;
