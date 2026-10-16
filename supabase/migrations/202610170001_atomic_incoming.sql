-- Apply in Supabase SQL Editor before deploying the V10 HTML change.
-- Existing table permissions and RLS still apply: never use SECURITY DEFINER.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS incoming_batches_dedupe_key_uidx
  ON public.incoming_batches (dedupe_key);

CREATE OR REPLACE FUNCTION public.save_incoming_batch_atomic(
  p_received_on date,
  p_supplier text,
  p_source_text text,
  p_dedupe_key text,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_batch_id public.incoming_batches.id%TYPE;
  v_saved jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_received_on IS NULL OR p_dedupe_key IS NULL
     OR p_dedupe_key !~ '^[0-9a-f]{64}$'
     OR p_source_text IS NULL OR btrim(p_source_text) = '' THEN
    RAISE EXCEPTION 'Invalid batch data' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Items must be an array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items must not be empty' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS x(item)
    WHERE jsonb_typeof(item) <> 'object'
       OR coalesce(btrim(item->>'product_name'), '') = ''
       OR jsonb_typeof(item->'quantity') IS DISTINCT FROM 'number'
       OR (item->>'quantity')::numeric <= 0
       OR coalesce(item->>'match_status', '') NOT IN ('matched', 'possible', 'unmatched')
       OR ((item->>'match_status' IN ('matched', 'possible'))
           IS DISTINCT FROM (nullif(item->>'shortage_item_id', '') IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'Invalid incoming item' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.incoming_batches (received_on, supplier, source_text, dedupe_key)
  VALUES (p_received_on, p_supplier, p_source_text, p_dedupe_key)
  RETURNING id INTO v_batch_id;

  WITH inserted AS (
    INSERT INTO public.incoming_items
      (batch_id, product_name, quantity, shortage_item_id, match_status, notes)
    SELECT v_batch_id, i.product_name, i.quantity, i.shortage_item_id, i.match_status, i.notes
    FROM jsonb_populate_recordset(NULL::public.incoming_items, p_items) AS i
    RETURNING id, product_name, quantity, shortage_item_id, match_status, notes
  )
  SELECT jsonb_agg(to_jsonb(inserted)) INTO v_saved FROM inserted;

  IF jsonb_array_length(v_saved) IS DISTINCT FROM jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'Incomplete incoming items';
  END IF;
  RETURN jsonb_build_object('batch_id', v_batch_id, 'items', v_saved);
  -- Any error rolls back both inserts, including constraints and RLS failures.
END;
$$;
REVOKE ALL ON FUNCTION public.save_incoming_batch_atomic(date,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_incoming_batch_atomic(date,text,text,text,jsonb) TO authenticated;
COMMIT;
