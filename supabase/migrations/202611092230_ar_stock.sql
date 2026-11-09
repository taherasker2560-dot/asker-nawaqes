-- ASKER bot: «المخزون» place, the pharmacy's actual stock (owner's request 2026-11-09: «رصيد الصيدلية الفعلي، عبوات
-- ووحدات بس، عشان لما عميل يسأل»; layout (أ) search + one card per item, his answer «1» 2026-11-09 22:00).
-- NOT applied yet: applying it needs the owner's explicit OK.
-- ar_stock: one row per item with sellable stock, from the laptop's hub (Store\EXPORT_STOCK.ps1 + SYNC_STOCK.ps1): the
-- same PharmaFly source as the store site (dbo.Work batches with packs or units > 0, expiry after this month), every
-- 2 hours. packs/units = the main store (StoreID 1); other stores (the «انتظار» stores) are kept apart in `other`, so the
-- page shows them separately until the owner decides whether they count. Owner-only: the quantities are NOT public
-- (ar_store_items is readable by the site's visitors, so the numbers are not put there).
-- Writes only through ar_stock_sync (the laptop's sync key, like ar_store_sync); Arabic name and price are copied from
-- ar_store_items on the last batch.
-- Rollback: drop function public.ar_stock_sync(text, jsonb, text, text, boolean); drop table public.ar_stock;
create table if not exists public.ar_stock (
  item_id bigint primary key,
  name text not null check (char_length(name) between 2 and 250),
  arabic_name text check (char_length(arabic_name) <= 250),
  price numeric(12, 2),
  packs numeric(12, 2) not null default 0 check (packs >= 0),
  units numeric(12, 2) not null default 0 check (units >= 0),
  parts integer check (parts between 1 and 10000),
  exp_near date,
  other jsonb not null default '[]'::jsonb check (jsonb_typeof(other) = 'array'),
  seen_run text,
  data_at text,
  updated_at timestamptz not null default now()
);
alter table public.ar_stock enable row level security;
drop policy if exists "Owner reads ar stock" on public.ar_stock;
create policy "Owner reads ar stock" on public.ar_stock for select to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create or replace function public.ar_stock_sync(p_key text, p_rows jsonb, p_run text, p_data_at text default null, p_final boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; v_n int; v_up int := 0; v_seen int; v_before int; v_gone int := 0; v_status text := 'OK';
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if p_run is null or p_run !~ '^[0-9A-Za-z_-]{6,40}$' then raise exception 'bad run'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'rows must be an array'; end if;
  v_n := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  if v_n > 6000 then raise exception 'batch too big (max 6000)'; end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_stock_sync'));

  if v_n > 0 then
    insert into public.ar_stock as t (item_id, name, packs, units, parts, exp_near, other, seen_run, data_at, updated_at)
    select (e->>'id')::bigint,
           left(btrim(e->>'name'), 250),
           greatest(0, round(coalesce((e->>'packs')::numeric, 0), 2)),
           greatest(0, round(coalesce((e->>'units')::numeric, 0), 2)),
           case when (e->>'parts') ~ '^[0-9]{1,5}$' and (e->>'parts')::int between 1 and 10000 then (e->>'parts')::int end,
           case when (e->>'exp') ~ '^\d{4}-\d{2}-\d{2}$' then (e->>'exp')::date end,
           case when jsonb_typeof(e->'other') = 'array' and jsonb_array_length(e->'other') <= 10 then e->'other' else '[]'::jsonb end,
           p_run, p_data_at, now()
    from jsonb_array_elements(p_rows) e
    where (e->>'id') ~ '^[0-9]{1,12}$' and char_length(btrim(coalesce(e->>'name', ''))) >= 2
      and (e->>'packs') ~ '^[0-9]+(\.[0-9]+)?$' and (e->>'units') ~ '^[0-9]+(\.[0-9]+)?$'
    on conflict (item_id) do update set
      name = excluded.name, packs = excluded.packs, units = excluded.units, parts = excluded.parts, exp_near = excluded.exp_near,
      other = excluded.other, seen_run = excluded.seen_run, data_at = excluded.data_at,
      updated_at = case when (t.name, t.packs, t.units, t.parts, t.exp_near, t.other)
                          is distinct from (excluded.name, excluded.packs, excluded.units, excluded.parts, excluded.exp_near, excluded.other)
                        then now() else t.updated_at end;
    get diagnostics v_up = row_count;
  end if;

  select count(*) into v_seen from public.ar_stock where seen_run = p_run;
  select count(*) into v_before from public.ar_stock where seen_run is distinct from p_run;
  if p_final then
    -- a run that suddenly sees far fewer items is refused (a half-restored database), as the store sync does
    if v_seen = 0 or (v_before + v_seen >= 1000 and v_seen < 0.3 * (v_before + v_seen)) then
      v_status := 'REFUSED_TOO_FEW';
    else
      -- items no longer in stock leave the list (nothing else is kept about them)
      delete from public.ar_stock where seen_run is distinct from p_run;
      get diagnostics v_gone = row_count;
      update public.ar_stock s set arabic_name = i.arabic_name, price = i.price
        from public.ar_store_items i
        where i.id = s.item_id and s.seen_run = p_run and (s.arabic_name, s.price) is distinct from (i.arabic_name, i.price);
    end if;
  end if;
  return jsonb_build_object('ok', v_status = 'OK', 'status', v_status, 'batch', v_n, 'upserted', v_up, 'seen_in_run', v_seen, 'removed', v_gone);
end $function$;

revoke all on function public.ar_stock_sync(text, jsonb, text, text, boolean) from public;
grant execute on function public.ar_stock_sync(text, jsonb, text, text, boolean) to anon, authenticated;
