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
// store v2 (2026-11-15): the cart bar, the rows, the recent searches
for(const s of ['ممكن يعجبك كمان','دوّرت عليه قبل كده','الناس بتدوّر على','الكمية في السلة','3 صنف','3 صنف · 470 ج','3 صنف · 470 ج + بالطلب','2 صنف + بالطلب','ضيف PANADOL للسلة','صورة PANADOL','👨‍⚕️ صيدلي بيراجع طلبك'])check(s);
// «حسابي» (store/account.js, 2026-11-13): its fixed texts and the ones it builds
const A=require('../store/account.js');
for(const v of Object.values(A.TEXTS))check(v);
for(const b of [7174,-200,0.2])check(A.balanceWords(b).text);
for(const k of ['sale','return','payment','refund'])check(A.moveTitle({kind:k,total:k==='return'?-54:166.7,paid:k==='payment'?8000:k==='refund'?-200:0}).text);
for(const b of [7174,-200,0])check(A.afterText(b));
for(const n of [1,2,5,14])check(A.itemsWord(n));
for(const l of [{p:1,u:0},{p:0,u:2},{p:1,u:3}])check(A.qtyText(l)+' · 66.70');
for(const s of ['حسابك يا Ahmed · كود 2489','خصم 5 ج','دفعت منها 100 ج','آخر تحديث النهارده 8:10 م · بيتحدث كل 10 دقايق','آخر تحديث 05/11/2026','⛔ حسابك موقوف دلوقتي','10:33 م · ','الطلب هيتحط على حسابك في الصيدلية'])check(s);
// the payment by transfer (store/pay.js, 2026-11-17): its fixed texts and the ones it builds (numbers and the method's name put in)
const PY=require('../store/pay.js');
for(const [k,v] of Object.entries(PY.TEXTS)){
  if(k==='orderNote'||k==='amountLine'||k==='amountNone')continue; // templates: checked below with the method's name in
  check(v);
}
for(const m of ['فودافون كاش','إنستا باي']){
  check(PY.TEXTS.amountLine.replace('{a}','245').replace('{m}',m));
  check(PY.TEXTS.amountNone.replace('{m}',m));
  check(PY.TEXTS.orderNote.replace('{m}',m));
  check(`الدفع بتحويل ${m}. بعد التحويل ابعت صورته على واتساب.`);
}
// the site account inside the installed app (store/siteuser.js, 2026-11-17): its fixed texts and the errors it shows
const SU=require('../store/siteuser.js');
for(const [k,v] of Object.entries(SU.TEXTS)){if(k==='signedAs'){check('👤 Ahmed');continue}check(v)}
for(const v of Object.values(SU.ERRORS))check(v);
// «كرّر دواك بالباركود» (store/scan.js, 2026-11-17): its fixed texts and the ones it builds (an item's name or a number put in)
const SC=require('../store/scan.js');
for(const [k,v] of Object.entries(SC.TEXTS)){
  if(['notSticker','needsRx','notOrderable','added','each','goItems','goItemsNoPrice','more','less','plus','minus'].includes(k))continue;
  check(v);
}
for(const s of ['الكاميرا قرت 4006381333931: ده مش رقم ملصق الصيدلية. اكتب الرقم اللي فوق الباركود في «رقم الكود».','«PANADOL EXTRA» بالروشتة: ابعت صورة الروشتة من السلة.','«PANADOL EXTRA» مش متاح للطلب من الموقع دلوقتي. اكتب اسمه في «الاسم» وشوف البديل.','اتضاف: PANADOL EXTRA 24 TAB','66.7 ج للواحدة','كمّل الطلب · 3 صنف · 283.4 ج','كمّل الطلب · 2 صنف','📷 كرّر دواك بالباركود','📷 ضيف أصناف بالباركود'])check(s);
// the calm music's small button (store/music.js, 2026-11-17): its two labels
const MU=require('../store/music.js');
for(const v of Object.values(MU.TEXTS))check(v);
// «اللي باخده دايمًا» + «أدويتي المزمنة» (store/regular.js, 2026-11-17): its fixed texts and the ones it builds (days, counts and packs put in)
const RG=require('../store/regular.js');
for(const v of Object.values(RG.TEXTS)){if(!/\{\w+\}/.test(v))check(v)}
for(const n of [1,2,3,10,11,30])check(RG.usualSub(n));
for(const n of [0,1,2,3,10,11])check(RG.dueSub(n));
for(const d of [0,1,2,5,36])check(RG.sinceText(d));
for(const q of [0.3,1,2,2.5])check(RG.tookText(q));
for(const [state,due] of [['late',-13],['late',-8],['late',-1],['soon',0],['soon',1],['soon',2],['soon',5],['ok',6],['ok',9],['ok',22]])check(RG.dueText({state,due}).text);
check(RG.TEXTS.every.replace('{n}','33'));
// the stock limit in the cart (store/store.js, 2026-11-17): what the page says when he asks for more boxes than the pharmacy has
for(const n of [1,2,3,10,11,20])check(S.maxText(n));check('خليها 3');check('ده آخر المتاح عندنا');
// «⏰ منبه الدوا» (store/alarm.js, 2026-11-17): its fixed texts (the sentence the phone SAYS and the am / pm letters are not shown as text) and the ones it builds
const AL=require('../store/alarm.js');
for(const [k,v] of Object.entries(AL.TEXTS)){if(/\{\w+\}/.test(v)||['tryPhrase','sayName','am','pm'].includes(k))continue;check(v)}
check(AL.TEXTS.forCustomer.replace('{n}','Ahmed'));
for(const n of [1,2,3,10,11])check(AL.countText(n));
for(const t of ['00:00','08:00','12:30','20:00','23:59'])check(AL.timeText(t));
check('جرّب الصوت');
// «الرسايل» (store/chat.js, 2026-11-13)
const CH=require('../store/chat.js');
for(const [k,v] of Object.entries(CH.TEXTS))if(typeof v==='string')check(v);else for(const e of Object.values(v))check(e);
for(const s of ['بنرد عليك هنا · Ahmed','🎤 فويس 0:12','اتكتب: «Panadol»','10:33 م','المشتريات · Reda','10:33 م · ✓ وصلت','بيبعت… 3/10'])check(s);
// some built texts (numbers and names put in)
for(const s of ['نتايج «PANADOL»','مفيش حاجة فيها كل كلماتك، دي أقرب نتايج لـ «PANADOL EXTRA»','طلب رقم 12','طلبك رقم 12 وصلنا. الإجمالي 150 جنيه','اتضاف 3 صنف للسلة','470 ج للواحدة','تفاصيل PANADOL 500','في السلة (2)','3 صنف في السلة · 470 ج','2 صنف في السلة + أصناف بالطلب','طلب رقم 12 · 4 صنف'])check(s);
assert.deepEqual(bad,[],'Arabic texts without English in store/i18n-en-store.js:\n'+bad.join('\n'));
// the colors use the bot's names
assert.equal(T.translate('أزرق عسكر'),'Asker blue');
// the review of 2026-11-17 (owner: «راجع الترجمات»)
// one Arabic text = one English text: a second line with the same key silently replaces the first («المشتريات» was «Purchases» in the account's filter and «Purchasing» for a warehouse, and the later won)
const src=fs.readFileSync('store/i18n-en-store.js','utf8').split('"phrases"')[0];
const keys=[...src.matchAll(/^\s*"((?:[^"\\]|\\.)*)":\s*"/gm)].map(m=>m[1]),dup=keys.filter((k,i)=>keys.indexOf(k)!==i);
assert.deepEqual(dup,[],'duplicate keys in the dictionary: '+dup.join(' | '));
// no delivery wording (the pharmacy has no delivery yet) and no blessing (taken off the site) in the English the store can show
const all=Object.entries(global.AskerEN.exact);
assert.deepEqual(all.filter(([,v])=>/deliver/i.test(v)).map(([k])=>k),[],'no delivery wording in the English');
assert.ok(!all.some(([k])=>/اللهم صل|ﷺ/.test(k)),'the blessing is not in the store dictionary');
// the words that were wrong: the order arrived (it was «received»), picked up (not «delivered»), a special order (not «on order»), out of stock
const E=(a,b,m)=>assert.equal(T.translate(a),b,m||a);
E('طلبك وصل','Order received');E('اتسلّم','Picked up');E('بالطلب','Special order');E('غير متوفر','Out of stock');E('المشتريات','Purchases');E('المشتريات · Reda','Purchasing · Reda');
E('كمّل الطلب · 3 صنف · 283.4 ج','Checkout · 3 items · 283.4 EGP');E('حسابك موقوف دلوقتي','Your account is on hold right now');
// a count of one is singular («1 item»), 21 and 1,200 are not
E('1 صنف','1 item');E('3 صنف','3 items');E('21 صنف','21 items');E('طلب رقم 12 · 1 صنف','Order no. 12 · 1 item');E('اتضاف 1 صنف للسلة','1 item added to the cart');E('1 صنف في السلة · 66.7 ج','1 item in your cart · 66.7 EGP');
E('1 علبة · 66.7 ج','1 pack · 66.7 EGP');E('2 علبة · 66.7 ج','2 packs · 66.7 EGP');
console.log('store-english ok');
