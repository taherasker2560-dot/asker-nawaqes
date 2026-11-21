// «🧾 مراجعة الفواتير» (owner 2026-11-21, mockup mockups/invoice_review_2026-11-21/index.html, «ابنيها»): the invoices Claude prepared, before they are entered. The screen: the cards in the box order,
// the chips, the summary and «وافق على الجاهز», the notes («ماشي كده» / «غيّرها» with choices and his own words, each answer saved at once), the approve button that works only when every note
// has an answer (button and Enter), the note on an invoice, «استنى عليها» / taking an approval back, the laptop's results, the paper's photo and its viewer (rotate), and the badge + home row.
// The server's table is played here (the real one, its policies and its trigger are tested in tests/invoice-reviews-migration.cjs). Made-up suppliers and invoices only: the repository is public.
const {run,assert}=require('./harness.cjs');
const flat=(x)=>{const w=document.createTreeWalker(x,NodeFilter.SHOW_TEXT),a=[];let n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\s+/g,' ').trim()};
const texts=(page,sel)=>page.$$eval(sel,(b,f)=>b.map(new Function('x','return ('+f+')(x)')),flat.toString());
const txt=(page,sel)=>page.$eval(sel,(x,f)=>new Function('x','return ('+f+')(x)')(x),flat.toString());
const seed=(page)=>page.evaluate(()=>{
 const mk=(id,ord,sup,no,total,lines,x)=>({id,batch:'2026-11-21',ord,supplier:sup,doc_no:no,paper_date:'2026-11-20',total,photos:[],lines,notes:[],answers:{},owner_note:null,status:'ready',result:null,created_at:new Date().toISOString(),done_at:null,...x});
 const lines=(...t)=>t.map((v,i)=>({n:i+1,paper:'دوا مثال '+(i+1),qty:2,disc:25,exp:'082029',id:101+i,name:'EXAMPLE '+(i+1)+' 10MG 20 TAB',total:v}));
 window.__tables.ar_invoice_reviews=[
  mk(11,9,'مورد ج','900009',300,lines(100,100,100),{photos:[{p:'docs/2026-11-21/a.jpg',rot:180}],notes:[
    {id:'n1',line:1,text:'بات: الأمر ١ والمندوب باعت ١٣',mine:'هدخل ١ وأرجّع ١٢',alts:[{k:'a',t:'أرجّع الـ١٣ كلهم'},{k:'b',t:'أدخل الـ١٣ من غير مرتجع'}]},
    {id:'n2',line:2,text:'صنف مالوش كارت',mine:'هعمله من صورة العلبة',alts:[]},
    {id:'n3',line:null,text:'الورقة جت مقلوبة',mine:'لفّيتها',alts:[]}]}),
  mk(12,1,'مورد أ','900001',165,lines(165)),
  mk(13,2,'مورد ب','900002',258.44,lines(258.44)),
  mk(14,3,'مورد د','900003',500,lines(100,100),{}),     // lines add up to 200, not the paper's 500: never «clean»
  mk(15,4,'مورد هـ','900004',75,lines(75),{status:'approved'}),
  mk(16,5,'مورد و','900005',702.3,lines(624,78.3),{status:'entered',done_at:new Date().toISOString(),result:{msg:'اتدخلت، المجموع 702.30',checked:'صفر فروق'}}),
  mk(17,6,'مورد ز','900006',90,lines(90),{status:'failed',result:{msg:'وقفت عند رسالة جديدة في فارمافلاي'}})];
 // the paper's photo comes from the private bucket as a signed address (the fake gives a one-pixel picture)
});
const open=async(page)=>{await page.click('[data-pgroup="orders"]');await page.click('[data-tab="docs"]');await page.waitForSelector('#rvMain .rv-card');};
const rows=(page)=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__tables.ar_invoice_reviews)));
const row=async(page,id)=>(await rows(page)).find(r=>r.id===id);

run('Invoice review: the cards in box order, chips, summary, «وافق على الجاهز»',async({page})=>{
 await seed(page);await open(page);
 assert.ok(await page.isVisible('#reviewPanel'));
 assert.deepEqual(await texts(page,'[data-pfor="orders"] [data-tab]'),['الطلبيات','الفواتير','قوايم المخازن','الانتظار'],'no new small tab (the row would not fit a phone): the review is the top of «الفواتير»');
 assert.ok(await page.isVisible('#docsPanel'),'the photos card is still there');
 assert.ok(await page.evaluate(()=>!!(document.getElementById('reviewPanel').compareDocumentPosition(document.getElementById('docsPanel'))&Node.DOCUMENT_POSITION_FOLLOWING)),'the review card comes first');
 assert.deepEqual(await texts(page,'#rvMain .py-h'),['مستنية موافقتك 4','وافقت عليها (بتتدخل) 1','وقفت 1','اتدخلت 1']);
 // the waiting ones in the box order 1, 2, 3, 9 (the number is in the circle)
 const ords=await page.$$eval('#rvMain .rv-card .rv-ord',(b)=>b.map(x=>x.textContent));
 assert.deepEqual(ords,['1','2','3','9','4','6','5'],'waiting by box number, then the laptop\'s, the stopped, the entered');
 const chips=await texts(page,'#rvMain .rv-card .rv-chip');
assert.deepEqual(chips,['جاهزة ✓','جاهزة ✓','جاهزة ✓','3 ملاحظات','اتوافق عليها، بتستنى اللاب','وقفت','اتدخلت ✓'],'the chips follow the cards');
 assert.match(await txt(page,'.rv-sum'),/4\s*فواتير مستنياك\s*1\s*فيها ملاحظات\s*1\s*عند اللاب/);
 // the one with the lines that do not add up to the paper shows the difference and is not part of «وافق على الجاهز»
 assert.match(await txt(page,'[data-rv="14"] .rv-tot'),/مجموع السطور 200\.00 غير صافي الورقة 500\.00\s*-300\.00/);
 assert.match(await txt(page,'[data-rv="12"] .rv-tot'),/مجموع السطور = صافي الورقة\s*165\.00 ✓/);
 assert.match((await page.textContent('[data-rv-allok]')).replace(/\s+/g,' '),/وملهوش ملاحظات \(2\) ودخّله/);
 await page.click('[data-rv-allok]');
 await page.waitForFunction(()=>window.__tables.ar_invoice_reviews.filter(r=>r.status==='approved').length===3,null,{timeout:5000});
 const st=Object.fromEntries((await rows(page)).map(r=>[r.id,r.status]));
 assert.deepEqual([st[12],st[13],st[14],st[11]],['approved','approved','ready','ready'],'only the two clean ones went; the lines-do-not-add-up one and the one with notes stay');
 assert.match(await txt(page,'#rvStatus'),/وافقت على 2 فواتير/);
 assert.deepEqual(await texts(page,'#rvMain .py-h'),['مستنية موافقتك 2','وافقت عليها (بتتدخل) 3','وقفت 1','اتدخلت 1']);
});

run('Invoice review: the notes, each answer saved, the button works only when all are answered (button and Enter)',async({page})=>{
 await seed(page);await open(page);
 // the invoice with notes opens by itself, its flagged lines are marked, and the button waits
 assert.ok(await page.isVisible('[data-rv="11"] .rv-body'),'it opens by itself');assert.ok(!(await page.isVisible('[data-rv="12"] .rv-body')),'a ready one is closed');
 assert.equal(await page.$$eval('[data-rv="11"] tr.rv-flag',(b)=>b.length),2,'lines 1 and 2 are flagged (the third note is general)');
 assert.equal(await page.isDisabled('[data-rv-approve="11"]'),true);
 assert.match(await txt(page,'[data-rv="11"] .rv-h'),/كمّل 3 حاجة الأول وبعدين الزرار يشتغل/);
 assert.match(await txt(page,'[data-rv="11"] [data-note="n1"]'),/سطر 1: بات: الأمر ١ والمندوب باعت ١٣ هعمل: هدخل ١ وأرجّع ١٢/);
 // «ماشي كده» saves {v:'ok'}
 await page.click('[data-rv-ok="11|n1"]');
 await page.waitForFunction(()=>window.__tables.ar_invoice_reviews.find(r=>r.id===11).answers.n1,null,{timeout:5000});
 assert.deepEqual((await row(page,11)).answers.n1,{v:'ok'});
 assert.match(await txt(page,'[data-note="n1"] .rv-chosen'),/ماشي كده ✓/);
 // «غيّرها» opens the choices; a choice saves {v:'alt',k,t}; his own words save {v:'text'}
 assert.ok(!(await page.isVisible('[data-rv-box="11|n2"]')),'the choices are closed until «غيّرها»');
 await page.click('[data-rv-chg="11|n1"]');assert.ok(await page.isVisible('[data-rv-box="11|n1"]'));
 await page.click('[data-rv-alt="11|n1|b"]');
 await page.waitForFunction(()=>window.__tables.ar_invoice_reviews.find(r=>r.id===11).answers.n1.v==='alt',null,{timeout:5000});
 assert.deepEqual((await row(page,11)).answers.n1,{v:'alt',k:'b',t:'أدخل الـ١٣ من غير مرتجع'});
 assert.match(await txt(page,'[data-note="n1"] .rv-chosen'),/هتتعمل: أدخل الـ١٣ من غير مرتجع/);
 await page.click('[data-rv-chg="11|n2"]');await page.fill('[data-rv-text="11|n2"]','KYRATOVER 3% بسعر 30');await page.press('[data-rv-text="11|n2"]','Tab');
 await page.waitForFunction(()=>window.__tables.ar_invoice_reviews.find(r=>r.id===11).answers.n2,null,{timeout:5000});
 assert.deepEqual((await row(page,11)).answers.n2,{v:'text',t:'KYRATOVER 3% بسعر 30'});
 assert.equal(await page.isDisabled('[data-rv-approve="11"]'),true,'one note is still open');
 assert.match(await txt(page,'[data-rv="11"] .rv-h'),/كمّل 1 حاجة الأول وبعدين الزرار يشتغل/);
 assert.match(await txt(page,'[data-rv="11"] .rv-chip'),/1\s*ملاحظة/);
 await page.click('[data-rv-ok="11|n3"]');
 await page.waitForFunction(()=>!document.querySelector('[data-rv-approve="11"]').disabled,null,{timeout:5000});
 assert.match(await txt(page,'[data-rv="11"] .rv-h'),/اضغط الزرار أو Enter/);assert.match(await txt(page,'[data-rv="11"] .rv-chip'),/جاهزة ✓/);
 // his note on the invoice is saved when he leaves the box
 await page.fill('#rvNote11','اكتب اسم الصنف بالإنجليزي');await page.press('#rvNote11','Tab');
 await page.waitForFunction(()=>window.__tables.ar_invoice_reviews.find(r=>r.id===11).owner_note,null,{timeout:5000});
 assert.equal((await row(page,11)).owner_note,'اكتب اسم الصنف بالإنجليزي');assert.match(await txt(page,'#rvStatus'),/ملاحظتك اتبعتت/);
 // Enter (nothing focused) approves the open invoice whose button is enabled
 await page.evaluate(()=>document.activeElement&&document.activeElement.blur());await page.keyboard.press('Enter');
 await page.waitForFunction(()=>window.__tables.ar_invoice_reviews.find(r=>r.id===11).status==='approved',null,{timeout:5000});
 assert.match(await txt(page,'[data-rv="11"] .rv-chip'),/اتوافق عليها، بتستنى اللاب/);
 assert.match(await txt(page,'#rvMain'),/وافقت، واللاب بيبدأ دلوقتي/);
 // an approval can be taken back before the laptop starts
 await page.click('[data-rv-back="11"]');
 await page.waitForFunction(()=>window.__tables.ar_invoice_reviews.find(r=>r.id===11).status==='ready',null,{timeout:5000});
 assert.match(await txt(page,'#rvStatus'),/رجعتها جاهزة/);
});

run('Invoice review: hold, the laptop\'s results, the paper\'s photo and its viewer, the badge and the home row, the empty screen',async({page})=>{
 await seed(page);
 // the badge and the home row count the READY ones (a held one waits on purpose, an approved one is the laptop's)
 await page.evaluate(()=>{const now=new Date().toISOString();window.__tables.ar_documents=[{id:'d1',source:'whatsapp',file_path:'docs/2026-11-21/1.jpg',kind:'image',status:'new',received_at:now},{id:'d2',source:'whatsapp',file_path:'docs/2026-11-21/2.jpg',kind:'image',status:'new',received_at:now}]});
 await page.evaluate(()=>window.AskerNotify.tick());
 await page.waitForFunction(()=>document.querySelector('.subbar [data-tab="docs"]')?.dataset.badge,null,{timeout:5000});
 assert.equal(await page.getAttribute('.subbar [data-tab="docs"]','data-badge'),'6','two photos waiting + four prepared invoices on the one small tab');
 const todo=(await texts(page,'#todoList .todo-row')).join('|');
 assert.match(todo,/4\s*فاتورة متجهزة مستنية موافقتك/);assert.match(todo,/2\s*صورة مستنية في الفواتير/);
 await open(page);
 // hold: the invoice stays but is not counted and not entered until he approves it
 await page.click('[data-rv="12"] [data-rv-toggle]');await page.click('[data-rv-hold="12"]');
 await page.waitForFunction(()=>window.__tables.ar_invoice_reviews.find(r=>r.id===12).status==='held',null,{timeout:5000});
 assert.match(await txt(page,'[data-rv="12"] .rv-chip'),/موقوفة/);assert.match(await txt(page,'[data-rv="12"] .rv-body'),/موقوفة: هتتدخل لما توافق/);
 assert.equal(await page.isDisabled('[data-rv-approve="12"]'),false,'a held one can be approved');
 // the laptop's results: entered (the message, the check, the time) and stopped (in the warning style)
 await page.click('[data-rv="16"] [data-rv-toggle]');
 assert.match(await txt(page,'[data-rv="16"] .rv-done'),/اتدخلت، المجموع 702\.30 · صفر فروق/);
 await page.click('[data-rv="17"] [data-rv-toggle]');
 assert.match(await txt(page,'[data-rv="17"] .rv-done.bad'),/وقفت عند رسالة جديدة في فارمافلاي/);
 // the paper's photo: the thumbnail is turned as published (180°), the viewer rotates by 90° and closes
 assert.equal(await page.$eval('[data-rv="11"] .rv-ph img',(i)=>i.style.transform),'rotate(180deg)');
 await page.click('[data-rv="11"] .rv-ph');
 assert.ok(await page.isVisible('.rv-shot img'));assert.equal(await page.$eval('.rv-shot img',(i)=>i.style.transform),'rotate(180deg)');
 await page.click('[data-rv-rot]');assert.equal(await page.$eval('.rv-shot img',(i)=>i.style.transform),'rotate(270deg)');
 await page.click('[data-rv-close]');assert.equal(await page.$('.rv-shot'),null);
 // a paper whose photo is not in the bucket any more says so
 assert.match(await txt(page,'[data-rv="12"] .rv-body'),/صورة الورقة اتأرشفت على اللاب/);
 // nothing prepared: a calm line
 await page.evaluate(()=>{window.__tables.ar_invoice_reviews=[];return window.AskerInvReview.open()});
 await page.waitForFunction(()=>/مفيش فواتير متجهزة دلوقتي/.test(document.getElementById('rvMain').textContent),null,{timeout:5000});
 assert.equal(await page.$('[data-rv-allok]'),null);
 // a staff member with the invoices switch sees the photos, never this card (the table is the owner's)
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;window.AskerApp.showTab('home');window.AskerApp.showTab('docs')});
 assert.ok(!(await page.isVisible('#reviewPanel')),'hidden for staff');assert.ok(await page.isVisible('#docsPanel'));
});

run('Invoice review: the public price of a cosmetics line (owner 2026-11-21): the box shows the card\'s price, he leaves it or types another, only then the card follows',async({page})=>{
 await page.evaluate(()=>{
  const mk=(id,doc,lines,total)=>({id,batch:'2026-11-21',ord:null,supplier:'مخزن مثال',doc_no:doc,paper_date:'2026-11-17',total,photos:[],lines,notes:[],answers:{},owner_note:null,status:'ready',result:null,created_at:new Date().toISOString(),done_at:null});
  const L1=(n,total)=>({n,paper:'دوا مثال '+n,qty:2,net:45.5,pub:70,disc:35,exp:'112028',id:100+n,name:'EXAMPLE '+n,total,card:70,info:'سعر الكارت 60 ← 70'});
  const L2=(n,total,x)=>({n,paper:'مستحضر مثال '+n,qty:4,net:27.25,ask:'price',card:40,pub:45,disc:null,exp:'',id:100+n,name:'EXAMPLE '+n,total,info:'جمهور الورقة 45',...x});
  window.__tables.ar_invoice_reviews=[mk(21,'149233',[L1(1,91),L2(2,109)],200),mk(22,'149234',[L2(1,109,{card:null,id:0,name:'NEW ITEM'})],109)];
 });
 await open(page);
 // both cards open by themselves; the line with a card price shows it in the box and the discount from it, nothing asked, the card says it stays
 assert.ok(await page.isVisible('[data-rv="21"] .rv-body'));
 assert.equal(await page.inputValue('[data-rv-price="21|2"]'),'40');
 assert.match(await txt(page,'[data-rv="21"] tr.rv-asked'),/مستحضر مثال 2.*4 × 31\.875% ·/);
 assert.match(await txt(page,'[data-rv="21"] .rv-lines'),/دوا مثال 1.*سعر الكارت 60 ← 70.*2 × 35% · 11\/2028/);
 assert.match(await txt(page,'[data-rv="21"] .rv-askrow'),/سعر الجمهور\s*خد سعر الورقة \(45\).*الخصم 31\.875% · التكلفة 27\.25/);
 assert.equal(await page.$('[data-rv="21"] .rv-chg'),null,'nothing changes in PharmaFly while he leaves it');
 assert.equal(await page.isDisabled('[data-rv-approve="21"]'),false,'he can approve without touching the price');assert.match(await txt(page,'[data-rv="21"] .rv-chip'),/جاهزة ✓/);
 // a new item has no card price: the box is empty, the approval waits
 assert.equal(await page.inputValue('[data-rv-price="22|1"]'),'');assert.equal(await page.getAttribute('[data-rv-price="22|1"]','placeholder'),'اكتبه هنا');
 assert.equal(await page.isDisabled('[data-rv-approve="22"]'),true);assert.match(await txt(page,'[data-rv="22"] .rv-h'),/كمّل 1 حاجة الأول وبعدين الزرار يشتغل/);
 assert.match(await txt(page,'[data-rv="22"] .rv-chip'),/1\s*ملاحظة/,'the chip counts it');
 // below the paper's net: refused, nothing saved, the box goes back to the price in force
 await page.fill('[data-rv-price="21|2"]','20');await page.press('[data-rv-price="21|2"]','Tab');
 await page.waitForFunction(()=>/سعر الجمهور لازم يكون 27\.25 أو أكتر/.test(document.getElementById('rvStatus').textContent),null,{timeout:5000});
 assert.equal((await row(page,21)).answers.L2,undefined);assert.equal(await page.inputValue('[data-rv-price="21|2"]'),'40');
 // Arabic digits and the Arabic decimal mark are fine: saved as a number, the discount shown, the card's change announced
 await page.fill('[data-rv-price="21|2"]','٣٩٫٥');await page.press('[data-rv-price="21|2"]','Tab');
 await page.waitForFunction(()=>{const r=window.__tables.ar_invoice_reviews.find(x=>x.id===21);return r.answers.L2},null,{timeout:5000});
 assert.deepEqual((await row(page,21)).answers.L2,{v:'price',t:'39.5'});
 assert.equal(await page.inputValue('[data-rv-price="21|2"]'),'39.5');
 assert.match(await txt(page,'[data-rv="21"] .rv-askrow'),/الخصم 31\.0127% · التكلفة 27\.25.*هيتغيّر في الكارت: 40 ← 39\.5/);
 assert.match(await txt(page,'[data-rv="21"] tr.rv-asked'),/4 × 31\.0127% ·/);
 // «خد سعر الورقة (45)» sets the paper's price in one tap (for the new item: its price is his answer)
 await page.click('[data-rv-pub="22|1|45"]');
 await page.waitForFunction(()=>{const r=window.__tables.ar_invoice_reviews.find(x=>x.id===22);return r.answers.L1},null,{timeout:5000});
 assert.deepEqual((await row(page,22)).answers.L1,{v:'price',t:'45'});assert.match(await txt(page,'[data-rv="22"] .rv-askrow'),/الخصم 39\.4444% · التكلفة 27\.25.*هيتغيّر في الكارت: جديد ← 45/);
 assert.equal(await page.isDisabled('[data-rv-approve="22"]'),false);
 // «وافق على الجاهز» takes both (no notes, the lines add up, no price missing)
 assert.match((await page.textContent('[data-rv-allok]')).replace(/\s+/g,' '),/\(2\)/);
 await page.click('[data-rv-approve="21"]');
 await page.waitForFunction(()=>window.__tables.ar_invoice_reviews.find(r=>r.id===21).status==='approved',null,{timeout:5000});
 assert.deepEqual((await row(page,21)).answers.L2,{v:'price',t:'39.5'},'his price travels with the approval');
 // after the approval the box is locked
 assert.equal(await page.isDisabled('[data-rv-price="21|2"]'),true);assert.equal(await page.$('[data-rv-pub="21|2|45"]'),null);
});