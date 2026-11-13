// The customer's personal link (owner 2026-11-13, IDEAS row 1): migration 202611132100. What must hold before it is applied:
// the link gives nothing but that one customer's rows, only the owner makes links and stops credit, a stopped customer can
// not order on account, nothing existing is dropped, and every policy checks once a request ((select …), lesson of 11-13).
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202611132100_ar_customer_links.sql'), 'utf8');
const code = sql.replace(/--.*$/gm, '');
const OWNER = "'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid";

// nothing existing is dropped or deleted; the orders table only gets two columns
assert.doesNotMatch(code, /\bdrop\s+(table|function|column)\b/i);
assert.doesNotMatch(code, /\b(delete\s+from|truncate)\b/i);
assert.match(code, /alter table public\.ar_store_orders add column if not exists customer_id bigint;/);
assert.match(code, /alter table public\.ar_store_orders add column if not exists pay text;/);
assert.match(code, /check \(pay is null or pay in \('account', 'cash'\)\)/);

// both new tables keep row-level security; policies check once a request
for (const t of ['ar_customer_links', 'ar_customer_stops']) assert.match(code, new RegExp(`alter table public\\.${t} enable row level security;`));
const policies = [...code.matchAll(/create policy[\s\S]*?;/g)].map((m) => m[0]);
assert.equal(policies.length, 3);
for (const p of policies) {
  assert.doesNotMatch(p.replace(/\(select auth\.uid\(\)\)/g, '').replace(/\(select public\.ar_staff_can\([^)]*\)\)/g, ''), /auth\.uid\(\)|ar_staff_can/, 'bare check in: ' + p);
}
// links: the owner reads them, nobody writes them directly; stops: the owner writes, staff only read
assert.match(code, new RegExp(`"Owner reads ar customer links" on public\\.ar_customer_links for select to authenticated\\s+using \\(\\(select auth\\.uid\\(\\)\\) = ${OWNER.replace(/[()]/g, '\\$&')}\\)`));
assert.match(code, /"Owner all ar customer stops" on public\.ar_customer_stops for all to authenticated/);
assert.match(code, /"Staff select ar_customer_stops" on public\.ar_customer_stops for select to authenticated/);
assert.doesNotMatch(code, /on public\.ar_customer_links for (all|insert|update|delete)/);

// the functions: definer rights with an empty search path, the secret checked first
const fn = (name) => {
  const m = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?end \\$function\\$;`).exec(code);
  assert.ok(m, name + ' is there');
  assert.match(m[0], /security definer\s+set search_path to ''/);
  return m[0];
};
const link = fn('ar_customer_link'), view = fn('ar_customer_view'), order = fn('ar_customer_place_order');
// only the owner makes or renews a link; not callable without signing in
assert.match(link, new RegExp(`if \\(select auth\\.uid\\(\\)\\) is distinct from ${OWNER.replace(/[()]/g, '\\$&')} then\\s+raise exception`));
assert.match(code, /grant execute on function public\.ar_customer_link\(bigint, boolean\) to authenticated;/);
assert.doesNotMatch(code, /ar_customer_link\(bigint, boolean\) to anon/);
// a secret of 64 random hex: two random UUIDs without dashes
assert.match(link, /replace\(gen_random_uuid\(\)::text, '-', ''\) \|\| replace\(gen_random_uuid\(\)::text, '-', ''\)/);
// the customer's page and order: the secret's shape first, then his own rows only
for (const f of [view, order]) {
  assert.match(f, /if p_token is null or p_token !~ '\^\[0-9a-f\]\{64\}\$' then return jsonb_build_object\('ok', false, 'error', 'link'\)/);
  assert.match(f, /where l\.token = p_token;/);
}
assert.match(view, /from public\.ar_customer_moves x\s+where x\.customer_id = v_id/);
assert.match(view, /from public\.ar_customer_moves m where m\.customer_id = v_id/);
assert.match(view, /where p\.customer_id = v_id/);
assert.doesNotMatch(view, /credit_limit/, 'his limit is not shown to him');
assert.match(view, /least\(greatest\(coalesce\(p_limit, 100\), 1\), 200\)/, 'at most 200 movements a call');
// a stopped customer: on account is refused before the order is made; the store's own function does the rest
const stop = order.indexOf("'stopped'"), place = order.indexOf('public.ar_store_place_order(');
assert.ok(stop > 0 && place > stop, 'stopped is checked before placing');
assert.match(order, /if v_pay not in \('account', 'cash'\) then return/);
assert.match(order, /update public\.ar_store_orders set customer_id = v_id, pay = v_pay where id = \(v_res->>'order_id'\)::bigint;/);
assert.match(code, /grant execute on function public\.ar_customer_view\(text, timestamp, bigint, int\) to anon, authenticated;/);
assert.match(code, /grant execute on function public\.ar_customer_place_order\(text, text, text, text, jsonb, text\[\], text\) to anon, authenticated;/);
console.log('PASS: customer links migration: own rows only, owner makes links and stops, nothing dropped');
