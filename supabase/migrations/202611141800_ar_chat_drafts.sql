-- 202611141800_ar_chat_drafts (NOT applied yet: needs the owner's approval on the phone)
-- ASKER «الرسايل», part 2: the bot writes the answer (owner 2026-11-13 «أسبوع تجربة»; 2026-11-14 «خليه يرد على كل حاجة، حتى
-- الروشتة والجرعة والفلوس والشكوى … لو ما عجبتنيش الرسالة هعدلها او همسحها»). When a customer writes, the function asker-chat
-- («draft») writes a suggested answer from our data (store items and stock, his account, his orders; a prescription photo is
-- read) and keeps it here. The pharmacy sends it as it is, edits it, or skips it; every outcome is kept, so after the trial week
-- the owner sees how often it was right, kind by kind, before he lets a kind go out by itself (ar_chat_settings.auto_kinds,
-- empty = nothing goes alone: the trial).
--   ar_chat_drafts     : one row per suggestion (the newest customer message it answers, its kind, the text, what it used)
--   ar_chat_settings   : one row: the kinds that go out by themselves (the owner turns them on, one by one)
--   ar_chat_draft_done : the pharmacy's decision (sent / edited with the text that went / skipped)
--   ar_chat_auto_set   : the owner's switches
-- Rollback: drop function public.ar_chat_auto_set(text[]); drop function public.ar_chat_draft_done(bigint, text, text);
--   drop table public.ar_chat_settings; drop table public.ar_chat_drafts;

create table if not exists public.ar_chat_drafts (
  id bigint generated always as identity primary key,
  chat_id uuid not null references public.ar_chats (id) on delete cascade,
  for_msg bigint not null,
  kind text not null check (kind in ('availability', 'account', 'order', 'rx', 'dose', 'money', 'complaint', 'other')),
  body text not null check (char_length(body) between 1 and 2000),
  facts jsonb not null default '[]'::jsonb,
  status text not null default 'ready' check (status in ('ready', 'sent', 'edited', 'skipped', 'old', 'auto')),
  final_body text check (final_body is null or char_length(final_body) <= 2000),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
create index if not exists ar_chat_drafts_chat on public.ar_chat_drafts (chat_id, id desc);
create index if not exists ar_chat_drafts_ready on public.ar_chat_drafts (chat_id) where status = 'ready';
create unique index if not exists ar_chat_drafts_one on public.ar_chat_drafts (chat_id, for_msg);

create table if not exists public.ar_chat_settings (
  id int primary key default 1 check (id = 1),
  auto_kinds text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.ar_chat_settings (id) values (1) on conflict (id) do nothing;

-- who reads: the owner, and staff with «خدمة العملاء»; nobody writes directly (the functions below and asker-chat do)
alter table public.ar_chat_drafts enable row level security;
alter table public.ar_chat_settings enable row level security;
drop policy if exists "Owner reads ar chat drafts" on public.ar_chat_drafts;
create policy "Owner reads ar chat drafts" on public.ar_chat_drafts for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Staff select ar_chat_drafts" on public.ar_chat_drafts;
create policy "Staff select ar_chat_drafts" on public.ar_chat_drafts for select to authenticated
  using ((select public.ar_staff_can(array['care']::text[])));
drop policy if exists "Owner reads ar chat settings" on public.ar_chat_settings;
create policy "Owner reads ar chat settings" on public.ar_chat_settings for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Staff select ar_chat_settings" on public.ar_chat_settings;
create policy "Staff select ar_chat_settings" on public.ar_chat_settings for select to authenticated
  using ((select public.ar_staff_can(array['care']::text[])));

-- the pharmacy's decision on a suggestion (the owner, or staff with «خدمة العملاء»); only a waiting one changes
create or replace function public.ar_chat_draft_done(p_id bigint, p_outcome text, p_final text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_n int;
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid and not (select public.ar_staff_can(array['care']::text[])) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('sent', 'edited', 'skipped') then return jsonb_build_object('ok', false, 'error', 'outcome'); end if;
  update public.ar_chat_drafts
     set status = p_outcome, final_body = case when p_outcome = 'edited' then left(nullif(btrim(coalesce(p_final, '')), ''), 2000) end,
         decided_at = now(), decided_by = (select auth.uid())
   where id = p_id and status = 'ready';
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n = 1);
end $function$;
revoke all on function public.ar_chat_draft_done(bigint, text, text) from public;
revoke all on function public.ar_chat_draft_done(bigint, text, text) from anon;
grant execute on function public.ar_chat_draft_done(bigint, text, text) to authenticated;

-- the kinds that go out by themselves (the owner only; empty = the trial: the bot only writes)
create or replace function public.ar_chat_auto_set(p_kinds text[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_kinds text[] := coalesce((select array_agg(distinct k order by k) from unnest(coalesce(p_kinds, '{}'::text[])) k), '{}');
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if not v_kinds <@ array['availability', 'account', 'order', 'rx', 'dose', 'money', 'complaint', 'other']::text[] then
    return jsonb_build_object('ok', false, 'error', 'kind');
  end if;
  update public.ar_chat_settings set auto_kinds = v_kinds, updated_at = now(), updated_by = (select auth.uid()) where id = 1;
  return jsonb_build_object('ok', true, 'auto_kinds', to_jsonb(v_kinds));
end $function$;
revoke all on function public.ar_chat_auto_set(text[]) from public;
revoke all on function public.ar_chat_auto_set(text[]) from anon;
grant execute on function public.ar_chat_auto_set(text[]) to authenticated;
