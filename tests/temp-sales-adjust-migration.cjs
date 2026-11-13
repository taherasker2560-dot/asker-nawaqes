// «الفكة» (owner 2026-11-13): one new column on ar_temp_sales, nothing dropped, the policies untouched.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611130600_ar_temp_sales_adjust.sql'),'utf8');
const code=sql.replace(/--.*$/gm,'');
assert.match(code,/alter table public\.ar_temp_sales add column if not exists adjust numeric;/);
assert.doesNotMatch(code,/\b(drop|delete|truncate|policy|grant|revoke)\b/i);
console.log('PASS: temp sales adjust migration: one column, nothing dropped');
