-- Apply before publishing the updated V10 page. No existing rows are changed.
BEGIN;

-- Fail closed rather than expose a new RPC over tables without row security.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('incoming_batches', 'incoming_items', 'shortage_items')
      AND NOT c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Enable and review existing RLS policies before installing atomic incoming';
  END IF;
END;
$$;

-- Existing duplicates make this migration fail; never delete or merge records.
CREATE UNIQUE INDEX IF NOT EXISTS incoming_batches_atomic_dedupe_uidx
  ON public.incoming_batches (dedupe_key);

CREATE OR REPLACE FUNCTION public.save_incoming_batch_atomic(
  p_received_on date,
  p_supplier text,
  p_source_text text,
  p_dedupe_key text,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_batch_id public.incoming_batches.id%TYPE;
  v_saved jsonb;
  v_count bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_received_on IS NULL OR p_source_text IS NULL OR btrim(p_source_text) = ''
     OR p_dedupe_key IS NULL OR p_dedupe_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid incoming batch' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Incoming items must be an array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Incoming items cannot be empty' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS x(item)
    WHERE jsonb_typeof(item) <> 'object'
       OR jsonb_typeof(item->'product_name') IS DISTINCT FROM 'string'
       OR btrim(item->>'product_name') = ''
       OR jsonb_typeof(item->'quantity') IS DISTINCT FROM 'number'
       OR (item->>'quantity')::numeric <= 0
       OR coalesce(item->>'match_status', '') NOT IN ('matched', 'possible', 'unmatched')
       OR ((item->>'match_status' IN ('matched', 'possible'))
           <> (coalesce(item->>'shortage_item_id', '') <> ''))
  ) THEN
    RAISE EXCEPTION 'Invalid incoming item' USING ERRCODE = '22023';
  END IF;

  -- Reject inaccessible, inactive or deleted match targets under the caller's RLS.
  -- Record conversion follows actual column types, including UUID/bigint IDs.
  SELECT count(*) INTO v_count
  FROM jsonb_populate_recordset(NULL::public.incoming_items, p_items) AS i
  WHERE i.shortage_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shortage_items AS s
    WHERE s.id = i.shortage_item_id AND s.is_active = true
  );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'A match target is unavailable; refresh shortages and retry'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.incoming_batches (received_on, supplier, source_text, dedupe_key)
  VALUES (p_received_on, nullif(btrim(p_supplier), ''), p_source_text, p_dedupe_key)
  RETURNING id INTO v_batch_id;

  -- All fields not listed here retain their database defaults (e.g. owner/id).
  WITH inserted AS (
    INSERT INTO public.incoming_items
      (batch_id, product_name, quantity, shortage_item_id, match_status, notes)
    SELECT v_batch_id, i.product_name, i.quantity, i.shortage_item_id, i.match_status, i.notes
    FROM jsonb_populate_recordset(NULL::public.incoming_items, p_items) AS i
    RETURNING id, product_name, quantity, shortage_item_id, match_status, notes
  )
  SELECT coalesce(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb), count(*)
    INTO v_saved, v_count FROM inserted;

  IF v_count <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'Incoming item count mismatch';
  END IF;
  RETURN jsonb_build_object('batch_id', v_batch_id, 'items', v_saved);
  -- No exception handler: any failure rolls back the batch AND all its items.
END;
$$;

REVOKE ALL ON FUNCTION public.save_incoming_batch_atomic(date,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_incoming_batch_atomic(date,text,text,text,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_incoming_batch_atomic(date,text,text,text,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
