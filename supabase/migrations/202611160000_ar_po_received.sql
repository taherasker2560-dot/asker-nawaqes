-- 202611160000_ar_po_received (owner 2026-11-15: the bot's purchase order is where an order lives; when the supplier's invoice is entered
-- in PharmaFly, the order line of that item closes by itself: «ابدأ على Sonnet» on «المرحلة 1: الفاتورة تقفل سطر أمر الشراء»).
-- ASKER: ar_po_items (migration 202611150600) gets
--   status 'received' = the invoice arrived: open (or ordered) -> received, or cancelled;
--   received_qty = how many packs the invoice brought (packs + loose units / the pack size), received_at, inv_code (the full number,
--     e.g. 11/26/107075) and vendor (the supplier's short name) so the order line shows what closed it.
-- The laptop (Hub\orders\PO_CLOSE.ps1, after the hub's purchases are restored) does the update with the CLI; it never touches PharmaFly
-- and never removes anything from a shortages list. Nothing else changes: still owner only, still one open line per item.
-- Rollback: alter table public.ar_po_items drop column received_qty, drop column received_at, drop column inv_code, drop column vendor;
--   then put back the old status check (open, ordered, cancelled) after setting any 'received' row to 'cancelled'.
alter table public.ar_po_items drop constraint if exists ar_po_items_status_check;
alter table public.ar_po_items add constraint ar_po_items_status_check check (status in ('open', 'ordered', 'received', 'cancelled'));
alter table public.ar_po_items add column if not exists received_qty numeric(10, 2) check (received_qty is null or (received_qty > 0 and received_qty <= 100000));
alter table public.ar_po_items add column if not exists received_at timestamptz;
alter table public.ar_po_items add column if not exists inv_code text check (inv_code is null or char_length(inv_code) <= 40);
alter table public.ar_po_items add column if not exists vendor text check (vendor is null or char_length(vendor) <= 80);
create index if not exists ar_po_items_received on public.ar_po_items (received_at desc) where status = 'received';
