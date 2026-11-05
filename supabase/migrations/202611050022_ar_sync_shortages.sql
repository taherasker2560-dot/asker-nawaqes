-- 202611050022_ar_sync_shortages (applied on Supabase 2026-11-05 as migration "202611051345_ar_sync_shortages")
-- ASKER: the pharmacy laptop sends the general shortage list (النواقص العامة) to the bot by itself, every 4 hours
-- (D:\PharmaYaqez\Shortages\EXPORT_SHORTAGES.ps1 then SYNC_TO_BOT.ps1), instead of the owner uploading the Excel.
-- The laptop has its own key; only its sha256 is stored (ar_sync_keys), like ar_inbox_keys for the phone.
-- ar_sync_shortages replaces the list like the page («أيوه، استبدل»): what is in the list becomes active, the rest
-- inactive; rows are never deleted. A product keeps the row the owner already works with, so Arabic names, answers and
-- orders stay linked: 1) a row that is active now, 2) else the PharmaFly 25-letter cut name the bot knows (same as
-- uploading the PharmaFly report by hand; on 2026-11-05 the cut rows held the owner's approved Arabic names and most
-- answers), 3) else the full name the bot knows, 4) else the only known product that starts with the cut name (the
-- page's rule for cut names), 5) else a new row with the full name.
-- Nothing changes (the call is still logged in ar_sync_log) when the list is empty, is under 30% of the active list
-- (50+), or more than half of the active list would leave in one call. p_dry_run = true only reports.
-- Rollback: drop function public.ar_sync_shortages(text, text[], text, text, boolean);
--           drop table public.ar_sync_log; drop table public.ar_sync_keys;
--   undo one call N: update public.ar_shortages set is_active = true where name_key in
--     (select jsonb_array_elements_text(details->'leaving') from public.ar_sync_log where id = N);
--   then set is_active = false for the keys in details->'added' and details->'reactivated' of the same row.

create table if not exists public.ar_sync_keys (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  label text not null default 'laptop' check (char_length(label) between 1 and 80),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
comment on table public.ar_sync_keys is 'Machines allowed to send the shortage list (sha256 of the key only). Rollback: drop table public.ar_sync_keys;';
alter table public.ar_sync_keys enable row level security;
create policy "Owner ar sync keys" on public.ar_sync_keys for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create table if not exists public.ar_sync_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  source text not null,
  data_at text,
  dry_run boolean not null,
  status text not null,
  sent int not null default 0,
  listed int not null default 0,
  added int not null default 0,
  reactivated int not null default 0,
  kept int not null default 0,
  leaving int not null default 0,
  active_before int not null default 0,
  active_after int not null default 0,
  without_arabic int not null default 0,
  details jsonb not null default '{}'::jsonb
);
comment on table public.ar_sync_log is 'One row per ar_sync_shortages call; details holds the keys added / reactivated / leaving (undo). Rollback: drop table public.ar_sync_log;';
create index if not exists ar_sync_log_at on public.ar_sync_log (at desc);
alter table public.ar_sync_log enable row level security;
create policy "Owner ar sync log" on public.ar_sync_log for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create or replace function public.ar_sync_shortages(
  p_key text,
  p_names text[],
  p_source text default 'laptop',
  p_data_at text default null,
  p_dry_run boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_sent int := coalesce(cardinality(p_names), 0);
  v_raw text; v_name text; v_full text; v_k text; v_p text; v_cands text[];
  v_keys text[] := '{}'; v_pnames text[] := '{}'; v_cut int := 0;
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
    foreach v_raw in array coalesce(p_names, '{}'::text[]) loop
      v_raw := coalesce(v_raw, '');
      -- same cleaning as the page: text before | or a tab, single spaces, trimmed, max 250, 2+ chars with a letter
      v_name := left(btrim(regexp_replace(split_part(split_part(v_raw, '|', 1), E'\t', 1), '\s+', ' ', 'g')), 250);
      continue when char_length(v_name) < 2 or v_name !~ '[A-Za-z\u0600-\u06FF]';
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
      if not (v_k = any(v_keys)) then
        v_keys := v_keys || v_k; v_pnames := v_pnames || v_p;
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
    update public.ar_shortages s set is_active = false where s.is_active and not (s.name_key = any(v_keys));
  end if;
  select count(*) into v_active_after from public.ar_shortages s where s.is_active;

  v_full_lists := v_status in ('ok', 'dry-run');
  insert into public.ar_sync_log (source, data_at, dry_run, status, sent, listed, added, reactivated, kept, leaving,
      active_before, active_after, without_arabic, details)
    values (left(coalesce(nullif(btrim(p_source), ''), 'laptop'), 80), left(p_data_at, 40), coalesce(p_dry_run, false), v_status,
      v_sent, v_listed, cardinality(v_add_k), cardinality(v_react_k), v_kept, cardinality(v_leave_k),
      v_active_before, v_active_after, v_without,
      jsonb_build_object('by_cut', v_cut,
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
comment on function public.ar_sync_shortages(text, text[], text, text, boolean) is
  'Replace the shortage list from a machine key (see migration 202611051345_ar_sync_shortages). Rollback: drop function public.ar_sync_shortages(text, text[], text, text, boolean);';

revoke all on function public.ar_sync_shortages(text, text[], text, text, boolean) from public;
grant execute on function public.ar_sync_shortages(text, text[], text, text, boolean) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
