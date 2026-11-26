// «🔒 تقفيل اليوم» (owner 2026-11-26, mockup day_close_2026-11-26, his «طيب كمل»): the drawer's closes from PharmaFly's shifts (day/day.json «closes», written by the laptop). A report of «📊 التقارير» (2026-11-27; before that a small tab in
// «المبيعات»); the date bar; the day's shortage and what went into the main safe; one card per shift (a short one framed); the money out of the day; the thirty days with his own «big difference» line; a day
// of that list opens; no file; no closes yet; a staff member. The server's file is played here. Made-up numbers and names only: the repository is public.
const {run,assert}=require('./harness.cjs');
const flat=(x)=>{const w=document.createTreeWalker(x,NodeFilter.SHOW_TEXT),a=[];let n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\s+/g,' ').trim()};
const txt=(page,sel)=>page.$eval(sel,(x,f)=>new Function('x','return ('+f+')(x)')(x),flat.toString());
const all=(page,sel)=>page.$$eval(sel,(b,f)=>b.map(new Function('x','return ('+f+')(x)')),flat.toString());
const seed=(page,{closes=true}={})=>page.evaluate(({closes})=>{
 const pad=(n)=>String(n).padStart(2,'0'),ymd=(d)=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const today=new Date(),days={},ago=(n)=>{const d=new Date(today);d.setDate(d.getDate()-n);return ymd(d)};
 for(let i=0;i<12;i++){const k=ago(i);days[k]={date:k,net_sales:1000,profit:100,expenses:i===0?[{name:'كهرباء',amount:120}]:[],supplier_paid:i===0?640:0,owner_out:0};}
 const doc={v:2,source:'pharmafly',generated_at:new Date().toISOString(),data_at:ymd(today)+' 20:28:10',today:ymd(today),days};
 const sh=(d,a,b,exp,cnt)=>({s:d+' '+a,e:d+' '+b,exp,cnt});
 if(closes)doc.closes={[ago(0)]:[sh(ago(1),'23:56','15:43',2484,2485),sh(ago(0),'16:42','23:42',27552.89,27420),sh(ago(0),'23:42','23:59',435,435)],
  [ago(1)]:[sh(ago(1),'17:19','17:35',340,440),sh(ago(1),'17:35','22:00',100,100)],[ago(10)]:[sh(ago(10),'12:00','16:49',7483.94,7390)]};
 window.__storage['day/day.json']=JSON.stringify(doc);window.__today=ymd(today);window.__yesterday=ago(1);window.__ten=ago(10);
},{closes});
const openPage=async(page,o)=>{await seed(page,o);await page.evaluate(()=>window.AskerDay.load());await page.evaluate(()=>window.AskerApp.showTab('dayclose'));await page.waitForSelector('#closePanel:not(.hidden) #clMain > *')};

run('Day close: the way back to the reports, the date bar, the shortage, the main safe, the shift cards, the money out',async({page})=>{
 await openPage(page);
 await page.waitForSelector('#clMain .dy-grid');
 assert.ok(await page.isVisible('#rpBack'),'a report of «📊 التقارير»: the way back is on top');
 const today=await page.evaluate(()=>window.__today),yest=await page.evaluate(()=>window.__yesterday);
 assert.equal(await page.inputValue('#clDate'),today);
 assert.deepEqual(await all(page,'#clMain .dy-pick ~ .dy-line .dy-chip'),['النهارده','امبارح','من أسبوع']);
 assert.equal(await page.$eval('#clMain .dy-pick ~ .dy-line .dy-chip:last-child',(b)=>b.disabled),true,'no close a week ago: the button is off');
 const ks=await all(page,'#clMain .dy-grid .dy-k');
 assert.match(ks[0],/^عجز اليوم -131.89 المفروض 30,471.89 واتعدّ 30,340$/);
 assert.match(ks[1],/^دخل الخزنة الرئيسية 30,340 كل اللي اتعدّ$/);
 const cards=await all(page,'#clMain .cl-sh');
 assert.equal(cards.length,3);
 assert.match(cards[0],/^زيادة 1 من 11:56 م إلى 3:43 م المفروض 2,484 اتعدّ 2,485$/);
 assert.match(cards[1],/^عجز 132.89 من 4:42 م إلى 11:42 م المفروض 27,552.89 اتعدّ 27,420$/);
 assert.match(cards[2],/^مظبوط من 11:42 م إلى 11:59 م المفروض 435 اتعدّ 435$/);
 assert.equal(await page.$$eval('#clMain .cl-sh.cl-bad',(x)=>x.length),1,'only the short shift is framed');
 assert.equal(await page.$eval('#clMain .dy-grid .dy-k b',(b)=>getComputedStyle(b).color!==getComputedStyle(document.querySelectorAll('#clMain .dy-grid .dy-k b')[1]).color),true,'a short day is shown in the warning colour');
 assert.match(await txt(page,'#clMain'),/فلوس طلعت برّه البيع مصروفات: كهرباء 120 دفعات للموردين: 640/);
 assert.match(await txt(page,'#clMain'),/الوردية اللي بتتقفل بعد نص الليل بتتحسب على اليوم اللي قبلها\./);
 // yesterday: the chip and the arrow
 await page.click('[data-cl-day="'+yest+'"]');
 assert.equal(await page.inputValue('#clDate'),yest);
 assert.match((await all(page,'#clMain .dy-grid .dy-k'))[0],/^زيادة اليوم \+100 المفروض 440 واتعدّ 540$/);
 assert.ok(!(await txt(page,'#clMain')).includes('فلوس طلعت'),'nothing went out that day');
 await page.click('[data-cl-next]');
 assert.equal(await page.inputValue('#clDate'),today);
 await page.click('[data-cl-prev]');
 assert.equal(await page.inputValue('#clDate'),yest);
 // a day with no close
 await page.evaluate(()=>{const i=document.getElementById('clDate'),d=new Date();d.setDate(d.getDate()-5);i.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');i.dispatchEvent(new Event('change',{bubbles:true}))});
 assert.match(await txt(page,'#clMain'),/مفيش تقفيل لليوم ده/);
});

run('Day close: the thirty days, his own line for a big difference, a row opens its day, back',async({page})=>{
 await openPage(page);
 await page.waitForSelector('#clMain .dy-grid');
 await page.click('[data-cl-month]');
 await page.waitForSelector('#clBig');
 const tot=await txt(page,'#clMain .dy-card');
 assert.match(tot,/عدد الورديات 6 اتعدّ في الورديات 38,270 صافي الفرق -125.83 مجموع العجز 226.83 مجموع الزيادة 101$/);
 assert.equal(await page.inputValue('#clBig'),'50','his line starts at 50');
 let rows=await all(page,'#clRows .cl-sh');
 assert.equal(rows.length,3);
 assert.match(rows[0],/^عجز 132.89 .* · 11:42 م المفروض 27,552.89 اتعدّ 27,420$/);
 await page.fill('#clBig','99');
 assert.equal(await page.$$eval('#clRows .cl-sh',(x)=>x.length),2);
 assert.equal(await page.evaluate(()=>localStorage.getItem('cl_big')),'99','the line is kept on the phone');
 await page.fill('#clBig','1000');
 assert.match(await txt(page,'#clRows'),/مفيش ورديات بالفرق ده/);
 await page.fill('#clBig','99');
 const yest=await page.evaluate(()=>window.__yesterday);
 await page.click('#clRows [data-cl-day="'+yest+'"]');
 await page.waitForSelector('#clMain .dy-grid');
 assert.equal(await page.inputValue('#clDate'),yest,'a row opens its day');
 await page.click('[data-cl-month]');await page.click('[data-cl-back]');
 assert.equal(await page.inputValue('#clDate'),yest,'back returns to the same day');
});

run('Day close: a file with no closes yet says so; no file says so; a staff member sees nothing',async({page})=>{
 await openPage(page,{closes:false});
 assert.match(await txt(page,'#clMain'),/ملف التقفيل لسه ما وصلش من اللاب\./);
 await page.evaluate(()=>{delete window.__storage['day/day.json'];window.AskerApp.showTab('home')});
 await page.evaluate(()=>window.AskerApp.showTab('dayclose'));
 await page.waitForFunction(()=>/الصفحة محتاجة ملف اليوم من اللاب/.test(document.querySelector('#clMain').textContent));
});
run('Day close: a staff member sees no numbers',async({page})=>{
 await seed(page);
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;return window.AskerDay.load()});
 await page.evaluate(()=>window.AskerApp.showTab('dayclose'));
 await page.waitForFunction(()=>/الصفحة محتاجة ملف اليوم من اللاب/.test(document.querySelector('#clMain').textContent));
 assert.equal(await page.$$eval('#clMain .cl-sh',(x)=>x.length),0);
});
