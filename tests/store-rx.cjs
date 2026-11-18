// «📋 ابعت الروشتة» (owner 2026-11-18; store/rx.js): which files a customer's pick keeps, and every text of the page comes out fully English.
const assert=require('node:assert/strict');
global.window=global;
require('../store/i18n-en-store.js');
require('../ar/i18n.js');
const T=global.AskerI18n;T._use(global.AskerEN);
const R=require('../store/rx.js');
const MB=1024*1024,f=(name,size,type)=>({name,size,type:type||'image/jpeg'});

// four photos at most, in the order he picked them; the rest are dropped without a word
let r=R.addFiles([],[f('a.jpg',1),f('b.jpg',1)],4,8*MB);assert.deepEqual(r.files.map((x)=>x.name),['a.jpg','b.jpg']);assert.equal(r.refused.length,0);
r=R.addFiles(r.files,[f('c.jpg',1),f('d.jpg',1),f('e.jpg',1)],4,8*MB);assert.deepEqual(r.files.map((x)=>x.name),['a.jpg','b.jpg','c.jpg','d.jpg'],'the fifth is dropped');
r=R.addFiles(r.files,[f('f.jpg',1)],4,8*MB);assert.equal(r.files.length,4);
// a PDF over 8 MB is refused (and told), a big photo is kept: the uploader shrinks photos
r=R.addFiles([],[f('big.pdf',9*MB,'application/pdf'),f('ok.pdf',2*MB,'application/pdf'),f('huge.jpg',20*MB)],4,8*MB);
assert.deepEqual(r.files.map((x)=>x.name),['ok.pdf','huge.jpg']);assert.deepEqual(r.refused.map((x)=>x.name),['big.pdf']);
r=R.addFiles([],[f('scan',9*MB,'')].map((x)=>({...x,name:'SCAN.PDF'})),4,8*MB);assert.equal(r.refused.length,1,'a PDF by its name too');
// the input list is not changed
const base=[f('a.jpg',1)];R.addFiles(base,[f('b.jpg',1)],4,8*MB);assert.equal(base.length,1);

// English: every fixed text, the order number with its value, and the pay button's caption
const AR=/[؀-ۿ]/,bad=[];
const check=(s)=>{s=String(s).replace(/\s+/g,' ').trim();if(s&&AR.test(s)&&AR.test(T.translate(s)))bad.push(s)};
for(const [k,v] of Object.entries(R.TEXTS)){if(k==='doneNo')check(R.fill(v,{n:12}));else check(v)}
check('فودافون كاش · إنستا باي');check('فودافون كاش');check('إنستا باي');check('💳 ادفع حسابك');
assert.deepEqual(bad,[],'Arabic left after the English engine: '+bad.join(' | '));
assert.equal(T.translate(R.fill(R.TEXTS.doneNo,{n:12})),'Order no. 12');
assert.equal(T.translate('فودافون كاش · إنستا باي'),'Vodafone Cash · InstaPay');
console.log('store-rx ok');
