-- 202611050025_ar_sync_news_alerts
-- ar_sync_news (the phone's spoken update) also warns:
--  1) when the laptop has not updated the list for 6 hours (asleep, no internet, key problem): «تنبيه: النواقص
--     ماتحدّثتش من N ساعة»; said once, then again every 6 hours while it stays stale.
--  2) with each update, how many active items still have no Arabic name: «، و2 محتاجين ترجمة».
-- Same key check, same plain-text answer, same «peek» test mode as 202611050024.
-- Rollback: run 202611050024_ar_sync_news_plain_text again (it recreates the previous function), then
--           drop table public.ar_sync_alerts;

create table if not exists public.ar_sync_alerts (
  kind text primary key check (char_length(kind) between 1 and 40),
  said_at timestamptz
);
comment on table public.ar_sync_alerts is 'When each spoken warning was last said (ar_sync_news). Rollback: drop table public.ar_sync_alerts;';
alter table public.ar_sync_alerts enable row level security;
create policy "Owner ar sync alerts" on public.ar_sync_alerts for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create or replace function public.ar_sync_news(p_key text, p_peek boolean default false)
returns public."text/plain"
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_ids bigint[];
  v_last public.ar_sync_log%rowtype;
  v_in text[]; v_out text[];
  v_say text := '';
  v_warn text := '';
  v_last_ok timestamptz;
  v_said timestamptz;
  v_hours int;
  v_untranslated int;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{32,128}$' then
    raise exception 'bad key' using errcode = '28000';
  end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  if not exists (select 1 from public.ar_inbox_keys k where k.key_hash = v_hash)
     and not exists (select 1 from public.ar_sync_keys k where k.key_hash = v_hash) then
    raise exception 'bad key' using errcode = '28000';
  end if;

  -- 1) the laptop stopped updating the list
  select max(l.at) into v_last_ok from public.ar_sync_log l where not l.dry_run and l.status = 'ok';
  if v_last_ok is not null and v_last_ok < now() - interval '6 hours' then
    select a.said_at into v_said from public.ar_sync_alerts a where a.kind = 'stale';
    if v_said is null or v_said < now() - interval '6 hours' then
      v_hours := floor(extract(epoch from (now() - v_last_ok)) / 3600);
      v_warn := 'تنبيه: النواقص ماتحدّثتش من ' || v_hours || ' ساعة، شوف اللابتوب';
      if not coalesce(p_peek, false) then
        insert into public.ar_sync_alerts (kind, said_at) values ('stale', now())
          on conflict (kind) do update set said_at = excluded.said_at;
      end if;
    end if;
  end if;

  -- 2) updates not said yet
  select coalesce(array_agg(l.id order by l.id), '{}') into v_ids
    from public.ar_sync_log l where not l.dry_run and l.announced_at is null;
  if cardinality(v_ids) > 0 then
    select * into v_last from public.ar_sync_log l where l.id = v_ids[cardinality(v_ids)];
    if v_last.status like 'refused%' then
      v_say := 'تحديث النواقص اترفض لأن القايمة الجديدة فيها مشكلة، والبوت لسه على القايمة القديمة';
    else
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
      -- active items the bot cannot match yet (no Arabic name)
      select count(*) into v_untranslated from public.ar_shortages s
        where s.is_active and not exists (select 1 from public.ar_names n where n.name_key = s.name_key);
      if v_untranslated > 0 then
        v_say := v_say || '، و' || v_untranslated || ' محتاجين ترجمة';
      end if;
    end if;
    if not coalesce(p_peek, false) then
      update public.ar_sync_log set announced_at = now() where id = any(v_ids);
    end if;
  end if;

  return btrim(concat_ws('. ', nullif(v_warn, ''), nullif(v_say, '')));
end;
$$;
comment on function public.ar_sync_news(text, boolean) is
  'Spoken sentence (plain text) for the phone: list updates not said yet, items needing translation, and a warning when the laptop stopped updating (migrations 202611050023/0024/0025). Rollback: see 202611050025_ar_sync_news_alerts.';

revoke all on function public.ar_sync_news(text, boolean) from public;
grant execute on function public.ar_sync_news(text, boolean) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
