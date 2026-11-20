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
// owner 2026-11-12: four buttons under the box: الكل / المخزون / القوايم / النواقص
run('search on top: الكل / المخزون / القوايم / النواقص',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 const names=()=>page.$$eval('#hsItems .hs-item strong',x=>x.map(e=>e.textContent.trim()));
 const find=async(q,re)=>{await page.fill('#hsQ',q);await page.waitForFunction(src=>new RegExp(src).test(document.getElementById('hsStatus').textContent+document.getElementById('hsItems').textContent),re.source);};
 assert.deepEqual(await page.$$eval('#hsScope [data-scope]',b=>b.map(x=>x.textContent.trim())),['الكل','المخزون','الملغى','القوايم','النواقص']);
 assert.equal(await page.$eval('#hsScope .on',b=>b.dataset.scope),'all','starts on «الكل»');
 // المخزون: only what has stock now (Brufen 3 packs), Flagyl (no stock) is not there
 await page.click('[data-scope="stock"]');
 await find('بروفين',/بروفين ٤٠٠/);assert.match(await page.textContent('#hsStatus'),/في المخزون/);
 // owner 2026-11-13: «المخزون» = the pharmacy only: no warehouse line, no «آخر شرا»
 assert.equal(await page.$$eval('#hsItems .hs-offers, #hsItems .hs-buys, #hsItems .hs-offers-t',x=>x.length),0,'no warehouse on «المخزون»');
 await find('FLAGYL',/مفيش صنف بالاسم ده في المخزون/);assert.deepEqual(await names(),[]);
 // القوايم: only items in a warehouse's list, plus the lines that are not ours yet; owner 2026-11-13: the warehouses only,
 // one row each with the discount difference, no stock
 await page.click('[data-scope="lists"]');
 await find('FLAGYL',/فلاجيل ١٢٥ شراب/);
 const rows=await page.$$eval('#hsItems .hs-offers-t tr',t=>t.map(r=>({best:r.classList.contains('best'),text:r.textContent.replace(/\s+/g,' ').trim()})));
 assert.deepEqual(rows,[{best:true,text:'AMG ✓ الأعلى22%'},{best:false,text:'رضا عطية (أقل 4%)18%'}]);
 assert.equal(await page.$$eval('#hsItems .tag.good, #hsItems .tag.none, #hsItems .hs-offers',x=>x.length),0,'no stock on «القوايم»');
 // the public price shows on «القوايم» too (owner 2026-11-15: «انا ببحث اعرف سعره»)
 assert.match(await page.textContent('#hsItems'),/سعر الجمهور 30 ج/);
 assert.doesNotMatch(await page.textContent('#hsStatus'),/آخر مخزون/);
 await find('CONCOR',/مفيش صنف بالاسم ده في القوايم/);
 await page.fill('#hsQ','فلاجيل');await page.waitForFunction(()=>!document.getElementById('hsLinesBox').classList.contains('hidden'));
 // النواقص: only the shortage list (Brufen and Flagyl), not Concor
 await page.click('[data-scope="short"]');
 await find('CONCOR',/مفيش صنف بالاسم ده في النواقص/);
 await find('بروفين',/بروفين ٤٠٠/);assert.ok(await page.$eval('#hsLinesBox',b=>b.classList.contains('hidden')),'no list lines here');
 // الكل again: Concor is found
 await page.click('[data-scope="all"]');await find('CONCOR',/كونكور/);
 assert.equal(await page.$eval('#hsScope [aria-checked="true"]',b=>b.dataset.scope),'all');
},{home:true});
// owner 2026-11-13 «قوايم المخازن بتغيب على ما تحمّل»: the lists start loading by themselves when the bot opens, are kept
// on the phone (IndexedDB), and the next opening answers from the kept copy at once, even with the server slow or down
run('search on top: the lists kept on the phone, ready before the first search',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 await page.waitForFunction(()=>window.__reads.some(r=>r.table==='ar_supplier_items'),null,{timeout:15000});
 await page.waitForFunction(()=>window.AskerCache.get('sp-lines-v1').then(c=>!!(c&&c.rows&&c.rows.length===4)),null,{timeout:15000});
 await page.waitForFunction(()=>window.AskerCache.get('hs-catalog-v1').then(c=>!!(c&&c.rows&&c.rows.length===3)),null,{timeout:15000});
 assert.equal(await page.$eval('#hsQ',e=>e.value),'','no search was typed');
 // the next opening, the lists' server down: the kept copy answers
 await page.evaluate(()=>localStorage.setItem('__fakeFail','ar_supplier_items'));
 await page.reload();await ready(page);
 await page.fill('#hsQ','FLAGYL');
 await page.waitForFunction(()=>/في القوايم: AMG 22%/.test(document.getElementById('hsItems').textContent));
 assert.doesNotMatch(await page.textContent('#hsStatus'),/ماتحمّلتش/);
 // «خروج» takes the kept copy away
 await page.evaluate(()=>localStorage.removeItem('__fakeFail'));
 await page.evaluate(()=>window.AskerCache.clear());
 assert.equal(await page.evaluate(()=>window.AskerCache.get('sp-lines-v1')),null);
},{home:true});
// 2026-11-13: on his phone the kept copy never answered and the search said «بحمّل…» for a quarter of an hour: a phone
// storage that does not answer is skipped and the lists come from the server
run('search on top: a phone storage that never answers does not hold the search',async({page})=>{
 await seed(page);
 await page.addInitScript(()=>{window.indexedDB.open=()=>({});});
 await page.reload();await ready(page);
 await page.fill('#hsQ','FLAGYL');
 await page.waitForFunction(()=>/في القوايم: AMG 22%/.test(document.getElementById('hsItems').textContent),null,{timeout:12000});
 await page.waitForFunction(()=>!/بحمّل/.test(document.getElementById('hsStatus').textContent),null,{timeout:12000});
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
// owner 2026-11-20/21 «الملغى»: the laptop's lists (ملغى/لاغى in the name, the same name on cards with different prices, no movement for two years) leave «الكل» and the
// other buttons, live under «الملغى» (owner) with the reason and «ارجعه»; stock / the shortage list / a purchase after the cancel day keep or bring an item back
run('search on top: «الملغى» holds the cancelled items, «ارجعه» puts one back for good',async({page})=>{
 await seed(page);
 await page.evaluate(()=>{const T=JSON.parse(localStorage.getItem('__fakeTables'));
  T.ar_store_items.push({id:401,name:'ZETA 10MG 10TAB',arabic_name:'زيتا ١٠ مجم',price:20,status:'on_order',is_listed:true,hidden:false},
   {id:402,name:'OMEGA 20MG 10TAB',arabic_name:'اوميجا ٢٠ مجم',price:20,status:'on_order',is_listed:true,hidden:false},
   {id:403,name:'SIGMA 5MG 10TAB',arabic_name:'سيجما ٥ مجم',price:20,status:'on_order',is_listed:true,hidden:false});
  T.ar_item_buys.push({item_id:403,supplier:'AMG',last_date:'2026-11-01',discount_pct:10,bonus:0});
  // 301 CONCOR = «ملغى» in its name · 401 = the same name at a higher price (30) · 402 = no movement since 03/2021 · 403 = the same but bought in 11/2026 (back) ·
  // 101 BRUFEN has stock and 201 FLAGYL is on the shortage list: both are listed as cancelled but stay on screen with a mark
  T.ar_item_cancel_sets=[{kind:'word',ids:'301:20261120'},{kind:'dup',ids:'401:20261120:30,201:20261120:30'},{kind:'idle',ids:'402:202103,403:202103,101:202103'}];
  T.ar_item_cancel_restored=[];
  localStorage.setItem('__fakeTables',JSON.stringify(T));});
 await page.reload();await ready(page);
 const names=()=>page.$$eval('#hsItems .hs-item strong',x=>x.map(e=>e.textContent.trim()));
 const find=async(q,re)=>{await page.fill('#hsQ',q);await page.waitForFunction(src=>new RegExp(src).test(document.getElementById('hsStatus').textContent+document.getElementById('hsItems').textContent),re.source);};
 await page.waitForFunction(()=>window.__reads.some(r=>r.table==='ar_item_cancel_sets'),null,{timeout:15000});
 assert.ok(await page.isVisible('#hsScope [data-scope="cancelled"]'),'the owner has «الملغى»');
 // «الكل»: 301 is not there, with the owner told that «الملغى» has it
 await page.fill('#hsQ','CONCOR');
 await page.waitForFunction(()=>/وفيه 1 في «الملغى»/.test(document.getElementById('hsCx').textContent),null,{timeout:15000});
 assert.deepEqual(await names(),[],'a cancelled item is not in «الكل»');
 assert.match(await page.textContent('#hsCx'),/وفيه 1 في «الملغى» بالاسم ده/);
 // the same name with a higher price (401) is gone, 403 (bought after its last month) is back, 402 (idle) is gone
 await page.fill('#hsQ','زيتا');await page.waitForFunction(()=>/مفيش صنف/.test(document.getElementById('hsStatus').textContent));
 await find('سيجما',/سيجما ٥ مجم/);assert.deepEqual(await names(),['سيجما ٥ مجم'],'bought after its last movement: back for good');
 await page.fill('#hsQ','اوميجا');await page.waitForFunction(()=>/مفيش صنف/.test(document.getElementById('hsStatus').textContent));
 // stock and the shortage list keep an item on screen, with the mark
 await find('بروفين',/بروفين ٤٠٠/);let c=await cards(page);assert.deepEqual(c[0].tags,['3 علب','ناقص','🚫 ملغي']);
 await find('FLAGYL',/فلاجيل ١٢٥ شراب/);c=await cards(page);assert.ok(c[0].tags.includes('🚫 ملغي'),'on the shortage list: stays, marked');
 // the other buttons leave it out too
 await page.click('[data-scope="lists"]');await page.fill('#hsQ','CONCOR');await page.waitForFunction(()=>/مفيش صنف بالاسم ده في القوايم/.test(document.getElementById('hsStatus').textContent));
 // «الملغى»: the cancelled ones, each with its reason, and «ارجعه»
 await page.click('[data-scope="cancelled"]');
 await find('كونكور',/كونكور ٥ غلط/);
 assert.match(await page.textContent('#hsStatus'),/في الملغى/);
 c=await cards(page);assert.deepEqual(c[0].tags,['ملوش رصيد','مكتوب جنب اسمه «ملغى»']);
 await find('زيتا',/زيتا ١٠ مجم/);c=await cards(page);assert.ok(c[0].tags.includes('نفس الاسم بسعر أعلى: 30 ج'));
 await find('اوميجا',/اوميجا ٢٠ مجم/);c=await cards(page);assert.ok(c[0].tags.includes('مفيش حركة من سنتين · آخر حركة 03/2021'));
 await find('بروفين',/مفيش صنف بالاسم ده في الملغى/);assert.deepEqual(await names(),[],'an item with stock is not under «الملغى»');
 // «ارجعه»: one write, the item is back in «الكل» at once and stays back
 await find('كونكور',/كونكور ٥ غلط/);
 await page.click('#hsItems [data-restore]');
 await page.waitForFunction(()=>/رجع للبحث/.test(document.getElementById('hsStatus').textContent));
 assert.deepEqual(await names(),[],'it left «الملغى»');
 const w=await page.evaluate(()=>window.__fakeWrites.filter(x=>/ar_item_cancel/.test(JSON.stringify(x))));
 assert.equal(w.length,1);assert.equal(w[0].table,'ar_item_cancel_restored');assert.deepEqual(w[0].v.map(r=>r.item_id),[301]);
 await page.click('[data-scope="all"]');await find('CONCOR',/كونكور ٥ غلط/);
 assert.deepEqual((await cards(page))[0].tags,['ملوش رصيد']);
 // the server keeps the row (the fake keeps its tables in memory only: carry it over the reload): 301 is still back
 await page.evaluate(()=>{const T=JSON.parse(localStorage.getItem('__fakeTables'));T.ar_item_cancel_restored=window.__tables.ar_item_cancel_restored;localStorage.setItem('__fakeTables',JSON.stringify(T));});
 await page.reload();await ready(page);await page.fill('#hsQ','CONCOR');
 await page.waitForFunction(()=>/كونكور ٥ غلط/.test(document.getElementById('hsItems').textContent),null,{timeout:15000});
 // staff never see «الملغى»; a scope left on it goes back to «الكل»
 await page.evaluate(()=>{window.AskerStaff=Object.assign(window.AskerStaff||{},{isStaff:()=>true});});
 await page.fill('#hsQ','CONCOR');await page.fill('#hsQ','CONCOR ');
 await page.waitForFunction(()=>document.querySelector('#hsScope [data-scope="cancelled"]').classList.contains('hidden'));
 assert.equal(await page.evaluate(()=>window.__fakeWrites.filter(x=>/ar_item_cancel/.test(JSON.stringify(x))).length),0,'a reload wrote nothing');
},{home:true});
run('settings: 27 colors (the calm sky blue first and the default), any color, the night look, kept after a reload',async({page})=>{
 // a new phone opens on the calm sky blue (2026-11-19 night; the calm orange 11-17, the vivid orange 11-15, the blue of the round logo before)
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.accent),'calmsky');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--crimson').trim()),'#217bab');
 await page.click('#settingsBtn');assert.ok(await page.isVisible('#settingsPanel'));
 assert.equal(await page.$$eval('#accentPick [data-accent]',b=>b.length),27);
 assert.equal(await page.$eval('#accentPick [data-accent]',b=>b.dataset.accent),'calmsky');
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
 // the page goes dark (a dark breath of the chosen color)
 assert.ok(await page.evaluate(()=>{const m=getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);return m[0]<40&&m[1]<40&&m[2]<40;}),'dark page at night');
 await page.click('#settingsClose');assert.ok(!(await page.isVisible('#settingsPanel')));
 await page.reload();await ready(page);
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.accent),'custom','the color stays after a reload');
 assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('night')),'and the night look');
 await page.click('#settingsBtn');await page.uncheck('#nightMode');assert.ok(!(await page.evaluate(()=>document.documentElement.classList.contains('night'))));
 await page.keyboard.press('Escape');assert.ok(!(await page.isVisible('#settingsPanel')));
},{home:true});
