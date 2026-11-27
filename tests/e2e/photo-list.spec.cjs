// «📷 صور مطلوبة» (owner 2026-11-27: a list above the invoice review of the items with no photo, ready to send on WhatsApp to the numbers he saves; he nominates wrong internet photos from the cards;
// and a switch that gives a user the list to photograph from the system or add from the phone's photos). The server and the photo function are played here. Made-up names and numbers only.
const {run,assert}=require('./harness.cjs');
const flat=(x)=>{const w=document.createTreeWalker(x,NodeFilter.SHOW_TEXT),a=[];let n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\s+/g,' ').trim()};
const txt=(page,sel)=>page.$eval(sel,(x,f)=>new Function('x','return ('+f+')(x)')(x),flat.toString());
const all=(page,sel)=>page.$$eval(sel,(b,f)=>b.map(new Function('x','return ('+f+')(x)')),flat.toString());
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhWMjWwAAAABJRU5ErkJggg==','base64');
const photoFn=(page)=>page.route('**/functions/v1/asker-store-img',(r)=>{const b=JSON.parse(r.request().postData()||'{}');r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},body:JSON.stringify({img:'e/'+b.id+'-new.jpg'})})});
const names=(page)=>all(page,'#pwMain .pw-it .pw-nm b');
const waitNames=(page,n)=>page.waitForFunction((n)=>document.querySelectorAll('#pwMain .pw-it').length===n,n);
const shown=(page,sel)=>page.$eval(sel,(e)=>getComputedStyle(e).display!=='none'&&!e.classList.contains('hidden'));
const shot=async(page,name)=>{if(process.env.SHOT_DIR)await page.screenshot({path:process.env.SHOT_DIR+'/'+name+'.png',fullPage:true})};

run('Photo list (owner): no-photo items add themselves, he nominates wrong ones, numbers and WhatsApp, ✕ and the camera',async({page,table})=>{
 await photoFn(page);
 page.on('dialog',(d)=>d.accept());
 await page.evaluate(()=>{
  const lines=[[101,'EXAMPLE NOPHOTO 500MG 20 TAB'],[102,'EXAMPLE INTERNET 120 ML SYRUP'],[103,'EXAMPLE CHOSEN CREAM'],[105,'EXAMPLE SECOND INTERNET 10 AMP']].map(([id,name],i)=>({n:i+1,paper:'دوا مثال '+(i+1),qty:1,disc:20,exp:'082029',id,name,total:10}));
  localStorage.setItem('__fakeTables',JSON.stringify({
   ar_invoice_reviews:[{id:11,batch:'b',ord:1,supplier:'مورد مثال',doc_no:'900001',paper_date:'2026-11-27',total:40,photos:[],lines,notes:[],answers:{},owner_note:null,status:'ready',result:null,created_at:new Date().toISOString(),done_at:null}],
   ar_store_edits:[{item_id:102,img:'e/102-a.jpg',img_off:false,updated_by:null},{item_id:103,img:'e/103-a.jpg',img_off:false,updated_by:'u9'},{item_id:105,img:'e/105-a.jpg',img_off:false,updated_by:null}],
   ar_photo_wanted:[],ar_photo_numbers:[]}));
 });
 await page.reload();
 await page.click('[data-pgroup="orders"]');await page.click('[data-tab="docs"]');
 await waitNames(page,1);
 assert.ok(await shown(page,'#photoWantPanel'),'the box shows once something waits');
 assert.deepEqual(await names(page),['EXAMPLE NOPHOTO 500MG 20 TAB'],'the item with no photo, by itself');
 assert.match(await txt(page,'#pwMain .pw-it small'),/من غير صورة · اتضافت النهارده/);
 assert.ok(await page.evaluate(()=>!!(document.getElementById('photoWantPanel').compareDocumentPosition(document.getElementById('reviewPanel'))&4)),'above the review');
 assert.equal(await shown(page,'.subbar [data-tab="photos"]'),false,'the staff chip is not the owner\'s');
 // he nominates a wrong internet photo from the card; the same tap takes it back
 await page.click('[data-rv-toggle="11"] .rv-t');await page.waitForSelector('#rvMain .rv-pics');
 await page.click('[data-rv-pbad="11|102"]');await waitNames(page,2);
 assert.match(await txt(page,'[data-rv-pbad="11|102"]'),/للصور ✓/);
 assert.match(await txt(page,'.rv-pic-added'),/✓ EXAMPLE INTERNET 120 ML SYRUP اتضافت لقايمة الصور فوق/);
 assert.equal((await txt(page,'#pwCount')),'2');
 await page.click('[data-rv-pbad="11|102"]');await waitNames(page,1);
 assert.ok((await table('ar_photo_wanted')).find((r)=>r.item_id===102).removed_at,'taken back');
 await page.click('[data-rv-pbad="11|102"]');await waitNames(page,2);
 // «the rest are right» leaves the nominated one alone
 assert.match(await txt(page,'.rv-pic-ok'),/✓ الباقي صوره تمام \( 1 \)/);
 // a number of his
 await page.click('[data-pw-add]');
 await page.fill('#pwName','مثال');await page.fill('#pwPhone','123');await page.click('[data-pw-save]');
 assert.match(await txt(page,'#pwStatus'),/اكتب رقم واتس صحيح/);
 await page.fill('#pwPhone','0100 000 0100');await page.click('[data-pw-save]');
 await page.waitForSelector('#pwMain .pw-num');
 assert.equal((await table('ar_photo_numbers'))[0].phone,'201000000100');
 assert.match(await txt(page,'#pwMain .pw-num'),/مثال · 01000000100/);
 assert.match(await txt(page,'#pwMain .pw-num'),/لسه ما اتبعتلوش/);
 await page.evaluate(()=>{window.__opened=[];window.open=(u)=>{window.__opened.push(u);return {}}});
 await shot(page,'photo-list-owner');
 await page.click('[data-pw-send$="|all"]');
 await page.waitForFunction(()=>window.__tables.ar_photo_numbers[0].last_sent_at);
 const url=await page.evaluate(()=>window.__opened[0]);
 assert.ok(url.startsWith('https://wa.me/201000000100?text='),url);
 const msg=decodeURIComponent(url.split('?text=')[1]);
 assert.match(msg,/محتاجين صور للأصناف دي/);assert.match(msg,/EXAMPLE NOPHOTO 500MG 20 TAB/);assert.match(msg,/EXAMPLE INTERNET 120 ML SYRUP/);
 await page.waitForFunction(()=>document.querySelector('[data-pw-send$="|new"]')?.disabled);
 // one nominated after the send is what is «new»
 await new Promise((ok)=>setTimeout(ok,30));
 await page.click('[data-rv-pbad="11|105"]');await waitNames(page,3);
 await page.waitForFunction(()=>!document.querySelector('[data-pw-send$="|new"]').disabled);
 assert.match(await txt(page,'[data-pw-send$="|new"]'),/الجديد بس \( 1 \)/);
 await page.click('[data-pw-send$="|new"]');
 const second=decodeURIComponent((await page.evaluate(()=>window.__opened[1])).split('?text=')[1]);
 assert.match(second,/EXAMPLE SECOND INTERNET/);assert.ok(!/NOPHOTO/.test(second));
 await page.click('[data-pw-group]');
 assert.ok((await page.evaluate(()=>window.__opened[2])).startsWith('https://wa.me/?text='),'to a group: WhatsApp asks which chat');
 // his ✕: gone, and the automatic add does not bring it back
 await page.click('[data-pw-x="101"]');await waitNames(page,2);
 await page.click('#rvRefresh');await page.waitForTimeout(700);
 assert.ok(!(await names(page)).includes('EXAMPLE NOPHOTO 500MG 20 TAB'));
 assert.equal((await table('ar_photo_wanted')).filter((r)=>r.item_id===101).length,1);
 // the camera: the photo goes to the item and it leaves the list
 await page.setInputFiles('#pwMain [data-pw-photo="102"]',{name:'box.png',mimeType:'image/png',buffer:PNG});
 await page.waitForFunction(()=>/الصورة بقت صورة الصنف/.test(document.getElementById('pwStatus').textContent));
 await waitNames(page,1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the phone');
});

run('Photo list (a user with «صور مطلوبة»): the names, the camera and the photos; no numbers, no ✕, no invoices',async({page,table})=>{
 await photoFn(page);
 const at=new Date().toISOString();
 await page.evaluate((at)=>localStorage.setItem('__fakeTables',JSON.stringify({ar_staff:[{user_id:'u1',name:'موظف تجربة',perms:['photos'],active:true}],ar_store_edits:[],
  ar_photo_wanted:[{item_id:101,name:'EXAMPLE NOPHOTO 500MG 20 TAB',why:'none',added_at:at,removed_at:null},{item_id:107,name:'EXAMPLE OTHER GEL 50 GM',why:'picked',added_at:at,removed_at:null}]})),at);
 await page.reload();
 await page.waitForFunction(()=>document.documentElement.classList.contains('staff'));
 await page.waitForSelector('#staffHomePanel:not(.hidden) [data-stf-go]');
 assert.deepEqual(await page.$$eval('#staffHomePanel [data-stf-go]',(b)=>b.map((x)=>x.dataset.stfGo)),['photos']);
 await page.click('#staffHomePanel [data-stf-go="photos"]');
 await waitNames(page,2);
 assert.ok(await shown(page,'#photoWantPanel'));
 for(const sel of ['#reviewPanel','#docsPanel'])assert.equal(await shown(page,sel),false,sel);
 assert.equal(await page.$('#pwMain .pw-num'),null);assert.equal(await page.$('[data-pw-add]'),null);assert.equal(await page.$('[data-pw-group]'),null);assert.equal(await page.$('[data-pw-x]'),null);
 assert.deepEqual([...new Set(await all(page,'#pwMain .pw-it small'))],['صوّرها أو هاتها من الصور']);
 assert.equal(await shown(page,'.subbar [data-tab="photos"]'),true);
 await shot(page,'photo-list-user');
 await page.setInputFiles('#pwMain [data-pw-photo="101"]',{name:'box.png',mimeType:'image/png',buffer:PNG});
 await waitNames(page,1);
 assert.equal((await table('ar_photo_wanted')).filter((r)=>r.removed_at).length,0,'a user writes nothing on the list');
 await page.evaluate(()=>localStorage.removeItem('__fakeTables'));
},{home:true});
