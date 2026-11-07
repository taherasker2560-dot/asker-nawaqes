// «المخازن» tab helpers (ar/suppliers.js): name normalization, CSV parsing, file-name meta, draft → table rows.
const assert = require('node:assert/strict');
const S = require('../ar/suppliers.js');

// Persian letter forms and Arabic-Indic digits from warehouse PDFs become one spelling, so aliases are found again.
assert.equal(S.normName('ابیروفاستین ٤٠ مجم اقراص'), S.normName('ابيروفاستين 40 مجم اقراص'));
assert.equal(S.normName('كاربیمازول اقراص  س.ج '), 'كاربيمازول اقراص س.ج');
assert.equal(S.normName('ھاضمھ'), 'هاضمه');
assert.equal(S.normName('اتاكاند ١٢٫٥/١٦'), 'اتاكاند 12.5/16');
assert.equal(S.normName('Concor 5 PLUS'), 'concor 5 plus');

// CSV with BOM, quotes, commas and doubled quotes inside a cell, CRLF line ends
const csv = '﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n2,z,\r\n';
assert.deepEqual(S.parseCsv(csv), [['a', 'b', 'c'], ['1', 'x, y', 'say "hi"'], ['2', 'z', '']]);

assert.deepEqual(S.metaFromFileName('AMG_2026-04-05_v2_price_first_draft.csv'), { supplier: 'AMG', list_date: '2026-04-05' });
assert.deepEqual(S.metaFromFileName('newc-2026-11-08.csv'), { supplier: 'NEWC', list_date: '2026-11-08' });
assert.deepEqual(S.metaFromFileName('قايمة.csv'), { supplier: '', list_date: '' });

// Draft CSV as written by Hub\supplier_match\match_price_first.cjs
const draft = [
  'page,supplier_name,supplier_price,discount_pct,status,similarity,item_id,pharmafly_name,pharmafly_price,bought_from_this_supplier,other_same_price_candidates',
  '3,"انتریستو ٥٠ مجم ٢٨ قرص",1700,15,strong,0.83,64040,ENTRESTO 50MG 28TABLET,1700,1,',
  '7,"دولوكسبرین ٣٠ مجم اقراص",180,28,good,0.63,63508,DULOXEPRIN 30MG,180,1,"1:X (0.40)"',
  '9,"ابیروفاستین ٤٠ مجم اقراص",68,24,none,,,,,,',
  '10,"",5,5,strong,1,1,EMPTY NAME,5,0,',
  '11,"مجهول",20,10,odd,0.5,77,SOMETHING,20,0,',
].join('\r\n');
const rows = S.rowsFromDraft(draft, { supplier: 'AMG', list_date: '2026-04-05' });
assert.equal(rows.length, 4); // the line with no warehouse name is dropped
assert.deepEqual(rows[0], {
  supplier: 'AMG', list_date: '2026-04-05', page: 3, supplier_name: 'انتریستو ٥٠ مجم ٢٨ قرص', name_norm: 'انتريستو 50 مجم 28 قرص',
  price: 1700, discount_pct: 15, match_status: 'strong', item_id: 64040, pharmafly_name: 'ENTRESTO 50MG 28TABLET', review: 'pending',
});
assert.equal(rows[1].match_status, 'good');
assert.equal(rows[2].match_status, 'none');
assert.equal(rows[2].item_id, null);
assert.equal(rows[2].pharmafly_name, null);
assert.equal(rows[3].match_status, 'none'); // unknown status is never trusted as a match
assert.equal(rows[3].item_id, null);
assert.throws(() => S.rowsFromDraft('name,price\nx,1', { supplier: 'AMG', list_date: '2026-04-05' }), /ناقص أعمدة/);
console.log('suppliers ok');
