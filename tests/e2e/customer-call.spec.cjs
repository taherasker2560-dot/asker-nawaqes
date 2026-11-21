// «📞 اتصل» بالعميل (owner 2026-11-22: «عايزين اوبشن اتصال من داخل السيستم بالعملاء … زرار يقوم جاي موصلني بالعميل على طول»): a link that opens the phone's dialer on his number,
// in three places: the customers' list (a round button BESIDE the row), the statement (one number = one link, several = a button that opens the list of numbers) and a site order.
// The dialer needs one more tap: a page cannot dial by itself. Made-up customers and numbers only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const CUSTOMERS=[
 {id:101,name:'أحمد محمود',credit_limit:5000,balance:1250,last_at:'2026-11-20T11:00:00',last_kind:'sale',moves:2},
 {id:102,name:'سامي حسن',credit_limit:5000,balance:480,last_at:'2026-11-19T11:00:00',last_kind:'sale',moves:1},
 {id:103,name:'هدى إبراهيم',credit_limit:5000,balance:300,last_at:'2026-11-18T11:00:00',last_kind:'sale',moves:1}];
const MOVES=[{id:11,customer_id:101,at:'2026-11-20T11:00:00',kind:'sale',total:100,paid:0,balance:1250,items:[{n:'PANADOL EXTRA 24 TAB',p:1,u:0,k:1,s:100,d:0}]},
 {id:12,customer_id:102,at:'2026-11-19T11:00:00',kind:'sale',total:100,paid:0,balance:480,items:[{n:'OMEZ 40 20 CAP',p:1,u:0,k:1,s:100,d:0}]},
 {id:13,customer_id:103,at:'2026-11-18T11:00:00',kind:'sale',total:100,paid:0,balance:300,items:[{n:'B',p:1,u:0,k:1,s:100,d:0}]}];
const PHONES=[
 {customer_id:101,phone:'201012345678',contact_name:'أحمد',last_sent_at:null,last_sent_from:null,updated_at:'2026-11-01T10:00:00'},
 {customer_id:101,phone:'201155550000',contact_name:'مراته',last_sent_at:null,last_sent_from:null,updated_at:'2026-11-02T10:00:00'},
 {customer_id:102,phone:'201099998888',contact_name:null,last_sent_at:null,last_sent_from:null,updated_at:'2026-11-03T10:00:00'}];
const setData=(page)=>page.evaluate(([c,m,p])=>{window.__tables.ar_customers=c;window.__tables.ar_customer_moves=m;window.__tables.ar_customer_phones=p;
 // a tap on a tel: link must not leave the page in the test; what it would open is noted
 window.__tel=[];document.addEventListener('click',(e)=>{const a=e.target.closest('a[href^="tel:"]');if(a){e.preventDefault();window.__tel.push(a.getAttribute('href'))}},true)},[CUSTOMERS,MOVES,PHONES]);
const openList=async(page)=>{await page.click('[data-group="accounts"]');await page.waitForSelector('#cuBox:not(.hidden)');await page.click('#cuChips [data-cu-view="all"]');await page.waitForSelector('#cuRows [data-cu="103"]')};
const writes=(page)=>page.evaluate(()=>window.__fakeWrites.filter(w=>!/^(ar_is_staff|ar_people_list)$/.test(w.rpc||'')).map(w=>w.rpc||JSON.stringify(w).slice(0,80)));

run('Call a customer: a round 📞 beside each row that has a number (none without), a tap dials and does not open the statement; the statement has «📞 اتصل» (one number = a link, several = a list of numbers)',async({page})=>{
 await setData(page);
 await openList(page);
 // the list: only the customers with a saved number have the round button, and it sits BESIDE the row (never inside the row's own button)
 assert.deepEqual(await page.$$eval('#cuRows .cu-rowc',r=>r.map(x=>[x.querySelector('[data-cu]').dataset.cu,x.querySelector('a.cu-call').getAttribute('href')])),[['101','tel:+201012345678'],['102','tel:+201099998888']],'the first saved number of each');
 assert.equal(await page.$$eval('#cuRows button.cu-row a',a=>a.length),0,'never a link inside a button');
 assert.equal(await page.$$eval('#cuRows [data-cu="103"]',b=>b.length),1);assert.equal(await page.$$eval('#cuRows .cu-rowc [data-cu="103"]',b=>b.length),0,'no number: the row stays as it was');
 assert.equal(await page.$eval('#cuRows .cu-rowc a.cu-call',a=>a.getAttribute('aria-label')),'اتصل');
 // a tap on the round button dials and leaves the list where it is
 await page.click('#cuRows .cu-rowc a.cu-call');
 assert.deepEqual(await page.evaluate(()=>window.__tel),['tel:+201012345678']);
 assert.ok(await page.isVisible('#cuListView'),'the statement did not open');
 // the statement of a customer with TWO numbers: one button, the list of numbers opens under it, each number a link
 await page.click('#cuRows [data-cu="101"]');await page.waitForSelector('#cuSt:not(.hidden) .cu-mv');
 assert.equal(await page.$eval('#cuSt .cu-callbtn',e=>e.tagName),'BUTTON');
 assert.equal(await page.$('#cuSt .cu-callsheet'),null,'the list of numbers is closed at first');
 await page.click('#cuSt .cu-callbtn');
 assert.deepEqual(await page.$$eval('#cuSt .cu-callsheet a.cu-callnum',a=>a.map(x=>[x.getAttribute('href'),x.innerText.replace(/\s+/g,' ').trim()])),[['tel:+201012345678','0101 234 5678 أحمد'],['tel:+201155550000','0115 555 0000 مراته']]);
 assert.match(await text(page,'#cuSt .cu-callsheet .hint'),/اتصل على أنهي رقم؟/);
 await page.click('#cuSt .cu-callsheet a.cu-callnum:nth-of-type(2)');
 assert.equal((await page.evaluate(()=>window.__tel)).pop(),'tel:+201155550000','the second number dials');
 await page.click('#cuSt .cu-callbtn');assert.equal(await page.$('#cuSt .cu-callsheet'),null,'a second tap closes the list');
 // a customer with ONE number: «اتصل» is the link itself
 await page.click('#cuSt [data-cu-back]');await page.waitForSelector('#cuRows [data-cu="102"]');
 await page.click('#cuRows [data-cu="102"]');await page.waitForSelector('#cuSt:not(.hidden) .cu-mv');
 assert.equal(await page.$eval('#cuSt .cu-callbtn',e=>[e.tagName,e.getAttribute('href')].join(' ')),'A tel:+201099998888');
 // a customer with no number: no call button, the «ضيف رقم» part stays
 await page.click('#cuSt [data-cu-back]');await page.waitForSelector('#cuRows [data-cu="103"]');
 await page.click('#cuRows [data-cu="103"]');await page.waitForSelector('#cuSt:not(.hidden) .cu-mv');
 assert.equal(await page.$('#cuSt .cu-callbtn'),null);
 assert.deepEqual(await writes(page),[],'nothing was written');
});

run('Call a customer: a site order has «📞 اتصل» before «واتساب» with the number the customer typed; a wrong number has none',async({page})=>{
 const O=(id,phone)=>({id,status:'new',customer_name:'زبون تجربة '+id,phone,address:'عنوان',notes:'',total:120,rx_paths:[],created_at:'2026-11-12T10:00:00Z',items:[{id:101,name:'PANADOL EXTRA 24 TAB',qty:2,price:60,line_total:120}]});
 await page.evaluate(([a,b])=>{window.__tables.ar_store_orders=[a,b]},[O(7,'01000000000'),O(8,'غير رقم')]);
 await page.click('[data-group="sales"]');await page.click('.subbar [data-tab="storeorders"]');
 await page.waitForSelector('#soOpen [data-order="7"] .so-actions');
 assert.equal(await page.$eval('#soOpen [data-order="7"] a.so-call',a=>a.getAttribute('href')),'tel:01000000000');
 assert.deepEqual(await page.$$eval('#soOpen [data-order="7"] .so-actions > a',a=>a.map(x=>x.className)),['so-call','so-wa'],'«اتصل» first, then «واتساب»');
 assert.match(await text(page,'#soOpen [data-order="7"] a.so-call'),/اتصل/);
 assert.equal(await page.$$eval('#soOpen [data-order="7"] a.so-call svg',s=>s.length),1,'a line drawing in the text color, not the red emoji');
 assert.doesNotMatch(await page.$eval('#soOpen [data-order="7"] a.so-call',a=>a.textContent),/📞/);
 assert.equal(await page.$('#soOpen [data-order="8"] a.so-call'),null,'not a number: no button');
 assert.ok(await page.$('#soOpen [data-order="8"] a.so-wa'),'the WhatsApp link stays');
 assert.deepEqual(await writes(page),[],'nothing was written');
});

run('Call a customer in English: the call buttons and the list of numbers have no Arabic left except names',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('asker-lang','en'));
 await page.reload();
 await page.waitForSelector('[data-group="accounts"]');
 await setData(page);
 await openList(page);
 await page.click('#cuRows [data-cu="101"]');await page.waitForSelector('#cuSt:not(.hidden) .cu-mv');
 await page.click('#cuSt .cu-callbtn');await page.waitForSelector('#cuSt .cu-callsheet');
 const left=()=>page.evaluate(()=>{const p=document.querySelector('#cuSt .cu-phone')?.parentElement||document.getElementById('cuSt'),AR=/[؀-ۿ]/,out=[];
  for(const root of [document.querySelector('#cuSt .cu-callbtn'),document.querySelector('#cuSt .cu-callsheet')]){
   const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
   while((n=w.nextNode())){const e=n.parentElement;if(AR.test(n.nodeValue)&&!e.closest('.notr'))out.push(n.nodeValue.trim())}}
  return out});
 const l=await left();assert.deepEqual(l,[],'Arabic left: '+l.join(' | '));
 assert.match(await text(page,'#cuSt .cu-callbtn'),/Call/);assert.match(await text(page,'#cuSt .cu-callsheet .hint'),/Call which number\?/);
 await page.click('#cuSt [data-cu-back]');await page.waitForSelector('#cuRows .cu-rowc a.cu-call');
 assert.equal(await page.$eval('#cuRows .cu-rowc a.cu-call',a=>a.getAttribute('aria-label')),'Call','the round button\'s label');
});
