// 202611161200_ar_store_items_anon_select: the store's catalog needs the anon role to SELECT ar_store_items (the row rule «Public read listed store items» limits the rows).
// Nothing else is granted: no write, no other table, no other role.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const f=path.join(__dirname,'..','supabase','migrations','202611161200_ar_store_items_anon_select.sql');
const sql=fs.readFileSync(f,'utf8');
const code=sql.split('\n').filter(l=>!/^\s*--/.test(l)).join('\n').replace(/\s+/g,' ').trim();
assert.equal(code,'grant select on public.ar_store_items to anon;','one statement: SELECT on ar_store_items to anon');
assert.match(sql,/Rollback: revoke select on public\.ar_store_items from anon;/,'the rollback is written');
assert.doesNotMatch(code,/insert|update|delete|truncate|all privileges|public\.ar_(?!store_items)/i,'nothing else is granted');
console.log('PASS: store items anon select migration');