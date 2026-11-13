-- «الفكة» on the quick sale (owner 2026-11-13: «اوبشن لخصم مبلغ او اضافة مبلغ، الحاجات بتاعت الفكة»):
-- the amount taken off (negative) or added (positive) on the whole bill. total stays what is asked for, after it,
-- so the sum of the lines = total - adjust. Null = none. The row policies (owner, staff) are unchanged.
alter table public.ar_temp_sales add column if not exists adjust numeric;
comment on column public.ar_temp_sales.adjust is 'الفكة: minus = off the bill, plus = added; total is after it';
