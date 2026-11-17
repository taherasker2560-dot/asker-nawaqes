-- Bot + store site, owner 2026-11-17: «فتحي رابطه بيبعت رسالة على الواتس بتاعه، اعملها زرار احسن … يفتح لي صفحة العميل زي ما هو بيشوفها».
-- The bot gets a «👁 شوف صفحته» button in a customer's statement that opens his page (store.html#me=<secret>) on the owner's phone as a look.
-- That look must not count as the customer opening his link: ar_customer_view stamps ar_customer_links.last_seen_at / seen_count (what the bot shows as
-- «فتح رابطه: …» and what the «مستخدمين الموقع» card counts as customers who opened). So the function gets one more argument, p_preview (default false): the
-- store site sends true when the page is open on the pharmacy's own phone (the bot signed in there), and nothing is stamped.
-- Everything else is the function as it is on the server since 202611132100: the same answer, the same checks (a customer's own rows only, never the credit limit).
-- The old four-argument function is dropped (two overloads with defaults would make a named call ambiguous); a call without p_preview behaves exactly as before.

drop function if exists public.ar_customer_view(text, timestamp without time zone, bigint, integer);

create or replace function public.ar_customer_view(p_token text, p_before_at timestamp without time zone default null::timestamp without time zone, p_before_id bigint default null::bigint, p_limit integer default 100, p_preview boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id bigint; v_name text; v_balance numeric; v_moves jsonb; v_n int; v_month jsonb; v_data timestamptz; v_phone text;
  v_lim int := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_start timestamp := date_trunc('month', now() at time zone 'Africa/Cairo');
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select c.id, c.name, c.balance into v_id, v_name, v_balance
    from public.ar_customer_links l join public.ar_customers c on c.id = l.customer_id
   where l.token = p_token;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'at', m.at, 'kind', m.kind, 'total', m.total, 'paid', m.paid,
                                               'balance', m.balance, 'items', m.items) order by m.at desc, m.id desc), '[]'::jsonb),
         count(*)
    into v_moves, v_n
    from (select x.id, x.at, x.kind, x.total, x.paid, x.balance, x.items from public.ar_customer_moves x
           where x.customer_id = v_id
             and (p_before_at is null or (x.at, x.id) < (p_before_at, coalesce(p_before_id, 9223372036854775807)))
           order by x.at desc, x.id desc
           limit v_lim) m;

  if p_before_at is null then
    -- the first page: when he opened it (for the owner; not for the owner's own look), this month's sums, when the data came, his saved number
    if not coalesce(p_preview, false) then
      update public.ar_customer_links set last_seen_at = now(), seen_count = seen_count + 1
       where customer_id = v_id and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
    end if;
    select jsonb_build_object('bought', coalesce(sum(m.total) filter (where m.kind in ('sale', 'return')), 0),
                              'paid', coalesce(sum(m.paid), 0))
      into v_month
      from public.ar_customer_moves m where m.customer_id = v_id and m.at >= v_start;
    select s.at into v_data from public.ar_sync_log s order by s.id desc limit 1;
    select p.phone into v_phone from public.ar_customer_phones p where p.customer_id = v_id order by p.updated_at limit 1;
  end if;

  return jsonb_build_object('ok', true,
    'customer', jsonb_build_object('id', v_id, 'name', v_name, 'balance', v_balance),
    'stopped', exists (select 1 from public.ar_customer_stops s where s.customer_id = v_id),
    'month', v_month, 'data_at', v_data, 'phone', v_phone,
    'moves', v_moves, 'more', v_n = v_lim);
end $function$;

revoke all on function public.ar_customer_view(text, timestamp without time zone, bigint, integer, boolean) from public;
grant execute on function public.ar_customer_view(text, timestamp without time zone, bigint, integer, boolean) to anon, authenticated;
