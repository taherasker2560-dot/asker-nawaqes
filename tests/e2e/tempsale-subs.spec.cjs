// «البيع المؤقت»: «🔁 بدائل» next to the item's code on a bill line (owner 2026-11-28: «ما ضيفتش تاب للبدايل فى المبيعات ليه جنب كود الصنف كده», then
// «عاوزة لو اختارته ينزل مكان الصنف الاساسى اللى بحثت عنه و نزلته الفاتورة»): the alternatives in stock (same ingredient + strength + form, cheapest first,
// «أرخص بـ / أغلى بـ»); the one chosen takes the line's place with its quantity, and its batch is asked. Made-up items only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const at='2026-11-28 12:00:00';
const STOCK=[
 {item_id:91001,name:'PANTO A 40MG 14TAB',arabic_name:'',price:102,packs:2,units:0,parts:1,exp_near:null,other:[],data_at:at},
 {item_id:91002,name:'PANTO B 40MG 14TAB',arabic_name:'',price:96,packs:13,units:0,parts:1,exp_near:null,other:[],data_at:at},
 {item_id:91003,name:'PANTO C 40MG 14TAB',arabic_name:'',price:188,packs:29,units:0,parts:1,exp_near:null,other:[],data_at:at},
 {item_id:91004,name:'PANTO D 20MG 14TAB',arabic_name:'',price:60,packs:5,units:0,parts:1,exp_near:null,other:[],data_at:at}];
const COUNT={generated_at:new Date().toISOString(),data_at:'2026-11-28T12:00:00',store:1,sections:[],z:[],items:[
 {i:91001,n:'PANTO A 40MG 14TAB',s:0,p:1,v:204,b:[{x:null,k:2,u:0}]},
 {i:91002,n:'PANTO B 40MG 14TAB',s:0,p:1,v:1248,b:[{x:'2027-03',k:5,u:0},{x:'2028-01',k:8,u:0}]},
 {i:91003,n:'PANTO C 40MG 14TAB',s:0,p:1,v:5452,b:[{x:null,k:29,u:0}]},
 {i:91004,n:'PANTO D 20MG 14TAB',s:0,p:1,v:300,b:[{x:null,k:5,u:0}]}]};
const GEN=[
 {item_id:91001,gkey:'tab|pantoprazole 40mg',confident:true,ingredients:'pantoprazole 40mg',form:'tab'},
 {item_id:91002,gkey:'tab|pantoprazole 40mg',confident:false,ingredients:'pantoprazole 40mg',form:'tab'},
 {item_id:91003,gkey:'tab|pantoprazole 40mg',confident:true,ingredients:'pantoprazole 40mg',form:'tab'},
 {item_id:91004,gkey:'tab|pantoprazole 20mg',confident:true,ingredients:'pantoprazole 20mg',form:'tab'}];
const seed=(page)=>page.evaluate(([s,c,g])=>{window.__tables.ar_stock=s;window.__tables.ar_customers=[];window.__tables.ar_temp_sales=[];window.__tables.ar_store_items=[];window.__tables.ar_store_generic=g;window.__storage['count/stock.json']=JSON.stringify(c)},[STOCK,COUNT,GEN]);
const openSale=async(page)=>{await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="tempsale"]');await page.waitForSelector('#tempSalePanel:not(.hidden)');await page.waitForFunction(()=>!/بيحمّل الأصناف/.test(document.getElementById('tsFind').textContent))};
const addByName=async(page,q,code)=>{await page.fill('#tsQ',q);await page.waitForSelector(`#tsHits [data-ts-add="${code}"]`);await page.click(`#tsHits [data-ts-add="${code}"]`)};

run('Temp sale: «🔁 بدائل» beside the code; the one chosen takes the line\'s place with its quantity, then its batch is asked',async({page})=>{
 await seed(page);
 await openSale(page);
 await page.waitForFunction(()=>{try{const c=JSON.parse(localStorage.getItem('asker-ts-batches'));return c&&Array.isArray(c.rows)&&c.rows.length===4}catch(e){return false}});
 await addByName(page,'PANTO D','91004');   // a line before it: the swapped line keeps its place
 await page.waitForSelector('#tsCart .ts-line[data-i="0"]');
 await addByName(page,'PANTO A','91001');
 await page.waitForSelector('#tsCart .ts-line[data-i="1"] [data-ts-subs]');
 assert.equal(await text(page,'#tsCart .ts-line[data-i="1"] [data-ts-subs]'),'🔁 بدائل (2)','PANTO B and C (same strength, in stock); D is 20 mg');
 assert.equal(await page.$('#tsCart .ts-line[data-i="0"] [data-ts-subs]'),null,'PANTO D has no alternative in stock');
 // 3 boxes, then the alternatives open
 await page.click('#tsCart .ts-line[data-i="1"] [data-ts-plus="q"]');await page.click('#tsCart .ts-line[data-i="1"] [data-ts-plus="q"]');
 await page.click('#tsCart .ts-line[data-i="1"] [data-ts-subs]');
 await page.waitForSelector('#tsCart .ts-line[data-i="1"] .ts-subs');
 const rows=await page.$$eval('#tsCart .ts-line[data-i="1"] .ts-subs .hs-sub',r=>r.map(x=>[...x.children].map(c=>c.textContent.trim()).join(' | ')));
 assert.deepEqual(rows,['PANTO B 40MG 14TAB | 13 علبة | 96 ج | أرخص بـ 6 ج | اتأكد','PANTO C 40MG 14TAB | 29 علبة | 188 ج | أغلى بـ 86 ج']);
 assert.match(await text(page,'#tsCart .ts-line[data-i="1"] .ts-subs'),/بينزل مكان الصنف ده/);
 await page.setViewportSize({width:412,height:900});
 await page.$eval('#tsCart .ts-line[data-i="1"]',e=>e.scrollIntoView({block:'start'}));
 await page.screenshot({path:'test-results/tempsale-subs.png'});
 // PANTO B chosen: it takes the place of PANTO A (line 1), 3 boxes, its own price; its batch is asked (two expiries)
 await page.click('#tsCart .ts-line[data-i="1"] [data-ts-swap="91002"]');
 await page.waitForSelector('#tsExp:not(.hidden) [data-ts-xpick="2027-03"]');
 await page.click('#tsExp [data-ts-xpick="2027-03"]');
 await page.waitForFunction(()=>/PANTO B/.test(document.querySelector('#tsCart .ts-line[data-i="1"] strong')?.textContent||''));
 assert.match(await text(page,'#tsCart .ts-line[data-i="1"] .ts-code'),/91002/);
 assert.equal(await page.inputValue('#tsCart .ts-line[data-i="1"] [data-ts-n="q"]'),'3','the quantity stays');
 assert.equal(await text(page,'#tsCart .ts-line[data-i="1"] .ts-amt'),'288 ج','3 × 96');
 assert.match(await text(page,'#tsCart .ts-line[data-i="1"] .ts-exp'),/03\/2027|2027/);
 assert.match(await text(page,'#tsCart .ts-line[data-i="0"] strong'),/PANTO D/,'the other line did not move');
 assert.equal(await page.$$eval('#tsCart .ts-line',l=>l.length),2,'no line added: the alternative took the place');
 assert.match(await text(page,'#tsFind'),/اتبدّل/);
 // its own alternatives now: PANTO C only (PANTO A has stock 2 → it is one too)
 assert.equal(await text(page,'#tsCart .ts-line[data-i="1"] [data-ts-subs]'),'🔁 بدائل (2)');
});
run('Temp sale: a return has no «🔁 بدائل»',async({page})=>{
 await seed(page);
 await openSale(page);
 await page.waitForFunction(()=>{try{const c=JSON.parse(localStorage.getItem('asker-ts-batches'));return c&&Array.isArray(c.rows)&&c.rows.length===4}catch(e){return false}});
 await page.click('[data-ts-type="return"]');
 await addByName(page,'PANTO A','91001');
 await page.waitForSelector('#tsCart .ts-line[data-i="0"]');
 assert.equal(await page.$('#tsCart [data-ts-subs]'),null);
});
