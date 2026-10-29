-- ASKER bot: «امسح» in the page hides an incoming message (hidden_at) instead of deleting it, so the same message
-- shown again by WhatsApp (an unread chat's notification comes back) is still recognised and not read again.
-- The page deletes rows hidden more than 2 days ago.
-- Rollback: alter table public.ar_inbox drop column hidden_at;
alter table public.ar_inbox add column if not exists hidden_at timestamptz;
