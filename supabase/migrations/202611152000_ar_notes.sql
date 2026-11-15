-- 202611152000_ar_notes (NOT applied yet: the owner said «المفكرة الصوتية … اشتغل فيها على طول» 2026-11-15 and «موافق على كل حاجة»;
-- his words, IDEAS.md 2026-11-15: «عايز اعمل مفكرة صوتية جوه البوت … تفكرني بحاجة وانا في الصيدلية … اللاب هيخش على شبكة الصيدلية
-- فتبتدي تنبهني … ويظهر لي زي بيان كده … اللي خلص ادوس عليه ان هو خلص»).
--   ar_notes    : his notes. place 'pharmacy' = remind me when I am in the pharmacy, 'any' = just a note. status open / done / cancelled.
--                 reminded_at = the last time the page reminded him (so it does not shout again on every refresh).
--   ar_presence : ONE row (id = 1): is the laptop on the pharmacy network now (the laptop can reach the pharmacy server on the
--                 LAN, 192.168.1.110:33777, the same test as Hub\launch\OPEN_PHARMAFLY.ps1). since = when it last changed,
--                 checked_at = the laptop's last word (a stale one means «I do not know»).
--   Written by: the owner's own sign-in (notes), the laptop's hub through ar_presence_set with the laptop key (presence).
--   Read/changed: the OWNER only.
-- Rollback: drop function public.ar_presence_set(text, boolean); drop table public.ar_presence; drop table public.ar_notes;
create table if not exists public.ar_notes (
  id bigint generated always as identity primary key,
  text text not null check (char_length(btrim(text)) between 1 and 500),
  place text not null default 'pharmacy' check (place in ('pharmacy', 'any')),
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  reminded_at timestamptz
);
create index if not exists ar_notes_status_created on public.ar_notes (status, created_at desc);
alter table public.ar_notes enable row level security;
drop policy if exists "Owner reads ar notes" on public.ar_notes;
create policy "Owner reads ar notes" on public.ar_notes for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Owner adds ar notes" on public.ar_notes;
create policy "Owner adds ar notes" on public.ar_notes for insert to authenticated
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Owner changes ar notes" on public.ar_notes;
create policy "Owner changes ar notes" on public.ar_notes for update to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create table if not exists public.ar_presence (
  id int primary key check (id = 1),
  at_pharmacy boolean not null,
  since timestamptz not null default now(),
  checked_at timestamptz not null default now()
);
alter table public.ar_presence enable row level security;
drop policy if exists "Owner reads ar presence" on public.ar_presence;
create policy "Owner reads ar presence" on public.ar_presence for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

-- ---------- the laptop's word ----------
create or replace function public.ar_presence_set(p_key text, p_at_pharmacy boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if p_at_pharmacy is null then raise exception 'at_pharmacy is required'; end if;
  insert into public.ar_presence as t (id, at_pharmacy, since, checked_at)
  values (1, p_at_pharmacy, now(), now())
  on conflict (id) do update set
    at_pharmacy = excluded.at_pharmacy,
    since = case when t.at_pharmacy is distinct from excluded.at_pharmacy then now() else t.since end,
    checked_at = now();
  return jsonb_build_object('ok', true, 'at_pharmacy', p_at_pharmacy);
end $function$;
revoke all on function public.ar_presence_set(text, boolean) from public;
grant execute on function public.ar_presence_set(text, boolean) to anon, authenticated;
