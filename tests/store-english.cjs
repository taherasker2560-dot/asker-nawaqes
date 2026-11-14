// The store in English (owner 2026-11-12): every Arabic text of store.html, and the texts the store's code shows, must come
// out fully English with the store's dictionary (store/i18n-en-store.js) and the bot's engine (ar/i18n.js).
const fs=require('node:fs');
const assert=require('node:assert/strict');
global.window=global;
require('../store/i18n-en-store.js');
const I=require('../ar/i18n.js')||global.AskerI18n;
const T=global.AskerI18n;
T._use(global.AskerEN);
const AR=/[؀-ۿ]/;
const bad=[];
const check=(s)=>{s=s.replace(/\s+/g,' ').trim();if(s&&AR.test(s)&&AR.test(T.translate(s)))bad.push(s)};
// store.html: text and the attributes a person sees or hears (the message box's hint included)
const h=fs.readFileSync('store.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'').replace(/<!--[\s\S]*?-->/g,'');
for(const m of h.matchAll(/(?:placeholder|aria-label|title|alt)="([^"]*)"/g))check(m[1]);
for(const m of h.matchAll(/>([^<]+)</g))check(m[1]);
// the code's texts: statuses, sections, order states, errors (from store.js itself)
const S=require('../store/store.js');
for(const v of Object.values(S.STATUS))check(v.label);
for(const v of S.SECTIONS)check(v.name);
for(const v of S.NEEDS)check(v.name);
for(const v of Object.values(S.ORDER_STATUS))check(typeof v==='string'?v:v.label);
for(const v of Object.values(S.ERRORS))check(v);
// item description titles and its note (2026-11-14); the description text itself stays Arabic (translate=no)
for(const [,t] of S.DESC_SECTIONS)check(t);check('المعلومات دي للتعريف بس ومش بديل عن استشارة الصيدلي أو الطبيب.');check('✖ اقفل التعديل');
// «حسابي» (store/account.js, 2026-11-13): its fixed texts and the ones it builds
const A=require('../store/account.js');
for(const v of Object.values(A.TEXTS))check(v);
for(const b of [7174,-200,0.2])check(A.balanceWords(b).text);
for(const k of ['sale','return','payment','refund'])check(A.moveTitle({kind:k,total:k==='return'?-54:166.7,paid:k==='payment'?8000:k==='refund'?-200:0}).text);
for(const b of [7174,-200,0])check(A.afterText(b));
for(const n of [1,2,5,14])check(A.itemsWord(n));
for(const l of [{p:1,u:0},{p:0,u:2},{p:1,u:3}])check(A.qtyText(l)+' · 66.70');
for(const s of ['حسابك يا Ahmed · كود 2489','خصم 5 ج','دفعت منها 100 ج','آخر تحديث النهارده 8:10 م · بيتحدث كل 10 دقايق','آخر تحديث 05/11/2026','⛔ حسابك موقوف دلوقتي','10:33 م · ','الطلب هيتحط على حسابك في الصيدلية'])check(s);
// «الرسايل» (store/chat.js, 2026-11-13)
const CH=require('../store/chat.js');
for(const [k,v] of Object.entries(CH.TEXTS))if(typeof v==='string')check(v);else for(const e of Object.values(v))check(e);
for(const s of ['بنرد عليك هنا · Ahmed','🎤 فويس 0:12','اتكتب: «Panadol»','10:33 م','المشتريات · Reda','10:33 م · ✓ وصلت','بيبعت… 3/10'])check(s);
// some built texts (numbers and names put in)
for(const s of ['نتايج «PANADOL»','طلب رقم 12','طلبك رقم 12 وصلنا. الإجمالي 150 جنيه','اتضاف 3 صنف للسلة','470 ج للواحدة','تفاصيل PANADOL 500','في السلة (2)','3 صنف في السلة · 470 ج','2 صنف في السلة + أصناف بالطلب','طلب رقم 12 · 4 صنف'])check(s);
assert.deepEqual(bad,[],'Arabic texts without English in store/i18n-en-store.js:\n'+bad.join('\n'));
// the colors use the bot's names
assert.equal(T.translate('أزرق عسكر'),'Asker blue');
console.log('store-english ok');
