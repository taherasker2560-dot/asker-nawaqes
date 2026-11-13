-- 202611140200_ar_chat_open_limits (NOT applied yet: needs the owner's approval on the phone)
-- ASKER: opening a chat by name and number (owner 2026-11-14, a screenshot of «رسايل كتير في وقت قليل» on his own tests: «هنقول
-- للعملاء رسائل كتير ما تبعتوش»). A customer's phone keeps its chat, so a new one is rare; the limit was too tight for a
-- number (3 an hour) and its words blamed the customer. Now: 10 new chats a day for one number, 30 every 10 minutes for
-- everyone, and the answer is 'busy' (the page says «جرب تاني بعد شوية»). Same function as 202611132330 otherwise.
-- Rollback: apply ar_chat_open of 202611132330_ar_chat.sql again.
create or replace function public.ar_chat_open(p_secret text default null, p_token text default null, p_name text default null, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_chat public.ar_chats%rowtype; v_cust bigint; v_name text; v_phone text;
  v_new text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if p_secret ~ '^[0-9a-f]{64}$' then
    select * into v_chat from public.ar_chats where secret = p_secret;
    if found then return jsonb_build_object('ok', true, 'secret', v_chat.secret, 'name', v_chat.name, 'linked', v_chat.customer_id is not null); end if;
  end if;
  if p_token ~ '^[0-9a-f]{64}$' then
    select c.id, c.name into v_cust, v_name
      from public.ar_customer_links l join public.ar_customers c on c.id = l.customer_id where l.token = p_token;
    if v_cust is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;
    select * into v_chat from public.ar_chats where customer_id = v_cust;
    if found then return jsonb_build_object('ok', true, 'secret', v_chat.secret, 'name', v_chat.name, 'linked', true); end if;
    select case when p.phone ~ '^201[0-9]{9}$' then substr(p.phone, 2) end into v_phone
      from public.ar_customer_phones p where p.customer_id = v_cust order by p.updated_at limit 1;
    insert into public.ar_chats (secret, customer_id, name, phone) values (v_new, v_cust, left(v_name, 120), v_phone);
    return jsonb_build_object('ok', true, 'secret', v_new, 'name', v_name, 'linked', true);
  end if;
  v_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if v_phone ~ '^201[0-9]{9}$' then v_phone := substr(v_phone, 2); end if;
  if char_length(v_name) not between 2 and 60 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  if v_phone !~ '^01[0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'bad_phone'); end if;
  -- no flood of new chats: 10 a day for one number, 30 every 10 minutes for everyone (the page: «جرب تاني بعد شوية»)
  if (select count(*) from public.ar_chats where phone = v_phone and created_at > now() - interval '1 day') >= 10
     or (select count(*) from public.ar_chats where created_at > now() - interval '10 minutes') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  insert into public.ar_chats (secret, name, phone) values (v_new, v_name, v_phone);
  return jsonb_build_object('ok', true, 'secret', v_new, 'name', v_name, 'linked', false);
end $function$;
revoke all on function public.ar_chat_open(text, text, text, text) from public;
grant execute on function public.ar_chat_open(text, text, text, text) to anon, authenticated;
