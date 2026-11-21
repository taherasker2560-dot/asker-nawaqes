-- 202611211400: a staff member with «البيع المؤقت» (tempsale) can read the count's file of expiry batches
-- (asker-private/count/stock.json, written by Hub\count\BUILD_COUNT.ps1 every update).
-- Why (owner 2026-11-21, «ا»): the quick sale now asks WHICH expiry batch is sold when an item goes in, from that file's batches
-- (ar/tempsale.js). Until now only the owner and staff with «جرد المخزون» (count) could read it, so a staff member who only sells would
-- see «الصلاحية مش متاحة دلوقتي» on every line. Nothing else changes: the other private files keep their sections.
-- Idempotent (drop + create). Rollback: run the policy block of 202611130400_ar_count.sql again (count/stock.json for array['count'] only).
drop policy if exists "Staff reads private files" on storage.objects;
create policy "Staff reads private files" on storage.objects for select to authenticated
  using (bucket_id = 'asker-private' and (
    (name = 'orders/drafts.json' and public.ar_staff_can(array['drafts'])) or
    (name = 'alerts/expiry.json' and public.ar_staff_can(array['expiry'])) or
    (name = 'alerts/alerts.json' and public.ar_staff_can(array['customers'])) or
    (name = 'count/stock.json' and public.ar_staff_can(array['count', 'tempsale']))));
