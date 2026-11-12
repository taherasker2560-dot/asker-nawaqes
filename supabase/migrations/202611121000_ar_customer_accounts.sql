-- 202611121000_ar_customer_accounts (NOT applied yet: the owner said «ا» 2026-11-12 to this plan and the mockup)
-- ASKER: customers' accounts in the bot (owner 2026-11-12: «مكان العدد اللي هو 781 يبقى زرار … يفتح حسابات العملاء، فيهم
-- بحث بالاسم، وجوه كل اسم لو دوست عليه يفتح لي بيان تفصيلي لحركة المبيعات وحركة المدفوعات»).
--   ar_customers      : every credit customer: name, limit, balance now, last movement.
--   ar_customer_moves : every movement of a customer, with the balance after it (PharmaFly's NewBalance):
--                       sale / return / payment / refund. A sale or a return carries its lines (items).
-- Source (read only, checked 2026-11-12): posTickets holds every movement since 2018 (a payment is a ticket with Total 0 and
-- PaidByCustomer; 6,827 of 6,827 payments since 2025 have their ticket). Payments before 2021-08 are CashFlow Operation 4
-- rows with no ticket: those come with a negative id (-CashFlow.ID) so they never clash with a ticket id.
-- Filled by the laptop's hub (Store\SYNC_CUSTOMERS.ps1) every hour, sending only what changed. Owner-only read (customers'
-- names, balances and what they bought are private). Writes only through ar_customers_sync with the laptop's sync key.
-- Rollback: drop function public.ar_customers_sync(text, jsonb, jsonb, jsonb); drop table public.ar_customer_moves;
--           drop table public.ar_customers;
create table if not exists public.ar_customers (
  id bigint primary key,
  name text not null check (char_length(name) between 1 and 120),
  credit_limit numeric(14, 2),
  balance numeric(14, 2) not null default 0,
  last_at timestamp,
  last_kind text check (last_kind in ('sale', 'return', 'payment', 'refund')),
  moves int not null default 0 check (moves >= 0),
  updated_at timestamptz not null default now()
);
alter table public.ar_customers enable row level security;
drop policy if exists "Owner reads ar customers" on public.ar_customers;
create policy "Owner reads ar customers" on public.ar_customers for select to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create table if not exists public.ar_customer_moves (
  id bigint primary key,
  customer_id bigint not null,
  at timestamp not null,
  kind text not null check (kind in ('sale', 'return', 'payment', 'refund')),
  total numeric(14, 2) not null default 0,
  paid numeric(14, 2) not null default 0,
  balance numeric(14, 2),
  items jsonb check (items is null or jsonb_typeof(items) = 'array'),
  updated_at timestamptz not null default now()
);
create index if not exists ar_customer_moves_customer_at on public.ar_customer_moves (customer_id, at desc, id desc);
alter table public.ar_customer_moves enable row level security;
drop policy if exists "Owner reads ar customer moves" on public.ar_customer_moves;
create policy "Owner reads ar customer moves" on public.ar_customer_moves for select to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create or replace function public.ar_customers_sync(p_key text, p_customers jsonb, p_moves jsonb, p_gone jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; v_nc int; v_nm int; v_ng int; v_c int := 0; v_m int := 0; v_g int := 0;
  v_num text := '^-?[0-9]{1,12}(\.[0-9]+)?$';
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if jsonb_typeof(coalesce(p_customers, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_moves, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_gone, '[]'::jsonb)) <> 'array' then raise exception 'rows must be arrays'; end if;
  v_nc := jsonb_array_length(coalesce(p_customers, '[]'::jsonb));
  v_nm := jsonb_array_length(coalesce(p_moves, '[]'::jsonb));
  v_ng := jsonb_array_length(coalesce(p_gone, '[]'::jsonb));
  if v_nc > 5000 or v_nm > 5000 then raise exception 'batch too big (max 5000)'; end if;
  if v_ng > 2000 then raise exception 'too many gone (max 2000)'; end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_customers_sync'));

  if v_nc > 0 then
    insert into public.ar_customers as t (id, name, credit_limit, balance, last_at, last_kind, moves, updated_at)
    select (e->>'id')::bigint,
           left(btrim(e->>'name'), 120),
           case when (e->>'credit_limit') ~ v_num then round((e->>'credit_limit')::numeric, 2) end,
           case when (e->>'balance') ~ v_num then round((e->>'balance')::numeric, 2) else 0 end,
           case when (e->>'last_at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$' then (e->>'last_at')::timestamp end,
           case when e->>'last_kind' in ('sale', 'return', 'payment', 'refund') then e->>'last_kind' end,
           case when (e->>'moves') ~ '^[0-9]{1,9}$' then (e->>'moves')::int else 0 end,
           now()
    from jsonb_array_elements(p_customers) e
    where (e->>'id') ~ '^[0-9]{1,12}$' and char_length(btrim(coalesce(e->>'name', ''))) between 1 and 120
    on conflict (id) do update set
      name = excluded.name, credit_limit = excluded.credit_limit, balance = excluded.balance, last_at = excluded.last_at,
      last_kind = excluded.last_kind, moves = excluded.moves, updated_at = now()
    where (t.name, t.credit_limit, t.balance, t.last_at, t.last_kind, t.moves)
          is distinct from (excluded.name, excluded.credit_limit, excluded.balance, excluded.last_at, excluded.last_kind, excluded.moves);
    get diagnostics v_c = row_count;
  end if;

  if v_nm > 0 then
    insert into public.ar_customer_moves as t (id, customer_id, at, kind, total, paid, balance, items, updated_at)
    select (e->>'id')::bigint,
           (e->>'customer_id')::bigint,
           (e->>'at')::timestamp,
           e->>'kind',
           case when (e->>'total') ~ v_num then round((e->>'total')::numeric, 2) else 0 end,
           case when (e->>'paid') ~ v_num then round((e->>'paid')::numeric, 2) else 0 end,
           case when (e->>'balance') ~ v_num then round((e->>'balance')::numeric, 2) end,
           case when jsonb_typeof(e->'items') = 'array' and jsonb_array_length(e->'items') <= 300 then e->'items' end,
           now()
    from jsonb_array_elements(p_moves) e
    where (e->>'id') ~ '^-?[0-9]{1,15}$' and (e->>'customer_id') ~ '^[0-9]{1,12}$'
      and (e->>'at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'
      and e->>'kind' in ('sale', 'return', 'payment', 'refund')
    on conflict (id) do update set
      customer_id = excluded.customer_id, at = excluded.at, kind = excluded.kind, total = excluded.total,
      paid = excluded.paid, balance = excluded.balance, items = excluded.items, updated_at = now()
    where (t.customer_id, t.at, t.kind, t.total, t.paid, t.balance, t.items)
          is distinct from (excluded.customer_id, excluded.at, excluded.kind, excluded.total, excluded.paid, excluded.balance, excluded.items);
    get diagnostics v_m = row_count;
  end if;

  -- movements that are no longer in PharmaFly (a ticket deleted there): the laptop sends their ids after a full check
  if v_ng > 0 then
    delete from public.ar_customer_moves
    where id in (select (g #>> '{}')::bigint from jsonb_array_elements(p_gone) g where (g #>> '{}') ~ '^-?[0-9]{1,15}$');
    get diagnostics v_g = row_count;
  end if;
  return jsonb_build_object('ok', true, 'customers', v_c, 'moves', v_m, 'gone', v_g);
end $function$;

revoke all on function public.ar_customers_sync(text, jsonb, jsonb, jsonb) from public;
grant execute on function public.ar_customers_sync(text, jsonb, jsonb, jsonb) to anon, authenticated;
