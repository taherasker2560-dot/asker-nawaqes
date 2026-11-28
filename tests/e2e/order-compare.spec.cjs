// «طلب السيستم × مشتريات تاني يوم» card at the top of «الطلبيات»: reads the laptop's file v2 (private bucket asker-private/orders/compare2.json):
// the system's order at the cut against what ARRIVED on the supplier invoices after it (owner 2026-11-16, not the order stamped on PharmaFly):
// three counts, «السيستم جاب X% من اللي وصلك», the 7-night chart (a tap on a night shows that night), the quantity, and the three lists with the reasons.
// It only reads: nothing is written and nothing is sent.
const {run,text,assert}=require('./harness.cjs');
const arr=(h=14,q=1,v='AMG')=>({vendor:v,code:'1',h,q});
const night=(key,both,ao,bo,extra={})=>({v:2,night:key,at:key+' 00:45',comparable:true,late:false,final:false,window_end:'2026-11-18 06:45',manual:0,
 both_items:Array.from({length:both},(_,k)=>({id:k+1,name:'BOTH ITEM '+k,qty:1,bag:'2428',arr:arr()})),
 arrived_only_items:[{id:100,name:'BETACOR 30TAB',why:'had_stock',have:3,cover:9,arr:arr(16,2,'الفتح')},{id:101,name:'HISTAZINE-1 100ML SYR',why:'missed',bag:'نواقص يوميه',arr:arr(16,1,'الفتح')},
  {id:102,name:'RINGER SOL. 500CC. P.',why:'cancelled_me',arr:arr(17,1)},{id:103,name:'LICID 60CC LOTION',why:'other_bag',bag:'مالك',arr:arr(17,1)}].slice(0,ao),
 bot_only_items:Array.from({length:bo},(_,k)=>({id:200+k,name:'BOT ONLY '+k,qty:2,bag:'2428',why:k===0?'new':'carried',days:3})),...extra});
// the money fields the laptop writes (cost price, the first 24 hours): bought 20,000 = 10,500 the system's order + 8,000 items not in it + 1,500 packs beyond its quantity (+ 400 misc, not counted)
const cash=(buy=20000,cap=17680)=>({buy_value:buy,both_value:12000,extra_items_value:buy-12000,extra_qty_value:1500,misc_value:400,cap_money:cap,bot_cost:17607});
const file=(nights,at=new Date().toISOString())=>({generated_at:at,v:2,week:{nights:nights.length},nights});
const put=(page,o)=>page.evaluate(o=>{window.__storage['orders/compare2.json']=JSON.stringify(o)},o);
const openOrders=async(page)=>{await page.click('[data-pgroup="orders"]');await page.click('[data-tab="drafts"]');await page.evaluate(()=>document.querySelectorAll('details.od-fold').forEach(d=>{d.open=true}))};
run('orders card: counts, rate, 7 nights, the three lists with their reasons and the quantity',async({page})=>{
 await put(page,file([night('2026-11-14',50,2,1),night('2026-11-15',60,4,2),night('2026-11-16',55,3,9,{manual:4,final:true,...cash()})]));
 await openOrders(page);
 await page.waitForSelector('#cmpMain:not(.hidden)');
 assert.ok(await page.isVisible('#cmpBox'));assert.ok(!(await page.isVisible('#cmpEmpty')));assert.ok(!(await page.isVisible('#cmpOld')));
 assert.equal(await text(page,'#cmpNight'),'ليلة 16/11','the newest night is shown first');
 assert.match(await text(page,'#cmpSub'),/أمر السيستم الساعة 12:45 ص قدام المشتريات اللي دخلت بعده/);
 assert.deepEqual(await page.$$eval('#cmpThree .cmp-n b',d=>d.map(x=>x.textContent.trim())),['55','3','9'],'in both / arrived only / system only');
 assert.match(await text(page,'#cmpBig'),/السيستم جاب 95% من اللي وصلك/,'55 of the 58 that arrived');
 assert.match(await text(page,'#cmpPrec'),/و86% من أمر السيستم وصل/,'55 of the system\'s 64 lines');
 assert.match(await text(page,'#cmpFinal'),/النسبة دي بعد ما شفنا مشتريات تاني يوم/,'final night');
 assert.match(await text(page,'#cmpOutside'),/فيه 4 سطر إنت حطيتهم بإيدك/);assert.ok(await page.isVisible('#cmpOutside'));
 // the quantity: every line in both has the packs of its invoice, all the same
 assert.equal(await text(page,'#cmpQty'),'الكمية: 55 من 55 صنف وصلوا بنفس كمية السيستم.');assert.ok(await page.isVisible('#cmpQtyNote'));
 // the week: 3 of 7 nights, all together (165 of 174)
 assert.match(await text(page,'#cmpWeek'),/الأسبوع: 3 من 7 ليالي اتقارنت، والسيستم جاب في المتوسط 95% من اللي وصلك/);assert.match(await text(page,'#cmpWeek'),/لما يكملوا 7 ليالي/);
 // the money: how far over the system's cap he went that night, what the purchases are made of, the week (only complete nights with a cap = just that one)
 assert.ok(await page.isVisible('#cmpMoney'));
 assert.equal(await text(page,'#cmpCap'),'عدّيت سقف السيستم بـ 2,320 ج (13%)');assert.ok(await page.$eval('#cmpCap',e=>e.classList.contains('over')));
 assert.equal(await text(page,'#cmpBuy'),'اشتريت 20,000 ج بسعر التكلفة، والسقف 17,680 ج.');
 assert.equal(await text(page,'#cmpSplit'),'منها 10,500 ج من أمر السيستم، و8,000 ج أصناف مش في أمره، و1,500 ج كميات أكتر من أمره.');
 assert.equal(await text(page,'#cmpMisc'),'وغير كده 400 ج أصناف متنوعة: مش محسوبة.');assert.ok(await page.isVisible('#cmpMisc'));
 assert.equal(await text(page,'#cmpWeekMoney'),'الأسبوع: اشتريت 20,000 ج من سقف 17,680 ج (الليالي الكاملة: 1)، وعدّيته بـ 2,320 ج (13%).');
 // 7 slots, oldest first: 3 filled, 4 free
 assert.equal(await page.$$eval('#cmpBars .cmp-bar',b=>b.length),7);assert.equal(await page.$$eval('#cmpBars .cmp-bar.e',b=>b.length),4);
 assert.deepEqual(await page.$$eval('#cmpBars [data-night]',b=>b.map(x=>x.dataset.night)),['2026-11-14','2026-11-15','2026-11-16']);
 assert.ok(await page.$eval('#cmpBars [data-night="2026-11-16"]',b=>b.classList.contains('on')));
 // the lists: «وصل ومش في أمر السيستم» is open, the reasons are drawn from the codes, the one the system got wrong is red
 assert.ok(await page.$eval('#cmpGroups [data-grp="ao"]',d=>d.open));assert.ok(!(await page.$eval('#cmpGroups [data-grp="bo"]',d=>d.open)));assert.ok(!(await page.$eval('#cmpGroups [data-grp="both"]',d=>d.open)));
 assert.deepEqual(await page.$$eval('#cmpGroups summary b',b=>b.map(x=>x.textContent.trim())),['3','9','55']);
 const rows=await page.$$eval('#cmpGroups [data-grp="ao"] .cmp-row',r=>r.map(x=>[x.querySelector('strong').textContent.trim(),[...x.querySelectorAll('.cmp-why')].map(c=>c.textContent.trim()+'|'+c.className.replace('cmp-why','').trim())]));
 assert.deepEqual(rows,[['BETACOR 30TAB',['رصيده 3 يكفي 9 يوم|warn','وصل من الفتح بعد 16 ساعة|ok']],['HISTAZINE-1 100ML SYR',['رصيده قليل في نواقص يوميه والسيستم ما دخلهوش: محتاج نبص|red','وصل من الفتح بعد 16 ساعة|ok']],['RINGER SOL. 500CC. P.',['إنت لغيته من أمر الشرا|own','وصل من AMG بعد 17 ساعة|ok']]]);
 // the system's lines that did not arrive: final night = probably not ordered; an old line says how old
 await page.click('#cmpGroups [data-grp="bo"] summary');
 const bo=await page.$$eval('#cmpGroups [data-grp="bo"] .cmp-row',r=>r.slice(0,2).map(x=>[...x.querySelectorAll('.cmp-why')].map(c=>c.textContent.trim()+'|'+c.className.replace('cmp-why','').trim())));
 assert.deepEqual(bo,[['ما وصلش لحد دلوقتي: غالبًا ما اتطلبش|warn'],['سطر قديم من 3 يوم ولسه مفتوح|gray','ما وصلش لحد دلوقتي: غالبًا ما اتطلبش|warn']]);
 assert.match(await text(page,'#cmpGroups [data-grp="bo"] .cmp-row'),/× 2/,'the system\'s quantity');
 // a tap on an older night shows that night; the open lists stay open
 await page.click('#cmpBars [data-night="2026-11-15"]');
 assert.equal(await text(page,'#cmpNight'),'ليلة 15/11');
 assert.deepEqual(await page.$$eval('#cmpThree .cmp-n b',d=>d.map(x=>x.textContent.trim())),['60','4','2']);
 assert.match(await text(page,'#cmpBig'),/السيستم جاب 94%/);assert.ok(!(await page.isVisible('#cmpOutside')),'no hand-made lines that night = no note');
 assert.ok(!(await page.isVisible('#cmpMoney')),'an older night without money fields shows no money');
 assert.match(await text(page,'#cmpFinal'),/مؤقتة: لسه بنستنى الفواتير لحد 6:45 ص يوم 18\/11/,'a night inside the 30 hours is provisional and says until when');
 assert.ok(await page.$eval('#cmpGroups [data-grp="bo"]',d=>d.open));
 assert.ok(await page.isVisible('#draftsPanel'));
});
run('orders card: the quantity per line, and an item that is waiting for its invoice',async({page})=>{
 const n=night('2026-11-16',3,0,2);
 n.both_items=[{id:1,name:'SAME QTY',qty:3,bag:'2428',arr:arr(14,3)},{id:2,name:'LESS ARRIVED',qty:2,bag:'2428',arr:arr(14,1)},{id:3,name:'MORE ARRIVED',qty:1,bag:'2428',arr:arr(14,4.4)}];
 await put(page,file([n]));
 await openOrders(page);
 await page.waitForSelector('#cmpMain:not(.hidden)');
 assert.equal(await text(page,'#cmpQty'),'الكمية: 1 من 3 صنف وصلوا بنفس كمية السيستم.');
 await page.click('#cmpGroups [data-grp="both"] summary');
 const rows=await page.$$eval('#cmpGroups [data-grp="both"] .cmp-row',r=>r.map(x=>[...x.querySelectorAll('.cmp-why')].map(c=>c.textContent.trim()+'|'+c.className.replace('cmp-why','').trim())));
 assert.deepEqual(rows,[['وصل 3: نفس كمية السيستم|ok'],['السيستم 2 ووصل 1|warn'],['السيستم 1 ووصل 4.4|warn']],'a difference in orange, either way');
 // not final: the system's lines are only waiting
 await page.click('#cmpGroups [data-grp="bo"] summary');
 assert.equal(await page.$eval('#cmpGroups [data-grp="bo"] .cmp-row .cmp-why',e=>e.textContent.trim()),'لسه ما وصلش: بنستنى الفواتير');
 assert.match(await text(page,'#cmpFinal'),/مؤقتة/);
});
run('orders card: no file yet = says so; an old file = warns; a late night = says the reasons may be off',async({page})=>{
 await openOrders(page);
 await page.waitForSelector('#cmpBox:not(.hidden)');
 assert.match(await text(page,'#cmpEmpty'),/لسه مفيش مقارنة: أول مقارنة بتظهر بعد طلب الليلة/);assert.ok(await page.isVisible('#cmpEmpty'));assert.ok(!(await page.isVisible('#cmpMain')));
 // the laptop stopped updating for two days
 await put(page,file([night('2026-11-16',5,1,1)],new Date(Date.now()-48*3600e3).toISOString()));
 await page.click('[data-tab="docs"]');await page.click('[data-tab="drafts"]');await page.evaluate(()=>document.querySelectorAll('details.od-fold').forEach(d=>{d.open=true}));
 await page.waitForSelector('#cmpMain:not(.hidden)');
 assert.ok(await page.isVisible('#cmpOld'));assert.match(await text(page,'#cmpOld'),/الملف قديم/);
 assert.ok(!(await page.isVisible('#cmpLate')));
 await put(page,file([night('2026-11-16',5,1,1,{late:true})]));
 await page.click('[data-tab="docs"]');await page.click('[data-tab="drafts"]');await page.evaluate(()=>document.querySelectorAll('details.od-fold').forEach(d=>{d.open=true}));
 await page.waitForFunction(()=>!document.getElementById('cmpOld').offsetParent);
 assert.ok(await page.isVisible('#cmpLate'));
 // a file that is not what the laptop writes = the same as no file
 await put(page,{nights:'oops'});
 await page.click('[data-tab="docs"]');await page.click('[data-tab="drafts"]');await page.evaluate(()=>document.querySelectorAll('details.od-fold').forEach(d=>{d.open=true}));
 await page.waitForFunction(()=>!document.getElementById('cmpEmpty').classList.contains('hidden'));
 assert.ok(!(await page.isVisible('#cmpMain')));
});
// the owner 2026-11-28: when the cap (or another rule of the builder) kept an item out of the order, the report says so, in both languages
const KEPT=[['cap','FEROGLOBIN SYR','السقف مسكه: ميزانية الأمر كانت كملت','Held by the cap: the order\'s budget was full'],
 ['got_today','CONGESTAL 20TAB','كان وصل في نفس اليوم: السيستم مش بيطلبه مرتين في اليوم','It had arrived the same day: the system does not order it twice in a day'],
 ['asked','NEW CREAM 50GM','صنف جديد أو «بالطلب»: مش بيدخل الأمر غير لما تضيفه','A new or «on request» item: it does not enter the order until you add it'],
 ['not_now','OZEMPIC PEN','إنت دوست عليه «مش دلوقتي»','You tapped «Not now» on it'],
 ['dup_same','PANADOL EXTRA','إنت قلت إنه نفس صنف تاني','You said it is the same as another item']];
const keptNight=()=>night('2026-11-29',3,0,0,{final:true,arrived_only_items:KEPT.map(([why,name],k)=>({id:300+k,name,why,arr:arr(14,1)}))});
const whyTexts=(page)=>page.$$eval('#cmpGroups [data-grp="ao"] .cmp-row',r=>r.map(x=>x.querySelector('.cmp-why').textContent.trim()));
run('orders card: what the system itself kept out of the order is said as it is',async({page})=>{
 await put(page,file([keptNight()]));
 await openOrders(page);
 await page.waitForSelector('#cmpMain:not(.hidden)');
 assert.deepEqual(await whyTexts(page),KEPT.map(x=>x[2]));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the phone');
 if(process.env.SHOT_DIR)await (await page.$('#cmpBox')).screenshot({path:process.env.SHOT_DIR+'/order-compare-kept.png'});
 await page.evaluate(()=>localStorage.setItem('asker-lang','en'));
 await page.reload();
 await page.waitForFunction(()=>window.__tables);
 await put(page,file([keptNight()]));
 await openOrders(page);
 await page.waitForSelector('#cmpMain:not(.hidden)');
 assert.deepEqual(await whyTexts(page),KEPT.map(x=>x[3]));
});
run('orders card in English: the texts are drawn from codes, so they translate; item names stay',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('asker-lang','en'));
 await page.reload();
 await page.waitForFunction(()=>window.__tables);
 await put(page,file([night('2026-11-15',60,4,2,{final:true,...cash(20000,17680)}),night('2026-11-16',55,3,9,{manual:2,...cash(15000,17680)})]));
 await openOrders(page);
 await page.waitForSelector('#cmpMain:not(.hidden)');
 assert.equal(await text(page,'#cmpNight'),'Night 16/11');
 assert.match(await text(page,'#cmpBig'),/The system had 95% of what you received/);
 assert.match(await text(page,'#cmpPrec'),/and 86% of the system's order arrived/);
 assert.match(await text(page,'#cmpWeek'),/Week: 2 of 7 nights compared, the system had \d+% of what you received on average/);
 assert.match(await text(page,'#cmpFinal'),/Provisional: still waiting for the invoices until/);
 assert.match(await text(page,'#cmpOutside'),/And 2 lines you added by hand to the purchase order/);
 assert.match(await text(page,'#cmpQty'),/Quantity: 55 of 55 items arrived in the same quantity as the system/);
 // the money in English: a night still waiting only says how far he is; a complete night says how much he went over; the week; the split
 assert.equal(await text(page,'#cmpCap'),'So far you bought 15,000 EGP of a 17,680 EGP cap');
 assert.equal(await text(page,'#cmpBuy'),'You bought 15,000 EGP at cost price, and the cap is 17,680 EGP.');
 assert.equal(await text(page,'#cmpSplit'),'Of it, 10,500 EGP is from the system\'s order, 3,000 EGP is items not in its order, and 1,500 EGP is quantities beyond its order.');
 assert.equal(await text(page,'#cmpMisc'),'Plus 400 EGP of miscellaneous items: not counted.');
 assert.equal(await text(page,'#cmpWeekMoney'),'Week: you bought 20,000 EGP against a 17,680 EGP cap (complete nights: 1), and went over it by 2,320 EGP (13%).');
 await page.click('#cmpBars [data-night="2026-11-15"]');
 assert.equal(await text(page,'#cmpCap'),'You went over the system\'s cap by 2,320 EGP (13%)');
 await page.click('#cmpBars [data-night="2026-11-16"]');
 assert.deepEqual(await page.$$eval('#cmpThree .cmp-n span',s=>s.map(x=>x.textContent.trim())),['Ordered and arrived','Arrived, not in the system\'s order','In the system\'s order, did not arrive']);
 const why=await page.$$eval('#cmpGroups [data-grp="ao"] .cmp-row',r=>r.map(x=>[...x.querySelectorAll('.cmp-why')].map(c=>c.textContent.trim()).join(' | ')));
 assert.equal(why[0],'Stock 3 lasts 9 days | Arrived from El Fath after 16 hours','the vendor\'s name is translated like everywhere else');
 assert.equal(why[2],'You cancelled it from the purchase order | Arrived from AMG after 17 hours');
 assert.equal(await page.$eval('#cmpGroups [data-grp="ao"] .cmp-row strong',e=>e.textContent.trim()),'BETACOR 30TAB','item names are not touched');
 await page.click('#cmpGroups [data-grp="bo"] summary');
 assert.equal(await page.$eval('#cmpGroups [data-grp="bo"] .cmp-row',e=>[...e.querySelectorAll('.cmp-why')].map(c=>c.textContent.trim()).join(' | ')),'Not arrived yet: waiting for the invoices');
 const ar=await page.evaluate(()=>[...document.querySelectorAll('#cmpBox *')].filter(e=>!e.closest('.notr')&&e.children.length===0&&/[؀-ۿ]/.test(e.textContent)&&!/Zero stock in|Low stock in|الفتح/.test(e.closest('.cmp-row')?.textContent||'')).map(e=>e.textContent.trim()));
 assert.deepEqual(ar,[],'no Arabic left in the card (a bag\'s or a vendor\'s own name inside a line stays as PharmaFly writes it)');
});
