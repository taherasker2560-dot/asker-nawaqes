-- 202611120500_ar_supplier_rematch (NOT applied yet: needs the owner's OK)
-- ASKER: link the warehouses' list lines to items created in PharmaFly AFTER the list was uploaded (owner 2026-11-12:
-- «ابيكساجارد بيظهر في القوايم … والايميونوكوسترا وجويلاسك عشان جداد مابيظهرش»). A list is matched once, at upload, against
-- the items that exist then, so an item made later never got its lines: IMMUONCOSTRA 70592 (NEWCITY 22%, AMG 21%, REDA 21%,
-- ELFATH unlinked), JOILASK 70595 (REDA's line linked to GALVUS MET «ضعيف»).
-- The laptop (Hub\supplier_match\REMATCH_NEW.ps1, read only on PharmaFly) finds them with match_v5's rules and sends
-- {id, item_id, pharmafly_name, match_status} with its sync key. The server changes ONLY lines that are still pending AND
-- unlinked or «ضعيف»/«مش لاقي», to «قوي»/«كويس», and only to an item it knows (ar_store_items). It never touches a line the
-- owner accepted, rejected or marked «مش عندنا»; «قوي» lines then wait for his one tap («اقبل القوي») like any new list.
-- Rollback: drop function public.ar_supplier_rematch(text, jsonb);
create or replace function public.ar_supplier_rematch(p_key text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; v_n int; v_ch int := 0;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'rows must be an array'; end if;
  v_n := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  if v_n > 1000 then raise exception 'batch too big (max 1000)'; end if;
  if v_n > 0 then
    with e as (
      select distinct on ((x->>'id')::bigint) (x->>'id')::bigint id, (x->>'item_id')::bigint item_id,
             left(btrim(coalesce(x->>'pharmafly_name', '')), 300) pf, x->>'match_status' st
      from jsonb_array_elements(p_rows) x
      where (x->>'id') ~ '^[0-9]{1,18}$' and (x->>'item_id') ~ '^[0-9]{1,12}$' and (x->>'match_status') in ('strong', 'good')
      order by (x->>'id')::bigint
    )
    update public.ar_supplier_items t
       set item_id = e.item_id,
           pharmafly_name = coalesce(nullif(e.pf, ''), i.name),
           match_status = e.st
      from e join public.ar_store_items i on i.id = e.item_id
     where t.id = e.id
       and t.review = 'pending'
       and (t.item_id is null or t.match_status in ('weak', 'none'))
       and (t.item_id is distinct from e.item_id or t.match_status is distinct from e.st);
    get diagnostics v_ch = row_count;
  end if;
  return jsonb_build_object('ok', true, 'sent', v_n, 'changed', v_ch);
end $function$;

revoke all on function public.ar_supplier_rematch(text, jsonb) from public;
grant execute on function public.ar_supplier_rematch(text, jsonb) to anon, authenticated;
