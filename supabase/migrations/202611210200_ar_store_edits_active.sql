-- 202611210200_ar_store_edits_active (NOT applied yet: needs the owner's approval on the phone)
-- Owner 2026-11-20/21 («اي قايمة فيها اسم الصنف … ادوس عليها تفتح تعديل الاسم والصورة والمادة الفعالة»; mockup mockups\item_edit_sheet_2026-11-21.png, his «ا»):
-- the item sheet (ar/item-media.js, from the search card and «المخزون») gets the item's ACTIVE INGREDIENT, written in Arabic and/or English (the page's language first, the other one when only
-- that is written). Same table as the photo and the description (ar_store_edits: one row per fixed item, everyone reads it, only the owner / storeorders write it), so the customers' store
-- can show it too later. Two nullable text columns; the table's policies and grants cover them (select for anon, all for the owner and staff).
-- Rollback: alter table public.ar_store_edits drop column active_ar, drop column active_en;

alter table public.ar_store_edits add column if not exists active_ar text;
alter table public.ar_store_edits add column if not exists active_en text;
alter table public.ar_store_edits drop constraint if exists ar_store_edits_active_ar_check;
alter table public.ar_store_edits add constraint ar_store_edits_active_ar_check check (active_ar is null or char_length(active_ar) <= 200);
alter table public.ar_store_edits drop constraint if exists ar_store_edits_active_en_check;
alter table public.ar_store_edits add constraint ar_store_edits_active_en_check check (active_en is null or char_length(active_en) <= 200);
