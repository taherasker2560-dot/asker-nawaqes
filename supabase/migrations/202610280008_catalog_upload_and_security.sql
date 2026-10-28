-- ASKER V10: (1) the owner can replace catalog.json from the page («تحديث قاعدة الأصناف»), only that one file in
-- the private bucket; (2) security advisor: public.rls_auto_enable() is an event-trigger function and must not be
-- callable through the API (event triggers do not need EXECUTE).
-- Rollback: drop policy "Owner uploads private catalog" on storage.objects; drop policy "Owner replaces private catalog" on storage.objects;
--           grant execute on function public.rls_auto_enable() to public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
create policy "Owner uploads private catalog" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'asker-private' and name = 'catalog.json' and auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
create policy "Owner replaces private catalog" on storage.objects
  for update to authenticated
  using (bucket_id = 'asker-private' and name = 'catalog.json' and auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check (bucket_id = 'asker-private' and name = 'catalog.json' and auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
