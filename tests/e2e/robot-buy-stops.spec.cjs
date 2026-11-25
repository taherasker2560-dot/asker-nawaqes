// What the PURCHASE robot needs the owner to see (owner 2026-11-25, mockup mockups/robot_stops_on_review_2026-11-25, his «ابنيها»): when the robot on the laptop stops on an invoice, or types
// it all and waits for the check, the stop is a card at the top of «🧾 مراجعة الفواتير» (the same table as the sales robot's questions, job «purchases»), the invoice's own card says so,
// the home row + the ring + the sentence said out loud tell him, and a card the robot will not type (job «purchases_wait») is shown quietly (never rung). The sales box does not show them.
// Made-up suppliers and invoices only: the repository is public.
const {run,assert}=require('./harness.cjs');
const flat=(x)=>{const w=document.createTreeWalker(x,NodeFilter.SHOW_TEXT),a=[];let n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\s+/g,' ').trim()};
const texts=(page,sel)=>page.$$eval(sel,(b,f)=>b.map(new Function('x','return ('+f+')(x)')),flat.toString());
const seed=(page)=>page.evaluate(()=>{
 const mk=(id,ord,sup,no,total,status)=>({id,batch:'2026-11-25',ord,supplier:sup,doc_no:no,paper_date:'2026-11-24',total,photos:[],lines:[{n:1,paper:'دوا مثال',qty:2,disc:25,exp:'082029',id:101,name:'EXAMPLE 10MG 20 TAB',total}],notes:[],answers:{},owner_note:null,status,result:null,created_at:new Date().toISOString(),done_at:null});
 window.__tables.ar_invoice_reviews=[mk(31,1,'مورد أ','900001',100,'entering'),mk(32,2,'مورد ب','900002',200,'approved'),mk(33,3,'مورد ج','900003',300,'approved'),mk(34,4,'مورد د','900004',400,'ready')];
 window.__tables.ar_stock=[];window.__tables.ar_customers=[];window.__tables.ar_temp_sales=[];
 const at=(m)=>new Date(Date.now()-m*60000).toISOString();
 window.__tables.ar_robot_reports=[
  {id:7,created_at:at(30),job:'sales',ref_id:'x1',title:'بيعة 14 متجاوزة الحد',details:null,options:[],status:'open'},
  {id:22,created_at:at(20),job:'purchases_wait',ref_id:'card:32:needs_helper',title:'مورد ب 900002',details:'فيه صنف جديد من غير أمر تجهيز',options:[],status:'open'},
  {id:21,created_at:at(10),job:'purchases',ref_id:'card:31:stop',title:'مورد أ 900001',details:'السطر 7: الخصم على الشاشة 33 والمفروض 38\nمحادثة الفواتير ماسكاها ✓',options:[],status:'open'},
  {id:23,created_at:at(50),job:'purchases',ref_id:'card:33:stop',title:'مورد ج 900003',details:'اتحلّت',options:[],status:'done'}];
 window.__said=[];Object.defineProperty(window,'speechSynthesis',{value:{speak:(u)=>window.__said.push(u.text),getVoices:()=>[],cancel(){}},configurable:true});window.SpeechSynthesisUtterance=function(t){this.text=t};
});

run('Purchase robot stops: the home row, the ring and the sentence; the helper\'s waiting card never rings; the sales box does not show them',async({page})=>{
 await seed(page);
 await page.evaluate(()=>{localStorage.setItem('asker-notify-seen',JSON.stringify({robot:1,robotbuy:0}))});
 await page.evaluate(()=>window.AskerNotify.tick());
 await page.waitForFunction(()=>/الروبوت وقف عند فاتورة/.test(document.getElementById('todoList')?.textContent||''));
 const todo=await texts(page,'#todoList .todo-row');
 assert.ok(todo.some(x=>/^1\s*🤖 الروبوت محتاج رأيك/.test(x)),'the sales question still counts 1 (the purchase stops are not in it): '+todo.join('|'));
 assert.ok(todo.some(x=>/^1\s*🤖 الروبوت وقف عند فاتورة/.test(x)),'one stop counts, the helper\'s waiting card and the done one do not: '+todo.join('|'));
 await page.waitForFunction(()=>window.__said.includes('الروبوت وقف عند فاتورة'),null,{timeout:4000});
 assert.equal(await page.evaluate(()=>window.__said.includes('الروبوت محتاج رأيك')),false,'the sales robot did not ring: it had nothing new');
 // «البيع المؤقت»: only the sales robot's question
 await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="tempsale"]');
 await page.waitForSelector('#rbBox:not(.hidden) .rb-card');
 assert.deepEqual(await page.$$eval('#rbBox .rb-card .rb-title',x=>x.map(e=>e.textContent)),['بيعة 14 متجاوزة الحد']);
},{home:true});

run('Purchase robot stops: the cards at the top of «مراجعة الفواتير», the invoice\'s chip, a tap opens its card, a finished stop goes',async({page})=>{
 await seed(page);
 await page.click('[data-pgroup="orders"]');await page.click('[data-tab="docs"]');await page.waitForSelector('#rvMain .rv-card');
 await page.waitForSelector('#rvStops .rb-card');
 // the stopped one first, then the helper's; the done one and the sales question are not here
 assert.deepEqual(await texts(page,'#rvStops .rb-title'),['🤖 الروبوت وقف عند فاتورة','🤖 الروبوت محتاج المساعد']);
 const d=await texts(page,'#rvStops .rb-details');
 assert.match(d[0],/مورد أ 900001/);assert.match(d[0],/السطر 7: الخصم على الشاشة 33 والمفروض 38/);assert.match(d[0],/محادثة الفواتير ماسكاها ✓/);
 assert.match(d[1],/مورد ب 900002/);assert.match(d[1],/فيه صنف جديد من غير أمر تجهيز/);
 // the box is above the invoices
 assert.equal(await page.evaluate(()=>{const s=document.getElementById('rvStops'),c=document.querySelector('#rvMain .rv-card');return !!(s.compareDocumentPosition(c)&Node.DOCUMENT_POSITION_FOLLOWING)}),true);
 // the invoices' own chips: the stop, the helper's wait, the others as before
 const chip=(id)=>page.$eval(`[data-rv="${id}"] .rv-chip`,x=>x.textContent.trim());
 assert.equal(await chip(31),'وقف عندها الروبوت');assert.equal(await chip(32),'مستنية المساعد');
 assert.equal(await chip(33),'اتوافق عليها، بتستنى اللاب','a card with no stop keeps its own words (its stop is done)');
 // a tap on the stop opens that invoice's card
 assert.equal(await page.$eval('[data-rv="31"]',x=>x.classList.contains('open')),false);
 await page.click('#rvStops [data-rv-stop="31"]');
 await page.waitForSelector('[data-rv="31"].open');
 // the laptop finishes the invoice: the stop is done and goes at the next look (and the chip goes back to its own words)
 await page.evaluate(()=>{window.__tables.ar_robot_reports.find(r=>r.id===21).status='done';return window.AskerInvReview.load()});
 await page.waitForFunction(()=>document.querySelectorAll('#rvStops .rb-card').length===1);
 assert.deepEqual(await texts(page,'#rvStops .rb-title'),['🤖 الروبوت محتاج المساعد']);
 assert.equal(await chip(31),'بتتدخل…');
 await page.evaluate(()=>{window.__tables.ar_robot_reports.find(r=>r.id===22).status='done';return window.AskerInvReview.load()});
 await page.waitForFunction(()=>!document.getElementById('rvStops'));
});
