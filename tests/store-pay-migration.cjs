// Migration 202611170100 (owner 2026-11-17, «الدفع بتحويل»): two number columns on the settings, and ONE public function that shows
// visitors only those numbers and the WhatsApp number. The settings table itself must not become readable by visitors.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('supabase/migrations/202611170100_ar_store_pay_info.sql','utf8');
const code=sql.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n');
assert.match(code,/add column if not exists pay_vodafone text/);
assert.match(code,/add column if not exists pay_instapay text/);
assert.match(code,/pay_vodafone ~ '\^01\[0125\]\[0-9\]\{8\}\$'/,'the Vodafone number is checked in the table');
assert.match(code,/char_length\(pay_instapay\) <= 200/);
// the function: security definer with an empty search_path, reads row 1, returns only the three values
const fn=/create or replace function public\.ar_store_pay_info\(\)[\s\S]*?\$function\$;/.exec(code);
assert.ok(fn,'the function is there');
assert.match(fn[0],/security definer/);assert.match(fn[0],/set search_path to ''/);
assert.match(fn[0],/jsonb_build_object\('vodafone', s\.pay_vodafone, 'instapay', s\.pay_instapay, 'whatsapp', s\.whatsapp\)/);
assert.match(fn[0],/where s\.id = 1/);
assert.doesNotMatch(fn[0],/hero|theme|is_open|closed_message/,'nothing else of the settings leaves through it');
assert.match(code,/revoke all on function public\.ar_store_pay_info\(\) from public/);
assert.match(code,/grant execute on function public\.ar_store_pay_info\(\) to anon, authenticated/);
// visitors get NO table grant (the settings table has none today: hero text, colors and the open switch stay as they are)
assert.doesNotMatch(code,/grant[^;]*on (table )?public\.ar_store_settings to anon/i);
assert.doesNotMatch(code,/grant[^;]*on (table )?public\.ar_store_settings to public/i);
// the owner / staff (authenticated) get the new columns only, by column
for(const p of ['select','insert','update'])assert.match(code,new RegExp(`grant ${p} \\(pay_vodafone, pay_instapay\\) on public\\.ar_store_settings to authenticated`));
// orders are not touched (a transfer order goes as cash with a note)
assert.doesNotMatch(code,/ar_store_place_order|ar_customer_place_order|ar_store_orders/);
console.log('store-pay-migration ok');
