-- 202611192000_ar_vendor_links (NOT applied yet: needs the owner's approval on the phone)
-- ASKER: the supplier's own statement page (owner 2026-11-19: «عايز ابعت لهم رابط للصفحة زيهم زي العملاء كده، يتثبت عندهم زي
-- ابلكيشن … الرابط فيه كشف حساب من يوم ما بدأت اشتغل معاهم، كل شركة تجيب لي تفصيل حساب بالفواتير، بالأصناف، بصور الأصناف،
-- بالمرتجعات، بالمدفوعات، بكل حاجة»; mockup mockups\supplier_link_2026-11-19.png, his «اه»).
--   ar_vendor_links : one secret per supplier card (64 hex). The link is supplier.html#v=<secret>. «رابط جديد» replaces it and the
--                     old one stops at once. Only the owner reads it (to send the same link again). Same pattern as ar_customer_links.
--   ar_vendor_link(vendor, new) : the owner gets the supplier's secret (made the first time, or a new one).
--   ar_vendor_view(secret, kind, from, to, before…, limit, look) : that supplier's own account and nothing else (anon may call it, the
--                     secret is the key): the name and the balance, the moves newest first (purchases with their lines: item name,
--                     picture edit, quantity, bonus, net cost of a pack, discount, expiry; returns; payments), the sums of the range
--                     with the opening and closing balance, and when the data came. It never returns our selling prices, our stock,
--                     another supplier or any note: a move row only has what the supplier's own paper has.
-- Rollback: drop function public.ar_vendor_view(text, text, date, date, timestamp, bigint, int, boolean);
--   drop function public.ar_vendor_link(bigint, boolean); drop table public.ar_vendor_links;

create table if not exists public.ar_vendor_links (
  vendor_id bigint primary key,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  seen_count int not null default 0 check (seen_count >= 0)
);
alter table public.ar_vendor_links enable row level security;
drop policy if exists "Owner reads ar vendor links" on public.ar_vendor_links;
create policy "Owner reads ar vendor links" on public.ar_vendor_links for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

-- the owner: the supplier's secret (the same one each time, or a new one when p_new; the old one stops working)
create or replace function public.ar_vendor_link(p_vendor bigint, p_new boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text;
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ar_vendors v where v.id = p_vendor) then
    return jsonb_build_object('ok', false, 'error', 'no_vendor');
  end if;
  select l.token into v_token from public.ar_vendor_links l where l.vendor_id = p_vendor;
  if v_token is null or coalesce(p_new, false) then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.ar_vendor_links (vendor_id, token) values (p_vendor, v_token)
    on conflict (vendor_id) do update set token = excluded.token, created_at = now(), last_seen_at = null, seen_count = 0;
  end if;
  return jsonb_build_object('ok', true, 'token', v_token);
end $function$;
revoke all on function public.ar_vendor_link(bigint, boolean) from public;
revoke all on function public.ar_vendor_link(bigint, boolean) from anon;
grant execute on function public.ar_vendor_link(bigint, boolean) to authenticated;

-- the supplier's page: his account and his statement (newest first, p_limit moves a call, older ones with p_before_*)
-- p_kind: purchase | return | payment | null = all; p_from / p_to: days (both included); p_look = the owner's own look (not counted as the supplier opening it)
create or replace function public.ar_vendor_view(p_token text, p_kind text default null, p_from date default null, p_to date default null,
  p_before_at timestamp default null, p_before_id bigint default null, p_limit int default 25, p_look boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint; v_name text; v_balance numeric; v_data timestamptz; v_moves jsonb; v_n int; v_sum jsonb; v_first timestamp;
  v_lim int := least(greatest(coalesce(p_limit, 25), 1), 60);
  v_kind text := case when p_kind in ('purchase', 'return', 'payment') then p_kind else null end;
  v_from timestamp := p_from::timestamp;
  v_to timestamp := case when p_to is null then null else (p_to + 1)::timestamp end;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'link'); end if;
  select v.id, v.name, v.balance, v.updated_at into v_id, v_name, v_balance, v_data
    from public.ar_vendor_links l join public.ar_vendors v on v.id = l.vendor_id
   where l.token = p_token;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'link'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'at', m.at, 'kind', m.kind, 'code', m.code, 'inv_date', m.inv_date,
                                               'amount', m.amount, 'total', m.total, 'balance', m.balance, 'lines', m.lines_out)
                            order by m.at desc, m.id desc), '[]'::jsonb),
         count(*)
    into v_moves, v_n
    from (select x.id, x.at, x.kind, x.code, x.inv_date, x.amount, x.total, x.balance,
                 case when x.kind = 'payment' or x.lines is null then null else (
                   select jsonb_agg(l.e order by l.o)
                     from (select t.o, (t.e || jsonb_build_object('n', si.name, 'an', si.arabic_name, 'img', ed.img, 'off', coalesce(ed.img_off, false))) as e
                             from jsonb_array_elements(x.lines) with ordinality as t(e, o)
                             left join public.ar_store_items si on si.id = (t.e->>'i')::bigint
                             left join public.ar_store_edits ed on ed.item_id = (t.e->>'i')::bigint) l) end as lines_out
            from public.ar_vendor_moves x
           where x.vendor_id = v_id
             and (v_kind is null or x.kind = v_kind)
             and (v_from is null or x.at >= v_from)
             and (v_to is null or x.at < v_to)
             and (p_before_at is null or (x.at, x.id) < (p_before_at, coalesce(p_before_id, 9223372036854775807)))
           order by x.at desc, x.id desc
           limit v_lim) m;

  if p_before_at is null then
    -- the first page: when the supplier opened it (for the owner), the sums of the range with the opening and closing balance, his first dealing
    if not coalesce(p_look, false) then
      update public.ar_vendor_links set last_seen_at = now(), seen_count = seen_count + 1
       where vendor_id = v_id and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
    end if;
    select jsonb_build_object(
             'purchases', coalesce(sum(m.amount) filter (where m.kind = 'purchase'), 0), 'purchases_n', count(*) filter (where m.kind = 'purchase'),
             'returns', coalesce(sum(m.amount) filter (where m.kind = 'return'), 0), 'returns_n', count(*) filter (where m.kind = 'return'),
             'payments', coalesce(sum(m.amount) filter (where m.kind = 'payment'), 0), 'payments_n', count(*) filter (where m.kind = 'payment'),
             'opening', (select o.balance - o.amount from public.ar_vendor_moves o where o.vendor_id = v_id
                           and (v_from is null or o.at >= v_from) and (v_to is null or o.at < v_to) order by o.at, o.id limit 1),
             'closing', (select c.balance from public.ar_vendor_moves c where c.vendor_id = v_id
                           and (v_from is null or c.at >= v_from) and (v_to is null or c.at < v_to) order by c.at desc, c.id desc limit 1))
      into v_sum
      from public.ar_vendor_moves m
     where m.vendor_id = v_id and (v_from is null or m.at >= v_from) and (v_to is null or m.at < v_to);
    select min(f.at) into v_first from public.ar_vendor_moves f where f.vendor_id = v_id and f.at >= timestamp '2005-01-01';
  end if;

  return jsonb_build_object('ok', true,
    'vendor', jsonb_build_object('id', v_id, 'name', v_name, 'balance', v_balance),
    'data_at', v_data, 'first_at', v_first, 'sum', v_sum,
    'moves', v_moves, 'more', v_n = v_lim);
end $function$;
revoke all on function public.ar_vendor_view(text, text, date, date, timestamp, bigint, int, boolean) from public;
grant execute on function public.ar_vendor_view(text, text, date, date, timestamp, bigint, int, boolean) to anon, authenticated;
