-- ASKER V10: names the owner marked «مش عندنا / مش مهم» stay out of the review list and the report.
-- New column only. Rollback: alter table public.name_review_queue drop column ignored;
alter table public.name_review_queue add column if not exists ignored boolean not null default false;
