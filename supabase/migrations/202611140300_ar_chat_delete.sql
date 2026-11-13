-- 202611140300_ar_chat_delete (NOT applied yet: needs the owner's approval on the phone)
-- ASKER: «🗑 امسح المحادثة» in «خدمة العملاء ← الرسايل» (owner 2026-11-14: «عايز اوبشن لحذف الرسائل برضو، عشان الحاجات دي
-- برضو ما تاخدش شكلها وحش»). The owner only. The bot removes the chat's photos and voice notes from the bucket ar-chat, then
-- ar_chat_delete removes the chat (its messages and its push addresses go with it).
-- Rollback: drop function public.ar_chat_delete(uuid); drop policy "Owner deletes chat files" on storage.objects;
drop policy if exists "Owner deletes chat files" on storage.objects;
create policy "Owner deletes chat files" on storage.objects for delete to authenticated
  using (bucket_id = 'ar-chat' and (select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

create or replace function public.ar_chat_delete(p_chat uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_n int;
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    raise exception 'owner only' using errcode = '42501';
  end if;
  delete from public.ar_chats where id = p_chat;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n = 1, 'deleted', v_n);
end $function$;
revoke all on function public.ar_chat_delete(uuid) from public;
revoke all on function public.ar_chat_delete(uuid) from anon;
grant execute on function public.ar_chat_delete(uuid) to authenticated;
