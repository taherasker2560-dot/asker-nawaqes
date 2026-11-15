-- 202611151900_ar_cash (NOT applied yet: the owner said «ابدأ في مكان الخزن» 2026-11-15 and «موافق على كل حاجة»; his own
-- request is IDEAS.md 2026-11-15 «عايز اعمل مكان للخزن، نفس الخزن اللي عندي في السيستم بتاعي في فارما فلاي»).
-- ASKER: «الحسابات ← الخزن»: PharmaFly's cash boxes (CashAccounts, 13 on 2026-11-15) and their moves (CashFlow rows that have an
-- AccountID), the same numbers as his PharmaFly screen.
--   ar_cash_accounts : one row per box: name, type (PharmaFly's own 0/1), balance now (CashAccounts.Balance), last move.
--   ar_cash_moves    : the last 365 days of moves of every box. amount = what it did to the box (+ in, - out).
--     kind: sales (the drawer's cash sales of ONE day, one row per day and box, n = how many sales), customer (a customer paid:
--     CashFlow op 2/4), vendor (we paid a supplier: op 9), drawer_out / drawer_in (the drawer handed over to the main box: op 5 / 6),
--     transfer_out / transfer_in (between two boxes: op 52 / 53, who = the other box), expense (op 1001..1017 = the expense
--     category CashAccountsOthers.ID + 1000, who = its name, memo = the note he typed), other_in / other_out (any other move, op
--     kept in «op» so nothing is guessed). who = the customer / supplier / category / other box.
--     A real move has id = CashFlow.ID; a day's sales row has id = -(yyyymmdd*100 + box id).
--   Filled by the laptop's hub (Store\SYNC_CASH.ps1, read only on PharmaFly) through ar_cash_sync with the laptop key.
--   Read: the OWNER ONLY (money; a staff member never sees it, whatever his sections).
-- Rollback: drop function public.ar_cash_sync(text, jsonb, jsonb, jsonb); drop table public.ar_cash_moves; drop table public.ar_cash_accounts;
create table if not exists public.ar_cash_accounts (
  id int primary key,
  name text not null check (char_length(name) between 1 and 120),
  type int,
  balance numeric(14, 2) not null default 0,
  last_at timestamp,
  updated_at timestamptz not null default now()
);
alter table public.ar_cash_accounts enable row level security;
drop policy if exists "Owner reads ar cash accounts" on public.ar_cash_accounts;
create policy "Owner reads ar cash accounts" on public.ar_cash_accounts for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create table if not exists public.ar_cash_moves (
  id bigint primary key,
  account_id int not null,
  at timestamp not null,
  op int,
  kind text not null check (kind in ('sales', 'customer', 'vendor', 'drawer_out', 'drawer_in', 'transfer_out', 'transfer_in', 'expense', 'other_in', 'other_out')),
  amount numeric(14, 2) not null default 0,
  who text,
  memo text,
  n int,
  updated_at timestamptz not null default now()
);
create index if not exists ar_cash_moves_account_at on public.ar_cash_moves (account_id, at desc, id desc);
create index if not exists ar_cash_moves_at on public.ar_cash_moves (at desc);
alter table public.ar_cash_moves enable row level security;
drop policy if exists "Owner reads ar cash moves" on public.ar_cash_moves;
create policy "Owner reads ar cash moves" on public.ar_cash_moves for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

-- ---------- the laptop's upload ----------
create or replace function public.ar_cash_sync(p_key text, p_accounts jsonb, p_moves jsonb, p_gone jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; v_na int; v_nm int; v_ng int; v_a int := 0; v_m int := 0; v_g int := 0;
  v_num text := '^-?[0-9]{1,12}(\.[0-9]+)?$';
  v_ts text := '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$';
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if jsonb_typeof(coalesce(p_accounts, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_moves, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_gone, '[]'::jsonb)) <> 'array' then raise exception 'rows must be arrays'; end if;
  v_na := jsonb_array_length(coalesce(p_accounts, '[]'::jsonb));
  v_nm := jsonb_array_length(coalesce(p_moves, '[]'::jsonb));
  v_ng := jsonb_array_length(coalesce(p_gone, '[]'::jsonb));
  if v_na > 200 or v_nm > 5000 then raise exception 'batch too big'; end if;
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

  if v_nm > 0 then
    insert into public.ar_cash_moves as t (id, account_id, at, op, kind, amount, who, memo, n, updated_at)
    select (e->>'id')::bigint, (e->>'account_id')::int, (e->>'at')::timestamp,
           case when (e->>'op') ~ '^[0-9]{1,6}$' then (e->>'op')::int end,
           e->>'kind',
           case when (e->>'amount') ~ v_num then round((e->>'amount')::numeric, 2) else 0 end,
           nullif(left(btrim(coalesce(e->>'who', '')), 120), ''),
           nullif(left(btrim(coalesce(e->>'memo', '')), 200), ''),
           case when (e->>'n') ~ '^[0-9]{1,9}$' then (e->>'n')::int end,
           now()
    from jsonb_array_elements(p_moves) e
    where (e->>'id') ~ '^-?[0-9]{1,15}$' and (e->>'account_id') ~ '^[0-9]{1,9}$' and (e->>'at') ~ v_ts
      and e->>'kind' in ('sales', 'customer', 'vendor', 'drawer_out', 'drawer_in', 'transfer_out', 'transfer_in', 'expense', 'other_in', 'other_out')
    on conflict (id) do update set
      account_id = excluded.account_id, at = excluded.at, op = excluded.op, kind = excluded.kind, amount = excluded.amount,
      who = excluded.who, memo = excluded.memo, n = excluded.n, updated_at = now()
    where (t.account_id, t.at, t.op, t.kind, t.amount, t.who, t.memo, t.n)
          is distinct from (excluded.account_id, excluded.at, excluded.op, excluded.kind, excluded.amount, excluded.who, excluded.memo, excluded.n);
    get diagnostics v_m = row_count;
  end if;

  if v_ng > 0 then
    delete from public.ar_cash_moves
    where id in (select (g #>> '{}')::bigint from jsonb_array_elements(p_gone) g where (g #>> '{}') ~ '^-?[0-9]{1,15}$');
    get diagnostics v_g = row_count;
  end if;
  return jsonb_build_object('ok', true, 'accounts', v_a, 'moves', v_m, 'gone', v_g);
end $function$;
revoke all on function public.ar_cash_sync(text, jsonb, jsonb, jsonb) from public;
grant execute on function public.ar_cash_sync(text, jsonb, jsonb, jsonb) to anon, authenticated;
