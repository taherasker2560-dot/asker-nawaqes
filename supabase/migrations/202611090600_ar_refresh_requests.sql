-- 202611090600_ar_refresh_requests (NOT applied yet: needs the owner's explicit OK)
-- ASKER: «حدّث النواقص دلوقتي». The owner asks from the bot page for a shortage update right now (after the purchases are
-- entered in PharmaFly). The laptop looks for a waiting request every few minutes with its own key (ar_sync_keys, the same
-- key the shortage sync uses), runs the hub (restore the newest pharmacy backup, export, send the list: the phone then says
-- «النواقص اتحدثت…» as for any update) and reports back. Nothing else: no list is changed here, nothing is sent here.
-- Only ONE request can be open (new or running) at a time, so a double tap does not queue two hub runs.
-- A request that stays «running» more than 60 minutes (the laptop died) is marked failed by the next call.
-- Rollback: drop function public.ar_refresh_done(text, bigint, boolean, text);
--           drop function public.ar_refresh_claim(text);
--           drop table public.ar_refresh_requests;

create table if not exists public.ar_refresh_requests (
  id bigint generated always as identity primary key,
  requested_at timestamptz not null default now(),
  requested_by uuid default auth.uid(),
  reason text not null default 'manual' check (reason in ('manual', 'after_purchases', 'after_order')),
  status text not null default 'new' check (status in ('new', 'running', 'done', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  note text check (note is null or char_length(note) <= 500)
);
comment on table public.ar_refresh_requests is 'Owner asks the laptop for a shortage update now (page button). Rollback: drop table public.ar_refresh_requests;';
create index if not exists ar_refresh_requests_status on public.ar_refresh_requests (status, id);
create unique index if not exists ar_refresh_one_open on public.ar_refresh_requests ((true)) where status in ('new', 'running');
alter table public.ar_refresh_requests enable row level security;
drop policy if exists "Owner reads refresh requests" on public.ar_refresh_requests;
create policy "Owner reads refresh requests" on public.ar_refresh_requests for select to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Owner adds refresh requests" on public.ar_refresh_requests;
create policy "Owner adds refresh requests" on public.ar_refresh_requests for insert to authenticated
  with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid and status = 'new' and started_at is null and finished_at is null and note is null);

-- the laptop: takes the oldest waiting request (marks it running) and returns its id, or null when nothing waits
create or replace function public.ar_refresh_claim(p_key text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash text;
  v_id bigint;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{32,128}$' then
    raise exception 'bad key' using errcode = '28000';
  end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  if not exists (select 1 from public.ar_sync_keys k where k.key_hash = v_hash) then
    raise exception 'bad key' using errcode = '28000';
  end if;
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  update public.ar_refresh_requests
     set status = 'failed', finished_at = now(), note = 'timeout: the laptop did not finish in 60 minutes'
   where status = 'running' and started_at < now() - interval '60 minutes';
  update public.ar_refresh_requests r
     set status = 'running', started_at = now()
   where r.id = (select q.id from public.ar_refresh_requests q where q.status = 'new' order by q.id limit 1 for update skip locked)
  returning r.id into v_id;
  return v_id;
end;
$function$;

-- the laptop: says how the run ended
create or replace function public.ar_refresh_done(p_key text, p_id bigint, p_ok boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash text;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{32,128}$' then
    raise exception 'bad key' using errcode = '28000';
  end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  if not exists (select 1 from public.ar_sync_keys k where k.key_hash = v_hash) then
    raise exception 'bad key' using errcode = '28000';
  end if;
  update public.ar_refresh_requests
     set status = case when coalesce(p_ok, false) then 'done' else 'failed' end,
         finished_at = now(),
         note = left(nullif(btrim(coalesce(p_note, '')), ''), 500)
   where id = p_id and status = 'running';
end;
$function$;

revoke all on function public.ar_refresh_claim(text) from public;
grant execute on function public.ar_refresh_claim(text) to anon, authenticated, service_role;
revoke all on function public.ar_refresh_done(text, bigint, boolean, text) from public;
grant execute on function public.ar_refresh_done(text, bigint, boolean, text) to anon, authenticated, service_role;
