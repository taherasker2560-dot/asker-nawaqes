-- 202611141900_ar_sales (NOT applied yet: the owner said «كمل شغلك» 2026-11-14 to the plan and the mockup
-- mockups\sales_history_2026-11-14.png)
-- ASKER: «حركة البيع» (owner 2026-11-14: «بيان بالمبيعات التاريخية … متقسمة مبيعات بالاجل ومبيعات نقدي، وفيها بحث عن الصنف
-- جوه الفواتير، وفيها بحث عن مشتريات عميل», then «خلوه لي سنة واحدة بس، آخر سنة … تشيل يوم وتحط يوم»).
--   ar_sales: every sale / return ticket of the last 365 days (posTickets, read only on the laptop's copy), with its lines.
--     total = what the ticket came to: Total - Discount (a return is negative); customer_id null = cash, else the credit
--     customer the ticket is on. items = the item ids in it (GIN: «the invoices that have this item»); lines = [{i, p, u, k,
--     s, d}] (item, packs, units, units in a pack, price of a pack, line discount); a line is worth (p + u/k) * s - d.
--     A customer's payment ticket (Total 0) is not a sale and is not here.
--   Filled by the laptop's hub (Store\SYNC_SALES.ps1, ~every 10 minutes, only what changed) through ar_sales_sync with the
--   laptop's sync key; the same call drops what is older than the year (p_keep_from), so the table always holds one year.
--   Read: the owner, and a staff member with «sales» open. ar_sales_summary / ar_sales_list / ar_sales_find_items run as the
--   reader (row rules apply). Sizes measured 2026-11-14: ~59k tickets a year, ~14 MB.
-- Rollback: drop function public.ar_sales_sync(text, jsonb, jsonb, timestamp); drop function public.ar_sales_summary(timestamp,
--   timestamp, int, bigint); drop function public.ar_sales_list(timestamp, timestamp, text, int, bigint, bigint, int);
--   drop function public.ar_sales_find_items(text, int); drop policy "Staff sales reads ar_store_items" on public.ar_store_items;
--   drop policy "Staff sales reads ar_customers" on public.ar_customers; drop table public.ar_sales;
create table if not exists public.ar_sales (
  id bigint primary key,
  at timestamp not null,
  customer_id bigint,
  kind text not null check (kind in ('sale', 'return')),
  total numeric(12, 2) not null default 0,
  items int[] not null default '{}',
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  updated_at timestamptz not null default now()
);
create index if not exists ar_sales_at on public.ar_sales (at desc, id desc);
create index if not exists ar_sales_customer on public.ar_sales (customer_id, id desc) where customer_id is not null;
create index if not exists ar_sales_items on public.ar_sales using gin (items);
alter table public.ar_sales enable row level security;
drop policy if exists "Owner or sales staff read ar sales" on public.ar_sales;
create policy "Owner or sales staff read ar sales" on public.ar_sales for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid or (select public.ar_staff_can(array['sales']::text[])));

-- a staff member with «sales» sees the items' names and the credit customers' names on the invoices
drop policy if exists "Staff sales reads ar_store_items" on public.ar_store_items;
create policy "Staff sales reads ar_store_items" on public.ar_store_items for select to authenticated
  using ((select public.ar_staff_can(array['sales']::text[])));
drop policy if exists "Staff sales reads ar_customers" on public.ar_customers;
create policy "Staff sales reads ar_customers" on public.ar_customers for select to authenticated
  using ((select public.ar_staff_can(array['sales']::text[])));

-- ---------- the laptop's upload ----------
create or replace function public.ar_sales_sync(p_key text, p_rows jsonb, p_gone jsonb default '[]'::jsonb, p_keep_from timestamp default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; v_n int; v_ng int; v_r int := 0; v_g int := 0; v_old int := 0;
  v_num text := '^-?[0-9]{1,10}(\.[0-9]+)?$';
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_gone, '[]'::jsonb)) <> 'array' then
    raise exception 'rows must be arrays';
  end if;
  v_n := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  v_ng := jsonb_array_length(coalesce(p_gone, '[]'::jsonb));
  if v_n > 5000 then raise exception 'batch too big (max 5000)'; end if;
  if v_ng > 2000 then raise exception 'too many gone (max 2000)'; end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_sales_sync'));

  if v_n > 0 then
    insert into public.ar_sales as t (id, customer_id, at, kind, total, items, lines, updated_at)
    select (e->>'id')::bigint,
           case when (e->>'customer_id') ~ '^[0-9]{1,12}$' and (e->>'customer_id')::bigint > 0 then (e->>'customer_id')::bigint end,
           (e->>'at')::timestamp,
           e->>'kind',
           case when (e->>'total') ~ v_num then round((e->>'total')::numeric, 2) else 0 end,
           coalesce(array(select distinct (l->>'i')::int
                          from jsonb_array_elements(case when jsonb_typeof(e->'lines') = 'array' then e->'lines' else '[]'::jsonb end) l
                          where (l->>'i') ~ '^[0-9]{1,9}$'), '{}'),
           case when jsonb_typeof(e->'lines') = 'array' and jsonb_array_length(e->'lines') <= 300 then e->'lines' else '[]'::jsonb end,
           now()
    from jsonb_array_elements(p_rows) e
    where (e->>'id') ~ '^[0-9]{1,15}$'
      and (e->>'at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'
      and e->>'kind' in ('sale', 'return')
    on conflict (id) do update set
      customer_id = excluded.customer_id, at = excluded.at, kind = excluded.kind, total = excluded.total,
      items = excluded.items, lines = excluded.lines, updated_at = now()
    where (t.customer_id, t.at, t.kind, t.total, t.items, t.lines)
          is distinct from (excluded.customer_id, excluded.at, excluded.kind, excluded.total, excluded.items, excluded.lines);
    get diagnostics v_r = row_count;
  end if;

  -- tickets that are no longer in PharmaFly (the laptop sends their ids after its daily full read)
  if v_ng > 0 then
    delete from public.ar_sales
    where id in (select (g #>> '{}')::bigint from jsonb_array_elements(p_gone) g where (g #>> '{}') ~ '^[0-9]{1,15}$');
    get diagnostics v_g = row_count;
  end if;

  -- one year only («تشيل يوم وتحط يوم»): what is older than the laptop's start of the year goes. A start that is not about a
  -- year back (a wrong clock) is ignored.
  if p_keep_from is not null and p_keep_from between (now() at time zone 'Africa/Cairo') - interval '400 days'
                                                 and (now() at time zone 'Africa/Cairo') - interval '300 days' then
    delete from public.ar_sales where at < p_keep_from;
    get diagnostics v_old = row_count;
  end if;
  return jsonb_build_object('ok', true, 'rows', v_r, 'gone', v_g, 'old', v_old);
end $function$;
revoke all on function public.ar_sales_sync(text, jsonb, jsonb, timestamp) from public;
grant execute on function public.ar_sales_sync(text, jsonb, jsonb, timestamp) to anon, authenticated;

-- ---------- what the bot reads (as the reader: the row rules above apply) ----------
-- the period's numbers: sales (cash / credit), returns, the sales per hour / day / month for the bars, and for one item how
-- much of it went (packs, units, value, in how many invoices)
create or replace function public.ar_sales_summary(p_from timestamp, p_to timestamp, p_item int default null, p_customer bigint default null)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $function$
  with s as (
    select id, at, customer_id, kind, total, lines from public.ar_sales
    where at >= p_from and at < p_to
      and (p_item is null or items @> array[p_item])
      and (p_customer is null or customer_id = p_customer)
  ),
  u as (select case when p_to - p_from <= interval '2 days' then 'hour' when p_to - p_from <= interval '62 days' then 'day' else 'month' end as unit),
  b as (
    select date_trunc((select unit from u), at) as t, sum(total) filter (where kind = 'sale') as v
    from s group by 1 order by 1
  ),
  it as (
    select coalesce(sum((l->>'p')::numeric), 0) as packs, coalesce(sum((l->>'u')::numeric), 0) as units,
           coalesce(sum(((l->>'p')::numeric + case when (l->>'k')::numeric > 0 then (l->>'u')::numeric / (l->>'k')::numeric else 0 end)
                         * (l->>'s')::numeric - coalesce((l->>'d')::numeric, 0)), 0) as value
    from s, jsonb_array_elements(s.lines) l
    where p_item is not null and s.kind = 'sale' and (l->>'i') ~ '^[0-9]{1,9}$' and (l->>'i')::int = p_item
      and (l->>'p') ~ '^-?[0-9.]+$' and (l->>'u') ~ '^-?[0-9.]+$' and (l->>'s') ~ '^-?[0-9.]+$'
  )
  select jsonb_build_object(
    'unit', (select unit from u),
    'sales', coalesce(sum(total) filter (where kind = 'sale'), 0),
    'sales_n', count(*) filter (where kind = 'sale'),
    'cash', coalesce(sum(total) filter (where kind = 'sale' and customer_id is null), 0),
    'cash_n', count(*) filter (where kind = 'sale' and customer_id is null),
    'credit', coalesce(sum(total) filter (where kind = 'sale' and customer_id is not null), 0),
    'credit_n', count(*) filter (where kind = 'sale' and customer_id is not null),
    'returns', coalesce(sum(total) filter (where kind = 'return'), 0),
    'returns_n', count(*) filter (where kind = 'return'),
    'first_at', (select min(at) from public.ar_sales),
    'bars', coalesce((select jsonb_agg(jsonb_build_object('t', to_char(t, 'YYYY-MM-DD"T"HH24:MI'), 'v', coalesce(v, 0)) order by t) from b), '[]'::jsonb),
    'item', case when p_item is null then null else (select jsonb_build_object('packs', packs, 'units', units, 'value', round(value, 2)) from it) end
  )
  from s;
$function$;
revoke all on function public.ar_sales_summary(timestamp, timestamp, int, bigint) from public;
revoke all on function public.ar_sales_summary(timestamp, timestamp, int, bigint) from anon;
grant execute on function public.ar_sales_summary(timestamp, timestamp, int, bigint) to authenticated;

-- the invoices, newest first, 50 at a time (p_before = the last id already shown): all / cash / credit / return, of one item,
-- or of one customer; each line with the item's name, and a credit invoice with the customer's name
create or replace function public.ar_sales_list(p_from timestamp, p_to timestamp, p_kind text default null, p_item int default null,
  p_customer bigint default null, p_before bigint default null, p_limit int default 50)
returns table (id bigint, at timestamp, customer_id bigint, customer text, kind text, total numeric, lines jsonb)
language sql
stable
security invoker
set search_path to ''
as $function$
  select s.id, s.at, s.customer_id, c.name, s.kind, s.total,
         (select coalesce(jsonb_agg(l.v || jsonb_build_object('n', si.name, 'a', si.arabic_name) order by l.o), '[]'::jsonb)
          from jsonb_array_elements(s.lines) with ordinality as l(v, o)
          left join public.ar_store_items si on (l.v->>'i') ~ '^[0-9]{1,9}$' and si.id = (l.v->>'i')::bigint)
  from public.ar_sales s
  left join public.ar_customers c on c.id = s.customer_id
  where s.at >= p_from and s.at < p_to
    and (p_before is null or s.id < p_before)
    and (p_item is null or s.items @> array[p_item])
    and (p_customer is null or s.customer_id = p_customer)
    and (p_kind is null
         or (p_kind = 'cash' and s.kind = 'sale' and s.customer_id is null)
         or (p_kind = 'credit' and s.kind = 'sale' and s.customer_id is not null)
         or (p_kind = 'return' and s.kind = 'return'))
  order by s.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 500);
$function$;
revoke all on function public.ar_sales_list(timestamp, timestamp, text, int, bigint, bigint, int) from public;
revoke all on function public.ar_sales_list(timestamp, timestamp, text, int, bigint, bigint, int) from anon;
grant execute on function public.ar_sales_list(timestamp, timestamp, text, int, bigint, bigint, int) to authenticated;

-- «دوّر على صنف جوه الفواتير»: the items whose name has every word typed (Arabic or English, أ/إ/آ = ا, ة = ه, ى = ي),
-- the ones sold most in the year first
create or replace function public.ar_sales_find_items(p_q text, p_limit int default 10)
returns table (id bigint, name text, arabic_name text, invoices bigint)
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
  select m.id, m.name, m.arabic_name, (select count(*) from public.ar_sales s where s.items @> array[m.id::int]) as invoices
  from m
  order by 4 desc, m.name
  limit least(greatest(coalesce(p_limit, 10), 1), 30);
$function$;
revoke all on function public.ar_sales_find_items(text, int) from public;
revoke all on function public.ar_sales_find_items(text, int) from anon;
grant execute on function public.ar_sales_find_items(text, int) to authenticated;
