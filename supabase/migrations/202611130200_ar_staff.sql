-- 202611130200_ar_staff (owner 2026-11-13: «يوزر جوه التطبيق … افتح له كذا وكذا … انا حر»; applied only after his «ا»)
-- ASKER: the pharmacy's staff. The owner adds a person by name and opens for him any section of the bot (one switch per
-- section); the person gets a personal link (function asker-staff) and stays signed in on his phone. The SERVER enforces it:
-- every table keeps its owner policy, and a staff policy is added that lets an ACTIVE staff member in only for the sections
-- the owner opened for him (public.ar_staff_can). Keys, settings and the staff list itself stay owner only.
--   perms (section keys = the bot's tabs): short, read, translate, drafts, docs, suppliers, stock, count, expiry, customers,
--   storeorders, tempsale; and extras: search (the search on top), return (مرتجع in the temp sale), credit (temp sale to a
--   credit customer: reads the customers' names and balances).
-- Rollback: drop the "Staff …" policies (see the loop below and the storage ones), drop function public.ar_staff_can(text[]),
--   drop function public.ar_is_staff(), alter table public.ar_temp_sales drop column created_by, drop table public.ar_staff.

create table if not exists public.ar_staff (
  user_id uuid primary key,
  name text not null check (char_length(name) between 1 and 60),
  email text not null unique,
  perms text[] not null default '{}',
  active boolean not null default true,
  link_hash text unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
alter table public.ar_staff enable row level security;
drop policy if exists "Owner ar staff" on public.ar_staff;
create policy "Owner ar staff" on public.ar_staff for all to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid) with check (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
-- a staff member reads his own row (his name and what is open for him), nothing else
drop policy if exists "Staff reads own row" on public.ar_staff;
create policy "Staff reads own row" on public.ar_staff for select to authenticated using (user_id = auth.uid());

-- true when the signed-in person is an active staff member with at least one of these sections open
create or replace function public.ar_staff_can(ps text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ar_staff s where s.user_id = auth.uid() and s.active and s.perms && ps);
$$;
create or replace function public.ar_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ar_staff s where s.user_id = auth.uid() and s.active);
$$;
revoke all on function public.ar_staff_can(text[]) from public;
revoke all on function public.ar_is_staff() from public;
grant execute on function public.ar_staff_can(text[]) to authenticated;
grant execute on function public.ar_is_staff() to authenticated;

-- one staff policy per table and kind of use: (table, 'select' or 'all', the sections that open it)
do $$
declare r record; pol text;
begin
  for r in select * from (values
    ('ar_shortages',        'all',    array['short']),
    ('ar_shortages',        'select', array['read','translate','drafts','search']),
    ('ar_shortage_names',   'all',    array['short','translate']),
    ('ar_names',            'all',    array['short','translate','read']),
    ('ar_names',            'select', array['search','stock','tempsale','drafts','suppliers','docs']),
    ('ar_orders',           'all',    array['short','drafts']),
    ('ar_orders',           'select', array['read','search']),
    ('ar_decisions',        'all',    array['read','short']),
    ('ar_answers',          'all',    array['read']),
    ('ar_answers',          'select', array['short','translate']),
    ('ar_fixes',            'all',    array['read']),
    ('ar_fixes',            'select', array['short','translate']),
    ('ar_ignored',          'all',    array['read']),
    ('ar_ignored',          'select', array['short','translate']),
    ('ar_inbox',            'all',    array['read']),
    ('ar_inbox_media',      'all',    array['read']),
    ('ar_suppliers',        'all',    array['read','suppliers']),
    ('ar_suppliers',        'select', array['drafts','short','search','docs']),
    ('ar_documents',        'all',    array['docs']),
    ('ar_doc_chats',        'select', array['docs','read']),
    ('ar_supplier_lists',   'all',    array['suppliers']),
    ('ar_supplier_lists',   'select', array['search','drafts','short']),
    ('ar_supplier_items',   'all',    array['suppliers']),
    ('ar_supplier_items',   'select', array['search','drafts','short']),
    ('ar_supplier_aliases', 'all',    array['suppliers']),
    ('ar_item_buys',        'select', array['suppliers','drafts','search','short']),
    ('ar_stock',            'select', array['stock','tempsale','search','count']),
    ('ar_store_items',      'all',    array['storeorders']),
    ('ar_store_items',      'select', array['tempsale','search','stock','count']),
    ('ar_store_orders',     'all',    array['storeorders']),
    ('ar_store_settings',   'all',    array['storeorders']),
    ('ar_store_arabic',     'all',    array['storeorders']),
    ('ar_store_generic',    'all',    array['storeorders']),
    ('ar_customers',        'select', array['customers','credit']),
    ('ar_customer_moves',   'select', array['customers']),
    ('ar_customer_phones',  'all',    array['customers'])
  ) as m(t, how, ps) loop
    if to_regclass('public.' || r.t) is null then continue; end if;
    pol := format('Staff %s %s', r.how, r.t);
    execute format('drop policy if exists %I on public.%I', pol, r.t);
    if r.how = 'all' then
      execute format('create policy %I on public.%I for all to authenticated using (public.ar_staff_can(%L::text[])) with check (public.ar_staff_can(%L::text[]))', pol, r.t, r.ps, r.ps);
    else
      execute format('create policy %I on public.%I for select to authenticated using (public.ar_staff_can(%L::text[]))', pol, r.t, r.ps);
    end if;
  end loop;
  -- the strip «حسب داتا الساعة …» on every screen: any active staff member reads when the data was sent
  if to_regclass('public.ar_sync_log') is not null then
    execute 'drop policy if exists "Staff select ar_sync_log" on public.ar_sync_log';
    execute 'create policy "Staff select ar_sync_log" on public.ar_sync_log for select to authenticated using (public.ar_is_staff())';
  end if;
end $$;

-- «البيع المؤقت»: who recorded the sale; a staff member adds his own sales (a return only with «return», a credit customer
-- only with «credit»), sees and re-sends only his own still-waiting sales; never marks «اتدخلت» nor cancels.
alter table public.ar_temp_sales add column if not exists created_by uuid default auth.uid();
drop policy if exists "Staff adds own temp sales" on public.ar_temp_sales;
create policy "Staff adds own temp sales" on public.ar_temp_sales for insert to authenticated
  with check (public.ar_staff_can(array['tempsale']) and created_by = auth.uid() and status = 'pending'
              and (kind = 'sale' or public.ar_staff_can(array['return']))
              and (customer_id is null or public.ar_staff_can(array['credit'])));
drop policy if exists "Staff reads own temp sales" on public.ar_temp_sales;
create policy "Staff reads own temp sales" on public.ar_temp_sales for select to authenticated
  using (created_by = auth.uid() and public.ar_staff_can(array['tempsale']));
drop policy if exists "Staff resends own temp sales" on public.ar_temp_sales;
create policy "Staff resends own temp sales" on public.ar_temp_sales for update to authenticated
  using (created_by = auth.uid() and status = 'pending' and public.ar_staff_can(array['tempsale']))
  with check (created_by = auth.uid() and status = 'pending' and public.ar_staff_can(array['tempsale'])
              and (kind = 'sale' or public.ar_staff_can(array['return']))
              and (customer_id is null or public.ar_staff_can(array['credit'])));

-- What a staff member does, under his name (owner 2026-11-13: «العمليات اللي بيعملها اي مستخدم تبان لي باسمه»): every
-- add / change / delete a staff member makes on a table he may write is written here by the database itself (a trigger),
-- with a few words of the row (its number, name, status, kind, total). The owner reads it; staff never see it.
create table if not exists public.ar_activity (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid not null,
  tbl text not null,
  op text not null check (op in ('insert', 'update', 'delete')),
  info jsonb
);
create index if not exists ar_activity_user_at on public.ar_activity (user_id, at desc);
alter table public.ar_activity enable row level security;
drop policy if exists "Owner reads ar activity" on public.ar_activity;
create policy "Owner reads ar activity" on public.ar_activity for select to authenticated
  using (auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
create or replace function public.ar_log_staff() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.ar_is_staff() then return null; end if;
  r := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.ar_activity (user_id, tbl, op, info) values (auth.uid(), tg_table_name, lower(tg_op), jsonb_strip_nulls(jsonb_build_object(
    'id', r -> 'id', 'no', r -> 'no',
    'name', coalesce(r -> 'arabic_name', r -> 'product_name', r -> 'customer_name', r -> 'name', r -> 'name_key', r -> 'supplier'),
    'status', r -> 'status', 'kind', r -> 'kind', 'total', r -> 'total',
    'n', case when jsonb_typeof(r -> 'items') = 'array' then to_jsonb(jsonb_array_length(r -> 'items')) end)));
  return null;
end $$;
revoke all on function public.ar_log_staff() from public;
do $$
declare t text;
begin
  foreach t in array array['ar_shortages','ar_shortage_names','ar_names','ar_orders','ar_decisions','ar_answers','ar_fixes','ar_ignored',
    'ar_inbox','ar_inbox_media','ar_suppliers','ar_documents','ar_supplier_lists','ar_supplier_items','ar_supplier_aliases',
    'ar_store_items','ar_store_orders','ar_store_settings','ar_store_arabic','ar_store_generic','ar_customer_phones','ar_temp_sales'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists ar_log_staff on public.%I', t);
    execute format('create trigger ar_log_staff after insert or update or delete on public.%I for each row execute function public.ar_log_staff()', t);
  end loop;
end $$;

-- files: inbox photos (الوارد), invoice photos (الفواتير), the order drafts, the expiry alerts (without customers), the
-- customers' alerts and statements, the site's prescriptions
drop policy if exists "Staff reads ar-inbox files" on storage.objects;
create policy "Staff reads ar-inbox files" on storage.objects for select to authenticated
  using (bucket_id = 'ar-inbox' and (public.ar_staff_can(array['read']) or (name like 'docs/%' and public.ar_staff_can(array['docs']))));
drop policy if exists "Staff uploads documents" on storage.objects;
create policy "Staff uploads documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'ar-inbox' and name like 'docs/%' and public.ar_staff_can(array['docs']));
drop policy if exists "Staff reads private files" on storage.objects;
create policy "Staff reads private files" on storage.objects for select to authenticated
  using (bucket_id = 'asker-private' and (
    (name = 'orders/drafts.json' and public.ar_staff_can(array['drafts'])) or
    (name = 'alerts/expiry.json' and public.ar_staff_can(array['expiry'])) or
    (name = 'alerts/alerts.json' and public.ar_staff_can(array['customers']))));
drop policy if exists "Staff reads statements" on storage.objects;
create policy "Staff reads statements" on storage.objects for select to authenticated
  using (bucket_id = 'ar-statements' and public.ar_staff_can(array['customers']));
drop policy if exists "Staff uploads statements" on storage.objects;
create policy "Staff uploads statements" on storage.objects for insert to authenticated
  with check (bucket_id = 'ar-statements' and name ~ '^s/[0-9]{4}-[0-9]{2}/[0-9a-f-]{20,40}\.pdf$' and public.ar_staff_can(array['customers']));
drop policy if exists "Staff reads store prescriptions" on storage.objects;
create policy "Staff reads store prescriptions" on storage.objects for select to authenticated
  using (bucket_id = 'ar-store-rx' and public.ar_staff_can(array['storeorders']));
