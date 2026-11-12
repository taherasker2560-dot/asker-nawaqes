-- 202611120300_ar_item_buys (NOT applied yet: the owner said «أيوه، ضيفه» 2026-11-12 ~02:30 to this exact plan)
-- ASKER: «آخر شرا» in the search on top of the bot (owner 2026-11-12: items he bought yesterday and today showed no
-- discount, because the warehouses' lists in the bot are older than those items). For every item, the LAST real purchase
-- from each supplier: the date and the net discount of that invoice line (cost paid vs public price, bonus included:
-- 100 * (1 - cost*packs / (public price * (packs + bonus))), the same rule as the order advisor). Suppliers: NEWCITY, AMG,
-- REDA, ELFATH, PHARMA, IBNSINA (the order advisor's six groups) and any other vendor by its short name. Last 18 months.
-- Filled by the laptop's hub (Store\SYNC_BUYS.ps1, read-only on PharmaFly) every hour, sending only what changed.
-- Owner-only read (purchase prices are not public). Writes only through ar_item_buys_sync with the laptop's sync key.
-- Rollback: drop function public.ar_item_buys_sync(text, jsonb); drop table public.ar_item_buys;
create table if not exists public.ar_item_buys (
  item_id bigint not null,
  supplier text not null check (char_length(supplier) between 1 and 40),
  last_date date not null,
  discount_pct numeric(6, 2) check (discount_pct between -100 and 100),
  bonus numeric(12, 2) not null default 0 check (bonus >= 0),
  packs numeric(12, 2) check (packs >= 0),
  updated_at timestamptz not null default now(),
  primary key (item_id, supplier)
);
alter table public.ar_item_buys enable row level security;
drop policy if exists "Owner reads ar item buys" on public.ar_item_buys;
create policy "Owner reads ar item buys" on public.ar_item_buys for select to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create or replace function public.ar_item_buys_sync(p_key text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; v_n int; v_up int := 0;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'rows must be an array'; end if;
  v_n := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  if v_n > 5000 then raise exception 'batch too big (max 5000)'; end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_item_buys_sync'));
  if v_n > 0 then
    insert into public.ar_item_buys as t (item_id, supplier, last_date, discount_pct, bonus, packs, updated_at)
    select (e->>'item_id')::bigint,
           left(btrim(e->>'supplier'), 40),
           (e->>'last_date')::date,
           case when (e->>'discount_pct') ~ '^-?[0-9]{1,3}(\.[0-9]+)?$' and (e->>'discount_pct')::numeric between -100 and 100
                then round((e->>'discount_pct')::numeric, 2) end,
           case when (e->>'bonus') ~ '^[0-9]+(\.[0-9]+)?$' then round((e->>'bonus')::numeric, 2) else 0 end,
           case when (e->>'packs') ~ '^[0-9]+(\.[0-9]+)?$' then round((e->>'packs')::numeric, 2) end,
           now()
    from jsonb_array_elements(p_rows) e
    where (e->>'item_id') ~ '^[0-9]{1,12}$' and char_length(btrim(coalesce(e->>'supplier', ''))) between 1 and 40
      and (e->>'last_date') ~ '^\d{4}-\d{2}-\d{2}$'
    on conflict (item_id, supplier) do update set
      last_date = excluded.last_date, discount_pct = excluded.discount_pct, bonus = excluded.bonus, packs = excluded.packs,
      updated_at = now()
    where (t.last_date, t.discount_pct, t.bonus, t.packs) is distinct from (excluded.last_date, excluded.discount_pct, excluded.bonus, excluded.packs);
    get diagnostics v_up = row_count;
  end if;
  return jsonb_build_object('ok', true, 'batch', v_n, 'upserted', v_up);
end $function$;

revoke all on function public.ar_item_buys_sync(text, jsonb) from public;
grant execute on function public.ar_item_buys_sync(text, jsonb) to anon, authenticated;
