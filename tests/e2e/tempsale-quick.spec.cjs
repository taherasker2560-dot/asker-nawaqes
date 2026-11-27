// «⚡ سريع» in «البيع المؤقت» (owner 2026-11-27, «ابعت»): PharmaFly's quick-sale grid under the search, from the count file's q (the laptop). His places are kept; a tap adds the item like
// picking it from search (a stock item, a sold-with-no-stock one that asks its expiry, one only the button knows); a cancelled card is greyed and not sold; the block steps aside while he
// types, folds away and remembers. Made-up items only: the repository is public.
const {run,assert}=require('./harness.cjs');
const STOCK=[{item_id:68195,name:'EXAMPLE GEL 50G',arabic_name:'جل مثال',price:150,packs:4,units:0,parts:1,exp_near:null,other:[],data_at:'2026-11-27 00:00:00'}];
const COUNT={generated_at:new Date().toISOString(),data_at:'2026-11-27T00:02:16',store:1,sections:[],items:[],
 z:[{i:20344,n:'EXAMPLE 75MG AMP',sp:95,p:1,e:true}],
 q:[{d:0,r:0,c:0,t:'جل مثال 150',i:68195,n:'EXAMPLE GEL 50G',sp:150,p:1,e:false},{d:0,r:0,c:1,t:'حقنة مثال',i:20344,n:'EXAMPLE 75MG AMP',sp:95,p:1,e:true},
  {d:0,r:1,c:2,t:'قسطرة مثال',i:999,n:'EXAMPLE CATHETER',sp:12,p:1,e:false},{d:0,r:0,c:5,t:'قديم مثال 60',i:555,n:'ملغى',sp:78,p:1,e:false,off:1},{d:1,r:0,c:0,t:'صفحة تانية',i:998,n:'EXAMPLE OTHER',sp:5,p:1,e:false}]};
const seed=(page)=>page.evaluate(([s,c])=>{window.__tables.ar_stock=s;window.__tables.ar_customers=[];window.__tables.ar_temp_sales=[];window.__tables.ar_store_items=[];window.__storage['count/stock.json']=JSON.stringify(c)},[STOCK,COUNT]);
const openSale=async(page)=>{await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="tempsale"]');await page.waitForSelector('#tempSalePanel:not(.hidden)');await page.waitForFunction(()=>!/بيحمّل الأصناف/.test(document.getElementById('tsFind').textContent));await page.waitForSelector('#tsQuick .ts-qk-btn')};
const lines=(page)=>page.$$eval('#tsCart .ts-line',(x)=>x.map((l)=>l.textContent.replace(/\s+/g,' ')));
const btns=(page)=>page.$$eval('#tsQuick .ts-qk-btn',(b)=>b.map((x)=>[x.textContent.trim(),x.style.gridRowStart,x.style.gridColumnStart]));

run('Temp sale quick buttons: his grid under the search; a tap adds like search; a cancelled card is not sold; pages, folding, the search',async({page})=>{
 await seed(page);await openSale(page);
 assert.ok(await page.evaluate(()=>!!(document.getElementById('tsHits').compareDocumentPosition(document.getElementById('tsQuick'))&4)),'under the search results');
 assert.deepEqual(await page.$$eval('#tsQuick .ts-qk-page',(b)=>b.map((x)=>x.textContent)),['1','2']);
 assert.deepEqual(await btns(page),[['جل مثال 150','1','1'],['حقنة مثال','1','2'],['قسطرة مثال','2','3'],['قديم مثال 60','1','6']],'his places: row and column as in PharmaFly');
 assert.equal(await page.$eval('#tsQuick .ts-qk-grid',(g)=>getComputedStyle(g).gridTemplateColumns.split(' ').length),6);
 // a stock item goes straight in
 await page.click('#tsQuick .ts-qk-btn >> text=جل مثال 150');
 await page.waitForFunction(()=>document.querySelectorAll('#tsCart .ts-line').length===1);
 assert.match((await lines(page))[0],/150/);
 // a cancelled card says so and adds nothing
 await page.click('#tsQuick .ts-qk-btn.off');
 assert.match(await page.textContent('#tsFind'),/الكارت ملغي/);
 assert.equal((await lines(page)).length,1);
 // only the button knows it (no stock, not sold this year): in with its own price, no expiry asked (PharmaFly says it has none)
 await page.click('#tsQuick .ts-qk-btn >> text=قسطرة مثال');
 await page.waitForFunction(()=>document.querySelectorAll('#tsCart .ts-line').length===2);
 assert.match((await lines(page)).find((x)=>/EXAMPLE CATHETER/.test(x))||'',/12 ج.*كود 999/,'the newest line, its own price');
 // sold with no stock, it has an expiry: asked as PharmaFly asks it, like from search
 await page.click('#tsQuick .ts-qk-btn >> text=حقنة مثال');
 await page.waitForSelector('#tsExp:not(.hidden)');
 await page.click('#tsExp [data-ts-xclose]');
 // typing: the buttons step aside, and come back when the box empties
 await page.fill('#tsQ','جل');
 assert.ok(!(await page.isVisible('#tsQuick')));
 await page.fill('#tsQ','');
 await page.waitForSelector('#tsQuick',{state:'visible'});
 // page 2, folding, remembered on the phone
 await page.click('#tsQuick .ts-qk-page >> nth=1');
 assert.deepEqual((await btns(page)).map((x)=>x[0]),['صفحة تانية']);
 await page.click('#tsQuick [data-ts-qk]');
 assert.equal(await page.$('#tsQuick .ts-qk-btn'),null);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('asker-ts-quick'))),{open:false,page:1});
 await page.click('#tsQuick [data-ts-qk]');
 assert.deepEqual((await btns(page)).map((x)=>x[0]),['صفحة تانية'],'the same page when opened again');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the phone');
});
run('Temp sale with no grid in the file: no quick block, the sale as before',async({page})=>{
 await page.evaluate(([s,c])=>{window.__tables.ar_stock=s;window.__tables.ar_customers=[];window.__tables.ar_temp_sales=[];window.__tables.ar_store_items=[];window.__storage['count/stock.json']=JSON.stringify({...c,q:undefined})},[STOCK,COUNT]);
 await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="tempsale"]');await page.waitForSelector('#tempSalePanel:not(.hidden)');
 await page.waitForTimeout(1500);
 assert.ok(!(await page.isVisible('#tsQuick')));
});
