// «📝 الانتظار» (owner 2026-11-19, mockup mockups/waitlist_2026-11-19.png, «ايوة»): a medicine a customer asked for and the pharmacy did not have. The screen: «كلّم دول» (what arrived:
// call / WhatsApp with a ready message / handed over), «مستنيين الدوا» (arrival by hand, a supplier chosen later, a cancel with a second tap), «قرار الرجوع» (the days left, the numbers,
// the decision), the new request (search, a typed medicine, the number with Arabic digits, the supplier's kind asked once, the supplier's message copied) and the home rows. The
// server's functions are played here (the real ones are tested in tests/waitlist-migration.cjs). Made-up people and medicines only: the repository is public.
const {run,assert}=require('./harness.cjs');
const flat=(x)=>{const w=document.createTreeWalker(x,NodeFilter.SHOW_TEXT),a=[];let n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\s+/g,' ').trim()};
const texts=(page,sel)=>page.$$eval(sel,(b,f)=>b.map(new Function('x','return ('+f+')(x)')),flat.toString());
const txt=(page,sel)=>page.$eval(sel,(x,f)=>new Function('x','return ('+f+')(x)')(x),flat.toString());
const seed=(page)=>page.evaluate(()=>{
 const iso=(d)=>new Date(Date.now()-d*864e5).toISOString();
 window.__tables.ar_store_items=[{id:5,name:'AUGMENTIN 1GM 14 TAB',arabic_name:'اوجمنتين',status:'available',price:160,is_listed:true},{id:7,name:'CATAFLAM 50MG 20 TAB',arabic_name:null,status:'available',price:85,is_listed:true}];
 window.__tables.ar_waitlist=[{id:1,status:'waiting'}];   // somebody is waiting: only then the home asks the overview (the other specs have nobody, and the call is not made)
 const S=window.__wl={
  waiting:[{id:1,item_id:7,item:'CATAFLAM 50MG 20 TAB',qty:1,phone:'01055556666',who:'عميل مثال_01055556666',vendor_id:10,vendor:'المتحدة للأدوية',vkind:'warehouse',days:2},
           {id:2,item_id:null,item:'PHARMABILAST ORAL',qty:2,phone:'01099998888',who:null,vendor_id:null,vendor:null,vkind:null,days:0}],
  call:[{id:3,item_id:5,item:'AUGMENTIN 1GM 14 TAB',qty:1,phone:'01012345678',who:'فلان',vendor:'المتحدة للأدوية',by:'stock',return_days:30,arrived_at:iso(0)},
        {id:4,item_id:5,item:'AUGMENTIN 1GM 14 TAB',qty:2,phone:'01111111111',who:null,vendor:'المتحدة للأدوية',by:'stock',return_days:30,arrived_at:iso(0)}],
  left:[{id:5,item_id:6,item:'XYZ CREAM 30G',qty:1,phone:'01022223333',who:null,vendor_id:11,vendor:'مورد جديد',vkind:null,called:true,arrived_at:iso(22),days_here:22,return_days:null,left_days:null,sold_year:3.5,price:62,exp_near:'2026-06-30',exp_short:true},
        {id:6,item_id:7,item:'CATAFLAM 50MG 20 TAB',qty:1,phone:'01077778888',who:'عميل مثال تاني',vendor_id:12,vendor:'مركز توزيع النور',vkind:'center',called:false,arrived_at:iso(6),days_here:6,return_days:7,left_days:1,sold_year:0,price:85,exp_near:'2030-01-31',exp_short:false}],
  vendors:[{id:10,name:'المتحدة للأدوية',short:'UNIT',kind:'warehouse'},{id:11,name:'مورد جديد',short:'NEW',kind:null},{id:12,name:'مركز توزيع النور',short:'NOOR',kind:'center'}],
  calls:[]};
 // the links must not leave the page in the test
 document.addEventListener('click',(e)=>{if(e.target.closest('a[data-wl-called]'))e.preventDefault()},true);
 const drop=(list,id)=>{const i=list.findIndex(x=>x.id===id);return i<0?null:list.splice(i,1)[0]};
 window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{
  ar_waitlist_overview:()=>({ok:true,waiting:S.waiting,call:S.call,leftover:S.left,vendors:S.vendors}),
  ar_waitlist_set:(a)=>{S.calls.push(['set',a.p_id,a.p_action,a.p_vendor_id??null]);
   if(a.p_action==='called'){const r=drop(S.call,a.p_id);if(r)S.left.push({...r,called:true,days_here:0,left_days:30,sold_year:0,price:160,exp_near:null,exp_short:false,vkind:'warehouse',vendor_id:10});return {ok:true}}
   if(['delivered','returned','kept','cancelled'].includes(a.p_action)){for(const l of [S.call,S.waiting,S.left])drop(l,a.p_id);return {ok:true}}
   if(a.p_action==='arrived'){const r=drop(S.waiting,a.p_id);if(r)S.call.push({...r,by:'manual',return_days:null,arrived_at:new Date().toISOString()});return {ok:true}}
   if(a.p_action==='vendor'){const r=S.waiting.find(x=>x.id===a.p_id),v=S.vendors.find(x=>x.id===a.p_vendor_id);if(r&&v){r.vendor_id=v.id;r.vendor=v.name;r.vkind=v.kind}return {ok:true}}
   return {ok:true}},
  ar_waitlist_vendor_kind:(a)=>{S.calls.push(['kind',a.p_vendor_id,a.p_kind]);const v=S.vendors.find(x=>x.id===a.p_vendor_id);if(v)v.kind=a.p_kind;return {ok:true}},
  ar_waitlist_add:(a)=>{S.calls.push(['add',a]);const v=S.vendors.find(x=>x.id===a.p_vendor_id);
   S.waiting.push({id:900+S.calls.length,item_id:a.p_item_id,item:a.p_item_name,qty:a.p_qty,phone:a.p_phone,who:a.p_name,vendor_id:v?v.id:null,vendor:v?v.name:null,vkind:v?v.kind:null,days:0});return {ok:true,id:900,status:'waiting'}}});
 });
const open=async(page)=>{await page.click('[data-group="purchases"]');await page.click('[data-pgroup="orders"]');await page.click('[data-tab="wait"]');await page.waitForSelector('#wlMain .py-card');};

run('Waiting list: call these (call / WhatsApp / handed over), the waiting ones, return or keep with the numbers, the home rows',async({page})=>{
 await seed(page);
 // the home rows (before the tab is opened): two to call, one near its deadline
 await page.evaluate(()=>window.AskerNotify.tick());
 const rows=(await texts(page,'#todoList .todo-row')).join('|');
 assert.match(rows,/2\s*دوا وصل لعملاء مستنيينه: كلّمهم/);assert.match(rows,/1\s*دوا ميعاد رجوعه للمورد قرب \(يومين أو أقل\)/);
 await open(page);
 assert.ok(await page.isVisible('#waitPanel'));
 assert.deepEqual(await texts(page,'.subbar [data-pfor="orders"] [data-tab]:not(.stf-only), [data-pfor="orders"] [data-tab]:not(.stf-only)'),['الطلبيات','الفواتير','قوايم المخازن','الانتظار'],'the tab is with the orders');
 assert.deepEqual(await texts(page,'#wlMain .py-h'),['📞 كلّم دول 2','مستنيين الدوا 2','↩️ قرار الرجوع 2']);
 // call these: one card for the medicine, two customers; a card's name loses the number glued to it; the link, the WhatsApp message
 const call=await texts(page,'#wlMain .py-card.py-wait');
 assert.equal(call.length,1);
 assert.match(call[0],/AUGMENTIN 1GM 14 TAB 📦 حطه في مكان الانتظار، مش مع الرف العادي فلان · 01012345678 · علبة اتصل واتساب 🧾 بيعها اتسلّم مش وصل لسه 01111111111 · علبتين اتصل واتساب 🧾 بيعها اتسلّم مش وصل لسه$/);
 assert.equal(await page.getAttribute('a[data-wl-called="3"][href^="tel:"]','href'),'tel:01012345678');
 const wa=await page.getAttribute('a[data-wl-called="3"][target="_blank"]','href');
 assert.equal(wa,'https://wa.me/201012345678?text='+encodeURIComponent('أهلًا بحضرتك، الدوا اللي سألت عليه (AUGMENTIN 1GM 14 TAB) وصل في الصيدلية. تقدر تعدّي تاخده. شكرًا.'));
 // calling one takes him off the list of «call these» but he stays a leftover until he decides
 await page.click('a[data-wl-called="3"][href^="tel:"]');
 await page.waitForFunction(()=>document.querySelectorAll('#wlMain .py-card.py-wait [data-wl-called="3"]').length===0,null,{timeout:5000});
 assert.deepEqual(await page.evaluate(()=>window.__wl.calls),[['set',3,'called',null]]);
 assert.match((await texts(page,'#wlMain .py-card.py-wait'))[0],/01111111111/);assert.doesNotMatch((await texts(page,'#wlMain .py-card.py-wait'))[0],/فلان/);
 // handed over: gone from the list
 await page.click('[data-wl-act="delivered"][data-id="4"]');
 await page.waitForFunction(()=>document.querySelectorAll('#wlMain .py-card.py-wait').length===0,null,{timeout:5000});
 assert.deepEqual((await texts(page,'#wlMain .py-h'))[0],'مستنيين الدوا 2','no «call these» heading when there is nobody to call');
 // the waiting ones: how long ago, the supplier's kind, one the system does not know (by hand), a supplier chosen later
 const waiting=await texts(page,'#wlMain .py-h + .py-card, #wlMain .py-card:not(.py-wait):not(.py-look)');
 assert.match(waiting[0],/CATAFLAM 50MG 20 TAB المتحدة للأدوية · مخزن عميل مثال · 01055556666 · علبة · اتطلب من يومين وصل اتصل إلغاء/);
 assert.match(waiting[1],/PHARMABILAST ORAL .*علبتين · اتطلب النهارده · صنف مش معروف للسيستم: دوس «وصل» بإيدك .*وصل اتصل إلغاء/);
 await page.selectOption('select[data-wl-vendor="2"]','12');
 await page.waitForFunction(()=>window.__wl.calls.some(c=>c[2]==='vendor'),null,{timeout:5000});
 assert.deepEqual((await page.evaluate(()=>window.__wl.calls)).slice(-1),[['set',2,'vendor',12]]);
 // a cancel is a second tap
 await page.click('[data-wl-act="cancelled"][data-id="1"]');
 assert.equal((await page.textContent('[data-wl-act="cancelled"][data-id="1"]')).trim(),'متأكد؟ دوس تاني');
 assert.equal((await page.evaluate(()=>window.__wl.calls)).filter(c=>c[2]==='cancelled').length,0,'the first tap asks');
 await page.click('[data-wl-act="cancelled"][data-id="1"]');
 await page.waitForFunction(()=>window.__wl.calls.some(c=>c[2]==='cancelled'),null,{timeout:5000});
 // arrived by hand: it moves to «call these»
 await page.click('[data-wl-act="arrived"][data-id="2"]');
 await page.waitForSelector('#wlMain .py-card.py-wait');
 assert.match((await texts(page,'#wlMain .py-card.py-wait'))[0],/PHARMABILAST ORAL/);
 // return or keep: the nearest deadline in red, the numbers, no «slow» or «expensive» label, a supplier with no kind says so
 const left=await texts(page,'#wlMain .py-card:has([data-wl-act="returned"])');
 assert.equal(left.length,3,'the two leftovers and the customer he called: still here until he decides');
 assert.match(left[0],/XYZ CREAM 30G مورد جديد .* اتكلم وصل من 22 يوم · حدد نوع المورد عشان يظهر ميعاد الرجوع اتباع آخر سنة: 3.5 علبة · السعر 62 ج · أقرب صلاحية في المخزن 2026-06 صلاحيته أقل من سنة ونص/);
 assert.match(left[1],/CATAFLAM 50MG 20 TAB مركز توزيع النور · مركز توزيع عميل مثال تاني · 01077778888 · علبة وصل من 6 أيام · فاضل يوم على الرجوع اتباع آخر سنة: 0 علبة · السعر 85 ج · أقرب صلاحية في المخزن 2030-01 رجّعته للمورد اتصل 🧾 بيعها هسيبه اتسلّم مش وصل لسه/);
 assert.equal(await page.$$eval('#wlMain .py-card.py-look',c=>c.length),1,'only the one with a day left is in red');
 assert.equal(await page.$$eval('#wlMain .py-card.py-look',c=>c[0].textContent.includes('CATAFLAM')),true);
 // decisions: returned / kept are a second tap
 await page.click('[data-wl-act="returned"][data-id="6"]');await page.click('[data-wl-act="returned"][data-id="6"]');
 await page.waitForFunction(()=>window.__wl.calls.some(c=>c[2]==='returned'),null,{timeout:5000});
 assert.deepEqual((await page.evaluate(()=>window.__wl.calls)).slice(-1),[['set',6,'returned',null]]);
 await page.click('[data-wl-act="kept"][data-id="5"]');await page.click('[data-wl-act="kept"][data-id="5"]');
 await page.waitForFunction(()=>window.__wl.calls.some(c=>c[2]==='kept'),null,{timeout:5000});
 assert.equal(await page.$$eval('#wlMain .py-card:has([data-wl-act="returned"])',c=>c.length),1,'the one called earlier is left');
 await page.click('[data-wl-act="delivered"][data-id="3"]');
 await page.waitForFunction(()=>document.querySelectorAll('#wlMain .py-card:has([data-wl-act="returned"])').length===0,null,{timeout:5000});
});

run('Waiting list: a new request: search, the supplier\'s kind asked once, the number with Arabic digits, the supplier\'s message copied; a typed medicine; the refusals',async({page})=>{
 await seed(page);
 await open(page);
 await page.click('[data-wl-new]');
 // nothing typed: the form says so in a sentence
 await page.click('[data-wl-save="only"]');
 assert.equal(await page.textContent('#wlMsg'),'اكتب اسم الدوا.');
 await page.fill('#wlItem','augm');
 await page.waitForSelector('[data-wl-pick="5"]');
 assert.match(await txt(page,'[data-wl-pick="5"]'),/AUGMENTIN 1GM 14 TAB اوجمنتين/);
 // 2026-11-21: the item's small photo BESIDE the pick button (a button inside a button does not work): a tap on it opens «تعديل الصنف» and does not pick the item
 assert.equal(await page.$$eval('.py-picks .im-lrow > button.im-th[data-im="5"]',x=>x.length),1,'the photo sits beside the button');
 assert.equal(await page.$$eval('.py-picks button.py-pick button',x=>x.length),0,'never a button inside a button');
 await page.click('.py-picks .im-th[data-im="5"]');await page.waitForSelector('#imSheet:not([hidden])');
 assert.ok(await page.isVisible('[data-wl-pick="5"]'),'the item was not picked by the tap on the photo');
 await page.click('#imSheet .im-x');
 await page.click('[data-wl-pick="5"]');
 await page.click('[data-wl-save="only"]');
 assert.equal(await page.textContent('#wlMsg'),'رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01.');
 await page.fill('#wlPhone','٠١٠١٢٣٤٥٦٧٨');await page.fill('#wlQty','2');await page.fill('#wlName','محمد');
 await page.selectOption('#wlVendor','11');
 // a supplier with no kind: asked once, required
 assert.match(await txt(page,'#wlForm'),/المورد ده مخزن ولا مركز توزيع؟ \(مرة واحدة بس\)/);
 await page.click('[data-wl-save="copy"]');
 assert.equal(await page.textContent('#wlMsg'),'اختار مخزن ولا مركز توزيع.');
 assert.equal((await page.evaluate(()=>window.__wl.calls)).length,0,'nothing was saved');
 assert.equal(await page.inputValue('#wlPhone'),'٠١٠١٢٣٤٥٦٧٨','what he typed stays');
 await page.click('[data-wl-kind="center"]');
 await page.click('[data-wl-save="copy"]');
 await page.waitForFunction(()=>window.__wl.calls.some(c=>c[0]==='add'),null,{timeout:5000});
 const calls=await page.evaluate(()=>window.__wl.calls);
 assert.deepEqual(calls[0],['kind',11,'center']);
 assert.deepEqual(calls[1][1],{p_item_id:5,p_item_name:'AUGMENTIN 1GM 14 TAB',p_phone:'01012345678',p_name:'محمد',p_qty:2,p_vendor_id:11});
 await page.waitForFunction(()=>/اتسجّل\./.test(document.getElementById('wlStatus').textContent),null,{timeout:5000});
 const st=await page.textContent('#wlStatus');
 // the supplier's message is in the clipboard (or, when the phone refuses, in a box to copy by hand)
 const clip=await page.evaluate(()=>navigator.clipboard.readText().catch(()=>null));
 const expected='السلام عليكم\nمحتاج علبتين AUGMENTIN 1GM 14 TAB لو متوفر.\nابعتلي السعر والخصم.\nشكرًا.';
 if(clip!==null){assert.equal(clip.replace(/\r\n/g,'\n'),expected,'(the clipboard on Windows turns a new line into two characters)');assert.equal(st.trim(),'اتسجّل. رسالة المورد اتنسخت، ابعتها من واتساب.')}
 else{assert.equal(st.trim(),'اتسجّل. ماقدرتش أنسخ الرسالة، انسخها بإيدك من تحت.');assert.equal(await page.inputValue('#wlMain textarea'),expected)}
 assert.doesNotMatch(clip||expected,/\d{8,}/,'no number goes to the supplier');
 assert.match((await texts(page,'#wlMain .py-card:has([data-wl-act="arrived"])')).join('|'),/AUGMENTIN 1GM 14 TAB مورد جديد · مركز توزيع محمد · 01012345678 · علبتين/);
 assert.ok(!(await page.isVisible('#wlItem')),'the form is closed after saving');
 // a medicine typed as it is (not in the system): saved without an id; "save only" copies nothing
 await page.click('[data-wl-new]');
 await page.fill('#wlItem','NEWDRUG 10MG');
 await page.waitForSelector('[data-wl-typed]');
 await page.click('[data-wl-typed]');
 await page.fill('#wlPhone','+20 109 999 8888');
 await page.click('[data-wl-save="only"]');
 await page.waitForFunction(()=>window.__wl.calls.filter(c=>c[0]==='add').length===2,null,{timeout:5000});
 const add2=(await page.evaluate(()=>window.__wl.calls)).filter(c=>c[0]==='add')[1][1];
 assert.deepEqual(add2,{p_item_id:null,p_item_name:'NEWDRUG 10MG',p_phone:'01099998888',p_name:null,p_qty:1,p_vendor_id:null});
 await page.waitForFunction(()=>document.getElementById('wlStatus').textContent.trim()==='اتسجّل.',null,{timeout:5000});
 // the quantity is checked before anything is sent
 await page.click('[data-wl-new]');await page.fill('#wlItem','xx');await page.click('[data-wl-typed]');await page.fill('#wlPhone','01012345678');await page.fill('#wlQty','0');
 await page.click('[data-wl-save="only"]');
 assert.equal(await page.textContent('#wlMsg'),'الكمية من 1 لـ 999.');
 assert.equal((await page.evaluate(()=>window.__wl.calls)).filter(c=>c[0]==='add').length,2);
 await page.click('[data-wl-close]');
 assert.ok(await page.isVisible('[data-wl-new]'));
},{permissions:['clipboard-read','clipboard-write']});

// owner 2026-11-22 («انت عملت الاوبشن ده لقائمة الانتظار؟»): «اتصل» was only on «كلّم دول»; now also on «مستنيين الدوا» and «قرار الرجوع»: the dialer on the request's number, nothing written
run('Waiting list: «اتصل» on the waiting cards and the return-decision cards too (the request\'s number, nobody is marked as called, nothing is written)',async({page})=>{
 await seed(page);
 await open(page);
 await page.evaluate(()=>{window.__tel=[];document.addEventListener('click',(e)=>{const a=e.target.closest('a[href^="tel:"]');if(a){e.preventDefault();window.__tel.push(a.getAttribute('href'))}},true)});
 const pairs=(sel,key)=>page.$$eval(sel,(cards,k)=>cards.map(c=>[c.querySelector(`[data-wl-act="${k}"]`).dataset.id,[...c.querySelectorAll('a.py-a[href^="tel:"]')].map(a=>a.getAttribute('href')).join('|')||null]),key);
 assert.deepEqual(await pairs('#wlMain .py-card:has([data-wl-act="arrived"])','arrived'),[['1','tel:01055556666'],['2','tel:01099998888']],'«مستنيين الدوا»: each card calls its own number');
 assert.deepEqual(await pairs('#wlMain .py-card:has([data-wl-act="returned"])','returned'),[['5','tel:01022223333'],['6','tel:01077778888']],'«قرار الرجوع»: the same');
 assert.equal(await page.$$eval('#wlMain .py-card:not(.py-wait) a[data-wl-called]',a=>a.length),0,'only the «كلّم دول» links mark a customer as called');
 assert.equal(await page.$$eval('#wlMain .py-card.py-wait a[data-wl-called][href^="tel:"]',a=>a.length),2,'«كلّم دول» is as it was');
 assert.equal(await page.$eval('#wlMain .py-card:has([data-wl-act="arrived"][data-id="2"]) a.py-a[href^="tel:"]',a=>a.textContent.trim()),'اتصل');
 // a tap dials and changes nothing: the card stays, nothing is sent to the server
 await page.click('#wlMain .py-card:has([data-wl-act="arrived"][data-id="2"]) a.py-a[href^="tel:"]');
 await page.click('#wlMain .py-card:has([data-wl-act="returned"][data-id="6"]) a.py-a[href^="tel:"]');
 assert.deepEqual(await page.evaluate(()=>window.__tel),['tel:01099998888','tel:01077778888']);
 assert.equal(await page.$$eval('#wlMain .py-card:has([data-wl-act="arrived"])',c=>c.length),2);
 assert.deepEqual(await page.evaluate(()=>window.__wl.calls),[],'nothing was written or marked');
});

// owner 2026-11-21: «انا فاتح الانتظار وبكتب كل شويه الاقي الزراير تطلع وتنزل مني كده وتبوظ لي الكتابه من اول وجديد»: every answer of the drug search rebuilt the WHOLE form (the box he was typing in
// included): the phone's keyboard closed and opened again and the word was cut. Now only the list under the box is drawn again.
run('Waiting list: typing the drug name never rebuilds the form — the same boxes, the focus stays in the box, what is typed in the other boxes stays, the list under it comes and goes',async({page})=>{
 await seed(page);
 await open(page);
 await page.click('[data-wl-new]');
 // the other boxes are filled first (the quantity is only read when something is saved: it must survive an answer of the search)
 await page.fill('#wlPhone','01012345678');await page.fill('#wlQty','3');await page.fill('#wlName','محمد');
 await page.focus('#wlItem');
 await page.evaluate(()=>{window.__nodes={item:document.getElementById('wlItem'),phone:document.getElementById('wlPhone'),qty:document.getElementById('wlQty'),name:document.getElementById('wlName'),form:document.querySelector('#wlForm .py-confirm')};window.__rebuilt=0;
  new MutationObserver(()=>{window.__rebuilt++}).observe(document.getElementById('wlForm'),{childList:true})});
 // typed like a person types: letter by letter, the search answering in between
 await page.keyboard.type('augm',{delay:140});
 await page.waitForSelector('[data-wl-pick="5"]');
 await page.keyboard.type('en',{delay:140});
 await page.waitForFunction(()=>document.getElementById('wlItem').value==='augmen');
 await page.waitForTimeout(500);
 const same=await page.evaluate(()=>({item:document.getElementById('wlItem')===window.__nodes.item,phone:document.getElementById('wlPhone')===window.__nodes.phone,qty:document.getElementById('wlQty')===window.__nodes.qty,name:document.getElementById('wlName')===window.__nodes.name,
  focus:document.activeElement===window.__nodes.item,pos:window.__nodes.item.selectionStart,value:window.__nodes.item.value,qtyValue:document.getElementById('wlQty').value,nameValue:document.getElementById('wlName').value,rebuilt:window.__rebuilt,picks:document.querySelectorAll('[data-wl-pick]').length}));
 assert.deepEqual(same,{item:true,phone:true,qty:true,name:true,focus:true,pos:6,value:'augmen',qtyValue:'3',nameValue:'محمد',rebuilt:0,picks:1},'the form was not rebuilt while he typed');
 // wiping the box clears the list and still keeps the box
 await page.fill('#wlItem','');
 await page.waitForFunction(()=>!document.querySelector('[data-wl-pick]'));
 assert.equal(await page.evaluate(()=>document.getElementById('wlItem')===window.__nodes.item),true);
 // a tap on an answer still picks it, and the quantity he typed is still there
 await page.fill('#wlItem','augm');await page.waitForSelector('[data-wl-pick="5"]');await page.click('[data-wl-pick="5"]');
 assert.equal(await page.inputValue('#wlQty'),'3');assert.equal(await page.inputValue('#wlPhone'),'01012345678');
});

run('Waiting list: the number book (owner 2026-11-20): a number shows the name and his requests, a name fills the number, a new number is kept, a known one is never changed',async({page})=>{
 await seed(page);
 await page.evaluate(()=>{
  window.__tables.ar_contacts=[
   {phone:'01001234567',name:'عميل ١٢١',kind:'cash',last_item:'Entresto'},
   {phone:'01000009007',name:'احمد الفرماوى',kind:'account',last_item:null},
   {phone:'01112223334',name:'أحمد الفرماوي الصغير',kind:'other',last_item:null},
   {phone:'0471234567',name:'مكتب احمد الفرماوى',kind:'other',last_item:null}];   // a landline: in the book, never offered for this form
  window.__tables.ar_waitlist=[{id:1,status:'waiting'},
   {id:11,phone:'01001234567',item_name:'Eltroxin 100',status:'delivered',created_at:'2026-11-05T09:00:00Z'},
   {id:12,phone:'01001234567',item_name:'Whiton Cream',status:'returned',created_at:'2026-10-21T09:00:00Z'},
   {id:13,phone:'01000009007',item_name:'AUGMENTIN 1GM 14 TAB',status:'waiting',created_at:'2026-11-18T09:00:00Z'}];
 });
 await open(page);
 await page.click('[data-wl-new]');
 // a number (with spaces and +20): his name fills the name box, his kind, his requests newest first, then the old one from his phone
 await page.fill('#wlPhone','+20 100 123 4567');
 await page.waitForFunction(()=>document.getElementById('wlName').value==='عميل ١٢١',null,{timeout:5000});
 assert.match(await txt(page,'#wlKnown'),/^✓ عميل ١٢١ نقدي من دفتر أرقامك/);
 await page.waitForFunction(()=>document.querySelectorAll('#wlKnown .py-hrow').length===3,null,{timeout:5000});
 assert.deepEqual(await texts(page,'#wlKnown .py-hrow'),['Eltroxin 100 11-05 اتسلّم','Whiton Cream 10-21 رجع للمورد','Entresto قديم']);
 // the number is wiped: the name that came from the book goes with it
 await page.fill('#wlPhone','');
 await page.waitForFunction(()=>document.getElementById('wlName').value==='',null,{timeout:5000});
 assert.equal(await txt(page,'#wlKnown'),'');
 // a name (Ya / Alef spelled the other way): the numbers that fit, the shorter name first, no landline; a tap fills the number and the name
 await page.fill('#wlName','الفرماوي');
 await page.waitForSelector('[data-wl-contact]');
 assert.deepEqual(await page.$$eval('[data-wl-contact]',(b)=>b.map((x)=>x.dataset.wlContact)),['01000009007','01112223334']);
 await page.click('[data-wl-contact="01000009007"]');
 assert.equal(await page.inputValue('#wlPhone'),'01000009007');assert.equal(await page.inputValue('#wlName'),'احمد الفرماوى');
 await page.waitForFunction(()=>document.querySelectorAll('#wlKnown .py-hrow').length===1,null,{timeout:5000});
 assert.deepEqual(await texts(page,'#wlKnown .py-hrow'),['AUGMENTIN 1GM 14 TAB 11-18 مستني']);
 assert.match(await txt(page,'#wlKnown'),/له حساب/);
 // the drug by its name (a «عميل» number is also found by the drug beside it)
 await page.fill('#wlItem','augm');await page.waitForSelector('[data-wl-pick="5"]');await page.click('[data-wl-pick="5"]');
 await page.click('[data-wl-save="only"]');
 await page.waitForFunction(()=>window.__wl.calls.some(c=>c[0]==='add'),null,{timeout:5000});
 assert.deepEqual((await page.evaluate(()=>window.__wl.calls)).filter(c=>c[0]==='add')[0][1],{p_item_id:5,p_item_name:'AUGMENTIN 1GM 14 TAB',p_phone:'01000009007',p_name:'احمد الفرماوى',p_qty:1,p_vendor_id:null});
 await page.waitForFunction(()=>document.getElementById('wlStatus').textContent.trim()==='اتسجّل.',null,{timeout:5000});
 assert.equal((await page.evaluate(()=>window.__fakeWrites)).filter((w)=>w.table==='ar_contacts').length,0,'a number the book already has is not written again');
 // a number the book does not know, with the name he wrote: kept (as a cash customer when it starts with «عميل»), and known the next time
 await page.click('[data-wl-new]');await page.fill('#wlItem','NEWDRUG 10MG');await page.waitForSelector('[data-wl-typed]');await page.click('[data-wl-typed]');
 await page.fill('#wlPhone','01055550000');await page.fill('#wlName','عميل ١٢٦');
 assert.equal(await txt(page,'#wlKnown'),'','not in the book: nothing shown');
 await page.click('[data-wl-save="only"]');
 await page.waitForFunction(()=>window.__fakeWrites.some((w)=>w.table==='ar_contacts'),null,{timeout:5000});
 const wr=(await page.evaluate(()=>window.__fakeWrites)).filter((w)=>w.table==='ar_contacts');
 assert.equal(wr.length,1);assert.equal(wr[0].k,'upsert');
 assert.deepEqual({...wr[0].v[0],updated_at:'x'},{phone:'01055550000',name:'عميل ١٢٦',kind:'cash',source:'typed',updated_at:'x'});
 await page.waitForFunction(()=>document.getElementById('wlStatus').textContent.trim()==='اتسجّل.',null,{timeout:5000});
 await page.click('[data-wl-new]');await page.fill('#wlPhone','01055550000');
 await page.waitForFunction(()=>document.getElementById('wlName').value==='عميل ١٢٦',null,{timeout:5000});
 assert.match(await txt(page,'#wlKnown'),/^✓ عميل ١٢٦ نقدي/);
});

run('Waiting list: «📒 دفتر الأرقام» (owner 2026-11-20): the filters, the search, one tap marks a number private, all that are shown with a second tap, the mark in the request form; and the staff view',async({page})=>{
 await seed(page);
 await page.evaluate(()=>{
  window.__tables.ar_contacts=[
   {phone:'01001234567',name:'عميل ١٢١',kind:'cash',last_item:'Entresto',private:false},
   {phone:'01000009007',name:'احمد الفرماوى',kind:'account',last_item:null,private:false},
   {phone:'01112223334',name:'اخويا',kind:'other',last_item:null,private:true},
   {phone:'01223334445',name:'ماما',kind:'other',last_item:null,private:true},
   {phone:'01334445556',name:'سيد النجار',kind:'other',last_item:null,private:false},
   {phone:'01445556667',name:'سيد المصرى',kind:'other',last_item:null,private:false}];
  window.__fakeRpcs.ar_contacts_private=(a)=>{window.__wl.calls.push(['private',a.p_phones,a.p_private]);for(const r of window.__tables.ar_contacts)if(a.p_phones.includes(r.phone))r.private=a.p_private;return a.p_phones.length};
 });
 await open(page);
 assert.ok(await page.isVisible('[data-wl-bk]'),'the owner has the book button');
 await page.click('[data-wl-bk]');
 await page.waitForSelector('#wlBkList .py-bk');
 assert.ok(!(await page.isVisible('#wlMain')),'the lists give way to the book');
 const chips=()=>texts(page,'#wlBkChips button');
 assert.deepEqual(await chips(),['الكل 6','نقدي 1','له حساب 1','غيرهم 4','🔒 خاص 2']);
 assert.equal(await page.getAttribute('#wlBkChips button.on','data-wl-bkf'),'other','it opens on «غيرهم»');
 const rows=()=>page.$$eval('#wlBkList .py-bk [data-wl-lock]',(b)=>b.map((x)=>x.dataset.wlLock).sort());
 assert.deepEqual(await rows(),['01112223334','01223334445','01334445556','01445556667']);
 // one tap on a number that is open: private; the counts and the row follow, the server is told
 await page.click('[data-wl-lock="01334445556"]');
 await page.waitForFunction(()=>window.__wl.calls.some(c=>c[0]==='private'),null,{timeout:5000});
 assert.deepEqual((await page.evaluate(()=>window.__wl.calls)).filter(c=>c[0]==='private'),[['private',['01334445556'],true]]);
 await page.waitForFunction(()=>/خاص 3/.test(document.getElementById('wlBkChips').textContent),null,{timeout:5000});
 assert.deepEqual(await chips(),['الكل 6','نقدي 1','له حساب 1','غيرهم 4','🔒 خاص 3']);
 assert.match((await texts(page,'#wlBkList .py-bk:has([data-wl-lock="01334445556"])'))[0],/سيد النجار 01334445556 🔒 خاص افتحه$/);
 // the private filter and a word
 await page.click('[data-wl-bkf="private"]');
 assert.deepEqual(await rows(),['01112223334','01223334445','01334445556']);
 await page.fill('#wlBkQ','ماما');
 assert.deepEqual(await rows(),['01223334445']);
 // another tap opens it again
 await page.click('[data-wl-lock="01223334445"]');
 await page.waitForFunction(()=>window.__wl.calls.filter(c=>c[0]==='private').length===2,null,{timeout:5000});
 assert.deepEqual((await page.evaluate(()=>window.__wl.calls)).filter(c=>c[0]==='private')[1],['private',['01223334445'],false]);
 assert.deepEqual(await rows(),[],'opened: it left the «خاص» filter');
 await page.click('[data-wl-bkf="all"]');
 await page.click('[data-wl-lock="01223334445"]');   // and private again
 await page.waitForFunction(()=>window.__wl.calls.filter(c=>c[0]==='private').length===3,null,{timeout:5000});
 // all that are shown: a word under «غيرهم»; the button counts what it would change; the first tap asks, the second does it
 await page.fill('#wlBkQ','');await page.click('[data-wl-bkf="other"]');await page.fill('#wlBkQ','سيد');
 assert.deepEqual(await rows(),['01334445556','01445556667']);
 assert.equal((await txt(page,'[data-wl-bkbulk]')),'🔒 اقفل كل اللي ظاهر (1)','only the open one would change');
 await page.click('[data-wl-bkbulk]');
 assert.equal((await txt(page,'[data-wl-bkbulk]')),'متأكد؟ دوس تاني (1)');
 assert.equal((await page.evaluate(()=>window.__wl.calls)).filter(c=>c[0]==='private').length,3,'the first tap asks, nothing is sent');
 await page.click('[data-wl-bkbulk]');
 await page.waitForFunction(()=>window.__wl.calls.filter(c=>c[0]==='private').length===4,null,{timeout:5000});
 assert.deepEqual((await page.evaluate(()=>window.__wl.calls)).filter(c=>c[0]==='private')[3],['private',['01445556667'],true]);
 await page.waitForFunction(()=>!document.querySelector('[data-wl-bkbulk]'),null,{timeout:5000});
 await page.fill('#wlBkQ','');await page.click('[data-wl-bkf="all"]');
 assert.equal((await rows()).length,6,'the six in the book');
 await page.click('[data-wl-bkclose]');
 assert.ok(await page.isVisible('#wlMain')&&await page.isVisible('[data-wl-new]'),'closed: the lists are back');
 // the mark in the request form: his brother's number shows the name, 🔒 خاص, and a button to open it to the staff
 await page.click('[data-wl-new]');
 await page.fill('#wlPhone','01112223334');
 await page.waitForFunction(()=>document.getElementById('wlName').value==='اخويا',null,{timeout:5000});
 assert.match(await txt(page,'#wlKnown'),/^✓ اخويا 🔒 خاص من دفتر أرقامك افتحه للموظفين/);
 await page.click('#wlKnown [data-wl-lock]');
 await page.waitForFunction(()=>/🔒 خاص$/.test(document.querySelector('#wlKnown [data-wl-lock]').textContent.trim()),null,{timeout:5000});
 assert.deepEqual((await page.evaluate(()=>window.__wl.calls)).filter(c=>c[0]==='private').slice(-1),[['private',['01112223334'],false]]);
 assert.doesNotMatch(await txt(page,'#wlKnown'),/^✓ اخويا 🔒/,'open now: no private pill');
 assert.equal(await page.inputValue('#wlPhone'),'01112223334','what he typed stays');
 await page.click('[data-wl-close]');

 // the staff view: no book button, no supplier, no copy button, no «arrived» / «reopen» / return decisions; the server sends none of the suppliers or leftovers to him
 await page.evaluate(()=>{window.__wl.left=[];window.__wl.vendors=[];window.AskerStaff.isStaff=()=>true;return window.AskerWait.open()});
 await page.waitForFunction(()=>!document.querySelector('#wlMain [data-wl-act="returned"]'),null,{timeout:5000});
 assert.ok(!(await page.$('[data-wl-bk]')),'no book button for staff');
 assert.ok(await page.isVisible('[data-wl-new]'));
 assert.ok(await page.$('[data-wl-act="delivered"]'),'he hands it over');
 assert.ok(!(await page.$('[data-wl-act="reopen"]')),'no «مش وصل لسه» for staff');
 assert.ok(await page.$('[data-wl-act="cancelled"]'),'he can cancel a request');
 assert.ok(!(await page.$('[data-wl-act="arrived"]')),'no «وصل» by hand for staff');
 assert.ok(!(await page.$('select[data-wl-vendor]')),'no supplier choice');
 assert.doesNotMatch(await txt(page,'#waitPanel'),/المتحدة للأدوية|مركز توزيع النور|قرار الرجوع/,'no supplier names, no returns decisions');
 await page.click('[data-wl-new]');
 assert.ok(!(await page.$('#wlVendor')),'no supplier in the form');
 assert.ok(!(await page.$('[data-wl-save="copy"]')),'no supplier message to copy');
 await page.fill('#wlItem','augm');await page.waitForSelector('[data-wl-pick="5"]');await page.click('[data-wl-pick="5"]');
 await page.fill('#wlPhone','01000009007');
 await page.waitForFunction(()=>document.getElementById('wlName').value==='احمد الفرماوى',null,{timeout:5000});
 assert.ok(!(await page.$('#wlKnown [data-wl-lock]')),'no private mark for staff');
 assert.doesNotMatch(await txt(page,'#wlKnown'),/من دفتر أرقامك/);
 await page.click('[data-wl-save="only"]');
 await page.waitForFunction(()=>window.__wl.calls.some(c=>c[0]==='add'),null,{timeout:5000});
 assert.deepEqual((await page.evaluate(()=>window.__wl.calls)).filter(c=>c[0]==='add')[0][1],{p_item_id:5,p_item_name:'AUGMENTIN 1GM 14 TAB',p_phone:'01000009007',p_name:'احمد الفرماوى',p_qty:1,p_vendor_id:null});
});

run('Waiting list: the book shows 30 numbers at a time and «عرض أكتر» shows more; marking all that are shown sends them all',async({page})=>{
 await seed(page);
 await page.evaluate(()=>{
  window.__tables.ar_contacts=Array.from({length:70},(_,i)=>({phone:'0155'+String(1000000+i),name:'شخص '+String(100+i),kind:'other',last_item:null,private:false}));
  window.__fakeRpcs.ar_contacts_private=(a)=>{window.__wl.calls.push(['private',a.p_phones,a.p_private]);for(const r of window.__tables.ar_contacts)if(a.p_phones.includes(r.phone))r.private=a.p_private;return a.p_phones.length};
 });
 await open(page);
 await page.click('[data-wl-bk]');
 await page.waitForSelector('#wlBkList .py-bk');
 const n=()=>page.$$eval('#wlBkList .py-bk',(x)=>x.length);
 assert.equal(await n(),30);
 assert.equal(await txt(page,'#wlBkList .hint'),'الأرقام الظاهرة 70');
 await page.click('[data-wl-bkmore]');assert.equal(await n(),60);
 await page.click('[data-wl-bkmore]');assert.equal(await n(),70);
 assert.ok(!(await page.$('[data-wl-bkmore]')),'nothing more to show');
 // all 70 are open: «اقفل كل اللي ظاهر (70)», a second tap sends all 70 once
 assert.equal(await txt(page,'[data-wl-bkbulk]'),'🔒 اقفل كل اللي ظاهر (70)');
 await page.click('[data-wl-bkbulk]');await page.click('[data-wl-bkbulk]');
 await page.waitForFunction(()=>window.__wl.calls.some(c=>c[0]==='private'),null,{timeout:5000});
 const c=(await page.evaluate(()=>window.__wl.calls)).filter(x=>x[0]==='private');
 assert.equal(c.length,1);assert.equal(c[0][1].length,70);assert.equal(c[0][2],true);
 await page.waitForFunction(()=>/🔒 خاص 70/.test(document.getElementById('wlBkChips').textContent),null,{timeout:5000});
 // changing the filter or the word clears a half-done «متأكد؟»
 await page.click('[data-wl-bkf="private"]');
 assert.equal(await txt(page,'[data-wl-bkbulk]'),'افتح كل اللي ظاهر (70)');
 await page.click('[data-wl-bkbulk]');assert.equal(await txt(page,'[data-wl-bkbulk]'),'متأكد؟ دوس تاني (70)');
 await page.fill('#wlBkQ','شخص 105');
 assert.equal(await txt(page,'[data-wl-bkbulk]'),'افتح كل اللي ظاهر (1)','the word changed: the question starts again');
});

run('Waiting list: «📱 تطبيق الموبايل» inside the number book: the status, the download, «اربط التطبيق» makes a key and opens the phone app with it',async({page})=>{
 await seed(page);
 await page.evaluate(()=>{
  window.__tables.ar_contacts=[{phone:'01000009007',name:'احمد الفرماوى',kind:'account',last_item:null,private:false}];
  window.__opened=[];window.open=(u)=>{window.__opened.push(u);return null};   // the phone app's own link must not leave the page in the test
  window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{
   ar_phone_status:()=>({pending:3,last_sync:{n:2602,finished_at:'2026-11-20T10:00:00Z',merged_at:null},phones:[{label:'phone 2026-11-20',created_at:'2026-11-20T09:00:00Z',last_used_at:'2026-11-20T10:05:00Z'}]}),
   ar_phone_link:()=>{window.__linkCalls=(window.__linkCalls||0)+1;return 'ab'.repeat(32)}});
 });
 await open(page);
 await page.click('[data-wl-bk]');
 // a phone is linked: the big block is NOT there, one thin line says so (owner 2026-11-21: «نزلته وربطته بس مختفاش ليه من الصفحة»); «تفاصيل» opens it
 await page.waitForSelector('#wlPhoneApp [data-wl-appmore]');
 assert.match(await txt(page,'#wlPhoneApp'),/📱 تطبيق الموبايل ✓ موبايل مربوط، آخر اتصال: 2026-11-20 \d\d:05/);
 assert.equal(await page.$('#wlPhoneApp [data-wl-applink]'),null,'no link button once linked');assert.equal(await page.$('#wlPhoneApp a'),null,'no download link once linked');
 await page.click('[data-wl-appmore]');
 await page.waitForSelector('#wlPhoneApp .py-acts');
 const t=await txt(page,'#wlPhoneApp');
 assert.match(t,/📱 تطبيق الموبايل/);assert.match(t,/موبايل مربوط، آخر اتصال: 2026-11-20 \d\d:05/);
 assert.match(t,/آخر إرسال لجهات الاتصال: 2602 جهة اتصال \(لسه ما اتدمجتش على اللاب\)/);assert.match(t,/أرقام مستنية تنزل على الموبايل: 3/);
 assert.equal(await page.getAttribute('#wlPhoneApp a','href'),'https://github.com/taherasker2560-dot/asker-nawaqes/releases/download/contacts-build/asker-contacts.apk');
 assert.equal((await page.textContent('#wlPhoneApp a')).trim(),'نزّل التطبيق');
 // «اربط التطبيق»: a new key (64 hex) from the server, the page goes to the phone app's link with it; the server's address is not in the link
 await page.click('[data-wl-applink]');
 await page.waitForFunction(()=>window.__opened.length===1,null,{timeout:5000});
 const u=await page.evaluate(()=>window.__opened[0]);
 assert.equal(u,'askercontacts://link?k='+'ab'.repeat(32));assert.doesNotMatch(u,/supabase/);
 // on Android: an intent: link (the app's download page when it is not installed)
 await page.evaluate(()=>Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/120',configurable:true}));
 await page.click('[data-wl-applink]');
 await page.waitForFunction(()=>window.__opened.length===2,null,{timeout:5000});
 assert.equal(await page.evaluate(()=>window.__opened[1]),'intent://link?k='+'ab'.repeat(32)+'#Intent;scheme=askercontacts;package=com.askerpharmacy.contacts;S.browser_fallback_url='+encodeURIComponent('https://github.com/taherasker2560-dot/asker-nawaqes/releases/download/contacts-build/asker-contacts.apk')+';end');
 assert.equal(await page.evaluate(()=>window.__linkCalls),2,'a new key each time');
 // after «اربط التطبيق» the block goes back to its thin line; «إخفاء» does the same by hand
 await page.waitForFunction(()=>!!document.querySelector('#wlPhoneApp [data-wl-appmore]')&&!document.querySelector('#wlPhoneApp [data-wl-applink]'),null,{timeout:8000});
 await page.click('[data-wl-appmore]');await page.waitForSelector('#wlPhoneApp [data-wl-applink]');
 await page.click('[data-wl-appmore]');await page.waitForFunction(()=>!document.querySelector('#wlPhoneApp [data-wl-applink]'));
 // a staff member never sees it (the book screen is the owner's)
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;return window.AskerWait.open()});
 assert.equal(await page.$('[data-wl-bk]'),null);
});
run('Waiting list: «📲 ابعت للتليسيلز» on a waiting item, and ONE message with a supplier\'s whole waiting list (owner: «انت معملتش اوبشن ارسال رساله واتس اب لاصناف الانتظار»)',async({page})=>{
 await seed(page);
 await page.evaluate(()=>{
  window.__tables.ar_vendor_contacts=[{vendor_id:10,role:'telesales',phone:'01012345678',name:'تليسيلز مثال'},{vendor_id:11,role:'telesales',phone:'447710173736',name:'تليسيلز برة'},{vendor_id:12,role:'distributor',phone:'01122223333',name:'موزع'}];
  window.__wl.waiting=[
   {id:1,item_id:7,item:'CATAFLAM 50MG 20 TAB',qty:1,phone:'01055556666',who:'عميل مثال',vendor_id:10,vendor:'المتحدة للأدوية',vkind:'warehouse',days:2},
   {id:2,item_id:7,item:'CATAFLAM 50MG 20 TAB',qty:2,phone:'01077778888',who:null,vendor_id:10,vendor:'المتحدة للأدوية',vkind:'warehouse',days:1},
   {id:3,item_id:null,item:'PHARMABILAST ORAL',qty:2,phone:'01099998888',who:null,vendor_id:10,vendor:'المتحدة للأدوية',vkind:'warehouse',days:0},
   {id:4,item_id:5,item:'AUGMENTIN 1GM 14 TAB',qty:1,phone:'01012345679',who:null,vendor_id:11,vendor:'مورد برة',vkind:'center',days:0},
   {id:5,item_id:9,item:'XYZ CREAM 30G',qty:1,phone:'01022223333',who:null,vendor_id:12,vendor:'مركز النور',vkind:'center',days:0},
   {id:6,item_id:null,item:'NO SUPPLIER ITEM',qty:1,phone:'01033334444',who:null,vendor_id:null,vendor:null,vkind:null,days:0}];
  window.__wa=[];window.AskerApp.openWhatsApp=(t,p)=>{window.__wa.push({t,p})};
  window.__copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied=t}},configurable:true});
 });
 await open(page);
 await page.waitForSelector('[data-wl-tele]');
 // a button on every waiting item of a supplier that has a telesales number: suppliers 10 and 11; not 12 (a distributor only) and not the one with no supplier
 assert.deepEqual(await page.$$eval('[data-wl-tele]',b=>b.map(x=>x.dataset.wlTele)),['1','2','3','4']);
 assert.equal((await page.textContent('[data-wl-tele="1"]')).trim(),'📲 ابعت للتليسيلز');
 // one list-button for a supplier with two or more different waiting items (10), none for one item (11)
 assert.deepEqual(await page.$$eval('[data-wl-telegroup]',b=>b.map(x=>x.dataset.wlTelegroup)),['10']);
 assert.match(await txt(page,'[data-wl-telegroup="10"]'),/📲 ابعت كل المستنيين لـ المتحدة للأدوية 2/);
 // one request → the one-item message, on HIS telesales number (an international number as it is)
 await page.click('[data-wl-tele="4"]');
 await page.waitForFunction(()=>window.__wa.length===1);
 assert.deepEqual(await page.evaluate(()=>window.__wa[0]),{p:'447710173736',t:'السلام عليكم\nمحتاج علبة AUGMENTIN 1GM 14 TAB لو متوفر.\nابعتلي السعر والخصم.\nشكرًا.'});
 assert.equal(await txt(page,'#wlStatus'),'اتفتح الواتس على التليسيلز ومعاه الرسالة: دوس إرسال هناك.');
 // the supplier's whole list → ONE message: the same item once with the quantities added, in the order they came
 await page.click('[data-wl-telegroup="10"]');
 await page.waitForFunction(()=>window.__wa.length===2);
 const b=await page.evaluate(()=>window.__wa[1]);
 assert.equal(b.p,'01012345678');
 assert.equal(b.t,'السلام عليكم\nمحتاج:\n1) 3 علب CATAFLAM 50MG 20 TAB\n2) علبتين PHARMABILAST ORAL\nابعتلي السعر والخصم.\nشكرًا.');
 assert.doesNotMatch(b.t,/\d{8,}|عميل مثال/,'no customer number or name goes to the supplier');
 // nothing was written or changed by sending
 assert.equal((await page.evaluate(()=>window.__wl.calls)).length,0);
 // a list too long for a link: copied, the chat opens bare
 await page.evaluate(()=>{window.__wl.waiting=Array.from({length:120},(_,i)=>({id:100+i,item_id:1000+i,item:'DRUG NUMBER '+i+' 10MG 20 TAB LONG NAME',qty:1,phone:'01055556666',who:null,vendor_id:10,vendor:'المتحدة للأدوية',vkind:'warehouse',days:0}));return window.AskerWait.open()});
 await page.waitForSelector('[data-wl-telegroup="10"]');
 await page.click('[data-wl-telegroup="10"]');
 await page.waitForFunction(()=>window.__wa.length===3);
 assert.deepEqual(await page.evaluate(()=>[window.__wa[2].t,window.__wa[2].p]),['','01012345678']);
 assert.match(await page.evaluate(()=>window.__copied),/^السلام عليكم\nمحتاج:\n1\) علبة DRUG NUMBER 0 /);
 assert.equal(await txt(page,'#wlStatus'),'الرسالة طويلة: اتنسخت، الزقها في المحادثة اللي اتفتحت.');
 // staff: no buttons (the numbers are the owner's)
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;return window.AskerWait.open()});
 await page.waitForFunction(()=>!document.querySelector('[data-wl-tele],[data-wl-telegroup]'),null,{timeout:5000});
 assert.ok(await page.$('[data-wl-act="cancelled"]'),'the page itself is still there');
});

run('Waiting list: the phone app block STAYS when its status cannot be read (owner 2026-11-21: it must not disappear after linking), and reads it again',async({page})=>{
 await seed(page);
 await page.evaluate(()=>{window.__tables.ar_contacts=[{phone:'01000009007',name:'احمد الفرماوى',kind:'account',last_item:null,private:false}]});
 await open(page);
 await page.click('[data-wl-bk]');
 await page.waitForSelector('#wlBkChips');
 await page.waitForFunction(()=>document.getElementById('wlPhoneApp')&&!/بحمّل/.test(document.getElementById('wlPhoneApp').textContent),null,{timeout:5000});
 // no ar_phone_status on the server: the block says so and keeps its two buttons
 assert.match(await txt(page,'#wlPhoneApp'),/📱 تطبيق الموبايل/);assert.match(await txt(page,'#wlPhoneApp'),/مقدرتش أجيب حالة التطبيق/);
 assert.ok(await page.$('#wlPhoneApp [data-wl-applink]'),'the link button is still there');assert.ok(await page.$('#wlPhoneApp a[href*="asker-contacts.apk"]'),'and the download');
 assert.ok(await page.$('#wlBkChips'),'the book itself works as before');
 // the server answers later (a linked phone that has not talked yet): the same block now shows it, and a status that was read is NOT wiped by a failed read after it
 await page.evaluate(()=>{window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{ar_phone_status:()=>({pending:0,last_sync:null,phones:[{label:'phone 2026-11-21',created_at:'2026-11-21T08:11:33Z',last_used_at:null}]})});document.dispatchEvent(new Event('visibilitychange'))});
 await page.waitForFunction(()=>/موبايل مربوط، آخر اتصال: لسه/.test(document.getElementById('wlPhoneApp').textContent),null,{timeout:5000});
 assert.equal(await page.$('#wlPhoneApp [data-wl-applink]'),null,'linked (a key exists, the app has not talked yet): the thin line, not the big block');
 await page.evaluate(()=>{window.__fakeRpcs.ar_phone_status=()=>{throw new Error('offline')};document.dispatchEvent(new Event('visibilitychange'))});
 await page.waitForTimeout(600);
 assert.match(await txt(page,'#wlPhoneApp'),/موبايل مربوط، آخر اتصال: لسه/,'the status already on screen stays');
 assert.ok(await page.$('#wlPhoneApp [data-wl-appmore]'));
});

run('Waiting list in English: no Arabic left on the screen except names, and the words read right',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('asker-lang','en'));
 await page.reload();
 await page.waitForSelector('[data-group="purchases"]');
 await seed(page);
 await page.evaluate(()=>{window.__tables.ar_contacts=[{phone:'01000009007',name:'احمد الفرماوى',kind:'account',last_item:null,private:false},{phone:'01112223334',name:'اخويا',kind:'other',last_item:null,private:true}]});
 await open(page);
 await page.click('[data-wl-new]');
 await page.selectOption('#wlVendor','11');
 const scan=()=>page.evaluate(()=>{
  const p=document.getElementById('waitPanel'),AR=/[؀-ۿ]/,out=[];
  const w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n;
  while((n=w.nextNode())){const e=n.parentElement;if(AR.test(n.nodeValue)&&!e.closest('.notr,textarea,option'))out.push(n.nodeValue.trim())}
  for(const el of p.querySelectorAll('[placeholder],[aria-label]'))for(const a of ['placeholder','aria-label'])if(AR.test(el.getAttribute(a)||''))out.push(a+': '+el.getAttribute(a));
  return out});
 const left=await scan();
 assert.deepEqual(left,[],'Arabic left: '+left.join(' | '));
 const all=await txt(page,'#waitPanel');
 for(const s of ['Waiting list','Call these','Waiting for the medicine','Return or keep','1 day left to return','Sold in the last year: 3.5 packs','Set the supplier kind to see the return deadline','Arrived 22 days ago','Asked 2 days ago','Put it on the waiting shelf','Is this supplier a warehouse or a distribution center? (once only)'])assert.ok(all.includes(s),'missing in English: '+s);
 // the number book screen in English too
 await page.click('[data-wl-close]');await page.click('[data-wl-bk]');await page.waitForSelector('#wlBkList .py-bk');
 const left2=await scan();
 assert.deepEqual(left2,[],'Arabic left in the book: '+left2.join(' | '));
 assert.deepEqual(await texts(page,'#wlBkChips button'),['All 2','Cash 0','Has an account 1','Others 1','🔒 Private 1']);
 assert.match(await txt(page,'#waitPanel'),/Numbers shown 1/);
});

run('Waiting list: when nobody is waiting the home asks the server nothing (no call, nothing written)',async({page})=>{
 await page.evaluate(()=>{window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{ar_waitlist_overview:()=>({ok:true,waiting:[],call:[],leftover:[],vendors:[]})})});
 await page.evaluate(()=>window.AskerNotify.tick());
 await page.waitForTimeout(300);
 assert.equal((await page.evaluate(()=>window.__fakeWrites)).filter(w=>w.rpc==='ar_waitlist_overview').length,0);
});
