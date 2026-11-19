-- 202611190400_ar_pay_owner (owner 2026-11-19, after «💸 المدفوعات» went live: «انت ازاى ما حسبتش الدفع لصاحب المنشاه … عمر الخزن ما
-- هتظبط معاك من غيرها اصلا هتلاقى فرق دايما»).
-- PharmaFly writes the money the owner takes out of a box as CashFlow Operation 51 (checked on data 2026-11-19: the notes are «طاهر»
-- 78 times, «ام طاهر», «طاهر دهب», «القرض», «المحامى»…; ~1.05 million in 2026). Until now it was «other_out» with its number.
--   ar_cash_moves.kind 'owner' = op 51 (the laptop sends it so from Store\SYNC_CASH.ps1 after this migration);
--   ar_pay_orders.kind 'owner' = a payment order to the owner: a box, an amount, a note (who it is for); no supplier, no category;
--   matching: the same box and amount with op 51 (ar_pay_match), the same rules as the suppliers and the expenses.
-- Op 50 (a small «in» with no party) is left as it is: not named yet.
-- Rollback: the three functions from 202611190300 (re-run their blocks); the two checks back to their 202611190300 lists (after
--   update public.ar_cash_moves set kind = 'other_out' where kind = 'owner'; and no 'owner' order left).

alter table public.ar_cash_moves drop constraint if exists ar_cash_moves_kind_check;
alter table public.ar_cash_moves add constraint ar_cash_moves_kind_check
  check (kind in ('sales', 'customer', 'vendor', 'drawer_out', 'drawer_in', 'transfer_out', 'transfer_in', 'expense', 'owner', 'other_in', 'other_out'));

alter table public.ar_pay_orders drop constraint if exists ar_pay_orders_kind_check;
alter table public.ar_pay_orders add constraint ar_pay_orders_kind_check check (kind in ('vendor', 'expense', 'owner'));
alter table public.ar_pay_orders drop constraint if exists ar_pay_orders_check;
alter table public.ar_pay_orders add constraint ar_pay_orders_check
  check ((kind = 'vendor' and vendor_id is not null and cat_id is null) or (kind = 'expense' and cat_id is not null and vendor_id is null)
      or (kind = 'owner' and vendor_id is null and cat_id is null));

-- ---------- the laptop's upload: the same as 202611190300, plus the kind 'owner' ----------
create or replace function public.ar_cash_sync(p_key text, p_accounts jsonb, p_moves jsonb, p_gone jsonb default '[]'::jsonb, p_cats jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; v_na int; v_nm int; v_ng int; v_nc int; v_a int := 0; v_m int := 0; v_g int := 0; v_c int := 0;
  v_num text := '^-?[0-9]{1,12}(\.[0-9]+)?$';
  v_ts text := '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$';
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if jsonb_typeof(coalesce(p_accounts, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_moves, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_gone, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_cats, '[]'::jsonb)) <> 'array' then
    raise exception 'rows must be arrays';
  end if;
  v_na := jsonb_array_length(coalesce(p_accounts, '[]'::jsonb));
  v_nm := jsonb_array_length(coalesce(p_moves, '[]'::jsonb));
  v_ng := jsonb_array_length(coalesce(p_gone, '[]'::jsonb));
  v_nc := jsonb_array_length(coalesce(p_cats, '[]'::jsonb));
  if v_na > 200 or v_nm > 5000 or v_nc > 500 then raise exception 'batch too big'; end if;
  if v_ng > 5000 then raise exception 'too many gone (max 5000)'; end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_cash_sync'));

  if v_na > 0 then
    insert into public.ar_cash_accounts as t (id, name, type, balance, last_at, updated_at)
    select (e->>'id')::int, left(btrim(e->>'name'), 120),
           case when (e->>'type') ~ '^-?[0-9]{1,4}$' then (e->>'type')::int end,
           case when (e->>'balance') ~ v_num then round((e->>'balance')::numeric, 2) else 0 end,
           case when (e->>'last_at') ~ v_ts then (e->>'last_at')::timestamp end,
           now()
    from jsonb_array_elements(p_accounts) e
    where (e->>'id') ~ '^[0-9]{1,9}$' and char_length(btrim(coalesce(e->>'name', ''))) between 1 and 120
    on conflict (id) do update set
      name = excluded.name, type = excluded.type, balance = excluded.balance, last_at = excluded.last_at, updated_at = now()
    where (t.name, t.type, t.balance, t.last_at) is distinct from (excluded.name, excluded.type, excluded.balance, excluded.last_at);
    get diagnostics v_a = row_count;
  end if;

  if v_nc > 0 then
    insert into public.ar_cash_cats as t (id, name, updated_at)
    select (e->>'id')::int, left(btrim(e->>'name'), 120), now()
    from jsonb_array_elements(p_cats) e
    where (e->>'id') ~ '^[0-9]{1,6}$' and char_length(btrim(coalesce(e->>'name', ''))) between 1 and 120
    on conflict (id) do update set name = excluded.name, updated_at = now()
    where t.name is distinct from excluded.name;
    get diagnostics v_c = row_count;
  end if;

  if v_nm > 0 then
    insert into public.ar_cash_moves as t (id, account_id, at, op, kind, amount, who, memo, n, dealer_id, updated_at)
    select (e->>'id')::bigint, (e->>'account_id')::int, (e->>'at')::timestamp,
           case when (e->>'op') ~ '^[0-9]{1,6}$' then (e->>'op')::int end,
           e->>'kind',
           case when (e->>'amount') ~ v_num then round((e->>'amount')::numeric, 2) else 0 end,
           nullif(left(btrim(coalesce(e->>'who', '')), 120), ''),
           nullif(left(btrim(coalesce(e->>'memo', '')), 200), ''),
           case when (e->>'n') ~ '^[0-9]{1,9}$' then (e->>'n')::int end,
           case when (e->>'dealer_id') ~ '^[0-9]{1,12}$' then (e->>'dealer_id')::bigint end,
           now()
    from jsonb_array_elements(p_moves) e
    where (e->>'id') ~ '^-?[0-9]{1,15}$' and (e->>'account_id') ~ '^[0-9]{1,9}$' and (e->>'at') ~ v_ts
      and e->>'kind' in ('sales', 'customer', 'vendor', 'drawer_out', 'drawer_in', 'transfer_out', 'transfer_in', 'expense', 'owner', 'other_in', 'other_out')
    on conflict (id) do update set
      account_id = excluded.account_id, at = excluded.at, op = excluded.op, kind = excluded.kind, amount = excluded.amount,
      who = excluded.who, memo = excluded.memo, n = excluded.n, dealer_id = excluded.dealer_id, updated_at = now()
    where (t.account_id, t.at, t.op, t.kind, t.amount, t.who, t.memo, t.n, t.dealer_id)
          is distinct from (excluded.account_id, excluded.at, excluded.op, excluded.kind, excluded.amount, excluded.who, excluded.memo, excluded.n, excluded.dealer_id);
    get diagnostics v_m = row_count;
  end if;

  if v_ng > 0 then
    delete from public.ar_cash_moves
    where id in (select (g #>> '{}')::bigint from jsonb_array_elements(p_gone) g where (g #>> '{}') ~ '^-?[0-9]{1,15}$');
    get diagnostics v_g = row_count;
  end if;
  return jsonb_build_object('ok', true, 'accounts', v_a, 'moves', v_m, 'gone', v_g, 'cats', v_c);
end $function$;
revoke all on function public.ar_cash_sync(text, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.ar_cash_sync(text, jsonb, jsonb, jsonb, jsonb) to anon, authenticated;

-- ---------- matching: the owner's payments too (op 51) ----------
create or replace function public.ar_pay_match()
returns int
language plpgsql
security definer
set search_path to ''
as $function$
declare
  o record; v_id bigint; v_at timestamp; v_acc int; v_amt numeric; v_who text; v_from timestamp; v_n int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('public.ar_pay_match'));
  -- 1) the exact move: oldest order first, oldest move first, a move closes one order only
  for o in select * from public.ar_pay_orders where status in ('approved', 'mismatch') order by created_at, id loop
    v_from := (o.created_at at time zone 'Africa/Cairo') - interval '30 minutes';
    v_id := null;
    select c.id, c.at, c.account_id, c.amount, c.who into v_id, v_at, v_acc, v_amt, v_who
      from public.ar_cash_moves c
     where c.account_id = o.account_id and c.amount = -o.amount and c.at >= v_from
       and ((o.kind = 'vendor' and c.op = 9 and (c.dealer_id = o.vendor_id or (c.dealer_id is null and c.who = o.who)))
         or (o.kind = 'expense' and c.op = 1000 + o.cat_id)
         or (o.kind = 'owner' and c.op = 51))
       and not exists (select 1 from public.ar_pay_orders x where x.move_id = c.id and x.status = 'matched')
     order by c.at, c.id
     limit 1;
    if v_id is not null then
      update public.ar_pay_orders
         set status = 'matched', move_id = v_id, closed_at = now(), updated_at = now(),
             move = jsonb_build_object('id', v_id, 'at', v_at, 'account_id', v_acc, 'amount', v_amt, 'who', v_who)
       where id = o.id;
      v_n := v_n + 1;
    end if;
  end loop;
  -- 2) what is still open: a move of the same party after the order, that no order took and the owner did not say «not it»
  for o in select * from public.ar_pay_orders where status in ('approved', 'mismatch') order by created_at, id loop
    v_from := (o.created_at at time zone 'Africa/Cairo') - interval '30 minutes';
    v_id := null;
    select c.id, c.at, c.account_id, c.amount, c.who into v_id, v_at, v_acc, v_amt, v_who
      from public.ar_cash_moves c
     where c.at >= v_from and c.amount < 0
       and ((o.kind = 'vendor' and c.op = 9 and (c.dealer_id = o.vendor_id or (c.dealer_id is null and c.who = o.who)))
         or (o.kind = 'expense' and c.op = 1000 + o.cat_id)
         or (o.kind = 'owner' and c.op = 51))
       and not (c.id = any (o.skip))
       and not exists (select 1 from public.ar_pay_orders x where x.move_id = c.id and x.status = 'matched')
     order by c.at, c.id
     limit 1;
    if v_id is not null then
      if o.status <> 'mismatch' or o.move_id is distinct from v_id then
        update public.ar_pay_orders
           set status = 'mismatch', move_id = v_id, updated_at = now(),
               move = jsonb_build_object('id', v_id, 'at', v_at, 'account_id', v_acc, 'amount', v_amt, 'who', v_who)
         where id = o.id;
      end if;
    elsif o.status = 'mismatch' then
      update public.ar_pay_orders set status = 'approved', move_id = null, move = null, updated_at = now() where id = o.id;
    end if;
  end loop;
  return v_n;
end $function$;
revoke all on function public.ar_pay_match() from public, anon, authenticated;

-- ---------- the owner's screen: a payment to the owner (no supplier, no category) ----------
create or replace function public.ar_pay_order_save(p_id bigint, p_kind text, p_account int, p_party bigint, p_amount numeric, p_memo text, p_approve boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_acc text; v_who text; v_amt numeric; v_memo text; v_id bigint; v_st text;
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('vendor', 'expense', 'owner') then return jsonb_build_object('ok', false, 'error', 'kind'); end if;
  v_amt := round(p_amount, 2);
  if v_amt is null or v_amt <= 0 or v_amt > 5000000 then return jsonb_build_object('ok', false, 'error', 'amount'); end if;
  select a.name into v_acc from public.ar_cash_accounts a where a.id = p_account;
  if v_acc is null then return jsonb_build_object('ok', false, 'error', 'account'); end if;
  if p_kind = 'vendor' then
    select coalesce(nullif(v.name, ''), v.short) into v_who from public.ar_vendors v where v.id = p_party;
  elsif p_kind = 'owner' then
    v_who := 'صاحب المنشأة';
  else
    select c.name into v_who from public.ar_cash_cats c where c.id = p_party;
  end if;
  if v_who is null then return jsonb_build_object('ok', false, 'error', 'party'); end if;
  v_memo := nullif(left(btrim(coalesce(p_memo, '')), 200), '');
  if p_id is null then
    insert into public.ar_pay_orders (kind, account_id, account_name, vendor_id, cat_id, who, amount, memo, status, approved_at)
    values (p_kind, p_account, left(v_acc, 120), case when p_kind = 'vendor' then p_party end, case when p_kind = 'expense' then p_party::int end,
            left(v_who, 160), v_amt, v_memo, case when p_approve then 'approved' else 'waiting' end, case when p_approve then now() end)
    returning id into v_id;
  else
    update public.ar_pay_orders
       set kind = p_kind, account_id = p_account, account_name = left(v_acc, 120),
           vendor_id = case when p_kind = 'vendor' then p_party end, cat_id = case when p_kind = 'expense' then p_party::int end,
           who = left(v_who, 160), amount = v_amt, memo = v_memo,
           status = case when p_approve then 'approved' else 'waiting' end, approved_at = case when p_approve then now() end, updated_at = now()
     where id = p_id and status = 'waiting'
    returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'not_waiting'); end if;
  end if;
  if p_approve then perform public.ar_pay_match(); end if;
  select o.status into v_st from public.ar_pay_orders o where o.id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'status', v_st);
end $function$;
revoke all on function public.ar_pay_order_save(bigint, text, int, bigint, numeric, text, boolean) from public, anon;
grant execute on function public.ar_pay_order_save(bigint, text, int, bigint, numeric, text, boolean) to authenticated;
