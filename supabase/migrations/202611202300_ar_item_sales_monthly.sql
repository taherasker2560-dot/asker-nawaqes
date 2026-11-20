-- 202611202300_ar_item_sales_monthly (NOT applied yet: needs the owner's approval on the phone)
-- Owner 2026-11-20 («أ» to «المبيعات أقدم من سنة، أعمل لكل صنف ملخص شهري»): the item card's sales report keeps the last 12 months in detail (ar_sales) and, for the years before, one line a month
-- per item from 2018: how many packs were sold, how many came back, what they came to, and in how many invoices. One row per item (about 10,800 items, a few MB in all), the months inside it
-- as {"2018-03": [packs sold, packs returned, value, invoices], ...} (a pack = packs + units / units in a pack; value = the lines' value, a return comes off it; the same rules as ar_sales).
-- Filled by the laptop (Store\SYNC_ITEM_SALES.ps1, once a day, read only on the restored copy, only the items that changed) through ar_item_sales_sync with the laptop's sync key.
-- Row -1 is the heartbeat: its updated_at says when the laptop last sent (the card shows it). Read: the owner, and staff with «sales» open (the same rule as ar_sales).
-- Rollback: drop function public.ar_item_sales_sync(text, jsonb, jsonb); drop table public.ar_item_sales_monthly;

create table if not exists public.ar_item_sales_monthly (
  item_id int primary key,
  months jsonb not null default '{}'::jsonb check (jsonb_typeof(months) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.ar_item_sales_monthly enable row level security;
drop policy if exists "Owner or sales staff read ar item sales monthly" on public.ar_item_sales_monthly;
create policy "Owner or sales staff read ar item sales monthly" on public.ar_item_sales_monthly for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid or (select public.ar_staff_can(array['sales']::text[])));
revoke all on public.ar_item_sales_monthly from anon;
revoke all on public.ar_item_sales_monthly from authenticated;
grant select on public.ar_item_sales_monthly to authenticated;

-- ---------- the laptop's upload ----------
-- p_rows = [{"i": item id, "m": {"2018-03": [s, r, v, n], ...}}], p_gone = item ids that have no sale at all any more
create or replace function public.ar_item_sales_sync(p_key text, p_rows jsonb, p_gone jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; v_n int; v_ng int; v_r int := 0; v_g int := 0;
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
  if v_n > 3000 then raise exception 'batch too big (max 3000)'; end if;
  if v_ng > 3000 then raise exception 'too many gone (max 3000)'; end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_item_sales_sync'));

  if v_n > 0 then
    insert into public.ar_item_sales_monthly as t (item_id, months, updated_at)
    select (e->>'i')::int, e->'m', now()
    from jsonb_array_elements(p_rows) e
    where (e->>'i') ~ '^[0-9]{1,9}$'
      and jsonb_typeof(e->'m') = 'object'
      and (select count(*) from jsonb_object_keys(e->'m')) <= 200
      and not exists (
        select 1 from jsonb_each(e->'m') k
        where k.key !~ '^\d{4}-(0[1-9]|1[0-2])$'
           or jsonb_typeof(k.value) <> 'array'
           or jsonb_array_length(k.value) <> 4
           or exists (select 1 from jsonb_array_elements(k.value) x where jsonb_typeof(x) <> 'number'))
    on conflict (item_id) do update set months = excluded.months, updated_at = now()
    where t.months is distinct from excluded.months;
    get diagnostics v_r = row_count;
  end if;

  if v_ng > 0 then
    delete from public.ar_item_sales_monthly
    where item_id in (select (g #>> '{}')::int from jsonb_array_elements(p_gone) g where (g #>> '{}') ~ '^[0-9]{1,9}$') and item_id > 0;
    get diagnostics v_g = row_count;
  end if;

  -- the heartbeat: when the laptop last sent
  insert into public.ar_item_sales_monthly (item_id, months, updated_at) values (-1, '{}'::jsonb, now())
  on conflict (item_id) do update set updated_at = now();
  return jsonb_build_object('ok', true, 'rows', v_r, 'gone', v_g);
end $function$;
revoke all on function public.ar_item_sales_sync(text, jsonb, jsonb) from public;
grant execute on function public.ar_item_sales_sync(text, jsonb, jsonb) to anon, authenticated;
