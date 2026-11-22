// What the sales robot needs from the system (owner 2026-11-22, mockup robot_sales_tools_2026-11-22, his «نفس الخطة»):
// «🤖 الروبوت محتاج رأيك» (its reports, answered by the owner, with a home row, a ring and a sentence said out loud), «✏️ تعديل الحد» on a customer's card (it waits for the
// robot in PharmaFly), and a credit bill over the limit saved by the owner only after a second tap, carrying his approval. Made-up customers and items only.
const {run,text,assert}=require('./harness.cjs');

run('Robot reports: the open questions at the top of «البيع المؤقت», one tap on an answer or his own words, a home row; staff see none',async({page})=>{
 await page.evaluate(()=>{
  window.__tables.ar_stock=[];window.__tables.ar_customers=[];window.__tables.ar_temp_sales=[];
  window.__tables.ar_robot_reports=[
   {id:7,created_at:new Date().toISOString(),job:'sales',ref_id:'x1',title:'بيعة 14 متجاوزة الحد',details:'العميل أحمد عليه 4,650 + 581 والحد 5,000',options:[{key:'yes',label:'كمّل وسجّلها'},{key:'wait',label:'خليها مستنية'}],status:'open'},
   {id:8,created_at:new Date().toISOString(),job:'sales',ref_id:'x2',title:'صنف مش لاقيه: كود 99999',details:null,options:[],status:'open'},
   {id:9,created_at:new Date().toISOString(),job:'sales',ref_id:'x3',title:'اتجاوب عليه',details:null,options:[],status:'answered'}];
  window.__answers=[];
  window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{ar_robot_answer:(a)=>{window.__answers.push(a);const r=window.__tables.ar_robot_reports.find(x=>x.id===a.p_id);if(!r||r.status!=='open')return {ok:false,error:'state'};r.status='answered';r.answer_key=a.p_key;r.answer_text=a.p_text;return {ok:true}}});
  window.__said=[];Object.defineProperty(window,'speechSynthesis',{value:{speak:(u)=>window.__said.push(u.text),getVoices:()=>[],cancel(){}},configurable:true});window.SpeechSynthesisUtterance=function(t){this.text=t};
 });
 // the home: the row comes first, and a new question rings and is said out loud
 await page.evaluate(()=>{localStorage.setItem('asker-notify-seen',JSON.stringify({robot:0}))});
 await page.evaluate(()=>window.AskerNotify.tick());
 await page.waitForFunction(()=>/الروبوت محتاج رأيك/.test(document.getElementById('todoList')?.textContent||''));
 assert.match(await text(page,'#todoList .todo-row:first-child'),/^2\s*🤖 الروبوت محتاج رأيك/);
 await page.waitForFunction(()=>window.__said.includes('الروبوت محتاج رأيك'),null,{timeout:4000});
 // «البيع المؤقت»: the box with the two open ones (not the answered one)
 await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="tempsale"]');
 await page.waitForSelector('#rbBox:not(.hidden) .rb-card');
 assert.deepEqual(await page.$$eval('#rbBox .rb-card .rb-title',x=>x.map(e=>e.textContent)),['بيعة 14 متجاوزة الحد','صنف مش لاقيه: كود 99999']);
 assert.match(await text(page,'#rbBox .rb-h'),/🤖 الروبوت محتاج رأيك 2/);
 assert.deepEqual(await page.$$eval('#rbBox [data-rb="7"] [data-rb-key]',b=>b.map(x=>[x.dataset.rbKey,x.textContent.trim()])),[['yes','كمّل وسجّلها'],['wait','خليها مستنية']]);
 // one tap on an answer
 await page.click('#rbBox [data-rb="7"] [data-rb-key="yes"]');
 await page.waitForFunction(()=>window.__answers.length===1);
 assert.deepEqual(await page.evaluate(()=>window.__answers[0]),{p_id:7,p_key:'yes',p_text:null});
 await page.waitForSelector('#rbBox [data-rb="7"]',{state:'detached'});
 assert.match(await text(page,'#rbBox .rb-msg'),/اتبعت للروبوت ✓/);
 // his own words: empty = a line, then sent
 await page.click('#rbBox [data-rb="8"] [data-rb-send]');
 assert.match(await text(page,'#rbBox .rb-msg'),/اختار رد أو اكتب له تعمل إيه/);
 await page.fill('#rbBox [data-rb="8"] [data-rb-text]','سيبها لحد ما أشوفها');
 await page.press('#rbBox [data-rb="8"] [data-rb-text]','Enter');
 await page.waitForFunction(()=>window.__answers.length===2);
 assert.deepEqual(await page.evaluate(()=>window.__answers[1]),{p_id:8,p_key:null,p_text:'سيبها لحد ما أشوفها'});
 await page.waitForSelector('#rbBox .rb-card',{state:'detached'});
 // a staff member: nothing is asked of him
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;window.__tables.ar_robot_reports.push({id:10,created_at:new Date().toISOString(),title:'سؤال',options:[],status:'open'});return window.AskerRobot.open()});
 await page.waitForTimeout(400);
 assert.equal(await page.$('#rbBox .rb-card'),null,'staff never see the robot\'s questions');
},{home:true});

run('Customer limit: «✏️ تعديل الحد» on his card, the new limit waits for PharmaFly, changed, cancelled; the same limit is refused; staff see none',async({page,table})=>{
 await page.evaluate(()=>{
  window.__tables.ar_customers=[{id:101,name:'أحمد محمود',credit_limit:5000,balance:4650,last_at:'2026-11-20T11:00:00',last_kind:'sale',moves:1}];
  window.__tables.ar_customer_moves=[{id:11,customer_id:101,at:'2026-11-20T11:00:00',kind:'sale',total:100,paid:0,balance:4650,items:[{n:'B',p:1,u:0,k:1,s:100,d:0}]}];
  window.__tables.ar_customer_phones=[];window.__tables.ar_limit_requests=[];
 });
 const open=async()=>{await page.click('[data-group="accounts"]');await page.waitForSelector('#cuBox:not(.hidden)');await page.click('#cuChips [data-cu-view="all"]');await page.click('#cuRows [data-cu="101"]');await page.waitForSelector('#cuSt:not(.hidden) .cu-mv')};
 await open();
 await page.waitForSelector('#cuSt [data-cu-lim-edit]');
 assert.equal((await page.textContent('#cuSt .cu-lim-btn')).trim(),'✏️ تعديل الحد');
 await page.click('#cuSt [data-cu-lim-edit]');
 assert.equal(await page.inputValue('#cuLimIn'),'5000','the box starts on the limit of his card');
 await page.click('#cuSt [data-cu-lim-save]');
 assert.match(await text(page,'#cuSt .cu-note'),/ده نفس الحد اللي في كارته دلوقتي/);
 await page.fill('#cuLimIn','');await page.click('#cuSt [data-cu-lim-save]');
 assert.match(await text(page,'#cuSt .cu-note'),/اكتب الحد بالأرقام/);
 await page.fill('#cuLimIn','8000');await page.click('#cuSt [data-cu-lim-save]');
 await page.waitForSelector('#cuSt .cu-lim-wait');
 assert.match(await text(page,'#cuSt .cu-lim-wait'),/الحد الجديد 8,000 ج مستني يتنفذ في فارمافلاي/);
 const r1=(await table('ar_limit_requests'))[0];
 assert.deepEqual({c:r1.customer_id,o:r1.old_limit,n:r1.new_limit,s:r1.status},{c:101,o:5000,n:8000,s:'pending'});
 // «غيّره»: the same waiting row gets the new number
 await page.click('#cuSt [data-cu-lim-edit]');assert.equal(await page.inputValue('#cuLimIn'),'8000');
 await page.fill('#cuLimIn','9000');await page.click('#cuSt [data-cu-lim-save]');
 await page.waitForFunction(()=>/9,000/.test(document.querySelector('#cuSt .cu-lim-wait')?.textContent||''));
 assert.deepEqual((await table('ar_limit_requests')).map(r=>[r.new_limit,r.status]),[[9000,'pending']],'one waiting row');
 // «الغيه» (a confirm): back to the button
 page.once('dialog',(d)=>d.accept());
 await page.click('#cuSt [data-cu-lim-drop]');
 await page.waitForSelector('#cuSt .cu-lim-btn');
 assert.deepEqual((await table('ar_limit_requests')).map(r=>r.status),['cancelled']);
 // a staff member: no button
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true});
 await page.click('#cuSt [data-cu-back]');await page.waitForSelector('#cuRows [data-cu="101"]');
 await page.click('#cuRows [data-cu="101"]');await page.waitForSelector('#cuSt:not(.hidden) .cu-mv');
 await page.waitForTimeout(300);
 assert.equal(await page.$('#cuSt [data-cu-lim-edit]'),null,'staff never change a limit');
});

run('Temp sale over the limit: the owner\'s first tap only asks, the second saves it with his approval; a change asks again; a staff member\'s bill carries no approval',async({page,table})=>{
 const STOCK=[{item_id:4875,name:'CREAM SMALL',arabic_name:'كريم صغير',price:250,packs:5,units:0,parts:1,exp_near:null,other:[],data_at:'2026-11-12 22:00:00'}];
 await page.evaluate(([s])=>{window.__tables.ar_stock=s;window.__tables.ar_customers=[{id:101,name:'عميل تجربة',credit_limit:300,balance:250}];window.__tables.ar_temp_sales=[];localStorage.removeItem('asker-ts-queue')},[STOCK]);
 const openSale=async()=>{await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="tempsale"]');await page.waitForSelector('#tempSalePanel:not(.hidden)');await page.waitForFunction(()=>!/بيحمّل الأصناف/.test(document.getElementById('tsFind').textContent))};
 const bill=async()=>{await page.fill('#tsQ','كريم صغير');await page.waitForSelector('#tsHits [data-ts-add="4875"]');await page.click('#tsHits [data-ts-add="4875"]');await page.waitForSelector('#tsCart .ts-line');
  await page.click('[data-ts-credit]');await page.fill('#tsCQ','عميل تجربة');await page.click('#tsCHits [data-ts-cust="101"]');await page.waitForSelector('#tsCust .ts-warn')};
 await openSale();await bill();
 assert.equal(await text(page,'#tsSave'),'احفظ البيعة');
 await page.click('#tsSave');
 assert.match(await text(page,'#tsStatus'),/العميل هيعدّي الحد: هيبقى عليه 500 ج والحد 300 ج\. لو موافق دوس «احفظ» تاني/);
 assert.equal(await text(page,'#tsSave'),'موافق: احفظها متجاوزة الحد');
 assert.equal((await table('ar_temp_sales')).length,0,'the first tap saves nothing');
 // he changes the bill (pays a little): the question starts again
 await page.fill('#tsPaid','50');
 assert.equal(await text(page,'#tsSave'),'احفظ البيعة');
 await page.click('#tsSave');assert.match(await text(page,'#tsStatus'),/هيبقى عليه 450 ج والحد 300 ج/);
 await page.click('#tsSave');
 await page.waitForFunction(()=>(window.__tables.ar_temp_sales||[]).length===1);
 const r=(await table('ar_temp_sales'))[0];
 assert.ok(r.limit_ok_at,'his approval goes with the bill');assert.equal(r.limit_over,150);assert.equal(r.customer_id,101);
 assert.equal(await text(page,'#tsSave'),'احفظ البيعة','the next bill starts clean');
 // in the list: the approval shows
 await page.click('[data-ts-view="list"]');await page.waitForSelector('#tsRows .ts-sale');
 assert.match(await text(page,'#tsRows .ts-sale'),/✓ موافق على التجاوز/);
 // a staff member: one tap saves, with no approval (the robot will ask the owner)
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;window.AskerStaff.can=()=>true});
 await page.click('[data-ts-view="new"]');await bill();
 await page.click('#tsSave');
 await page.waitForFunction(()=>(window.__tables.ar_temp_sales||[]).length===2);
 const s=(await table('ar_temp_sales'))[1];
 assert.equal(s.limit_ok_at==null&&s.limit_over==null,true,'no approval from a staff member');
});
