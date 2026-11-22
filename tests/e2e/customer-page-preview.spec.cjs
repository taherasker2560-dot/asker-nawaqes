// «👁 شوف صفحته» in a customer's statement (owner 2026-11-17: «فتحي رابطه بيبعت رسالة على الواتس بتاعه … اعملها زرار احسن … يفتح لي صفحة العميل زي ما هو بيشوفها»).
// The owner's phone opens the customer's page (store.html#me=<secret>) in a new tab: nothing is sent to the customer on WhatsApp, a customer with no link
// gets one made, and the page asks the server for a LOOK (p_preview) so it is not counted as the customer opening his link. Made-up customers only.
const {run,text,assert}=require('./harness.cjs');
const pad=n=>String(n).padStart(2,'0');
const at=(d,h,m)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00`;
const today=new Date();
const CUSTOMERS=[{id:101,name:'أحمد محمود',credit_limit:5000,balance:1250,last_at:at(today,11,0),last_kind:'sale',moves:1},{id:102,name:'سامية عبد الله',credit_limit:10000,balance:300,last_at:at(today,9,0),last_kind:'sale',moves:1}];
const MOVES=[{id:11,customer_id:101,at:at(today,9,0),kind:'sale',total:450,paid:0,balance:1250,items:null},{id:21,customer_id:102,at:at(today,9,0),kind:'sale',total:300,paid:0,balance:300,items:null}];
const TOK='a'.repeat(64);

run('Customer statement: «👁 شوف صفحته» opens his page in a new tab, makes a link if he has none, sends nothing on WhatsApp, and asks again with the same link',async({page,table})=>{
 await page.evaluate(([c,m,t])=>{Object.assign(window.__tables,{ar_customers:c,ar_customer_moves:m,ar_customer_phones:[],ar_customer_links:[{customer_id:101,token:t,created_at:new Date().toISOString(),last_seen_at:null,seen_count:0}],ar_customer_stops:[]});
  window.__opened=[];window.open=(u)=>{window.__opened.push(u);return {closed:false,close(){window.__opened.push('closed')},location:{set href(v){window.__opened.push(v)},get href(){return ''}}}}},[CUSTOMERS,MOVES,TOK]);
 await page.click('[data-group="accounts"]');await page.waitForSelector('#cuBox:not(.hidden)');await page.click('#cuChips [data-cu-view="all"]');
 // a customer who already has a link (and no saved WhatsApp number: the other button would refuse): his page opens at once, no new link
 await page.click('#cuRows [data-cu="101"]');await page.waitForSelector('#cuSt:not(.hidden) [data-cu-link-view]');
 assert.equal(await text(page,'#cuSt [data-cu-link-view]'),'👁 شوف صفحته');
 const base=await page.evaluate(()=>new URL('store.html',location.href.replace(/#.*$/,'')).href);
 await page.click('#cuSt [data-cu-link-view]');
 await page.waitForFunction(()=>window.__opened.some(u=>/store\.html\?me=/.test(u)));
 let opened=await page.evaluate(()=>window.__opened);
 assert.ok(opened.includes(base+'?me='+TOK),'his own page: '+JSON.stringify(opened));
 assert.ok(!opened.some(u=>/wa\.me|whatsapp/i.test(u)),'nothing goes to WhatsApp');
 assert.equal((await page.evaluate(()=>window.__fakeWrites.filter(w=>w.rpc==='ar_customer_link').length)),0,'no new link was made for him');
 assert.equal((await table('ar_customer_links')).length,1);
 // a customer with no link yet: one is made (not sent), and his page opens with it
 await page.click('[data-cu-back]');await page.waitForSelector('#cuListView:not(.hidden)');
 await page.evaluate(()=>{window.__opened.length=0});
 await page.click('#cuRows [data-cu="102"]');await page.waitForSelector('#cuSt:not(.hidden) [data-cu-link-view]');
 assert.match(await text(page,'#cuSt .cu-link-seen span'),/لسه ما اتبعتلوش رابط/);
 await page.click('#cuSt [data-cu-link-view]');
 await page.waitForFunction(()=>window.__opened.some(u=>/store\.html\?me=[0-9a-f]{64}$/.test(u)));
 const links=await table('ar_customer_links');
 assert.equal(links.length,2);
 const made=links.find(l=>l.customer_id===102);assert.match(made.token,/^[0-9a-f]{64}$/);
 opened=await page.evaluate(()=>window.__opened);
 assert.ok(opened.includes(base+'?me='+made.token));
 assert.ok(!opened.some(u=>/wa\.me|whatsapp/i.test(u)),'a link was made, not sent');
 // the same button again: the same link, no second one
 await page.evaluate(()=>{window.__opened.length=0;window.__fakeWrites.length=0});
 await page.click('#cuSt [data-cu-link-view]');
 await page.waitForFunction(()=>window.__opened.some(u=>/store\.html\?me=/.test(u)));
 assert.equal((await table('ar_customer_links')).length,2);
 assert.equal(await page.evaluate(()=>window.__fakeWrites.filter(w=>w.rpc==='ar_customer_link').length),0);
 assert.ok((await page.evaluate(()=>window.__opened)).includes(base+'?me='+made.token));
 // the status line is only the customer's own opening: a look did not change it
 assert.match(await text(page,'#cuSt .cu-link-seen span'),/لسه ما فتحش رابطه/);
},{home:true});

run('Customer page on the pharmacy\'s phone asks for a look (p_preview); the customer\'s own phone does not',async({page,base})=>{
 const tok='c'.repeat(64);
 const seed=()=>page.evaluate(([c,m,t])=>localStorage.setItem('__fakeTables',JSON.stringify({ar_customers:c,ar_customer_moves:m,ar_customer_phones:[],ar_customer_links:[{customer_id:101,token:t}],ar_customer_stops:[]})),[CUSTOMERS,MOVES,tok]);
 // the customer's own phone: no p_preview
 await seed();
 await page.goto(base+'store.html#me='+tok);
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 let views=await page.evaluate(()=>window.__fakeWrites.filter(w=>w.rpc==='ar_customer_view').map(w=>w.args));
 assert.ok(views.length>=1);assert.ok(views.every(a=>!('p_preview' in a)),'the customer is the customer: '+JSON.stringify(views));
 // the pharmacy's phone (the bot signed in): the look
 await page.evaluate(()=>{localStorage.removeItem('asker_store_customer');localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{"access_token":"x"}')});
 await page.goto(base+'store.html#me='+tok);await page.reload();
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 views=await page.evaluate(()=>window.__fakeWrites.filter(w=>w.rpc==='ar_customer_view').map(w=>w.args));
 assert.ok(views.length>=1);assert.ok(views.every(a=>a.p_preview===true),'a look is a look: '+JSON.stringify(views));
 await page.evaluate(()=>{localStorage.removeItem('sb-qwrzdjdgvanmhaicncuk-auth-token');localStorage.removeItem('__fakeTables')});
},{home:true});
