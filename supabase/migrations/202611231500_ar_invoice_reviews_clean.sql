-- 202611231500_ar_invoice_reviews_clean (needs the owner's approval on the phone)
-- Owner 2026-11-23: «عاوز تعملى اعداد يحذف الفواتير اللى اتدخلت بشكل تلقائى بدل ماهى مرصوصه كده جوه السيستم تفضل ١٢ ساعه بس و تانى يوم تتحذف».
-- A card of «🧾 مراجعة الفواتير» that is DONE (entered, or cancelled) leaves the system 12 hours after it was done: pg_cron, every hour, deletes it.
-- Kept: ready / held / approved / entering / failed (they still need someone), and a card whose new item's box photo is not on its item card yet
-- (ar_item_reads pending / reading / done: the page sets the photo when it is opened; «applied» = done with it). Its readings go with it (on delete cascade).
-- The laptop keeps its own copy of every card (Hub\purchases\out\review_<day>\*.json) and the entry sheets; PharmaFly has the invoices.
-- Rollback: select cron.unschedule(jobid) from cron.job where jobname = 'ar-invoice-reviews-clean'; drop function if exists public.ar_invoice_reviews_clean();

create or replace function public.ar_invoice_reviews_clean()
returns integer
language sql
security definer
set search_path to ''
as $function$
  with gone as (
    delete from public.ar_invoice_reviews v
    where v.status in ('entered', 'cancelled')
      and coalesce(v.done_at, v.approved_at, v.created_at) < now() - interval '12 hours'
      and not exists (select 1 from public.ar_item_reads r where r.review_id = v.id and r.status in ('pending', 'reading', 'done'))
    returning 1
  )
  select count(*)::integer from gone;
$function$;
revoke all on function public.ar_invoice_reviews_clean() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'ar-invoice-reviews-clean';
select cron.schedule('ar-invoice-reviews-clean', '7 * * * *', $job$ select public.ar_invoice_reviews_clean(); $job$);
