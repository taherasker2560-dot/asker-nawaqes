// «📦 قيمة المخزون» (owner 2026-11-26, «ا، ابعتها» on the mockup): the tab in «المبيعات»; the main store on his law with the public price beside it, the other stores, the waiting stores together; the other
// basis (PharmaFly's average) named and framed, and the law again on the next opening; the main store day by day, a day opening its own stores; no file; a staff member sees none. The server's file is
// played here. Made-up numbers and names only: the repository is public.
const {run,assert}=require('./harness.cjs');
const flat=(x)=>{const w=document.createTreeWalker(x,NodeFilter.SHOW_TEXT),a=[];let n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\s+/g,' ').trim()};
const txt=(page,sel)=>page.$eval(sel,(x,f)=>new Function('x','return ('+f+')(x)')(x),flat.toString());
const all=(page,sel)=>page.$$eval(sel,(b,f)=>b.map(new Function('x','return ('+f+')(x)')),flat.toString());
const seed=(page)=>page.evaluate(()=>{
 const st=(id,name,law,avg,sale,o)=>Object.assign({id,name,items:id===1?5825:7,law,avg,sale,no_buy:0,no_cost:0,avg_zero:0},o);
 const day=(law,at)=>({at,stores:[st(1,'Main - مثال',law,law-3000,law+297000,{no_buy:13,no_cost:11,avg_zero:14}),st(2,'مخزن هالك مثال',40181,39533,52112),st(5,'مخزن انتظار أ',231,231,383),st(6,'مخزن انتظار ب',2730,2676,3372)]});
 window.__storage['day/stock.json']=JSON.stringify({v:1,latest:'2026-11-26',days:{'2026-11-26':day(994227,'2026-11-26 22:25'),'2026-11-25':day(990000,'2026-11-25 23:40')}});
});
const openPage=async(page)=>{await seed(page);await page.evaluate(()=>window.AskerApp.showTab('stockval'));await page.waitForSelector('#stockValPanel:not(.hidden) .sv-tbl')};

run('Stock value: the tab, the main store on the law with the public price, the other and waiting stores, the other basis, a past day',async({page})=>{
 await openPage(page);
 assert.equal(await txt(page,'.subbar[data-for="sales"] [data-tab="stockval"]'),'📦 قيمة المخزون');
 assert.deepEqual(await all(page,'#svMain [data-sv-basis]'),['آخر شرا (قانونك)','متوسط تكلفة فارمافلاي']);
 assert.equal(await page.$eval('[data-sv-basis="law"]',(b)=>b.classList.contains('on')),true,'it opens on his law');
 assert.match(await txt(page,'#svMain .dy-stamp'),/^حسب بيانات فارما فلاي لحد .* 26 .*10:25 م كل الكمية متسعّرة بتكلفة آخر شرا للصنف$/);
 assert.deepEqual(await all(page,'#svMain .sv-tbl th'),['المخزن','بالتكلفة','بسعر الجمهور']);
 assert.deepEqual(await all(page,'#svMain .sv-tbl tbody tr'),['المخزن الرئيسي 5,825 صنف 994,227 1,291,227','مخزن هالك مثال 40,181 52,112','مخازن الانتظار 2,961 3,755','مخزن انتظار أ 231 383','مخزن انتظار ب 2,730 3,372','الإجمالي 1,037,369 1,347,094'],'every store at cost and at the public price, then the total');
 assert.match(await txt(page,'#svMain'),/في المخزن الرئيسي: 13 صنف من غير شرا قبل كده: اتسعّر بتكلفة الكارت · 11 منهم من غير تكلفة خالص \(اتحسبوا صفر\) الرصيد اللي صفر أو بالسالب مش محسوب\./);
 // day by day: the main store, newest first, with the move
 const days=await all(page,'#svMain .sv-day');
 assert.equal(days.length,2);
 assert.match(days[0],/^994,227 .*26 .*بسعر الجمهور 1,291,227 \+4,227$/);
 assert.match(days[1],/^990,000 .*25 /);
 // the other basis: named, framed, its own numbers and its own gap
 await page.click('[data-sv-basis="avg"]');
 assert.match(await txt(page,'#svMain .sv-main'),/^المخزن الرئيسي 5,825 صنف 991,227 1,291,227$/);
 assert.match(await txt(page,'#svMain .dy-card.pf-other'),/إنت شايف على متوسط تكلفة فارمافلاي، مش على آخر شرا كل الكمية متسعّرة بمتوسط التكلفة اللي على كارت الصنف/);
 assert.match(await txt(page,'#svMain'),/14 صنف متوسطه صفر على الكارت/);
 assert.doesNotMatch(await txt(page,'#svMain'),/من غير شرا قبل كده/);
 // a past day: its own stores, and back
 await page.click('[data-sv-basis="law"]');
 await page.click('[data-sv-day="2026-11-25"]');
 assert.match(await txt(page,'#svMain .sv-main'),/ 990,000 /);
 assert.match(await txt(page,'#svMain .dy-stamp'),/ 25 .*11:40 م/);
 await page.click('[data-sv-latest]');
 assert.match(await txt(page,'#svMain .sv-main'),/ 994,227 /);
 // opened again after looking at the other basis: his law
 await page.click('[data-sv-basis="avg"]');
 await page.evaluate(()=>{window.AskerApp.showTab('home');window.AskerApp.showTab('stockval')});
 await page.waitForFunction(()=>document.querySelector('[data-sv-basis="law"]')?.classList.contains('on'));
 assert.match(await txt(page,'#svMain .sv-main'),/ 994,227 /);
});
run('Stock value: no file yet; a staff member sees nothing',async({page})=>{
 await page.evaluate(()=>window.AskerApp.showTab('stockval'));
 await page.waitForFunction(()=>/الصفحة محتاجة ملف المخزون من اللاب/.test(document.querySelector('#svMain')?.textContent||''));
 await seed(page);
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;window.AskerStaff.fixTab=(t)=>window.AskerStaffLib.fixTab(t,[]);window.AskerApp.showTab('stockval')});
 assert.equal(await page.$eval('#stockValPanel',(x)=>x.classList.contains('hidden')),true,'a staff member does not reach the tab');
});
