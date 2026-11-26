// «📦 قيمة المخزون» (owner 2026-11-26, «ا، ابعتها» on the mockup): a report of «📊 التقارير» (2026-11-27); the main store on his law with the public price beside it, the other stores, the waiting stores together; the other
// basis (PharmaFly's average) named and framed, and the law again on the next opening; the main store day by day, a day opening its own stores; no file; a staff member sees none. The server's file is
// played here. Made-up numbers and names only: the repository is public.
const {run,assert}=require('./harness.cjs');
const flat=(x)=>{const w=document.createTreeWalker(x,NodeFilter.SHOW_TEXT),a=[];let n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\s+/g,' ').trim()};
const txt=(page,sel)=>page.$eval(sel,(x,f)=>new Function('x','return ('+f+')(x)')(x),flat.toString());
const all=(page,sel)=>page.$$eval(sel,(b,f)=>b.map(new Function('x','return ('+f+')(x)')),flat.toString());
const seed=(page)=>page.evaluate(()=>{
 const st=(id,name,law,avg,sale,o)=>Object.assign({id,name,items:id===1?5825:7,law,avg,sale,no_buy:0,no_cost:0,avg_zero:0},o);
 const day=(law,at)=>({at,stores:[st(1,'Main - مثال',law,law-3000,law+297000,{no_buy:13,no_cost:11,avg_zero:14}),st(2,'مخزن هالك مثال',40181,39533,52112),st(5,'مخزن انتظار أ',231,231,383),st(6,'مخزن انتظار ب',2730,2676,3372)]});
 // the days by the phone's own clock: the pharmacy day still running (it turns at 6 in the morning) and the two before it
 const pad=(n)=>String(n).padStart(2,'0'),key=(back)=>{const d=new Date(Date.now()-6*3600e3);d.setDate(d.getDate()-back);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
 const days={[key(0)]:day(994227,key(0)+' 22:25'),[key(1)]:day(990000,key(1)+' 23:40'),[key(2)]:day(988000,key(2)+' 16:05')};
 window.__keys=[key(0),key(1),key(2)];
 window.__storage['day/stock.json']=JSON.stringify({v:1,latest:key(0),days});
});
const openPage=async(page)=>{await seed(page);await page.evaluate(()=>window.AskerApp.showTab('stockval'));await page.waitForSelector('#stockValPanel:not(.hidden) .sv-tbl')};

run('Stock value: the way back to the reports, the main store on the law with the public price, the other and waiting stores, the other basis, a past day',async({page})=>{
 await openPage(page);
 assert.ok(await page.isVisible('#rpBack'),'a report of «📊 التقارير»: the way back is on top');
 assert.deepEqual(await all(page,'#svMain [data-sv-basis]'),['آخر شرا (قانونك)','متوسط تكلفة فارمافلاي']);
 assert.equal(await page.$eval('[data-sv-basis="law"]',(b)=>b.classList.contains('on')),true,'it opens on his law');
 assert.match(await txt(page,'#svMain .dy-stamp'),/^حسب بيانات فارما فلاي لحد .*10:25 م كل الكمية متسعّرة بتكلفة آخر شرا للصنف$/);
 assert.deepEqual(await all(page,'#svMain .sv-tbl th'),['المخزن','بالتكلفة','بسعر الجمهور']);
 assert.deepEqual(await all(page,'#svMain .sv-tbl tbody tr'),['المخزن الرئيسي 5,825 صنف 994,227 1,291,227','مخزن هالك مثال 40,181 52,112','مخازن الانتظار 2,961 3,755','مخزن انتظار أ 231 383','مخزن انتظار ب 2,730 3,372','الإجمالي 1,037,369 1,347,094'],'every store at cost and at the public price, then the total');
 assert.match(await txt(page,'#svMain'),/في المخزن الرئيسي: 13 صنف من غير شرا قبل كده: اتسعّر بتكلفة الكارت · 11 منهم من غير تكلفة خالص \(اتحسبوا صفر\) الرصيد اللي صفر أو بالسالب مش محسوب\./);
 // day by day: only the days that are over (today's moving figure is not a line yet), newest first, with the move and the moment each is good up to
 const days=await all(page,'#svMain .sv-day');
 assert.equal(days.length,2);
 assert.match(days[0],/^990,000 .*بسعر الجمهور 1,287,000 \+2,000 لحد الساعة 11:40 م$/);
 assert.match(days[1],/^988,000 .*لحد الساعة 4:05 م$/);
 // the other basis: named, framed, its own numbers and its own gap
 await page.click('[data-sv-basis="avg"]');
 assert.match(await txt(page,'#svMain .sv-main'),/^المخزن الرئيسي 5,825 صنف 991,227 1,291,227$/);
 assert.match(await txt(page,'#svMain .dy-card.pf-other'),/إنت شايف على متوسط تكلفة فارمافلاي، مش على آخر شرا كل الكمية متسعّرة بمتوسط التكلفة اللي على كارت الصنف/);
 assert.match(await txt(page,'#svMain'),/14 صنف متوسطه صفر على الكارت/);
 assert.doesNotMatch(await txt(page,'#svMain'),/من غير شرا قبل كده/);
 // a past day: its own stores, and back
 await page.click('[data-sv-basis="law"]');
 const keys=await page.evaluate(()=>window.__keys);
 await page.click('[data-sv-day="'+keys[1]+'"]');
 assert.match(await txt(page,'#svMain .sv-main'),/ 990,000 /);
 assert.match(await txt(page,'#svMain .dy-stamp'),/11:40 م/);
 await page.click('[data-sv-latest]');
 assert.match(await txt(page,'#svMain .sv-main'),/ 994,227 /);
 // opened again after looking at the other basis: his law
 await page.click('[data-sv-basis="avg"]');
 await page.evaluate(()=>{window.AskerApp.showTab('home');window.AskerApp.showTab('stockval')});
 await page.waitForFunction(()=>document.querySelector('[data-sv-basis="law"]')?.classList.contains('on'));
 assert.match(await txt(page,'#svMain .sv-main'),/ 994,227 /);
});
run('Stock value: the first day, nothing is over yet',async({page})=>{
 await seed(page);
 await page.evaluate(()=>{const o=JSON.parse(window.__storage['day/stock.json']),k=window.__keys[0];window.__storage['day/stock.json']=JSON.stringify({v:1,latest:k,days:{[k]:o.days[k]}})});
 await page.evaluate(()=>window.AskerApp.showTab('stockval'));await page.waitForSelector('#stockValPanel:not(.hidden) .sv-tbl');
 assert.equal(await page.$$eval('#svMain .sv-day',(x)=>x.length),0);
 assert.match(await txt(page,'#svMain'),/لسه مفيش يوم خلص\./);
});
// «💼 فلوسك في الصيدلية» (2026-11-27): the money beside the same snapshot (made-up numbers); the profit and withdrawals of a day come from day/day.json
const seedMoney=async(page)=>{await seed(page);await page.evaluate(()=>{const o=JSON.parse(window.__storage['day/stock.json']),[k0,k1]=window.__keys;
 const money=(at)=>({at,boxes:[{id:2,name:'خزنة مثال',bal:291},{id:9,name:'استثمار مثال',bal:60},{id:7,name:'فاضية مثال',bal:0}],cust:{owe:300,owe_n:3,prepaid:20,prepaid_n:1,idle90:55,idle90_n:1},vend:{owe:480,owe_n:4,owed:6,owed_n:1}});
 o.days[k0].money=money(o.days[k0].at);o.days[k1].money=money(o.days[k1].at);window.__storage['day/stock.json']=JSON.stringify(o);
 window.__storage['day/day.json']=JSON.stringify({v:2,source:'pharmafly',generated_at:new Date().toISOString(),today:k0,days:{[k1]:{date:k1,profit:190,expenses:[{name:'كهرباء',amount:40}],owner_out:100}}})})};
run('Money in the pharmacy: the card on top, a box taken out stays out, the days that are over beside their profit and withdrawals',async({page})=>{
 await seedMoney(page);await page.evaluate(()=>window.AskerApp.showTab('stockval'));await page.waitForSelector('#stockValPanel:not(.hidden) .sv-money .sv-net');
 const lines=()=>all(page,'#svMain .sv-money > .sv-ml');
 assert.deepEqual(await lines(),['البضاعة (بآخر شرا) 997,188','+ فلوس الخزن ▾ 351','+ اللي على العملاء (صافي) 280','− اللي للموردين (صافي) 474','= الصافي 997,345','من اللي على العملاء، ومن غير حركة 90 يوم: 55']);
 assert.match(await txt(page,'#svMain .sv-apart'),/^برّه الحساب: مخزن هالك مثال 40,181$/);
 assert.equal(await page.$eval('#svMain .sv-money',(c)=>!!(c.compareDocumentPosition(document.querySelector('#svMain .sv-stores'))&4)),true,'on top of the stores');
 // take a box out: the net, the line apart, and it stays so after a reload
 await page.click('#svMain [data-sv-boxes]');
 assert.equal(await page.$$eval('#svMain [data-sv-box]',(x)=>x.filter((i)=>i.checked).length),3,'all the boxes count until he takes one out');
 await page.click('#svMain [data-sv-box="9"]');
 assert.deepEqual((await lines()).slice(1,5),['+ فلوس الخزن ▴ 291','+ اللي على العملاء (صافي) 280','− اللي للموردين (صافي) 474','= الصافي 997,285']);
 assert.match(await txt(page,'#svMain .sv-apart'),/استثمار مثال 60$/);
 await page.reload();await page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
 await seedMoney(page);await page.evaluate(()=>window.AskerApp.showTab('stockval'));await page.waitForSelector('#stockValPanel:not(.hidden) .sv-money .sv-net');
 assert.match((await lines())[4],/997,285$/,'kept on the phone');
 // day by day: only the days over that have the money, with the box out there too
 await page.click('#svMain .sv-mdays summary');
 const rows=await all(page,'#svMain .sv-mday');
 assert.equal(rows.length,1,'today is still running; the day before it has no money');
 assert.match(rows[0],/^993,058 .*صافي الربح 150 · مسحوباتك 100 لحد الساعة 11:40 م$/);
 // the goods follow «احسب على», and the page stays within the phone
 await page.click('[data-sv-basis="avg"]');
 assert.match((await lines())[0],/^البضاعة \(بمتوسط تكلفة فارمافلاي\) 994,134$/);
 assert.equal(await page.$eval('#svMain .sv-mdays',(d)=>d.open),true,'the days stay open while the card is drawn again');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the phone');
});
run('Stock value: no file yet; a staff member sees nothing',async({page})=>{
 await page.evaluate(()=>window.AskerApp.showTab('stockval'));
 await page.waitForFunction(()=>/الصفحة محتاجة ملف المخزون من اللاب/.test(document.querySelector('#svMain')?.textContent||''));
 await seed(page);
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;window.AskerStaff.fixTab=(t)=>window.AskerStaffLib.fixTab(t,[]);window.AskerApp.showTab('stockval')});
 assert.equal(await page.$eval('#stockValPanel',(x)=>x.classList.contains('hidden')),true,'a staff member does not reach the tab');
});
