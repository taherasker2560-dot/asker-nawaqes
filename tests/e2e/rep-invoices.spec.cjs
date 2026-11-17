// «📄 فواتير المندوبين» (owner 2026-11-16): the card at the top of «الطلبيات» and the home row. The invoices come from the laptop's file
// (repinv/invoices.json, read and checked by Hub\repinv\REP_INVOICES.ps1). Made-up warehouse and items only.
const {run,text,assert}=require('./harness.cjs');
const iso=h=>new Date(Date.now()-h*3600e3).toISOString();
const line=o=>({n:'صنف تجربة',qty:1,price:100,disc:20,total:80,item:{id:5,name:'TEST ITEM 10TAB'},usual:20,pf_price:100,flags:[],...o});
const FILE=(over={})=>({generated_at:new Date().toISOString(),invoices:[
 {id:'i1',inv_no:'5002',date:'15/11/2026',warehouse:'مخزن تجربة',received_at:iso(2),vendor:{id:9,name:'تجربة'},page:1,pages:1,
  lines:[line({n:'دوا اول',qty:5,price:24,disc:15,total:102,item:{id:6,name:'FIRST DRUG GEL'},usual:22,pf_price:24,flags:['disc_low']}),
         line({n:'دوا تاني',qty:1,price:200,disc:15,total:170,item:null,usual:null,pf_price:null,flags:['no_match']}),
         line({n:'دوا تالت',total:80,flags:[]})],
  totals:{retail:680,previous:1000,net:352,total:1352,paid:0,balance:1352},math:{lines_bad:[],sum_ok:true,chain_ok:true,balance_ok:true},orders_known:false,missing:[],
  account:{theirs:1352,ours:900,unentered:['5001','5002'],unentered_net:400,unexplained:52,inv_no:'5002'}},
 {id:'i0',inv_no:'5001',date:'15/11/2026',warehouse:'مخزن تجربة',received_at:iso(10),vendor:{id:9,name:'تجربة'},page:1,pages:1,
  lines:[line({})],totals:{retail:100,previous:900,net:80,total:980,paid:0,balance:980},math:{lines_bad:[],sum_ok:true,chain_ok:true,balance_ok:true},orders_known:false,missing:[],account:null},
 {id:'ix',inv_no:'4000',date:'01/11/2026',warehouse:'مخزن قديم',received_at:iso(24*20),vendor:null,page:1,pages:1,lines:[line({})],
  totals:{retail:100,previous:0,net:80,total:80,paid:0,balance:80},math:{lines_bad:[],sum_ok:true,chain_ok:true,balance_ok:true},orders_known:false,missing:[],account:null},
],...over});
const put=(page,f)=>page.evaluate(f=>{window.__storage['repinv/invoices.json']=JSON.stringify(f)},f);
const openOrders=async(page)=>{await page.click('[data-group="purchases"]');await page.click('[data-pgroup="orders"]');await page.click('[data-tab="drafts"]');await page.evaluate(()=>document.querySelectorAll('details.od-fold').forEach(d=>{d.open=true}))};
run('Rep invoices: the home row, the card with its invoices, lines, arithmetic and account; a stale or missing file',async({page})=>{
 await put(page,FILE());
 // the home: one invoice of the last two days needs a look (the newest); the clean one and the 20-day-old one do not count
 await page.click('[data-group="home"]');
 await page.evaluate(()=>window.AskerNotify.tick());
 await page.waitForSelector('#todoList .todo-row[data-go="drafts"]');
 const row=await page.$$eval('#todoList .todo-row[data-go="drafts"]',rs=>rs.map(r=>[...r.children].map(c=>c.textContent.replace(/\s+/g,' ').trim()).join(' | ')));
 assert.ok(row.includes('1 | فاتورة مندوب فيها تنبيهات'),'the home row: '+row.join(' // '));
 // the card at the top of «الطلبيات»: the last 7 days only, the newest open
 await openOrders(page);
 await page.waitForSelector('#repBox:not(.hidden)');
 assert.equal(await text(page,'#repCount'),'2','the 20-day-old invoice is not listed');
 const heads=await page.$$eval('#repList .rep-inv',r=>r.map(x=>({open:x.open,head:x.querySelector('summary').textContent.replace(/\s+/g,' ').trim()})));
 assert.equal(heads.length,2);
 assert.deepEqual([heads[0].open,heads[1].open],[true,false]);
 assert.match(heads[0].head,/تجربة\s*فاتورة 5002 وصلت \d\d\/\d\d \d\d:\d\d 3 صنف\s*352 ج\s*1 تنبيه/);
 assert.match(heads[1].head,/فاتورة 5001.*80 ج\s*✓/);
 // the lines of the newest: what the laptop found, and the ✓ for a clean one
 const lines=await page.$$eval('#repList .rep-inv:first-child .rep-line',r=>r.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 assert.equal(lines.length,3);
 assert.match(lines[0],/دوا اول\s*FIRST DRUG GEL\s*5 × 24 15% 102\s*خصم أقل: 15% وآخر مرة 22%/);
 assert.match(lines[1],/دوا تاني\s*1 × 200 15% 170\s*مش في فارمافلاي: صنف جديد؟/);
 assert.match(lines[2],/دوا تالت.*✓$/);
 // the arithmetic of the paper and the account
 const notes=await page.$$eval('#repList .rep-inv:first-child .rep-note',r=>r.map(x=>x.textContent.trim()));
 assert.deepEqual(notes,['✓ حساب الورقة مضبوط','الحساب: عندهم 1,352 وعندك 900','فواتير لسه ما اتدخلتش عندك: 5001, 5002 (400)','الفرق اللي مش مفسّر: عندهم أكتر منك بـ 52']);
 // a stale file says so; no file, or an empty one, hides the card
 await put(page,FILE({generated_at:new Date(Date.now()-96*3600e3).toISOString()}));
 await page.evaluate(()=>window.AskerRepInvoices.load(true));
 assert.ok(await page.isVisible('#repOld'),'a stale file is flagged');
 await page.evaluate(()=>{delete window.__storage['repinv/invoices.json']});
 await page.evaluate(()=>window.AskerRepInvoices.load(true));
 assert.ok(!(await page.isVisible('#repBox')),'no file = no card');
 await put(page,{generated_at:new Date().toISOString(),invoices:[]});
 await page.evaluate(()=>window.AskerRepInvoices.load(true));
 assert.ok(!(await page.isVisible('#repBox')),'no invoices = no card');
});
run('Rep invoices: the text is readable (colour on the card) and the lines are inside the screen',async({page})=>{
 await put(page,FILE());
 await openOrders(page);
 await page.waitForSelector('#repBox:not(.hidden)');
 const seen=await page.$$eval('#repBox .rep-h b, #repBox .rep-ln b, #repBox .rep-t b',els=>{const lum=c=>{const m=c.match(/\d+(\.\d+)?/g).map(Number);return 0.299*m[0]+0.587*m[1]+0.114*m[2]};
   return els.map(e=>Math.abs(lum(getComputedStyle(e).color)-lum(getComputedStyle(document.getElementById('repBox')).backgroundColor)))});
 assert.ok(seen.length>=6&&seen.every(x=>x>120),'every name and amount has a readable colour on the card: '+seen.join(','));
 const w=await page.evaluate(()=>({box:document.getElementById('repBox').getBoundingClientRect().right,vw:document.documentElement.clientWidth,sw:document.documentElement.scrollWidth}));
 assert.ok(w.sw<=w.vw+1,'no sideways scroll: '+JSON.stringify(w));
});
