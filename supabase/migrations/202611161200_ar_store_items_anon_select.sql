-- 202611161200_ar_store_items_anon_select (NOT applied yet: waits for the owner's OK, 2026-11-16)
-- ASKER: the store's catalog (store.html: search, an item's page, #item=<id> links, the customer's «حسابي» pictures) reads public.ar_store_items with the anon key,
-- and answers 401 «permission denied for table ar_store_items» (checked 2026-11-16: ar_store_edits has the anon grant, ar_store_items has none). The row rule
-- «Public read listed store items» (is_listed and not hidden) already limits what anon can see; only the table privilege is missing. SELECT only: no write.
-- Rollback: revoke select on public.ar_store_items from anon;
grant select on public.ar_store_items to anon;