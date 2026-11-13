// «🗑 امسح المحادثة» (owner 2026-11-14): migration 202611140300. The owner only deletes a chat and its files.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202611140300_ar_chat_delete.sql'), 'utf8').replace(/--.*$/gm, '');
assert.match(sql, /"Owner deletes chat files" on storage\.objects for delete to authenticated\s+using \(bucket_id = 'ar-chat' and \(select auth\.uid\(\)\) = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid\)/);
assert.match(sql, /if \(select auth\.uid\(\)\) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then\s+raise exception 'owner only'/);
assert.match(sql, /delete from public\.ar_chats where id = p_chat;/);
assert.match(sql, /security definer\s+set search_path to ''/);
assert.match(sql, /revoke all on function public\.ar_chat_delete\(uuid\) from anon;/);
assert.match(sql, /grant execute on function public\.ar_chat_delete\(uuid\) to authenticated;/);
assert.doesNotMatch(sql, /drop table|truncate/i);
console.log('PASS: chat delete migration: owner only, the chat (messages, push addresses) and its files');
