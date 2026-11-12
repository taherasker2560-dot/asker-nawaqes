-- 202611130030_ar_temp_sales_kind (owner 2026-11-13 «ومعملتش حساب المرتجع»; applied only after his «ا»)
-- ASKER: a temp bill is a sale or a return (مرتجع), each a bill of its own as in PharmaFly (a return ticket there is
-- SalesReturn = 2). For a return, paid = what was given back to the customer. Older rows stay sales.
-- Rollback: alter table public.ar_temp_sales drop column kind;
alter table public.ar_temp_sales add column if not exists kind text not null default 'sale';
alter table public.ar_temp_sales drop constraint if exists ar_temp_sales_kind_check;
alter table public.ar_temp_sales add constraint ar_temp_sales_kind_check check (kind in ('sale', 'return'));
