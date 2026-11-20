// «تعديل الصنف» (owner 2026-11-21): the item sheet (a tap on the photo in the search) holds the Arabic name, the photo, the active ingredient (Arabic / English) and the description,
// with ONE «احفظ»; only what changed is written; the active ingredient shows under the name on the search card (and in English when the page is English).
const {run,assert}=require('./harness.cjs');
const ready=(page)=>page.waitForFunction(()=>/\d/.test(document.getElementById('shStats')?.textContent||''));
const seed=(page)=>page.evaluate(()=>{
 const T={};
 T.ar_store_items=[
  {id:101,name:'CATAFLAM 50MG 20 TAB',arabic_name:'كتافلام ٥٠ مجم',price:85,status:'available',is_listed:true,hidden:false},
  {id:102,name:'VOLTAREN 50MG 20 TAB',arabic_name:null,price:60,status:'on_order',is_listed:true,hidden:false},
 ];
 T.ar_stock=[{item_id:101,name:'CATAFLAM 50MG 20 TAB',arabic_name:'كتافلام ٥٠ مجم',price:85,packs:3,units:0,parts:1,exp_near:'2028-08-31',other:null,data_at:'2026-11-21 10:00:00'}];
 T.ar_supplier_items=[];T.ar_names=[];T.ar_orders=[];T.ar_item_buys=[];
 T.ar_store_edits=[{item_id:101,img:null,img_off:false,descr:null,desc_off:false,active_ar:'ديكلوفيناك بوتاسيوم ٥٠ مجم',active_en:'Diclofenac potassium 50 mg'}];
 localStorage.setItem('__fakeTables',JSON.stringify(T));
});
const first=(page)=>page.$eval('#hsItems .hs-item',e=>({name:e.querySelector('strong').textContent.trim(),act:(e.querySelector('.hs-act')||{}).textContent||''}));
run('item sheet: name + photo + active ingredient + description in one place, one «احفظ», only what changed is written',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 await page.evaluate(()=>{window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{ar_staff_can:()=>true});}); // the sheet is for the owner / «storeorders» staff
 // the search card: the active ingredient he wrote shows under the name; an item with none shows nothing
 await page.fill('#hsQ','كتافلام');
 await page.waitForFunction(()=>/💊 ديكلوفيناك بوتاسيوم ٥٠ مجم/.test(document.getElementById('hsItems').textContent),null,{timeout:15000});
 assert.equal((await first(page)).act.trim(),'💊 ديكلوفيناك بوتاسيوم ٥٠ مجم');
 await page.fill('#hsQ','VOLTAREN');await page.waitForFunction(()=>/VOLTAREN/.test(document.getElementById('hsItems').textContent));
 assert.equal((await first(page)).act,'','no active ingredient written: no line');
 // the sheet from the photo
 await page.fill('#hsQ','كتافلام');await page.waitForFunction(()=>/كتافلام/.test(document.getElementById('hsItems').textContent));
 await page.click('#hsItems .hs-item .im-th');
 await page.waitForSelector('#imSheet:not([hidden]) #imEditBtn');
 assert.match(await page.textContent('#imBody .im-act'),/المادة الفعالة: ديكلوفيناك بوتاسيوم ٥٠ مجم/);
 assert.match(await page.textContent('#imEditBtn'),/تعديل الصنف/);
 await page.click('#imEditBtn');await page.waitForSelector('#imName');
 assert.equal(await page.$eval('#imName',e=>e.value),'كتافلام ٥٠ مجم');
 assert.equal(await page.$eval('#imActAr',e=>e.value),'ديكلوفيناك بوتاسيوم ٥٠ مجم');assert.equal(await page.$eval('#imActEn',e=>e.value),'Diclofenac potassium 50 mg');
 assert.equal(await page.$eval('#imEdit .im-in.ro',e=>e.value+'|'+e.readOnly),'CATAFLAM 50MG 20 TAB|true','PharmaFly\'s name is read only');
 // nothing changed: nothing written
 await page.click('#imSaveAll');await page.waitForFunction(()=>/مفيش تغيير/.test(document.getElementById('imNote').textContent));
 assert.deepEqual(await page.evaluate(()=>window.__fakeWrites.filter(w=>w.rpc==='ar_store_owner_set_arabic'||/ar_names|ar_store_edits/.test(JSON.stringify(w)))),[],'no change, no write');
 // a name too short is refused
 await page.fill('#imName','ك');await page.click('#imSaveAll');await page.waitForFunction(()=>/الاسم قصير قوي/.test(document.getElementById('imNote').textContent));
 assert.equal(await page.evaluate(()=>window.__fakeWrites.filter(w=>w.rpc==='ar_store_owner_set_arabic').length),0);
 // the name and the active ingredient changed: ONE save writes both (the description was not touched: it is not written)
 await page.fill('#imName','كتافلام ٥٠ مجم أقراص');await page.fill('#imActAr','ديكلوفيناك البوتاسيوم ٥٠ مجم');await page.fill('#imActEn','Diclofenac potassium 50mg');
 await page.click('#imSaveAll');await page.waitForFunction(()=>/اتحفظ ✔/.test(document.getElementById('imNote').textContent));
 const w=await page.evaluate(()=>window.__fakeWrites.filter(x=>x.rpc==='ar_store_owner_set_arabic'||/ar_names|ar_store_edits/.test(JSON.stringify(x))));
 const nameRpc=w.find(x=>x.rpc==='ar_store_owner_set_arabic');assert.deepEqual([nameRpc.args.p_id,nameRpc.args.p_arabic],[101,'كتافلام ٥٠ مجم أقراص']);
 assert.ok(w.some(x=>x.table==='ar_names'&&x.v[0].arabic_name==='كتافلام ٥٠ مجم أقراص'&&x.v[0].status==='approved'&&x.v[0].name_key==='CATAFLAM 50MG 20 TAB'),'the approved name for the shortages and the messages');
 const ed=w.find(x=>x.table==='ar_store_edits'&&x.k==='upsert').v[0];
 assert.deepEqual([ed.item_id,ed.active_ar,ed.active_en,ed.descr,ed.desc_off],[101,'ديكلوفيناك البوتاسيوم ٥٠ مجم','Diclofenac potassium 50mg',null,false],'the active ingredient is written; the description stays his / the site\'s own');
 assert.equal(w.filter(x=>x.table==='ar_store_edits').length,1,'one write for the sheet');
 // the sheet and the card on screen follow at once
 assert.match(await page.textContent('#imBody .im-title'),/كتافلام ٥٠ مجم أقراص/);assert.match(await page.textContent('#imBody .im-act'),/ديكلوفيناك البوتاسيوم ٥٠ مجم/);
 await page.click('#imSheet .im-x');
 await page.waitForFunction(()=>/كتافلام ٥٠ مجم أقراص/.test(document.querySelector('#hsItems .hs-item strong')?.textContent||'')&&/ديكلوفيناك البوتاسيوم/.test(document.getElementById('hsItems').textContent));
 // an item with no Arabic name and no row yet: the name field is empty, only the English active ingredient is written, the card shows it in Arabic too (the other language when only one is written)
 await page.fill('#hsQ','VOLTAREN');await page.waitForFunction(()=>/VOLTAREN/.test(document.getElementById('hsItems').textContent));
 await page.click('#hsItems .hs-item .im-th');await page.waitForSelector('#imSheet:not([hidden]) #imEditBtn');
 await page.click('#imEditBtn');await page.waitForSelector('#imName');
 assert.equal(await page.$eval('#imName',e=>e.value),'','no Arabic name yet: the English name is not put in the Arabic field');
 await page.fill('#imActEn','Diclofenac diethylamine');await page.click('#imSaveAll');await page.waitForFunction(()=>/اتحفظ ✔/.test(document.getElementById('imNote').textContent));
 assert.equal(await page.evaluate(()=>window.__fakeWrites.filter(x=>x.rpc==='ar_store_owner_set_arabic').length),1,'the name was not touched for this item');
 await page.click('#imSheet .im-x');
 await page.waitForFunction(()=>/💊 Diclofenac diethylamine/.test(document.getElementById('hsItems').textContent));
},{home:true});
run('item sheet: the English page shows the English active ingredient (and the other one when only that is written)',async({page})=>{
 await seed(page);await page.evaluate(()=>localStorage.setItem('asker-lang','en'));await page.reload();await ready(page);
 await page.fill('#hsQ','CATAFLAM');
 await page.waitForFunction(()=>/💊 Diclofenac potassium 50 mg/.test(document.getElementById('hsItems').textContent),null,{timeout:15000});
 await page.click('#hsItems .hs-item .im-th');await page.waitForSelector('#imSheet:not([hidden]) .im-act');
 assert.match(await page.textContent('#imBody .im-act'),/Active ingredient: Diclofenac potassium 50 mg/);
},{home:true});
