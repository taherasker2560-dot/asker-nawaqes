// The phone's voice says «رسالة جديدة من عميل» (owner 2026-11-14): migration 202611140130 = the live ar_sync_news + block 3b.
// Said once per new customer message, only when not peeking; joined after the orders; everything else unchanged.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const sql = fs.readFileSync(path.join(dir, '202611140130_ar_sync_news_chat.sql'), 'utf8');
const prev = fs.readFileSync(path.join(dir, '202611131800_ar_hub_watch.sql'), 'utf8');
assert.match(sql, /alter table public\.ar_chats add column if not exists announced_at timestamptz;/);
assert.match(sql, /where c\.waiting > 0 and c\.last_from = 'customer' and \(c\.announced_at is null or c\.announced_at < c\.last_at\)/);
assert.match(sql, /'رسالة جديدة من عميل في الرسايل، من ' \|\| c\.name/);
assert.match(sql, /' عملاء كتبولك في الرسايل، شوف خدمة العملاء'/);
assert.match(sql, /if cardinality\(v_cids\) > 0 and not coalesce\(p_peek, false\) then\s+update public\.ar_chats set announced_at = now\(\) where id = any\(v_cids\);/);
assert.match(sql, /concat_ws\('\. ', nullif\(v_hub, ''\), nullif\(v_orders, ''\), nullif\(v_chats, ''\), nullif\(v_warn, ''\), nullif\(v_data, ''\), nullif\(v_say, ''\)\)/);
// the rest is the function of 202611131800: its sentences are all still there
for (const s of ['تنبيه: البوت ما اتحدثش من ', 'تنبيه: اللاب بطّل يبعت من ', 'البوت رجع يتحدث تاني', 'طلب جديد من الموقع رقم ', 'البوت اتحدث كله', 'تحديث النواقص اترفض'])
  assert.ok(prev.includes(s) && sql.includes(s), s);
assert.match(sql, /security definer/i);
assert.match(sql, /set search_path to ''/i);
console.log('PASS: sync news chat: «رسالة جديدة من عميل» said once, after the orders, the rest unchanged');
