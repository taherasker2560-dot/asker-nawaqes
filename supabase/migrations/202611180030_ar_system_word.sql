-- 202611180030_ar_system_word (NOT applied yet: needs the owner's approval on the phone)
-- Owner 2026-11-17 (late night): «احنا عملنا شغل كبير قوي، وعيب لما تقول عليه بوت … في كل حاجة بيقول فيها بوت يقول فيها السيستم».
-- The only database function whose text says «البوت» is ar_sync_news (the sentence the home says about the data: «البوت اتحدث …»). This replaces the word in its source and nothing else:
-- «بوت» as a whole word (with up to two prefixes such as و / ب / ل / ال / بال / لل) becomes «سيستم»; a drug name that merely contains the letters (كابوتن) is untouched. Run twice so two neighbouring
-- words are both caught. Idempotent (a second run finds nothing). The function's grants stay (create or replace).
-- Rollback: apply 202611131800 / 202611140130 / 202611152200 again in order (they define the function with the old word).
do $system$
declare
  v_def text;
  v_re constant text := '([^ء-ي]|^)((?:وال|بال|فال|كال|لل|ال|و|ب|ل|ف|ك){0,2})بوت([^ء-ي]|$)';
begin
  for v_def in
    select pg_get_functiondef(p.oid) from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prosrc ~ v_re
  loop
    v_def := regexp_replace(regexp_replace(v_def, v_re, '\1\2سيستم\3', 'g'), v_re, '\1\2سيستم\3', 'g');
    execute v_def;
  end loop;
end $system$;