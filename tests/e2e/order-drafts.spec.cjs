// «الطلبيات» tab: one message per supplier from the laptop's file (private bucket asker-private/orders/drafts.json), editable,
// copied + WhatsApp opened (long messages by clipboard only), «علّمها اتطلب» writes only the items still in the message to ar_orders.
// Nothing is sent by itself; a missing or old file is said plainly.
const {run,text,waitStatus,assert}=require('./harness.cjs');
const item=(name,qty,cost,extra={})=>({item_id:1,name_pf:name,qty,need:qty-0.4,public_price:100,discount:30,source:'list',source_date:'2026-11-08',stale:false,bonus:0,mismatch:false,
 list:{discount:30,date:'2026-11-08'},buy:{discount:29,date:'2026-03-03',bonus:0},est_cost:cost,fallback:{supplier:'ELFATH',label:'الفتح',discount:28,source:'buy',date:'2026-10-01',stale:false},...extra});
const MSG1='السلام عليكم\nمحتاج الأصناف دي:\n• نوفيستوريك 20 (NOVISTORIC 20MG) × 2\n• FERRODEP 150 ML SYRUP × 3\nشكرًا';
const drafts=(at=new Date().toISOString())=>({generated_at:at,suppliers:[
 {id:'NEWCITY',label:'نيو سيتي',count:2,message:MSG1,items:[item('NOVISTORIC 20MG',2,100),item('FERRODEP 150 ML SYRUP',3,75,{source:'buy',source_date:'2026-10-19',discount:21.2,bonus:3,mismatch:true,list:{discount:35,date:'2026-11-08'},buy:{discount:21.2,date:'2026-10-19',bonus:3}})]},
 {id:'AMG',label:'AMG',count:1,message:'السلام عليكم\nمحتاج الأصناف دي:\n• AUGMENTIN ES600 SUSP × 2\nشكرًا',items:[item('AUGMENTIN ES600 SUSP',2,200,{stale:true})]},
 {id:'ELFATH',label:'الفتح',count:0,message:'',items:[]}],
 no_offer:[{item_id:9,name_pf:'LONELY ITEM',qty:1}]});
const put=(page,o)=>page.evaluate(o=>{window.__storage['orders/drafts.json']=JSON.stringify(o);window.__tables.ar_orders=[];window.__opened=[];window.open=u=>{window.__opened.push(u)}},o);
run('orders tab: a message per supplier, edit, copy + open, mark ordered',async({page,table})=>{
 await put(page,drafts());
 await page.click('[data-tab="drafts"]');
 await page.waitForSelector('#odChips [data-sup]');
 assert.ok(await page.isVisible('#draftsPanel'));assert.ok(!(await page.isVisible('#docsPanel')));assert.ok(!(await page.isVisible('#shortPanel')));
 assert.deepEqual(await page.$$eval('#odChips [data-sup]',b=>b.map(x=>x.textContent.trim())),['نيو سيتي · 2','AMG · 1'],'a supplier with no items has no chip');
 assert.match(await text(page,'#odInfo'),/اتجهزت النهارده/);assert.ok(!(await page.$eval('#odInfo',e=>e.classList.contains('bad'))));
 assert.equal(await page.inputValue('#odMsg'),MSG1);
 assert.match(await text(page,'#odTotal'),/2 صنف في الرسالة، حوالي 175 ج بعد الخصم/);
 // the details: where each discount came from, what to look at, and the fallback supplier
 await page.click('#odItemsTitle');
 assert.match(await text(page,'#odItems'),/NOVISTORIC 20MG × 2 خصم 30% · قايمة 08\/11 لو مش متاح: الفتح 28% \(آخر شرا 01\/10\)/);
 assert.match(await text(page,'#odItems'),/خصم 21\.2% · آخر شرا 19\/10 · فيه بونص · القايمة 35% وآخر شرا 21\.2% \(19\/10\)/);
 assert.match(await text(page,'#odItemsTitle'),/تفاصيل الأصناف \(2\)/);
 await page.click('#odNoTitle');assert.match(await text(page,'#odNo'),/LONELY ITEM × 1/);assert.match(await text(page,'#odNoTitle'),/مفيش عليهم عرض \(1\)/);
 // editing: a deleted line leaves the total; the edit survives moving to another supplier and back
 const edited=MSG1.replace('• FERRODEP 150 ML SYRUP × 3\n','').replace('× 2','× 5');
 await page.fill('#odMsg',edited);
 assert.match(await text(page,'#odTotal'),/1 صنف في الرسالة، حوالي 100 ج بعد الخصم/,'an edited quantity still counts the item');
 await page.click('#odChips [data-sup="AMG"]');
 assert.match(await page.inputValue('#odMsg'),/AUGMENTIN ES600 SUSP × 2/);assert.match(await text(page,'#odItems'),/قديم، راجعه/);
 await page.click('#odChips [data-sup="NEWCITY"]');assert.equal(await page.inputValue('#odMsg'),edited,'his edit is kept');
 // copy + open WhatsApp: no number, the text rides in the link, and it is on the clipboard
 await page.click('#odCopy');await waitStatus(page,/الرسالة اتنسخت واتفتح الواتس/,'odStatus');
 assert.equal(await page.evaluate(()=>window.__opened.length),1);
 assert.equal(await page.evaluate(()=>window.__opened[0]),'https://wa.me/?text='+encodeURIComponent(edited));
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),edited);
 assert.equal((await table('ar_orders')).length,0,'opening WhatsApp marks nothing');
 // a message too long for a link: WhatsApp opens bare, the text is only on the clipboard
 const long=edited+'\n'+Array(120).fill('• ANTINAL SUSP 60ML × 1').join('\n');
 await page.fill('#odMsg',long);await page.click('#odCopy');await waitStatus(page,/الرسالة طويلة/,'odStatus');
 assert.equal(await page.evaluate(()=>window.__opened[1]),'https://wa.me/');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),long);
 // «علّمها اتطلب»: only the item still in the message, under this supplier's name, once
 await page.fill('#odMsg',edited);
 await page.click('#odMark');await waitStatus(page,/اتعلّم 1 صنف «اتطلب» من نيو سيتي/,'odStatus');
 assert.deepEqual((await table('ar_orders')).map(o=>[o.name_key,o.product_name,o.supplier]),[['NOVISTORIC 20MG','NOVISTORIC 20MG','نيو سيتي']]);
 assert.equal(await page.$$eval('#odItems .od-done',x=>x.length),1);assert.match(await text(page,'#odItems'),/NOVISTORIC 20MG × 2 اتطلب النهارده من نيو سيتي/);
 await page.click('#odMark');await waitStatus(page,/متعلّمة «اتطلب» من نيو سيتي قبل كده/,'odStatus');
 assert.equal((await table('ar_orders')).length,1,'not marked twice');
 // nothing left in the message: nothing to mark
 await page.fill('#odMsg','السلام عليكم');assert.ok(await page.$eval('#odMark',b=>b.disabled));assert.match(await text(page,'#odTotal'),/مفيش أصناف في الرسالة/);
 // seven tabs and a wide message box still fit the phone
 const wide=await page.evaluate(()=>{const W=document.documentElement.clientWidth;return [...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>W+0.5||r.left<-0.5)}).map(e=>e.tagName+'#'+e.id+'.'+e.className).slice(0,8)});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the screen; too wide: '+wide.join(' | '));
 assert.equal(await page.$$eval('.bottomnav button',b=>b.length),7);assert.deepEqual(wide,[],'nothing sticks out of the screen');
},{permissions:['clipboard-read','clipboard-write']});
run('orders tab: no file yet, an old file, a broken file',async({page})=>{
 await page.evaluate(()=>{window.__opened=[]});
 await page.click('[data-tab="drafts"]');await waitStatus(page,/لسه مفيش طلبيات مقترحة/,'odStatus');
 assert.ok(!(await page.isVisible('#odBody')),'nothing to show');
 await put(page,drafts(new Date(Date.now()-3*864e5).toISOString()));
 await page.click('#odRefresh');await page.waitForSelector('#odChips [data-sup]');
 assert.match(await text(page,'#odInfo'),/قديمة، اللاب لسه ما حدّثهاش/);assert.ok(await page.$eval('#odInfo',e=>e.classList.contains('bad')));
 await page.evaluate(()=>{window.__storage['orders/drafts.json']=JSON.stringify({hello:1})});
 await page.click('#odRefresh');await waitStatus(page,/ملف الطلبيات شكله مش مظبوط/,'odStatus');
 assert.ok(!(await page.isVisible('#odBody')));
});
