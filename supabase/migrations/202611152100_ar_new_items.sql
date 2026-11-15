-- 202611152100_ar_new_items (NOT applied yet: the owner asked for it 2026-11-15 and said «موافق على كل حاجة»).
-- ASKER: «أصناف جديدة» in the shortages tab (owner 2026-11-15: «عايزك تعمل لي مكان في النواقص للأصناف الجديدة. هجيب الاسم بالانجليزي
-- والسعر بشكل تقريبي وهحطهم لك في الخانه دي وتحفظهم عشان تدخلهم معانا في النواقص ترجمه … عشان لما يجي لك في خطوه ثاني يوم يبقى
-- انت معاك الاسم الانجليزي هتدخله اوتوماتيك في الشركه»).
--   ar_new_items: a product that is NOT in PharmaFly yet, typed by the owner: the English name (name_key = the same key as
--   ar_names / ar_shortages: upper-case, single spaces, max 250), an approximate price (optional), a note (optional), and where it
--   stands: new -> ordered -> arrived, or cancelled. The arabic-shortages function translates the names of the new / ordered
--   ones with the shortages (into ar_names, status 'suggested', the same table the shortages use), so the Arabic name is kept per
--   English name. When the invoice comes, the English name here is what lets the item be entered at the company.
--   Not in ar_shortages on purpose: the laptop's shortage sync replaces that list from PharmaFly and would switch a new item off.
--   Read / written by the OWNER only (his own sign-in); nothing here writes to PharmaFly.
-- Rollback: drop table public.ar_new_items;
create table if not exists public.ar_new_items (
  id bigint generated always as identity primary key,
  name_key text not null unique check (char_length(name_key) between 2 and 250),
  name_en text not null check (char_length(btrim(name_en)) between 2 and 250),
  price numeric(10, 2) check (price is null or (price >= 0 and price < 1000000)),
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'new' check (status in ('new', 'ordered', 'arrived', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  arrived_at timestamptz
);
create index if not exists ar_new_items_status on public.ar_new_items (status, created_at desc);
alter table public.ar_new_items enable row level security;
drop policy if exists "Owner reads ar new items" on public.ar_new_items;
create policy "Owner reads ar new items" on public.ar_new_items for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Owner adds ar new items" on public.ar_new_items;
create policy "Owner adds ar new items" on public.ar_new_items for insert to authenticated
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Owner changes ar new items" on public.ar_new_items;
create policy "Owner changes ar new items" on public.ar_new_items for update to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid)
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
