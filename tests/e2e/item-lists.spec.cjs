// The item's small photo in the other lists (owner 2026-11-21: «اي قايمة فيها اسم الصنف بتتعرض جوة السيستم يكون معروض فيها الصورة، ادوس عليها تفتح تعديل الاسم والصورة والمادة الفعالة»):
// the shortages carry only the PharmaFly NAME, so the item is the one with exactly that name (of two cards with one name, the one that is not cancelled); a name that matches
// no item has no photo; a tap on the photo opens the item sheet; the row is otherwise as it was. Made-up items only.
const {run,assert}=require('./harness.cjs');
const ready=p=>p.waitForFunction(()=>/\d/.test(document.getElementById('shStats')?.textContent||''));
const seed=(page)=>page.evaluate(()=>{
 const T={};
 T.ar_store_items=[
  {id:101,name:'BRUFEN 400MG 30TAB',arabic_name:'بروفين ٤٠٠ مجم',price:52,status:'available',is_listed:true,hidden:false},
  {id:201,name:'FLAGYL 125MG SYP',arabic_name:null,price:30,status:'on_order',is_listed:true,hidden:false},   // the old card: cancelled
  {id:202,name:'FLAGYL 125MG SYP',arabic_name:null,price:40,status:'on_order',is_listed:true,hidden:false},   // the card that stays
  {id:103,name:'JANUVIA 50MG 28TAB',arabic_name:null,price:300,status:'on_order',is_listed:true,hidden:false},
 ];
 T.ar_item_cancel_sets=[{kind:'word',ids:'201:20261120'}];T.ar_item_cancel_restored=[];
 // the shortage list: three names that are items of the system and one that is not
 const SH=[{id:'s1',product_name:'BRUFEN 400MG 30TAB'},{id:'s2',product_name:'FLAGYL 125MG SYP'},{id:'s3',product_name:'JANUVIA 50MG 28TAB'},{id:'s4',product_name:'UNKNOWN DRUG 10MG'}].map(x=>({...x,is_active:true}));
 T.shortage_items=SH;T.ar_shortages=SH.map(x=>({...x,name_key:x.product_name}));
 localStorage.setItem('__fakeTables',JSON.stringify(T));
});
const rows=(page)=>page.$$eval('#shList .srow',r=>r.map(x=>({im:(x.querySelector('.im-th')||{dataset:{}}).dataset.im||null,txt:x.querySelector('.sr-main').textContent.replace(/\s+/g,' ').trim()})));
run('shortages: the item\'s photo by the PharmaFly name (the live card of two with one name), none for an unknown name, a tap opens the item sheet',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 await page.waitForFunction(()=>document.querySelectorAll('#shList .srow .im-th').length>=3&&document.querySelectorAll('#shList .srow').length===4,null,{timeout:20000});
 let r=await rows(page);
 const imOf=(name)=>(r.find(x=>x.txt.includes(name))||{}).im;
 assert.equal(imOf('BRUFEN 400MG'),'101');assert.equal(imOf('JANUVIA'),'103');
 assert.equal(imOf('FLAGYL'),'202','two cards with one name: the one that is not cancelled');
 // a name that matches no item of the system: the row as it was, no photo
 r=await rows(page);
 assert.equal(r.find(x=>/UNKNOWN DRUG/.test(x.txt)).im,null,'no item has that name: no photo, no guess');
 assert.equal(r.filter(x=>x.im).length,3);
 // the quantity badge and the names are where they were; a tap on the photo opens the sheet
 assert.equal(await page.$$eval('#shList .srow > .im-lrow > .im-lmain > .sr-main',x=>x.length),3,'the row\'s own name block is inside the photo wrapper');
 await page.click('#shList .srow .im-th[data-im="101"]');
 await page.waitForSelector('#imSheet:not([hidden])');
 assert.match(await page.textContent('#imBody .im-title'),/بروفين ٤٠٠ مجم|BRUFEN 400MG 30TAB/);
 await page.click('#imSheet .im-x');
 // nothing was written by looking at the list
 assert.deepEqual(await page.evaluate(()=>window.__fakeWrites.filter(w=>w.rpc!=='ar_staff_can')),[],'no writes (the sheet only asks whether he may edit)');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the screen');
});
