-- READ ONLY. Run in Supabase SQL Editor before applying the migration.
-- Returns schema/policy metadata and aggregate counts, not customer/product rows.
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('incoming_batches','incoming_items','shortage_items')
ORDER BY table_name,ordinal_position;

SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('incoming_batches','incoming_items','shortage_items');

SELECT tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('incoming_batches','incoming_items','shortage_items');

SELECT tablename,indexname,indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('incoming_batches','incoming_items');

SELECT count(*) AS duplicate_dedupe_key_groups FROM (
  SELECT dedupe_key FROM public.incoming_batches WHERE dedupe_key IS NOT NULL
  GROUP BY dedupe_key HAVING count(*)>1
) d;

SELECT count(*) AS existing_batches_without_items
FROM public.incoming_batches b
WHERE NOT EXISTS (SELECT 1 FROM public.incoming_items i WHERE i.batch_id=b.id);
