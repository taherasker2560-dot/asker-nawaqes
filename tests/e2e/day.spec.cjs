// «📅 اليوم» (owner 2026-11-25, mockups day_page_2026-11-25 and day_page_v2_2026-11-25, his «ابنيها» twice): the pharmacy's day from PharmaFly's own figures (the laptop's files in the private bucket
// asker-private/day: day.json = the summary of up to 90 days, d_<date>.json = one day's tickets with their lines). The card on «الرئيسية»; the page: the date picker and quick days, every number a button
// (المبيعات، اتحصّل كاش، آجل جديد، مرتجع، خصومات، أصناف متنوعة، من غير سعر) opening its list with a search box, a tap on a ticket = the whole invoice, back; the profit is not a button; an old file,
// no file, a staff member who sees none. The server's tables are played here. Made-up numbers and names only: the repository is public.
const {run,assert}=require('./harness.cjs');
const flat=(x)=>{const w=document.createTreeWalker(x,NodeFilter.SHOW_TEXT),a=[];let n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\s+/g,' ').trim()};
const txt=(page,sel)=>page.$eval(sel,(x,f)=>new Function('x','return ('+f+')(x)')(x),flat.toString());
const all=(page,sel)=>page.$$eval(sel,(b,f)=>b.map(new Function('x','return ('+f+')(x)')),flat.toString());
const seed=(page,{old=false}={})=>page.evaluate(({old})=>{
 const pad=(n)=>String(n).padStart(2,'0'),ymd=(d)=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const today=new Date(),days={},ago=(n)=>{const d=new Date(today);d.setDate(d.getDate()-n);return ymd(d)};
 for(let i=0;i<9;i++){const k=ago(i);
  days[k]={date:k,net_sales:i===0?5470:1000+i*100,gross_sales:i===0?5600:1100+i*100,returns:i===0?130:100,discounts:i===0?25:10,misc:i===0?4650:0,tickets:i===0?4:10+i,return_tickets:i===0?2:1,zero_tickets:0,items_revenue:900,cost:700,profit:190+i,margin:21.1,collected:i===0?545:800,
   free:{lines:i===0?1:0,cost:i===0?12.5:0},cost_fallback:{lines:0,of:5},cost_basis:'last_purchase',
   credit:{net_new:i===0?4770:300,paid:i===0?300:50,sales:i===0?5170:320,customers:i===0?2:4},hours:Array.from({length:24},(_,h)=>(h>=10&&h<=14?100+h:0)),
   boxes:[{id:1,name:'درج مثال',in:800,out:50,balance:i===0?5000:null},{id:2,name:'خزنة مثال',in:0,out:200,balance:i===0?900:null}],
   expenses:i===0?[{name:'كهرباء',amount:120}]:[],supplier_paid:i===0?640:0,owner_out:0,purchases:{n:2,total:1500,returns_n:i===0?1:0,returns:i===0?200:0},
   below_cost:i===0?{n:1,lines:[{ticket:3,item:'ITEM C',price:95,cost:99,at:'14:20'}]}:{n:0,lines:[]}};}
 window.__storage['day/day.json']=JSON.stringify({v:2,source:'pharmafly',generated_at:old?new Date(Date.now()-5*3600e3).toISOString():new Date().toISOString(),data_at:ymd(today)+' 20:28:10',last_ticket_at:ymd(today)+' 20:30:00',today:ymd(today),days});
 const tk=(id,o)=>Object.assign({id,t:'14:05',k:'s',ty:'c',cu:'',total:100,d:0,p:100,memo:'',lines:[{n:'ITEM A 10MG',q:1,pr:100,t:100}]},o);
 const tickets=[tk(1,{}),
  tk(2,{ty:'a',cu:'عميل مثال ١',total:4650,p:0,lines:[{n:'أصناف متنوعة',q:4650,pr:1,t:4650,m:1,memo:'فاتورة قديمة'}],mp:{vendor:'صيدلية مثال',at:'20:27',code:'686347'}}),
  tk(3,{ty:'a',cu:'زبون تاني',total:520,p:300,d:20,t:'14:20',lines:[{n:'ITEM B',q:0.5,pr:400,t:200},{n:'ITEM C',q:1,pr:95,t:95,bc:1},{n:'ITEM B BOX',q:0.067,pr:0,t:0,ct:1,u:2}]}),
  tk(4,{k:'r',total:-50,p:-50,lines:[{n:'ITEM A 10MG',q:-1,pr:50,t:-50}]}),
  tk(5,{ty:'a',cu:'زبون تاني',k:'r',total:-80,p:0,lines:[{n:'ITEM D',q:-1,pr:80,t:-80}]}),
  tk(6,{total:200,d:5,p:195,lines:[{n:'ITEM E',q:2,pr:100,t:200},{n:'ITEM F',q:1,pr:0,t:0,fr:1,c:12.5}]})];
 const buys={invoices:[{code:'11/26/232796',vendor:'مورد مثال',t:'14:20',net:900.5,lines:4,ret:302.4},{code:'11/26/600',vendor:'مخزن مثال',t:'16:00',net:99.5,lines:1,ret:0}],new_cards:[{n:'ITEM NEW 10 TAB',price:91}],prices:[{n:'ITEM B',was:210,now:285}]};
 window.__storage['day/d_'+ymd(today)+'.json']=JSON.stringify({v:1,date:ymd(today),tickets,buys,supplier_returns:[{code:'~11/26/232796',vendor:'مورد مثال',total:-302.4,t:'14:24'},{code:'11/26/94',vendor:'مورد تاني',total:-1700,t:'14:26'}]});
 window.__storage['day/d_'+ago(1)+'.json']=JSON.stringify({v:1,date:ago(1),tickets:[tk(11,{total:1100,p:1100})],supplier_returns:[]});
 // our own system's events of today
 const now=new Date().toISOString();
 window.__tables.ar_invoice_reviews=[{id:1,status:'entered',done_at:now,created_at:now},{id:2,status:'entered',done_at:now,created_at:now},{id:3,status:'ready',done_at:null,created_at:now}];
 window.__tables.ar_robot_reports=[{id:9,job:'purchases',created_at:now,status:'done',ref_id:'card:1:stop',title:'x'}];
 window.__tables.ar_store_orders=[{id:1,created_at:now,status:'new'},{id:2,created_at:now,status:'new'},{id:3,created_at:now,status:'new'}];
 window.__tables.ar_temp_sales=[{id:'a',created_at:now}];
 window.__today=ymd(today);window.__yesterday=ago(1);window.__week=ago(7);
},{old});
const openPage=async(page)=>{await seed(page);await page.evaluate(()=>window.AskerDay.load());await page.waitForSelector('#dayCard:not(.hidden) .dy-k');await page.click('#dayCard [data-go="day"]');await page.waitForSelector('#dayPanel:not(.hidden) .dy-grid')};

run('Day page: the home card, the date bar, the four numbers, the boxes, the purchases, the hours, below-cost sales, our events, the week, quick days and the picker',async({page})=>{
 await seed(page);
 await page.evaluate(()=>window.AskerDay.load());
 await page.waitForSelector('#dayCard:not(.hidden) .dy-k');
 // the card on «الرئيسية»: today's sales and profit, the time of the copy, the way in
 assert.match(await txt(page,'#dayCard'),/📅 النهارده لحد 8:28 م.*المبيعات 5,470 .*الربح \(تقريبي\) 190 21.1٪.*تفاصيل اليوم ←/);
 await page.click('#dayCard [data-go="day"]');
 await page.waitForSelector('#dayPanel:not(.hidden) .dy-grid');
 assert.ok(await page.isVisible('#rpBack'),'a report of «📊 التقارير»: the way back is on top');
 // the date bar: today, the picker, the quick days
 const today=await page.evaluate(()=>window.__today),yest=await page.evaluate(()=>window.__yesterday);
 assert.equal(await page.inputValue('#dyDate'),today);
 assert.match(await txt(page,'.dy-date span'),/^(الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت) \d{1,2} (يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)$/);
 assert.deepEqual(await all(page,'#dyMain .dy-pick ~ .dy-line .dy-chip'),['النهارده','امبارح','من أسبوع','من شهر']);
 assert.equal(await page.$eval('[data-dy-go="'+today+'"]',(b)=>b.classList.contains('on')),true);
 assert.equal(await page.$eval('#dyMain .dy-pick ~ .dy-line [data-dy-go]:last-child',(b)=>b.disabled),true,'a month ago has no data in this file: its button is off');
 assert.match(await txt(page,'.dy-stamp'),/البيانات لحد 8:28 م · اتجمّعت من فارما فلاي · الأيام من/);
 // the four numbers: the first, the third and the credit one are buttons, the profit is not
 const ks=await all(page,'.dy-grid .dy-k');
 assert.match(ks[0],/^المبيعات 5,470 4 تذكرة · المتوسط 1,400$/);
 assert.match(ks[1],/^الربح \(تقريبي\) 190 21.1٪ · الربح تقريبي: بتكلفة آخر شرا لكل صنف\.$/);
 assert.match(ks[2],/^اتحصّل كاش 545 300 منه سداد عملاء$/);
 assert.match(ks[3],/^آجل جديد 4,770 2 عميل · بيع آجل 5,170$/);
 assert.deepEqual(await page.$$eval('.dy-grid .dy-k',(k)=>k.map((x)=>x.tagName+(x.dataset.dyOpen?':'+x.dataset.dyOpen:''))),['BUTTON:sales','DIV','BUTTON:cash','BUTTON:credit']);
 // the pills: returns, discounts, misc, given away: all buttons
 assert.deepEqual(await all(page,'#dyMain .dy-ptap'),['مرتجع 130 ›','خصومات 25 ›','أصناف متنوعة (بالقيمة) 4,650 ›','من غير سعر 1 · تكلفتها 13 ›']);
 // the boxes, the purchases, the hours, below cost (a tap opens its ticket), our events, the week
 assert.deepEqual(await all(page,'#dyMain table tr'),['الخزنة داخل خارج الرصيد الآن','درج مثال 800 50 5,000','خزنة مثال 0 200 900']);
 assert.match(await txt(page,'#dyMain .dy-sub'),/مصروفات: كهرباء 120/);assert.match(await txt(page,'#dyMain'),/دفعات للموردين: 640/);
 assert.match(await txt(page,'#dyMain .dy-text'),/🧾 فواتير شراء 2 بقيمة 1,500 · مرتجع للشركات 200 · مرتجع 130/);
 assert.deepEqual(await page.$$eval('#dyMain .dy-chart',(c)=>c.map((x)=>x.querySelectorAll('.dy-bars > div').length)),[5,7],'five hours that sold, then the week');
 assert.match(await txt(page,'#dyMain .dy-warn'),/1 اتباع بأقل من التكلفة/);
 assert.match(await txt(page,'#dyMain .dy-warn'),/تذكرة 3 · ITEM C · بيع 95 والتكلفة 99 · 14:20/);
 await page.waitForFunction(()=>/من سيستمنا/.test(document.getElementById('dyMain').textContent));
 assert.match((await all(page,'#dyMain .dy-line')).pop(),/🤖 فواتير اتدخلت 2 وقفات الروبوت 1 طلبات الموقع 3 بيع مؤقت 1/);
 assert.equal(await page.$$eval('#dyMain .dy-chart',(c)=>c[c.length-1].querySelectorAll('.dy-bars > div.t').length),1,'today is marked in the week');
 // the below-cost line opens its ticket, back returns to the page
 await page.click('#dyMain .dy-bl');
 await page.waitForSelector('#dyMain .dy-h2');
 assert.match(await txt(page,'#dyMain .dy-h2'),/^تذكرة 3$/);
 await page.click('[data-dy-back]');await page.waitForSelector('#dyMain .dy-grid');
 // quick days and the picker: yesterday, then a day typed in the picker
 await page.click('[data-dy-go="'+yest+'"]');
 await page.waitForFunction((y)=>document.getElementById('dyDate').value===y,yest);
 assert.match((await all(page,'.dy-grid .dy-k'))[0],/^المبيعات 1,100 11 تذكرة/);
 assert.match(await txt(page,'.dy-stamp'),/^اتجمّعت من فارما فلاي · الأيام من/,'an older day has no «لحد»');
 assert.match(await txt(page,'#dyMain .dy-card:has(.dy-ok)'),/✓ مفيش بيع تحت التكلفة/);
 const wk=await page.evaluate(()=>window.__week);
 await page.fill('#dyDate',wk);
 await page.waitForFunction((w)=>document.getElementById('dyDate').value===w,wk);
 assert.match((await all(page,'.dy-grid .dy-k'))[0],/^المبيعات 1,700 17 تذكرة/);
 // the arrows still step a day; the next one is off on today
 await page.click('[data-dy-go="'+today+'"]');
 await page.waitForFunction((t)=>document.getElementById('dyDate').value===t,today);
 assert.equal(await page.$eval('[data-dy-next]',(b)=>b.disabled),true,'nothing after today');
 await page.click('[data-dy-prev]');
 await page.waitForFunction((y)=>document.getElementById('dyDate').value===y,yest);
 await page.click('[data-dy-next]');
 await page.waitForFunction((t)=>document.getElementById('dyDate').value===t,today);
},{home:true});

run('Day page: every number opens its list with a search box; a ticket opens the whole invoice; back keeps the search',async({page})=>{
 await openPage(page);
 // المبيعات: the sales tickets (not the returns, not the empty one), a search narrows them
 await page.click('[data-dy-open="sales"]');
 await page.waitForSelector('#dySearch');
 assert.match(await txt(page,'#dyMain .dy-h2'),/^المبيعات · /);
 assert.equal(await page.$$eval('#dyRows .dy-tk',(r)=>r.length),4);
 assert.match(await txt(page,'#dyTot'),/^4 تذاكر 5,470$/);
 await page.fill('#dySearch','زبون');
 assert.equal(await page.$$eval('#dyRows .dy-tk',(r)=>r.length),1);
 assert.match(await txt(page,'#dyTot'),/^1 تذاكر 520$/);
 await page.fill('#dySearch','item e');
 assert.match(await txt(page,'#dyRows .dy-tk'),/عميل نقدي/);
 await page.fill('#dySearch','لا شيء');
 assert.match(await txt(page,'#dyRows'),/مفيش تذاكر هنا/);
 // a ticket: the whole invoice: lines, the fraction of a pack, the below-cost flag, the discount, paid, what he still owes
 await page.fill('#dySearch','زبون');
 await page.click('#dyRows .dy-tk');
 await page.waitForSelector('#dyMain table');
 assert.match(await txt(page,'#dyMain .dy-h2'),/^تذكرة 3$/);
 assert.match(await txt(page,'#dyMain .dy-card'),/^زبون تاني · آجل/);
 assert.deepEqual(await all(page,'#dyMain table tr'),['الصنف الكمية السعر الإجمالي','ITEM B ½ 400 200','ITEM C · بأقل من التكلفة 1 95 95','ITEM B BOX · سحب من العلبة · 2 وحدة 0.07 0 0']);
 assert.match(await txt(page,'#dyMain'),/الإجمالي 520 خصم 20 دفع 300 الباقي عليه 200/);
 // back = the list with the search kept; back again = the page
 await page.click('[data-dy-back]');
 await page.waitForSelector('#dySearch');
 assert.equal(await page.inputValue('#dySearch'),'زبون');
 assert.equal(await page.$$eval('#dyRows .dy-tk',(r)=>r.length),1);
 await page.click('[data-dy-back]');
 await page.waitForSelector('#dyMain .dy-grid');
 // آجل جديد: what was taken on credit today, a customer's return in it, the net = the number on the page
 await page.click('[data-dy-open="credit"]');
 await page.waitForSelector('#dySearch');
 assert.match(await txt(page,'#dyMain .dy-h2'),/^آجل جديد · /);
 assert.equal(await page.$$eval('#dyRows .dy-tk',(r)=>r.length),3);
 assert.match(await txt(page,'#dyTot'),/^3 تذاكر · 2 عميل الصافي 4,770$/,'the same 4,770 as the number it was opened from');
 const cr=await all(page,'#dyRows .dy-tk');
 assert.match(cr[0],/^4,650 عميل مثال ١ .* باقي 4,650$/);
 assert.match(cr[1],/^200 زبون تاني .* دفع 300 باقي 200$/);
 assert.match(cr[2],/^-80 زبون تاني مرتجع على حساب العميل/);
 await page.click('[data-dy-back]');await page.waitForSelector('#dyMain .dy-grid');
 // اتحصّل كاش: the same list for the cash that came in (sales, a customer's payment, a refund), searchable
 await page.click('[data-dy-open="cash"]');
 await page.waitForSelector('#dySearch');
 assert.match(await txt(page,'#dyTot'),/^4 تذاكر 545$/,'100 + 300 - 50 + 195');
 const ca=await all(page,'#dyRows .dy-tk');
 assert.match(ca[0],/بيع نقدي/);assert.match(ca[1],/سداد عميل/);assert.match(ca[2],/مرتجع مدفوع/);
 await page.fill('#dySearch','سداد');await page.fill('#dySearch','300');
 assert.equal(await page.$$eval('#dyRows .dy-tk',(r)=>r.length),1);
 await page.click('[data-dy-back]');await page.waitForSelector('#dyMain .dy-grid');
 // مرتجع: the day's return tickets, then the companies' returns
 await page.click('[data-dy-open="returns"]');
 await page.waitForSelector('#dySearch');
 assert.equal(await page.$$eval('#dyRows .dy-tk:not(.dy-static)',(r)=>r.length),2);
 assert.match(await txt(page,'#dyRows'),/مرتجع الشركات.*-302.4.*مورد مثال/);
 await page.click('#dyRows .dy-tk:not(.dy-static)');
 await page.waitForSelector('#dyMain table');
 assert.match(await txt(page,'#dyMain .dy-card'),/مرتجع/);
 await page.click('[data-dy-back]');await page.waitForSelector('#dySearch');
 await page.click('[data-dy-back]');await page.waitForSelector('#dyMain .dy-grid');
 // خصومات: the tickets with a discount, cash or credit, each one opens
 await page.click('[data-dy-open="disc"]');
 await page.waitForSelector('#dySearch');
 assert.deepEqual(await all(page,'#dyMain .dy-chip'),['الكل 2','كاش 1','آجل 1']);
 assert.equal(await page.$$eval('#dyRows .dy-tk',(r)=>r.length),2);
 await page.click('[data-dy-f="a"]');
 assert.equal(await page.$$eval('#dyRows .dy-tk',(r)=>r.length),1);
 assert.match(await txt(page,'#dyRows .dy-tk'),/^20 زبون تاني/);
 await page.click('[data-dy-f="c"]');
 assert.match(await txt(page,'#dyRows .dy-tk'),/^5 عميل نقدي/);
 await page.click('[data-dy-back]');await page.waitForSelector('#dyMain .dy-grid');
 // أصناف متنوعة: what the ticket is, the customer, the memo, and the purchase of the same amount (where it came from)
 await page.click('[data-dy-open="misc"]');
 await page.waitForSelector('#dySearch');
 assert.equal(await page.$$eval('#dyRows .dy-tk',(r)=>r.length),1);
 assert.match(await txt(page,'#dyRows .dy-tk'),/^4,650 عميل مثال ١.*فاتورة قديمة/);
 assert.match(await txt(page,'#dyRows .dy-mp'),/نفس المبلغ اتسجّل شرا من صيدلية مثال الساعة 8:27 م/);
 await page.click('#dyRows .dy-tk');
 await page.waitForSelector('#dyMain table');
 assert.match(await txt(page,'#dyMain .dy-mp'),/صيدلية مثال/);
 await page.click('[data-dy-back]');await page.waitForSelector('#dySearch');
 await page.click('[data-dy-back]');await page.waitForSelector('#dyMain .dy-grid');
 // من غير سعر: what was given away, with its cost
 await page.click('[data-dy-open="free"]');
 await page.waitForSelector('#dySearch');
 assert.match(await txt(page,'#dyTot'),/^1 تذاكر تكلفة 12.5$/);
 await page.click('#dyRows .dy-tk');await page.waitForSelector('#dyMain table');
 assert.match(await txt(page,'#dyMain table'),/ITEM F · من غير سعر · تكلفتها 12.5/);
},{home:true});

run('Day page: the purchases line opens the day\'s invoices, returns, new cards and moved prices',async({page})=>{
 await openPage(page);
 await page.click('[data-dy-open="buys"]');
 await page.waitForSelector('#dySearch');
 assert.match(await txt(page,'#dyMain .dy-h2'),/^المشتريات · /);
 assert.match(await txt(page,'#dyTot'),/^2 فاتورة · مرتجع 302.4 1,000$/);
 const rows=await all(page,'#dyRows .dy-tk');
 assert.match(rows[0],/^900.5 مورد مثال .*11\/26\/232796 · 4 سطر مرتجع 302.4$/);
 assert.match(rows[1],/^99.5 مخزن مثال /);
 assert.match(await txt(page,'#dyRows'),/مرتجع منفصل -1,700 مورد تاني .*أصناف جديدة 91 ITEM NEW 10 TAB سعر الجمهور أسعار جمهور اتغيّرت 285 ITEM B من 210 إلى 285/);
 assert.equal(/-302.4 مورد مثال/.test(await txt(page,'#dyRows')),false,'the «~» return of an invoice is not repeated as a separate one');
 await page.fill('#dySearch','مخزن');
 assert.equal(await page.$$eval('#dyRows .dy-tk',(r)=>r.length),1);
 assert.match(await txt(page,'#dyTot'),/^1 فاتورة 99.5$/);
 await page.click('[data-dy-back]');await page.waitForSelector('#dyMain .dy-grid');
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
 // a day with no detail file: the list says so, never a blank page
 await seed(page);
 await page.evaluate(()=>{const t=window.__today;delete window.__storage['day/d_'+t+'.json'];return window.AskerDay.load()});
 await page.evaluate(()=>window.AskerDay.open());
 await page.waitForSelector('#dayPanel:not(.hidden) .dy-grid');
 await page.click('[data-dy-open="sales"]');
 await page.waitForFunction(()=>/الصفحة محتاجة ملف اليوم من اللاب: لسه ما وصلش/.test(document.getElementById('dyMain').textContent));
 // a staff member: no card
 await seed(page);
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;return window.AskerDay.load()});
 await page.waitForFunction(()=>document.getElementById('dayCard').classList.contains('hidden'));
},{home:true});
