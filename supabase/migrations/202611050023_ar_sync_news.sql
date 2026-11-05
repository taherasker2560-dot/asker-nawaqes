202611050023_ar_sync_news.sql-- 202611050023_ar_sync_news
-- ASKER: the owner's phone says aloud that the shortage list was updated by the laptop (ar_sync_shortages).
-- Tasker on the phone asks every 15 minutes: POST /rest/v1/rpc/ar_sync_news {"p_key": <the phone's inbox key>}
-- with header Accept: text/plain. It gets one sentence for the updates not said yet (then they are marked said),
-- or an empty text when there is nothing new. Every update is said, also when nothing changed.
-- The key is the same phone key as the inbox (ar_inbox_keys, sha256 only); the laptop's key (ar_sync_keys) also
-- works, with p_peek = true to test without marking anything said.
-- Rollback: drop function public.ar_sync_news(text, boolean); alter table public.ar_sync_log drop column announced_at;

alter table public.ar_sync_log add column if not exists announced_at timestamptz;
-- the updates made before this migration are not said
update public.ar_sync_log set announced_at = now() where announced_at is null;

create or replace function public.ar_sync_news(p_key text, p_peek boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_ids bigint[];
  v_last public.ar_sync_log%rowtype;
  v_in text[]; v_out text[];
  v_say text;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{32,128}$' then
    raise exception 'bad key' using errcode = '28000';
  end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  if not exists (select 1 from public.ar_inbox_keys k where k.key_hash = v_hash)
     and not exists (select 1 from public.ar_sync_keys k where k.key_hash = v_hash) then
    raise exception 'bad key' using errcode = '28000';
  end if;

  select coalesce(array_agg(l.id order by l.id), '{}') into v_ids
    from public.ar_sync_log l where not l.dry_run and l.announced_at is null;
  if cardinality(v_ids) = 0 then
    return '';
  end if;
  select * into v_last from public.ar_sync_log l where l.id = v_ids[cardinality(v_ids)];

  if v_last.status like 'refused%' then
    v_say := 'تحديث النواقص اترفض لأن القايمة الجديدة فيها مشكلة، والبوت لسه على القايمة القديمة';
  else
    -- items that came in / went out since the last thing said, still in that state now
    select coalesce(array_agg(distinct x.k), '{}') into v_in
      from public.ar_sync_log l
      cross join lateral (select jsonb_array_elements_text(l.details->'added') as k
                          union all select jsonb_array_elements_text(l.details->'reactivated')) x
      where l.id = any(v_ids) and l.status = 'ok'
        and exists (select 1 from public.ar_shortages s where s.name_key = x.k and s.is_active);
    select coalesce(array_agg(distinct x.k), '{}') into v_out
      from public.ar_sync_log l
      cross join lateral jsonb_array_elements_text(l.details->'leaving') as x(k)
      where l.id = any(v_ids) and l.status = 'ok'
        and exists (select 1 from public.ar_shortages s where s.name_key = x.k and not s.is_active);

    v_say := 'النواقص اتحدثت، ' || v_last.active_after || ' صنف';
    if cardinality(v_in) = 0 and cardinality(v_out) = 0 then
      v_say := v_say || '، مفيش جديد';
    end if;
    if cardinality(v_in) > 0 then
      v_say := v_say || '، دخل ' || cardinality(v_in);
      if cardinality(v_in) <= 3 then
        v_say := v_say || ': ' || (select string_agg(coalesce(n.arabic_name, s.product_name, k.k), '، ')
          from unnest(v_in) as k(k)
          left join public.ar_names n on n.name_key = k.k
          left join public.ar_shortages s on s.name_key = k.k);
      end if;
    end if;
    if cardinality(v_out) > 0 then
      v_say := v_say || '، وخرج ' || cardinality(v_out);
      if cardinality(v_out) <= 3 then
        v_say := v_say || ': ' || (select string_agg(coalesce(n.arabic_name, s.product_name, k.k), '، ')
          from unnest(v_out) as k(k)
          left join public.ar_names n on n.name_key = k.k
          left join public.ar_shortages s on s.name_key = k.k);
      end if;
    end if;
  end if;

  if not coalesce(p_peek, false) then
    update public.ar_sync_log set announced_at = now() where id = any(v_ids);
  end if;
  return v_say;
end;
$$;
comment on function public.ar_sync_news(text, boolean) is
  'One spoken sentence for shortage-list updates not said yet (see migration 202611050023_ar_sync_news). Rollback: drop function public.ar_sync_news(text, boolean);';

revoke all on function public.ar_sync_news(text, boolean) from public;
grant execute on function public.ar_sync_news(text, boolean) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
