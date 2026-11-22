// «البيع المؤقت» (owner 2026-11-22, «للكل»): an item with «سعر متغيّر» in PharmaFly (the count file's vp = 1) shows the tag and a box for its
// price; the price typed is the one saved (and the one the robot types in PharmaFly's «أدخل سعر البيع»). An ordinary item has no such box.
// Made-up items only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const STOCK=[
 {item_id:66713,name:'COLD CAPS 20',arabic_name:'',price:36,packs:23,units:0,parts:2,exp_near:null,other:[],data_at:'2026-11-22 12:00:00'},
 {item_id:24281,name:'FEVER SYRUP 120ML',arabic_name:'',price:33,packs:142,units:0,parts:1,exp_near:null,other:[],data_at:'2026-11-22 12:00:00'}];
// the count's file: items with stock {i, p = parts, b = batches}; vp = 1 = «سعر متغيّر»
const COUNT={generated_at:new Date().toISOString(),data_at:'2026-11-22T12:00:00',store:1,sections:[],z:[],items:[
 {i:66713,n:'COLD CAPS 20',s:0,p:2,v:828,b:[{x:null,k:23,u:0}],vp:1},{i:24281,n:'FEVER SYRUP 120ML',s:0,p:1,v:4686,b:[{x:null,k:142,u:0}]}]};
const seed=(page)=>page.evaluate(([s,c])=>{window.__tables.ar_stock=s;window.__tables.ar_customers=[];window.__tables.ar_temp_sales=[];window.__tables.ar_store_items=[];window.__storage['count/stock.json']=JSON.stringify(c)},[STOCK,COUNT]);
const openSale=async(page)=>{await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="tempsale"]');await page.waitForSelector('#tempSalePanel:not(.hidden)');await page.waitForFunction(()=>!/بيحمّل الأصناف/.test(document.getElementById('tsFind').textContent))};
const addByName=async(page,q,code)=>{await page.fill('#tsQ',q);await page.waitForSelector(`#tsHits [data-ts-add="${code}"]`);await page.click(`#tsHits [data-ts-add="${code}"]`)};

run('Temp sale: «سعر متغيّر» shows its tag and a price box; the price typed is saved; an ordinary item has none',async({page,table})=>{
 await seed(page);
 await openSale(page);
 await page.waitForFunction(()=>{try{const c=JSON.parse(localStorage.getItem('asker-ts-batches'));return c&&Array.isArray(c.rows)&&c.rows.length===2}catch(e){return false}});
 await addByName(page,'COLD','66713');
 await page.waitForSelector('#tsCart .ts-line[data-i="0"] .ts-vp');
 assert.equal(await text(page,'#tsCart .ts-line[data-i="0"] .ts-vptag'),'سعر متغيّر');
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"] .ts-vpl'),/سعر العلبة/,'parts 2: the box\'s price');
 assert.equal(await page.inputValue('#tsCart .ts-line[data-i="0"] [data-ts-vp]'),'36','PharmaFly\'s price ready in the box');
 assert.equal(await page.$('#tsCart .ts-line[data-i="0"] .ts-was'),null,'nothing beside it while unchanged');
 // a new price (typed, then he leaves the box): the line and the bill follow, PharmaFly's price shown beside it.
 // EVERY number box (owner 2026-11-22: «الرقم اللي هغيره بمربع ازرق … اكتب فيه على طول، ما اقعدش امسح»): a tap selects its whole number,
 // so the keys typed REPLACE it (36 → 40, never 3640), and the box has the frame in the system color
 await page.click('#tsCart .ts-line[data-i="0"] [data-ts-vp]');
 await page.waitForTimeout(50);
 assert.equal(await page.$eval('#tsCart .ts-line[data-i="0"] [data-ts-vp]',(el)=>getComputedStyle(el).outlineStyle),'solid','the frame on the box under the cursor');
 await page.keyboard.type('40');
 assert.equal(await page.inputValue('#tsCart .ts-line[data-i="0"] [data-ts-vp]'),'40','typing replaced the number, nothing to delete first');
 await page.press('#tsCart .ts-line[data-i="0"] [data-ts-vp]','Tab');
 await page.waitForFunction(()=>document.querySelector('#tsCart .ts-line[data-i="0"] .ts-amt')?.textContent.trim()==='40 ج');
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"] .ts-was'),/في فارمافلاي 36 ج/);
 // a unit follows the new price (40 ÷ 2)
 await page.click('#tsCart .ts-line[data-i="0"] [data-ts-plus="w"]');
 await page.waitForFunction(()=>document.querySelector('#tsCart .ts-line[data-i="0"] .ts-amt')?.textContent.trim()==='60 ج');
 // the boxes count too: a tap on «علب» (1) and typing 3 = 3 boxes
 await page.click('#tsCart .ts-line[data-i="0"] [data-ts-n="q"]');await page.waitForTimeout(50);await page.keyboard.type('3');
 assert.equal(await page.inputValue('#tsCart .ts-line[data-i="0"] [data-ts-n="q"]'),'3','the quantity box: typing replaced 1');
 await page.press('#tsCart .ts-line[data-i="0"] [data-ts-n="q"]','Tab');
 await page.waitForFunction(()=>document.querySelector('#tsCart .ts-line[data-i="0"] .ts-amt')?.textContent.trim()==='140 ج');
 await page.click('#tsCart .ts-line[data-i="0"] [data-ts-n="q"]');await page.waitForTimeout(50);await page.keyboard.type('1');await page.press('#tsCart .ts-line[data-i="0"] [data-ts-n="q"]','Tab');
 await page.waitForFunction(()=>document.querySelector('#tsCart .ts-line[data-i="0"] .ts-amt')?.textContent.trim()==='60 ج');
 // a price of 0 is refused: the box goes back to the price
 await page.fill('#tsCart .ts-line[data-i="0"] [data-ts-vp]','0');await page.press('#tsCart .ts-line[data-i="0"] [data-ts-vp]','Tab');
 await page.waitForFunction(()=>document.querySelector('#tsCart .ts-line[data-i="0"] [data-ts-vp]')?.value==='40');
 // an ordinary item: no tag, no box
 await addByName(page,'FEVER','24281');
 await page.waitForSelector('#tsCart .ts-line[data-i="1"]');
 assert.equal(await page.$('#tsCart .ts-line[data-i="1"] .ts-vp'),null);
 await page.click('#tsSave');await page.waitForFunction(()=>/اتحفظت ✓/.test(document.getElementById('tsStatus').textContent));
 const rows=await table('ar_temp_sales');
 assert.deepEqual(rows[0].items,[{c:66713,n:'COLD CAPS 20',q:1,u:'pack',p:40},{c:66713,n:'COLD CAPS 20',q:1,u:'unit',p:20},{c:24281,n:'FEVER SYRUP 120ML',q:1,u:'pack',p:33}]);
 assert.equal(Number(rows[0].total),93);
});
