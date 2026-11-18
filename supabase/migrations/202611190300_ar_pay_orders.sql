-- 202611190300_ar_pay_orders (owner 2026-11-19 ~00:45: «عايزين نعمل حساب المدفوعات، ان انت تدفع من الخزنة اللي احنا ثبتناها في
-- السيستم بتاعنا لأماكن المدفوعات، بقى ايه زي الموردين، المصروفات … عشان نعرف نديرها برضو من هنا»; he chose «ب» for now: the
-- system keeps the payment orders, he approves each one and enters it in PharmaFly by hand, the system closes it by itself.
-- Plan: D:\pharmayaqez\Side\PAYMENTS_PLAN_2026-11-19.md, mockup mockups\payments_2026-11-19.png.)
-- ASKER «الحسابات ← 💸 المدفوعات»:
--   ar_pay_orders  : one row per payment order: a supplier (vendor_id = PharmaFly's card) or an expense category (cat_id =
--                    CashAccountsOthers.ID), from which box (account_id), how much, a note. status:
--                      waiting   saved, not approved yet
--                      approved  the owner approved it: waiting to be entered in PharmaFly
--                      matched   the move came in from PharmaFly with the same box, party and amount (move_id = that move)
--                      mismatch  a move of the same party came in after the order but with another amount or box (move_id = it);
--                                the owner says «that's it» (accept → matched) or «not it» (skip: kept in skip, back to approved)
--                      cancelled
--   ar_cash_cats   : PharmaFly's expense categories (CashAccountsOthers), sent by the laptop with the boxes.
--   ar_cash_moves.dealer_id : the supplier's card of a supplier payment (CashFlow.DealerID), so an order matches the right card
--                    (two cards can share a short name: IBN 188/2495, PHAR 161/2271). Old rows without it match by name.
--   Matching (ar_pay_match): after every upload of moves (a statement trigger on ar_cash_moves) and right after an approval. A move
--   matches an order when: the same box, the same supplier card (CashFlow op 9) or category (op 1000 + category), the same amount,
--   at or after the order was made (PharmaFly's local time, 30 minutes of slack), and no other order took it.
-- Read: the OWNER only. Writes: only through ar_pay_order_save / ar_pay_order_act (owner only). Nothing here writes to PharmaFly.
-- Rollback: drop trigger ar_cash_moves_pay_match on public.ar_cash_moves; drop function public.ar_pay_match_trg();
--   drop function public.ar_pay_order_act(bigint, text); drop function public.ar_pay_order_save(bigint, text, int, bigint, numeric, text, boolean);
--   drop function public.ar_pay_match(); drop table public.ar_pay_orders; drop table public.ar_cash_cats;
--   drop function public.ar_cash_sync(text, jsonb, jsonb, jsonb, jsonb); re-run the ar_cash_sync part of 202611151900_ar_cash.sql;
--   alter table public.ar_cash_moves drop column dealer_id;

alter table public.ar_cash_moves add column if not exists dealer_id bigint;

create table if not exists public.ar_cash_cats (
  id int primary key,
  name text not null check (char_length(name) between 1 and 120),
  updated_at timestamptz not null default now()
);
alter table public.ar_cash_cats enable row level security;
drop policy if exists "Owner reads ar cash cats" on public.ar_cash_cats;
create policy "Owner reads ar cash cats" on public.ar_cash_cats for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create table if not exists public.ar_pay_orders (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('vendor', 'expense')),
  account_id int not null,
  account_name text check (account_name is null or char_length(account_name) <= 120),
  vendor_id bigint,
  cat_id int,
  who text check (who is null or char_length(who) <= 160),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 5000000),
  memo text check (memo is null or char_length(memo) <= 200),
  status text not null default 'waiting' check (status in ('waiting', 'approved', 'matched', 'mismatch', 'cancelled')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  move_id bigint,
  move jsonb,
  skip bigint[] not null default '{}',
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((kind = 'vendor' and vendor_id is not null and cat_id is null) or (kind = 'expense' and cat_id is not null and vendor_id is null))
);
create index if not exists ar_pay_orders_open on public.ar_pay_orders (status, created_at desc);
create unique index if not exists ar_pay_orders_one_move on public.ar_pay_orders (move_id) where status = 'matched';
alter table public.ar_pay_orders enable row level security;
drop policy if exists "Owner reads ar pay orders" on public.ar_pay_orders;
create policy "Owner reads ar pay orders" on public.ar_pay_orders for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

-- ---------- the laptop's upload: the same as 202611151900, plus the supplier's card on a move and the expense categories ----------
drop function if exists public.ar_cash_sync(text, jsonb, jsonb, jsonb);
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
      and e->>'kind' in ('sales', 'customer', 'vendor', 'drawer_out', 'drawer_in', 'transfer_out', 'transfer_in', 'expense', 'other_in', 'other_out')
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

-- ---------- matching the open orders with the moves that came from PharmaFly ----------
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
         or (o.kind = 'expense' and c.op = 1000 + o.cat_id))
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
         or (o.kind = 'expense' and c.op = 1000 + o.cat_id))
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

create or replace function public.ar_pay_match_trg()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if exists (select 1 from public.ar_pay_orders where status in ('approved', 'mismatch')) then
    perform public.ar_pay_match();
  end if;
  return null;
end $function$;
revoke all on function public.ar_pay_match_trg() from public, anon, authenticated;
drop trigger if exists ar_cash_moves_pay_match on public.ar_cash_moves;
create trigger ar_cash_moves_pay_match after insert or update on public.ar_cash_moves
  for each statement execute function public.ar_pay_match_trg();

-- ---------- the owner's screen: save (new or a waiting one), and approve / cancel / accept / skip ----------
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
  if p_kind is null or p_kind not in ('vendor', 'expense') then return jsonb_build_object('ok', false, 'error', 'kind'); end if;
  v_amt := round(p_amount, 2);
  if v_amt is null or v_amt <= 0 or v_amt > 5000000 then return jsonb_build_object('ok', false, 'error', 'amount'); end if;
  select a.name into v_acc from public.ar_cash_accounts a where a.id = p_account;
  if v_acc is null then return jsonb_build_object('ok', false, 'error', 'account'); end if;
  if p_kind = 'vendor' then
    select coalesce(nullif(v.name, ''), v.short) into v_who from public.ar_vendors v where v.id = p_party;
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

create or replace function public.ar_pay_order_act(p_id bigint, p_action text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  o record; v_st text;
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    raise exception 'owner only' using errcode = '42501';
  end if;
  select * into o from public.ar_pay_orders where id = p_id for update;
  if o.id is null then return jsonb_build_object('ok', false, 'error', 'no_order'); end if;
  if p_action = 'approve' then
    if o.status <> 'waiting' then return jsonb_build_object('ok', false, 'error', 'not_waiting'); end if;
    update public.ar_pay_orders set status = 'approved', approved_at = now(), updated_at = now() where id = p_id;
    perform public.ar_pay_match();
  elsif p_action = 'cancel' then
    if o.status not in ('waiting', 'approved', 'mismatch') then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
    update public.ar_pay_orders set status = 'cancelled', closed_at = now(), updated_at = now() where id = p_id;
  elsif p_action = 'accept' then
    -- «هي دي»: the move that differs is this order's payment
    if o.status <> 'mismatch' or o.move_id is null then return jsonb_build_object('ok', false, 'error', 'not_mismatch'); end if;
    if exists (select 1 from public.ar_pay_orders x where x.move_id = o.move_id and x.status = 'matched') then
      return jsonb_build_object('ok', false, 'error', 'taken');
    end if;
    update public.ar_pay_orders set status = 'matched', closed_at = now(), updated_at = now() where id = p_id;
    perform public.ar_pay_match();
  elsif p_action = 'skip' then
    -- «مش هي»: that move is another payment; the order waits for its own
    if o.status <> 'mismatch' or o.move_id is null then return jsonb_build_object('ok', false, 'error', 'not_mismatch'); end if;
    update public.ar_pay_orders set status = 'approved', skip = skip || o.move_id, move_id = null, move = null, updated_at = now() where id = p_id;
    perform public.ar_pay_match();
  else
    return jsonb_build_object('ok', false, 'error', 'action');
  end if;
  select x.status into v_st from public.ar_pay_orders x where x.id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id, 'status', v_st);
end $function$;
revoke all on function public.ar_pay_order_act(bigint, text) from public, anon;
grant execute on function public.ar_pay_order_act(bigint, text) to authenticated;
