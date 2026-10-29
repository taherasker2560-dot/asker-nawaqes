-- ASKER bot: WhatsApp shows a chat's photo notification again, unchanged, when another notification comes and after
-- the phone speaks. Each note now keeps its chat (the title without WhatsApp's count) and its title and text (note),
-- so the same note again is known as a repeat (fresh = false): it does not count as the company sending photos now,
-- and «seen» stays silent for it. done: the note was handled (its photo was read, or «seen» was said once).
-- Rollback: alter table public.ar_inbox_media drop column chat, drop column note, drop column fresh, drop column done;
alter table public.ar_inbox_media
  add column if not exists chat text,
  add column if not exists note text,
  add column if not exists fresh boolean not null default true,
  add column if not exists done boolean not null default false;
