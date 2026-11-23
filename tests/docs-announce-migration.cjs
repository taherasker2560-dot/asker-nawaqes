// Invoice photos told by the server (owner 11-17 «أول ما الصور تيجي تنبهني»; off the laptop's Claude task 11-23 «عاوزين نخفف الحمل
// عالرامات»): migration 202611230300. A column for «told», what is already there marked told, and ONE pg_cron job every 5 minutes
// asking asker-chat «docs», however often it is applied. Nothing is deleted.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202611230300_ar_documents_announce.sql'), 'utf8');
const code = sql.replace(/--.*$/gm, '');
assert.match(code, /alter table public\.ar_documents add column if not exists announced_at timestamptz;/);
assert.match(code, /update public\.ar_documents set announced_at = now\(\) where announced_at is null;/, 'what the old task already told is not told again');
assert.match(code, /create index if not exists ar_documents_untold on public\.ar_documents \(received_at\) where announced_at is null and status = 'new';/);
assert.match(code, /select cron\.unschedule\(jobid\) from cron\.job where jobname = 'ar-docs-tick';\s+select cron\.schedule\('ar-docs-tick', '\*\/5 \* \* \* \*'/);
assert.match(code, /url := 'https:\/\/qwrzdjdgvanmhaicncuk\.supabase\.co\/functions\/v1\/asker-chat'/);
assert.match(code, /body := '\{"action":"docs"\}'::jsonb/);
assert.match(code, /"Origin":"https:\/\/taherasker2560-dot\.github\.io"/, 'the function only answers our site');
assert.doesNotMatch(code, /drop table|truncate|delete from/i);
console.log('PASS: invoice photos announce migration: a «told» column, the old ones marked, one job every 5 minutes to asker-chat «docs»');
