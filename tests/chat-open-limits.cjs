// Opening a chat by name and number (owner 2026-11-14 «هنقول للعملاء رسائل كتير ما تبعتوش؟»): migration 202611140200 keeps
// ar_chat_open as it was, with a wider limit for one number (10 a day) and the answer 'busy' (no blame).
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const sql = fs.readFileSync(path.join(dir, '202611140200_ar_chat_open_limits.sql'), 'utf8').replace(/--.*$/gm, '');
const old = fs.readFileSync(path.join(dir, '202611132330_ar_chat.sql'), 'utf8');
const fnOld = /create or replace function public\.ar_chat_open\([\s\S]*?end \$function\$;/.exec(old)[0].replace(/--.*$/gm, '');
const fnNew = /create or replace function public\.ar_chat_open\([\s\S]*?end \$function\$;/.exec(sql)[0];
assert.match(fnNew, /where phone = v_phone and created_at > now\(\) - interval '1 day'\) >= 10/);
assert.match(fnNew, /interval '10 minutes'\) >= 30 then\s+return jsonb_build_object\('ok', false, 'error', 'busy'\)/);
assert.doesNotMatch(fnNew, /too_many/);
// everything else the same (the limit lines aside)
const norm = (s) => s.split('\n').map((l) => l.trim()).filter((l) => l && !/count\(\*\) from public\.ar_chats|return jsonb_build_object\('ok', false, 'error', '(too_many|busy)'\)/.test(l)).join('\n');
assert.equal(norm(fnNew), norm(fnOld));
assert.match(sql, /grant execute on function public\.ar_chat_open\(text, text, text, text\) to anon, authenticated;/);
console.log('PASS: chat open limits: 10 a day a number, «busy», the rest unchanged');
