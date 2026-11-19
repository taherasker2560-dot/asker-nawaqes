// «💸 المدفوعات» (owner 2026-11-19, mockup mockups/payments_2026-11-19.png, «ب»): the open orders (a difference side by side, a late
// one, waiting ones), what was paid with its filters, a new supplier payment (search, box, amount, the before → after summary, the
// warning above the box's balance, approve), an expense saved for later then edited and approved, «هي دي، اقفله», cancel with a
// second tap, the red number. The server's two functions are played here (the real ones are tested in tests/pay-migration.cjs).
const {run,assert}=require('./harness.cjs');
// the text of an element with a space between its pieces (textContent glues «A M group» to «10,000 ج»)
const flat=(x)=>{const w=document.createTreeWalker(x,NodeFilter.SHOW_TEXT),a=[];let n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\s+/g,' ').trim()};
const texts=(page,sel)=>page.$$eval(sel,(b,f)=>b.map(new Function('x','return ('+f+')(x)')),flat.toString());
const txt=(page,sel)=>page.$eval(sel,(x,f)=>new Function('x','return ('+f+')(x)')(x),flat.toString());
run('Payments: open orders, what was paid, a new payment approved, an expense for later, a difference closed, a cancel',async({page})=>{
 await page.evaluate(()=>{
  const p=n=>String(n).padStart(2,'0');
  const loc=(ms)=>{const d=new Date(Date.now()-ms);return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`};
  const iso=(h)=>new Date(Date.now()-h*36e5).toISOString();
  const T=window.__tables;
  T.ar_cash_accounts=[{id:2,name:'الخزينة الرئيسية',balance:415},{id:3,name:'محفظه فودافون',balance:7415.35},{id:4,name:'احتياطى',balance:45040}];
  T.ar_cash_cats=[{id:1,name:'مرتبات و اجور'},{id:5,name:'فواتير الموبايل'}];
  T.ar_vendors=[{id:2374,name:'A M group',short:'AMG',balance:124144.88,active:true},{id:2495,name:'IBN SINA 1',short:'IBN',balance:3471.51,active:true},{id:188,name:'IBN SINA 2',short:'IBN',balance:0,active:true}];
  T.ar_cash_moves=[
   {id:501,account_id:3,at:loc(2*864e5),op:9,kind:'vendor',amount:-37750,who:'kemi pharm',memo:null},
   {id:502,account_id:4,at:loc(864e5),op:9,kind:'vendor',amount:-27100,who:'IBN SINA 1',memo:null},
   {id:503,account_id:3,at:loc(5*864e5),op:1005,kind:'expense',amount:-1963,who:'فواتير الموبايل',memo:null},
   {id:504,account_id:4,at:loc(40*864e5),op:9,kind:'vendor',amount:-150000,who:'مخزن الفتح للادوية',memo:null},
   {id:505,account_id:3,at:loc(36e5),op:9,kind:'vendor',amount:-9500,who:'A M group',memo:null},
   {id:506,account_id:4,at:loc(3*864e5),op:51,kind:'owner',amount:-20000,who:null,memo:'طاهر'}];
  T.ar_pay_orders=[
   {id:10,kind:'vendor',account_id:4,account_name:'احتياطى',vendor_id:2374,cat_id:null,who:'A M group',amount:10000,memo:null,status:'mismatch',created_at:iso(2),approved_at:iso(2),move_id:505,move:{id:505,at:loc(36e5),account_id:3,amount:-9500,who:'A M group'}},
   {id:11,kind:'vendor',account_id:4,account_name:'احتياطى',vendor_id:2495,cat_id:null,who:'IBN SINA 1',amount:50000,memo:null,status:'approved',created_at:iso(3),approved_at:iso(3),move_id:null,move:null},
   {id:12,kind:'vendor',account_id:3,account_name:'محفظه فودافون',vendor_id:7,cat_id:null,who:'kemi pharm',amount:37000,memo:null,status:'matched',created_at:iso(50),approved_at:iso(50),move_id:501,move:{id:501,at:loc(2*864e5),account_id:3,amount:-37750,who:'kemi pharm',fix:750,fix_ids:[601]}}];
  // the server's functions, played
  let seq=100;const calls=window.__payCalls=[];
  window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{
   ar_pay_order_save:(a)=>{calls.push(['save',a]);const acc=T.ar_cash_accounts.find(x=>x.id===a.p_account);if(!acc)return {ok:false,error:'account'};
    const who=a.p_kind==='owner'?'صاحب المنشأة':a.p_kind==='vendor'?(T.ar_vendors.find(v=>v.id===a.p_party)||{}).name:(T.ar_cash_cats.find(c=>c.id===a.p_party)||{}).name;if(!who)return {ok:false,error:'party'};
    const row={kind:a.p_kind,account_id:a.p_account,account_name:acc.name,vendor_id:a.p_kind==='vendor'?a.p_party:null,cat_id:a.p_kind==='expense'?a.p_party:null,who,amount:a.p_amount,memo:a.p_memo,status:a.p_approve?'approved':'waiting',approved_at:a.p_approve?new Date().toISOString():null,move_id:null,move:null};
    if(a.p_id){const o=T.ar_pay_orders.find(x=>x.id===a.p_id);if(!o||o.status!=='waiting')return {ok:false,error:'not_waiting'};Object.assign(o,row);return {ok:true,id:o.id,status:o.status}}
    const id=++seq;T.ar_pay_orders.push({id,created_at:new Date().toISOString(),...row});return {ok:true,id,status:row.status}},
   ar_pay_order_act:(a)=>{calls.push(['act',a]);const o=T.ar_pay_orders.find(x=>x.id===a.p_id);if(!o)return {ok:false,error:'no_order'};
    if(a.p_action==='approve'){o.status='approved';o.approved_at=new Date().toISOString()}else if(a.p_action==='accept')o.status='matched';else if(a.p_action==='cancel')o.status='cancelled';else return {ok:false,error:'action'};
    return {ok:true,id:o.id,status:o.status}}});
 });
 // the red number: a difference + a late one (before the tab is opened)
 await page.evaluate(()=>window.AskerNotify.tick());
 assert.equal(await page.$eval('[data-tab="pay"]',b=>b.dataset.badge),'2');
 assert.match((await texts(page,'#todoList .todo-row')).join('|'),/2\s*أمر دفع فيه فرق أو لسه ما ظهرش في فارمافلاي/);
 await page.click('[data-group="accounts"]');await page.click('[data-tab="pay"]');
 assert.ok(await page.isVisible('#payPanel'));assert.ok(!(await page.isVisible('#cashPanel')));
 assert.ok(await page.isVisible('.subbar[data-for="accounts"] [data-tab="ops"]'),'the accounts tabs stay on top');assert.ok(await page.isVisible('.subbar[data-for="accounts"] .qa-pin'));
 await page.waitForSelector('#pyMain .py-card');
 // the three numbers: the last 30 days only (the owner too, 2026-11-19)
 assert.deepEqual(await texts(page,'#pyMain .py-tile'),['اتدفع لموردين (30 يوم) 74,350 ج 3 دفعة','مصروفات (30 يوم) 1,963 ج 1 مصروف','لصاحب المنشأة (30 يوم) 20,000 ج 1 مرة']);
 // the open orders: the difference first (the order and PharmaFly's move side by side), then the late one
 const open=await texts(page,'#pyMain [data-py-order]');
 assert.equal(open.length,2);
 assert.match(open[0],/دفعة لمورد · A M group 10,000 ج من خزنة احتياطى فيه فرق الأمر: 10,000 ج · احتياطى اللي ظهر في فارمافلاي: 9,500 ج · محفظه فودافون · \d\d\/\d\d \d\d:\d\d هي دي، اقفله مش هي الغي الأمر/);
 assert.match(open[1],/IBN SINA 1 50,000 ج .*اتوافق من أكتر من ساعتين ولسه ما ظهرش في فارمافلاي الغي$/);
 // what was paid: newest first, the one that closed an order says so
 const paid=await texts(page,'#pyMain .py-move');
 assert.equal(paid.length,6);
 assert.match(paid.join('|'),/لصاحب المنشأة · طاهر 20,000 ج \d\d\/\d\d \d\d:\d\d · احتياطى اتدخلت في فارمافلاي/,'the owner\'s note is his name; no «undefined»');
 assert.match(paid[0],/A M group 9,500 ج .*اتدخلت في فارمافلاي/);
 // paid 37,750 for an order of 37,000, then «دعم من صاحب المنشأة» 750 in that box (2026-11-19): closed by itself, and it says so
 assert.match(paid.join('|'),/kemi pharm 37,750 ج .*محفظه فودافون ✓ من أمر دفع اتصلّح بدعم 750 ج · الأمر كان 37,000 ج/);
 assert.equal(await page.$$eval('#pyMain .py-fix',x=>x.length),1,'only the corrected payment has the line');
 await page.click('[data-py-filter="expense"]');assert.deepEqual((await texts(page,'#pyMain .py-move')).length,1);
 await page.click('[data-py-filter="vendor"]');assert.deepEqual((await texts(page,'#pyMain .py-move')).length,4);
 await page.click('[data-py-filter="owner"]');assert.deepEqual((await texts(page,'#pyMain .py-move')).length,1);
 await page.click('[data-py-filter="all"]');await page.selectOption('#pyBox','4');assert.equal((await texts(page,'#pyMain .py-move')).length,3);
 await page.selectOption('#pyBox','');
 // a new supplier payment: nothing chosen → a sentence, not a call
 await page.click('#pyNew');await page.waitForSelector('#pyForm:not(.hidden)');
 assert.ok(!(await page.isVisible('#pyMain')));
 await page.click('#pyForm [data-py-step="confirm"]');
 assert.match(await page.textContent('#pyForm .status.bad'),/اختار المورد\./);
 // the search: both IBN cards show; «amg» finds A M group with its balance
 await page.fill('#pyVQ','ibn');assert.deepEqual(await texts(page,'#pyForm .py-pick b'),['IBN SINA 1','IBN SINA 2']);
 assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.id),'pyVQ','the search keeps the cursor');
 await page.fill('#pyVQ','amg');await page.click('#pyForm [data-py-party="2374"]');
 assert.match(await txt(page,'#pyForm .py-field'),/A M group AMG عليه 124,144.88 ج غيّر/);
 await page.click('#pyForm [data-py-account="2"]');await page.fill('#pyAmount','20,000');
 assert.match(await page.textContent('#pySum'),/المبلغ أكبر من رصيد الخزنة \(415 ج\)\./,'more than the box: a warning');
 assert.ok(await page.$eval('#pyForm [data-py-account="2"]',b=>b.classList.contains('low')));
 assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.id),'pyAmount','typing the amount keeps the cursor');
 await page.click('#pyForm [data-py-account="4"]');
 const sum=(await page.textContent('#pySum')).replace(/\s+/g,' ');
 assert.match(sum,/الخزنة: احتياطى 45,040 ← 25,040/);assert.match(sum,/رصيد المورد: 124,144.88 ← 104,144.88/);assert.doesNotMatch(sum,/أكبر/);
 await page.fill('#pyMemo','دفعة تحت الحساب');
 await page.click('#pyForm [data-py-step="confirm"]');
 assert.match(await txt(page,'#pyForm .py-confirm'),/دفعة لمورد · A M group 20,000 ج من خزنة احتياطى · دفعة تحت الحساب/);
 await page.click('#pyForm [data-py-save="approve"]');
 await page.waitForSelector('#pyForm.hidden',{state:'attached'});
 assert.deepEqual(await page.evaluate(()=>window.__payCalls[0]),['save',{p_id:null,p_kind:'vendor',p_account:4,p_party:2374,p_amount:20000,p_memo:'دفعة تحت الحساب',p_approve:true}]);
 assert.match((await texts(page,'#pyMain [data-py-order]')).join('|'),/A M group 20,000 ج من خزنة احتياطى · دفعة تحت الحساب اتوافق عليه: دخّله في فارمافلاي الغي/);
 // an expense saved for later, edited, then approved from the list
 await page.click('#pyNew');await page.click('#pyForm [data-py-kind="expense"]');
 assert.deepEqual(await texts(page,'#pyForm .py-cats .chip'),['مرتبات و اجور','فواتير الموبايل']);
 await page.click('#pyForm [data-py-party="1"]');await page.click('#pyForm [data-py-account="3"]');await page.fill('#pyAmount','١٣٠٠');await page.fill('#pyMemo','سارة');
 assert.doesNotMatch(await page.textContent('#pySum'),/رصيد المورد/,'an expense has no supplier balance');
 await page.click('#pyForm [data-py-step="confirm"]');await page.click('#pyForm [data-py-save="later"]');await page.waitForSelector('#pyForm.hidden',{state:'attached'});
 const waitCard='#pyMain [data-py-order="102"]';
 assert.match(await txt(page,waitCard),/مصروف · مرتبات و اجور 1,300 ج من خزنة محفظه فودافون · سارة مستني موافقتك أوافق عدّل الغي/);
 assert.ok(await page.$eval(waitCard,c=>c.classList.contains('py-wait')));
 await page.click(`${waitCard} [data-py-act="edit"]`);
 assert.equal(await page.inputValue('#pyAmount'),'1300');assert.equal(await page.inputValue('#pyMemo'),'سارة');
 assert.match(await page.textContent('#pyForm .cs-head'),/تعديل أمر دفع/);
 await page.fill('#pyAmount','1400');await page.click('#pyForm [data-py-step="confirm"]');await page.click('#pyForm [data-py-save="later"]');await page.waitForSelector('#pyForm.hidden',{state:'attached'});
 assert.equal(await page.evaluate(()=>window.__payCalls.at(-1)[1].p_id),102);
 await page.click(`${waitCard} [data-py-act="approve"]`);
 await page.waitForFunction(()=>/اتوافق عليه/.test(document.querySelector('#pyMain [data-py-order="102"]')?.textContent||''));
 assert.match(await page.textContent(waitCard),/1,400 ج/);
 // the owner (2026-11-19 «الدفع لصاحب المنشاه»): no supplier, no type; the note says for whom; no supplier balance in the summary
 await page.click('#pyNew');await page.click('#pyForm [data-py-kind="owner"]');
 assert.equal(await page.$('#pyVQ'),null);assert.equal(await page.$('#pyForm .py-cats'),null);
 assert.deepEqual(await texts(page,'#pyForm .py-seg button'),['🏭 مورد','🧾 مصروف','👤 صاحب المنشأة']);
 assert.match(await page.textContent('#pyForm label[for="pyMemo"]'),/لمين أو ليه؟/);
 await page.click('#pyForm [data-py-account="4"]');await page.fill('#pyAmount','5000');await page.fill('#pyMemo','ام طاهر');
 assert.doesNotMatch(await page.textContent('#pySum'),/رصيد المورد/);
 await page.click('#pyForm [data-py-step="confirm"]');
 assert.match(await txt(page,'#pyForm .py-confirm'),/^لصاحب المنشأة · ام طاهر 5,000 ج من خزنة احتياطى الخزنة:/);
 await page.click('#pyForm [data-py-save="approve"]');await page.waitForSelector('#pyForm.hidden',{state:'attached'});
 assert.deepEqual(await page.evaluate(()=>window.__payCalls.at(-1)),['save',{p_id:null,p_kind:'owner',p_account:4,p_party:null,p_amount:5000,p_memo:'ام طاهر',p_approve:true}]);
 assert.match(await txt(page,'#pyMain [data-py-order="103"]'),/^لصاحب المنشأة · ام طاهر 5,000 ج من خزنة احتياطى اتوافق عليه: دخّله في فارمافلاي الغي$/);
 // the difference: «هي دي، اقفله» closes it, it leaves the open orders
 await page.click('#pyMain [data-py-order="10"] [data-py-act="accept"]');
 await page.waitForFunction(()=>!document.querySelector('#pyMain [data-py-order="10"]'));
 assert.match((await texts(page,'#pyMain .py-move')).join('|'),/A M group 9,500 ج .*✓ من أمر دفع/,'the move now says it closed an order');
 // cancel needs a second tap
 await page.click('#pyMain [data-py-order="11"] [data-py-act="ask"]');
 assert.equal(await page.textContent('#pyMain [data-py-order="11"] [data-py-act="cancel"]'),'متأكد؟ الغيه');
 await page.click('#pyMain [data-py-order="11"] [data-py-act="cancel"]');
 await page.waitForFunction(()=>!document.querySelector('#pyMain [data-py-order="11"]'));
 assert.deepEqual(await page.evaluate(()=>window.__payCalls.filter(c=>c[0]==='act').map(c=>c[1].p_id+':'+c[1].p_action)),['102:approve','10:accept','11:cancel']);
 // nothing went to any table directly: only the two functions
 assert.deepEqual(await page.evaluate(()=>window.__fakeWrites.filter(w=>w.table&&/ar_pay|ar_cash/.test(w.table))),[]);
 // readable: names are not white on white, the page fits the phone
 const col=await page.$eval('#pyMain .py-name',e=>[getComputedStyle(e).color,getComputedStyle(e.closest('.py-card')).backgroundColor]);
 assert.notEqual(col[0],col[1]);assert.notEqual(col[0],'rgb(255, 255, 255)');
 await page.click('#pyNew');
 const pick=await page.$eval('#pyForm .py-pick b',e=>getComputedStyle(e).color);assert.notEqual(pick,'rgb(255, 255, 255)','a supplier button is not white text');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
 await page.click('#pyForm [data-py-back]');
},{home:true});
