-- ASKER V10: private Storage bucket for the item list (catalog.json, codes + names only) used by read-supplier-image.
-- New bucket + one read policy; nothing existing is changed. Upload happens from the dashboard (owner).
-- Rollback: delete the object(s), then: drop policy "Owner reads private catalog" on storage.objects; delete from storage.buckets where id = 'asker-private';
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('asker-private', 'asker-private', false, 20971520, array['application/json'])
on conflict (id) do nothing;

create policy "Owner reads private catalog" on storage.objects
  for select to authenticated
  using (bucket_id = 'asker-private' and auth.uid() = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
