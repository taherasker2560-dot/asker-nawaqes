-- ASKER trial bot becomes fully independent of V10 (owner's choice, 28 Oct 2026): one-time copy of what the owner
-- taught V10 (confirmed names, «مش ده», reading fixes) into the trial bot's own tables. After this the function no
-- longer reads V10 tables. V10 tables are only read here. Existing trial answers win (on conflict do nothing).
-- Copied rows carry created_at = 2026-10-28 00:00:13+00. Rollback: delete those rows from ar_answers and ar_fixes
-- (where created_at = '2026-10-28 00:00:13+00') and redeploy arabic-shortages ar5.
insert into public.ar_answers (alias_key, read_text, name_key, decision, created_by, created_at)
select a.alias_key, left(a.alias_text, 250), left(upper(btrim(regexp_replace(a.target_name, '\s+', ' ', 'g'))), 250), 'yes',
       'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid, '2026-10-28 00:00:13+00'
from public.name_aliases a
where char_length(a.alias_key) between 2 and 250 and char_length(btrim(a.alias_text)) >= 2
on conflict (alias_key, name_key) do nothing;
insert into public.ar_answers (alias_key, read_text, name_key, decision, created_by, created_at)
select r.alias_key, left(r.alias_text, 250), left(upper(btrim(regexp_replace(r.target_name, '\s+', ' ', 'g'))), 250), 'no',
       'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid, '2026-10-28 00:00:13+00'
from public.name_rejections r
where char_length(r.alias_key) between 2 and 250 and char_length(btrim(r.alias_text)) >= 2
on conflict (alias_key, name_key) do nothing;
insert into public.ar_fixes (read_key, read_text, corrected_text, created_by, created_at)
select distinct on (f.read_key) f.read_key, left(f.read_text, 250), left(f.corrected_text, 250),
       'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid, '2026-10-28 00:00:13+00'
from public.reading_fixes f
where char_length(f.read_key) between 2 and 250 and char_length(f.read_text) >= 2 and char_length(f.corrected_text) >= 2
order by f.read_key, f.created_at desc
on conflict (read_key) do nothing;
