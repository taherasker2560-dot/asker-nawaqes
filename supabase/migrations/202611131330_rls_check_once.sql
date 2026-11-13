-- The search stuck on «بحمّل كل أصناف السيستم… · بحمّل قوايم المخازن…» (owner 2026-11-13, his phone and the staff's).
-- Cause: since the staff accounts (202611130200_ar_staff.sql) every row-level rule calls ar_staff_can(...) and auth.uid()
-- once PER ROW (a SECURITY DEFINER function is never inlined). A 1000-line page of ar_supplier_items at offset 25,000 took
-- ~2 s; a few phones loading at once passed the 8 s statement limit and the server answered 500.
-- Fix (Supabase's own advice): wrap both in (select ...) so Postgres checks them ONCE per request (an InitPlan).
-- Same rules, same answers, nothing else changes. Tried inside a rolled-back transaction first: 2,080 ms → 43 ms.
do $$
declare p record; q text; c text; s text;
begin
  for p in
    select * from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ 'ar_staff_can\(|auth\.uid\(\)' or coalesce(with_check, '') ~ 'ar_staff_can\(|auth\.uid\(\)')
      and coalesce(qual, '') !~* 'select (auth\.uid|ar_staff_can)'
      and coalesce(with_check, '') !~* 'select (auth\.uid|ar_staff_can)'
  loop
    q := p.qual; c := p.with_check;
    if q is not null then
      q := regexp_replace(regexp_replace(q, 'ar_staff_can\(([^()]*)\)', '(select ar_staff_can(\1))', 'g'), 'auth\.uid\(\)', '(select auth.uid())', 'g');
    end if;
    if c is not null then
      c := regexp_replace(regexp_replace(c, 'ar_staff_can\(([^()]*)\)', '(select ar_staff_can(\1))', 'g'), 'auth\.uid\(\)', '(select auth.uid())', 'g');
    end if;
    s := format('alter policy %I on public.%I', p.policyname, p.tablename);
    if q is not null then s := s || ' using (' || q || ')'; end if;
    if c is not null then s := s || ' with check (' || c || ')'; end if;
    execute s;
  end loop;
end $$;
