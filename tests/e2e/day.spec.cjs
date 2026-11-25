// «📅 اليوم» (owner 2026-11-25, mockup mockups/day_page_2026-11-25, his «ابنيها»): the pharmacy's day from PharmaFly's own figures (the laptop's file day/day.json in the private bucket), on the card on
// «الرئيسية» and on the page: the four numbers, the boxes, the purchases, the hours, the below-cost sales, our own events, the week, the previous / next day, an old file, no file, and a staff
// member who sees none. The server's tables are played here. Made-up numbers only: the repository is public.
const {run,assert}=require('./harness.cjs');
const flat=(x)=>{const w=document.createTreeWalker(x,NodeFilter.SHOW_TEXT),a=[];let n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\s+/g,' ').trim()};
const txt=(page,sel)=>page.$eval(sel,(x,f)=>new Function('x','return ('+f+')(x)')(x),flat.toString());
const seed=(page,{old=false}={})=>page.evaluate(({old})=>{
 const pad=(n)=>String(n).padStart(2,'0'),ymd=(d)=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const today=new Date(),days={};
 for(let i=0;i<9;i++){const d=new Date(today);d.setDate(d.getDate()-i);
  days[ymd(d)]={date:ymd(d),net_sales:1000+i*100,gross_sales:1100+i*100,returns:100,discounts:10,misc:i===0?450:0,tickets:10+i,return_tickets:1,zero_tickets:0,items_revenue:900,cost:700,profit:190+i,margin:21.1,collected:800,
   credit:{net_new:300,paid:50,sales:320,customers:4},hours:Array.from({length:24},(_,h)=>(h>=10&&h<=14?100+h:0)),
   boxes:[{id:1,name:'درج مثال',in:800,out:50,balance:i===0?5000:null},{id:2,name:'خزنة مثال',in:0,out:200,balance:i===0?900:null}],
   expenses:i===0?[{name:'كهرباء',amount:120}]:[],supplier_paid:i===0?640:0,owner_out:0,purchases:{n:2,total:1500,returns_n:i===0?1:0,returns:i===0?200:0},
   below_cost:i===0?{n:2,lines:[{ticket:5001,item:'ITEM A 10MG',price:10,cost:12,at:'20:10'},{ticket:5002,item:'ITEM B',price:5,cost:6.5,at:'20:20'}]}:{n:0,lines:[]}};}
 const first=new Date(today);first.setDate(first.getDate());
 window.__storage['day/day.json']=JSON.stringify({v:1,source:'pharmafly',generated_at:old?new Date(Date.now()-5*3600e3).toISOString():new Date().toISOString(),data_at:ymd(today)+' 20:28:10',last_ticket_at:ymd(today)+' 20:30:00',today:ymd(today),days});
 // our own system's events of today
 const now=new Date().toISOString();
 window.__tables.ar_invoice_reviews=[{id:1,status:'entered',done_at:now,created_at:now},{id:2,status:'entered',done_at:now,created_at:now},{id:3,status:'ready',done_at:null,created_at:now}];
 window.__tables.ar_robot_reports=[{id:9,job:'purchases',created_at:now,status:'done',ref_id:'card:1:stop',title:'x'}];
 window.__tables.ar_store_orders=[{id:1,created_at:now,status:'new'},{id:2,created_at:now,status:'new'},{id:3,created_at:now,status:'new'}];
 window.__tables.ar_temp_sales=[{id:'a',created_at:now}];
 window.__today=ymd(today);
},{old});

run('Day page: the home card, the four numbers, the boxes, the purchases, the hours, below-cost sales, our events, the week, the previous and next day',async({page})=>{
 await seed(page);
 await page.evaluate(()=>window.AskerDay.load());
 await page.waitForSelector('#dayCard:not(.hidden) .dy-k');
 // the card on «الرئيسية»: today's sales and profit, the time of the copy, the way in
 assert.match(await txt(page,'#dayCard'),/📅 النهارده لحد 8:28 م.*المبيعات 1,000 .*الربح \(تقريبي\) 190 21.1٪.*تفاصيل اليوم ←/);
 await page.click('#dayCard [data-go="day"]');
 await page.waitForSelector('#dayPanel:not(.hidden) .dy-grid');
 assert.equal(await page.getAttribute('.subbar[data-for="sales"] [data-tab="day"]','class').then((c)=>/chip/.test(c)),true,'the small tab is in «المبيعات»');
 // the date, the stamp, the four numbers
 const today=await page.evaluate(()=>window.__today);
 assert.match(await txt(page,'.dy-nav b'),/^(الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت) \d{1,2} (يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)$/);
 assert.match(await txt(page,'.dy-stamp'),/البيانات لحد 8:28 م · اتجمّعت من فارما فلاي/);
 const ks=await page.$$eval('.dy-grid .dy-k',(k,f)=>k.map(new Function('x','return ('+f+')(x)')),flat.toString());
 assert.match(ks[0],/^المبيعات 1,000 10 تذكرة · المتوسط 110$/);
 assert.match(ks[1],/^الربح \(تقريبي\) 190 21.1٪ · الربح تقريبي: التكلفة من تذاكر فارما فلاي\.$/);
 assert.match(ks[2],/^اتحصّل كاش 800 50 منه سداد عملاء$/);
 assert.match(ks[3],/^آجل جديد 300 4 عميل · بيع آجل 320$/);
 // returns / discounts / the misc item of today
 assert.match(await txt(page,'#dyMain .dy-line'),/مرتجع 100/);assert.match(await txt(page,'#dyMain .dy-line'),/خصومات 10/);assert.match(await txt(page,'#dyMain .dy-line'),/أصناف متنوعة \(بالقيمة\) 450/);
 // the boxes: in, out, the balance now; the expenses, the suppliers' payments
 const rows=await page.$$eval('#dyMain table tr',(r,f)=>r.map(new Function('x','return ('+f+')(x)')),flat.toString());
 assert.deepEqual(rows,['الخزنة داخل خارج الرصيد الآن','درج مثال 800 50 5,000','خزنة مثال 0 200 900']);
 assert.match(await txt(page,'#dyMain .dy-sub'),/مصروفات: كهرباء 120/);
 assert.match(await txt(page,'#dyMain'),/دفعات للموردين: 640/);
 // the purchases and returns
 assert.match(await txt(page,'#dyMain .dy-text'),/🧾 فواتير شراء 2 بقيمة 1,500 · مرتجع للشركات 200 · مرتجع 100/);
 // the hours: 10..14 only
 assert.deepEqual(await page.$$eval('#dyMain .dy-chart',(c)=>c.map((x)=>x.querySelectorAll('.dy-bars > div').length)),[5,7],'five hours that sold, then the week');
 // below cost: the list
 assert.match(await txt(page,'#dyMain .dy-warn'),/2 اتباع بأقل من التكلفة/);
 assert.match(await txt(page,'#dyMain .dy-warn'),/تذكرة 5001 · ITEM A 10MG · بيع 10 والتكلفة 12 · 20:10/);
 // our events (the system's tables of today)
 await page.waitForFunction(()=>/من سيستمنا/.test(document.getElementById('dyMain').textContent));
 assert.match((await page.$$eval('#dyMain .dy-line',(l,f)=>l.map(new Function('x','return ('+f+')(x)')),flat.toString())).pop(),/🤖 فواتير اتدخلت 2 وقفات الروبوت 1 طلبات الموقع 3 بيع مؤقت 1/);
 // the week: seven bars, today marked
 assert.equal(await page.$$eval('#dyMain .dy-chart',(c)=>c[c.length-1].querySelectorAll('.dy-bars > div.t').length),1,'today is marked in the week');
 // the previous day: another date, no boxes balance, the next button comes alive and the current one is disabled at today
 assert.equal(await page.$eval('[data-dy-next]',(b)=>b.disabled),true,'nothing after today');
 await page.click('[data-dy-prev]');
 await page.waitForFunction(()=>document.querySelector('[data-dy-next]')&&!document.querySelector('[data-dy-next]').disabled);
 assert.match((await page.$$eval('.dy-grid .dy-k',(k,f)=>k.map(new Function('x','return ('+f+')(x)')),flat.toString()))[0],/^المبيعات 1,100 11 تذكرة/);
 assert.match(await txt(page,'.dy-stamp'),/^اتجمّعت من فارما فلاي$/,'an older day has no «لحد» (its copy time is not the point)');
 assert.match(await txt(page,'#dyMain .dy-card:has(.dy-ok)'),/✓ مفيش بيع تحت التكلفة/);
 await page.click('[data-dy-next]');
 await page.waitForFunction(()=>/المبيعات\s*1,000/.test(document.querySelector('.dy-grid .dy-k')?.textContent||''));
},{home:true});

run('Day page: an old file warns, no file says so, and a staff member sees no card',async({page})=>{
 await seed(page,{old:true});
 await page.evaluate(()=>window.AskerDay.load());
 await page.waitForSelector('#dayCard:not(.hidden)');
 await page.evaluate(()=>window.AskerApp.showTab('day'));
 await page.waitForSelector('#dayPanel:not(.hidden) .dy-grid');
 assert.equal(await page.$eval('#dyOld',(e)=>!e.classList.contains('hidden')),true,'the file is 5 hours old');
 assert.match(await txt(page,'#dyOld'),/الملف قديم/);
 // no file at all
 await page.evaluate(()=>{delete window.__storage['day/day.json'];return window.AskerDay.load()});
 await page.waitForFunction(()=>/ملف اليوم من اللاب: لسه ما وصلش/.test(document.getElementById('dyMain').textContent));
 // a staff member: no card
 await seed(page);
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;return window.AskerDay.load()});
 await page.waitForFunction(()=>document.getElementById('dayCard').classList.contains('hidden'));
},{home:true});
