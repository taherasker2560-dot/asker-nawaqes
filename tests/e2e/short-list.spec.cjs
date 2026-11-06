// «النواقص»: one row per item (Arabic name, English under it, the quantity), search that ignores alef / yaa / digit
// spelling, four views (alphabetical, most needed, ordered today, no Arabic name), the upload tucked under «أدوات».
// Read-only: nothing is written while looking at the list.
const {run,text,assert}=require('./harness.cjs');
const NAMES=[{name_key:'BRUFEN 400MG 30TAB',english_name:'BRUFEN 400MG 30TAB',arabic_name:'بروفين ٤٠٠ مجم ٣٠ قرص',status:'approved'},
 {name_key:'FLAGYL 125MG SYP',english_name:'FLAGYL 125MG SYP',arabic_name:'أمبيسلين ٥٠٠ شراب',status:'approved'},
 {name_key:'JANUVIA 50MG 28TAB',english_name:'JANUVIA 50MG 28TAB',arabic_name:'جانوفيا ٥٠ مجم ٢٨ قرص',status:'approved'}];
const QTY={s1:{suggested_qty:9},s2:{suggested_qty:4,order_qty:20},s3:{suggested_qty:12}};
const ready=p=>p.waitForFunction(()=>/\d/.test(document.getElementById('shStats')?.textContent||''));
const rows=page=>page.$$eval('#shList .srow',r=>r.map(x=>({ar:x.querySelector('.sr-ar').textContent.replace(/\s+/g,' ').trim(),en:x.querySelector('.sr-en')?.textContent.trim()||'',qty:x.querySelector('.qty')?.textContent.trim()||'',own:!!x.querySelector('.qty.own')})));
const letters=page=>page.$$eval('#shList .sr-letter',l=>l.map(x=>x.textContent.trim()));
const chips=page=>page.$$eval('#shChips .chip',c=>c.map(x=>({v:x.dataset.view,on:x.classList.contains('on'),t:x.textContent.trim()})));

run('shortage list rows',async({page})=>{
 // 0) no Arabic names yet: every row says so, and there is a chip for them
 assert.deepEqual((await chips(page)).map(c=>c.v),['alpha','qty','ordered','noar']);
 assert.match((await chips(page))[3].t,/من غير اسم عربي 3/);
 assert.match(await page.textContent('#shList'),/لسه ماتترجمش/);

 // with names and quantities
 await page.evaluate(([n,q])=>{localStorage.setItem('__fakeArNames',JSON.stringify(n));localStorage.setItem('__fakeQty',JSON.stringify(q))},[NAMES,QTY]);
 await page.reload();await ready(page);
 assert.deepEqual((await chips(page)).map(c=>c.v),['alpha','qty','ordered'],'no «no Arabic name» chip when all are translated');
 assert.deepEqual(await page.$$eval('#shStats .stat strong',e=>e.map(x=>x.textContent.trim())),['3','0','1'],'items / ordered today / typed quantities');

 // 1) alphabetical with letters; Arabic first, English under it, quantity badge, the owner's own quantity marked
 assert.deepEqual(await letters(page),['ا','ب','ج'],'أمبيسلين is filed under ا');
 const r=await rows(page);
 assert.deepEqual(r.map(x=>x.ar),['أمبيسلين ٥٠٠ شراب','بروفين ٤٠٠ مجم ٣٠ قرص','جانوفيا ٥٠ مجم ٢٨ قرص']);
 assert.equal(r[0].en,'FLAGYL 125MG SYP');
 assert.deepEqual(r.map(x=>x.qty),['20','9','12'],'the quantity he typed wins over the laptop\'s');
 assert.deepEqual(r.map(x=>x.own),[true,false,false]);

 // 2) search: other spellings of alef, western digits, English, several words
 const search=async q=>{await page.fill('#shSearch',q);return (await rows(page)).map(x=>x.ar)};
 assert.deepEqual(await search('امبيسلين'),['أمبيسلين ٥٠٠ شراب'],'ا finds أ');
 assert.deepEqual(await search('بروفين 400'),['بروفين ٤٠٠ مجم ٣٠ قرص'],'western digits find Arabic digits');
 assert.deepEqual(await search('janu 50'),['جانوفيا ٥٠ مجم ٢٨ قرص'],'English, several words');
 assert.deepEqual(await search('zzz'),[]);
 assert.match(await text(page,'#shList'),/مفيش صنف بالشكل ده/);
 assert.equal(await text(page,'#shCount'),'عرض 0 من 3');
 assert.ok(await page.isVisible('#shClear'),'clear button while something is typed');
 await page.click('#shClear');assert.equal(await page.inputValue('#shSearch'),'');assert.ok(!(await page.isVisible('#shClear')));assert.equal((await rows(page)).length,3,'clearing shows everything');
 assert.deepEqual(await search(''),r.map(x=>x.ar));
 assert.ok(await page.$eval('#shCount',e=>e.classList.contains('hidden')),'no count line when nothing is filtered');

 // 3) most needed first: no letters
 await page.click('[data-view="qty"]');
 assert.deepEqual((await rows(page)).map(x=>x.qty),['20','12','9']);
 assert.deepEqual(await letters(page),[]);
 assert.deepEqual((await chips(page)).map(c=>c.on),[false,true,false]);

 // 4) ordered today: the mark and the filter follow the orders
 await page.click('[data-view="ordered"]');assert.match(await text(page,'#shList'),/مفيش صنف بالشكل ده/);
 await page.evaluate(()=>{window.__tables.ar_orders.push({id:'o1',name_key:'JANUVIA 50MG 28TAB',product_name:'JANUVIA 50MG 28TAB',supplier:'الفتح',ordered_at:new Date().toISOString()});document.dispatchEvent(new Event('visibilitychange'))});
 await page.waitForFunction(()=>document.querySelectorAll('#shList .srow').length===1);
 assert.match((await rows(page))[0].ar,/جانوفيا .*اتطلب من الفتح/);
 assert.equal(await page.$eval('#shStats .stat:nth-child(2) strong',e=>e.textContent.trim()),'1');
 await page.click('[data-view="alpha"]');
 assert.match(await text(page,'#shList'),/اتطلب من الفتح/,'the mark shows in the alphabetical view too');

 // 5) the upload is tucked away, with the warning
 assert.ok(!(await page.isVisible('#shxFile')),'upload hidden at first');
 assert.ok(!(await page.$eval('#shTools',e=>e.open)));
 await page.click('#shTools summary');
 assert.ok(await page.isVisible('#shxFile'));
 assert.match(await text(page,'.tools-warn'),/اللاب بيبعت قايمة النواقص لوحده/);

 // 6) the list is looked at only: nothing written; fits the phone; letters stick under the app bar
 assert.deepEqual(await page.evaluate(()=>window.__fakeWrites),[],'no writes');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the screen');
 assert.ok(parseInt(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--sticky-top')))>=40);
 // other tabs: names changed there show when coming back
 await page.click('[data-tab="translate"]');await page.click('[data-tab="short"]');
 assert.equal((await rows(page)).length,3);
});
