// «📝 شكوى أو اقتراح» on the customer's account (owner 2026-11-18: «رابط يوصل لرسائل الصفحة بالشكاوى والمقترحات … فويس أو مكتوبة … ندلع العملاء أكتر»): a tile on his home opens the messages page
// as a complaint / suggestion: a banner, a hint in the box, the first message carries a mark so the pharmacy sees what it is (a voice note is announced by a short text first), then it is a normal chat.
// Made-up customers only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const openMore=(page)=>page.evaluate(()=>{const d=document.querySelector('#acctBox .ac-more');if(d&&!d.open)d.open=true}); // «المزيد» (owner 2026-11-23: four big buttons, the rest folded)
const tok='c'.repeat(64);
const tables=()=>({ar_customers:[{id:101,name:'أحمد محمود',credit_limit:5000,balance:1240,last_at:null,last_kind:null,moves:0}],ar_customer_moves:[],ar_customer_phones:[],ar_customer_links:[{customer_id:101,token:tok}],ar_customer_stops:[],ar_store_orders:[],ar_chats:[],ar_chat_messages:[],ar_chat_push:[]});
const open=async(page,base)=>{await page.setViewportSize({width:375,height:812});await page.evaluate((t)=>localStorage.setItem('__fakeTables',JSON.stringify(t)),tables());await page.goto(base+'store.html#me='+tok);await page.reload();await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-fb-tile');};
const sent=(page)=>page.evaluate(()=>window.__tables.ar_chat_messages.filter(m=>m.sender==='customer').map(m=>m.body));

run('Complaint / suggestion: the tile opens the messages page with a banner, the first message carries the mark, the next ones are normal, «إلغاء» goes back to a plain chat',async({page,base})=>{
 await open(page,base);
 assert.equal(await text(page,'.ac-fb-tile b'),'📝 شكوى أو اقتراح');assert.equal(await text(page,'.ac-fb-tile small'),'اكتبها أو سجّلها فويس');
 assert.equal(await page.evaluate(()=>document.querySelector('.ac-fb-tile').getAttribute('href')),'#chat');
 // under «المزيد» since the account has four big buttons (owner 2026-11-23); «💬 كلّم الصيدلية» is one of the four
 assert.equal(await page.evaluate(()=>!!document.querySelector('.ac-fb-tile').closest('#acctBox .ac-more')),true);
 assert.equal(await page.evaluate(()=>document.querySelector('#acctBox .ac-g4 .ac-talk').getAttribute('href')),'#chat');
 await openMore(page);await page.click('.ac-fb-tile');
 await page.waitForSelector('#chatText');
 assert.match(await text(page,'.ch-topic'),/بتكتب شكوى أو اقتراح: اكتبها أو سجّلها فويس وهتوصل للصيدلية/);
 assert.equal(await page.getAttribute('#chatText','placeholder'),'اكتب شكواك أو اقتراحك…');
 await page.fill('#chatText','الخدمة ممتازة بس عاوز مواعيد أطول');await page.press('#chatText','Enter');
 await page.waitForFunction(()=>window.__tables.ar_chat_messages.length>=1);
 assert.deepEqual(await sent(page),['📝 شكوى/اقتراح: الخدمة ممتازة بس عاوز مواعيد أطول'],'the pharmacy sees what it is');
 await page.waitForFunction(()=>!document.querySelector('.ch-topic'));
 assert.equal(await page.getAttribute('#chatText','placeholder'),'اكتب رسالتك…','back to a plain chat after the first message');
 await page.fill('#chatText','وشكرًا');await page.press('#chatText','Enter');
 await page.waitForFunction(()=>window.__tables.ar_chat_messages.filter(m=>m.sender==='customer').length===2);
 assert.deepEqual(await sent(page),['📝 شكوى/اقتراح: الخدمة ممتازة بس عاوز مواعيد أطول','وشكرًا'],'only the first one is marked');
 // «إلغاء»: the banner goes and the message is sent as it is
 await page.goto(base+'store.html#account');await page.waitForSelector('.ac-fb-tile');
 await openMore(page);await page.click('.ac-fb-tile');await page.waitForSelector('.ch-topic');
 await page.click('[data-ch-topic-off]');await page.waitForFunction(()=>!document.querySelector('.ch-topic'));
 await page.fill('#chatText','سؤال عادي');await page.press('#chatText','Enter');
 await page.waitForFunction(()=>window.__tables.ar_chat_messages.filter(m=>m.sender==='customer').length===3);
 assert.equal((await sent(page))[2],'سؤال عادي');
 // the plain «💬 كلّمنا» button never carries the mark
 await page.goto(base+'store.html#account');await page.waitForSelector('#acctBox a[href="#chat"]:not(.ac-fb-tile)');
 await page.click('#acctBox .ac-g4 a[href="#chat"]');await page.waitForSelector('#chatText');
 assert.equal(await page.$('.ch-topic'),null);
},{home:true});

run('Complaint / suggestion: in English too; and the voice note is announced by a short text first (the code path), the topic ends after it',async({page,base})=>{
 await page.addInitScript(()=>{try{localStorage.setItem('asker-lang','en')}catch(e){}});
 await open(page,base);
 assert.equal(await text(page,'.ac-fb-tile b'),'📝 Complaint or suggestion');assert.equal(await text(page,'.ac-fb-tile small'),'Write it or record a voice note');
 await openMore(page);await page.click('.ac-fb-tile');await page.waitForSelector('.ch-topic');
 assert.match(await text(page,'.ch-topic'),/You are writing a complaint or suggestion/);assert.match(await text(page,'.ch-topic'),/Cancel/);
 assert.equal(await page.getAttribute('#chatText','placeholder'),'Write your complaint or suggestion…');
 // the voice path: the text that goes before a voice note, and the topic is cleared after it (the recorder itself needs a real microphone: read from the code)
 const src=await page.evaluate(()=>fetch('store/chat.js').then(r=>r.text()));
 assert.match(src,/if \(topicOn\(\)\) \{ await rpc\('ar_chat_send', \{ p_secret: secret, p_kind: 'text', p_body: TEXTS\.topicVoice \}\); topicDone\(\); \}/);
 assert.ok(src.indexOf('TEXTS.topicVoice')<src.indexOf("p_kind: 'voice'"),'the announcement is sent before the voice note');
},{home:true});
