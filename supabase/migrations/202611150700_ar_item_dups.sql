-- 202611150700_ar_item_dups (owner 2026-11-15: «الصنف اللي انت معلمهولي ان في منه اسم تاني … لو عايز اتعامل معاه … الحل فين؟»; the
-- mockup with two buttons approved «أيوه، ابدأ»; applied only after his OK on his phone)
-- ASKER «⚠️ ممكن نفس الصنف»: the laptop points out a short item whose name repeats on a card with stock. His answer is kept here:
--   'same'      = the short card is a duplicate: it leaves the bags and the purchase order and waits in «مكررات تتشال من نواقص
--                 فارمافلاي» until he takes it out of PharmaFly's shortages himself (status 'done' when the copy shows it gone);
--   'different' = not the same item: the warning stays away for this pair and the item is ordered normally.
-- 'cancelled' = undone. Nothing here writes to PharmaFly (only he removes an item from a shortages list). Owner only.
-- Rollback: drop table public.ar_item_dups;

create table if not exists public.ar_item_dups (
  id bigint generated always as identity primary key,
  item_id bigint not null check (item_id > 0),
  item_name text check (item_name is null or char_length(item_name) <= 200),
  other_id bigint not null check (other_id > 0),
  other_name text check (other_name is null or char_length(other_name) <= 200),
  bag text check (bag is null or bag ~ '^(pv|gs|[0-9]{1,12})$'),
  decision text not null check (decision in ('same', 'different')),
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz,
  check (other_id <> item_id)
);
-- one standing answer per short card
create unique index if not exists ar_item_dups_one_open on public.ar_item_dups (item_id) where status = 'open';
create index if not exists ar_item_dups_recent on public.ar_item_dups (created_at desc);

alter table public.ar_item_dups enable row level security;
drop policy if exists "Owner all ar item dups" on public.ar_item_dups;
create policy "Owner all ar item dups" on public.ar_item_dups for all to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
grant select, insert, update on public.ar_item_dups to authenticated;
