CREATE OR REPLACE FUNCTION public.ar_customers_sync(p_key text, p_customers jsonb, p_moves jsonb, p_gone jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if v_ng > 0 then
    delete from public.ar_customer_moves
    where id in (select (g #>> '{}')::bigint from jsonb_array_elements(p_gone) g where (g #>> '{}') ~ '^-?[0-9]{1,15}$');
    get diagnostics v_g = row_count;
  end if;
  return jsonb_build_object('ok', true, 'customers', v_c, 'moves', v_m, 'gone', v_g);
end $function$
