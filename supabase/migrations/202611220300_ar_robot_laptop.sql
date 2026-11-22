-- 202611220300: the laptop side of the sales robot «مُدخِل البيعات» (owner 2026-11-22 ~04:00: «اكتبه دلوقت عشان بكرة لما اروح للصيدلية يكون واقف عالتجربه»;
-- the plan he agreed to with «نفس الخطة»: a script on the laptop types the waiting bills into PharmaFly, Claude only for new problems, and when it stops it asks him
-- in the system, «🤖 الروبوت محتاج رأيك», migration 202611220100).
-- The laptop has no owner session: it calls these with its sync key (public.ar_sync_keys, checked by ar_invoice_review_auth), like ar_invoice_review_*.
--   1) ar_robot_sales_poll: the waiting bills, the bills marked «اتدخلت» that still have no PharmaFly ticket number, or one bill by its number;
--      with the customer's limit and balance as the system knows them, and whether the OWNER approved going over the limit.
--   2) ar_robot_sale_mark: a bill the robot saved in PharmaFly becomes «اتدخلت»; later it gets its PharmaFly ticket number (found in the pharmacy's copy).
--   3) ar_robot_report_add / ar_robot_report_poll / ar_robot_report_done: the robot's question to the owner, his answer, and «done».
-- Nothing here can create a bill, change its items or money, or delete it. Rollback: drop the 5 functions.

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

-- waiting -> «اتدخلت» (now), with the ticket number when it is known; an «اتدخلت» bill with no number -> gets its number. Nothing else changes.
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
     set status = 'entered', entered_at = coalesce(entered_at, now()), entered_ticket = coalesce(p_ticket, entered_ticket), updated_at = now()
   where id = p_id
     and (status = 'pending' or (status = 'entered' and entered_ticket is null and p_ticket is not null));
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n = 1);
end $function$;
revoke all on function public.ar_robot_sale_mark(text, uuid, bigint) from public;
grant execute on function public.ar_robot_sale_mark(text, uuid, bigint) to anon, authenticated;

-- the robot asks: one open question per (job, ref): asking again about the same thing refreshes the open one (no second ring for the same stop)
create or replace function public.ar_robot_report_add(p_key text, p_job text, p_ref text, p_title text, p_details text default null, p_options jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint;
  v_new boolean := false;
begin
  perform public.ar_invoice_review_auth(p_key);
  perform pg_advisory_xact_lock(hashtext('public.ar_robot_report_add'));
  select id into v_id from public.ar_robot_reports
   where job = coalesce(p_job, 'sales') and ref_id is not distinct from p_ref and status = 'open'
   order by id desc limit 1;
  if v_id is null then
    insert into public.ar_robot_reports (job, ref_id, title, details, options)
    values (coalesce(p_job, 'sales'), p_ref, p_title, p_details, coalesce(p_options, '[]'::jsonb))
    returning id into v_id;
    v_new := true;
  else
    update public.ar_robot_reports set title = p_title, details = p_details, options = coalesce(p_options, '[]'::jsonb) where id = v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'created', v_new);
end $function$;
revoke all on function public.ar_robot_report_add(text, text, text, text, text, jsonb) from public;
grant execute on function public.ar_robot_report_add(text, text, text, text, text, jsonb) to anon, authenticated;

-- the questions not finished yet (open / answered), or the given ones
create or replace function public.ar_robot_report_poll(p_key text, p_ids bigint[] default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.ar_invoice_review_auth(p_key);
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'job', r.job, 'ref_id', r.ref_id, 'title', r.title, 'status', r.status,
                                        'answer_key', r.answer_key, 'answer_text', r.answer_text, 'answered_at', r.answered_at, 'created_at', r.created_at)
                     order by r.id)
      from public.ar_robot_reports r
     where (p_ids is null and r.status in ('open', 'answered')) or r.id = any (p_ids)), '[]'::jsonb));
end $function$;
revoke all on function public.ar_robot_report_poll(text, bigint[]) from public;
grant execute on function public.ar_robot_report_poll(text, bigint[]) to anon, authenticated;

-- the robot did what he said (answered -> done), or solved it alone (open -> done); finished questions older than 60 days go
create or replace function public.ar_robot_report_done(p_key text, p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_n int;
begin
  perform public.ar_invoice_review_auth(p_key);
  update public.ar_robot_reports set status = 'done', done_at = now() where id = p_id and status in ('open', 'answered');
  get diagnostics v_n = row_count;
  delete from public.ar_robot_reports where status = 'done' and done_at < now() - interval '60 days';
  return jsonb_build_object('ok', v_n = 1);
end $function$;
revoke all on function public.ar_robot_report_done(text, bigint) from public;
grant execute on function public.ar_robot_report_done(text, bigint) to anon, authenticated;
