// In-page item list builder (catalog-update.js): same rules as scripts/build-catalog.py. No network.
const assert=require('node:assert/strict'),C=require('../catalog-update.js');
assert.deepEqual(C.parseCsv('﻿a;b\r\n"x;y";"say ""hi"""\r\n1;2'),[['a','b'],['x;y','say "hi"'],['1','2']],'quotes, separators inside quotes, BOM, CRLF');
const head='ID;name;NameOld;DESCRIPTION;IsActive';
const rows=[head,...Array.from({length:1100},(_,i)=>`${i+10};ITEM ${i};NULL;NULL;1`),'1;PANADOL 500MG 24TAB;بانادول ٥٠٠;NULL;1','2;OLD ملغى;NULL;NULL;1','3;OFF ITEM;NULL;NULL;0','4;X;NULL;NULL;1'];
const r=C.build(rows.join('\n'),[['1','PANADOL 500MG 24TAB',['بنادول']],['5','GONE',['قديم']]]);
const p=r.items.find(x=>x[0]==='1');assert.deepEqual(p[2],['بانادول ٥٠٠','بنادول'],'Arabic from the export plus the names already in the list');
assert.ok(!r.items.some(x=>['2','3','4','5'].includes(x[0])),'cancelled, inactive, too short and removed items are left out');
assert.throws(()=>C.build('a;b\n1;2',null),/ASKER_ITEMS/);assert.throws(()=>C.build([head,'1;ITEM A;NULL;NULL;1'].join('\n'),null),/قليل/);
console.log('PASS: catalog update: CSV parsing, active/cancelled rules, Arabic names kept, wrong or tiny files refused');
