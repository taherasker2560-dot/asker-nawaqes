-- 202611050026_ar_order_qty
-- ASKER: a quantity for each shortage, shown next to it in the message to the company (the owner edits it before
-- sending). suggested_qty = «المطلوب» from the laptop (half of the last 30 days' sales minus the stock, at least 1),
-- refreshed by ar_sync_shortages on every update; order_qty = the quantity the owner typed in the page (wins over the
-- suggestion; empty = use the suggestion). When an item leaves the shortage list its order_qty is cleared, so an old
-- quantity does not come back with it later.
-- ar_sync_shortages gets an optional p_qty numeric[] in the same order as p_names (null = quantities not sent).
-- Rollback: run 202611050022_ar_sync_shortages again for the function (drop this 6-argument version first:
--           drop function public.ar_sync_shortages(text, text[], text, text, boolean, numeric[]);), then
--           alter table public.ar_shortages drop column suggested_qty, drop column order_qty;

alter table public.ar_shortages
  add column if not exists suggested_qty numeric(10,1) check (suggested_qty is null or suggested_qty >= 0),
  add column if not exists order_qty numeric(10,1) check (order_qty is null or order_qty > 0);
comment on column public.ar_shortages.suggested_qty is 'Quantity suggested by the laptop (المطلوب), refreshed by ar_sync_shortages.';
comment on column public.ar_shortages.order_qty is 'Quantity the owner set in the page; wins over suggested_qty; cleared when the item leaves the list.';

drop function public.ar_sync_shortages(text, text[], text, text, boolean);
create function public.ar_sync_shortages(
  p_key text,
  p_names text[],
  p_source text default 'laptop',
  p_data_at text default null,
  p_dry_run boolean default false,
  p_qty numeric[] default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_sent int := coalesce(cardinality(p_names), 0);
  v_i int;
  v_raw text; v_name text; v_full text; v_k text; v_p text; v_cands text[]; v_q numeric;
  v_keys text[] := '{}'; v_pnames text[] := '{}'; v_qtys numeric[] := '{}'; v_cut int := 0;
  v_listed int; v_active_before int; v_kept int; v_active_after int; v_without int;
  v_add_k text[]; v_add text[]; v_react_k text[]; v_react text[]; v_leave_k text[]; v_leave text[];
  v_status text; v_full_lists boolean; v_log bigint;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'bad key' using errcode = '28000';
  end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then
    raise exception 'bad key' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_sync_shortages'));

  if v_sent <= 5000 then
    for v_i in 1 .. v_sent loop
      v_raw := coalesce(p_names[v_i], '');
      -- same cleaning as the page: text before | or a tab, single spaces, trimmed, max 250, 2+ chars with a letter
      v_name := left(btrim(regexp_replace(split_part(split_part(v_raw, '|', 1), E'\t', 1), '\s+', ' ', 'g')), 250);
      continue when char_length(v_name) < 2 or v_name !~ '[A-Za-z؀-ۿ]';
      v_full := upper(v_name);
      -- the name as a PharmaFly report shows it (cut at 25 letters): from the raw name, the trimmed one, the cleaned one
      v_cands := array[upper(btrim(regexp_replace(left(v_raw, 25), '\s+', ' ', 'g'))),
                       upper(btrim(regexp_replace(left(btrim(v_raw), 25), '\s+', ' ', 'g'))),
                       upper(btrim(regexp_replace(left(v_name, 25), '\s+', ' ', 'g')))];
      v_k := null;
      -- 1) a row that is active now (cut name first): nothing changes for it
      select c.k into v_k from unnest(v_cands || v_full) with ordinality as c(k, o)
        where exists (select 1 from public.ar_shortages s where s.name_key = c.k and s.is_active)
        order by c.o limit 1;
      -- 2) the cut name the bot knows
      if v_k is null then
        select c.k into v_k from unnest(v_cands) with ordinality as c(k, o)
          where char_length(c.k) >= 2
            and (exists (select 1 from public.ar_shortages s where s.name_key = c.k)
                 or exists (select 1 from public.ar_names n where n.name_key = c.k))
          order by c.o limit 1;
      end if;
      -- 3) the full name the bot knows
      if v_k is null and (exists (select 1 from public.ar_shortages s where s.name_key = v_full)
                          or exists (select 1 from public.ar_names n where n.name_key = v_full)) then
        v_k := v_full;
      end if;
      -- 4) the only known product that starts with the cut name
      if v_k is null and char_length(v_cands[1]) >= 2 then
        select min(x.k) into v_k
          from (select s.name_key as k from public.ar_shortages s where starts_with(s.name_key, v_cands[1]) and s.name_key <> v_cands[1]
                union
                select n.name_key from public.ar_names n where starts_with(n.name_key, v_cands[1]) and n.name_key <> v_cands[1]) x
          having count(*) = 1;
      end if;
      -- 5) a new product: its full name
      v_k := coalesce(v_k, v_full);
      -- an existing row keeps its saved name (name and key must agree); a key known only in ar_names uses its English name
      select s.product_name into v_p from public.ar_shortages s where s.name_key = v_k;
      if not found then
        select n.english_name into v_p from public.ar_names n
          where n.name_key = v_k and upper(btrim(regexp_replace(n.english_name, '\s+', ' ', 'g'))) = v_k;
        if not found then
          v_p := case when v_k = v_full then v_name else v_k end;
        end if;
      end if;
      -- the suggested quantity sent with this name (null when not sent or not a number >= 0)
      v_q := case when p_qty is not null and p_qty[v_i] >= 0 then round(least(p_qty[v_i], 999999), 1) end;
      if not (v_k = any(v_keys)) then
        v_keys := v_keys || v_k; v_pnames := v_pnames || v_p; v_qtys := v_qtys || v_q;
        if v_k <> v_full then v_cut := v_cut + 1; end if;
      end if;
    end loop;
  end if;
  v_listed := cardinality(v_keys);

  select count(*) into v_active_before from public.ar_shortages s where s.is_active;
  select coalesce(array_agg(i.k order by i.p), '{}'), coalesce(array_agg(i.p order by i.p), '{}') into v_add_k, v_add
    from unnest(v_keys, v_pnames) as i(k, p)
    where not exists (select 1 from public.ar_shortages s where s.name_key = i.k);
  select coalesce(array_agg(s.name_key order by s.product_name), '{}'), coalesce(array_agg(s.product_name order by s.product_name), '{}')
    into v_react_k, v_react
    from public.ar_shortages s where not s.is_active and s.name_key = any(v_keys);
  select coalesce(array_agg(s.name_key order by s.product_name), '{}'), coalesce(array_agg(s.product_name order by s.product_name), '{}')
    into v_leave_k, v_leave
    from public.ar_shortages s where s.is_active and not (s.name_key = any(v_keys));
  v_kept := v_listed - cardinality(v_add_k) - cardinality(v_react_k);
  select count(*) into v_without from unnest(v_keys) as i(k)
    where not exists (select 1 from public.ar_names n where n.name_key = i.k);

  v_status := case
    when v_sent > 5000 then 'refused-too-big'
    when v_listed = 0 then 'refused-empty'
    when v_active_before >= 50 and v_listed < 0.3 * v_active_before then 'refused-too-small'
    when v_active_before >= 50 and cardinality(v_leave_k) > 0.5 * v_active_before then 'refused-too-many-leaving'
    when coalesce(p_dry_run, false) then 'dry-run'
    else 'ok' end;

  if v_status = 'ok' then
    insert into public.ar_shortages as s (name_key, product_name, is_active)
      select i.k, i.p, true from unnest(v_keys, v_pnames) as i(k, p)
      on conflict (name_key) do update set is_active = true where not s.is_active;
    -- leaving: inactive, and the owner's quantity for it is forgotten
    update public.ar_shortages s set is_active = false, order_qty = null
      where s.is_active and not (s.name_key = any(v_keys));
    -- the laptop's suggested quantities (only when they were sent)
    if p_qty is not null then
      update public.ar_shortages s set suggested_qty = q.q
        from unnest(v_keys, v_qtys) as q(k, q)
        where s.name_key = q.k and s.suggested_qty is distinct from q.q;
    end if;
  end if;
  select count(*) into v_active_after from public.ar_shortages s where s.is_active;

  v_full_lists := v_status in ('ok', 'dry-run');
  insert into public.ar_sync_log (source, data_at, dry_run, status, sent, listed, added, reactivated, kept, leaving,
      active_before, active_after, without_arabic, details)
    values (left(coalesce(nullif(btrim(p_source), ''), 'laptop'), 80), left(p_data_at, 40), coalesce(p_dry_run, false), v_status,
      v_sent, v_listed, cardinality(v_add_k), cardinality(v_react_k), v_kept, cardinality(v_leave_k),
      v_active_before, v_active_after, v_without,
      jsonb_build_object('by_cut', v_cut, 'qty_sent', p_qty is not null,
        'added', to_jsonb(case when v_full_lists then v_add_k else v_add_k[1:50] end),
        'reactivated', to_jsonb(case when v_full_lists then v_react_k else v_react_k[1:50] end),
        'leaving', to_jsonb(case when v_full_lists then v_leave_k else v_leave_k[1:50] end)))
    returning id into v_log;

  return jsonb_build_object('ok', v_full_lists, 'status', v_status, 'log_id', v_log,
    'sent', v_sent, 'listed', v_listed, 'added', cardinality(v_add_k), 'reactivated', cardinality(v_react_k),
    'kept', v_kept, 'leaving', cardinality(v_leave_k), 'active_before', v_active_before, 'active_after', v_active_after,
    'without_arabic', v_without, 'by_cut', v_cut,
    'added_names', to_jsonb(v_add[1:30]), 'reactivated_names', to_jsonb(v_react[1:30]), 'leaving_names', to_jsonb(v_leave[1:30]));
end;
$$;
comment on function public.ar_sync_shortages(text, text[], text, text, boolean, numeric[]) is
  'Replace the shortage list from a machine key, with optional suggested quantities (migrations 202611050022, 202611050026). Rollback: see 202611050026_ar_order_qty.';

revoke all on function public.ar_sync_shortages(text, text[], text, text, boolean, numeric[]) from public;
grant execute on function public.ar_sync_shortages(text, text[], text, text, boolean, numeric[]) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
