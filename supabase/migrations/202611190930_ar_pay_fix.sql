-- 202611190930_ar_pay_fix (owner 2026-11-19, «💸 المدفوعات»: «اسمها دعم من صاحب المنشاه ساعات بستخدمها للتصحيح عشان لما بيحصل اخطاؤ
-- دفع مبتتصلحش عالسيستم … لو دفعت ١٠ جنيه لحد بدل ما ادفع ٥ فكده الخزنه بتزيد فبصلح حسابه بطريقه مبتسمحش لرجوع الفلوس للخزنه …
-- بس عشان اصلح الخزنه بضطر اعمل الدعم»; he said «ا» to: the system understands this and closes the order by itself).
-- A payment entered in PharmaFly with MORE than the order (10 instead of 5), then «دعم من صاحب المنشأة» (CashFlow op 50) in the same
-- box for the difference (one or several, back to back: the data has 534 then 81.53 + 162.57 + 40), within 3 days after the payment
-- (the data: 1 to 55 minutes, a few the next day) → the order closes (matched) by itself, and the order keeps which «دعم» fixed it:
--   ar_pay_orders.fix_ids : the op 50 moves that corrected it (one «دعم» corrects one order only);
--   ar_pay_orders.move     : + fix (their total) and fix_ids, for the screen («اتصلّح بدعم 5 ج»).
-- A «دعم» with no payment before it (bank profits, «كريدت المشرق») is never touched: it only counts when it equals the difference
-- exactly. A paid-more move he said «مش هي» to (skip) is not used. Without the «دعم» it stays «فيه فرق» as before.
-- Rollback: re-run ar_pay_match from 202611190400; drop function public.ar_pay_fix(int, timestamp, numeric, bigint);
--   alter table public.ar_pay_orders drop column fix_ids;

alter table public.ar_pay_orders add column if not exists fix_ids bigint[] not null default '{}';

-- the «دعم» moves (op 50) in box p_acc after p_after (3 days at most), back to back, that add up to p_need exactly; null when none.
-- A «دعم» that already corrected another closed order is not used again.
create or replace function public.ar_pay_fix(p_acc int, p_after timestamp, p_need numeric, p_self bigint)
returns bigint[]
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_ids bigint[]; v_amts numeric[]; v_n int; v_s numeric; i int; j int;
begin
  if p_acc is null or p_after is null or p_need is null or p_need <= 0 then return null; end if;
  select array_agg(t.id order by t.at, t.id), array_agg(t.amount order by t.at, t.id) into v_ids, v_amts
    from (select c.id, c.at, c.amount
            from public.ar_cash_moves c
           where c.account_id = p_acc and c.op = 50 and c.amount > 0
             and c.at >= p_after and c.at <= p_after + interval '3 days'
             and not exists (select 1 from public.ar_pay_orders x
                              where x.status = 'matched' and x.id is distinct from p_self and c.id = any (x.fix_ids))
           order by c.at, c.id
           limit 12) t;
  v_n := coalesce(array_length(v_ids, 1), 0);
  for i in 1 .. v_n loop
    v_s := 0;
    for j in i .. v_n loop
      v_s := v_s + v_amts[j];
      if v_s = p_need then return v_ids[i:j]; end if;
      exit when v_s > p_need;
    end loop;
  end loop;
  return null;
end $function$;
revoke all on function public.ar_pay_fix(int, timestamp, numeric, bigint) from public, anon, authenticated;

-- ---------- matching: the same as 202611190400, plus 1b) paid more, then corrected with «دعم من صاحب المنشأة» ----------
create or replace function public.ar_pay_match()
returns int
language plpgsql
security definer
set search_path to ''
as $function$
declare
  o record; m record; v_id bigint; v_at timestamp; v_acc int; v_amt numeric; v_who text; v_from timestamp; v_n int := 0;
  v_fix bigint[]; v_sum numeric;
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
  -- 1b) paid MORE than the order from the same box, then «دعم من صاحب المنشأة» in that box for the difference (owner 2026-11-19)
  for o in select * from public.ar_pay_orders where status in ('approved', 'mismatch') order by created_at, id loop
    v_from := (o.created_at at time zone 'Africa/Cairo') - interval '30 minutes';
    for m in select c.id, c.at, c.account_id, c.amount, c.who
               from public.ar_cash_moves c
              where c.account_id = o.account_id and -c.amount > o.amount and c.at >= v_from
                and ((o.kind = 'vendor' and c.op = 9 and (c.dealer_id = o.vendor_id or (c.dealer_id is null and c.who = o.who)))
                  or (o.kind = 'expense' and c.op = 1000 + o.cat_id)
                  or (o.kind = 'owner' and c.op = 51))
                and not (c.id = any (o.skip))
                and not exists (select 1 from public.ar_pay_orders x where x.move_id = c.id and x.status = 'matched')
              order by c.at, c.id
              limit 20
    loop
      v_fix := public.ar_pay_fix(m.account_id, m.at, -m.amount - o.amount, o.id);
      if v_fix is not null then
        select coalesce(sum(c.amount), 0) into v_sum from public.ar_cash_moves c where c.id = any (v_fix);
        update public.ar_pay_orders
           set status = 'matched', move_id = m.id, fix_ids = v_fix, closed_at = now(), updated_at = now(),
               move = jsonb_build_object('id', m.id, 'at', m.at, 'account_id', m.account_id, 'amount', m.amount, 'who', m.who,
                                         'fix', v_sum, 'fix_ids', to_jsonb(v_fix))
         where id = o.id;
        v_n := v_n + 1;
        exit;
      end if;
    end loop;
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
