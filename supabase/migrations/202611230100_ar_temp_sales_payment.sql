-- 202611230100_ar_temp_sales_payment (needs the owner's approval on the phone)
-- Owner 2026-11-22/23 (the robot's next job, chosen in the strategy talk: «ا، الدفعات»; the plan and mockup customer_payment_2026-11-22, his «بعد 12.3»):
-- «💵 دفعة» in a customer's statement records a customer's PAYMENT. It waits in ar_temp_sales like a bill (kind 'payment') and the robot enters it in PharmaFly the way he does
-- (110 payments in 30 days, all the same): a credit ticket with ONE line «أصناف متنوعة» (code 1) at 0, the customer, and the amount in «المدفوع بواسطة العميل».
-- Nothing else changes: the same table, policies, robot functions (ar_robot_sales_poll already returns kind), queue on the phone and «🤖 ادخلها دلوقتي».
--   a payment row: customer_id required, paid > 0 (the amount), total 0, its one item {c:1, n:'أصناف متنوعة', q:1, u:'pack', p:0}
-- Rollback: delete from public.ar_temp_sales where kind = 'payment'; then put back the old kind check (sale, return) and drop ar_temp_sales_payment_check.

alter table public.ar_temp_sales drop constraint if exists ar_temp_sales_kind_check;
alter table public.ar_temp_sales add constraint ar_temp_sales_kind_check check (kind in ('sale', 'return', 'payment'));
alter table public.ar_temp_sales drop constraint if exists ar_temp_sales_payment_check;
alter table public.ar_temp_sales add constraint ar_temp_sales_payment_check check (
  kind <> 'payment' or (customer_id is not null and paid is not null and paid > 0 and total = 0));
