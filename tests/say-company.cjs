// Spoken company names: «شركه» → «شركة», «(المندوب)» → «، المندوب»; only what is said changes.
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
const F=await import(path.join(__dirname,'..','supabase','functions','arabic-shortages','index.ts'));
assert.equal(F.sayCompany('مخزن رضا عطيه (بكر)'),'مخزن رضا عطيه، بكر');
assert.equal(F.sayCompany('شركه المتحدة (احمد)'),'شركة المتحدة، احمد');
assert.equal(F.sayCompany('مخزن الفتح(شريف)'),'مخزن الفتح، شريف');
assert.equal(F.sayCompany('شركه النيل'),'شركة النيل');
assert.equal(F.sayCompany('مخزن الشركهات'),'مخزن الشركهات'); // «شركه» only as its own word
assert.equal(F.sayCompany('المتحدة للأدوية'),'المتحدة للأدوية');
assert.equal(F.sayCompany('مخزن رضا ()'),'مخزن رضا');
const names=['مخزن رضا عطيه (بكر)','شركه النيل (علي)','مخزن رضا عطيه'];
assert.equal(F.sayCompanies('مخزن رضا عطيه (بكر): وصل بروفين (شراب)',names),'مخزن رضا عطيه، بكر: وصل بروفين (شراب)'); // item text untouched
assert.equal(F.sayCompanies('وصلت صور من أكتر من مورد في نفس الوقت: شركه النيل (علي) ومخزن رضا عطيه (بكر)',names),'وصلت صور من أكتر من مورد في نفس الوقت: شركة النيل، علي ومخزن رضا عطيه، بكر');
assert.equal(F.sayCompanies('مخزن رضا عطيه: مفيش حاجة',names),'مخزن رضا عطيه: مفيش حاجة');
console.log('say-company ok');
})().catch(e=>{console.error(e);process.exit(1)});
