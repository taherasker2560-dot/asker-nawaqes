// «صور الأصناف» in «مراجعة الفواتير» (owner 2026-11-27: «أي صنف ملوش صورة… أو صورته مش تمام أول ما يدخل مشتريات تطلب صورته» → «تطلبها في مراجعة المشتريات»): an invoice card asks for the
// photo of its items that have none; shows the internet ones side by side (a tap marks a wrong one), «تمام» keeps the rest for good; a photo a person took, one he removed or kept is never asked.
// The server and the photo function are played here. Made-up suppliers and items only: the repository is public.
const {run,assert}=require('./harness.cjs');
const flat=(x)=>{const w=document.createTreeWalker(x,NodeFilter.SHOW_TEXT),a=[];let n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\s+/g,' ').trim()};
const txt=(page,sel)=>page.$eval(sel,(x,f)=>new Function('x','return ('+f+')(x)')(x),flat.toString());
const all=(page,sel)=>page.$$eval(sel,(b,f)=>b.map(new Function('x','return ('+f+')(x)')),flat.toString());
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhWMjWwAAAABJRU5ErkJggg==','base64');
const seedAndReload=async(page)=>{
 await page.evaluate(()=>{
  localStorage.setItem('__fakeFail','ar_photo_wanted'); // before «صور مطلوبة» is on the server: the camera stays inside the card (with the list: tests/e2e/photo-list.spec.cjs)
  const lines=[101,102,103,104,105,106].map((id,i)=>({n:i+1,paper:'دوا مثال '+(i+1),qty:1,disc:20,exp:'082029',id,name:'EXAMPLE '+id+' TAB',total:10}));
  lines.push({n:7,paper:'صنف جديد مثال',qty:1,disc:20,exp:'082029',name:'NEW EXAMPLE',total:10},{...lines[0],n:8});
  localStorage.setItem('__fakeTables',JSON.stringify({
   ar_invoice_reviews:[{id:11,batch:'b',ord:1,supplier:'مورد مثال',doc_no:'900001',paper_date:'2026-11-20',total:80,photos:[],lines,notes:[],answers:{},owner_note:null,status:'ready',result:null,created_at:new Date().toISOString(),done_at:null}],
   ar_store_edits:[
    {item_id:102,img:'e/102-a.jpg',img_off:false,updated_by:null},                 // the night search's photo: asked
    {item_id:103,img:'e/103-a.jpg',img_off:false,updated_by:'u9'},                 // a person chose it
    {item_id:104,img:null,img_off:true,updated_by:'u9'},                           // removed on purpose
    {item_id:105,img:'e/105-a.jpg',img_off:false,updated_by:null},                 // internet: he will say it is wrong
    {item_id:106,img:'e/106-a.jpg',img_off:false,updated_by:null,photo_ok_at:'2026-11-26T10:00:00Z'}]}));  // already kept with «تمام»
 });
 await page.reload();
 await page.click('[data-pgroup="orders"]');await page.click('[data-tab="docs"]');await page.waitForSelector('#rvMain .rv-pic-n');
 // the card stays closed (nothing to answer): its header says it asks for photos; he opens it
 assert.ok(!(await page.isVisible('#rvMain .rv-pics')));await page.click('[data-rv-toggle="11"] .rv-t');await page.waitForSelector('#rvMain .rv-pics');
};
const edits=(page)=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__tables.ar_store_edits)));

run('Review item photos: asked once per item, only the ones with no photo or an internet photo; the camera and «تمام»',async({page})=>{
 await page.route('**/functions/v1/asker-store-img',(r)=>{const b=JSON.parse(r.request().postData()||'{}');r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},body:JSON.stringify({img:'e/'+b.id+'-new.jpg'})})});
 await seedAndReload(page);
 assert.equal((await txt(page,'[data-rv="11"] .rv-pic-n')),'📷 3','the header says how many photos the invoice asks for');
 assert.match(await txt(page,'.rv-pics summary'),/📷 صور الأصناف 1 من غير صورة · 2 صورتها من النت/);
 assert.deepEqual(await all(page,'.rv-pic-row b'),['EXAMPLE 101 TAB'],'the item with no photo, once (it is on two lines)');
 assert.deepEqual(await all(page,'.rv-pic-tile small'),['EXAMPLE 102 TAB','EXAMPLE 105 TAB']);
 assert.ok(await page.$eval('.rv-pics',(d)=>!!(d.compareDocumentPosition(document.querySelector('[data-rv-approve="11"]'))&4)),'above the approve button, which does not wait for photos');
 assert.equal(await page.isDisabled('[data-rv-approve="11"]'),false);
 // a tap marks a wrong photo; «the rest are right» keeps only the others
 await page.click('[data-rv-pbad="11|105"]');
 assert.match(await txt(page,'[data-rv-pbad="11|105"]'),/مش تمام/);
 assert.match(await txt(page,'.rv-pic-ok'),/✓ الباقي صوره تمام \( 1 \)/);
 await page.click('.rv-pic-ok');
 await page.waitForFunction(()=>window.__tables.ar_store_edits.find((e)=>e.item_id===102).photo_ok_at);
 const e=await edits(page);
 assert.equal(e.find((x)=>x.item_id===105).photo_ok_at,undefined,'the wrong one is not kept');
 assert.equal(e.find((x)=>x.item_id===102).img,'e/102-a.jpg','«تمام» changes nothing else');
 await page.waitForFunction(()=>document.querySelectorAll('.rv-pic-tile').length===1);
 assert.equal(await page.$('.rv-pic-ok'),null,'nothing left to keep');
 // the camera: the photo goes to the item and it is not asked again
 await page.setInputFiles('[data-rv-pcam="11|101"]',{name:'box.png',mimeType:'image/png',buffer:PNG});
 await page.waitForFunction(()=>/الصورة بقت صورة الصنف/.test(document.getElementById('rvStatus').textContent));
 await page.waitForFunction(()=>![...document.querySelectorAll('.rv-pic-row b')].some((b)=>b.textContent==='EXAMPLE 101 TAB'));
 await page.setInputFiles('[data-rv-pcam="11|105"]',{name:'box.png',mimeType:'image/png',buffer:PNG});
 await page.waitForFunction(()=>!document.querySelector('#rvMain .rv-pics'));
 assert.equal(await page.$('[data-rv="11"] .rv-pic-n'),null,'no more photos asked');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the phone');
});
