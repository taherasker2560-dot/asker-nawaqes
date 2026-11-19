// The supplier's personal link (owner 2026-11-19): migration 202611192000. What must hold before it is applied:
// the link gives nothing but that one supplier's rows (and never our selling prices, stock or notes), only the owner makes links,
// the secret is checked first, nothing existing is dropped, and the policy checks once a request ((select …), lesson of 11-13).
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202611192000_ar_vendor_links.sql'), 'utf8');
const code = sql.replace(/--.*$/gm, '');
const OWNER = "'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid";

// nothing existing is dropped or deleted, no existing table is altered
assert.doesNotMatch(code, /\bdrop\s+(table|function|column)\b/i);
assert.doesNotMatch(code, /\b(delete\s+from|truncate)\b/i);
assert.doesNotMatch(code, /\balter table public\.ar_(?!vendor_links\b)/i, 'only the new table is altered');

// the new table keeps row-level security; the one policy: the owner reads, nobody writes directly
assert.match(code, /alter table public\.ar_vendor_links enable row level security;/);
const policies = [...code.matchAll(/create policy[\s\S]*?;/g)].map((m) => m[0]);
assert.equal(policies.length, 1);
assert.doesNotMatch(policies[0].replace(/\(select auth\.uid\(\)\)/g, ''), /auth\.uid\(\)/, 'bare check in: ' + policies[0]);
assert.match(code, new RegExp(`"Owner reads ar vendor links" on public\\.ar_vendor_links for select to authenticated\\s+using \\(\\(select auth\\.uid\\(\\)\\) = ${OWNER.replace(/[()]/g, '\\$&')}\\)`));
assert.doesNotMatch(code, /on public\.ar_vendor_links for (all|insert|update|delete)/);
assert.match(code, /token text not null unique check \(token ~ '\^\[0-9a-f\]\{64\}\$'\)/);

// the functions: definer rights with an empty search path
const fn = (name) => {
  const m = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?end \\$function\\$;`).exec(code);
  assert.ok(m, name + ' is there');
  assert.match(m[0], /security definer\s+set search_path to ''/);
  return m[0];
};
const link = fn('ar_vendor_link'), view = fn('ar_vendor_view');
// only the owner makes or renews a link; not callable without signing in; two random UUIDs = 64 hex
assert.match(link, new RegExp(`if \\(select auth\\.uid\\(\\)\\) is distinct from ${OWNER.replace(/[()]/g, '\\$&')} then\\s+raise exception`));
assert.match(code, /grant execute on function public\.ar_vendor_link\(bigint, boolean\) to authenticated;/);
assert.doesNotMatch(code, /ar_vendor_link\(bigint, boolean\) to anon/);
assert.match(link, /replace\(gen_random_uuid\(\)::text, '-', ''\) \|\| replace\(gen_random_uuid\(\)::text, '-', ''\)/);
// the supplier's page: the secret's shape first, then his own rows only
assert.match(view, /if p_token is null or p_token !~ '\^\[0-9a-f\]\{64\}\$' then return jsonb_build_object\('ok', false, 'error', 'link'\)/);
assert.match(view, /where l\.token = p_token;/);
assert.match(view, /from public\.ar_vendor_moves x\s+where x\.vendor_id = v_id/);
assert.match(view, /from public\.ar_vendor_moves m\s+where m\.vendor_id = v_id/);
assert.match(view, /from public\.ar_vendor_moves o where o\.vendor_id = v_id/);
assert.match(view, /from public\.ar_vendor_moves c where c\.vendor_id = v_id/);
assert.match(view, /from public\.ar_vendor_moves f where f\.vendor_id = v_id/);
// never our selling prices, stock, notes, or another supplier: the only tables read are the supplier's links / his card / his moves and the item name + the owner's picture choice
for (const bad of ['ar_stock', 'price', 'ar_vendors_sync', 'ar_cash', 'ar_pay_orders', 'ar_return_marks', 'ar_customers']) assert.doesNotMatch(view, new RegExp(bad), 'the supplier view never touches ' + bad);
const tables = [...new Set([...view.matchAll(/(?:from|join)\s+public\.(\w+)/g)].map((m) => m[1]))].sort();
assert.deepEqual(tables, ['ar_store_edits', 'ar_store_items', 'ar_vendor_links', 'ar_vendor_moves', 'ar_vendors']);
assert.doesNotMatch(view, /short/, 'our short code of the supplier is not shown to him');
assert.match(view, /least\(greatest\(coalesce\(p_limit, 25\), 1\), 60\)/, 'at most 60 moves a call');
assert.match(view, /case when p_kind in \('purchase', 'return', 'payment'\) then p_kind else null end/);
// the owner's own look is not counted as the supplier opening his link
assert.match(view, /if not coalesce\(p_look, false\) then\s+update public\.ar_vendor_links set last_seen_at = now\(\)/);
assert.match(code, /grant execute on function public\.ar_vendor_view\(text, text, date, date, timestamp, bigint, int, boolean\) to anon, authenticated;/);
assert.match(code, /revoke all on function public\.ar_vendor_view\(text, text, date, date, timestamp, bigint, int, boolean\) from public;/);
console.log('PASS: vendor links migration: his own rows only, owner makes links, nothing of ours leaks, nothing dropped');
