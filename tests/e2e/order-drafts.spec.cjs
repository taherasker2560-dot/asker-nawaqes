// «الطلبيات» tab: an order per supplier from the laptop's file (private bucket asker-private/orders/drafts.json).
// «تعديل الأصناف»: a photo (or a shape), a tick, the monthly average, the last discount and a quantity box for every item; an item
// that is not ticked is not in the order. «انسخ الرسالة وافتح واتساب» copies the message and opens THAT supplier's saved chat
// (long messages by clipboard only); «علّمها اتطلب» writes only the ticked items to ar_orders. Nothing is sent by itself.
const {run,text,waitStatus,assert}=require('./harness.cjs');
const item=(id,name,qty,extra={})=>({item_id:id,name_pf:name,qty,need:qty-0.4,have:19,avg30:84,min:0,public_price:100,discount:30,source:'list',source_date:'2026-11-08',stale:false,bonus:0,mismatch:false,
 list:{discount:30,date:'2026-11-08'},buy:{discount:29,date:'2026-03-03',bonus:0},est_cost:qty*70,fallback:{supplier:'ELFATH',label:'الفتح',discount:28,source:'buy',date:'2026-10-01',stale:false},...extra});
const many=Array.from({length:150},(_,k)=>item(500+k,'LONG ITEM NUMBER '+k,1,{name_supplier:'صنف طويل رقم '+k}));
const drafts=(at=new Date().toISOString())=>({generated_at:at,suppliers:[
 {id:'NEWCITY',label:'نيو سيتي',count:2,items:[item(12163,'SALINE 0.9% 500CC RCقديم',23,{avg30:84,have:19,name_supplier:'محلول ملح'}),item(2,'FERRODEP 150 ML SYRUP',3,{avg30:6.5,have:0,source:'buy',source_date:'2026-10-19',discount:21.2,bonus:3,mismatch:true,list:{discount:35,date:'2026-11-08'},buy:{discount:21.2,date:'2026-10-19',bonus:3}})]},
 {id:'AMG',label:'AMG',count:1,items:[item(3,'AUGMENTIN ES600 SUSP',2,{stale:true})]},
 {id:'REDA',label:'رضا عطية',count:150,items:many},
 {id:'ELFATH',label:'الفتح',count:0,items:[]}],
 no_offer:[{item_id:9,name_pf:'LONELY ITEM',qty:1,avg30:2,have:0}]});
const SAVED=[{name:'مخزن نيو سيتى فارما',phone:'01000000001'},{name:'مخزن نيوسيتى (محمود جميل)',phone:'01000000002'},{name:'مخزن ايه ام جروب (رمضان)',phone:'01000000003'},{name:'مخزن رضا عطيه (احمد)',phone:'٠١٠٠٠٠٠٠٠٠٤'}];
const put=(page,o,saved=SAVED)=>page.evaluate(([o,saved])=>{window.__storage['orders/drafts.json']=JSON.stringify(o);window.__tables.ar_orders=[];window.__tables.ar_suppliers=saved;window.__opened=[];window.open=u=>{window.__opened.push(u)}},[o,saved]);
const msgOf=(page)=>page.inputValue('#odMsg');
run('orders tab: tick, quantity, supplier chat, mark ordered',async({page,table})=>{
 await put(page,drafts());
 await page.click('[data-group="purchases"]');await page.click('[data-pgroup="orders"]');await page.click('[data-tab="drafts"]');
 await page.waitForSelector('#odChips [data-sup]');
 assert.ok(await page.isVisible('#draftsPanel'));assert.ok(!(await page.isVisible('#docsPanel')));assert.ok(!(await page.isVisible('#shortPanel')));
 assert.deepEqual(await page.$$eval('#odChips [data-sup]',b=>b.map(x=>x.textContent.trim())),['نيو سيتي · 2','AMG · 1','رضا عطية · 150'],'a supplier with no items has no chip');
 assert.match(await text(page,'#odInfo'),/اتجهزت النهارده/);assert.ok(!(await page.$eval('#odInfo',e=>e.classList.contains('bad'))));
 // the order starts with everything ticked at the laptop's quantity (the message box is read only: the list drives it)
 assert.equal(await msgOf(page),'السلام عليكم\nمحتاج الأصناف دي:\n• محلول ملح (SALINE 0.9% 500CC RCقديم) × 23\n• FERRODEP 150 ML SYRUP × 3\nشكرًا');
 assert.ok(await page.$eval('#odMsg',t=>t.readOnly));
 assert.match(await text(page,'#odTotal'),/2 من 2 صنف في الطلب، حوالي 1,846 ج بعد الخصم/);
 // that supplier's saved chat: two people at New City, the first with a number is the default, and the choice is remembered
 assert.match(await text(page,'#odTo'),/هتتفتح محادثة: مخزن نيو سيتى فارما/);
 assert.deepEqual(await page.$$eval('#odPick [data-contact]',b=>b.map(x=>x.textContent.trim())),['مخزن نيو سيتى فارما','مخزن نيوسيتى (محمود جميل)']);
 await page.click('#odPick [data-contact="مخزن نيوسيتى (محمود جميل)"]');
 assert.match(await text(page,'#odTo'),/هتتفتح محادثة: مخزن نيوسيتى \(محمود جميل\)/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ar-draft-contact')).NEWCITY),'مخزن نيوسيتى (محمود جميل)');
 // «تعديل الأصناف»: closed at first; open = a row per item
 assert.ok(!(await page.isVisible('#odEditBox')));
 await page.click('#odEdit');assert.ok(await page.isVisible('#odEditBox'));assert.match(await text(page,'#odEdit'),/اقفل التعديل/);
 assert.equal(await page.$$eval('#odItems .od-item',x=>x.length),2);
 // photo when the owner approved one for the store (12163), a shape otherwise; the monthly average, stock and last discount beside it
 assert.equal(await page.$$eval('#odItems .od-item:nth-child(1) .od-thumb img',x=>x.length),1,'approved photo');
 assert.equal(await page.$$eval('#odItems .od-item:nth-child(2) .od-thumb.icon svg',x=>x.length),1,'a shape for an item without a photo');
 assert.match(await text(page,'#odItems .od-item:nth-child(1)'),/SALINE 0\.9% 500CC RCقديم المتوسط الشهري 84 · الرصيد 19 آخر خصم 30% · قايمة 08\/11/);
 assert.match(await text(page,'#odItems .od-item:nth-child(2)'),/المتوسط الشهري 6\.5 · الرصيد 0 آخر خصم 21\.2% · آخر شرا 19\/10 · فيه بونص القايمة 35% وآخر شرا 21\.2% \(19\/10\)/);
 assert.equal(await page.inputValue('#odItems .od-item:nth-child(1) [data-qty]'),'23');
 assert.equal(await page.$$eval('#odItems [data-on]:checked',x=>x.length),2);assert.match(await text(page,'#odEditCount'),/هتطلب 2 من 2/);
 // a typed quantity replaces the suggestion; an item that is not ticked is not in the order
 await page.fill('#odItems .od-item:nth-child(1) [data-qty]','5');
 assert.match(await msgOf(page),/× 5\n• FERRODEP 150 ML SYRUP × 3/);assert.match(await text(page,'#odTotal'),/حوالي 586 ج/);
 await page.uncheck('#odItems .od-item:nth-child(2) [data-on]');
 assert.equal(await msgOf(page),'السلام عليكم\nمحتاج الأصناف دي:\n• محلول ملح (SALINE 0.9% 500CC RCقديم) × 5\nشكرًا');
 assert.ok(await page.$eval('#odItems .od-item:nth-child(2)',r=>r.classList.contains('off')));assert.match(await text(page,'#odEditCount'),/هتطلب 1 من 2/);
 assert.match(await text(page,'#odTotal'),/1 من 2 صنف في الطلب، حوالي 350 ج/);
 // other suppliers keep their own state; coming back keeps what was typed
 await page.click('#odChips [data-sup="AMG"]');assert.match(await msgOf(page),/AUGMENTIN ES600 SUSP × 2/);assert.match(await text(page,'#odItems'),/قديم، راجعه/);
 assert.match(await text(page,'#odTo'),/هتتفتح محادثة: مخزن ايه ام جروب \(رمضان\)/);assert.equal(await page.$$eval('#odPick [data-contact]',b=>b.length),0,'one person = nothing to pick');
 await page.click('#odChips [data-sup="NEWCITY"]');assert.match(await msgOf(page),/× 5/);assert.doesNotMatch(await msgOf(page),/FERRODEP/);
 // copy + open: the chosen person's chat, the text rides in the link, and it is on the clipboard
 await page.click('#odCopy');await waitStatus(page,/اتفتحت محادثة مخزن نيوسيتى \(محمود جميل\)/,'odStatus');
 assert.equal(await page.evaluate(()=>window.__opened.length),1);
 assert.equal(await page.evaluate(()=>window.__opened[0]),'https://wa.me/201000000002?text='+encodeURIComponent(await msgOf(page)));
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),await msgOf(page));
 assert.equal((await table('ar_orders')).length,0,'opening WhatsApp marks nothing');
 // «علّمها اتطلب»: only the ticked item, under this supplier's name, once
 await page.click('#odMark');await waitStatus(page,/اتعلّم 1 صنف «اتطلب» من نيو سيتي/,'odStatus');
 assert.deepEqual((await table('ar_orders')).map(o=>[o.name_key,o.product_name,o.supplier]),[['SALINE 0.9% 500CC RCقديم','SALINE 0.9% 500CC RCقديم','نيو سيتي']]);
 // what was marked leaves the order right away (only FERRODEP, not ticked, is left), so it is not ordered twice
 assert.equal(await page.$$eval('#odItems .od-item',x=>x.length),1);assert.doesNotMatch(await text(page,'#odItems'),/SALINE/);
 assert.ok(await page.$eval('#odMark',b=>b.disabled),'nothing ticked is left to mark');
 assert.equal((await table('ar_orders')).length,1,'not marked twice');
 // sent to another supplier now: choose between only the new items and the already ordered + the new
 await page.selectOption('#odSendTo','AMG');assert.ok(await page.isVisible('#odCarry'));
 await page.check('#odCarry input[value="both"]');assert.match(await msgOf(page),/• SALINE 0\.9% 500CC RCقديم × 5/,'the quantity typed before is kept');
 await page.check('#odCarry input[value="new"]');assert.doesNotMatch(await msgOf(page),/SALINE/);
 await page.selectOption('#odSendTo','NEWCITY');assert.ok(!(await page.isVisible('#odCarry')));
 // a long order (150 items): the chat opens without the text, which is only on the clipboard
 await page.click('#odChips [data-sup="REDA"]');
 assert.match(await text(page,'#odTo'),/هتتفتح محادثة: مخزن رضا عطيه \(احمد\)/,'a number written with Arabic digits works');
 await page.click('#odCopy');await waitStatus(page,/الرسالة طويلة/,'odStatus');
 assert.equal(await page.evaluate(()=>window.__opened[1]),'https://wa.me/201000000004');assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/× 1\nشكرًا$/);
 // «شيل الكل»: nothing in the order, nothing to copy or mark; «علّم الكل» puts everything back
 await page.click('#odNone');assert.equal(await msgOf(page),'');assert.ok(await page.$eval('#odMark',b=>b.disabled));assert.ok(await page.$eval('#odCopy',b=>b.disabled));
 assert.match(await text(page,'#odTotal'),/مفيش أصناف معلّم عليها في الطلب/);
 await page.click('#odAll');assert.match(await text(page,'#odEditCount'),/هتطلب 150 من 150/);assert.ok(!(await page.$eval('#odCopy',b=>b.disabled)));
 // the unticked items of the first supplier are still out when it is shown again
 await page.click('#odChips [data-sup="NEWCITY"]');assert.doesNotMatch(await msgOf(page),/FERRODEP/);
 // the bottom bar, the rows and the buttons still fit the phone
 await page.click('#odChips [data-sup="REDA"]');
 const wide=await page.evaluate(()=>{const W=document.documentElement.clientWidth;return [...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>W+0.5||r.left<-0.5)}).map(e=>e.tagName+'#'+e.id+'.'+e.className).slice(0,8)});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the screen; too wide: '+wide.join(' | '));
 assert.equal(await page.$$eval('.bottomnav button',b=>b.length),5);assert.deepEqual(wide,[],'nothing sticks out of the screen');
},{permissions:['clipboard-read','clipboard-write']});
// owner 2026-11-12 («أ»): sent to another supplier, the order is priced with THAT supplier's discounts; each supplier in the list
// says how much more or less it costs; an item that supplier has no known discount for = public price, marked under it
run('orders tab: another supplier is priced with its own discounts',async({page})=>{
 const off=(d,extra={})=>({discount:d,source:'list',date:'2026-11-08',stale:false,bonus:0,...extra});
 const o=drafts();
 o.suppliers[0].items[0].offers={NEWCITY:off(30),AMG:off(25,{name_supplier:'ملح ٠.٩ AMG'}),REDA:off(35,{source:'buy',date:'2025-09-19',stale:true})};
 o.suppliers[0].items[1].offers={NEWCITY:off(21.2,{source:'buy',date:'2026-10-19',bonus:3})};
 await put(page,o);
 await page.click('[data-group="purchases"]');await page.click('[data-pgroup="orders"]');await page.click('[data-tab="drafts"]');
 await page.waitForSelector('#odChips [data-sup]');
 // at New City: 23×70 + 3×78.8 = 1,846. AMG: 23×75 + 3×100 (no known discount) = 2,025. Rida: 23×65 + 300 = 1,795. El-Fath: 2,600.
 const opts=()=>page.$$eval('#odSendTo option',x=>x.map(o=>o.textContent.trim()));
 assert.deepEqual(await opts(),['نيو سيتي (المقترح)','AMG · أغلى بـ 179 ج · 1 من غير خصم معروف','رضا عطية · أرخص بـ 51 ج · 1 من غير خصم معروف','الفتح · أغلى بـ 754 ج · 2 من غير خصم معروف','فارما · أغلى بـ 754 ج · 2 من غير خصم معروف','ابن سينا · أغلى بـ 754 ج · 2 من غير خصم معروف']);
 await page.selectOption('#odSendTo','AMG');
 assert.match(await text(page,'#odSendNote'),/محسوبة بخصومات AMG: حوالي 2,025 ج بدل 1,846 ج عند نيو سيتي، يعني أغلى بـ 179 ج\. 1 صنف مالهمش خصم معروف عند AMG/);
 assert.match(await text(page,'#odTotal'),/2 من 2 صنف في الطلب، حوالي 2,025 ج بخصومات AMG/);
 assert.equal(await msgOf(page),'السلام عليكم\nمحتاج الأصناف دي:\n• ملح ٠.٩ AMG (SALINE 0.9% 500CC RCقديم) × 23\n• FERRODEP 150 ML SYRUP × 3\nشكرًا','AMG\'s own name from its list');
 await page.click('#odEdit');
 assert.match(await text(page,'#odItems .od-item:nth-child(1) .od-at'),/عند AMG: 25% \(قايمة 08\/11\)/);
 assert.match(await text(page,'#odItems .od-item:nth-child(1)'),/نيو سيتي: آخر خصم 30%/,'the suggested supplier\'s own discount is still shown');
 assert.match(await text(page,'#odItems .od-item:nth-child(2) .od-warn'),/عند AMG: مالوش خصم معروف، محسوب بسعر الجمهور/);
 // the numbers follow the quantities: 10×75 + 300 = 1,050 vs 10×70 + 236.4 = 936
 await page.fill('#odItems .od-item:nth-child(1) [data-qty]','10');
 assert.match(await text(page,'#odSendNote'),/حوالي 1,050 ج بدل 936 ج عند نيو سيتي، يعني أغلى بـ 114 ج/);
 assert.equal((await opts())[1],'AMG · أغلى بـ 114 ج · 1 من غير خصم معروف');
 // back to its own supplier: as before
 await page.selectOption('#odSendTo','NEWCITY');assert.ok(!(await page.isVisible('#odSendNote')));
 assert.match(await text(page,'#odTotal'),/حوالي 936 ج بعد الخصم/);assert.equal(await page.$$eval('#odItems .od-at',x=>x.length),0);
});
run('orders tab: a supplier with no saved number, no file yet, an old file, a broken file',async({page})=>{
 await page.evaluate(()=>{window.__opened=[]});
 await page.click('[data-group="purchases"]');await page.click('[data-pgroup="orders"]');await page.click('[data-tab="drafts"]');await waitStatus(page,/لسه مفيش طلبيات مقترحة/,'odStatus');
 assert.ok(!(await page.isVisible('#odBody')),'nothing to show');
 await put(page,drafts(new Date(Date.now()-3*864e5).toISOString()),[]);
 await page.click('[data-tab="drafts"]');await page.waitForSelector('#odChips [data-sup]');
 assert.match(await text(page,'#odInfo'),/قديمة، اللاب لسه ما حدّثهاش/);assert.ok(await page.$eval('#odInfo',e=>e.classList.contains('bad')));
 assert.match(await text(page,'#odTo'),/مفيش رقم محفوظ للمورد ده، فالواتس هيتفتح من غير محادثة/);
 await page.click('#odCopy');await waitStatus(page,/الواتس اتفتح من غير محادثة/,'odStatus');
 assert.match(await page.evaluate(()=>window.__opened[0]),/^https:\/\/wa\.me\/\?text=/);
 await page.evaluate(()=>{window.__storage['orders/drafts.json']=JSON.stringify({hello:1})});
 await page.click('[data-tab="drafts"]');await waitStatus(page,/ملف الطلبيات شكله مش مظبوط/,'odStatus');
 assert.ok(!(await page.isVisible('#odBody')));
});
