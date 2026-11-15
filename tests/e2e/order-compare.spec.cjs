// «طلب الجهاز × طلب البوت» card at the top of «الطلبيات»: reads the laptop's file (private bucket asker-private/orders/compare.json):
// three counts, «البوت جاب X% من اللي طلبته إنت», the 7-night chart (a tap on a night shows that night), and the three lists with the
// reason each item missed. It only reads: nothing is written and nothing is sent.
const {run,text,assert}=require('./harness.cjs');
const night=(key,both,om,ob,extra={})=>({night:key,at:key+' 00:46',comparable:true,late:false,machine:both+om,bot:both+ob,both,only_machine:om,only_bot:ob,outside:0,both_scope:both,
 both_items:Array.from({length:both},(_,k)=>({id:k+1,name:'BOTH ITEM '+k,qty:1,bag:'2428'})),
 only_machine_items:[{id:100,name:'BETACOR 30TAB',why:'had_stock',have:3,txt:'x'},{id:101,name:'HISTAZINE-1 100ML SYR',why:'missed',bag:'نواقص يوميه',txt:'x'},{id:102,name:'RINGER SOL. 500CC. P.',why:'cancelled_me',txt:'x'},
  {id:103,name:'LICID 60CC LOTION',why:'other_bag',bag:'مالك',txt:'x'}].slice(0,om),
 only_bot_items:Array.from({length:ob},(_,k)=>({id:200+k,name:'BOT ONLY '+k,qty:2,why:k===0?'skipped':'carried',days:3,txt:'x'})),...extra});
const file=(nights,at=new Date().toISOString())=>({generated_at:at,scope:{bag:'2428',label:'نواقص يوميه'},week:{nights:nights.length},nights});
const put=(page,o)=>page.evaluate(o=>{window.__storage['orders/compare.json']=JSON.stringify(o)},o);
const openOrders=async(page)=>{await page.click('[data-pgroup="orders"]');await page.click('[data-tab="drafts"]')};
run('orders card: counts, rate, 7 nights, the three lists with their reasons',async({page})=>{
 // an empty drafts file: the card must show anyway (it does not depend on the order advisor's file)
 await put(page,file([night('2026-11-14',50,2,1),night('2026-11-15',60,4,2),night('2026-11-16',55,3,9,{outside:12})]));
 await openOrders(page);
 await page.waitForSelector('#cmpMain:not(.hidden)');
 assert.ok(await page.isVisible('#cmpBox'));assert.ok(!(await page.isVisible('#cmpEmpty')));assert.ok(!(await page.isVisible('#cmpOld')));
 assert.equal(await text(page,'#cmpNight'),'ليلة 16/11','the newest night is shown first');
 assert.match(await text(page,'#cmpSub'),/الساعة 12:46 ص/);
 assert.deepEqual(await page.$$eval('#cmpThree .cmp-n',d=>d.map(x=>x.querySelector('b').textContent.trim())),['55','3','9'],'both / machine only / bot only');
 assert.match(await text(page,'#cmpBig'),/البوت جاب 95% من اللي طلبته إنت/,'55 of the 58 he ordered');
 assert.match(await text(page,'#cmpPrec'),/و86% من اللي طلبه البوت إنت طلبته كمان/);
 assert.match(await text(page,'#cmpOutside'),/12 صنف تانيين/);assert.ok(await page.isVisible('#cmpOutside'));
 // the week: 3 of 7 nights, all together (165 of 174)
 assert.match(await text(page,'#cmpWeek'),/الأسبوع: 3 من 7 ليالي اتقارنت، والبوت جاب في المتوسط 95% من طلبك/);assert.match(await text(page,'#cmpWeek'),/لما يكملوا 7 ليالي/);
 // 7 slots, oldest first: 3 filled, 4 free
 assert.equal(await page.$$eval('#cmpBars .cmp-bar',b=>b.length),7);assert.equal(await page.$$eval('#cmpBars .cmp-bar.e',b=>b.length),4);
 assert.deepEqual(await page.$$eval('#cmpBars [data-night]',b=>b.map(x=>x.dataset.night)),['2026-11-14','2026-11-15','2026-11-16']);
 assert.ok(await page.$eval('#cmpBars [data-night="2026-11-16"]',b=>b.classList.contains('on')));
 // the lists: «الجهاز بس» is open, the reasons are drawn from the codes, «البوت جاب» is the worst thing (red)
 assert.ok(await page.$eval('#cmpGroups [data-grp="om"]',d=>d.open));assert.ok(!(await page.$eval('#cmpGroups [data-grp="ob"]',d=>d.open)));assert.ok(!(await page.$eval('#cmpGroups [data-grp="both"]',d=>d.open)));
 assert.deepEqual(await page.$$eval('#cmpGroups summary b',b=>b.map(x=>x.textContent.trim())),['3','9','55']);
 const rows=await page.$$eval('#cmpGroups [data-grp="om"] .cmp-row',r=>r.map(x=>[x.querySelector('strong').textContent.trim(),x.querySelector('.cmp-why').textContent.trim(),x.querySelector('.cmp-why').className.replace('cmp-why','').trim()]));
 assert.deepEqual(rows,[['BETACOR 30TAB','عنده رصيد 3 (البوت بيطلب الصفر بس)','warn'],['HISTAZINE-1 100ML SYR','رصيده صفر في نواقص يوميه والبوت ما دخلهوش: محتاج نبص','red'],['RINGER SOL. 500CC. P.','إنت لغيته من أمر الشرا','own']]);
 await page.click('#cmpGroups [data-grp="ob"] summary');
 assert.deepEqual(await page.$$eval('#cmpGroups [data-grp="ob"] .cmp-row .cmp-why',r=>r.slice(0,2).map(x=>x.textContent.trim())),['البوت طلبه وإنت ما طلبتوش من الجهاز','سطر قديم من 3 يوم ولسه مفتوح']);
 assert.match(await text(page,'#cmpGroups [data-grp="ob"] .cmp-row'),/× 2/,'the bot\'s quantity');
 // a tap on an older night shows that night; the open lists stay open
 await page.click('#cmpBars [data-night="2026-11-15"]');
 assert.equal(await text(page,'#cmpNight'),'ليلة 15/11');
 assert.deepEqual(await page.$$eval('#cmpThree .cmp-n b',d=>d.map(x=>x.textContent.trim())),['60','4','2']);
 assert.match(await text(page,'#cmpBig'),/البوت جاب 94%/);assert.ok(!(await page.isVisible('#cmpOutside')),'no other-bag lines that night = no note');
 assert.ok(await page.$eval('#cmpGroups [data-grp="ob"]',d=>d.open));
 // the other drafts parts are untouched
 assert.ok(await page.isVisible('#draftsPanel'));
});
run('orders card: no file yet = says so; an old file = warns; a late night = says the reasons may be off',async({page})=>{
 await openOrders(page);
 await page.waitForSelector('#cmpBox:not(.hidden)');
 assert.match(await text(page,'#cmpEmpty'),/لسه مفيش مقارنة: أول مقارنة بتظهر بعد طلب الليلة/);assert.ok(await page.isVisible('#cmpEmpty'));assert.ok(!(await page.isVisible('#cmpMain')));
 // the laptop stopped updating for two days
 await put(page,file([night('2026-11-16',5,1,1)],new Date(Date.now()-48*3600e3).toISOString()));
 await page.click('[data-tab="docs"]');await page.click('[data-tab="drafts"]');
 await page.waitForSelector('#cmpMain:not(.hidden)');
 assert.ok(await page.isVisible('#cmpOld'));assert.match(await text(page,'#cmpOld'),/الملف قديم/);
 assert.ok(!(await page.isVisible('#cmpLate')));
 await put(page,file([night('2026-11-16',5,1,1,{late:true})]));
 await page.click('[data-tab="docs"]');await page.click('[data-tab="drafts"]');
 await page.waitForFunction(()=>!document.getElementById('cmpOld').offsetParent);
 assert.ok(await page.isVisible('#cmpLate'));
 // a file that is not what the laptop writes = the same as no file
 await put(page,{nights:'oops'});
 await page.click('[data-tab="docs"]');await page.click('[data-tab="drafts"]');
 await page.waitForFunction(()=>!document.getElementById('cmpEmpty').classList.contains('hidden'));
 assert.ok(!(await page.isVisible('#cmpMain')));
});
run('orders card in English: the texts are drawn from codes, so they translate; item names stay',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('asker-lang','en'));
 await page.reload();
 await page.waitForFunction(()=>window.__tables);
 await put(page,file([night('2026-11-15',60,4,2),night('2026-11-16',55,3,9,{outside:12})]));
 await openOrders(page);
 await page.waitForSelector('#cmpMain:not(.hidden)');
 assert.equal(await text(page,'#cmpNight'),'Night 16/11');
 assert.match(await text(page,'#cmpBig'),/The bot had 95% of what you ordered/);
 assert.match(await text(page,'#cmpPrec'),/and 86% of what the bot ordered you ordered too/);
 assert.match(await text(page,'#cmpWeek'),/Week: 2 of 7 nights compared, the bot had \d+% of your order on average/);
 assert.deepEqual(await page.$$eval('#cmpThree .cmp-n span',s=>s.map(x=>x.textContent.trim())),['Ordered in both','Machine only (the bot missed it)','Bot only (you did not order it)']);
 const why=await page.$$eval('#cmpGroups [data-grp="om"] .cmp-why',r=>r.map(x=>x.textContent.trim()));
 assert.equal(why[0],'Has 3 in stock (the bot orders only zero stock)');assert.equal(why[2],'You cancelled it from the purchase order');
 assert.equal(await page.$eval('#cmpGroups [data-grp="om"] .cmp-row strong',e=>e.textContent.trim()),'BETACOR 30TAB','item names are not touched');
 const ar=await page.evaluate(()=>[...document.querySelectorAll('#cmpBox *')].filter(e=>!e.closest('.notr')&&e.children.length===0&&/[؀-ۿ]/.test(e.textContent)&&!/Zero stock in/.test(e.closest('.cmp-row')?.textContent||'')).map(e=>e.textContent.trim()));
 assert.deepEqual(ar,[],'no Arabic left in the card (a bag\'s own name inside a reason stays as PharmaFly writes it)');
});