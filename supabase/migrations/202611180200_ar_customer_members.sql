-- 202611180200_ar_customer_members (NOT applied yet: needs the owner's approval on the phone)
-- ASKER store, owner 2026-11-18: «عايز أوبشن يخلي العميل من صفحته … عميل الأجل يقدر يبعت الأبلكيشن لأهل بيته، ويقدر يتحكم فيه، يعني يخلي الحساب الإجمالي يظهر لهم أو يحذفه …
-- بحيث ان هم يبقى معاهم نفس الإمكانيات بتاعة المستخدم الأساسي، ويتحاسبوا علينا كعدد عملاء، لكن هم مش متحكمين في الحساب. اللي متحكم في الحساب صاحب الرقم، دول توابع ليه».
-- A credit customer (the owner of the account) adds the people of his house from his own page: each one gets his own link (store.html#me=<secret>), the same app: the account's invoices and the regular items,
-- ordering from the pharmacy, the dose alarm (each one's own, kept on his own phone), the messages page. Only the owner of the account controls it:
--   ar_customer_members       : one row per person of the house. show_balance (default OFF) = he sees the account's total («عليك … ج»), the month's sums, the payments and what is left after each invoice; OFF = none of those numbers
--                               leave the server for him (only the invoices, with the items). on_account (default ON) = his orders may be put on the account; OFF = cash at pickup only.
--                               At most 10 a customer. Closed table (the owner of the pharmacy may read it).
--   ar_members_list / ar_member_add / ar_member_update / ar_member_remove : by the account OWNER's secret only (a house member's secret is refused: error 'not_owner').
--   ar_member_resolve         : inside the functions below: a secret → the customer and, for a house member, who he is. Not callable from outside.
--   ar_customer_view          : the same function as 202611170400; a house member's secret works too; when show_balance is off the answer carries no balance, no month sums, no payments, no running balance.
--   ar_customer_place_order   : the same function as 202611172330's caller; a house member's order is put on the account (customer_id) under «<his name> (أهل <the owner>)»; cash only when on_account is off (error 'member_cash').
--   ar_customer_regular_view  : a house member sees the account's regular items too.
--   ar_chat_open              : the same function as 202611141400; a house member gets his OWN chat (ar_chats.member_id), never the owner's: the pharmacy sees «<his name> (أهل <the owner>)».
-- A house member opening his page is counted on his own row (last_seen_at / seen_count), not on the owner's link. They count as customers of the pharmacy (the numbers: ar_members_count()).
-- Nothing existing is dropped. Rollback: put back ar_customer_view / ar_customer_place_order / ar_customer_regular_view / ar_chat_open from their earlier migrations and:
--   drop function public.ar_members_count(); drop function public.ar_member_remove(text, bigint); drop function public.ar_member_update(text, bigint, text, boolean, boolean);
--   drop function public.ar_member_add(text, text, boolean, boolean); drop function public.ar_members_list(text); drop function public.ar_member_resolve(text);
--   alter table public.ar_chats drop column member_id; drop table public.ar_customer_members;

create table if not exists public.ar_customer_members (
  id bigint generated always as identity primary key,
  customer_id bigint not null,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  name text not null check (char_length(name) between 1 and 40),
  show_balance boolean not null default false,
  on_account boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  seen_count int not null default 0 check (seen_count >= 0)
);
create index if not exists ar_customer_members_customer on public.ar_customer_members (customer_id);
alter table public.ar_customer_members enable row level security;
drop policy if exists "Owner reads ar customer members" on public.ar_customer_members;
create policy "Owner reads ar customer members" on public.ar_customer_members for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

alter table public.ar_chats add column if not exists member_id bigint;
create unique index if not exists ar_chats_member on public.ar_chats (member_id) where member_id is not null;

-- a secret → the customer (and the house member, when it is a member's): only used inside the functions below
create or replace function public.ar_member_resolve(p_token text)
 returns table (customer_id bigint, member_id bigint, member_name text, show_balance boolean, on_account boolean)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select l.customer_id, null::bigint, null::text, true, true
    from public.ar_customer_links l where p_token ~ '^[0-9a-f]{64}$' and l.token = p_token
  union all
  select m.customer_id, m.id, m.name, m.show_balance, m.on_account
    from public.ar_customer_members m where p_token ~ '^[0-9a-f]{64}$' and m.token = p_token
  limit 1
$function$;
revoke all on function public.ar_member_resolve(text) from public;
revoke all on function public.ar_member_resolve(text) from anon;
revoke all on function public.ar_member_resolve(text) from authenticated;

-- the account owner's side: only HIS secret (never a member's): the people of his house
create or replace function public.ar_members_list(p_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id bigint;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select l.customer_id into v_id from public.ar_customer_links l where l.token = p_token;
  if v_id is null then
    if exists (select 1 from public.ar_customer_members m where m.token = p_token) then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
    return jsonb_build_object('ok', false, 'error', 'link');
  end if;
  return jsonb_build_object('ok', true, 'max', 10, 'members', coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'token', m.token, 'show_balance', m.show_balance, 'on_account', m.on_account,
                                        'created_at', m.created_at, 'last_seen_at', m.last_seen_at, 'seen_count', m.seen_count) order by m.id)
      from public.ar_customer_members m where m.customer_id = v_id), '[]'::jsonb));
end $function$;
revoke all on function public.ar_members_list(text) from public;
grant execute on function public.ar_members_list(text) to anon, authenticated;

create or replace function public.ar_member_add(p_token text, p_name text, p_show_balance boolean default false, p_on_account boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id bigint; v_name text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 40); v_tok text; v_mid bigint;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select l.customer_id into v_id from public.ar_customer_links l where l.token = p_token;
  if v_id is null then
    if exists (select 1 from public.ar_customer_members m where m.token = p_token) then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
    return jsonb_build_object('ok', false, 'error', 'link');
  end if;
  if char_length(v_name) < 1 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  if (select count(*) from public.ar_customer_members m where m.customer_id = v_id) >= 10 then return jsonb_build_object('ok', false, 'error', 'max'); end if;
  v_tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.ar_customer_members (customer_id, token, name, show_balance, on_account)
  values (v_id, v_tok, v_name, coalesce(p_show_balance, false), coalesce(p_on_account, true))
  returning id into v_mid;
  return jsonb_build_object('ok', true, 'id', v_mid, 'token', v_tok, 'name', v_name);
end $function$;
revoke all on function public.ar_member_add(text, text, boolean, boolean) from public;
grant execute on function public.ar_member_add(text, text, boolean, boolean) to anon, authenticated;

-- a change of the owner of the account: his name, whether he sees the total, whether his orders go on the account (null = leave as it is)
create or replace function public.ar_member_update(p_token text, p_id bigint, p_name text default null, p_show_balance boolean default null, p_on_account boolean default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id bigint; v_name text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 40); v_n int;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select l.customer_id into v_id from public.ar_customer_links l where l.token = p_token;
  if v_id is null then
    if exists (select 1 from public.ar_customer_members m where m.token = p_token) then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
    return jsonb_build_object('ok', false, 'error', 'link');
  end if;
  if p_name is not null and char_length(v_name) < 1 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  update public.ar_customer_members
     set name = case when p_name is null then name else v_name end,
         show_balance = coalesce(p_show_balance, show_balance),
         on_account = coalesce(p_on_account, on_account)
   where id = p_id and customer_id = v_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'no_member'); end if;
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.ar_member_update(text, bigint, text, boolean, boolean) from public;
grant execute on function public.ar_member_update(text, bigint, text, boolean, boolean) to anon, authenticated;

-- removing a member: his link stops at once (and his own chat with the pharmacy stays as a plain chat of the pharmacy's)
create or replace function public.ar_member_remove(p_token text, p_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id bigint; v_n int;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select l.customer_id into v_id from public.ar_customer_links l where l.token = p_token;
  if v_id is null then
    if exists (select 1 from public.ar_customer_members m where m.token = p_token) then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
    return jsonb_build_object('ok', false, 'error', 'link');
  end if;
  update public.ar_chats set member_id = null where member_id = p_id and exists (select 1 from public.ar_customer_members m where m.id = p_id and m.customer_id = v_id);
  delete from public.ar_customer_members where id = p_id and customer_id = v_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'no_member'); end if;
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.ar_member_remove(text, bigint) from public;
grant execute on function public.ar_member_remove(text, bigint) to anon, authenticated;

-- the numbers for the pharmacy's «مستخدمين الموقع» card: house members are customers too (owner only)
create or replace function public.ar_members_count()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    raise exception 'owner only' using errcode = '42501';
  end if;
  return jsonb_build_object('ok', true,
    'members', (select count(*) from public.ar_customer_members),
    'opened', (select count(*) from public.ar_customer_members where seen_count > 0),
    'customers', (select count(distinct customer_id) from public.ar_customer_members));
end $function$;
revoke all on function public.ar_members_count() from public;
revoke all on function public.ar_members_count() from anon;
grant execute on function public.ar_members_count() to authenticated;

-- the customer's page: the account owner's secret or a house member's. A member with show_balance off gets the invoices and the items only
create or replace function public.ar_customer_view(p_token text, p_before_at timestamp without time zone default null::timestamp without time zone, p_before_id bigint default null::bigint, p_limit integer default 100, p_preview boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id bigint; v_mid bigint; v_mname text; v_show boolean; v_acc boolean;
  v_name text; v_balance numeric; v_moves jsonb; v_n int; v_month jsonb; v_data timestamptz; v_phone text;
  v_lim int := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_start timestamp := date_trunc('month', now() at time zone 'Africa/Cairo');
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select r.customer_id, r.member_id, r.member_name, r.show_balance, r.on_account into v_id, v_mid, v_mname, v_show, v_acc from public.ar_member_resolve(p_token) r;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select c.name, c.balance into v_name, v_balance from public.ar_customers c where c.id = v_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'link'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'at', m.at, 'kind', m.kind, 'total', m.total,
                                               'paid', case when v_show then m.paid end, 'balance', case when v_show then m.balance end, 'items', m.items) order by m.at desc, m.id desc), '[]'::jsonb),
         count(*)
    into v_moves, v_n
    from (select x.id, x.at, x.kind, x.total, x.paid, x.balance, x.items from public.ar_customer_moves x
           where x.customer_id = v_id
             and (v_show or x.kind in ('sale', 'return'))
             and (p_before_at is null or (x.at, x.id) < (p_before_at, coalesce(p_before_id, 9223372036854775807)))
           order by x.at desc, x.id desc
           limit v_lim) m;

  if p_before_at is null then
    -- the first page: when he opened it (the owner of the account on his link, a house member on his own row; not for the pharmacy's own look), this month's sums (only when he may see the account), when the data came, his saved number (the account owner's only)
    if not coalesce(p_preview, false) then
      if v_mid is null then
        update public.ar_customer_links set last_seen_at = now(), seen_count = seen_count + 1
         where customer_id = v_id and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
      else
        update public.ar_customer_members set last_seen_at = now(), seen_count = seen_count + 1
         where id = v_mid and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
      end if;
    end if;
    if v_show then
      select jsonb_build_object('bought', coalesce(sum(m.total) filter (where m.kind in ('sale', 'return')), 0),
                                'paid', coalesce(sum(m.paid), 0))
        into v_month
        from public.ar_customer_moves m where m.customer_id = v_id and m.at >= v_start;
    end if;
    select s.at into v_data from public.ar_sync_log s order by s.id desc limit 1;
    if v_mid is null then
      select p.phone into v_phone from public.ar_customer_phones p where p.customer_id = v_id order by p.updated_at limit 1;
    end if;
  end if;

  return jsonb_build_object('ok', true,
    'customer', jsonb_build_object('id', v_id, 'name', v_name, 'balance', case when v_show then v_balance end),
    'stopped', exists (select 1 from public.ar_customer_stops s where s.customer_id = v_id),
    'me', case when v_mid is null then jsonb_build_object('role', 'owner')
               else jsonb_build_object('role', 'member', 'id', v_mid, 'name', v_mname, 'show_balance', v_show, 'on_account', v_acc) end,
    'month', v_month, 'data_at', v_data, 'phone', v_phone,
    'moves', v_moves, 'more', v_n = v_lim);
end $function$;
revoke all on function public.ar_customer_view(text, timestamp without time zone, bigint, integer, boolean) from public;
grant execute on function public.ar_customer_view(text, timestamp without time zone, bigint, integer, boolean) to anon, authenticated;

-- an order from a customer's link or a house member's: the store's own function does every check and price
create or replace function public.ar_customer_place_order(p_token text, p_phone text, p_address text, p_notes text, p_items jsonb, p_rx text[] default null::text[], p_pay text default 'account')
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id bigint; v_mid bigint; v_mname text; v_acc boolean; v_name text; v_res jsonb; v_pay text := coalesce(p_pay, 'account');
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select r.customer_id, r.member_id, r.member_name, r.on_account into v_id, v_mid, v_mname, v_acc from public.ar_member_resolve(p_token) r;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select c.name into v_name from public.ar_customers c where c.id = v_id;
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  if v_pay not in ('account', 'cash') then return jsonb_build_object('ok', false, 'error', 'bad_pay'); end if;
  if v_pay = 'account' and exists (select 1 from public.ar_customer_stops s where s.customer_id = v_id) then
    return jsonb_build_object('ok', false, 'error', 'stopped');
  end if;
  if v_pay = 'account' and v_mid is not null and not v_acc then
    return jsonb_build_object('ok', false, 'error', 'member_cash');
  end if;
  v_res := public.ar_store_place_order(case when v_mid is null then v_name else left(v_mname || ' (أهل ' || v_name || ')', 80) end, p_phone, p_address, p_notes, p_items, p_rx);
  if coalesce((v_res->>'ok')::boolean, false) then
    update public.ar_store_orders set customer_id = v_id, pay = v_pay where id = (v_res->>'order_id')::bigint;
  end if;
  return v_res || jsonb_build_object('pay', v_pay);
end $function$;
revoke all on function public.ar_customer_place_order(text, text, text, text, jsonb, text[], text) from public;
grant execute on function public.ar_customer_place_order(text, text, text, text, jsonb, text[], text) to anon, authenticated;

-- the regular items: the account's, for the owner and for the house
create or replace function public.ar_customer_regular_view(p_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id bigint; v_rows jsonb; v_at timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select r.customer_id into v_id from public.ar_member_resolve(p_token) r;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('i', r.item_id, 'n', r.name, 'ar', nullif(btrim(coalesce(s.arabic_name, '')), ''),
                                               'gap', r.gap, 'times', r.times, 'q', r.q, 'last', r.last,
                                               'avail', coalesce(s.status = 'available', false)) order by r.last desc, r.item_id), '[]'::jsonb),
         max(r.updated_at)
    into v_rows, v_at
    from public.ar_customer_regular r left join public.ar_store_items s on s.id = r.item_id
   where r.customer_id = v_id;
  return jsonb_build_object('ok', true, 'rows', v_rows, 'at', v_at);
end $function$;
revoke all on function public.ar_customer_regular_view(text) from public;
grant execute on function public.ar_customer_regular_view(text) to anon, authenticated;

-- the messages page: the page's own secret, an account link (the owner's: the account's chat; a house member's: HIS OWN chat), or the phone number first
create or replace function public.ar_chat_open(p_secret text default null, p_token text default null, p_name text default null, p_phone text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_chat public.ar_chats%rowtype; v_cust bigint; v_name text; v_phone text; v_sup text; v_mid bigint; v_mname text;
  v_new text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if p_secret ~ '^[0-9a-f]{64}$' then
    select * into v_chat from public.ar_chats where secret = p_secret;
    if found then return jsonb_build_object('ok', true, 'secret', v_chat.secret, 'name', v_chat.name, 'linked', v_chat.customer_id is not null, 'supplier', v_chat.supplier); end if;
  end if;
  if p_token ~ '^[0-9a-f]{64}$' then
    select r.customer_id, r.member_id, r.member_name into v_cust, v_mid, v_mname from public.ar_member_resolve(p_token) r;
    if v_cust is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;
    select c.name into v_name from public.ar_customers c where c.id = v_cust;
    if v_name is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;
    if v_mid is not null then
      -- a house member: his own chat, named for the pharmacy «<he> (أهل <the owner>)» (never the owner's chat: its messages are the owner's)
      select * into v_chat from public.ar_chats where member_id = v_mid;
      if found then return jsonb_build_object('ok', true, 'secret', v_chat.secret, 'name', v_chat.name, 'linked', false); end if;
      v_name := left(v_mname || ' (أهل ' || v_name || ')', 120);
      insert into public.ar_chats (secret, member_id, name) values (v_new, v_mid, v_name);
      return jsonb_build_object('ok', true, 'secret', v_new, 'name', v_name, 'linked', false);
    end if;
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
  if v_phone !~ '^01[0-9]{9}$' then return jsonb_build_object('ok', false, 'error', 'bad_phone'); end if;
  v_sup := public.ar_supplier_of(v_phone);
  if v_sup is null then
    if v_name = '' then return jsonb_build_object('ok', false, 'error', 'need_name'); end if;
    if char_length(v_name) not between 2 and 60 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  end if;
  -- no flood of new chats: 10 a day for one number, 30 every 10 minutes for everyone (the page: «جرب تاني بعد شوية»)
  if (select count(*) from public.ar_chats where phone = v_phone and created_at > now() - interval '1 day') >= 10
     or (select count(*) from public.ar_chats where created_at > now() - interval '10 minutes') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  insert into public.ar_chats (secret, name, phone, supplier) values (v_new, left(coalesce(v_sup, v_name), 120), v_phone, v_sup);
  return jsonb_build_object('ok', true, 'secret', v_new, 'name', coalesce(v_sup, v_name), 'linked', false, 'supplier', v_sup);
end $function$;
revoke all on function public.ar_chat_open(text, text, text, text) from public;
grant execute on function public.ar_chat_open(text, text, text, text) to anon, authenticated;
