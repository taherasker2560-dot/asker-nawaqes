-- 202611211500: every active staff member can edit an item from the item sheet (photo, Arabic name, active ingredient, description).
-- Why (owner 2026-11-21: «انت ما فتحتش اوبشن التعديل بتاع الصور في كل الاماكن ليه للمستخدمين … افتح لهم عادي»): the sheet that opens from the small
-- photo in every list showed «✏️ تعديل الصنف» only to the owner and to staff with «الموقع» (storeorders); the Arabic name was owner-only in the database.
-- Now any ACTIVE staff member (public.ar_is_staff()) can: the photo / ingredient / description rows (ar_store_edits), the photo-of-the-box reading
-- requests (ar_item_reads), the Arabic name (ar_store_owner_set_arabic + its approved row in ar_names). Each of their writes to ar_store_edits and
-- ar_names is logged under their name (ar_log_staff, as before). Nothing else is opened: the other tables keep their sections.
-- Idempotent. Rollback: put the old checks back: ar_store_edits «Staff all» on array['storeorders'] (202611141600), the three ar_item_reads policies on
-- array['storeorders'] (202611210300), ar_store_owner_set_arabic owner-only, drop the three «Staff item editors … ar_names» policies.

-- the photo, ingredient and description fixes
drop policy if exists "Staff all ar_store_edits" on public.ar_store_edits;
create policy "Staff all ar_store_edits" on public.ar_store_edits for all to authenticated
  using ((select public.ar_is_staff())) with check ((select public.ar_is_staff()));

-- the active ingredient read from a photo of the box: ask, read, mark as used
drop policy if exists "Owner or storeorders staff read ar item reads" on public.ar_item_reads;
create policy "Owner or storeorders staff read ar item reads" on public.ar_item_reads for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid or (select public.ar_is_staff()));
drop policy if exists "Owner or storeorders staff ask ar item reads" on public.ar_item_reads;
create policy "Owner or storeorders staff ask ar item reads" on public.ar_item_reads for insert to authenticated
  with check (status = 'pending' and requested_by = (select auth.uid())
    and ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid or (select public.ar_is_staff())));
drop policy if exists "Owner or storeorders staff mark ar item reads" on public.ar_item_reads;
create policy "Owner or storeorders staff mark ar item reads" on public.ar_item_reads for update to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid or (select public.ar_is_staff()))
  with check (status in ('applied', 'cancelled')
    and ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid or (select public.ar_is_staff())));

-- the Arabic name: the same function the search card's pen uses, now for any active staff member too
create or replace function public.ar_store_owner_set_arabic(p_id bigint, p_arabic text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_ar text := nullif(left(btrim(regexp_replace(coalesce(p_arabic, ''), '\s+', ' ', 'g')), 250), '');
begin
  if auth.uid() is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid and not public.ar_is_staff() then raise exception 'owner or staff only' using errcode = '42501'; end if;
  if not exists (select 1 from public.ar_store_items where id = p_id) then return jsonb_build_object('ok', false, 'error', 'no_item'); end if;
  if v_ar is null then
    delete from public.ar_store_arabic where item_id = p_id and source = 'owner';
  else
    if char_length(v_ar) < 2 then return jsonb_build_object('ok', false, 'error', 'too_short'); end if;
    insert into public.ar_store_arabic (item_id, arabic_name, confident, source, updated_at) values (p_id, v_ar, true, 'owner', now())
      on conflict (item_id) do update set arabic_name = excluded.arabic_name, confident = true, source = 'owner', updated_at = now();
  end if;
  perform public.ar_store_fill_arabic();
  return jsonb_build_object('ok', true, 'arabic_name', (select arabic_name from public.ar_store_items where id = p_id));
end $function$;

-- the approved name row the sheet writes next to it (the shortages and the reading of the warehouses' messages use it): any active staff member
-- may add or correct a name, never delete one
drop policy if exists "Staff item editors select ar_names" on public.ar_names;
create policy "Staff item editors select ar_names" on public.ar_names for select to authenticated using ((select public.ar_is_staff()));
drop policy if exists "Staff item editors insert ar_names" on public.ar_names;
create policy "Staff item editors insert ar_names" on public.ar_names for insert to authenticated with check ((select public.ar_is_staff()));
drop policy if exists "Staff item editors update ar_names" on public.ar_names;
create policy "Staff item editors update ar_names" on public.ar_names for update to authenticated
  using ((select public.ar_is_staff())) with check ((select public.ar_is_staff()));
