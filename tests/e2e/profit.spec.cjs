// «💹 الربح والهامش» (owner 2026-11-25, mockup profit_page_2026-11-25, his «ا»): the profit of a period from the laptop's files in the private bucket asker-private/day (day.json = the days' own numbers,
// p_<period>.json = the lists, d_<date>.json = a day's tickets). The small tab in «المبيعات»; the period chips and the month box; the profit, the margin, the net sales; the bar of each day (a tap opens that
// day); the lists (أكتر أصناف ربحًا، هامش ضعيف with his own line, تحت التكلفة، بيع بصفر سعر) each with a search box; an item opens its latest sales; a sale opens the whole invoice; back; no file; a staff member
// who sees none. The server's files are played here. Made-up numbers and names only: the repository is public.
const {run,assert}=require('./harness.cjs');
const flat=(x)=>{const w=document.createTreeWalker(x,NodeFilter.SHOW_TEXT),a=[];let n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\s+/g,' ').trim()};
const txt=(page,sel)=>page.$eval(sel,(x,f)=>new Function('x','return ('+f+')(x)')(x),flat.toString());
const all=(page,sel)=>page.$$eval(sel,(b,f)=>b.map(new Function('x','return ('+f+')(x)')),flat.toString());
const seed=(page,{files=true}={})=>page.evaluate(({files})=>{
 const pad=(n)=>String(n).padStart(2,'0'),ymd=(d)=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const today=new Date(),days={},ago=(n)=>{const d=new Date(today);d.setDate(d.getDate()-n);return ymd(d)};
 for(let i=0;i<9;i++){const k=ago(i);
  days[k]={date:k,net_sales:i===0?5470:1000+i*100,gross_sales:1100,returns:100,discounts:i===0?25:10,misc:0,tickets:10,return_tickets:1,zero_tickets:0,items_revenue:900,cost:700,profit:190+i,margin:21.3,collected:800,
   free:{lines:i===0?1:0,cost:i===0?12.5:0},cost_fallback:{lines:i===0?2:0,of:5},cost_basis:'last_purchase',credit:{net_new:300,paid:50,sales:320,customers:4},hours:[],boxes:[],expenses:[],supplier_paid:0,owner_out:0,
   purchases:{n:2,total:1500,returns_n:0,returns:0},below_cost:{n:0,lines:[]}};}
 window.__storage['day/day.json']=JSON.stringify({v:2,source:'pharmafly',generated_at:new Date().toISOString(),data_at:ymd(today)+' 20:28:10',last_ticket_at:ymd(today)+' 20:30:00',today:ymd(today),days});
 window.__today=ymd(today);window.__yesterday=ago(1);window.__monthKey='m'+ymd(today).slice(0,7);
 if(!files)return;
 const it=(i,n,q,rev,cost,margin,o)=>Object.assign({i,n,q,rev,cost,profit:rev-cost,margin,cf:0,ls:[{d:ymd(today),tk:10+i,q:1,pr:rev/q,c:cost/q},{d:ago(1),tk:20+i,q:2,pr:rev/q,c:cost/q}]},o);
 const pf=(key)=>JSON.stringify({v:1,key,from:ago(6),to:ymd(today),days:7,
  items:[it(1,'ITEM A 10MG',10,1000,700,30),it(2,'ITEM B SYRUP',5,500,450,10)],
  low:[it(4,'ITEM D',4,400,396,1),it(2,'ITEM B SYRUP',5,500,450,10),it(5,'ITEM E',2,100,112,-12,{cf:1})],
  below:{n:2,loss:8,lines:[{d:ymd(today),tk:3,t:'14:20',n:'ITEM C',q:2,pr:95,c:99}]},
  free:{lines:1,cost:12.5,items:[{i:9,n:'ITEM H',q:1,cost:12.5,tickets:1,ls:[{d:ymd(today),tk:6,q:1,pr:0,c:12.5}]}]}});
 window.__storage['day/p_7.json']=pf('7');window.__storage['day/p_30.json']=pf('30');window.__storage['day/p_'+window.__monthKey+'.json']=pf(window.__monthKey);
 const tk=(id,o)=>Object.assign({id,t:'14:05',k:'s',ty:'c',cu:'',total:100,d:0,p:100,memo:'',lines:[{n:'ITEM A 10MG',q:1,pr:100,t:100}]},o);
 window.__storage['day/d_'+ymd(today)+'.json']=JSON.stringify({v:2,date:ymd(today),tickets:[tk(3,{ty:'a',cu:'زبون تاني',total:520,p:300,d:20,t:'14:20',lines:[{n:'ITEM B',q:0.5,pr:400,t:200,i:2,c:360},{n:'ITEM C',q:2,pr:95,t:190,bc:1,i:3,c:99}]}),tk(11,{}),tk(13,{})],supplier_returns:[]});
},{files});
const openPage=async(page,o)=>{await seed(page,o);await page.evaluate(()=>window.AskerDay.load());await page.evaluate(()=>window.AskerApp.showTab('profit'));await page.waitForSelector('#profitPanel:not(.hidden) .dy-grid')};

run('Profit page: the small tab, the period chips and the month box, the three numbers, the bars, the pills, the period switch',async({page})=>{
 await openPage(page);
 assert.equal(await page.getAttribute('.subbar[data-for="sales"] [data-tab="profit"]','class').then((c)=>/chip/.test(c)),true,'the small tab is in «المبيعات»');
 assert.equal(await txt(page,'.subbar[data-for="sales"] [data-tab="profit"]'),'💹 الربح');
 assert.deepEqual(await all(page,'#pfMain .dy-chip'),['٧ أيام','٣٠ يوم','٩٠ يوم']);
 assert.equal(await page.$eval('[data-pf-key="7"]',(b)=>b.classList.contains('on')),true,'7 days is the first view');
 const monthOpts=await all(page,'#pfMonth option');
 assert.equal(monthOpts[0],'شهر معيّن');
 assert.ok(monthOpts.length>=2,'at least the current month');
 // the three numbers: the sum of the 7 days' own numbers (profit 190…196, net sales, the margin after the tickets' discounts)
 const ks=await all(page,'.dy-grid .dy-k');
 assert.match(ks[0],/^الربح 1,351 7 يوم$/);
 assert.match(ks[1],/^الهامش 21.7% من مبيعات الأصناف$/);
 assert.match(ks[2],/^المبيعات الصافية 13,570 بعد المرتجع والخصم$/);
 assert.match(await txt(page,'#pfMain .dy-stamp'),/الفترة من .* إلى .*التكلفة من آخر فاتورة شرا للصنف · الربح تقريبي/);
 // the bars: one per day, the last (today) is the dark one
 assert.equal(await page.$$eval('.pf-bar',(b)=>b.length),7);
 assert.equal(await page.$eval('.pf-bar:last-child',(b)=>b.classList.contains('t')),true);
 assert.match(await txt(page,'.pf-bars'),/190/);
 // the pills: the lists the laptop's period file has
 const pills=await all(page,'#pfMain .dy-line .dy-ptap');
 assert.ok(pills.includes('أكتر أصناف ربحًا ›')&&pills.includes('هامش ضعيف ›'));
 assert.ok(pills.includes('تحت التكلفة 2 ›'),'below-cost count comes from the period file');
 assert.ok(pills.some((x)=>/^بيع بصفر سعر 1 · تكلفتها 13 ›$/.test(x)),'what was given away: the day file\'s own count and cost');
 assert.match(await txt(page,'#pfMain'),/2 سطر اتحسب بتكلفة الكارت \(مفيش شرا قبله\)/,'the cost-law fallback is said');
 // 30 days: the same page over a longer range (nine days of data exist)
 await page.click('[data-pf-key="30"]');
 await page.waitForFunction(()=>document.querySelector('#pfMain .dy-grid .dy-k b').textContent.trim()!=='1,351');
 assert.match((await all(page,'.dy-grid .dy-k'))[0],/^الربح 1,\d{3} 9 يوم$/,'the 9 days that exist');
 assert.equal(await page.$$eval('.pf-bar',(b)=>b.length),30);
 // a month: the box
 await page.selectOption('#pfMonth',await page.evaluate(()=>window.__monthKey));
 await page.waitForFunction(()=>document.querySelector('#pfMonth.on'));
 assert.match(await txt(page,'.dy-grid'),/الربح/);
});

run('Profit page: the lists — most profitable, the thin margins with his own line, below cost, given away; each searchable; an item opens its sales; a sale opens the invoice; back',async({page})=>{
 await openPage(page);
 // most profitable: by profit, with the quantity, the margin and the last purchase cost per pack
 await page.click('[data-pf-open="top"]');
 await page.waitForSelector('#pfSearch');
 const rows=await all(page,'#pfRows .dy-tk');
 assert.equal(rows.length,2);
 assert.match(rows[0],/^300 ITEM A 10MG 10 علبة · هامش 30% تكلفة آخر شرا 70$/);
 assert.match(await txt(page,'#pfTot'),/^2 سطر 350$/);
 await page.fill('#pfSearch','syrup');
 assert.equal(await page.$$eval('#pfRows .dy-tk',(b)=>b.length),1);
 assert.match(await txt(page,'#pfTot'),/^1 سطر 50$/);
 await page.fill('#pfSearch','zzz');
 assert.match(await txt(page,'#pfRows'),/مفيش أصناف هنا/);
 await page.fill('#pfSearch','');
 // an item: the totals and its latest sales, each a button to the invoice
 await page.click('[data-pf-i="1"]');
 assert.match(await txt(page,'#pfMain'),/ITEM A 10MG.*الكمية 10 .*المبيعات 1,000 .*التكلفة 700 .*الربح 300 · 30%.*آخر بيعات الصنف/);
 assert.equal(await page.$$eval('#pfMain .dy-tk',(b)=>b.length),2);
 await page.click('[data-pf-back]');
 assert.equal(await page.$$eval('#pfRows .dy-tk',(b)=>b.length),2,'back to the list');
 await page.click('[data-pf-back]');
 await page.waitForSelector('#pfMain .dy-grid');
 // the thin margins: his line (10 by default), the loss first; a different line is kept
 await page.click('[data-pf-open="low"]');
 await page.waitForSelector('#pfThr');
 assert.equal(await page.inputValue('#pfThr'),'10');
 let low=await all(page,'#pfRows .dy-tk');
 assert.equal(low.length,2,'under 10%: the loss and the 1% item (exactly 10 is not under)');
 assert.match(low[0],/^-12 ITEM E 2 علبة · هامش -12% \*/,'the loss first, starred: costed at the card');
 assert.match(low[1],/^4 ITEM D /);
 await page.fill('#pfThr','11');
 assert.equal(await page.$$eval('#pfRows .dy-tk',(b)=>b.length),3,'under 11%: ITEM B joins');
 assert.equal(await page.evaluate(()=>localStorage.getItem('pf_low')),'11','his line is kept on the phone');
 await page.click('[data-pf-back]');
 // below cost: every line, the loss, a tap opens the whole invoice of that day
 await page.click('[data-pf-open="below"]');
 const b=await all(page,'#pfRows .dy-tk');
 assert.equal(b.length,1);
 assert.match(b[0],/^-8 ITEM C .* · 2:20 م · تذكرة 3 بيع 95 والتكلفة 99$/);
 assert.match(await txt(page,'#pfTot'),/^2 سطر · ظاهر أحدث 300 بيعة بس خسارة 8$|^2 سطر خسارة 8$/);
 await page.click('#pfRows .dy-tk');
 await page.waitForSelector('#pfMain table');
 assert.match(await txt(page,'#pfMain'),/تذكرة 3.*زبون تاني · آجل.*ITEM B.*ITEM C · بأقل من التكلفة.*الإجمالي 520.*خصم 20.*دفع 300.*الباقي عليه 200/);
 await page.click('[data-pf-back]');
 assert.equal(await page.$$eval('#pfRows .dy-tk',(x)=>x.length),1,'back to the below-cost list');
 await page.click('[data-pf-back]');
 // given away: the item with its cost; a tap opens its sales
 await page.click('[data-pf-open="free"]');
 const f=await all(page,'#pfRows .dy-tk');
 assert.match(f[0],/^12.5 ITEM H 1 علبة · 1 تذاكر تكلفتها$/);
 assert.match(await txt(page,'#pfTot'),/^1 سطر تكلفتها 12.5$/);
 await page.click('[data-pf-i="9"]');
 assert.match(await txt(page,'#pfMain'),/ITEM H.*الكمية 1 .*تكلفتها 12.5.*آخر بيعات الصنف/);
});

run('Profit page: a bar opens that day on «اليوم»; no file; the lists wait for the laptop; a staff member sees none',async({page})=>{
 await openPage(page);
 const y=await page.evaluate(()=>window.__yesterday);
 await page.click('.pf-bar[data-pf-day="'+y+'"]');
 await page.waitForSelector('#dayPanel:not(.hidden) .dy-grid');
 assert.equal(await page.inputValue('#dyDate'),y,'«اليوم» shows the day of the bar');
 assert.equal(await page.$eval('#profitPanel',(x)=>x.classList.contains('hidden')),true);
});
run('Profit page: no day file at all, and a day file without the period files',async({page})=>{
 await openPage(page,{files:false});
 assert.match(await txt(page,'#pfMain'),/ملف الأصناف لسه ما وصلش: اللاب بيجهّزه\./,'the numbers are there, the lists say the laptop is preparing them');
 assert.equal((await all(page,'#pfMain .dy-line .dy-ptap')).length,0);
 await page.evaluate(()=>{delete window.__storage['day/day.json'];window.AskerApp.showTab('home')});
 await page.evaluate(()=>window.AskerApp.showTab('profit'));
 await page.waitForFunction(()=>/الصفحة محتاجة ملف اليوم من اللاب/.test(document.querySelector('#pfMain').textContent)||document.querySelector('#pfMain .dy-grid'));
});
// «الصافي بعد المصروفات» (owner 2026-11-26, «ا، ابعتها»): the profit minus the expenses the cash boxes paid on the same days; each heading opens its moves; the owner's withdrawals are apart
const moves=(page,extra=0)=>page.evaluate((extra)=>{
 const pad=(n)=>String(n).padStart(2,'0'),ago=(n,t)=>{const d=new Date();d.setDate(d.getDate()-n);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+(t||'10:00:00')};
 let id=1;const m=(at,kind,amount,who,memo)=>({id:id++,at,kind,amount,who,memo});
 const rows=[m(ago(0),'expense',-800,'مرتبات مثال','قبض أول'),m(ago(2),'expense',-200,'مرتبات مثال',''),m(ago(1),'expense',-50,'أكياس مثال','شنط'),
  m(ago(8),'expense',-5000,'ضرايب مثال','قسط'),m(ago(0),'owner',-300,null,'سحب مثال'),m(ago(1),'vendor',-999,'مورد مثال',''),m(ago(1),'sales',4000,null,'')];
 for(let i=0;i<extra;i++)rows.push(m(ago(0,'11:00:00'),'expense',-1,'تثريات مثال',''));
 window.__tables.ar_cash_moves=rows;
},extra);
run('Profit page: the net after expenses — the headings, the net of 7 and 30 days, a heading opens its moves, the owner apart',async({page})=>{
 await seed(page);await moves(page);
 await page.evaluate(()=>window.AskerDay.load());await page.evaluate(()=>window.AskerApp.showTab('profit'));
 await page.waitForSelector('#profitPanel .pf-total');
 const card=()=>txt(page,'#pfMain .pf-net');
 assert.match(await card(),/^الربح من البيع 1,351 − المصروفات 1,050 مرتبات مثال 1,000 › أكياس مثال 50 › = الصافي 301 المصروف بيتحسب يوم ما اتدفع/,'the supplier and the sales are not expenses, 8 days ago is outside the 7 days');
 assert.match(await txt(page,'#pfMain .pf-own'),/^مسحوبات صاحب المنشأة لوحدها، مش مصروف 300 ›$/);
 assert.equal(await page.$eval('#pfMain .pf-total b',(b)=>b.classList.contains('dy-neg')),false);
 // a heading: its moves, newest first, searchable by the note
 await page.click('#pfMain [data-pf-head="0"]');
 await page.waitForSelector('#pfSearch');
 assert.match(await txt(page,'#pfMain'),/مرتبات مثال.*2 حركة 1,000 800 .*قبض أول 10:00 ص 200 .*من غير ملاحظة 10:00 ص/);
 await page.fill('#pfSearch','قبض');
 assert.match(await txt(page,'#pfTot'),/^1 حركة 800$/);
 await page.click('[data-pf-back]');
 await page.waitForSelector('#pfMain .pf-total');
 await page.click('#pfMain [data-pf-own]');
 assert.match(await txt(page,'#pfMain'),/مسحوبات صاحب المنشأة لوحدها، مش مصروف.*1 حركة 300 300 .*سحب مثال/);
 await page.click('[data-pf-back]');
 // 30 days: the lump of 8 days ago comes in and the net goes below zero, in the warning colour
 await page.click('[data-pf-key="30"]');
 await page.waitForFunction(()=>/6,050/.test(document.querySelector('#pfMain .pf-net')?.textContent||''));
 assert.match(await card(),/ضرايب مثال 5,000 ›.*مرتبات مثال 1,000 ›.*= الصافي -4,304 /);
 assert.equal(await page.$eval('#pfMain .pf-total b',(b)=>b.classList.contains('dy-neg')),true);
});
run('Profit page: more than a page of moves is all counted; a server that does not answer shows no net',async({page})=>{
 await seed(page);await moves(page,1005);
 await page.evaluate(()=>window.AskerDay.load());await page.evaluate(()=>window.AskerApp.showTab('profit'));
 await page.waitForSelector('#profitPanel .pf-total');
 assert.match(await txt(page,'#pfMain .pf-net'),/− المصروفات 2,055 .*تثريات مثال 1,005 ›.*= الصافي -704 /,'the 1,012 rows came in two pages');
 await page.evaluate(()=>localStorage.setItem('__fakeFail','ar_cash_moves'));
 await page.click('#pfRefresh');
 await page.waitForFunction(()=>/المصروفات ما وصلتش من السيرفر/.test(document.querySelector('#pfMain .pf-net')?.textContent||''));
 assert.equal(await page.$('#pfMain .pf-total'),null,'no net without its expenses');
 assert.equal(await page.$('#pfMain .pf-own'),null);
 await page.evaluate(()=>localStorage.removeItem('__fakeFail'));
});

run('Profit page: a staff member sees nothing',async({page})=>{
 await seed(page);
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;return window.AskerDay.load()});
 await page.evaluate(()=>window.AskerApp.showTab('profit'));
 await page.waitForFunction(()=>/الصفحة محتاجة ملف اليوم من اللاب/.test(document.querySelector('#pfMain').textContent));
 assert.equal(await page.$$eval('#pfMain .dy-grid',(x)=>x.length),0);
});
