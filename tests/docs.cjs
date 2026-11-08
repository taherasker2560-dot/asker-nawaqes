// «فواتير» tab helpers (ar/docs.js): time words, where a photo is kept (same place as the function: docs/<day>/<hash>),
// and the line under a document once Claude has read it.
const assert=require('node:assert/strict');
const D=require('../ar/docs.js');
const now=new Date(2026,10,8,17,0);
assert.equal(D.when(new Date(2026,10,8,16,30).toISOString(),now),'النهارده 4:30 م');
assert.equal(D.when(new Date(2026,10,8,9,5).toISOString(),now),'النهارده 9:05 ص');
assert.equal(D.when(new Date(2026,10,7,0,10).toISOString(),now),'امبارح 12:10 ص');
assert.equal(D.when(new Date(2026,10,3,14,0).toISOString(),now),'03/11 2:00 م');
assert.equal(D.when('bad',now),'');
assert.equal(D.fileKind('application/pdf','x'),'pdf');assert.equal(D.fileKind('','invoice.PDF'),'pdf');assert.equal(D.fileKind('image/jpeg','a.jpg'),'image');
assert.equal(D.docPath('ab12','image/jpeg','a.jpg','2026-11-08'),'docs/2026-11-08/ab12.jpg');
assert.equal(D.docPath('ab12','image/png','a.png','2026-11-08'),'docs/2026-11-08/ab12.png');
assert.equal(D.docPath('ab12','application/pdf','f.pdf','2026-11-08'),'docs/2026-11-08/ab12.pdf');
assert.equal(D.describe({doc_type:'purchase',supplier:'رضا عطية',doc_no:'89233',total:1156.86}),'فاتورة شرا · رضا عطية · 89233 · 1156.86');
assert.equal(D.describe({}),'');assert.equal(D.describe({doc_type:'utility'}),'ميه أو كهرباء');
assert.deepEqual(Object.keys(D.STATUS),['new','entered','kept','skipped'],'same statuses as the table');
assert.deepEqual(Object.keys(D.TYPE),['purchase','credit','collection','utility','other'],'same types as the table');
assert.equal(D.MAX_BYTES,8*1024*1024,'same limit as the ar-inbox bucket');
console.log('docs ok');
