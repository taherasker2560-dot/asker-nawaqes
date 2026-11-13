// «رسالة جديدة من عميل» on the pharmacy's phones (owner 2026-11-14): migration 202611140030. One column, one closed table, one
// function for the owner / staff with «خدمة العملاء»; nothing existing dropped.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202611140030_ar_chat_staff_push.sql'), 'utf8');
const code = sql.replace(/--.*$/gm, '');
assert.doesNotMatch(code, /\bdrop\s+(table|function|column)\b/i);
assert.match(code, /alter table public\.ar_chats add column if not exists notified_at timestamptz;/);
assert.match(code, /alter table public\.ar_chat_staff_push enable row level security;/);
assert.doesNotMatch(code, /create policy/, 'no direct access to the push addresses');
assert.match(code, /security definer\s+set search_path to ''/);
assert.match(code, /v_me is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid and not \(select public\.ar_staff_can\(array\['care'\]::text\[\]\)\)/);
assert.match(code, /v_me uuid := \(select auth\.uid\(\)\)/);
assert.match(code, /revoke all on function public\.ar_chat_staff_push_save\(text\) from anon;/);
assert.match(code, /grant execute on function public\.ar_chat_staff_push_save\(text\) to authenticated;/);
console.log('PASS: chat staff push migration: one column, a closed table, owner/staff «care» only');
