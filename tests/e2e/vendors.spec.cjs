// «الموردين» (owner 2026-11-14: «حسابات الموردين وحركة الحساب … صنف معين جاي من مين امتى … بتاريخ ايه وصلاحية ايه … المرتجعات
// لكل مورد من تاريخ معين»). The suppliers and what we owe, a supplier's statement (period numbers, the balance after each move,
// an invoice's items, the returns with their expiry), an item's purchases, and the server not ready yet.
// Made-up suppliers' moves only: the repository is public.
const {run,assert}=require('./harness.cjs');
// the text as shown (block parts apart)
const text=(page,sel)=>page.$eval(sel,e=>e.innerText.replace(/\s+/g,' ').trim());
const pad=n=>String(n).padStart(2,'0');
const at=(daysAgo,h=12)=>{const d=new Date();d.setDate(d.getDate()-daysAgo);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(h)}:00:00`};
const ITEMS=[{id:101,name:'PANADOL EXTRA 24 TAB',arabic_name:'بانادول اكسترا'},{id:102,name:'LICID 60CC LOTION',arabic_name:null}];
const VENDORS=[
 {id:2374,name:'A M group',short:'AMG',active:true,balance:3120,invoices:3,last_invoice_at:at(1),last_payment_at:at(3),last_payment:2000},
 {id:2278,name:'رضا عطية',short:'SKY',active:true,balance:900,invoices:1,last_invoice_at:at(30),last_payment_at:null,last_payment:null},
 {id:188,name:'IBN SINA 2',short:'IBN',active:true,balance:-500,invoices:1,last_invoice_at:at(900),last_payment_at:at(800),last_payment:100},
 {id:7,name:'OLD ONE',short:'OLD',active:false,balance:0,invoices:1,last_invoice_at:at(900),last_payment_at:null,last_payment:null},
];
// newest first (the fake ignores the order the page asks for); invoice numbers go up with time, like PharmaFly's
const MOVES=[
 {id:14,vendor_id:2374,at:at(1),kind:'purchase',code:'11/26/300',inv_date:null,amount:1100,total:1100,balance:3120,lines:[{i:101,p:10,u:0,k:1,b:1,c:86,t:16,x:'2028-08-28'},{i:102,p:5,u:0,k:1,b:0,c:46,t:10,x:'2029-03-28'}]},
 {id:-500,vendor_id:2374,at:at(3),kind:'payment',code:null,inv_date:null,amount:-2000,total:null,balance:2020,lines:null},
 {id:12,vendor_id:2374,at:at(4),kind:'return',code:'~11/26/200',inv_date:null,amount:-180,total:-180,balance:4020,lines:[{i:102,p:5,u:0,k:1,b:0,c:36,t:10,x:'2026-12-28'}]},
 {id:11,vendor_id:2374,at:at(5),kind:'purchase',code:'11/26/200',inv_date:null,amount:1200,total:1200,balance:4200,lines:[{i:101,p:12,u:0,k:1,b:0,c:84,t:18,x:'2028-06-28'}]},
 {id:9,vendor_id:2278,at:at(30),kind:'purchase',code:'10/26/900',inv_date:null,amount:900,total:900,balance:900,lines:[{i:101,p:12,u:0,k:1,b:0,c:82,t:19,x:'2028-05-28'}]},
 {id:5,vendor_id:2374,at:at(400),kind:'purchase',code:'10/25/100',inv_date:null,amount:3000,total:3000,balance:3000,lines:[{i:101,p:30,u:0,k:1,b:0,c:80,t:15,x:'2027-06-28'}]},
];
const setData=(page)=>page.evaluate(([v,m,i])=>{window.__tables.ar_vendors=v;window.__tables.ar_vendor_moves=m;window.__tables.ar_store_items=i},[VENDORS,MOVES,ITEMS]);
run('Suppliers: balances, a statement with returns and expiry, an item\'s purchases',async({page})=>{
 await setData(page);
 await page.click('[data-group="accounts"]');
 await page.click('.subbar[data-for="accounts"] [data-tab="vendors"]');
 await page.waitForSelector('#veRows .ve-row');
 assert.match(await text(page,'#veTotal'),/علينا للموردين كلهم: 4,020 ج ?2 مورد اتعاملنا معاهم السنة دي/);
 // this year's (or with a balance), biggest balance first; «الكل» adds the old settled one
 assert.deepEqual(await page.$$eval('#veRows [data-ve-open]',b=>b.map(x=>+x.dataset.veOpen)),[2374,2278,188]);
 assert.match(await text(page,'[data-ve-open="188"]'),/لينا 500/);
 assert.match(await text(page,'[data-ve-open="2374"]'),/A M group \(AMG\) ?3,120.*آخر فاتورة امبارح · آخر دفعة \d\d\/\d\d\/\d{4} \(2,000\)/);
 await page.click('[data-ve-view="all"]');
 assert.equal(await page.$$eval('#veRows [data-ve-open]',b=>b.length),4);
 // a supplier's statement: from the first of last month to today
 await page.click('[data-ve-open="2374"]');
 await page.waitForSelector('#veMoves .ve-move');
 assert.match(await text(page,'#veStHead'),/A M group الرصيد 3,120/);
 assert.match(await text(page,'#veStSum'),/فواتير 2,300 \(2\) · مرتجع 180 \(1\) · دفعات 2,000 \(1\)/);
 assert.match(await text(page,'#veStSum'),/رصيد أول الفترة 3,000 · آخر الفترة 3,120/);
 assert.deepEqual(await page.$$eval('#veMoves .ve-move .ve-tag',x=>x.map(e=>e.textContent)),['فاتورة شرا','دفعة','مرتجع','فاتورة شرا']);
 assert.match(await text(page,'#veMoves .ve-move:nth-child(2)'),/دفعة ?−2,000.*الرصيد بعدها 2,020/);
 // the return shows its items and their expiry at once; an invoice opens on a tap
 assert.match(await text(page,'#veMoves .ve-move:nth-child(3) .ve-lines'),/LICID 60CC LOTION ?5 ?12\/2026 ?180/);
 assert.equal(await page.$$eval('#veMoves .ve-move:nth-child(1) .ve-lines',x=>x.length),0);
 await page.click('[data-ve-move="14"]');
 assert.match(await text(page,'[data-ve-move="14"] .ve-lines'),/PANADOL EXTRA 24 TAB ?بانادول اكسترا ?10 \+ 1 بونص ?08\/2028 ?860/);
 // only the returns of the period
 await page.click('[data-ve-kind="return"]');
 await page.waitForFunction(()=>document.querySelectorAll('#veMoves .ve-move').length===1);
 assert.match(await text(page,'#veStSum'),/المرتجعات اللي راحت له في الفترة دي: 1 مرتجع · 180 ج/);
 // back to the suppliers
 await page.click('#veSt [data-ve-back]');
 await page.waitForFunction(()=>!document.getElementById('veListView').classList.contains('hidden'));
 // «الصنف ده جه من مين؟»
 await page.click('#veItemBtn');
 await page.fill('#veQ','panadol');
 await page.waitForSelector('#veFind [data-ve-item]');
 assert.match(await text(page,'#veFind [data-ve-item="101"]'),/4 مرة اتشرى/);
 await page.click('#veFind [data-ve-item="101"]');
 await page.waitForSelector('#veItemRows tr:nth-child(2)');
 assert.match(await text(page,'#veItemHead'),/آخر سنة: 64 علبة \+ 1 بونص من 2 موردين/);
 assert.match(await text(page,'#veItemHead'),/أحسن شرا: SKY بخصم 19% \(/);
 assert.deepEqual(await page.$$eval('#veItemRows tr',x=>x.slice(1).map(e=>[...e.cells].slice(1).map(c=>c.innerText.trim()).join('|'))),
  ['AMG|10 + 1 بونص|16%|08/2028','AMG|12|18%|06/2028','SKY|12|19%|05/2028','AMG|30|15%|06/2027']);
 assert.ok(await page.$eval('#veFindBox',e=>e.classList.contains('hidden')));
 await page.click('[data-ve-ikind="return"]');
 await page.waitForFunction(()=>/ما اترجعش لأي مورد/.test(document.getElementById('veItemStatus').textContent));
 await page.click('#veItem [data-ve-back]');
 // the suppliers can't be read: said plainly
 await page.evaluate(()=>{localStorage.setItem('__fakeFail','ar_vendors');window.AskerVendors.open(true)});
 await page.waitForFunction(()=>/مقدرتش أجيب الموردين: down/.test(document.getElementById('veStatus').textContent));
 await page.evaluate(()=>localStorage.removeItem('__fakeFail'));
});
