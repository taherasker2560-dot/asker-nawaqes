-- «عملاء التوصيل» (owner 2026-11-19: «هسجلهم في فارمافلاي … عملاء التوصيل … لما يطلب حاجة أنا هسجلها على حسابه، ولما يجي ويدفع الفلوس هنزلها من حسابه … أهل البيت … والأدوية
-- اللي بيستخدمها … والمتأخرة زي العميل الأجل بالظبط»; and 2026-11-18 «بس عايز ده يبقى معزول عن ده»). In PharmaFly they are the cards with «عميل توصيل» (Cards.IsHDCustomer);
-- they phone the pharmacy to prepare their things and send someone to collect them: there is NO delivery. The laptop (Store\SYNC_CUSTOMERS.ps1) now takes these cards too, and tells
-- the server which of the customers are of this kind; the system keeps them APART from the credit customers: its own list and totals, never in «عدّوا الحد», «صافي الدين»,
-- «ديون قديمة» or the old-debts badge. Their page is the credit customer's page (account, orders, household, regular medicines, the late ones): every function works by the customer id.
--   ar_customers.kind          'credit' (default) | 'pickup'
--   ar_customer_kinds_sync(p_key, p_pickup)  the laptop's sync key (the same as ar_customers_sync): the WHOLE list of pickup customer ids; those become 'pickup', the rest 'credit'.
-- Rollback: drop function public.ar_customer_kinds_sync(text, jsonb); alter table public.ar_customers drop column kind;

alter table public.ar_customers add column if not exists kind text not null default 'credit';
alter table public.ar_customers drop constraint if exists ar_customers_kind_check;
alter table public.ar_customers add constraint ar_customers_kind_check check (kind in ('credit', 'pickup'));

create or replace function public.ar_customer_kinds_sync(p_key text, p_pickup jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_hash text; v_ids bigint[]; v_up int := 0; v_down int := 0;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  if jsonb_typeof(coalesce(p_pickup, '[]'::jsonb)) <> 'array' then raise exception 'ids must be an array'; end if;
  if jsonb_array_length(coalesce(p_pickup, '[]'::jsonb)) > 2000 then raise exception 'too many (max 2000)'; end if;
  select coalesce(array_agg((g #>> '{}')::bigint), '{}') into v_ids
    from jsonb_array_elements(coalesce(p_pickup, '[]'::jsonb)) g where (g #>> '{}') ~ '^[0-9]{1,12}$';
  perform pg_advisory_xact_lock(hashtext('public.ar_customer_kinds_sync'));
  update public.ar_customers set kind = 'pickup' where id = any (v_ids) and kind <> 'pickup';
  get diagnostics v_up = row_count;
  update public.ar_customers set kind = 'credit' where kind <> 'credit' and not (id = any (v_ids));
  get diagnostics v_down = row_count;
  return jsonb_build_object('ok', true, 'pickup', coalesce(array_length(v_ids, 1), 0), 'to_pickup', v_up, 'to_credit', v_down);
end $function$;

revoke all on function public.ar_customer_kinds_sync(text, jsonb) from public;
grant execute on function public.ar_customer_kinds_sync(text, jsonb) to anon, authenticated;
