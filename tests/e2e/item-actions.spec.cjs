// «⚙️ عمليات وتقارير» on the item card in the search (owner 2026-11-20): the sheet, the item's movement (purchases since 2018 + sales of the last year, newest first, filters, a tap opens the invoice),
// «جرد» (the count screen on the item), «طباعة باركود» (an operation that waits in «العمليات», cancelled there), staff see none of it. Made-up items, companies and tickets only.
const {run,assert}=require('./harness.cjs');
const flat=(x)=>{const w=document.createTreeWalker(x,NodeFilter.SHOW_TEXT),a=[];let n;while((n=w.nextNode()))a.push(n.nodeValue);return a.join(' ').replace(/\s+/g,' ').trim()};
const txt=(page,sel)=>page.$eval(sel,(x,f)=>new Function('x','return ('+f+')(x)')(x),flat.toString());
const texts=(page,sel)=>page.$$eval(sel,(b,f)=>b.map(new Function('x','return ('+f+')(x)')),flat.toString());
const seed=(page)=>page.evaluate(()=>{
 const at=(d)=>new Date(Date.now()-d*864e5).toISOString().slice(0,19);
 const T={};
 T.ar_store_items=[
  {id:101,name:'BRUFEN 400MG 30TAB',arabic_name:'بروفين ٤٠٠ مجم',price:52,status:'available',is_listed:true,hidden:false},
  {id:102,name:'OTHER ITEM 10 TAB',arabic_name:null,price:30,status:'available',is_listed:true,hidden:false},
  {id:301,name:'CONCOR 5MG 30TAB',arabic_name:null,price:120,status:'on_order',is_listed:false,hidden:false}];
 T.ar_stock=[{item_id:101,name:'BRUFEN 400MG 30TAB',arabic_name:'بروفين ٤٠٠ مجم',price:52,packs:3,units:0,parts:3,exp_near:'2027-05-31',other:null,data_at:'2026-11-12 10:45:00'}];
 T.ar_vendors=[{id:5,name:'المتحدة للأدوية',short:'UNIT',active:true,balance:900,invoices:3,last_invoice_at:at(2)},{id:6,name:'سينا للمستحضرات',short:'SINA',active:true,balance:0,invoices:1,last_invoice_at:at(12)}];
 T.ar_vendor_moves=[
  {id:14,vendor_id:5,at:at(2),kind:'purchase',code:'11/26/300',inv_date:null,amount:1100,total:1100,balance:3120,lines:[{i:101,p:10,u:0,k:1,b:1,c:86,t:16,x:'2028-08-28'},{i:102,p:5,u:0,k:1,b:0,c:46,t:10,x:'2029-03-28'}]},
  {id:12,vendor_id:5,at:at(6),kind:'return',code:'~11/26/200',inv_date:null,amount:-90,total:-90,balance:2020,lines:[{i:101,p:1,u:0,k:1,b:0,c:90,t:10,x:'2026-12-28'}]},
  {id:11,vendor_id:6,at:at(12),kind:'purchase',code:'10/26/900',inv_date:null,amount:984,total:984,balance:984,lines:[{i:101,p:12,u:0,k:1,b:0,c:82,t:19,x:'2028-05-28'}]},
  {id:3,vendor_id:5,at:at(2000),kind:'purchase',code:'03/19/10',inv_date:null,amount:500,total:500,balance:500,lines:[{i:101,p:6,u:0,k:1,b:0,c:80,t:15,x:'2021-06-28'}]}];
 T.ar_customers=[{id:9,name:'عميل مثال',balance:0}];
 T.ar_sales=[
  {id:59812,at:at(1),customer_id:null,kind:'sale',total:255,items:[101,102],lines:[{i:101,p:2,u:0,k:1,s:85,d:0},{i:102,p:1,u:0,k:1,s:85,d:0}]},
  {id:59790,at:at(5),customer_id:null,kind:'return',total:-85,items:[101],lines:[{i:101,p:1,u:0,k:1,s:85,d:0}]},
  {id:59000,at:at(100),customer_id:9,kind:'sale',total:255,items:[101],lines:[{i:101,p:3,u:0,k:1,s:85,d:0}]}];
 T.ar_item_ops=[];
 // the monthly summary (one row per item, and the heartbeat row -1): this month, two months of last year, March 2018
 const now=new Date(),Y=now.getFullYear(),M=String(now.getMonth()+1).padStart(2,'0');
 T.ar_item_sales_monthly=[{item_id:-1,months:{},updated_at:new Date().toISOString()},
  {item_id:101,months:{[`${Y}-${M}`]:[5,1,300,3],[`${Y-1}-06`]:[20,2,1000,12],[`${Y-1}-12`]:[8,0,400,6],'2018-03':[10,0,850.5,4]},updated_at:new Date().toISOString()}];
 localStorage.setItem('__fakeTables',JSON.stringify(T));
});
const ready=(page)=>page.waitForFunction(()=>/\d/.test(document.getElementById('shStats')?.textContent||''));
const search=async(page,q,hit)=>{await page.fill('#hsQ',q);await page.waitForFunction((h)=>new RegExp(h).test(document.getElementById('hsItems').textContent),hit)};
const rows=(page)=>texts(page,'#iaRows .ia-mv');
const heads=(page)=>page.$$eval('#iaRows .ia-mv',(r)=>r.map((x)=>[x.querySelector('.ia-pill').textContent.trim(),x.querySelector('.ia-l1 b').textContent.trim()]));
const goMove=async(page,which)=>{await page.click(`[data-ia-go="${which}"]`);await page.waitForFunction(()=>!/بيجيب الحركة/.test(document.getElementById('iaBody').textContent))};

run('Item card: the button, the sheet, the movement newest first with the filters, the invoice opens from the row',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 await search(page,'بروفين','بروفين');
 assert.equal((await page.textContent('#hsItems [data-ia]')).trim(),'⚙️ عمليات وتقارير');
 // an item with no stock (only in the system) has the button too
 await search(page,'CONCOR','CONCOR');assert.ok(await page.$('#hsItems [data-ia]'),'no stock: the button is there');
 await search(page,'بروفين','بروفين');
 await page.click('#hsItems [data-ia]');
 assert.ok(await page.isVisible('#iaSheet'));assert.equal((await page.textContent('#iaTitle')).trim(),'بروفين ٤٠٠ مجم');
 assert.match(await txt(page,'#iaBody'),/📊 تقارير.*حركة الصنف.*حركة المشتريات.*حركة المبيعات.*⚙️ عمليات على الصنف.*جرد.*طباعة باركود/);
 // the whole movement: this year, newest first: purchases and sales together; a purchase of 2019 is not in «آخر سنة»
 await goMove(page,'all');
 assert.deepEqual(await heads(page),[['بيع نقدي','نقدي'],['شراء','المتحدة للأدوية'],['مرتجع بيع','نقدي'],['مرتجع شراء','المتحدة للأدوية'],['شراء','سينا للمستحضرات'],['بيع آجل','عميل مثال']]);
 const r0=(await rows(page));
 assert.match(r0[0],/رقم التذكرة 59812 · 2 علبة · السعر 85/);assert.match(r0[1],/رقم الفاتورة 11\/26\/300 · 10 \+ 1 بونص · التكلفة 86 · الخصم 16% · الصلاحية 08\/2028/);
 // tabs
 await page.click('[data-ia-tab="buy"]');await page.waitForFunction(()=>document.querySelectorAll('#iaRows .ia-mv').length===2);
 assert.deepEqual((await heads(page)).map((h)=>h[0]),['شراء','شراء']);
 await page.click('[data-ia-tab="sale"]');await page.waitForFunction(()=>document.querySelectorAll('#iaRows .ia-mv').length===2);
 assert.deepEqual((await heads(page)).map((h)=>h[0]),['بيع نقدي','بيع آجل']);
 await page.click('[data-ia-tab="ret"]');await page.waitForFunction(()=>document.querySelectorAll('#iaRows .ia-mv').length===2);
 assert.deepEqual((await heads(page)).map((h)=>h[0]),['مرتجع بيع','مرتجع شراء']);
 await page.click('[data-ia-tab="all"]');await page.waitForFunction(()=>document.querySelectorAll('#iaRows .ia-mv').length===6);
 // periods: last month leaves out the sale of 100 days ago; since 2018 adds the purchase of 2019 at the end
 await page.click('[data-ia-period="month"]');await page.waitForFunction(()=>document.querySelectorAll('#iaRows .ia-mv').length===5);
 assert.ok(!(await heads(page)).some((h)=>h[1]==='عميل مثال'));
 await page.click('[data-ia-period="all"]');await page.waitForFunction(()=>document.querySelectorAll('#iaRows .ia-mv').length===7);
 assert.deepEqual((await heads(page))[6],['شراء','المتحدة للأدوية']);assert.match((await rows(page))[6],/رقم الفاتورة 03\/19\/10/);
 await page.click('[data-ia-period="year"]');await page.waitForFunction(()=>document.querySelectorAll('#iaRows .ia-mv').length===6);
 // the invoice of a sale: the whole ticket with the lines it came with, this item's line marked
 await page.click('[data-ia-row="s59812"]');
 assert.deepEqual(await texts(page,'[data-ia-row="s59812"] .ia-lines tr'),['الصنف الكمية السعر الخصم القيمة','BRUFEN 400MG 30TAB بروفين ٤٠٠ مجم 2 علبة 85 — 170','OTHER ITEM 10 TAB 1 علبة 85 — 85'].map((x,i)=>i===0?x:x));
 assert.equal(await page.$$eval('[data-ia-row="s59812"] .ia-lines tr.me',(t)=>t.length),1);
 assert.match(await txt(page,'[data-ia-row="s59812"]'),/الإجمالي: 255 ج/);
 // the invoice of a purchase: read when it opens: lines, discount, expiry, the balance after it
 await page.click('[data-ia-row="b14"]');
 await page.waitForFunction(()=>document.querySelectorAll('[data-ia-row="b14"] .ia-lines tr').length===3);
 assert.match(await txt(page,'[data-ia-row="b14"] .ia-lines'),/BRUFEN 400MG 30TAB بروفين ٤٠٠ مجم 10 \+ 1 بونص 16% 08\/2028 860/);
 assert.match(await txt(page,'[data-ia-row="b14"]'),/الإجمالي: 1,100 ج · الرصيد بعدها 3,120/);
 await page.click('[data-ia-row="b14"]');assert.equal(await page.$('[data-ia-row="b14"] .ia-lines'),null,'a second tap closes it');
 // back to the menu and close
 await page.click('[data-ia-back]');assert.ok(await page.isVisible('[data-ia-count]'));
 await page.click('[data-ia-close]');assert.ok(!(await page.isVisible('#iaSheet')));
});

run('Item card: an item nothing was done on says so; «جرد» opens the count screen (and says so when the item has no stock); staff have no button',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 await search(page,'CONCOR','CONCOR');await page.click('#hsItems [data-ia]');
 await goMove(page,'all');
 assert.match(await txt(page,'#iaRows'),/ما اتعاملناش على الصنف ده في الفترة دي\./);
 await page.click('[data-ia-back]');
 // «جرد» on an item the count data does not hold (no stock): the count screen opens and tells why
 await page.click('[data-ia-count]');
 await page.waitForFunction(()=>!document.getElementById('iaSheet')||document.getElementById('iaSheet').classList.contains('hidden'));
 await page.waitForFunction(()=>/ملوش رصيد في فارما فلاي دلوقتي/.test(document.getElementById('ctStatus')?.textContent||''),null,{timeout:8000});
 assert.ok(await page.isVisible('#countPanel'));
 // «جرد» on an item the count holds: openItem is asked for that item's id
 await page.evaluate(()=>{window.__counted=[];window.AskerCount.openItem=async(id)=>{window.__counted.push(id);return true}});
 await page.click('[data-group="home"]');await search(page,'بروفين','بروفين');await page.click('#hsItems [data-ia]');await page.click('[data-ia-count]');
 await page.waitForFunction(()=>window.__counted.length===1);assert.deepEqual(await page.evaluate(()=>window.__counted),[101]);
 // staff: the search has no such button
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true});
 await page.click('[data-group="home"]');await page.fill('#hsQ','');await search(page,'بروفين','بروفين');
 assert.equal(await page.$('#hsItems [data-ia]'),null);
});

run('Item card: «طباعة باركود» records the operation, it waits in «العمليات» and is cancelled there; a wrong number is refused',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 await search(page,'بروفين','بروفين');await page.click('#hsItems [data-ia]');
 await page.fill('#iaCopies','0');await page.click('[data-ia-barcode]');
 assert.equal(await txt(page,'#iaMsg'),'عدد الملصقات من 1 لـ 500.');
 assert.equal((await page.evaluate(()=>window.__fakeWrites)).filter((w)=>w.table==='ar_item_ops').length,0,'nothing was written');
 await page.fill('#iaCopies','٢٥');await page.click('[data-ia-barcode]');
 await page.waitForFunction(()=>/اتسجّلت في «العمليات»/.test(document.getElementById('iaBody').textContent));
 const w=(await page.evaluate(()=>window.__fakeWrites)).filter((x)=>x.table==='ar_item_ops');
 assert.equal(w.length,1);assert.equal(w[0].k,'insert');
 const pl=Array.isArray(w[0].v)?w[0].v[0]:w[0].v;
 assert.deepEqual({kind:pl.kind,item_id:pl.item_id,item_name:pl.item_name,qty:pl.qty},{kind:'barcode',item_id:101,item_name:'بروفين ٤٠٠ مجم',qty:25});
 await page.click('[data-ia-close]');
 // «الحسابات ← العمليات»: the row, «مستنية», a cancel button
 await page.click('[data-group="accounts"]');await page.click('.subbar[data-for="accounts"] [data-tab="ops"]');
 await page.waitForSelector('[data-op-row="item1"], [data-op-row^="item"]');
 const row=await txt(page,'[data-op-row^="item"]');
 assert.match(row,/طباعة 25 ملصق باركود: بروفين ٤٠٠ مجم/);assert.match(row,/مستنية/);
 await page.click('[data-op-cancel^="item"]');
 await page.waitForFunction(()=>/اتلغت/.test(document.querySelector('[data-op-row^="item"]')?.textContent||''));
 assert.equal(await page.evaluate(()=>window.__tables.ar_item_ops[0].status),'cancelled');
 assert.equal(await page.$('[data-op-cancel^="item"]'),null,'a cancelled one has no cancel button');
});

const MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const monthRows=async(page,yearSel)=>{const sel=`${yearSel} .ia-mo`,t=await texts(page,sel);
 const m=await page.$$eval(sel,(r)=>r.map((x)=>({name:x.querySelector('.ia-mn').textContent.trim(),none:x.classList.contains('none'),bar:x.querySelector('.ia-mb i').style.width})));
 return m.map((x,i)=>({...x,text:t[i]}))};
const goMonthly=async(page)=>{await page.click('[data-ia-monthly]');await page.waitForFunction(()=>!/بيجيب الملخص الشهري/.test(document.getElementById('iaBody').textContent))};

run('Item card: «المبيعات الشهرية»: a block per year, the latest two open, totals, a line a month with a bar, empty months as zeros, a tap opens and closes a year',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 const now=new Date(),Y=now.getFullYear(),M=now.getMonth()+1;
 await search(page,'بروفين','بروفين');await page.click('#hsItems [data-ia]');
 assert.match(await txt(page,'#iaBody'),/حركة المبيعات.*المبيعات الشهرية كام اتباع من الصنف كل شهر من 2018، سنة بسنة.*⚙️ عمليات على الصنف/);
 await goMonthly(page);
 assert.equal((await page.textContent('#iaTitle')).trim(),'📅 بروفين ٤٠٠ مجم');
 // a block per year from 2018 to this year, newest first; the latest two are open
 assert.equal((await page.$$('#iaMonthly .ia-yr')).length,Y-2018+1);
 const yrs=await page.$$eval('#iaMonthly .ia-yh',(b)=>b.map((x)=>[x.querySelector('b').textContent,x.closest('.ia-yr').classList.contains('open')]));
 assert.deepEqual(yrs.slice(0,3),[[String(Y),true],[String(Y-1),true],[String(Y-2),false]]);assert.deepEqual(yrs[yrs.length-1],['2018',false]);
 // the totals: all the years, and each year's
 assert.match(await txt(page,'.ia-tot'),/الإجمالي من 03\/2018 43 علبة · 2,550\.50 ج · فواتير 25 · مرتجع 3/);
 assert.match(await txt(page,`[data-ia-year="${Y}"]`),/5 علبة · 300 ج · فواتير 3 · مرتجع 1/);
 assert.match(await txt(page,`[data-ia-year="${Y-1}"]`),/28 علبة · 1,400 ج · فواتير 18 · مرتجع 2/);
 assert.match(await txt(page,`[data-ia-year="${Y-2}"]`),/مفيش مبيعات/,'a year nothing sold says so');
 // this year: January to this month, the current month with its figures; last year: twelve months, the bars against the busiest month (20)
 const cur=await monthRows(page,'#iaMonthly .ia-yr:nth-child(1)');
 assert.equal(cur.length,M);assert.equal(cur[0].name,MONTHS[M-1]);assert.match(cur[0].text,/5 300 ج · فواتير 3 · مرتجع 1/);assert.equal(cur[0].bar,'25%');assert.ok(!cur[0].none);
 const last=await monthRows(page,'#iaMonthly .ia-yr:nth-child(2)');
 assert.equal(last.length,12);
 const jun=last.find((x)=>x.name==='يونيو'),dec=last.find((x)=>x.name==='ديسمبر'),jan=last.find((x)=>x.name==='يناير');
 assert.equal(jun.bar,'100%');assert.match(jun.text,/20 1,000 ج · فواتير 12 · مرتجع 2/);assert.equal(dec.bar,'40%');
 assert.ok(jan.none&&/—/.test(jan.text)&&jan.bar==='0%','a month nothing sold is a row of zeros, not a hole');
 // a closed year opens on a tap and closes on the next; 2018 starts in March (the item's first month)
 await page.click('[data-ia-year="2018"]');
 const y18=await monthRows(page,'#iaMonthly .ia-yr:last-child');
 assert.equal(y18.length,10);assert.equal(y18[y18.length-1].name,'مارس');assert.match(y18[y18.length-1].text,/10 850\.50 ج · فواتير 4/);
 await page.click('[data-ia-year="2018"]');assert.equal((await monthRows(page,'#iaMonthly .ia-yr:last-child')).length,0);
 assert.match(await txt(page,'#iaBody'),/آخر تحديث من اللابتوب: \d\d\/\d\d\/\d{4}/);
 // back to the menu
 await page.click('[data-ia-back]');assert.ok(await page.isVisible('[data-ia-monthly]'));
 // the list's own note points here
 await page.click('[data-ia-go="all"]');await page.waitForFunction(()=>document.querySelectorAll('#iaRows .ia-mv').length>0);
 assert.match(await txt(page,'#iaBody'),/وقبلها في «المبيعات الشهرية»/);
});

run('Item card: «المبيعات الشهرية» for an item never sold, before the laptop has loaded it, and when the read fails',async({page})=>{
 await seed(page);await page.reload();await ready(page);
 // an item with no row: sold in no month
 await search(page,'OTHER','OTHER');await page.click('#hsItems [data-ia]');await goMonthly(page);
 assert.match(await txt(page,'#iaBody'),/الصنف ده ما اتباعش في أي شهر من 2018\./);assert.equal(await page.$('#iaMonthly'),null);
 await page.click('[data-ia-close]');
 // the table is empty (no heartbeat row): not loaded yet
 await page.evaluate(()=>{const T=JSON.parse(localStorage.getItem('__fakeTables'));T.ar_item_sales_monthly=[];localStorage.setItem('__fakeTables',JSON.stringify(T))});
 await page.reload();await ready(page);
 await search(page,'بروفين','بروفين');await page.click('#hsItems [data-ia]');await goMonthly(page);
 assert.match(await txt(page,'#iaBody'),/الملخص الشهري لسه ما اتحمّلش من اللابتوب\./);
 await page.click('[data-ia-close]');
 // the read fails: the reason is shown
 await page.evaluate(()=>localStorage.setItem('__fakeFail','ar_item_sales_monthly'));
 await page.reload();await ready(page);
 await search(page,'بروفين','بروفين');await page.click('#hsItems [data-ia]');await goMonthly(page);
 assert.match(await txt(page,'#iaBody'),/مقدرتش أجيب الملخص الشهري: down/);
 await page.click('[data-ia-back]');assert.ok(await page.isVisible('[data-ia-monthly]'),'back works after an error');
});

run('Item card in English: no Arabic left on the sheet except names',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('asker-lang','en'));
 await seed(page);await page.reload();await ready(page);
 await search(page,'بروفين','بروفين');
 assert.equal((await page.textContent('#hsItems [data-ia]')).trim(),'⚙️ Operations & reports');
 await page.click('#hsItems [data-ia]');
 const left=()=>page.evaluate(()=>{const p=document.getElementById('iaSheet'),AR=/[؀-ۿ]/,out=[];
  const w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n;
  while((n=w.nextNode())){const e=n.parentElement;if(AR.test(n.nodeValue)&&!e.closest('.notr'))out.push(n.nodeValue.trim())}
  for(const el of p.querySelectorAll('[placeholder],[aria-label]'))for(const a of ['placeholder','aria-label'])if(AR.test(el.getAttribute(a)||''))out.push(a+': '+el.getAttribute(a));
  return out});
 let l=await left();assert.deepEqual(l,[],'Arabic left in the menu: '+l.join(' | '));
 await page.click('[data-ia-go="all"]');await page.waitForFunction(()=>document.querySelectorAll('#iaRows .ia-mv').length===6);
 await page.click('[data-ia-row="s59812"]');await page.click('[data-ia-row="b14"]');await page.waitForFunction(()=>document.querySelectorAll('[data-ia-row="b14"] .ia-lines tr').length===3);
 l=await left();assert.deepEqual(l,[],'Arabic left in the movement: '+l.join(' | '));
 const all=await txt(page,'#iaSheet');
 assert.match(all,/Cash sale/);assert.match(all,/Invoice no\. 11\/26\/300/);assert.match(all,/Ticket no\. 59812/);
 // the monthly summary in English: months, totals, the note
 await page.click('[data-ia-back]');
 assert.match(await txt(page,'#iaSheet'),/Monthly sales How much of the item sold each month since 2018, year by year/);
 await page.click('[data-ia-monthly]');await page.waitForFunction(()=>!!document.querySelector('#iaMonthly .ia-yr'));
 l=await left();assert.deepEqual(l,[],'Arabic left in the monthly summary: '+l.join(' | '));
 await page.click('[data-ia-year="2018"]');
 l=await left();assert.deepEqual(l,[],'Arabic left in the monthly summary (2018 open): '+l.join(' | '));
 const en=await txt(page,'#iaSheet');
 assert.match(en,/Total since 03\/2018 43 box · 2,550\.50 EGP · Invoices 25 · return 3/);assert.match(en,/2024 No sales/);assert.match(en,/March/);assert.match(en,/Last update from the laptop: \d\d\/\d\d\/\d{4}/);
});
