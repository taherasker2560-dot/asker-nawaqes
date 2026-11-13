// «متصفح الرسائل» part 1 (owner 2026-11-13): migration 202611132330. What must hold before it is applied: a chat's secret gives
// that chat only; files never come back to the page; only the owner and staff with «خدمة العملاء» read and answer; floods are
// stopped; policies check once a request; nothing existing is dropped.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202611132330_ar_chat.sql'), 'utf8');
const code = sql.replace(/--.*$/gm, '');
assert.doesNotMatch(code, /\bdrop\s+(table|function|column)\b/i);
assert.doesNotMatch(code, /\b(delete\s+from\s+public\.(?!ar_chat_push)|truncate)\b/i, 'the only delete: the oldest push address of a chat');
for (const t of ['ar_chats', 'ar_chat_messages', 'ar_chat_push']) assert.match(code, new RegExp(`alter table public\\.${t} enable row level security;`));
// policies: select only, owner or staff «care», checked once a request
const policies = [...code.matchAll(/create policy[\s\S]*?;/g)].map((m) => m[0]);
for (const p of policies) {
  assert.doesNotMatch(p.replace(/\(select auth\.uid\(\)\)/g, '').replace(/\(select public\.ar_staff_can\([^)]*\)\)/g, ''), /auth\.uid\(\)|ar_staff_can/, 'bare check in: ' + p);
  if (/on public\./.test(p)) assert.match(p, /for select to authenticated/, 'tables are read only: ' + p);
}
assert.doesNotMatch(code, /on public\.ar_chat_push for/, 'nobody reads the push addresses directly');
assert.match(code, /"Anyone uploads chat files" on storage\.objects for insert to anon, authenticated\s+with check \(bucket_id = 'ar-chat' and name ~ '\^c\/\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\/\[0-9a-f-\]\{36\}\\\.\(jpg\|png\|webp\|wav\)\$'\)/);
assert.match(code, /values \('ar-chat', 'ar-chat', false, 8388608, array\['image\/jpeg', 'image\/png', 'image\/webp', 'audio\/wav'\]\)/, 'private bucket, 8 MB, photos and WAV only');
assert.doesNotMatch(code, /for select to anon/, 'the page never reads files back');
const fn = (name) => {
  const m = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?end \\$function\\$;`).exec(code);
  assert.ok(m, name);
  assert.match(m[0], /security definer\s+set search_path to ''/);
  return m[0];
};
const open = fn('ar_chat_open'), read = fn('ar_chat_read'), send = fn('ar_chat_send'), push = fn('ar_chat_push_save'), rep = fn('ar_chat_reply');
// the customer's functions: the secret first, that chat only
for (const f of [read, send, push]) {
  assert.match(f, /if p_secret is null or p_secret !~ '\^\[0-9a-f\]\{64\}\$' then return jsonb_build_object\('ok', false, 'error', 'chat'\)/);
  assert.match(f, /select id[^;]* from public\.ar_chats where secret = p_secret;/);
}
assert.match(read, /where x\.chat_id = v_id and x\.id > coalesce\(p_after, 0\)/);
assert.doesNotMatch(read, /'media'/, 'file paths are not given back');
assert.match(read, /limit 300/);
// a credit customer's chat comes only from his account link
assert.match(open, /from public\.ar_customer_links l join public\.ar_customers c on c\.id = l\.customer_id where l\.token = p_token/);
assert.match(open, />= 3\s+or \(select count\(\*\) from public\.ar_chats where created_at > now\(\) - interval '10 minutes'\) >= 30/, 'no flood of new chats');
// sending: a file must be just uploaded to ar-chat and used once; a voice note's words never from the page; 20 per 5 minutes
assert.match(send, /o\.bucket_id = 'ar-chat' and o\.name = p_media and o\.created_at > now\(\) - interval '1 hour'/);
assert.match(send, /exists \(select 1 from public\.ar_chat_messages m where m\.media = p_media\)/);
assert.match(send, /if p_kind = 'voice' then v_body := null; end if;/);
assert.match(send, /interval '5 minutes'\) >= 20/);
// answering: owner or staff «care», signed in only
assert.match(rep, /\(select auth\.uid\(\)\) is distinct from 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c'::uuid and not \(select public\.ar_staff_can\(array\['care'\]::text\[\]\)\)/);
assert.match(code, /revoke all on function public\.ar_chat_reply\(uuid, text\) from anon;/);
assert.match(code, /grant execute on function public\.ar_chat_reply\(uuid, text\) to authenticated;/);
for (const s of ['ar_chat_open(text, text, text, text)', 'ar_chat_read(text, bigint)', 'ar_chat_send(text, text, text, text, int)', 'ar_chat_push_save(text, text)']) {
  assert.ok(code.includes(`grant execute on function public.${s} to anon, authenticated;`), s);
}
console.log('PASS: chat migration: the secret gives its chat only, files never back to the page, owner/staff «care» answer, floods stopped');
