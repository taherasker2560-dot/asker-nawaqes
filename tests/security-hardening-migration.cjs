// Security hardening (owner 2026-11-16, «أيوه طبّق»): migration 202611160900. Review: SECURITY_REVIEW_2026-11-16.md on the laptop.
// What it must do: the anonymous role keeps SELECT on ar_store_edits only; trigger functions are not callable through the API;
// store orders and anonymous uploads get one flood limit for everybody together. What it must NOT do: drop data or touch RLS.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const raw = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202611160900_security_hardening.sql'), 'utf8');
const sql = raw.replace(/--.*$/gm, '');

// 1) anon: nothing on tables or sequences, except reading the one public table
assert.match(sql, /revoke all on all tables in schema public from anon;/);
assert.match(sql, /grant select on public\.ar_store_edits to anon;/);
assert.match(sql, /revoke all on all sequences in schema public from anon;/);
assert.match(sql, /alter default privileges for role postgres in schema public revoke all on tables from anon;/);
assert.equal((sql.match(/grant\s+[^;]*\bto\s+anon\b/gi) || []).length, 2, 'only the select on ar_store_edits and the helper execute may be granted to anon');

// 2) trigger functions are not API endpoints
assert.match(sql, /revoke execute on function public\.ar_customer_phones_max\(\) from public, anon, authenticated;/);
assert.match(sql, /revoke execute on function public\.ar_log_staff\(\) from public, anon, authenticated;/);

// 3) one flood limit for all store orders, as a trigger (the order function itself is not rewritten)
assert.match(sql, /create trigger ar_store_orders_flood before insert on public\.ar_store_orders for each row execute function public\.ar_store_orders_flood\(\);/);
assert.match(sql, /count\(\*\) from public\.ar_store_orders o where o\.created_at > now\(\) - interval '10 minutes'\) >= 40/);
assert.match(sql, /returns trigger\s+language plpgsql set search_path = ''/);
assert.match(sql, /revoke execute on function public\.ar_store_orders_flood\(\) from public, anon, authenticated;/);

// 4) anonymous uploads: the same path rules as before plus a count that runs in a SECURITY DEFINER helper
assert.match(sql, /create or replace function public\.ar_recent_uploads\(p_bucket text\) returns integer\s+language sql stable security definer set search_path = ''/);
assert.match(sql, /revoke execute on function public\.ar_recent_uploads\(text\) from public;/);
assert.match(sql, /grant execute on function public\.ar_recent_uploads\(text\) to anon, authenticated;/);
assert.match(sql, /create policy "Anyone uploads chat files" on storage\.objects for insert to anon, authenticated\s+with check \(bucket_id = 'ar-chat'\s+and name ~ '\^c\/\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\/\[0-9a-f-\]\{36\}\\\.\(jpg\|png\|webp\|wav\|pdf\|xlsx\|xls\)\$'\s+and public\.ar_recent_uploads\('ar-chat'\) < 60\);/);
assert.match(sql, /create policy "Anyone uploads store prescriptions" on storage\.objects for insert to anon, authenticated\s+with check \(bucket_id = 'ar-store-rx'\s+and name ~ '\^rx\/\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\/\[0-9a-f-\]\{20,40\}\\\.\(jpg\|png\|webp\|heic\|pdf\)\$'\s+and public\.ar_recent_uploads\('ar-store-rx'\) < 30\);/);
assert.equal((sql.match(/drop policy if exists/g) || []).length, 2, 'only the two upload policies are replaced');

// never: data loss, RLS changes, other policies, owner-only tables
assert.doesNotMatch(sql, /drop table|truncate|delete from|alter table|disable row level security|drop function public\.ar_(?!store_orders_flood|recent_uploads)/i);
// each change has its way back written in the file
for (const w of ['rollback: grant all on all tables', 'rollback: grant execute on function public.ar_customer_phones_max', 'rollback: drop trigger ar_store_orders_flood', 'rollback: recreate both policies']) assert.ok(raw.includes(w), 'missing ' + w);
console.log('PASS: security hardening migration: anon reads one public table, trigger functions closed, flood limits on orders and anonymous uploads, nothing dropped');
