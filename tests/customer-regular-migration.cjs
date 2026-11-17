// «اللي باخده دايمًا» + «أدويتي المزمنة» (owner 2026-11-17): migration 202611171900. One closed table, one function for the laptop's sync key, one
// for the customer's own link; nothing existing dropped or changed.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202611171900_ar_customer_regular.sql'), 'utf8');
const code = sql.replace(/--.*$/gm, '');
assert.doesNotMatch(code, /\bdrop\s+(table|function|column)\b/i);
assert.doesNotMatch(code, /\balter\s+table\s+public\.ar_(?!customer_regular\b)/i, 'no existing table is altered');
// the table is closed: the owner reads it, nobody else; RLS is on
assert.match(code, /create table if not exists public\.ar_customer_regular \(/);
assert.match(code, /alter table public\.ar_customer_regular enable row level security;/);
assert.match(code, /create policy "Owner reads ar customer regular" on public\.ar_customer_regular for select to authenticated\s+using \(\(select auth\.uid\(\)\) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid\);/);
assert.equal((code.match(/create policy/g) || []).length, 1, 'one policy only: the owner reads');
assert.match(code, /primary key \(customer_id, item_id\)/);
// both functions are security definer with an empty search_path (no name hijacking), and are not open to everyone by default
assert.equal((code.match(/security definer\s+set search_path to ''/g) || []).length, 2);
assert.match(code, /revoke all on function public\.ar_customer_regular_sync\(text, jsonb\) from public;/);
assert.match(code, /revoke all on function public\.ar_customer_regular_view\(text\) from public;/);
// the sync needs the laptop's key (the same table of keys as ar_customers_sync) and never wipes the table with an empty list
assert.match(code, /p_key !~ '\^\[0-9a-f\]\{64\}\$'/);
assert.match(code, /update public\.ar_sync_keys set last_used_at = now\(\) where key_hash = v_hash;/);
assert.match(code, /if v_n = 0 then return jsonb_build_object\('ok', true, 'rows', 0, 'gone', 0, 'skipped', true\); end if;/);
assert.match(code, /v_n > 3000 then raise exception/);
// the view: only by the customer's own link secret, only his own rows, only the fields the page needs (no phone, no balance, no other customer)
const view = code.slice(code.indexOf('function public.ar_customer_regular_view'));
assert.match(view, /p_token !~ '\^\[0-9a-f\]\{64\}\$'/);
assert.match(view, /from public\.ar_customer_links l where l\.token = p_token/);
assert.match(view, /where r\.customer_id = v_id/);
assert.doesNotMatch(view, /ar_customers\b|ar_customer_phones|balance/);
assert.match(view, /grant execute on function public\.ar_customer_regular_view\(text\) to anon, authenticated;/);
// bare auth.uid() is once per row: it is always wrapped
assert.doesNotMatch(code.replace(/\(select auth\.uid\(\)\)/g, ''), /auth\.uid\(\)/);
console.log('PASS: customer regular migration: one closed table, key-gated sync that never wipes on an empty list, a view by the customer\'s own link only');
