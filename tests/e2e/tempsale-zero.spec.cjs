// «البيع المؤقت» (owner 2026-11-21): the items SOLD in the last year that have no stock appear in the search (after the ones with stock,
// tagged «مفيش رصيد») and are sold with no stock as PharmaFly does; the expiry is TYPED like PharmaFly (an item PharmaFly says has no
// expiry is not asked). Made-up items only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const ym=(m)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+m);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
const fmt=(x)=>`${x.slice(5)}/${x.slice(0,4)}`;
const LATER=ym(14),PAST=ym(-2);
const STOCK=[{item_id:68195,name:'VOLTAREN EMULGEL 50G',arabic_name:'فولتارين اميلجيل',price:150,packs:4,units:0,parts:1,exp_near:LATER+'-28',other:[],data_at:'2026-11-12 22:00:00'}];
// the count's file: z = sold in the last 12 months, no stock in the main store {i, n, sp = PharmaFly's current price, p = parts, e = has an expiry}
const COUNT={generated_at:new Date().toISOString(),data_at:'2026-11-21T13:19:17',store:1,sections:[],items:[],z:[
 {i:20344,n:'VOLTAREN 75MG AMP',sp:95,p:1,e:true},{i:20351,n:'VOLTAREN RETARD 100MG',sp:78,p:5,e:false},{i:68195,n:'VOLTAREN EMULGEL 50G',sp:150,p:1,e:true},{i:777,n:'ZETA ZERO 10TAB',sp:40,p:2,e:true}]};
const STORE_ITEMS=[{id:20344,name:'VOLTAREN 75MG AMP',arabic_name:'فولتارين ٧٥ امبول',status:'on_order',price:null},{id:20351,name:'VOLTAREN RETARD 100MG',arabic_name:'فولتارين ريتارد',status:'on_order',price:null},{id:777,name:'ZETA ZERO 10TAB',arabic_name:'',status:'on_order',price:null}];
const seed=(page,withFile=true)=>page.evaluate(([s,c,si,f])=>{window.__tables.ar_stock=s;window.__tables.ar_customers=[];window.__tables.ar_temp_sales=[];window.__tables.ar_store_items=si;if(f)window.__storage['count/stock.json']=JSON.stringify(f)},[STOCK,[],STORE_ITEMS,withFile?COUNT:null]);
const openSale=async(page)=>{await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="tempsale"]');await page.waitForSelector('#tempSalePanel:not(.hidden)');await page.waitForFunction(()=>!/بيحمّل الأصناف/.test(document.getElementById('tsFind').textContent))};
const sheetOpen=(page)=>page.$eval('#tsExp',e=>!e.classList.contains('hidden')).catch(()=>false);
const lines=(page)=>page.$$eval('#tsCart .ts-line',x=>x.length);
const typeDate=async(page,v)=>{await page.fill('#tsExpIn',v)};

run('Temp sale: sold in the last year with no stock: shown after the stock ones, tagged, sold with no stock, the expiry typed',async({page,table})=>{
 await seed(page);
 await openSale(page);
 // wait until their Arabic names arrive (asked once from the items table)
 await page.waitForFunction(()=>{try{const c=JSON.parse(localStorage.getItem('asker-ts-batches'));return c&&c.z&&c.z.every(r=>r[5]!==undefined)}catch(e){return false}});
 await page.fill('#tsQ','فولتارين');
 await page.waitForSelector('#tsHits [data-ts-add="20344"]');
 // the stock one first, no tag; then the separator; then the sold ones tagged (the item that has stock now is not listed twice)
 const order=await page.$$eval('#tsHits [data-ts-add]',b=>b.map(x=>x.dataset.tsAdd));
 assert.equal(order[0],'68195','the one with stock first');assert.deepEqual(order.slice(1).sort(),['20344','20351']);
 assert.equal(await page.$$eval('#tsHits .ts-tag',x=>x.length),2,'the tag is on the two with no stock');
 assert.equal(await page.$('#tsHits [data-ts-add="68195"] .ts-tag'),null);
 assert.match(await text(page,'#tsHits .ts-sep'),/اتباعوا قبل كده ومفيش رصيد دلوقتي/);
 assert.match(await text(page,'#tsHits [data-ts-add="20344"]'),/فولتارين ٧٥ امبول مفيش رصيد كود 20344 · 95 ج · رصيد مفيش/);
 assert.equal(await page.$$eval('#tsHits .im-lrow > button.im-th',x=>x.length),3,'each has its photo beside the button');
 // an item PharmaFly says has an expiry: the date is asked, typed; nothing goes in before it
 await page.click('#tsHits [data-ts-add="20344"]');
 await page.waitForSelector('#tsExp:not(.hidden) #tsExpIn');
 assert.equal(await lines(page),0,'not added before the date');
 assert.match(await text(page,'#tsExp'),/مفيش رصيد على الصنف ده. اكتب الصلاحية زي ما بتكتبها في فارمافلاي/);
 await typeDate(page,'abc');await page.press('#tsExpIn','Enter');
 assert.match(await text(page,'#tsExpMsg'),/اكتب الشهر والسنة، زي 03\/2028/);assert.ok(await page.$eval('#tsExpMsg',e=>e.classList.contains('bad')));
 assert.equal(await sheetOpen(page),true,'still asking');assert.equal(await lines(page),0);
 await typeDate(page,fmt(PAST));await page.click('#tsExp [data-ts-xok]');
 assert.match(await text(page,'#tsExpMsg'),/الصلاحية دي خلصت: الصنف منتهي/,'a sale never takes a date that has passed');assert.equal(await lines(page),0);
 await typeDate(page,fmt(LATER).replace('/','-').replace(/-(\d\d)(\d\d)$/,'-$2'));   // «MM-YY»
 assert.match(await text(page,'#tsExpMsg'),new RegExp(`صلاحية ${fmt(LATER)} ✓`),'the date is shown as it is read');
 await page.click('#tsExp [data-ts-xok]');
 await page.waitForSelector('#tsCart .ts-line[data-i="0"]');
 assert.equal(await sheetOpen(page),false);
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"] .ts-exp'),new RegExp(`صلاحية ${fmt(LATER)} ✓`));
 assert.equal(await text(page,'#tsCart .ts-line[data-i="0"] .ts-amt'),'95 ج','PharmaFly\'s current price');
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"] .ts-info'),/رصيد مفيش.*مفيش رصيد: هتتباع من غير رصيد \(زي فارمافلاي\)/);
 assert.equal(await page.$('#tsCart .ts-line[data-i="0"] .ts-warn'),null,'a quiet note, not the red warning');
 assert.equal(await page.inputValue('#tsCart .ts-line[data-i="0"] [data-ts-n="q"]'),'1');
 // the same item again with the same date: one more box on the same line
 await page.fill('#tsQ','فولتارين ٧٥');await page.waitForSelector('#tsHits [data-ts-add="20344"]');await page.click('#tsHits [data-ts-add="20344"]');
 await page.waitForSelector('#tsExpIn');await typeDate(page,fmt(LATER));await page.click('#tsExp [data-ts-xok]');
 await page.waitForFunction(()=>document.querySelector('#tsCart .ts-line[data-i="0"] [data-ts-n="q"]')?.value==='2');
 assert.equal(await lines(page),1);
 // «تغيير» types the date again (the box starts with the one on the line)
 await page.click('#tsCart .ts-line[data-i="0"] [data-ts-xchg]');await page.waitForSelector('#tsExpIn');
 assert.equal(await page.inputValue('#tsExpIn'),fmt(LATER));
 await typeDate(page,fmt(ym(20)));await page.click('#tsExp [data-ts-xok]');
 await page.waitForFunction((x)=>new RegExp(x).test(document.querySelector('#tsCart .ts-line[data-i="0"] .ts-exp')?.textContent||''),fmt(ym(20)));
 assert.equal(await lines(page),1);
 // an item PharmaFly says has no expiry: no question, it goes straight in (a splitting one has its two boxes)
 await page.fill('#tsQ','ريتارد');await page.waitForSelector('#tsHits [data-ts-add="20351"]');await page.click('#tsHits [data-ts-add="20351"]');
 await page.waitForSelector('#tsCart .ts-line[data-i="1"]');
 assert.equal(await sheetOpen(page),false);assert.equal(await page.$('#tsCart .ts-line[data-i="1"] .ts-exp'),null);
 assert.equal(await text(page,'#tsCart .ts-line[data-i="1"] .ts-amt'),'78 ج');
 assert.ok(await page.$('#tsCart .ts-line[data-i="1"] [data-ts-n="w"]'),'parts 5: it has a units box');
 // the sticker's own expiry is the batch in his hand: no question even for an item with no stock
 const sticker=`1${String(777).padStart(5,'0')}${ym(5).slice(5)}${ym(5).slice(2,4)}`;
 await page.evaluate((s)=>window.AskerTempSale.scanned(s,true,'itf'),sticker);
 await page.waitForSelector('#tsCart .ts-line[data-i="2"]');
 assert.equal(await sheetOpen(page),false);assert.match(await text(page,'#tsCart .ts-line[data-i="2"] .ts-exp'),new RegExp(`صلاحية ${fmt(ym(5))}`));
 // saved: the typed expiry rides on the entry; the item with none has none
 await page.click('#tsSave');await page.waitForFunction(()=>/اتحفظت ✓/.test(document.getElementById('tsStatus').textContent));
 const rows=await table('ar_temp_sales');
 assert.deepEqual(rows[0].items,[{c:20344,n:'VOLTAREN 75MG AMP',q:2,u:'pack',p:95,x:ym(20)},{c:20351,n:'VOLTAREN RETARD 100MG',q:1,u:'pack',p:78},{c:777,n:'ZETA ZERO 10TAB',q:1,u:'pack',p:40,x:ym(5)}]);
 assert.equal(rows[0].total,190+78+40);
 // nothing matches: said plainly
 await page.fill('#tsQ','zzzzqq');await page.waitForFunction(()=>/لا عليه رصيد ولا اتباع في آخر سنة/.test(document.getElementById('tsFind').textContent));
});

run('Temp sale: a return of an item with no stock may carry a date that has passed; no file = no such items',async({page})=>{
 await seed(page);
 await openSale(page);
 await page.waitForFunction(()=>{try{const c=JSON.parse(localStorage.getItem('asker-ts-batches'));return c&&c.z&&c.z.every(r=>r[5]!==undefined)}catch(e){return false}});
 await page.click('[data-ts-type="return"]');
 await page.fill('#tsQ','فولتارين ٧٥');await page.waitForSelector('#tsHits [data-ts-add="20344"]');await page.click('#tsHits [data-ts-add="20344"]');
 await page.waitForSelector('#tsExpIn');await typeDate(page,fmt(PAST));await page.click('#tsExp [data-ts-xok]');
 await page.waitForSelector('#tsCart .ts-line[data-i="0"]');
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"] .ts-exp'),new RegExp(`صلاحية ${fmt(PAST)}`));
 assert.equal(await page.$('#tsCart .ts-line[data-i="0"] .ts-note'),null,'a return says nothing about no stock');
});
run('Temp sale: with no batches file there are no sold-without-stock items, the search is as it was',async({page})=>{
 await seed(page,false);
 await openSale(page);
 await page.fill('#tsQ','فولتارين');await page.waitForSelector('#tsHits [data-ts-add="68195"]');
 assert.deepEqual(await page.$$eval('#tsHits [data-ts-add]',b=>b.map(x=>x.dataset.tsAdd)),['68195']);
 assert.equal(await page.$('#tsHits .ts-sep'),null);
 await page.fill('#tsQ','zzzzqq');await page.waitForFunction(()=>/مفيش صنف عليه رصيد بالاسم ده/.test(document.getElementById('tsFind').textContent));
});
