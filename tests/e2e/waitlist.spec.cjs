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
 assert.deepEqual(await texts(page,'.subbar [data-pfor="orders"] [data-tab], [data-pfor="orders"] [data-tab]'),['الطلبيات','الفواتير','قوايم المخازن','الانتظار'],'the tab is with the orders');
 assert.deepEqual(await texts(page,'#wlMain .py-h'),['📞 كلّم دول 2','مستنيين الدوا 2','↩️ قرار الرجوع 2']);
 // call these: one card for the medicine, two customers; a card's name loses the number glued to it; the link, the WhatsApp message
 const call=await texts(page,'#wlMain .py-card.py-wait');
 assert.equal(call.length,1);
 assert.match(call[0],/AUGMENTIN 1GM 14 TAB 📦 حطه في مكان الانتظار، مش مع الرف العادي فلان · 01012345678 · علبة اتصل واتساب اتسلّم مش وصل لسه 01111111111 · علبتين اتصل واتساب اتسلّم مش وصل لسه$/);
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
 assert.match(waiting[0],/CATAFLAM 50MG 20 TAB المتحدة للأدوية · مخزن عميل مثال · 01055556666 · علبة · اتطلب من يومين وصل إلغاء/);
 assert.match(waiting[1],/PHARMABILAST ORAL .*علبتين · اتطلب النهارده · صنف مش معروف للسيستم: دوس «وصل» بإيدك .*وصل إلغاء/);
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
 assert.match(left[1],/CATAFLAM 50MG 20 TAB مركز توزيع النور · مركز توزيع عميل مثال تاني · 01077778888 · علبة وصل من 6 أيام · فاضل يوم على الرجوع اتباع آخر سنة: 0 علبة · السعر 85 ج · أقرب صلاحية في المخزن 2030-01 رجّعته للمورد هسيبه اتسلّم مش وصل لسه/);
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

run('Waiting list in English: no Arabic left on the screen except names, and the words read right',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('asker-lang','en'));
 await page.reload();
 await page.waitForSelector('[data-group="purchases"]');
 await seed(page);
 await open(page);
 await page.click('[data-wl-new]');
 await page.selectOption('#wlVendor','11');
 const left=await page.evaluate(()=>{
  const p=document.getElementById('waitPanel'),AR=/[؀-ۿ]/,out=[];
  const w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n;
  while((n=w.nextNode())){const e=n.parentElement;if(AR.test(n.nodeValue)&&!e.closest('.notr,textarea,option'))out.push(n.nodeValue.trim())}
  for(const el of p.querySelectorAll('[placeholder],[aria-label]'))for(const a of ['placeholder','aria-label'])if(AR.test(el.getAttribute(a)||''))out.push(a+': '+el.getAttribute(a));
  return out});
 assert.deepEqual(left,[],'Arabic left: '+left.join(' | '));
 const all=await txt(page,'#waitPanel');
 for(const s of ['Waiting list','Call these','Waiting for the medicine','Return or keep','1 day left to return','Sold in the last year: 3.5 packs','Set the supplier kind to see the return deadline','Arrived 22 days ago','Asked 2 days ago','Put it on the waiting shelf','Is this supplier a warehouse or a distribution center? (once only)'])assert.ok(all.includes(s),'missing in English: '+s);
});
