-- 202611142000_ar_vendors (NOT applied yet: the owner said «كمل شغلك» 2026-11-14 to the plan and the mockup
-- mockups\suppliers_2026-11-14.png)
-- ASKER: «الحسابات ← الموردين» (owner 2026-11-14: «حسابات الموردين وحركة الحساب والقدرة على ان انا اعرف في صنف معين جاي من مين
-- امتى وامتى وامتى … بتاريخ ايه وصلاحية ايه … المرتجعات لكل مورد من تاريخ معين»).
--   ar_vendors      : every supplier card that has a move: name, short name, balance now, last invoice, last payment.
--   ar_vendor_moves : every purchase invoice, return and payment since 2018 with the balance after it.
--     amount = what it did to the balance: a purchase +AmountAdjustment, a return AmountAdjustment (negative), a payment
--     CashFlow.Amount (negative). The balance rule was checked against PharmaFly's own screen on 2026-11-14 (AMG 96,422.75):
--     Σ AmountAdjustment + Σ CashFlow Operation 9. total = the invoice's own lines (PharmaFly's «total»).
--     A payment has id = -CashFlow.ID. lines = [{i item, p packs, u units, k units in a pack, b bonus, c cost of a pack,
--     t discount %, x expiry yyyy-mm-dd}]; items = their ids (GIN: «this item came from whom and when»). lines can be null:
--     the laptop sends an old invoice's lines once and later only what changed in its header.
--   Filled by the laptop's hub (Store\SYNC_VENDORS.ps1, read only on PharmaFly) through ar_vendors_sync with the laptop key.
--   Read: the owner, and a staff member with «vendors» open. Sizes 2026-11-14: 319 cards, ~25.8k invoices, ~2.2k payments.
-- Rollback: drop function public.ar_vendors_sync(text, jsonb, jsonb, jsonb); drop function public.ar_vendor_period(bigint,
--   timestamp, timestamp); drop function public.ar_vendor_item_moves(int, text, bigint, int); drop function
--   public.ar_vendor_item_summary(int); drop function public.ar_vendor_find_items(text, int); drop table public.ar_vendor_moves;
--   drop table public.ar_vendors;
create table if not exists public.ar_vendors (
  id bigint primary key,
  name text not null check (char_length(name) between 1 and 120),
  short text,
  active boolean,
  balance numeric(14, 2) not null default 0,
  invoices int not null default 0 check (invoices >= 0),
  last_invoice_at timestamp,
  last_payment_at timestamp,
  last_payment numeric(14, 2),
  updated_at timestamptz not null default now()
);
alter table public.ar_vendors enable row level security;
drop policy if exists "Owner or vendors staff read ar vendors" on public.ar_vendors;
create policy "Owner or vendors staff read ar vendors" on public.ar_vendors for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid or (select public.ar_staff_can(array['vendors']::text[])));

create table if not exists public.ar_vendor_moves (
  id bigint primary key,
  vendor_id bigint not null,
  at timestamp not null,
  kind text not null check (kind in ('purchase', 'return', 'payment')),
  code text,
  inv_date date,
  amount numeric(14, 2) not null default 0,
  total numeric(14, 2),
  balance numeric(14, 2),
  items int[] not null default '{}',
  lines jsonb check (lines is null or jsonb_typeof(lines) = 'array'),
  updated_at timestamptz not null default now()
);
create index if not exists ar_vendor_moves_vendor_at on public.ar_vendor_moves (vendor_id, at desc, id desc);
create index if not exists ar_vendor_moves_items on public.ar_vendor_moves using gin (items);
alter table public.ar_vendor_moves enable row level security;
drop policy if exists "Owner or vendors staff read ar vendor moves" on public.ar_vendor_moves;
create policy "Owner or vendors staff read ar vendor moves" on public.ar_vendor_moves for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid or (select public.ar_staff_can(array['vendors']::text[])));

-- ---------- the laptop's upload ----------
create or replace function public.ar_vendors_sync(p_key text, p_vendors jsonb, p_moves jsonb, p_gone jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; v_nv int; v_nm int; v_ng int; v_v int := 0; v_m int := 0; v_g int := 0;
  v_num text := '^-?[0-9]{1,12}(\.[0-9]+)?$';
  v_ts text := '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$';
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if jsonb_typeof(coalesce(p_vendors, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_moves, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_gone, '[]'::jsonb)) <> 'array' then raise exception 'rows must be arrays'; end if;
  v_nv := jsonb_array_length(coalesce(p_vendors, '[]'::jsonb));
  v_nm := jsonb_array_length(coalesce(p_moves, '[]'::jsonb));
  v_ng := jsonb_array_length(coalesce(p_gone, '[]'::jsonb));
  if v_nv > 2000 or v_nm > 5000 then raise exception 'batch too big'; end if;
  if v_ng > 2000 then raise exception 'too many gone (max 2000)'; end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_vendors_sync'));

  if v_nv > 0 then
    insert into public.ar_vendors as t (id, name, short, active, balance, invoices, last_invoice_at, last_payment_at, last_payment, updated_at)
    select (e->>'id')::bigint, left(btrim(e->>'name'), 120), nullif(left(btrim(coalesce(e->>'short', '')), 20), ''),
           case when e->>'active' in ('true', 'false') then (e->>'active')::boolean end,
           case when (e->>'balance') ~ v_num then round((e->>'balance')::numeric, 2) else 0 end,
           case when (e->>'invoices') ~ '^[0-9]{1,9}$' then (e->>'invoices')::int else 0 end,
           case when (e->>'last_invoice_at') ~ v_ts then (e->>'last_invoice_at')::timestamp end,
           case when (e->>'last_payment_at') ~ v_ts then (e->>'last_payment_at')::timestamp end,
           case when (e->>'last_payment') ~ v_num then round((e->>'last_payment')::numeric, 2) end,
           now()
    from jsonb_array_elements(p_vendors) e
    where (e->>'id') ~ '^[0-9]{1,12}$' and char_length(btrim(coalesce(e->>'name', ''))) between 1 and 120
    on conflict (id) do update set
      name = excluded.name, short = excluded.short, active = excluded.active, balance = excluded.balance, invoices = excluded.invoices,
      last_invoice_at = excluded.last_invoice_at, last_payment_at = excluded.last_payment_at, last_payment = excluded.last_payment, updated_at = now()
    where (t.name, t.short, t.active, t.balance, t.invoices, t.last_invoice_at, t.last_payment_at, t.last_payment)
          is distinct from (excluded.name, excluded.short, excluded.active, excluded.balance, excluded.invoices, excluded.last_invoice_at, excluded.last_payment_at, excluded.last_payment);
    get diagnostics v_v = row_count;
  end if;

  if v_nm > 0 then
    -- a row without «lines» keeps the lines the server already has (only its header changed)
    insert into public.ar_vendor_moves as t (id, vendor_id, at, kind, code, inv_date, amount, total, balance, items, lines, updated_at)
    select (e->>'id')::bigint, (e->>'vendor_id')::bigint, (e->>'at')::timestamp, e->>'kind',
           nullif(left(btrim(coalesce(e->>'code', '')), 40), ''),
           case when (e->>'inv_date') ~ '^\d{4}-\d{2}-\d{2}$' then (e->>'inv_date')::date end,
           case when (e->>'amount') ~ v_num then round((e->>'amount')::numeric, 2) else 0 end,
           case when (e->>'total') ~ v_num then round((e->>'total')::numeric, 2) end,
           case when (e->>'balance') ~ v_num then round((e->>'balance')::numeric, 2) end,
           coalesce(array(select distinct (l->>'i')::int from jsonb_array_elements(case when jsonb_typeof(e->'lines') = 'array' then e->'lines' else '[]'::jsonb end) l
                          where (l->>'i') ~ '^[0-9]{1,9}$'), '{}'),
           case when jsonb_typeof(e->'lines') = 'array' and jsonb_array_length(e->'lines') <= 400 then e->'lines' end,
           now()
    from jsonb_array_elements(p_moves) e
    where (e->>'id') ~ '^-?[0-9]{1,15}$' and (e->>'vendor_id') ~ '^[0-9]{1,12}$' and (e->>'at') ~ v_ts
      and e->>'kind' in ('purchase', 'return', 'payment')
    on conflict (id) do update set
      vendor_id = excluded.vendor_id, at = excluded.at, kind = excluded.kind, code = excluded.code, inv_date = excluded.inv_date,
      amount = excluded.amount, total = excluded.total, balance = excluded.balance,
      items = case when excluded.lines is null then t.items else excluded.items end,
      lines = coalesce(excluded.lines, t.lines), updated_at = now()
    where (t.vendor_id, t.at, t.kind, t.code, t.inv_date, t.amount, t.total, t.balance)
          is distinct from (excluded.vendor_id, excluded.at, excluded.kind, excluded.code, excluded.inv_date, excluded.amount, excluded.total, excluded.balance)
       or (excluded.lines is not null and excluded.lines is distinct from t.lines);
    get diagnostics v_m = row_count;
  end if;

  if v_ng > 0 then
    delete from public.ar_vendor_moves
    where id in (select (g #>> '{}')::bigint from jsonb_array_elements(p_gone) g where (g #>> '{}') ~ '^-?[0-9]{1,15}$');
    get diagnostics v_g = row_count;
  end if;
  return jsonb_build_object('ok', true, 'vendors', v_v, 'moves', v_m, 'gone', v_g);
end $function$;
revoke all on function public.ar_vendors_sync(text, jsonb, jsonb, jsonb) from public;
grant execute on function public.ar_vendors_sync(text, jsonb, jsonb, jsonb) to anon, authenticated;

-- ---------- what the bot reads (as the reader: the row rules above apply) ----------
-- one supplier's period: purchases, returns, payments (count and value) and the balance at the start and at the end
create or replace function public.ar_vendor_period(p_vendor bigint, p_from timestamp, p_to timestamp)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $function$
  select jsonb_build_object(
    'purchases', coalesce(sum(amount) filter (where kind = 'purchase'), 0), 'purchases_n', count(*) filter (where kind = 'purchase'),
    'returns', coalesce(sum(amount) filter (where kind = 'return'), 0), 'returns_n', count(*) filter (where kind = 'return'),
    'payments', coalesce(sum(amount) filter (where kind = 'payment'), 0), 'payments_n', count(*) filter (where kind = 'payment'),
    'opening', (select m.balance - m.amount from public.ar_vendor_moves m where m.vendor_id = p_vendor and m.at >= p_from and m.at < p_to order by m.at, m.id limit 1),
    'closing', (select m.balance from public.ar_vendor_moves m where m.vendor_id = p_vendor and m.at >= p_from and m.at < p_to order by m.at desc, m.id desc limit 1)
  )
  from public.ar_vendor_moves where vendor_id = p_vendor and at >= p_from and at < p_to;
$function$;
revoke all on function public.ar_vendor_period(bigint, timestamp, timestamp) from public;
revoke all on function public.ar_vendor_period(bigint, timestamp, timestamp) from anon;
grant execute on function public.ar_vendor_period(bigint, timestamp, timestamp) to authenticated;

-- «الصنف ده جه من مين وإمتى»: every purchase (or return) of one item, newest first, only that item's line
create or replace function public.ar_vendor_item_moves(p_item int, p_kind text default null, p_before bigint default null, p_limit int default 100)
returns table (id bigint, vendor_id bigint, at timestamp, kind text, code text, line jsonb)
language sql
stable
security invoker
set search_path to ''
as $function$
  select m.id, m.vendor_id, m.at, m.kind, m.code,
         (select l from jsonb_array_elements(coalesce(m.lines, '[]'::jsonb)) l where (l->>'i') ~ '^[0-9]{1,9}$' and (l->>'i')::int = p_item limit 1)
  from public.ar_vendor_moves m
  where m.items @> array[p_item] and m.kind in ('purchase', 'return')
    and (p_kind is null or m.kind = p_kind)
    and (p_before is null or m.id < p_before)
  order by m.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$function$;
revoke all on function public.ar_vendor_item_moves(int, text, bigint, int) from public;
revoke all on function public.ar_vendor_item_moves(int, text, bigint, int) from anon;
grant execute on function public.ar_vendor_item_moves(int, text, bigint, int) to authenticated;

-- the item's last year: packs bought, from how many suppliers, and the best buy (highest discount, then lowest cost)
create or replace function public.ar_vendor_item_summary(p_item int)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $function$
  with l as (
    select m.id, m.vendor_id, m.at, x as line
    from public.ar_vendor_moves m, jsonb_array_elements(coalesce(m.lines, '[]'::jsonb)) x
    where m.items @> array[p_item] and m.kind = 'purchase' and m.at >= (now() at time zone 'Africa/Cairo') - interval '365 days'
      and (x->>'i') ~ '^[0-9]{1,9}$' and (x->>'i')::int = p_item
  )
  select jsonb_build_object(
    'packs', coalesce(sum(case when (line->>'p') ~ '^-?[0-9.]+$' then (line->>'p')::numeric else 0 end), 0),
    'bonus', coalesce(sum(case when (line->>'b') ~ '^-?[0-9.]+$' then (line->>'b')::numeric else 0 end), 0),
    'buys', count(*),
    'vendors', count(distinct vendor_id),
    'best', (select jsonb_build_object('vendor_id', vendor_id, 'at', at, 't', line->'t', 'c', line->'c') from l
             order by case when (line->>'t') ~ '^-?[0-9.]+$' then (line->>'t')::numeric end desc nulls last,
                      case when (line->>'c') ~ '^-?[0-9.]+$' then (line->>'c')::numeric end asc nulls last, at desc limit 1)
  ) from l;
$function$;
revoke all on function public.ar_vendor_item_summary(int) from public;
revoke all on function public.ar_vendor_item_summary(int) from anon;
grant execute on function public.ar_vendor_item_summary(int) to authenticated;

-- the item search for «مشتريات صنف»: every word typed, the ones bought most first
create or replace function public.ar_vendor_find_items(p_q text, p_limit int default 10)
returns table (id bigint, name text, arabic_name text, buys bigint)
language sql
stable
security invoker
set search_path to ''
as $function$
  with w as (
    select word from regexp_split_to_table(translate(lower(btrim(coalesce(p_q, ''))), 'أإآةى', 'اااهي'), '\s+') as word
    where word <> ''
  ),
  m as (
    select si.id, si.name, si.arabic_name from public.ar_store_items si
    where exists (select 1 from w)
      and not exists (select 1 from w where position(w.word in translate(lower(coalesce(si.name, '') || ' ' || coalesce(si.arabic_name, '')), 'أإآةى', 'اااهي')) = 0)
    limit 300
  )
  select m.id, m.name, m.arabic_name, (select count(*) from public.ar_vendor_moves v where v.items @> array[m.id::int] and v.kind = 'purchase') as buys
  from m
  order by 4 desc, m.name
  limit least(greatest(coalesce(p_limit, 10), 1), 30);
$function$;
revoke all on function public.ar_vendor_find_items(text, int) from public;
revoke all on function public.ar_vendor_find_items(text, int) from anon;
grant execute on function public.ar_vendor_find_items(text, int) to authenticated;
