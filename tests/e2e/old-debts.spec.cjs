// «ديون قديمة» (owner 2026-11-16, picked from the ideas): the home's «محتاج شغل» row, the list in «العملاء» (30 / 60 / 90 days of
// no movement, biggest first), and the reminder (WhatsApp when his number is saved, else copied). Made-up customers only.
const {run,text,assert}=require('./harness.cjs');
const pad=n=>String(n).padStart(2,'0');
const ago=d=>{const x=new Date(Date.now()-d*864e5);return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}:00`};
const CUSTOMERS=[
 {id:201,name:'عميل قديم كبير',credit_limit:10000,balance:3000,last_at:ago(70),last_kind:'sale',moves:3},
 {id:202,name:'عميل قديم صغير',credit_limit:10000,balance:400,last_at:ago(95),last_kind:'payment',moves:2},
 {id:203,name:'عميل حديث',credit_limit:10000,balance:800,last_at:ago(5),last_kind:'sale',moves:2},
 {id:204,name:'دافع مقدم',credit_limit:10000,balance:-100,last_at:ago(80),last_kind:'payment',moves:1},
];
run('Old debts: the home row, the list by days, biggest first, the reminder (WhatsApp or copied)',async({page})=>{
 await page.evaluate(([c,at])=>{window.__tables.ar_customers=c;window.__tables.ar_customer_moves=[];
  window.__tables.ar_customer_phones=[{customer_id:201,phone:'201001112223',contact_name:'',last_sent_at:null,last_sent_from:null,updated_at:at}];
  try{localStorage.removeItem('asker-cu-old-days')}catch(e){}
  window.__wa=null;window.__copied='';
  window.AskerApp.openWhatsApp=(t,p)=>{window.__wa={t,p}};
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied=t}},configurable:true});
 },[CUSTOMERS,new Date().toISOString()]);
 // the home: 2 customers owe 3,400 and nothing moved for 60+ days (the recent one and the prepaid one are not in it)
 await page.click('[data-group="home"]');
 await page.evaluate(()=>window.AskerNotify.tick());
 await page.waitForSelector('#todoList .todo-row[data-view="old"]');
 const row=await page.$eval('#todoList .todo-row[data-view="old"]',r=>[...r.children].map(c=>c.textContent.replace(/\s+/g,' ').trim()).join(' | '));
 assert.match(row,/^2 \| عميل عليهم فلوس من أكتر من 60 يوم 3,400 ج$/);
 // a tap opens «العملاء» on the old debts
 await page.click('#todoList .todo-row[data-view="old"]');
 await page.waitForSelector('#cuBox:not(.hidden)');
 await page.waitForSelector('#cuRows .cu-oldrow');
 assert.equal(await page.$eval('#cuChips .chip.on',c=>c.dataset.cuView),'old');
 assert.deepEqual(await page.$$eval('#cuRows .cu-row strong',s=>s.map(x=>x.textContent.trim())),['عميل قديم كبير 📱','عميل قديم صغير'],'the biggest debt first; the one with a saved number has the phone sign');
 assert.equal(await text(page,'#cuCount'),'2 عميل عليهم 3,400 ج');
 assert.match(await text(page,'#cuRows .cu-oldrow'),/بقاله 70 يوم من غير حركة/);
 assert.deepEqual(await page.$$eval('#cuChips [data-cu-days]',b=>b.map(x=>x.textContent.trim())),['30 يوم','60 يوم','90 يوم']);
 // 90 days: only the one 95 days old; the choice is kept on the phone (the home reads it too)
 await page.click('#cuChips [data-cu-days="90"]');
 assert.deepEqual(await page.$$eval('#cuRows .cu-row strong',s=>s.map(x=>x.textContent.trim())),['عميل قديم صغير']);
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker-cu-old-days')),'90');
 assert.match(await text(page,'#cuChips [data-cu-view="old"]'),/ديون قديمة 1/);
 // 30 days: both old ones (the 5-day one is not old)
 await page.click('#cuChips [data-cu-days="30"]');
 assert.equal(await page.$$eval('#cuRows .cu-oldrow',r=>r.length),2);
 // the reminder, no number saved: copied, with the name, the amount and the day of the last movement
 await page.click('#cuRows [data-cu-remind="202"]');
 await page.waitForFunction(()=>/يا عميل قديم صغير/.test(window.__copied));
 assert.match(await page.evaluate(()=>window.__copied),/400 ج \(آخر حركة على الحساب يوم \d\d\/\d\d\/\d{4}\)/);
 assert.match(await text(page,'#cuNote'),/مفيش رقم محفوظ للعميل ده، فالرسالة اتنسخت/);
 // the reminder, number saved: WhatsApp opens with the message, to that number
 await page.click('#cuRows [data-cu-remind="201"]');
 await page.waitForFunction(()=>!!window.__wa);
 const wa=await page.evaluate(()=>window.__wa);
 assert.equal(wa.p,'201001112223');assert.match(wa.t,/يا عميل قديم كبير[\s\S]*3,000 ج/);
 assert.match(await text(page,'#cuNote'),/اتفتح واتساب برسالة التذكير/);
 // the list of «عليهم» and the others are untouched and the note goes away outside this list
 await page.click('#cuChips [data-cu-view="owing"]');
 assert.equal(await page.$$eval('#cuRows .cu-oldrow',r=>r.length),0);
 assert.equal(await text(page,'#cuNote'),'');
});
