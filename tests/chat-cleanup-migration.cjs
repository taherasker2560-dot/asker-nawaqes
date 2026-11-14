// Things deleted by themselves (owner 2026-11-14 «ب: 7 أيام»): migration 202611141600. pg_cron asks asker-chat «cleanup» every
// night at 04:00 Cairo (02:00 UTC), one job however often it is applied; the owner only deletes one message by hand.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202611141600_ar_chat_cleanup.sql'), 'utf8');
const code = sql.replace(/--.*$/gm, '');
assert.match(code, /create extension if not exists pg_net with schema extensions;/);
assert.match(code, /create extension if not exists pg_cron;/);
assert.match(code, /select cron\.unschedule\(jobid\) from cron\.job where jobname = 'ar-chat-cleanup';\s+select cron\.schedule\('ar-chat-cleanup', '0 2 \* \* \*'/);
assert.match(code, /url := 'https:\/\/qwrzdjdgvanmhaicncuk\.supabase\.co\/functions\/v1\/asker-chat'/);
assert.match(code, /body := '\{"action":"cleanup"\}'::jsonb/);
assert.match(code, /"Origin":"https:\/\/taherasker2560-dot\.github\.io"/, 'the function only answers our site');
assert.match(code, /if \(select auth\.uid\(\)\) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid then\s+raise exception 'owner only'/);
assert.match(code, /delete from public\.ar_chat_messages where id = p_id;/);
assert.match(code, /security definer\s+set search_path to ''/);
assert.match(code, /revoke all on function public\.ar_chat_delete_message\(bigint\) from anon;/);
assert.doesNotMatch(code, /drop table|truncate|delete from storage/i);
console.log('PASS: chat clean-up migration: one nightly job to asker-chat «cleanup», one message deleted by the owner only');
