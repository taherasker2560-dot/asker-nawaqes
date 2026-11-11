// «الرئيسية» (owner 2026-11-12): one search box, one card per item, putting together the stock, the shortage list, today's
// «اتطلب» and the warehouses' lists. Lines not surely one of our items are shown apart. Nothing is written.
const {run,assert}=require('./harness.cjs');
const cards=(page)=>page.$$eval('#hsItems .hs-item',e=>e.map(x=>({name:x.querySelector('strong').textContent.trim(),tags:[...x.querySelectorAll('.tag')].map(t=>t.textContent.trim()),offers:(x.querySelector('.hs-offers')||{}).textContent||''})));
run('home: one card per item with its marks and who sells it',async({page})=>{
 await page.evaluate(()=>{
  const T={};
  T.ar_stock=[
   {item_id:101,name:'BRUFEN 400MG 30TAB',arabic_name:'بروفين ٤٠٠ مجم',price:52,packs:3,units:0,parts:3,exp_near:'2027-05-31',other:null,data_at:'2026-11-12 10:45:00'},
   {item_id:102,name:'PANADOL EXTRA 24TAB',arabic_name:'بانادول اكسترا',price:60,packs:5,units:0,parts:2,exp_near:'2027-01-31',other:null,data_at:'2026-11-12 10:45:00'},
  ];
  T.ar_supplier_items=[
   {id:1,supplier:'AMG',list_date:'2026-11-10',supplier_name:'فلاجيل شراب',name_norm:'x',price:30,discount_pct:22,item_id:201,pharmafly_name:'FLAGYL 125MG SYP',review:'accepted',match_status:'strong'},
   {id:2,supplier:'REDA',list_date:'2026-11-11',supplier_name:'فلاجيل ١٢٥',name_norm:'y',price:30,discount_pct:18,item_id:201,pharmafly_name:'FLAGYL 125MG SYP',review:'accepted',match_status:'strong'},
   {id:3,supplier:'AMG',list_date:'2026-11-09',supplier_name:'فلاجيل قديم',name_norm:'z',price:30,discount_pct:25,item_id:201,pharmafly_name:'FLAGYL 125MG SYP',review:'accepted',match_status:'strong'},
   {id:4,supplier:'ELFT',list_date:'2026-11-11',supplier_name:'بروفين ٤٠٠ قرص',name_norm:'w',price:52,discount_pct:15,item_id:101,pharmafly_name:'BRUFEN 400MG 30TAB',review:'accepted',match_status:'strong'},
   {id:5,supplier:'ELFT',list_date:'2026-11-11',supplier_name:'فلاجيل جديد مش عندنا',name_norm:'v',price:40,discount_pct:10,item_id:null,pharmafly_name:null,review:'pending',match_status:'none'},
  ];
  T.ar_names=[{name_key:'FLAGYL 125MG SYP',english_name:'FLAGYL 125MG SYP',arabic_name:'فلاجيل ١٢٥ شراب',status:'approved'}];
  T.ar_orders=[{id:'o1',name_key:'FLAGYL 125MG SYP',product_name:'FLAGYL 125MG SYP',supplier:'AMG',ordered_at:new Date().toISOString()}];
  localStorage.setItem('__fakeTables',JSON.stringify(T));
 });
 // reload so the names and today's orders are read with the new rows
 await page.reload();await page.waitForFunction(()=>/\d/.test(document.getElementById('shStats')?.textContent||''));
 assert.ok(await page.isVisible('#homePanel'),'the bot opens on «الرئيسية»');
 // in stock: the quantity, and who sells it
 await page.fill('#hsQ','بروفين');
 await page.waitForFunction(()=>document.querySelectorAll('#hsItems .hs-item').length>0);
 let c=await cards(page);
 assert.equal(c[0].name,'بروفين ٤٠٠ مجم');assert.deepEqual(c[0].tags,['3 علب','ناقص']);assert.match(c[0].offers,/ELFT 15%/);
 // not in stock, on the shortage list, ordered today; best offer per warehouse = its newest list
 await page.fill('#hsQ','FLAGYL');
 await page.waitForFunction(()=>/فلاجيل ١٢٥ شراب/.test(document.getElementById('hsItems').textContent)&&/عند/.test(document.getElementById('hsItems').textContent));
 c=await cards(page);
 assert.equal(c[0].name,'فلاجيل ١٢٥ شراب');assert.deepEqual(c[0].tags,['ملوش رصيد','ناقص','اتطلب النهارده']);
 assert.equal(c[0].offers.trim(),'عند: AMG 22% · REDA 18%','AMG from its newest list (22%, not the older 25%)');
 // a warehouse line that is not one of our items is apart
 await page.fill('#hsQ','فلاجيل');
 await page.waitForFunction(()=>!document.getElementById('hsLinesBox').classList.contains('hidden'));
 assert.match(await page.textContent('#hsLines'),/فلاجيل جديد مش عندنا/);
 // a shortage that is nowhere else still shows (from the list itself)
 await page.fill('#hsQ','JANUVIA');
 await page.waitForFunction(()=>/JANUVIA/.test(document.getElementById('hsItems').textContent));
 c=await cards(page);assert.deepEqual(c[0].tags,['ملوش رصيد','ناقص']);
 // clearing the box
 await page.click('#hsClear');assert.equal(await page.$eval('#hsQ',e=>e.value),'');assert.equal(await page.$$eval('#hsItems .hs-item',e=>e.length),0);
 // nothing was written
 assert.deepEqual(await page.evaluate(()=>window.__fakeWrites.filter(w=>/ar_stock|ar_supplier_items|ar_orders|ar_names/.test(JSON.stringify(w)))),[]);
},{home:true});
run('settings: 8 colors, kept on the phone after a reload',async({page})=>{
 await page.click('#settingsBtn');assert.ok(await page.isVisible('#settingsPanel'));
 assert.equal(await page.$$eval('#accentPick [data-accent]',b=>b.length),8);
 await page.click('[data-accent="blue"]');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--crimson').trim()),'#1d4f91');
 await page.click('#settingsClose');assert.ok(!(await page.isVisible('#settingsPanel')));
 await page.reload();await page.waitForFunction(()=>/\d/.test(document.getElementById('shStats')?.textContent||''));
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.accent),'blue','the color stays after a reload');
 await page.click('#settingsBtn');await page.click('[data-accent="night"]');
 assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('night')),'«ليلي» turns the page dark');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(20, 18, 23)');
 await page.keyboard.press('Escape');assert.ok(!(await page.isVisible('#settingsPanel')));
},{home:true});
