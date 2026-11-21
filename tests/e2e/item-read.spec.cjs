// «📷 صوّر المادة الفعالة من العلبة» in the item sheet (owner 2026-11-21): the box photo goes to the server as a request (ar_item_reads); the laptop's Claude reads what is PRINTED and answers
// (English and Arabic, translated both ways); the sheet fills the two fields and he checks and saves. The laptop is played here by the test (it changes the request's row).
const {run,assert}=require('./harness.cjs');
const ready=(page)=>page.waitForFunction(()=>/\d/.test(document.getElementById('shStats')?.textContent||''));
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'); // a 1x1 picture
const seed=(page)=>page.evaluate(()=>{
 const T={};
 T.ar_store_items=[{id:101,name:'CATAFLAM 50MG 20 TAB',arabic_name:'كتافلام ٥٠ مجم',price:85,status:'available',is_listed:true,hidden:false}];
 T.ar_stock=[];T.ar_supplier_items=[];T.ar_names=[];T.ar_orders=[];T.ar_item_buys=[];T.ar_store_edits=[];T.ar_item_reads=[];
 localStorage.setItem('__fakeTables',JSON.stringify(T));
});
const openPanel=async(page)=>{
 await page.fill('#hsQ','كتافلام');await page.waitForFunction(()=>/كتافلام/.test(document.getElementById('hsItems').textContent));
 await page.click('#hsItems .hs-item .im-th');await page.waitForSelector('#imSheet:not([hidden]) #imEditBtn');
 await page.click('#imEditBtn');await page.waitForSelector('#imActFile',{state:'attached'});
};
const ask=async(page)=>{
 await page.setInputFiles('#imActFile',{name:'box.png',mimeType:'image/png',buffer:PNG});
 await page.waitForFunction(()=>window.__fakeWrites.some(w=>w.table==='ar_item_reads'&&w.k==='insert'),null,{timeout:15000});
};
const laptop=(page,patch)=>page.evaluate(p=>{Object.assign(window.__tables.ar_item_reads[0],p)},patch); // the laptop answers: it changes the row
const text=(page,sel)=>page.textContent(sel).then(t=>t.replace(/\s+/g,' ').trim());
run('active ingredient by photo: asked, read, the two fields filled, he checks and saves once; the request is marked applied',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 await page.evaluate(()=>{window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{ar_is_staff:()=>true});window.__imPollMs=50;});
 await openPanel(page);
 assert.equal(await page.$eval('#imActFile',e=>e.accept+'|'+e.getAttribute('capture')),'image/*|environment','the phone\'s camera opens');
 await ask(page);
 // the request: the item, its PharmaFly name (to know which product), the photo as base64 text; waiting for the laptop
 const w=await page.evaluate(()=>window.__fakeWrites.find(x=>x.table==='ar_item_reads'&&x.k==='insert').v[0]);
 assert.deepEqual([w.item_id,w.item_name,w.status||'pending',typeof w.img_b64,/^[A-Za-z0-9+/=]+$/.test(w.img_b64)],[101,'CATAFLAM 50MG 20 TAB','pending','string',true]);
 await page.waitForFunction(()=>/بيتقرا…/.test(document.getElementById('imRead').textContent));
 assert.equal(await page.$eval('#imActAr',e=>e.value),'','nothing is filled before the answer');
 // the laptop reads it
 await laptop(page,{status:'reading'});await laptop(page,{status:'done',result:{found:true,en:'Diclofenac potassium 50 mg',ar:'ديكلوفيناك بوتاسيوم ٥٠ مجم',printed:'en',confidence:'high',note:''}});
 await page.waitForSelector('#imRead .im-read.ok');
 assert.match(await text(page,'#imRead'),/اتقرا من الصورة.*مكتوب بالإنجليزي على العلبة.*راجعه وصحّحه.*مفيش حاجة اتغيّرت/);
 assert.equal(await page.$eval('#imActAr',e=>e.value),'ديكلوفيناك بوتاسيوم ٥٠ مجم');assert.equal(await page.$eval('#imActEn',e=>e.value),'Diclofenac potassium 50 mg');
 assert.ok(await page.$eval('#imActAr',e=>e.classList.contains('im-fresh')),'the filled fields are marked');
 assert.equal(await page.evaluate(()=>window.__fakeWrites.filter(x=>/ar_store_edits/.test(JSON.stringify(x))).length),0,'nothing is saved before he saves');
 // he corrects one letter and saves: one write of the active ingredient, the request is marked «applied», and the fields keep what he saved
 await page.fill('#imActEn','Diclofenac potassium 50mg');
 await page.click('#imSaveAll');await page.waitForFunction(()=>/اتحفظ ✔/.test(document.getElementById('imNote').textContent));
 const ed=await page.evaluate(()=>window.__fakeWrites.find(x=>x.table==='ar_store_edits'&&x.k==='upsert').v[0]);
 assert.deepEqual([ed.item_id,ed.active_ar,ed.active_en],[101,'ديكلوفيناك بوتاسيوم ٥٠ مجم','Diclofenac potassium 50mg']);
 await page.waitForFunction(()=>window.__tables.ar_item_reads[0].status==='applied');
 assert.equal(await page.$eval('#imActEn',e=>e.value),'Diclofenac potassium 50mg','the saved text stays (the reading is not filled in again)');
 assert.equal(await page.$eval('#imRead',e=>e.innerHTML.trim()),'','the reading is used up');
 assert.match(await page.textContent('#imBody .im-act'),/ديكلوفيناك بوتاسيوم ٥٠ مجم/);
},{home:true});
run('active ingredient by photo: not printed / could not read / failed say so and fill nothing; a slow laptop is told; a closed sheet finds the answer when it is opened again',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 await page.evaluate(()=>{window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{ar_is_staff:()=>true});window.__imPollMs=50;window.__imLateMs=400;});
 await openPanel(page);await ask(page);
 // the laptop is slow: after a while the sheet says it may be off, and keeps waiting
 await page.waitForFunction(()=>/اللاب يمكن مش شغال دلوقتي/.test(document.getElementById('imRead').textContent),null,{timeout:10000});
 // he closes the sheet; the laptop answers «not printed»; he opens the item again: the answer is there (nothing filled)
 await page.click('#imSheet .im-x');
 await laptop(page,{status:'done',result:{found:false,en:'',ar:'',printed:'none',confidence:'high',note:'الصورة مكتوب فيها اسم المنتج بس.'}});
 await page.click('#hsItems .hs-item .im-th');await page.waitForSelector('#imSheet:not([hidden]) #imEditBtn');await page.click('#imEditBtn');
 await page.waitForSelector('#imRead .im-read.bad');
 assert.match(await text(page,'#imRead'),/مقدرتش أقرا المادة الفعالة من الصورة.*مش بيخمّن من اسم الدوا.*الصورة مكتوب فيها اسم المنتج بس/);
 assert.equal(await page.$eval('#imActAr',e=>e.value)+await page.$eval('#imActEn',e=>e.value),'');
 // a new photo, and the laptop fails on it
 await page.evaluate(()=>{window.__tables.ar_item_reads.length=0;});
 await ask(page);
 await page.waitForFunction(()=>window.__tables.ar_item_reads.length>0);
 await laptop(page,{status:'failed',error:'timeout'});
 await page.waitForSelector('#imRead .im-read.bad');assert.match(await text(page,'#imRead'),/القراية فشلت.*جرّب تصوّر تاني.*timeout/);
 // a reading still waiting when the sheet is opened again keeps waiting (and is answered later)
 await page.evaluate(()=>{window.__tables.ar_item_reads.length=0;window.__tables.ar_item_reads.push({id:'idz',item_id:101,status:'reading',created_at:new Date().toISOString(),result:null,error:null});});
 await page.click('#imSheet .im-x');
 await page.click('#hsItems .hs-item .im-th');await page.waitForSelector('#imSheet:not([hidden]) #imEditBtn');await page.click('#imEditBtn');
 await page.waitForFunction(()=>/بيتقرا…/.test(document.getElementById('imRead').textContent));
 await page.evaluate(()=>{Object.assign(window.__tables.ar_item_reads[0],{status:'done',result:{found:true,en:'Paracetamol 500 mg',ar:'باراسيتامول ٥٠٠ مجم',printed:'both',confidence:'medium',note:''}})});
 await page.waitForSelector('#imRead .im-read.ok');
 assert.match(await text(page,'#imRead'),/مكتوب بالعربي والإنجليزي على العلبة.*مش متأكد 100%/);
 assert.equal(await page.$eval('#imActAr',e=>e.value),'باراسيتامول ٥٠٠ مجم');
 // a reading older than a day, or already applied, is not shown again; a file that is not a picture is refused before anything is sent
 await page.evaluate(()=>{window.__tables.ar_item_reads.length=0;window.__tables.ar_item_reads.push({id:'idy',item_id:101,status:'done',created_at:new Date(Date.now()-3*864e5).toISOString(),result:{found:true,en:'Old',ar:'قديم'},error:null});});
 await page.click('#imSheet .im-x');await page.click('#hsItems .hs-item .im-th');await page.waitForSelector('#imSheet:not([hidden]) #imEditBtn');await page.click('#imEditBtn');
 await page.waitForSelector('#imActFile',{state:'attached'});await page.waitForTimeout(400);
 assert.equal(await page.$eval('#imRead',e=>e.innerHTML.trim()),'','a reading from three days ago is not shown');
 const before=await page.evaluate(()=>window.__fakeWrites.filter(w=>w.table==='ar_item_reads'&&w.k==='insert').length);
 await page.setInputFiles('#imActFile',{name:'x.txt',mimeType:'text/plain',buffer:Buffer.from('not a picture')});
 await page.waitForFunction(()=>/الملف ده مش صورة/.test(document.getElementById('imRead').textContent));
 assert.equal(await page.evaluate(()=>window.__fakeWrites.filter(w=>w.table==='ar_item_reads'&&w.k==='insert').length),before,'nothing was sent');
},{home:true});
