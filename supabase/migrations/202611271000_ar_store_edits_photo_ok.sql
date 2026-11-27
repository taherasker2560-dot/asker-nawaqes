-- 202611271000_ar_store_edits_photo_ok (NOT applied yet: needs the owner's approval on the phone)
-- «صور الأصناف» in «مراجعة الفواتير» (owner 2026-11-27: «أي صنف ملوش صورة… أو صورته مش تمام أول ما يدخل مشتريات تطلب صورته» → «تطلبها في مراجعة المشتريات»):
-- an internet photo he looks at and keeps with «تمام» is never asked about again. Only the moment is kept; the table's grants and row rules (202611141600, 202611211500) already cover the column.
-- Before it is applied the page asks only for the items with no photo. Rollback: alter table public.ar_store_edits drop column photo_ok_at;
alter table public.ar_store_edits add column if not exists photo_ok_at timestamptz;
