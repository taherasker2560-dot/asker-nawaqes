// «💊 مزمن» (owner 2026-11-16, idea 5: «تنبيه مزمن للعملا ده مهم»): the home row, the list in «العملاء» (a card per customer with his late
// regular medicines), the message (WhatsApp when his number is saved, else copied), «✓ خلصنا» and its comeback. Made-up customers and items only.
const {run,text,assert}=require('./harness.cjs');
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>{const x=new Date(Date.now()-d*864e5);return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`};
const FILE=(over={})=>({generated_at:new Date().toISOString(),data_at:'2026-11-16T00:00:58',days:540,rows:[
 {c:9001,i:1001,n:'ALPHA-TEST 10MG 30TAB',gap:30,times:6,q:1,have:2,last:ymd(40)},
 {c:9001,i:1002,n:'BETA-TEST DROPS',gap:31,times:5,q:0.5,have:0,last:ymd(38)},
 {c:9002,i:1003,n:'GAMMA-TEST 5MG',gap:28,times:4,q:2,have:5,last:ymd(36)},
]  ,...over});
const CUSTOMERS=[
 {id:9001,name:'د/سامي حسن',credit_limit:0,balance:250,last_at:`${ymd(3)}T10:00:00`,last_kind:'sale',moves:3},
 {id:9002,name:'منى سالم',credit_limit:0,balance:0,last_at:`${ymd(3)}T10:00:00`,last_kind:'sale',moves:3},
];
const put=(page,f)=>page.evaluate((f)=>{window.__storage['chronic/chronic.json']=JSON.stringify(f)},f);
run('Chronic: the home row, a card per customer, the message (WhatsApp or copied), «خلصنا» and its comeback, a stale or missing file shows nothing',async({page})=>{
 await page.evaluate(([c,at])=>{window.__tables.ar_customers=c;window.__tables.ar_customer_moves=[];
  window.__tables.ar_customer_phones=[{customer_id:9002,phone:'201000000002',contact_name:'',last_sent_at:null,last_sent_from:null,updated_at:at}];
  try{localStorage.removeItem('asker-chron-done')}catch(e){}
  window.__wa=null;window.__copied='';
  window.AskerApp.openWhatsApp=(t,p)=>{window.__wa={t,p}};
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied=t}},configurable:true});
 },[CUSTOMERS,new Date().toISOString()]);
 await put(page,FILE());
 // the home: two customers have a late regular medicine
 await page.click('[data-group="home"]');
 await page.evaluate(()=>window.AskerNotify.tick());
 await page.waitForSelector('#todoList .todo-row[data-view="chronic"]');
 const row=await page.$eval('#todoList .todo-row[data-view="chronic"]',r=>[...r.children].map(c=>c.textContent.replace(/\s+/g,' ').trim()).join(' | '));
 assert.equal(row,'2 | عميل ميعاد أدويتهم الدايمة عدّى');
 // a tap opens «العملاء» on that view
 await page.click('#todoList .todo-row[data-view="chronic"]');
 await page.waitForSelector('#cuBox:not(.hidden)');
 await page.waitForSelector('#cuRows .cu-chron');
 assert.equal(await page.$eval('#cuChips .chip.on',c=>c.dataset.cuView),'chronic');
 assert.match(await text(page,'#cuChips [data-cu-view="chronic"]'),/💊 مزمن 2/);
 assert.equal(await text(page,'#cuCount'),'2 عميل');
 const cards=await page.$$eval('#cuRows .cu-chron',r=>r.map(x=>({name:x.querySelector('.cu-chron-top .linklike').textContent.trim(),owed:x.querySelector('.cu-amt')?x.querySelector('.cu-amt').textContent.trim():null,items:[...x.querySelectorAll('.cu-chron-it')].map(i=>i.textContent.replace(/\s+/g,' ').trim())})));
 assert.equal(cards.length,2);
 assert.deepEqual([cards[0].name,cards[0].owed],['د/سامي حسن','عليه 250 ج']);
 assert.match(cards[0].items[0],/^ALPHA-TEST 10MG 30TAB\s*بياخده كل 30 يوم \(6 مرة\) آخر مرة من 40 يوم أخد 1 علبة عندك 2$/);
 assert.match(cards[0].items[1],/^BETA-TEST DROPS\s*بياخده كل 31 يوم \(5 مرة\) آخر مرة من 38 يوم أخد أقل من علبة خلص من عندك$/);
 assert.deepEqual([cards[1].name,cards[1].owed],['منى سالم 📱',null],'the saved number has the phone sign; no debt = no amount');
 // the message, no number saved: copied, by his first name (no title), the medicines by name, no money in it
 await page.click('#cuRows [data-cu-chron="9001"]');
 await page.waitForFunction(()=>/ALPHA-TEST/.test(window.__copied));
 const copied=await page.evaluate(()=>window.__copied);
 assert.equal(copied.split('\n')[0],'أهلًا يا سامي 🌷');
 assert.match(copied,/\(ALPHA-TEST 10MG 30TAB، BETA-TEST DROPS\)/);
 assert.doesNotMatch(copied,/250|ج\b/);
 assert.match(await text(page,'#cuNote'),/مفيش رقم محفوظ للعميل ده، فالرسالة اتنسخت/);
 // the message, number saved: WhatsApp opens with it, to that number
 await page.click('#cuRows [data-cu-chron="9002"]');
 await page.waitForFunction(()=>!!window.__wa);
 const wa=await page.evaluate(()=>window.__wa);
 assert.equal(wa.p,'201000000002');assert.match(wa.t,/أهلًا يا منى[\s\S]*GAMMA-TEST 5MG/);
 assert.match(await text(page,'#cuNote'),/اتفتح واتساب برسالة الدوا: ابعتها بإيدك/);
 // «✓ خلصنا»: his card goes, the count drops, it is kept on this phone, the home follows
 await page.click('#cuRows [data-cu-chron-done="9001"]');
 await page.waitForFunction(()=>document.querySelectorAll('#cuRows .cu-chron').length===1);
 assert.match(await text(page,'#cuChips [data-cu-view="chronic"]'),/💊 مزمن 1/);
 assert.match(await page.evaluate(()=>localStorage.getItem('asker-chron-done')),/9001\|1001/);
 await page.click('[data-group="home"]');
 await page.evaluate(()=>window.AskerNotify.tick());
 await page.waitForFunction(()=>/^1\b/.test((document.querySelector('#todoList .todo-row[data-view="chronic"]')||{}).textContent||''));
 // he bought one of them again and it went late again (another «last» date): that line is back, the other stays hidden
 await put(page,FILE({rows:[
  {c:9001,i:1001,n:'ALPHA-TEST 10MG 30TAB',gap:30,times:7,q:1,have:2,last:ymd(35)},
  {c:9001,i:1002,n:'BETA-TEST DROPS',gap:31,times:5,q:0.5,have:0,last:ymd(38)},
  {c:9002,i:1003,n:'GAMMA-TEST 5MG',gap:28,times:4,q:2,have:5,last:ymd(36)}]}));
 await page.evaluate(()=>window.AskerChronic.load(true));
 await page.click('[data-group="accounts"]');
 await page.click('#cuChips [data-cu-view="owing"]');await page.click('#cuChips [data-cu-view="chronic"]');
 await page.waitForFunction(()=>document.querySelectorAll('#cuRows .cu-chron').length===2);
 const back=await page.$$eval('#cuRows .cu-chron:first-of-type .cu-chron-it',r=>r.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 assert.equal(back.length,1);assert.match(back[0],/^ALPHA-TEST 10MG 30TAB\s*.* آخر مرة من 35 يوم/);
 // a file the laptop stopped updating (4 days), then no file at all: nothing is shown or counted
 await put(page,FILE({generated_at:new Date(Date.now()-96*3600e3).toISOString()}));
 await page.evaluate(()=>window.AskerChronic.load(true));
 assert.equal(await page.evaluate(()=>window.AskerChronic.count()),0,'a stale file is not trusted');
 await page.evaluate(()=>{delete window.__storage['chronic/chronic.json']});
 await page.evaluate(()=>window.AskerChronic.load(true));
 assert.equal(await page.evaluate(()=>window.AskerChronic.count()),0,'no file: nothing');
});
