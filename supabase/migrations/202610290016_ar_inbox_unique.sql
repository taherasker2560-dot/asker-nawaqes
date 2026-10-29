-- ASKER bot: the phone may now run several notifications at once (WhatsApp shows the notifications of unread chats
-- again whenever a message comes, and Tasker used to drop all but the first). Two runs can then send the same
-- photo or the same text at the same moment: the database keeps one, the function treats the second as a repeat.
-- Photo/file: one row per file content (the hash is the file name in file_path, whatever the day folder).
-- Text: one row per company, text and Cairo day.
-- Rollback: drop index public.ar_inbox_one_file; drop index public.ar_inbox_one_text;
create unique index if not exists ar_inbox_one_file on public.ar_inbox (split_part(file_path, '/', 2)) where file_path is not null;
create unique index if not exists ar_inbox_one_text on public.ar_inbox (supplier, md5(body_text), ((received_at at time zone 'Africa/Cairo')::date))
  where kind = 'text' and body_text is not null;
