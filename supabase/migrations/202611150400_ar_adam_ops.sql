-- 202611150400_ar_adam_ops (owner 2026-11-15: «عايز آدم ينفذ كل العمليات اللي ممكن ننفذها من خلال البوت … بالصوت … وبعد كده تتنفذ
-- أوتوماتيك على اللاب»; applied only after his «أيوه»)
-- ASKER «آدم»: the operations the owner says by voice. Adam proposes, the phone reads it back and waits for his spoken yes; only then
-- the laptop calls ar_adam_do (it refuses without a confirmed request, once per confirmation) and the operation is RECORDED here:
--   - a customer's payment / a supplier's payment  -> ar_ops (status pending)
--   - a sale / a return                             -> ar_temp_sales (the same list as the «البيع المؤقت» screen, status pending)
--   - cancel one of Adam's still-pending operations -> status cancelled
-- Nothing here writes to PharmaFly. The laptop enters the pending operations in PharmaFly later, on PharmaFly's own screens, one
-- kind at a time (a later step, with its own approval). Prices are read from the bot's own stock table here, never taken from the
-- brain's words; if the total the owner heard is more than 1 pound away from the total computed here, the sale is refused.
-- Rollback: drop function public.ar_adam_do(text, bigint, text, jsonb) and recreate it from 202611150100_ar_adam.sql;
--   drop table public.ar_ops; alter table public.ar_temp_sales drop column adam_request, drop column adam_seq;

create table if not exists public.ar_ops (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('customer_payment', 'vendor_payment')),
  party_id bigint not null,
  party_name text check (party_name is null or char_length(party_name) <= 160),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 5000000),
  balance_before numeric(14, 2),
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'cancelled')),
  source text not null default 'adam',
  request_id bigint,
  seq int not null default 1,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);
create unique index if not exists ar_ops_one_per_confirmation on public.ar_ops (request_id, seq) where request_id is not null;
create index if not exists ar_ops_status on public.ar_ops (status, created_at desc);
alter table public.ar_ops enable row level security;
drop policy if exists "Owner all ar ops" on public.ar_ops;
create policy "Owner all ar ops" on public.ar_ops for all to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

alter table public.ar_temp_sales add column if not exists adam_request bigint;
alter table public.ar_temp_sales add column if not exists adam_seq int;
create unique index if not exists ar_temp_sales_one_per_confirmation on public.ar_temp_sales (adam_request, adam_seq) where adam_request is not null;

create or replace function public.ar_adam_do(p_key text, p_request bigint, p_action text, p_args jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_req record; v_cust bigint; v_args jsonb := coalesce(p_args, '{}'::jsonb);
  v_seq int; v_party text; v_id bigint; v_amount numeric; v_name text; v_bal numeric; v_note text; v_opid bigint;
  v_kind text; v_lines jsonb; v_line jsonb; v_items jsonb := '[]'::jsonb; v_total numeric := 0; v_n int; v_it record;
  v_qty numeric; v_unit text; v_price numeric; v_k int; v_expect numeric; v_paid numeric; v_no bigint; v_uuid uuid;
begin
  if public.ar_adam_role(p_key) is distinct from 'laptop' then return jsonb_build_object('ok', false, 'error', 'key'); end if;
  select r.id into v_req from public.ar_adam_requests r
   where r.id = p_request and r.status = 'working' and r.answer = 'yes' and r.confirm_of is not null and r.confirmed_at is not null
     and r.confirmed_at > now() - interval '10 minutes';
  if v_req.id is null then return jsonb_build_object('ok', false, 'error', 'not_confirmed'); end if;
  -- which of the confirmed actions this is (the same confirmation may carry several): a repeat of the same number is refused
  begin
    v_seq := coalesce(nullif(v_args ->> 'seq', '')::int, 1);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'seq');
  end;
  if v_seq < 1 or v_seq > 20 then return jsonb_build_object('ok', false, 'error', 'seq'); end if;

  if p_action in ('stop_credit', 'allow_credit') then
    begin
      v_cust := (v_args ->> 'customer_id')::bigint;
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

  -- a customer's / a supplier's payment: recorded, nothing else
  if p_action = 'record_payment' then
    begin
      v_party := v_args ->> 'party';
      v_id := (v_args ->> 'id')::bigint;
      v_amount := round((v_args ->> 'amount')::numeric, 2);
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'args');
    end;
    if v_party not in ('customer', 'vendor') or v_id is null or v_amount is null or v_amount <= 0 or v_amount > 5000000 then
      return jsonb_build_object('ok', false, 'error', 'args');
    end if;
    v_note := nullif(left(btrim(coalesce(v_args ->> 'note', '')), 300), '');
    if v_party = 'customer' then
      select c.name, c.balance into v_name, v_bal from public.ar_customers c where c.id = v_id;
    else
      select coalesce(nullif(v.name, ''), v.short), v.balance into v_name, v_bal from public.ar_vendors v where v.id = v_id;
    end if;
    if v_name is null then return jsonb_build_object('ok', false, 'error', case when v_party = 'customer' then 'no_customer' else 'no_vendor' end); end if;
    begin
      insert into public.ar_ops (kind, party_id, party_name, amount, balance_before, note, request_id, seq)
      values (case when v_party = 'customer' then 'customer_payment' else 'vendor_payment' end, v_id, left(v_name, 160), v_amount, v_bal, v_note, p_request, v_seq)
      returning id into v_opid;
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'duplicate');
    end;
    return jsonb_build_object('ok', true, 'action', p_action, 'op_id', v_opid, 'name', v_name, 'amount', v_amount);
  end if;

  -- a sale or a return, in the «البيع المؤقت» list: the lines are priced HERE from ar_stock (a box, or one unit = price / parts)
  if p_action = 'record_sale' then
    v_kind := coalesce(nullif(v_args ->> 'kind', ''), 'sale');
    if v_kind not in ('sale', 'return') then return jsonb_build_object('ok', false, 'error', 'args'); end if;
    v_lines := v_args -> 'lines';
    if jsonb_typeof(v_lines) is distinct from 'array' or jsonb_array_length(v_lines) not between 1 and 30 then return jsonb_build_object('ok', false, 'error', 'lines'); end if;
    begin
      v_cust := nullif(v_args ->> 'customer_id', '')::bigint;
      v_paid := nullif(v_args ->> 'paid', '')::numeric;
      v_expect := nullif(v_args ->> 'expect_total', '')::numeric;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'args');
    end;
    if v_paid is not null and (v_paid < 0 or v_paid > 5000000) then return jsonb_build_object('ok', false, 'error', 'args'); end if;
    v_name := null;
    if v_cust is not null then
      select c.name into v_name from public.ar_customers c where c.id = v_cust;
      if v_name is null then return jsonb_build_object('ok', false, 'error', 'no_customer'); end if;
    end if;
    for v_line in select value from jsonb_array_elements(v_lines) loop
      begin
        v_id := (v_line ->> 'item_id')::bigint;
        v_qty := (v_line ->> 'qty')::numeric;
        v_unit := coalesce(nullif(v_line ->> 'unit', ''), 'pack');
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'lines');
      end;
      if v_id is null or v_qty is null or v_qty <= 0 or v_qty > 999 or v_qty <> floor(v_qty) or v_unit not in ('pack', 'unit') then return jsonb_build_object('ok', false, 'error', 'lines'); end if;
      select s.item_id, s.name, s.price, s.parts, s.packs, s.units into v_it from public.ar_stock s where s.item_id = v_id;
      if v_it.item_id is null or coalesce(v_it.price, 0) <= 0 then return jsonb_build_object('ok', false, 'error', 'no_item', 'item_id', v_id); end if;
      if v_kind = 'sale' and v_it.packs <= 0 and v_it.units <= 0 then return jsonb_build_object('ok', false, 'error', 'no_stock', 'item_id', v_id); end if;
      v_k := case when coalesce(v_it.parts, 1) > 1 then v_it.parts else 1 end;
      if v_unit = 'unit' and v_k = 1 then return jsonb_build_object('ok', false, 'error', 'lines'); end if;
      v_price := case when v_unit = 'unit' then round(v_it.price / v_k, 2) else round(v_it.price, 2) end;
      v_items := v_items || jsonb_build_array(jsonb_build_object('c', v_id, 'n', left(v_it.name, 250), 'q', v_qty, 'u', v_unit, 'p', v_price));
      v_total := v_total + round(v_qty * v_price, 2);
    end loop;
    v_total := round(v_total, 2);
    if v_expect is not null and abs(v_total - v_expect) > 1 then return jsonb_build_object('ok', false, 'error', 'price_changed', 'total', v_total); end if;
    -- a cash sale has no «paid»; a return: what was given back
    if v_cust is null and v_kind = 'sale' then v_paid := null; end if;
    v_uuid := gen_random_uuid();
    begin
      insert into public.ar_temp_sales (id, sold_at, kind, customer_id, customer_name, items, total, paid, note, status, adam_request, adam_seq)
      values (v_uuid, now(), v_kind, v_cust, left(v_name, 120), v_items, v_total, case when v_paid > 0 then v_paid else null end,
              nullif(left('آدم ' || btrim(coalesce(v_args ->> 'note', '')), 300), 'آدم '), 'pending', p_request, v_seq)
      returning no into v_no;
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'duplicate');
    end;
    return jsonb_build_object('ok', true, 'action', p_action, 'no', v_no, 'total', v_total, 'id', v_uuid);
  end if;

  -- cancel one of Adam's own operations that is still waiting
  if p_action = 'cancel_op' then
    begin
      v_id := (v_args ->> 'id')::bigint;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'args');
    end;
    if v_args ->> 'target' = 'op' then
      update public.ar_ops set status = 'cancelled', updated_at = now() where id = v_id and status = 'pending' and source = 'adam';
      get diagnostics v_n = row_count;
    elsif v_args ->> 'target' = 'sale' then
      update public.ar_temp_sales set status = 'cancelled', updated_at = now() where no = v_id and status = 'pending' and adam_request is not null;
      get diagnostics v_n = row_count;
    else
      return jsonb_build_object('ok', false, 'error', 'args');
    end if;
    if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'not_pending'); end if;
    return jsonb_build_object('ok', true, 'action', p_action, 'id', v_id);
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_action');
end $function$;
revoke all on function public.ar_adam_do(text, bigint, text, jsonb) from public;
grant execute on function public.ar_adam_do(text, bigint, text, jsonb) to anon, authenticated;
