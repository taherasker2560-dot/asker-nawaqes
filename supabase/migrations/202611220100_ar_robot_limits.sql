-- 202611220100: what the sales robot needs from the system (owner 2026-11-22, after its first sale / return in PharmaFly; mockup robot_sales_tools_2026-11-22, his «نفس الخطة»).
--
-- 1) ar_limit_requests: «اعمل لي اوبشن ان انا اعدل الحدود دي في السيستم من العملاء … وانا هعلمك تعديل الحد … عشان لو انا عدلت الحد اديلك الامر ان انت تخش تعدله».
--    The owner types a new limit on the customer's card; it waits («مستني يتنفذ في فارمافلاي») until the robot changes it in PharmaFly on his order. The customers' sync
--    from the laptop writes ar_customers.credit_limit: when PharmaFly's limit equals the new one, the request closes by itself. One waiting request per customer.
-- 2) ar_robot_reports: «لو هو الروبوت بتاعنا لو واقف في حاجه يبعت لي رساله عليه علشان اقول له يعمل فيها ايه … يديني زي تقرير كده».
--    The laptop (service role) writes a report when the robot stops (a customer over the limit with no approval, an item it cannot find, a message it does not know),
--    with the answers it understands; the owner reads it and answers through ar_robot_answer; the laptop reads the answer and marks it done.
-- 3) ar_temp_sales.limit_ok_*: «لو فاتورة عميل آجل متخط لحد أنا سجلتها على السيستم وسمحت بإن الحد يتخطى … الريموت هيسمح له … من غير ما يرجع، طالما إن أنا سمحت».
--    A bill over the limit that the OWNER saved after the warning carries his approval (who, when, by how much); the robot passes PharmaFly's «متجاوز» only then.
--    Only the owner's own approval is kept: anyone else's value is wiped by the trigger.
-- Owner-only tables (the uuid below is the owner, as in every migration). Rollback: drop the 2 tables, the 3 functions, the 2 triggers, and the 3 columns.

-- ---------- 1) the customer's limit ----------
create table if not exists public.ar_limit_requests (
  id bigint generated always as identity primary key,
  customer_id bigint not null,
  old_limit numeric(14, 2),
  new_limit numeric(14, 2) not null check (new_limit >= 0 and new_limit <= 100000000),
  status text not null default 'pending' check (status in ('pending', 'applied', 'cancelled')),
  requested_by uuid default auth.uid(),
  requested_at timestamptz not null default now(),
  applied_at timestamptz
);
create unique index if not exists ar_limit_requests_one_pending on public.ar_limit_requests (customer_id) where status = 'pending';
alter table public.ar_limit_requests enable row level security;
drop policy if exists "Owner ar limit requests" on public.ar_limit_requests;
create policy "Owner ar limit requests" on public.ar_limit_requests for all to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
grant select, insert, update on public.ar_limit_requests to authenticated;

-- PharmaFly now says the new limit (the laptop's customers sync): the waiting request is done
create or replace function public.ar_limit_requests_close() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.ar_limit_requests set status = 'applied', applied_at = now()
   where customer_id = new.id and status = 'pending' and new_limit = new.credit_limit;
  return new;
end $$;
drop trigger if exists ar_customers_limit_close on public.ar_customers;
create trigger ar_customers_limit_close after insert or update of credit_limit on public.ar_customers
  for each row execute function public.ar_limit_requests_close();

-- ---------- 2) the robot's reports ----------
create table if not exists public.ar_robot_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  job text not null default 'sales' check (char_length(job) between 1 and 40),
  ref_id text check (ref_id is null or char_length(ref_id) <= 80),
  title text not null check (char_length(title) between 1 and 200),
  details text check (details is null or char_length(details) <= 2000),
  -- the answers the robot understands: [{"key": "yes", "label": "كمّل وسجّلها"}, ...]
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 6),
  status text not null default 'open' check (status in ('open', 'answered', 'done')),
  answer_key text check (answer_key is null or char_length(answer_key) <= 40),
  answer_text text check (answer_text is null or char_length(answer_text) <= 1000),
  answered_by uuid,
  answered_at timestamptz,
  done_at timestamptz
);
create index if not exists ar_robot_reports_open on public.ar_robot_reports (status, created_at desc);
alter table public.ar_robot_reports enable row level security;
drop policy if exists "Owner reads robot reports" on public.ar_robot_reports;
create policy "Owner reads robot reports" on public.ar_robot_reports for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
grant select on public.ar_robot_reports to authenticated;

-- the owner answers an OPEN report: one of its answers, or his own words (or both); nothing else of the row changes
create or replace function public.ar_robot_answer(p_id bigint, p_key text, p_text text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.ar_robot_reports; v_key text := nullif(btrim(coalesce(p_key, '')), ''); v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if (select auth.uid()) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then return jsonb_build_object('ok', false, 'error', 'owner-only'); end if;
  if v_key is null and v_text is null then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  select * into v_row from public.ar_robot_reports where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'missing'); end if;
  if v_row.status <> 'open' then return jsonb_build_object('ok', false, 'error', 'state'); end if;
  if v_key is not null and not exists (select 1 from jsonb_array_elements(v_row.options) o where o->>'key' = v_key) then
    return jsonb_build_object('ok', false, 'error', 'option');
  end if;
  update public.ar_robot_reports set status = 'answered', answer_key = v_key, answer_text = left(v_text, 1000),
         answered_by = (select auth.uid()), answered_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.ar_robot_answer(bigint, text, text) from public, anon;
grant execute on function public.ar_robot_answer(bigint, text, text) to authenticated;

-- ---------- 3) the owner's approval of a bill over the limit ----------
alter table public.ar_temp_sales add column if not exists limit_ok_by uuid;
alter table public.ar_temp_sales add column if not exists limit_ok_at timestamptz;
alter table public.ar_temp_sales add column if not exists limit_over numeric(12, 2) check (limit_over is null or limit_over >= 0);

-- the page sends only «approved at» and «by how much»; WHO approved is written here, and only the owner's approval stays
create or replace function public.ar_temp_sales_limit_ok() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.limit_ok_at is not distinct from old.limit_ok_at and new.limit_ok_by is not distinct from old.limit_ok_by then
    return new;   -- the approval was not touched (the laptop marking the bill «اتدخلت», a resend …)
  end if;
  if new.limit_ok_at is not null and (select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then
    new.limit_ok_by := (select auth.uid());
  else
    new.limit_ok_by := null; new.limit_ok_at := null; new.limit_over := null;
  end if;
  return new;
end $$;
drop trigger if exists ar_temp_sales_limit_ok on public.ar_temp_sales;
create trigger ar_temp_sales_limit_ok before insert or update on public.ar_temp_sales
  for each row execute function public.ar_temp_sales_limit_ok();
