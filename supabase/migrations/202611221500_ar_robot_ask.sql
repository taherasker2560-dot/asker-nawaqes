-- 202611221500: «🤖 ادخلها دلوقتي» (owner 2026-11-22: «انت ما عملتش ليه زرار لما ادوس عليه المدخل ينفذ الامر؟»; his «طيب لو كده ماشي، ضيف الزرار» = yes to the plan).
-- A button on a waiting bill (and one for all of them) makes the sales robot on the laptop enter it NOW, instead of waiting for its quiet moment
-- (it runs by itself every minute while the laptop is idle; the button also works while somebody is on the laptop).
--   1) ar_temp_sales.robot_ask_at / robot_ask_by: the page writes «asked at»; WHO asked is written here by a trigger and only the OWNER's ask stays
--      (like limit_ok_* in 202611220100), so a staff member cannot make the robot take the laptop's keyboard.
--   2) ar_temp_sales.robot_state / robot_state_at: what the robot is doing with the bill, shown to him on the bill: 'typing' or 'stopped'.
--   3) ar_robot_sales_poll now also returns `ask` (his signed ask) and `ask_at`; ar_robot_sale_mark clears the ask and the state when the bill is saved;
--      ar_robot_sale_state (new, the sync key like the others) sets 'typing' / 'stopped' / null ('stopped' also clears the ask, so the button can be pressed again).
-- Nothing here creates a bill or changes its items or money. Rollback: drop ar_robot_sale_state, put back ar_robot_sales_poll and ar_robot_sale_mark from 202611220300, drop the trigger and the 4 columns.

alter table public.ar_temp_sales add column if not exists robot_ask_at timestamptz;
alter table public.ar_temp_sales add column if not exists robot_ask_by uuid;
alter table public.ar_temp_sales add column if not exists robot_state text;
alter table public.ar_temp_sales add column if not exists robot_state_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ar_temp_sales_robot_state_chk') then
    alter table public.ar_temp_sales add constraint ar_temp_sales_robot_state_chk check (robot_state is null or robot_state in ('typing', 'stopped'));
  end if;
end $$;

-- the page sends only «asked at»; WHO asked is written here, and only the owner's ask stays
create or replace function public.ar_temp_sales_robot_ask() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.robot_ask_at is not distinct from old.robot_ask_at and new.robot_ask_by is not distinct from old.robot_ask_by then
    return new;   -- the ask was not touched (the page saving the bill, a resend, the robot marking it …)
  end if;
  if new.robot_ask_at is not null and (select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    new.robot_ask_by := (select auth.uid());
  else
    new.robot_ask_by := null; new.robot_ask_at := null;
  end if;
  return new;
end $$;
drop trigger if exists ar_temp_sales_robot_ask on public.ar_temp_sales;
create trigger ar_temp_sales_robot_ask before insert or update on public.ar_temp_sales
  for each row execute function public.ar_temp_sales_robot_ask();

-- the waiting bills for the robot, now with the owner's ask (signed by the trigger above)
create or replace function public.ar_robot_sales_poll(p_key text, p_what text default 'pending', p_no bigint default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.ar_invoice_review_auth(p_key);
  if p_what not in ('pending', 'unticketed', 'no') then raise exception 'bad what'; end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'no', s.no, 'sold_at', s.sold_at, 'kind', s.kind, 'customer_id', s.customer_id, 'customer_name', s.customer_name,
             'items', s.items, 'total', s.total, 'paid', s.paid, 'adjust', s.adjust, 'note', s.note, 'status', s.status,
             'entered_ticket', s.entered_ticket, 'entered_at', s.entered_at,
             'by_owner', s.created_by = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid,
             -- his approval counts only when the server signed it as his (trigger ar_temp_sales_limit_ok)
             'limit_ok', s.limit_ok_at is not null and s.limit_ok_by = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid,
             'limit_over', s.limit_over,
             -- his «ادخلها دلوقتي»: counts only when the server signed it as his (trigger ar_temp_sales_robot_ask)
             'ask', s.robot_ask_at is not null and s.robot_ask_by = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid,
             'ask_at', case when s.robot_ask_by = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then s.robot_ask_at end,
             'credit_limit', c.credit_limit, 'balance', c.balance)
           order by s.no)
      from public.ar_temp_sales s
      left join public.ar_customers c on c.id = s.customer_id
     where (p_what = 'pending' and s.status = 'pending')
        or (p_what = 'unticketed' and s.status = 'entered' and s.entered_ticket is null and s.entered_at > now() - interval '3 days')
        or (p_what = 'no' and s.no = p_no)), '[]'::jsonb));
end $function$;
revoke all on function public.ar_robot_sales_poll(text, text, bigint) from public;
grant execute on function public.ar_robot_sales_poll(text, text, bigint) to anon, authenticated;

-- waiting -> «اتدخلت» (now); the ask and the state are cleared with it. Nothing else changes.
create or replace function public.ar_robot_sale_mark(p_key text, p_id uuid, p_ticket bigint default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_n int;
begin
  perform public.ar_invoice_review_auth(p_key);
  if p_ticket is not null and p_ticket <= 0 then raise exception 'bad ticket'; end if;
  update public.ar_temp_sales
     set status = 'entered', entered_at = coalesce(entered_at, now()), entered_ticket = coalesce(p_ticket, entered_ticket), updated_at = now(),
         robot_ask_at = null, robot_ask_by = null, robot_state = null, robot_state_at = null
   where id = p_id
     and (status = 'pending' or (status = 'entered' and entered_ticket is null and p_ticket is not null));
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n = 1);
end $function$;
revoke all on function public.ar_robot_sale_mark(text, uuid, bigint) from public;
grant execute on function public.ar_robot_sale_mark(text, uuid, bigint) to anon, authenticated;

-- what the robot is doing with a waiting bill: 'typing' (it is typing it in PharmaFly now), 'stopped' (it stopped; its question is in «الروبوت محتاج رأيك»;
-- the ask is cleared so the button can be pressed again) or null (nothing)
create or replace function public.ar_robot_sale_state(p_key text, p_id uuid, p_state text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_n int;
begin
  perform public.ar_invoice_review_auth(p_key);
  if p_state is not null and p_state not in ('typing', 'stopped') then raise exception 'bad state'; end if;
  update public.ar_temp_sales
     set robot_state = p_state, robot_state_at = case when p_state is null then null else now() end,
         robot_ask_at = case when p_state = 'stopped' then null else robot_ask_at end,
         robot_ask_by = case when p_state = 'stopped' then null else robot_ask_by end
   where id = p_id and status = 'pending';
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n = 1);
end $function$;
revoke all on function public.ar_robot_sale_state(text, uuid, text) from public;
grant execute on function public.ar_robot_sale_state(text, uuid, text) to anon, authenticated;
