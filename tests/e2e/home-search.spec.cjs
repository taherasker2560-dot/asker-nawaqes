// The search on top of every section (owner 2026-11-12): one box, one card per item, over EVERY item of the system
// (ar_store_items), the stock, the shortage list, today's «اتطلب» and the warehouses' lists; ✏️ fixes the Arabic name
// (ar_store_owner_set_arabic + ar_names «approved»). Lines not surely one of our items are shown apart.
const {run,assert}=require('./harness.cjs');
const cards=(page)=>page.$$eval('#hsItems .hs-item',e=>e.map(x=>({name:x.querySelector('strong').textContent.trim(),tags:[...x.querySelectorAll('.tag')].map(t=>t.textContent.trim()),offers:(x.querySelector('.hs-offers')||{}).textContent||'',buys:(x.querySelector('.hs-buys')||{}).textContent||''})));
const seed=(page)=>page.evaluate(()=>{
 const T={};
 T.ar_store_items=[
  {id:101,name:'BRUFEN 400MG 30TAB',arabic_name:'بروفين ٤٠٠ مجم',price:52,status:'available',is_listed:true,hidden:false},
  {id:201,name:'FLAGYL 125MG SYP',arabic_name:null,price:30,status:'on_order',is_listed:true,hidden:false},
  {id:301,name:'CONCOR 5MG 30TAB',arabic_name:'كونكور ٥ غلط',price:120,status:'on_order',is_listed:false,hidden:false},
 ];
 T.ar_stock=[{item_id:101,name:'BRUFEN 400MG 30TAB',arabic_name:'بروفين ٤٠٠ مجم',price:52,packs:3,units:0,parts:3,exp_near:'2027-05-31',other:null,data_at:'2026-11-12 10:45:00'}];
 T.ar_supplier_items=[
  {id:1,supplier:'AMG',list_date:'2026-11-10',supplier_name:'فلاجيل شراب',name_norm:'x',price:30,discount_pct:22,item_id:201,pharmafly_name:'FLAGYL 125MG SYP',review:'accepted',match_status:'strong'},
  {id:2,supplier:'REDA',list_date:'2026-11-11',supplier_name:'فلاجيل ١٢٥',name_norm:'y',price:30,discount_pct:18,item_id:201,pharmafly_name:'FLAGYL 125MG SYP',review:'accepted',match_status:'strong'},
  {id:3,supplier:'AMG',list_date:'2026-11-09',supplier_name:'فلاجيل قديم',name_norm:'z',price:30,discount_pct:25,item_id:201,pharmafly_name:'FLAGYL 125MG SYP',review:'accepted',match_status:'strong'},
  {id:5,supplier:'ELFT',list_date:'2026-11-11',supplier_name:'فلاجيل جديد مش عندنا',name_norm:'v',price:40,discount_pct:10,item_id:null,pharmafly_name:null,review:'pending',match_status:'none'},
 ];
 T.ar_names=[{name_key:'FLAGYL 125MG SYP',english_name:'FLAGYL 125MG SYP',arabic_name:'فلاجيل ١٢٥ شراب',status:'approved'}];
 T.ar_orders=[{id:'o1',name_key:'FLAGYL 125MG SYP',product_name:'FLAGYL 125MG SYP',supplier:'AMG',ordered_at:new Date().toISOString()}];
 T.ar_item_buys=[{item_id:201,supplier:'ELFATH',last_date:new Date().getFullYear()+'-11-09',discount_pct:21,bonus:0},{item_id:201,supplier:'AMG',last_date:'2025-10-03',discount_pct:19,bonus:2}];
 localStorage.setItem('__fakeTables',JSON.stringify(T));
});
const ready=(page)=>page.waitForFunction(()=>/\d/.test(document.getElementById('shStats')?.textContent||''));
run('search on top: every item of the system, one card each, with its marks',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 assert.ok(await page.isVisible('#homePanel'),'the bot opens on «الرئيسية»');assert.ok(await page.isVisible('#hsQ'));
 // in stock: the quantity, and who sells it
 await page.fill('#hsQ','بروفين');
 await page.waitForFunction(()=>document.querySelectorAll('#hsItems .hs-item').length>0);
 assert.ok(!(await page.isVisible('#homePanel')),'the section hides while searching');
 let c=await cards(page);
 assert.equal(c[0].name,'بروفين ٤٠٠ مجم');assert.deepEqual(c[0].tags,['3 علب','ناقص']);
 // only in the system (no stock, not short, no list): it is found too
 await page.fill('#hsQ','CONCOR');
 await page.waitForFunction(()=>/CONCOR/.test(document.getElementById('hsItems').textContent));
 c=await cards(page);assert.deepEqual(c[0].tags,['ملوش رصيد']);
 // not in stock, on the shortage list, ordered today; best offer per warehouse = its newest list
 await page.fill('#hsQ','FLAGYL');
 await page.waitForFunction(()=>/فلاجيل ١٢٥ شراب/.test(document.getElementById('hsItems').textContent)&&/في القوايم/.test(document.getElementById('hsItems').textContent)&&/آخر شرا/.test(document.getElementById('hsItems').textContent));
 c=await cards(page);
 assert.equal(c[0].name,'فلاجيل ١٢٥ شراب');assert.deepEqual(c[0].tags,['ملوش رصيد','ناقص','اتطلب النهارده']);
 assert.equal(c[0].offers.trim(),'في القوايم: AMG 22% · رضا عطية 18%','AMG from its newest list (22%, not the older 25%)');
 assert.equal(c[0].buys.trim(),'آخر شرا: الفتح 21% (9/11) · AMG 19% + بونص (3/10/25)','the newest real purchases first, with the bonus');
 // a warehouse line that is not one of our items is apart
 await page.fill('#hsQ','فلاجيل');
 await page.waitForFunction(()=>!document.getElementById('hsLinesBox').classList.contains('hidden'));
 assert.match(await page.textContent('#hsLines'),/فلاجيل جديد مش عندنا/);
 // the search stays on top of every section; choosing a section leaves it
 await page.click('[data-group="purchases"]');assert.ok(await page.isVisible('#hsQ'));assert.equal(await page.$eval('#hsQ',e=>e.value),'');assert.ok(await page.isVisible('#shortPanel'));
 await page.fill('#hsQ','بروفين');await page.waitForFunction(()=>document.querySelectorAll('#hsItems .hs-item').length>0);assert.ok(!(await page.isVisible('#shortPanel')));
 await page.click('#hsClear');assert.ok(await page.isVisible('#shortPanel'),'cleared: the section is back');
 // nothing was written
 assert.deepEqual(await page.evaluate(()=>window.__fakeWrites.filter(w=>w.rpc||/ar_stock|ar_supplier_items|ar_orders|ar_names|ar_store/.test(JSON.stringify(w)))),[]);
},{home:true});
run('search on top: ✏️ fixes the Arabic name everywhere',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 await page.fill('#hsQ','CONCOR');
 await page.waitForFunction(()=>/كونكور ٥ غلط/.test(document.getElementById('hsItems').textContent));
 await page.click('#hsItems [data-edit]');
 assert.equal(await page.$eval('#hsAr',e=>e.value),'كونكور ٥ غلط');
 await page.fill('#hsAr','كونكور ٥ مجم ٣٠ قرص');await page.click('#hsItems [data-save]');
 await page.waitForFunction(()=>/الاسم اتحفظ/.test(document.getElementById('hsItems').textContent));
 assert.equal((await cards(page))[0].name,'كونكور ٥ مجم ٣٠ قرص');
 // the server function for the item, and the approved name for the shortages and the messages
 const w=await page.evaluate(()=>window.__fakeWrites.filter(x=>x.rpc||/ar_names/.test(JSON.stringify(x))));
 assert.ok(w.some(x=>x.rpc==='ar_store_owner_set_arabic'&&x.args.p_id===301&&x.args.p_arabic==='كونكور ٥ مجم ٣٠ قرص'));
 const names=await page.evaluate(()=>window.__tables.ar_names);
 assert.ok(names.some(n=>n.name_key==='CONCOR 5MG 30TAB'&&n.arabic_name==='كونكور ٥ مجم ٣٠ قرص'&&n.status==='approved'));
 // the new name is searchable at once
 await page.fill('#hsQ','كونكور ٥ مجم');
 await page.waitForFunction(()=>/كونكور ٥ مجم ٣٠ قرص/.test(document.getElementById('hsItems').textContent));
 // a name too short is refused with a clear note
 await page.click('#hsItems [data-edit]');await page.fill('#hsAr','ك');await page.click('#hsItems [data-save]');
 await page.waitForFunction(()=>/ماتحفظش/.test(document.getElementById('hsItems').textContent));
},{home:true});
run('settings: 24 colors, any color, the night look, kept after a reload',async({page})=>{
 await page.click('#settingsBtn');assert.ok(await page.isVisible('#settingsPanel'));
 assert.equal(await page.$$eval('#accentPick [data-accent]',b=>b.length),24);
 await page.click('[data-accent="blue"]');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--crimson').trim()),'#1d4f91');
 // any color: a very light one is darkened so white text on it stays readable
 await page.$eval('#accentCustom',e=>{e.value='#ffd54f';e.dispatchEvent(new Event('change',{bubbles:true}))});
 const main=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--crimson').trim());
 assert.ok(await page.evaluate(m=>window.AskerSettings.contrast(m,'#ffffff')>=4.5,main),'white on '+main+' is readable');
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.accent),'custom');
 // the night look with any color
 await page.check('#nightMode');
 assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('night')));
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(20, 18, 23)');
 await page.click('#settingsClose');assert.ok(!(await page.isVisible('#settingsPanel')));
 await page.reload();await ready(page);
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.accent),'custom','the color stays after a reload');
 assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('night')),'and the night look');
 await page.click('#settingsBtn');await page.uncheck('#nightMode');assert.ok(!(await page.evaluate(()=>document.documentElement.classList.contains('night'))));
 await page.keyboard.press('Escape');assert.ok(!(await page.isVisible('#settingsPanel')));
},{home:true});
