// «🧾 مراجعة الفواتير»: a NEW item's box photo (owner 2026-11-22: «اوبشن صوره ادخله بيها، يقوم جاي عامل الصنف منها» → «مراجعه الفواتير بس»; mockup mockups/new_item_photo_2026-11-22.jpg).
// Only a line that is not in PharmaFly has «📷 صوّر العلبة»; the photo goes to ar_item_reads (kind new_item, its review and line); while the laptop reads it the line says so; the reading shows
// under the line; «غيّر الاسم» saves his name (answers N<line>); approving keeps the reading's name for a line he did not answer; once the invoice is entered with the new card's code the box
// photo becomes the item's photo (AskerItemMedia.upload, played here) and the reading is «applied». The server is played (the real table is tested in tests/item-reads-new-item-migration.cjs).
// Made-up suppliers, items and a one-pixel photo only: the repository is public.
const {run,assert}=require('./harness.cjs');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const seed=(page)=>page.evaluate(()=>{
 window.__tables.ar_item_reads=[];
 window.__tables.ar_invoice_reviews=[{id:21,batch:'2026-11-22',ord:1,supplier:'مورد مثال',doc_no:'777001',paper_date:'2026-11-22',total:500,photos:[],
  lines:[{n:1,paper:'دوا مثال',qty:1,disc:20,exp:'082029',id:101,name:'EXAMPLE 10MG 20 TAB',total:100},
   {n:2,paper:'شامبو مثال',qty:1,disc:20,exp:'082029',name:'',total:200},
   {n:3,paper:'كريم مثال',qty:1,disc:20,exp:'082029',name:'',total:200}],
  notes:[],answers:{},owner_note:null,status:'ready',result:null,created_at:new Date().toISOString(),done_at:null}];
});
const open=async(page)=>{await page.click('[data-pgroup="orders"]');await page.click('[data-tab="docs"]');await page.waitForSelector('#rvMain .rv-card');};
const reads=(page)=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__tables.ar_item_reads)));
const review=(page)=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__tables.ar_invoice_reviews[0])));
// the laptop answers a reading (what Hub\reader\ITEM_ACTIVE_READER.ps1 does through ar_item_read_done)
const laptop=(page,line,res)=>page.evaluate(([line,res])=>{const r=window.__tables.ar_item_reads.find(x=>x.line_n===line&&x.status!=='cancelled');r.status='done';r.result=res},[line,res]);

run('Invoice review: a new item\'s box photo is read, shown under its line, kept or renamed, and becomes the new card\'s photo',async({page})=>{
 await seed(page);await open(page);
 await page.click('#rvMain [data-rv-toggle="21"]').catch(()=>{});
 if(!(await page.isVisible('#rvMain .rv-ni-cam')))await page.click('#rvMain [data-rv-toggle="21"]');
 // only the two lines that are not in PharmaFly have the camera
 assert.deepEqual(await page.$$eval('#rvMain [data-rv-cam]:not([data-rv-pick])',(b)=>b.map(x=>x.dataset.rvCam)),['21|2','21|3']);
 // and the phone's own photos next to the camera (owner 2026-11-23: «ادوس على الكاميرا ديت يفتح لي تحميل … من الستور»): the same input with no capture
 assert.deepEqual(await page.$$eval('#rvMain [data-rv-pick]',(b)=>b.map(x=>[x.dataset.rvCam,x.hasAttribute('capture'),x.accept])),[['21|2',false,'image/*'],['21|3',false,'image/*']]);
 assert.deepEqual(await page.$$eval('#rvMain .rv-ni-pick',(b)=>b.map(x=>x.textContent.trim())),['🖼 من الصور','🖼 من الصور']);
 // the photo goes to the readings queue for that review and line, and the line says it is being read
 await page.setInputFiles('#rvMain [data-rv-cam="21|2"]',{name:'box.png',mimeType:'image/png',buffer:PNG});
 await page.waitForFunction(()=>/الصورة وصلت… بيقرا العلبة/.test(document.querySelector('#rvMain .rv-ni-wait')?.textContent||''));
 let R=await reads(page);
 assert.equal(R.length,1);assert.deepEqual([R[0].kind,R[0].review_id,R[0].line_n,R[0].item_name,R[0].status],['new_item',21,'2','شامبو مثال','pending']);
 assert.ok(R[0].img_b64&&R[0].img_b64.length>50,'the photo (made smaller, JPEG) is in the request');
 // the laptop reads it: the screen shows the reading under the line by itself
 await laptop(page,'2',{found:true,name_en:'EXAMPLE SHAMPOO 200ML',form:'شامبو',count:1,company:'شركة مثال',price:150,active:'',confidence:'high',note:''});
 await page.waitForSelector('#rvMain .rv-ni-read',{timeout:12000});
 const shown=await page.$eval('#rvMain .rv-ni-read',(x)=>x.textContent.replace(/\s+/g,' '));
 assert.match(shown,/EXAMPLE SHAMPOO 200ML/);assert.match(shown,/شامبو · العلبة فيها 1 · شركة مثال · السعر على العلبة 150\.00/);
 assert.ok(await page.$('#rvMain .rv-ni-read img.rv-ni-ph'),'its photo beside it');
 // «غيّر الاسم»: his own name (Enter saves), written for the laptop as answers N2
 await page.click('#rvMain [data-rv-niedit="21|2"]');
 await page.fill('#rvMain [data-rv-niname="21|2"]','example shampoo 250ml');await page.press('#rvMain [data-rv-niname="21|2"]','Enter');
 await page.waitForFunction(()=>window.__tables.ar_invoice_reviews[0].answers.N2);
 let V=await review(page);
 assert.deepEqual(V.answers.N2,{v:'item',read:R[0].id,t:'EXAMPLE SHAMPOO 250ML'});
 assert.match(await page.$eval('#rvMain .rv-ni-read b',(x)=>x.textContent),/EXAMPLE SHAMPOO 250ML/,'his name is the one shown');
 // the second new line: photographed and read, not answered; approving keeps the reading's name for it
 await page.setInputFiles('#rvMain [data-rv-cam="21|3"][data-rv-pick]',{name:'box2.png',mimeType:'image/png',buffer:PNG}); // from the phone's photos this time
 await page.waitForFunction(()=>window.__tables.ar_item_reads.some(x=>x.line_n==='3'));
 await laptop(page,'3',{found:true,name_en:'EXAMPLE CREAM 50GM',form:'كريم',count:1,company:'',price:0,active:'',confidence:'high',note:''});
 await page.waitForFunction(()=>document.querySelectorAll('#rvMain .rv-ni-read').length===2,null,{timeout:12000});
 assert.match(await page.$$eval('#rvMain .rv-ni-read',(b)=>b[1].textContent),/EXAMPLE CREAM 50GM.*السعر مش على العلبة/,'no price printed: said so');
 await page.click('#rvMain [data-rv-approve="21"]');
 await page.waitForFunction(()=>window.__tables.ar_invoice_reviews[0].status==='approved');
 V=await review(page);
 assert.equal(V.answers.N2.t,'EXAMPLE SHAMPOO 250ML','his name stays');
 assert.deepEqual([V.answers.N3.v,V.answers.N3.t],['item','EXAMPLE CREAM 50GM'],'the reading\'s name kept for the line he did not answer');
 // the laptop enters it and makes card 70626 for line 2: the box photo becomes that item's photo, once, and the reading is «applied»
 await page.evaluate(()=>{window.__up=[];window.AskerItemMedia.upload=async(id,data)=>{window.__up.push([id,String(data).slice(0,23)]);return 'e/x.jpg'};
  Object.assign(window.__tables.ar_invoice_reviews[0],{status:'entered',done_at:new Date().toISOString(),result:{msg:'اتدخلت',new_items:[{n:2,code:70626}]}})});
 await page.click('#rvRefresh');
 await page.waitForFunction(()=>window.__up&&window.__up.length===1,null,{timeout:8000});
 assert.deepEqual(await page.evaluate(()=>window.__up[0]),[70626,'data:image/jpeg;base64,']);
 await page.waitForFunction(()=>window.__tables.ar_item_reads.find(x=>x.line_n==='2').status==='applied');
 await page.click('#rvRefresh');
 await page.waitForFunction(()=>/اتعمل كارت 70626 من الصورة · والصورة بقت صورة الصنف ✓/.test(document.getElementById('rvMain').textContent));
 assert.equal(await page.evaluate(()=>window.__up.length),1,'the photo is set once');
 assert.equal(await page.$('#rvMain [data-rv-cam]'),null,'no camera on an entered invoice');
});
