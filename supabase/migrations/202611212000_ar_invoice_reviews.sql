-- 202611212000_ar_invoice_reviews (NOT applied yet: needs the owner's approval on the phone)
-- Owner 2026-11-21 («عايزين نجهز مكان في السيستم بعد ما تراجع الفواتير قبل ما تدخلها … تبعت لي الفاتورة متجهزة، لو موافق هدوس انتر فانت تبتدي تدخل، والتعليقات تحتها … اقول لك لا خليها كده او ايوه ماشي كده»;
-- mockup mockups\invoice_review_2026-11-21\index.html, his «ابنيها»): the screen «🧾 مراجعة الفواتير» (ar/invoice-review.js).
-- The invoices conversation (Claude on the laptop) READS the papers and PUBLISHES each prepared invoice here: its box number (the entry order), the lines as they will be entered, the check against the paper's net, and its
-- notes (what it found, what it WILL do, and the choices). The owner answers each note («ماشي كده» or his own choice) and presses «وافق ودخّلها»; the laptop sees the approved invoice and enters it exactly so, then marks it entered
-- with the result of its check against the database. Nothing here writes to PharmaFly: that is still done by hand-driven screens on the laptop, one invoice at a time, only after this approval.
--   status: ready (published, waiting for him) · approved (he said yes) · held (he said wait) · entering (the laptop started) · entered / failed (the laptop's answer) · cancelled
--   notes   = [{id, line, text, mine, alts:[{k,t}]}]            (written by the laptop only)
--   answers = {"<note id>": {v:'ok'} | {v:'alt', k, t} | {v:'text', t}}   (written by him only; an approval needs one for every note)
-- Rollback: drop function public.ar_invoice_review_publish(text, jsonb); drop function public.ar_invoice_review_poll(text, text[]); drop function public.ar_invoice_review_mark(text, bigint, text, jsonb);
--           drop function public.ar_invoice_review_auth(text); drop table public.ar_invoice_reviews; drop function public.ar_invoice_reviews_touch();

create table if not exists public.ar_invoice_reviews (
  id bigint generated always as identity primary key,
  batch text not null check (batch ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  ord int check (ord is null or ord between 1 and 99),
  supplier text not null check (char_length(supplier) <= 120),
  doc_no text not null check (char_length(doc_no) <= 60),
  paper_date text check (paper_date is null or char_length(paper_date) <= 20),
  total numeric(12, 2) not null,
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and octet_length(photos::text) <= 4000),
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and octet_length(lines::text) <= 60000),
  notes jsonb not null default '[]'::jsonb check (jsonb_typeof(notes) = 'array' and octet_length(notes::text) <= 20000),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 8000),
  owner_note text check (owner_note is null or char_length(owner_note) <= 1000),
  status text not null default 'ready' check (status in ('ready', 'approved', 'held', 'entering', 'entered', 'failed', 'cancelled')),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 4000)),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  started_at timestamptz,
  done_at timestamptz,
  unique (batch, doc_no)
);
create index if not exists ar_invoice_reviews_status on public.ar_invoice_reviews (status, batch, ord);
alter table public.ar_invoice_reviews enable row level security;
revoke all on public.ar_invoice_reviews from anon, authenticated;
grant select on public.ar_invoice_reviews to authenticated;
grant update (answers, owner_note, status) on public.ar_invoice_reviews to authenticated;

drop policy if exists "Owner reads ar invoice reviews" on public.ar_invoice_reviews;
create policy "Owner reads ar invoice reviews" on public.ar_invoice_reviews for select to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid);
-- he can answer, approve, hold or take back an approval only while the laptop has not started (ready / approved / held); after that the row is the laptop's
drop policy if exists "Owner answers ar invoice reviews" on public.ar_invoice_reviews;
create policy "Owner answers ar invoice reviews" on public.ar_invoice_reviews for update to authenticated
  using ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid and status in ('ready', 'approved', 'held'))
  with check ((select auth.uid()) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid and status in ('ready', 'approved', 'held'));

-- an approval needs an answer for every note; the moment is stamped
create or replace function public.ar_invoice_reviews_touch()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  n jsonb;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    for n in select * from jsonb_array_elements(new.notes) loop
      if not (new.answers ? (n ->> 'id')) then
        raise exception 'unanswered note %', n ->> 'id' using errcode = '23514';
      end if;
    end loop;
    new.approved_at := now();
  end if;
  return new;
end $function$;
drop trigger if exists ar_invoice_reviews_touch on public.ar_invoice_reviews;
create trigger ar_invoice_reviews_touch before update on public.ar_invoice_reviews for each row execute function public.ar_invoice_reviews_touch();

-- ---------- the laptop ----------
-- the sync key (the same keys as the other laptop functions); nobody else can call this
create or replace function public.ar_invoice_review_auth(p_key text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'bad key' using errcode = '28000'; end if;
  v_hash := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.ar_sync_keys set last_used_at = now() where key_hash = v_hash;
  if not found then raise exception 'bad key' using errcode = '28000'; end if;
end $function$;
revoke all on function public.ar_invoice_review_auth(text) from public, anon, authenticated;

-- publish (or refresh) one prepared invoice; p_row = {batch, ord, supplier, doc_no, paper_date, total, photos, lines, notes}.
-- A new one is «ready». One already waiting (ready / held) is replaced by the new content: the answers to notes that still exist stay, and a held one goes back to ready.
-- One that is approved, being entered or finished is left alone: {"ok":false,"status":...}
create or replace function public.ar_invoice_review_publish(p_key text, p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r public.ar_invoice_reviews;
  v_notes jsonb := coalesce(p_row -> 'notes', '[]'::jsonb);
  v_answers jsonb;
begin
  perform public.ar_invoice_review_auth(p_key);
  if p_row is null or jsonb_typeof(p_row) <> 'object' then raise exception 'row must be an object'; end if;
  perform pg_advisory_xact_lock(hashtext('public.ar_invoice_review_publish'));
  select * into r from public.ar_invoice_reviews where batch = p_row ->> 'batch' and doc_no = p_row ->> 'doc_no';
  if not found then
    insert into public.ar_invoice_reviews (batch, ord, supplier, doc_no, paper_date, total, photos, lines, notes)
    values (p_row ->> 'batch', nullif(p_row ->> 'ord', '')::int, p_row ->> 'supplier', p_row ->> 'doc_no', p_row ->> 'paper_date', (p_row ->> 'total')::numeric,
            coalesce(p_row -> 'photos', '[]'::jsonb), coalesce(p_row -> 'lines', '[]'::jsonb), v_notes)
    returning * into r;
    return jsonb_build_object('ok', true, 'id', r.id, 'status', r.status, 'created', true);
  end if;
  if r.status not in ('ready', 'held') then return jsonb_build_object('ok', false, 'id', r.id, 'status', r.status); end if;
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_answers
    from jsonb_each(r.answers) e where exists (select 1 from jsonb_array_elements(v_notes) n where n ->> 'id' = e.key);
  update public.ar_invoice_reviews
     set ord = nullif(p_row ->> 'ord', '')::int, supplier = p_row ->> 'supplier', paper_date = p_row ->> 'paper_date', total = (p_row ->> 'total')::numeric,
         photos = coalesce(p_row -> 'photos', '[]'::jsonb), lines = coalesce(p_row -> 'lines', '[]'::jsonb), notes = v_notes, answers = v_answers, status = 'ready'
   where id = r.id;
  return jsonb_build_object('ok', true, 'id', r.id, 'status', 'ready', 'created', false);
end $function$;
revoke all on function public.ar_invoice_review_publish(text, jsonb) from public;
grant execute on function public.ar_invoice_review_publish(text, jsonb) to anon, authenticated;

-- what is there in the given states (default: approved, i.e. «enter these»), in entry order; read only, so the laptop can ask again and again
create or replace function public.ar_invoice_review_poll(p_key text, p_status text[] default array['approved']::text[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.ar_invoice_review_auth(p_key);
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'batch', x.batch, 'ord', x.ord, 'supplier', x.supplier, 'doc_no', x.doc_no, 'paper_date', x.paper_date, 'total', x.total,
                                        'lines', x.lines, 'notes', x.notes, 'answers', x.answers, 'owner_note', x.owner_note, 'status', x.status, 'approved_at', x.approved_at,
                                        'result', x.result)
                     order by x.batch, x.ord nulls last, x.id)
      from public.ar_invoice_reviews x where x.status = any (p_status)), '[]'::jsonb));
end $function$;
revoke all on function public.ar_invoice_review_poll(text, text[]) from public;
grant execute on function public.ar_invoice_review_poll(text, text[]) to anon, authenticated;

-- the laptop's progress: approved -> entering -> entered / failed (p_result = {msg, total, checked, ...}); a waiting one (ready / held) can be cancelled. Finished rows older than 60 days go.
create or replace function public.ar_invoice_review_mark(p_key text, p_id bigint, p_status text, p_result jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_n int;
begin
  perform public.ar_invoice_review_auth(p_key);
  if p_status not in ('entering', 'entered', 'failed', 'cancelled') then raise exception 'bad status'; end if;
  if p_result is not null and jsonb_typeof(p_result) <> 'object' then raise exception 'result must be an object'; end if;
  update public.ar_invoice_reviews
     set status = p_status,
         result = coalesce(p_result, result),
         started_at = case when p_status = 'entering' then now() else started_at end,
         done_at = case when p_status in ('entered', 'failed', 'cancelled') then now() else done_at end
   where id = p_id
     and ((p_status = 'entering' and status = 'approved')
       or (p_status in ('entered', 'failed') and status in ('approved', 'entering'))
       or (p_status = 'cancelled' and status in ('ready', 'held')));
  get diagnostics v_n = row_count;
  delete from public.ar_invoice_reviews where created_at < now() - interval '60 days' and status in ('entered', 'failed', 'cancelled');
  return jsonb_build_object('ok', v_n = 1);
end $function$;
revoke all on function public.ar_invoice_review_mark(text, bigint, text, jsonb) from public;
grant execute on function public.ar_invoice_review_mark(text, bigint, text, jsonb) to anon, authenticated;
