-- 202611210100_ar_item_cancel (NOT applied yet: needs the owner's approval on the phone)
-- Owner 2026-11-20/21 («الاخفاء هيبقا عالملغى أو اللي جنب اسمه ملغى أو اللي ليه اسم تاني بسعر أعلى … و الالغاء هيتعمل برضه على الاصناف اللي ما عليهاش حركه من سنتين و نازل
-- و يرجع بشكل اوتوماتيك لو دخل مشتريات بعدين»; his «أ» = the whole rule; mockups\item_hide_cancelled_2026-11-20.png): the search leaves «cancelled» items out of «الكل» and the other
-- buttons and shows them only under a new button «الملغى» (owner), where «ارجعه» puts one back for good.
-- What is cancelled is worked out by the LAPTOP (Store\SYNC_ITEM_CANCEL.ps1, read only on the restored copy) and sent as three compact lists:
--   word = a name with «ملغى» / «لاغى» in it · dup = the same name on several cards with different prices (the dearest card stays, the others are cancelled) ·
--   idle = no sale and no purchase for two years (and the card is not new).
-- Each list is ONE row of text, «id:detail,id:detail,…»: word «id:YYYYMMDD» (the day the system first saw it), dup «id:YYYYMMDD:price of the card that stays», idle «id:YYYYMM» (the last month
-- anything moved). The page decides what is really hidden (an item with stock or on the shortage list stays with a mark; an idle item a warehouse lists today is not cancelled at all, owner 2026-11-21; a purchase after the day it was first seen,
-- or after its last month, brings it back by itself), so the list never has to be cleaned by hand.
-- ar_item_cancel_seen remembers the first day an item was seen as word/dup (the laptop's upload keeps it, nobody reads it); ar_item_cancel_restored = the owner's «ارجعه» (permanent).
-- Read: the owner and staff with «search». Write: the owner (restored) / the laptop through ar_item_cancel_sync with its sync key.
-- Rollback: drop function public.ar_item_cancel_sync(text, text, text, text); drop table public.ar_item_cancel_restored, public.ar_item_cancel_seen, public.ar_item_cancel_sets;

create table if not exists public.ar_item_cancel_sets (
  kind text primary key check (kind in ('word', 'dup', 'idle')),
  ids text not null default '' check (ids ~ '^[0-9:,.]*$'),
  n int not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.ar_item_cancel_seen (
  item_id int primary key,
  kind text not null check (kind in ('word', 'dup')),
  first_at date not null default current_date
);
create table if not exists public.ar_item_cancel_restored (
  item_id int primary key,
  at timestamptz not null default now()
);

alter table public.ar_item_cancel_sets enable row level security;
alter table public.ar_item_cancel_seen enable row level security;
alter table public.ar_item_cancel_restored enable row level security;
revoke all on public.ar_item_cancel_sets from anon, authenticated;
revoke all on public.ar_item_cancel_seen from anon, authenticated;
revoke all on public.ar_item_cancel_restored from anon, authenticated;
grant select on public.ar_item_cancel_sets to authenticated;
grant select, insert, delete on public.ar_item_cancel_restored to authenticated;

drop policy if exists "Owner or search staff read ar item cancel sets" on public.ar_item_cancel_sets;
create policy "Owner or search staff read ar item cancel sets" on public.ar_item_cancel_sets for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid or (select public.ar_staff_can(array['search']::text[])));
drop policy if exists "Owner or search staff read ar item cancel restored" on public.ar_item_cancel_restored;
create policy "Owner or search staff read ar item cancel restored" on public.ar_item_cancel_restored for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid or (select public.ar_staff_can(array['search']::text[])));
drop policy if exists "Owner writes ar item cancel restored" on public.ar_item_cancel_restored;
create policy "Owner writes ar item cancel restored" on public.ar_item_cancel_restored for insert to authenticated
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
drop policy if exists "Owner deletes ar item cancel restored" on public.ar_item_cancel_restored;
create policy "Owner deletes ar item cancel restored" on public.ar_item_cancel_restored for delete to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);

-- ---------- the laptop's upload ----------
-- p_word = '12,34,…' (item ids) · p_dup = '12:85.5,34:20,…' (id : price of the card that stays) · p_idle = '12:202103,34:201911,…'
create or replace function public.ar_item_cancel_sync(p_key text, p_word text, p_dup text, p_idle text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text; v_w int; v_d int; v_i int;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
  p_word := coalesce(p_word, ''); p_dup := coalesce(p_dup, ''); p_idle := coalesce(p_idle, '');
  if p_word !~ '^[0-9,]*$' or p_dup !~ '^[0-9:,.]*$' or p_idle !~ '^[0-9:,]*$' then raise exception 'bad list'; end if;
  if length(p_word) > 200000 or length(p_dup) > 200000 or length(p_idle) > 1500000 then raise exception 'list too long'; end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_item_cancel_sync'));

  -- the first day each word/dup item was seen (it stays as it was when the item is sent again)
  insert into public.ar_item_cancel_seen (item_id, kind)
  select (t)::int, 'word' from unnest(string_to_array(p_word, ',')) t where t <> ''
  on conflict (item_id) do update set kind = 'word';
  insert into public.ar_item_cancel_seen (item_id, kind)
  select (split_part(t, ':', 1))::int, 'dup' from unnest(string_to_array(p_dup, ',')) t where t <> ''
  on conflict (item_id) do update set kind = excluded.kind where public.ar_item_cancel_seen.kind <> 'word';

  insert into public.ar_item_cancel_sets as s (kind, ids, n, updated_at)
  select 'word', coalesce(string_agg(x.item_id || ':' || to_char(x.first_at, 'YYYYMMDD'), ',' order by x.item_id), ''), count(*), now()
  from public.ar_item_cancel_seen x
  where x.kind = 'word' and x.item_id in (select (t)::int from unnest(string_to_array(p_word, ',')) t where t <> '')
  on conflict (kind) do update set ids = excluded.ids, n = excluded.n, updated_at = now();
  get diagnostics v_w = row_count;

  insert into public.ar_item_cancel_sets as s (kind, ids, n, updated_at)
  select 'dup', coalesce(string_agg(d.id || ':' || to_char(x.first_at, 'YYYYMMDD') || ':' || d.price, ',' order by d.id), ''), count(*), now()
  from (select (split_part(t, ':', 1))::int as id, split_part(t, ':', 2) as price from unnest(string_to_array(p_dup, ',')) t where t <> '') d
  join public.ar_item_cancel_seen x on x.item_id = d.id and x.kind = 'dup'
  on conflict (kind) do update set ids = excluded.ids, n = excluded.n, updated_at = now();
  get diagnostics v_d = row_count;

  insert into public.ar_item_cancel_sets as s (kind, ids, n, updated_at)
  values ('idle', p_idle, case when p_idle = '' then 0 else array_length(string_to_array(p_idle, ','), 1) end, now())
  on conflict (kind) do update set ids = excluded.ids, n = excluded.n, updated_at = now();
  get diagnostics v_i = row_count;

  return jsonb_build_object('ok', true,
    'word', (select n from public.ar_item_cancel_sets where kind = 'word'),
    'dup', (select n from public.ar_item_cancel_sets where kind = 'dup'),
    'idle', (select n from public.ar_item_cancel_sets where kind = 'idle'));
end $function$;
revoke all on function public.ar_item_cancel_sync(text, text, text, text) from public;
grant execute on function public.ar_item_cancel_sync(text, text, text, text) to anon, authenticated;
