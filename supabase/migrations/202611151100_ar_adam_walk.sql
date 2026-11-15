-- 202611151100_ar_adam_walk (owner 2026-11-15: «افتح حقيبة النواقص اليومية … يقرا لي … عايزين نعمل تحويل لحقيبة كذا، يبتدي يقرا لي
-- الاصناف وانا اقول له ايوه او لا … اعمل امر شراء … الصنف والمتوسط والموجود منه»; applied only after his «أيوه»)
-- ASKER «آدم»: Adam reads a bag item by item, the owner answers each one by voice; the items he said «أيوه» to become:
--   - a bag change -> rows in ar_bag_moves (202611150500, the same table the «الحقائب» page writes: one open move per item, the item
--     shows in its new bag at once, done when PharmaFly's copy shows it there; to_bag may be a bag id, 'gs' or 'pv');
--   - a purchase order -> ar_ops kind purchase_order with its items (jsonb [{i, n, q}]); amount is only for payments now;
--   - ar_adam_do gets record_bag_move / record_purchase_order (still only for a request he confirmed by voice);
--   - ar_adam_ask: a reply that walks a list (reply.walk) may be answered up to 30 minutes later (a list takes longer than 5 minutes).
-- Nothing here writes to PharmaFly: the laptop does it later on PharmaFly's own screens, after he teaches each screen once.
-- Rollback: recreate ar_adam_do from 202611150400 and ar_adam_ask from 202611150100; alter table public.ar_ops drop column items;
--   restore the kind / amount checks from 202611150400.

alter table public.ar_ops add column if not exists items jsonb;
alter table public.ar_ops drop constraint if exists ar_ops_kind_check;
alter table public.ar_ops add constraint ar_ops_kind_check check (kind in ('customer_payment', 'vendor_payment', 'purchase_order'));
alter table public.ar_ops alter column amount drop not null;
alter table public.ar_ops drop constraint if exists ar_ops_amount_check;
alter table public.ar_ops add constraint ar_ops_amount_check check (amount is null or (amount > 0 and amount <= 5000000));
alter table public.ar_ops drop constraint if exists ar_ops_money_has_amount;
alter table public.ar_ops add constraint ar_ops_money_has_amount check (kind not in ('customer_payment', 'vendor_payment') or amount is not null);
alter table public.ar_ops drop constraint if exists ar_ops_items_check;
alter table public.ar_ops add constraint ar_ops_items_check check (items is null or (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 200));
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
  v_from text; v_to text;
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

  -- a bag change (owner 2026-11-15: «عايزين نعمل تحويل لحقيبة كذا»): the items he said «أيوه» to go into ar_bag_moves exactly like the
  -- «الحقائب» page does it: an item's older open move is closed first (one open move per item), then the new one is written
  if p_action = 'record_bag_move' then
    v_from := v_args ->> 'from'; v_to := v_args ->> 'to';
    v_lines := v_args -> 'items';
    if v_from is null or v_to is null or v_from !~ '^(pv|gs|[0-9]{1,12})$' or v_to !~ '^(pv|gs|[0-9]{1,12})$' or v_from = v_to
       or jsonb_typeof(v_lines) is distinct from 'array' or jsonb_array_length(v_lines) not between 1 and 200 then
      return jsonb_build_object('ok', false, 'error', 'args');
    end if;
    v_n := 0;
    for v_line in select value from jsonb_array_elements(v_lines) loop
      begin
        v_id := (v_line ->> 'i')::bigint;
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'items');
      end;
      if v_id is null or v_id <= 0 then return jsonb_build_object('ok', false, 'error', 'items'); end if;
      update public.ar_bag_moves set status = 'cancelled', updated_at = now() where item_id = v_id and status = 'pending';
      insert into public.ar_bag_moves (item_id, item_name, from_bag, to_bag, item, status)
      values (v_id, nullif(left(coalesce(v_line ->> 'n', ''), 200), ''), v_from, v_to,
              case when jsonb_typeof(v_line -> 'x') = 'object' and pg_column_size(v_line -> 'x') <= 2000 then v_line -> 'x' end, 'pending');
      v_n := v_n + 1;
    end loop;
    return jsonb_build_object('ok', true, 'action', p_action, 'n', v_n, 'name', nullif(left(btrim(coalesce(v_args ->> 'to_name', '')), 160), ''));
  end if;

  -- a purchase order (owner 2026-11-15: «اعمل أمر شرا … الصنف والمتوسط والموجود منه»): the items he said «أيوه» to, with their
  -- quantities, recorded for the laptop to do in PharmaFly's own screens. The names come from the laptop (PharmaFly), for the list only.
  if p_action = 'record_purchase_order' then
    begin
      v_id := (v_args ->> 'to')::bigint;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'args');
    end;
    v_lines := v_args -> 'items';
    if v_id is null or v_id <= 0 or jsonb_typeof(v_lines) is distinct from 'array' or jsonb_array_length(v_lines) not between 1 and 200 then
      return jsonb_build_object('ok', false, 'error', 'args');
    end if;
    v_items := '[]'::jsonb;
    for v_line in select value from jsonb_array_elements(v_lines) loop
      begin
        v_k := null;
        if p_action = 'record_purchase_order' then
          v_qty := (v_line ->> 'q')::numeric;
          if v_qty is null or v_qty < 1 or v_qty > 9999 or v_qty <> floor(v_qty) then return jsonb_build_object('ok', false, 'error', 'items'); end if;
        end if;
        if (v_line ->> 'i')::bigint is null or (v_line ->> 'i')::bigint <= 0 then return jsonb_build_object('ok', false, 'error', 'items'); end if;
        v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('i', (v_line ->> 'i')::bigint, 'n', left(coalesce(v_line ->> 'n', ''), 250),
                     'q', case when p_action = 'record_purchase_order' then (v_line ->> 'q')::numeric end)));
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'items');
      end;
    end loop;
    v_name := nullif(left(btrim(coalesce(v_args ->> 'to_name', '')), 160), '');
    v_note := nullif(left(btrim(coalesce(v_args ->> 'note', '')), 300), '');
    begin
      insert into public.ar_ops (kind, party_id, party_name, amount, items, note, request_id, seq)
      values ('purchase_order', v_id, v_name, null, v_items, v_note, p_request, v_seq)
      returning id into v_opid;
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'duplicate');
    end;
    return jsonb_build_object('ok', true, 'action', p_action, 'op_id', v_opid, 'name', v_name, 'n', jsonb_array_length(v_items));
  end if;
  return jsonb_build_object('ok', false, 'error', 'unknown_action');
end $function$;
revoke all on function public.ar_adam_do(text, bigint, text, jsonb) from public;
grant execute on function public.ar_adam_do(text, bigint, text, jsonb) to anon, authenticated;

-- the phone: a new request, or his answer to a confirmation. Same as 202611150100, except: a reply that walks a list (reply ? 'walk')
-- may be answered up to 30 minutes after it was given (he answers item by item first).
create or replace function public.ar_adam_ask(p_key text, p_convo text, p_body text, p_confirm_of bigint default null, p_answer text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint; v_orig record; v_laptop boolean;
begin
  if public.ar_adam_role(p_key) is distinct from 'phone' then return jsonb_build_object('ok', false, 'error', 'key'); end if;
  if p_convo is null or char_length(p_convo) not between 1 and 64 then return jsonb_build_object('ok', false, 'error', 'convo'); end if;
  if p_body is null or char_length(btrim(p_body)) = 0 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if (select count(*) from public.ar_adam_requests r where r.created_at > now() - interval '1 minute') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'rate');
  end if;
  select (s.laptop_seen_at > now() - interval '90 seconds') into v_laptop from public.ar_adam_state s where s.id = 1;
  if p_confirm_of is not null then
    if p_answer is null or p_answer not in ('yes', 'no') then return jsonb_build_object('ok', false, 'error', 'answer'); end if;
    select r.id, r.convo, r.status, r.reply, r.done_at into v_orig from public.ar_adam_requests r where r.id = p_confirm_of;
    if v_orig.id is null or v_orig.convo <> p_convo or v_orig.status <> 'done' or jsonb_typeof(v_orig.reply -> 'confirm') is distinct from 'object'
       or v_orig.done_at < now() - (case when v_orig.reply ? 'walk' then interval '30 minutes' else interval '5 minutes' end)
       or exists (select 1 from public.ar_adam_requests c where c.confirm_of = p_confirm_of) then
      return jsonb_build_object('ok', false, 'error', 'no_pending');
    end if;
    if p_answer = 'no' then
      insert into public.ar_adam_requests (convo, body, confirm_of, answer, status, reply, picked_at, done_at)
      values (p_convo, left(p_body, 1500), p_confirm_of, 'no', 'done', jsonb_build_object('speak', 'تمام، ماعملتش حاجة', 'show', 'اتلغى'), now(), now())
      returning id into v_id;
    else
      insert into public.ar_adam_requests (convo, body, confirm_of, answer, confirmed_at)
      values (p_convo, left(p_body, 1500), p_confirm_of, 'yes', now())
      returning id into v_id;
    end if;
  else
    insert into public.ar_adam_requests (convo, body) values (p_convo, left(btrim(p_body), 1500)) returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'laptop_ok', coalesce(v_laptop, false));
end $function$;
revoke all on function public.ar_adam_ask(text, text, text, bigint, text) from public;
grant execute on function public.ar_adam_ask(text, text, text, bigint, text) to anon, authenticated;