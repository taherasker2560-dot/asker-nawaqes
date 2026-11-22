// ar/robot.js and the «robot» kind of ar/notify.js (owner 2026-11-22): the answers of a report as buttons, the words of a refusal, and the notification that is also said out loud.
const assert=require('node:assert/strict');
const R=require('../ar/robot.js');
const N=require('../ar/notify.js');
assert.deepEqual(R.options({options:[{key:'yes',label:'كمّل وسجّلها'},{key:'',label:'x'},{label:'no key'},{key:'wait',label:'خليها مستنية'},null,{key:'cash',label:''}]}),[{key:'yes',label:'كمّل وسجّلها'},{key:'wait',label:'خليها مستنية'}],'only well formed answers');
assert.deepEqual(R.options({}),[]);assert.deepEqual(R.options(null),[]);
assert.equal(R.options({options:Array.from({length:9},(_,i)=>({key:'k'+i,label:'l'+i}))}).length,6,'at most 6');
assert.equal(R.errText('owner-only'),'الرد لصاحب الصيدلية بس.');assert.equal(R.errText('state'),'السؤال ده اترد عليه قبل كده.');assert.equal(R.errText('whatever'),'ماتبعتش. جرّب تاني.');
const k=N.KINDS.find((x)=>x.key==='robot');
assert.ok(k,'the robot has its own kind');
assert.equal(k.tab,'tempsale');assert.equal(k.group,'sales');assert.equal(k.sound,'alert');
assert.equal(k.title,'الروبوت محتاج رأيك');assert.equal(k.say,'الروبوت محتاج رأيك','the sentence said out loud');
assert.equal(k.body(2),'2 سؤال من الروبوت مستني ردّك');
assert.deepEqual(N.rises({robot:0},{robot:1}),['robot'],'a new question rings');
assert.equal(N.groupCounts({robot:2,store:1}).sales,3,'on «المبيعات» in the bottom bar');
// English: the words of the box and the refusals
global.window=global;require('../ar/i18n-en.js');require('../ar/i18n.js');const I=global.AskerI18n;I._use(global.AskerEN);
for(const s of ['🤖 الروبوت محتاج رأيك','أو اكتب له تعمل إيه…','اتبعت للروبوت ✓','الرد لصاحب الصيدلية بس.','اختار رد أو اكتب له تعمل إيه.','السؤال ده مش موجود.','السؤال ده اترد عليه قبل كده.','الرد ده الروبوت مش فاهمه.','ماتبعتش. جرّب تاني.',
 '✏️ تعديل الحد','الحد الجديد','الحد الجديد 8,000 ج','مستني يتنفذ في فارمافلاي','اكتب الحد بالأرقام، صفر أو أكتر.','ده نفس الحد اللي في كارته دلوقتي.','اتسجّل: الحد الجديد مستني يتنفذ في فارمافلاي.','موافق: احفظها متجاوزة الحد','✓ موافق على التجاوز',
 'العميل هيعدّي الحد: هيبقى عليه 500 ج والحد 300 ج. لو موافق دوس «احفظ» تاني.'])assert.doesNotMatch(I.translate(s),/[؀-ۿ]/,'Arabic left in English: '+s+' → '+I.translate(s));
console.log('PASS: robot: the answers as buttons, the refusals, the notification said out loud, the English');
