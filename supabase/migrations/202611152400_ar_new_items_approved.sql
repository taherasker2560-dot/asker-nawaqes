-- 202611152400_ar_new_items_approved (NOT applied yet: the owner said, 2026-11-15, about «أصناف جديدة»: «هكتب لك الاسم بالظبط والسعر بتاعه،
-- ولما أدوس موافق ينضاف لأمر الشراء، ولما يجي لك في الفاتورة أنت معاك الاسم والسعر، وتعرف تقسمه بقى إذا كان حبوب إذا كان كريم»; «فتحت لك الموبايل»).
-- ASKER: ar_new_items (migration 202611152100) gets
--   status 'approved' = «موافق»: he approved it, it is in the purchase order (the orders page lists it with the others and copies a message);
--     new -> approved -> ordered -> arrived, or cancelled;
--   qty     = how many he wants (default 1);
--   form    = what it is (حبوب / كبسول / شراب / كريم / …), worked out from the name when he saves it, so the invoice knows how to enter it;
--   approved_at, and the PharmaFly item id (item_id) once the invoice made it a real item (the laptop sets it when it recognises the item
--     by its exact name on an entered invoice; it also marks the row 'arrived').
-- Rollback: alter table public.ar_new_items drop column qty, drop column form, drop column approved_at, drop column item_id;
--   then put back the old status check (new, ordered, arrived, cancelled).
alter table public.ar_new_items drop constraint if exists ar_new_items_status_check;
alter table public.ar_new_items add constraint ar_new_items_status_check check (status in ('new', 'approved', 'ordered', 'arrived', 'cancelled'));
alter table public.ar_new_items add column if not exists qty int check (qty is null or (qty >= 1 and qty <= 100000));
alter table public.ar_new_items add column if not exists form text check (form is null or char_length(form) <= 30);
alter table public.ar_new_items add column if not exists approved_at timestamptz;
alter table public.ar_new_items add column if not exists item_id bigint check (item_id is null or item_id > 0);
