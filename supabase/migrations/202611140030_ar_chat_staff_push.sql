-- 202611140030_ar_chat_staff_push (NOT applied yet: needs the owner's approval on the phone)
-- ASKER: «رسالة جديدة من عميل» on the pharmacy's phones even with the bot closed (owner 2026-11-14, live test: «بعت رسالة
-- من الموقع وما جاليش إشعارات»; part 1's plan said the owner is told when a customer writes, and that only worked with the
-- bot open). The owner, or staff with «خدمة العملاء», turn it on in the bot (their phone's push address is kept here); the
-- function asker-chat pushes (no payload) when a customer sends, at most once a minute per chat (ar_chats.notified_at).
-- Rollback: drop function public.ar_chat_staff_push_save(text); drop table public.ar_chat_staff_push;
--   alter table public.ar_chats drop column if exists notified_at;

alter table public.ar_chats add column if not exists notified_at timestamptz;

create table if not exists public.ar_chat_staff_push (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists ar_chat_staff_push_user on public.ar_chat_staff_push (user_id);
-- nobody reads or writes it directly (the function below, and asker-chat with the service key)
alter table public.ar_chat_staff_push enable row level security;

create or replace function public.ar_chat_staff_push_save(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid and not (select public.ar_staff_can(array['care']::text[])) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then return jsonb_build_object('ok', false, 'error', 'bad_endpoint'); end if;
  -- at most 5 phones a person
  if (select count(*) from public.ar_chat_staff_push where user_id = v_me and endpoint <> p_endpoint) >= 5 then
    delete from public.ar_chat_staff_push where endpoint in (select endpoint from public.ar_chat_staff_push where user_id = v_me order by created_at limit 1);
  end if;
  insert into public.ar_chat_staff_push (endpoint, user_id) values (p_endpoint, v_me)
  on conflict (endpoint) do update set user_id = excluded.user_id, created_at = now();
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.ar_chat_staff_push_save(text) from public;
revoke all on function public.ar_chat_staff_push_save(text) from anon;
grant execute on function public.ar_chat_staff_push_save(text) to authenticated;
