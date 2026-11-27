// «📷 صور مطلوبة» (owner 2026-11-27: a list above the invoice review, ready to send on WhatsApp to the numbers he saves; the NEW items come first by themselves, the others he adds from the cards;
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

run('Photo list (owner), nothing waiting: the box is still there, says why, and takes his numbers',async({page,table})=>{
 await page.evaluate(()=>localStorage.setItem('__fakeTables',JSON.stringify({ar_invoice_reviews:[],ar_photo_wanted:[],ar_photo_numbers:[]})));
 await page.reload();
 await page.click('[data-pgroup="orders"]');await page.click('[data-tab="docs"]');
 await page.waitForSelector('#pwMain [data-pw-add]');
 assert.ok(await shown(page,'#photoWantPanel'),'he finds it before any invoice arrives');
 assert.match(await txt(page,'#pwMain'),/مفيش صور مطلوبة دلوقتي ✓ الصنف الجديد واللي من غير صورة بيدخلوا هنا لوحدهم\. ولو صنف صورته غلط، ضيفه من أصناف الفاتورة\./);
 assert.equal(await page.isDisabled('[data-pw-group]'),true,'nothing to send yet');
 await page.click('[data-pw-add]');await page.fill('#pwPhone','0100 000 0100');await page.click('[data-pw-save]');
 await page.waitForSelector('#pwMain .pw-num');
 assert.equal((await table('ar_photo_numbers'))[0].phone,'201000000100');
 assert.equal(await page.isDisabled('[data-pw-send$="|all"]'),true);
 await shot(page,'photo-list-empty');
 await page.evaluate(()=>localStorage.removeItem('__fakeTables'));
});

// his word the same day: the new items first and by themselves; «سيب الاصناف اللى ملهاش صورة اوتوماتيك عادى بس تحت الاصناف الجديده»; and he adds any item whose photo is wrong
run('Photo list (owner): the new item first, the ones with no photo under it by themselves; he adds a wrong photo from the card; numbers, WhatsApp, ✕ and the camera',async({page,table})=>{
 await photoFn(page);
 page.on('dialog',(d)=>d.accept());
 await page.evaluate(()=>{
  const lines=[[101,'EXAMPLE NOPHOTO 500MG 20 TAB'],[102,'EXAMPLE INTERNET 120 ML SYRUP'],[103,'EXAMPLE CHOSEN CREAM'],[105,'EXAMPLE SECOND INTERNET 10 AMP']].map(([id,name],i)=>({n:i+1,paper:'دوا مثال '+(i+1),qty:1,disc:20,exp:'082029',id,name,total:10}));
  lines.push({n:5,paper:'شامبو جديد مثال',qty:1,disc:20,exp:'082029',id:0,name:'',total:10});
  const at=new Date(Date.now()-3600e3).toISOString();
  localStorage.setItem('__fakeTables',JSON.stringify({
   ar_invoice_reviews:[{id:11,batch:'b',ord:1,supplier:'مورد مثال',doc_no:'900001',paper_date:'2026-11-27',total:50,photos:[],lines,notes:[],answers:{},owner_note:null,status:'ready',result:null,created_at:new Date().toISOString(),done_at:null}],
   ar_store_edits:[{item_id:102,img:'e/102-a.jpg',img_off:false,updated_by:null},{item_id:103,img:'e/103-a.jpg',img_off:false,updated_by:'u9',updated_at:'2026-11-20T08:00:00Z'},{item_id:105,img:'e/105-a.jpg',img_off:false,updated_by:null}],
   ar_photo_new:[{review_id:11,line_n:'5',name:'شامبو جديد مثال',supplier:'مورد مثال',gone:false,removed_at:null,added_at:at}],   // the server lists it when the invoice is prepared
   ar_item_reads:[],ar_photo_wanted:[],ar_photo_numbers:[]}));
 });
 await page.reload();
 await page.click('[data-pgroup="orders"]');await page.click('[data-tab="docs"]');
 await waitNames(page,2);
 assert.deepEqual(await names(page),['شامبو جديد مثال','EXAMPLE NOPHOTO 500MG 20 TAB'],'the new item first, the one with no photo under it, both by themselves');
 assert.deepEqual((await all(page,'#pwMain .pw-it small')),['صنف جديد من فاتورة مورد مثال','من غير صورة']);
 assert.ok(await page.evaluate(()=>!!(document.getElementById('photoWantPanel').compareDocumentPosition(document.getElementById('reviewPanel'))&4)),'above the review');
 assert.equal(await shown(page,'.subbar [data-tab="photos"]'),false,'the staff chip is not the owner\'s');
 // in the card: the one with no photo says it is on the list; a tap takes it off, another puts it back
 await page.click('[data-rv-toggle="11"] .rv-t');await page.waitForSelector('#rvMain .rv-pics .rv-padd');
 assert.match(await txt(page,'[data-rv-pbad="11|101"]'),/✓ في القايمة/);
 await page.click('[data-rv-pbad="11|101"]');await waitNames(page,1);
 assert.ok((await table('ar_photo_wanted')).find((r)=>r.item_id===101).removed_at,'taken off');
 await page.click('#rvRefresh');await page.waitForTimeout(600);
 assert.equal((await names(page)).length,1,'one he took off does not come back by itself');
 await page.click('[data-rv-pbad="11|101"]');await waitNames(page,2);
 // a wrong internet photo, and a wrong one a person had chosen
 await new Promise((ok)=>setTimeout(ok,30));
 await page.click('[data-rv-pbad="11|102"]');await waitNames(page,3);
 assert.match(await txt(page,'[data-rv-pbad="11|102"]'),/للصور ✓/);
 assert.match(await txt(page,'.rv-pic-fine > summary'),/صورة غلط في صنف تاني؟ \( 1 \)/);
 await page.click('.rv-pic-fine > summary');await new Promise((ok)=>setTimeout(ok,30));
 await page.click('[data-rv-pbad="11|103"]');await waitNames(page,4);
 assert.match(await txt(page,'.rv-pic-fine'),/✓ EXAMPLE CHOSEN CREAM اتضافت لقايمة الصور فوق/);
 assert.deepEqual(await names(page),['شامبو جديد مثال','EXAMPLE CHOSEN CREAM','EXAMPLE INTERNET 120 ML SYRUP','EXAMPLE NOPHOTO 500MG 20 TAB'],'the new item stays first, also over ones added after it');
 assert.equal((await txt(page,'#pwCount')),'4');
 assert.match(await txt(page,'.rv-pic-ok'),/✓ الباقي صوره تمام \( 1 \)/);
 // a number of his, and the message: the new one first and marked
 await page.click('[data-pw-add]');
 await page.fill('#pwName','مثال');await page.fill('#pwPhone','123');await page.click('[data-pw-save]');
 assert.match(await txt(page,'#pwStatus'),/اكتب رقم واتس صحيح/);
 await page.fill('#pwPhone','0100 000 0100');await page.click('[data-pw-save]');
 await page.waitForSelector('#pwMain .pw-num');
 assert.match(await txt(page,'#pwMain .pw-num'),/مثال · 01000000100/);
 await page.evaluate(()=>{window.__opened=[];window.open=(u)=>{window.__opened.push(u);return {}}});
 await shot(page,'photo-list-owner');
 await page.click('[data-pw-send$="|all"]');
 await page.waitForFunction(()=>window.__tables.ar_photo_numbers[0].last_sent_at);
 const url=await page.evaluate(()=>window.__opened[0]);
 assert.ok(url.startsWith('https://wa.me/201000000100?text='),url);
 assert.match(decodeURIComponent(url.split('?text=')[1]),/1\) شامبو جديد مثال \(صنف جديد\)\n2\) EXAMPLE CHOSEN CREAM\n3\) EXAMPLE INTERNET 120 ML SYRUP\n4\) EXAMPLE NOPHOTO 500MG 20 TAB/);
 await page.waitForFunction(()=>document.querySelector('[data-pw-send$="|new"]')?.disabled);
 await new Promise((ok)=>setTimeout(ok,30));
 await page.click('[data-rv-pbad="11|105"]');await page.waitForFunction(()=>document.getElementById('pwCount').textContent==='5');
 // every new item stays in sight; of the others the first three, the rest behind «… وكمان»
 assert.equal((await names(page)).length,4);assert.match(await txt(page,'[data-pw-more]'),/… وكمان 1 ▾/);
 await page.waitForFunction(()=>!document.querySelector('[data-pw-send$="|new"]').disabled);
 await page.click('[data-pw-send$="|new"]');
 const second=decodeURIComponent((await page.evaluate(()=>window.__opened[1])).split('?text=')[1]);
 assert.match(second,/EXAMPLE SECOND INTERNET/);assert.ok(!/NOPHOTO|شامبو/.test(second));
 await page.click('[data-pw-group]');
 assert.ok((await page.evaluate(()=>window.__opened[2])).startsWith('https://wa.me/?text='),'to a group: WhatsApp asks which chat');
 // his ✕ on the new item: gone, and it does not come back
 await page.click('[data-pw-x="n:11|5"]');await page.waitForFunction(()=>document.getElementById('pwCount').textContent==='4');
 assert.ok((await table('ar_photo_new'))[0].removed_at);
 await page.click('#rvRefresh');await page.waitForTimeout(700);
 assert.ok(!(await names(page)).includes('شامبو جديد مثال'));
 // the camera on another item: the photo becomes its photo and it leaves; also one a person had chosen before (the new photo is after he added it)
 await page.setInputFiles('#pwMain [data-pw-photo="i:102"]',{name:'box.png',mimeType:'image/png',buffer:PNG});
 await page.waitForFunction(()=>/الصورة بقت صورة الصنف/.test(document.getElementById('pwStatus').textContent));
 await page.waitForFunction(()=>document.getElementById('pwCount').textContent==='3');
 await page.setInputFiles('#pwMain [data-pw-photo="i:103"]',{name:'box.png',mimeType:'image/png',buffer:PNG});
 await waitNames(page,2);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the phone');
 await page.evaluate(()=>localStorage.removeItem('__fakeTables'));
});

run('Photo list (a user with «صور مطلوبة»): the new item first; its box goes to be read; no numbers, no ✕, no invoices',async({page,table})=>{
 await photoFn(page);
 const at=new Date().toISOString();
 await page.evaluate((at)=>localStorage.setItem('__fakeTables',JSON.stringify({ar_staff:[{user_id:'u1',name:'موظف تجربة',perms:['photos'],active:true}],ar_store_edits:[],ar_item_reads:[],
  ar_photo_new:[{review_id:11,line_n:'5',name:'شامبو جديد مثال',supplier:'مورد مثال',gone:false,removed_at:null,added_at:'2026-11-20T08:00:00Z'}],
  ar_photo_wanted:[{item_id:107,name:'EXAMPLE OTHER GEL 50 GM',why:'picked',added_at:at,removed_at:null}]})),at);
 await page.reload();
 await page.waitForFunction(()=>document.documentElement.classList.contains('staff'));
 await page.waitForSelector('#staffHomePanel:not(.hidden) [data-stf-go]');
 assert.deepEqual(await page.$$eval('#staffHomePanel [data-stf-go]',(b)=>b.map((x)=>x.dataset.stfGo)),['photos']);
 await page.click('#staffHomePanel [data-stf-go="photos"]');
 await waitNames(page,2);
 for(const sel of ['#reviewPanel','#docsPanel'])assert.equal(await shown(page,sel),false,sel);
 assert.equal(await page.$('#pwMain .pw-num'),null);assert.equal(await page.$('[data-pw-add]'),null);assert.equal(await page.$('[data-pw-group]'),null);assert.equal(await page.$('[data-pw-x]'),null);
 assert.deepEqual(await names(page),['شامبو جديد مثال','EXAMPLE OTHER GEL 50 GM'],'the new one first, older as it is');
 assert.deepEqual(await all(page,'#pwMain .pw-it small'),['صنف جديد صوّر العلبة من قدّام','صوّرها أو هاتها من الصور'],'no supplier name for a user');
 assert.equal(await shown(page,'.subbar [data-tab="photos"]'),true);
 await shot(page,'photo-list-user');
 // the new item's box: the same request as the invoice card's camera, and it leaves the list while it is read
 await page.setInputFiles('#pwMain [data-pw-photo="n:11|5"]',{name:'box.png',mimeType:'image/png',buffer:PNG});
 await page.waitForFunction(()=>/الصورة وصلت ✓ اللاب هيقرا العلبة/.test(document.getElementById('pwStatus').textContent));
 await waitNames(page,1);
 const R=await table('ar_item_reads');
 assert.deepEqual([R.length,R[0].kind,R[0].review_id,R[0].line_n,R[0].item_name,R[0].status],[1,'new_item',11,'5','شامبو جديد مثال','pending']);
 assert.ok(R[0].img_b64.length>50);
 // the laptop could not read it: wanted again
 await page.evaluate(()=>{window.__tables.ar_item_reads[0].status='failed';window.AskerPhotoWant.open(false)});
 await waitNames(page,2);
 assert.match(await txt(page,'#pwMain .pw-it small'),/صنف جديد الصورة ما اتقرتش، صوّرها تاني/);
 await page.setInputFiles('#pwMain [data-pw-photo="i:107"]',{name:'box.png',mimeType:'image/png',buffer:PNG});
 await waitNames(page,1);
 assert.equal((await table('ar_photo_wanted')).filter((r)=>r.removed_at).length,0,'a user writes nothing on the list');
 await page.evaluate(()=>localStorage.removeItem('__fakeTables'));
},{home:true});

// owner 2026-11-27: «لما الصور تنضاف، لأن مش أنا اللي بضيفها، تفضل معروضة مستنية موافقتي». What the server does on his answer is played here (tests/photo-pending-migration.cjs checks the real one)
const waitingPhotos=(at)=>({ar_invoice_reviews:[],ar_photo_new:[],ar_item_reads:[],ar_photo_numbers:[],
 ar_store_edits:[{item_id:201,img:'e/201-a.jpg',img_off:false,updated_by:'u9',updated_at:at}],
 ar_photo_wanted:[{item_id:202,name:'EXAMPLE NEW SYR 120 ML',why:'none',added_at:at,removed_at:null}],
 ar_photo_pending:[{id:1,item_id:201,name:'EXAMPLE SHOWN VIAL I.M.',img:'e/201-a.jpg',by_name:'موظف تجربة',live:true,status:'pending',at},
  {id:2,item_id:202,name:'EXAMPLE NEW SYR 120 ML',img:'e/202-b.jpg',by_name:'موظف تجربة',live:false,status:'pending',at}]});
const server=(page)=>page.evaluate(()=>{window.__fakeRpcs={ar_photo_decide:({p_id,p_ok})=>{
 const T=window.__tables,p=T.ar_photo_pending.find((x)=>x.id===p_id&&x.status==='pending'),now=new Date().toISOString();
 if(!p)return {ok:false,error:'gone'};
 p.status=p_ok?'approved':'rejected';
 const e=T.ar_store_edits.find((x)=>x.item_id===p.item_id);
 if(p_ok){const row={item_id:p.item_id,img:p.img,img_off:false,updated_by:'u9',updated_at:now,photo_ok_at:now};if(e)Object.assign(e,row);else T.ar_store_edits.push(row)}
 else{if(e&&e.img===p.img)Object.assign(e,{img:null,updated_by:null,photo_ok_at:null,updated_at:now});
  const w=T.ar_photo_wanted.find((x)=>x.item_id===p.item_id),row={item_id:p.item_id,name:p.name,why:'retake',added_at:now,removed_at:null};if(w)Object.assign(w,row);else T.ar_photo_wanted.push(row)}
 return {ok:true};}}});
const answers=(page)=>page.evaluate(()=>window.__fakeWrites.filter((x)=>x.rpc==='ar_photo_decide').map((x)=>x.args.p_id+':'+x.args.p_ok));

run('Photo approval (owner): a user\'s photos wait on top; a tap makes one big; yes shows it; no keeps it off and asks again',async({page,table})=>{
 await page.route('**/ar-store-img/**',(r)=>r.fulfill({contentType:'image/png',body:PNG}));
 let say=true;page.on('dialog',(d)=>say?d.accept():d.dismiss());
 await page.evaluate((t)=>localStorage.setItem('__fakeTables',JSON.stringify(t)),waitingPhotos(new Date().toISOString()));
 await page.reload();await server(page);
 await page.click('[data-pgroup="orders"]');await page.click('[data-tab="docs"]');
 await page.waitForSelector('#pwMain .pw-appr');
 assert.ok(await page.evaluate(()=>document.querySelector('#pwMain').firstElementChild.classList.contains('pw-appr')),'on top of the box');
 assert.equal(await txt(page,'#pwApprCount'),'⏳ 2');
 assert.match(await txt(page,'#pwMain .pw-appr h3'),/⏳ مستنية موافقتك \( 2 \)/);
 assert.deepEqual(await all(page,'#pwMain .pw-ap b'),['EXAMPLE SHOWN VIAL I.M.','EXAMPLE NEW SYR 120 ML']);
 assert.match(await txt(page,'[data-pw-ap="1"]'),/صوّرها موظف تجربة · .* متعرضة دلوقتي: لو رفضتها تتشال ✓ تمام، خليها ✕ لأ، تتصوّر تاني/);
 assert.match(await txt(page,'[data-pw-ap="2"]'),/✓ تمام، اعرضها/);
 assert.equal((await names(page)).length,0,'an item whose photo waits is not asked for again');
 await shot(page,'photo-approval-owner');
 await page.click('[data-pw-big="2"]');await page.waitForSelector('.pw-big img');
 assert.match(await page.getAttribute('.pw-big img','src'),/ar-store-img\/e\/202-b\.jpg$/);
 await shot(page,'photo-approval-big');
 await page.click('.pw-big');assert.equal(await page.$('.pw-big'),null);
 // yes
 await page.click('[data-pw-yes="2"]');
 await page.waitForFunction(()=>document.querySelectorAll('#pwMain .pw-ap').length===1);
 assert.match(await txt(page,'#pwStatus'),/اتعرضت على الصنف ✓/);
 assert.equal((await table('ar_store_edits')).find((e)=>e.item_id===202).img,'e/202-b.jpg');
 // no: asked first; his «cancel» changes nothing
 say=false;await page.click('[data-pw-no="1"]');await page.waitForTimeout(300);
 assert.deepEqual(await answers(page),['2:true']);
 say=true;await page.click('[data-pw-no="1"]');
 await page.waitForFunction(()=>!document.querySelector('#pwMain .pw-appr')&&document.querySelectorAll('#pwMain .pw-it').length===1);
 assert.deepEqual(await answers(page),['2:true','1:false']);
 assert.deepEqual(await names(page),['EXAMPLE SHOWN VIAL I.M.'],'back on the list');
 assert.deepEqual(await all(page,'#pwMain .pw-it small'),['رفضت صورتها، مستنية صورة جديدة']);
 assert.equal((await table('ar_store_edits')).find((e)=>e.item_id===201).img,null,'and off the item');
 assert.equal(await shown(page,'#pwApprCount'),false);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the phone');
 await page.evaluate(()=>localStorage.removeItem('__fakeTables'));
});

run('Photo approval (a user): his sent photo shows as waiting, with no second camera; a refused one asks again; he decides nothing',async({page})=>{
 await page.route('**/functions/v1/asker-store-img',async(r)=>{const b=JSON.parse(r.request().postData()||'{}');
  await page.evaluate((id)=>window.__tables.ar_photo_pending.push({id:9,item_id:id,name:'EXAMPLE REFUSED GEL',img:'e/'+id+'-new.jpg',by_name:'موظف تجربة',live:false,status:'pending',at:new Date().toISOString()}),b.id);
  await r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},body:JSON.stringify({img:'e/'+b.id+'-new.jpg',pending:true})})});
 const at=new Date().toISOString();
 await page.evaluate((at)=>localStorage.setItem('__fakeTables',JSON.stringify({ar_staff:[{user_id:'u1',name:'موظف تجربة',perms:['photos'],active:true}],ar_store_edits:[],ar_item_reads:[],ar_photo_new:[],
  ar_photo_wanted:[{item_id:202,name:'EXAMPLE NEW SYR 120 ML',why:'none',added_at:at,removed_at:null},{item_id:203,name:'EXAMPLE REFUSED GEL',why:'retake',added_at:at,removed_at:null}],
  ar_photo_pending:[{id:2,item_id:202,name:'EXAMPLE NEW SYR 120 ML',img:'e/202-b.jpg',by_name:'موظف تجربة',live:false,status:'pending',at}]})),at);
 await page.reload();
 await page.waitForFunction(()=>document.documentElement.classList.contains('staff'));
 await page.waitForSelector('#staffHomePanel:not(.hidden) [data-stf-go]');
 await page.click('#staffHomePanel [data-stf-go="photos"]');
 await waitNames(page,2);
 assert.equal(await page.$('#pwMain .pw-appr'),null,'no approving for a user');assert.equal(await shown(page,'#pwApprCount'),false);
 assert.equal(await page.$('#pwMain [data-pw-photo="i:202"]'),null,'sent already: no camera');
 assert.match(await txt(page,'[data-pw-item="i:202"]'),/صورتها وصلت، مستنية موافقة صاحب الصيدلية ⏳ مستنية الموافقة/);
 assert.match(await txt(page,'[data-pw-item="i:203"]'),/الصورة اللي فاتت ما اتقبلتش، صوّرها تاني/);
 assert.equal(await txt(page,'#pwCount'),'1','only what still needs a photo is counted');
 await page.setInputFiles('#pwMain [data-pw-photo="i:203"]',{name:'box.png',mimeType:'image/png',buffer:PNG});
 await page.waitForFunction(()=>/الصورة وصلت ✓ مستنية موافقة صاحب الصيدلية/.test(document.getElementById('pwStatus').textContent));
 await page.waitForFunction(()=>!document.querySelector('#pwMain [data-pw-photo="i:203"]'));
 await shot(page,'photo-approval-user');
 await page.evaluate(()=>localStorage.removeItem('__fakeTables'));
},{home:true});

run('Photo list: a user with every «طلبيات» tab still sees them all on a phone',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('__fakeTables',JSON.stringify({ar_staff:[{user_id:'u1',name:'موظف تجربة',perms:['drafts','docs','suppliers','wait','photos'],active:true}],ar_photo_wanted:[]})));
 await page.reload();
 await page.waitForFunction(()=>document.documentElement.classList.contains('staff'));
 await page.waitForSelector('#staffHomePanel:not(.hidden) [data-stf-go]');
 await page.click('#staffHomePanel [data-stf-go="photos"]');
 await page.waitForSelector('#photoWantPanel:not(.hidden) .hint');
 await shot(page,'photo-list-user-tabs');
 // every chip of the row is fully on the screen (wrapped or not), none cut off at the side
 const out=await page.$$eval('[data-pfor="orders"] [data-tab]',(b)=>b.filter((x)=>x.offsetParent!==null).map((x)=>{const r=x.getBoundingClientRect();return {t:x.textContent.trim(),cut:r.left<0||r.right>document.documentElement.clientWidth+0.5}}));
 assert.deepEqual(out.map((x)=>x.t),['الطلبيات','الفواتير','قوايم المخازن','الانتظار','صور مطلوبة']);
 assert.deepEqual(out.filter((x)=>x.cut),[],'no chip is cut off');
 assert.match(await txt(page,'#pwMain'),/مفيش صور مطلوبة دلوقتي/);
 await page.evaluate(()=>localStorage.removeItem('__fakeTables'));
},{home:true});
