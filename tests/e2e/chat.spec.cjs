// «متصفح الرسائل» part 1 (owner 2026-11-13): the customer writes on our own page (store.html#chat: text, photos; a cash
// customer gives his name and number once, a credit customer comes from his account link), and the owner answers from
// «خدمة العملاء ← الرسايل»; the answer reaches the customer's page and a push is asked for. Made-up customers only.
const {run,text,assert}=require('./harness.cjs');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const tables=(extra={})=>({ar_customers:[{id:101,name:'أحمد محمود',credit_limit:5000,balance:7174.5,last_at:null,last_kind:null,moves:0}],ar_customer_moves:[],ar_customer_phones:[],ar_customer_links:[{customer_id:101,token:'c'.repeat(64)}],ar_customer_stops:[],ar_chats:[],ar_chat_messages:[],ar_chat_push:[],...extra});

run('Messages: a cash customer writes his name and number once, sends text and a photo, and sees the pharmacy\'s answer',async({page,base})=>{
 await page.evaluate((t)=>localStorage.setItem('__fakeTables',JSON.stringify(t)),tables());
 await page.goto(base+'store.html#chat');await page.reload();
 await page.waitForSelector('[data-view="chat"]:not([hidden]) #chatForm');
 // the number first (a wrong number is refused); a word for the warehouses' reps (owner 2026-11-14)
 assert.match(await text(page,'.ch-sup-hint'),/مندوب مخزن؟ لازم تكتب رقمك اللي الصيدلية مسجلاه/);
 assert.equal(await page.$('#chatName'),null,'no name box before the number');
 await page.fill('#chatPhone','0101');await page.click('.ch-start');
 assert.match(await text(page,'#chatMsg'),/11 رقم ويبدأ بـ 01/);
 await page.fill('#chatPhone','01012345678');await page.click('.ch-start');
 // not a warehouse's number: his name too, once (the number stays)
 await page.waitForSelector('#chatName');
 assert.match(await text(page,'#chatMsg'),/اكتب اسمك كمان، أول مرة بس/);
 assert.equal(await page.inputValue('#chatPhone'),'01012345678');
 await page.fill('#chatName','سامية');await page.click('.ch-start');
 await page.waitForSelector('#chatText');
 assert.equal(await text(page,'#chatWho'),'بنرد عليك هنا · سامية');
 const secret=await page.evaluate(()=>localStorage.getItem('asker_store_chat'));
 assert.match(secret,/^[0-9a-f]{64}$/,'the chat stays on the phone');
 // text: Enter sends; the mic turns into ➤ while typing
 await page.fill('#chatText','عندكم بانادول كولد؟');
 assert.ok(await page.isVisible('[data-ch-send]'));assert.ok(await page.isHidden('[data-ch-mic]'));
 await page.press('#chatText','Enter');
 await page.waitForFunction(()=>/عندكم بانادول كولد؟/.test(document.querySelector('#chatList .ch-b.me')?.textContent||''));
 // the pharmacy's phones are told (asker-chat «notify»)
 await page.waitForFunction(()=>window.__invokes.some(x=>x.startsWith('chat:notify')));
 // a photo: uploaded to the private bucket under c/<day>/<random>.png, then sent
 await page.setInputFiles('#chatPhoto',{name:'rx.png',mimeType:'image/png',buffer:PNG});
 await page.waitForSelector('#chatList .ch-b.me img.ch-photo');
 const sent=await page.evaluate(()=>window.__tables.ar_chat_messages.map(m=>[m.sender,m.kind,m.body,m.media&&/^c\/\d{4}-\d\d-\d\d\/[0-9a-f-]{36}\.(png|jpg)$/.test(m.media)]));
 assert.deepEqual(sent,[['customer','text','عندكم بانادول كولد؟',null],['customer','photo',null,true]]);
 assert.equal(await page.evaluate(()=>window.__tables.ar_chats[0].waiting),2);
 // the pharmacy answers: it shows on his page (the page reads every few seconds)
 await page.evaluate(()=>{const c=window.__tables.ar_chats[0];window.__tables.ar_chat_messages.push({id:1100,chat_id:c.id,at:new Date().toISOString(),sender:'pharmacy',kind:'text',body:'أيوه متوفر بـ 59 ج',media:null,seconds:null})});
 await page.waitForFunction(()=>/أيوه متوفر بـ 59 ج/.test(document.querySelector('#chatList .ch-b.us')?.textContent||''),null,{timeout:15000});
 assert.match(await text(page,'#chatList .ch-b.us .ch-who'),/صيدلية عسكر/);
 // next time on this phone: straight into the chat, no form (the fake server keeps its rows over the reload)
 await page.evaluate(()=>localStorage.setItem('__fakeTables',JSON.stringify({ar_chats:window.__tables.ar_chats,ar_chat_messages:window.__tables.ar_chat_messages})));
 await page.reload();await page.waitForSelector('#chatText');
 await page.waitForFunction(()=>document.querySelectorAll('#chatList .ch-b').length===3);
 assert.equal(await page.$('#chatForm'),null);
 assert.ok(await page.isHidden('#chatBack'),'a customer\'s phone: no «رجوع للبوت»');
 // the pharmacy's phone (the bot signed in): «→ رجوع للبوت» is there
 await page.evaluate(()=>localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{}'));
 await page.reload();await page.waitForSelector('#chatBack',{state:'visible'});
 assert.equal(await page.getAttribute('#chatBack','href'),'asker-nawaqes-arabic.html');
 await page.evaluate(()=>localStorage.removeItem('sb-qwrzdjdgvanmhaicncuk-auth-token'));
 await page.evaluate(()=>localStorage.removeItem('__fakeTables'));
},{home:true});

run('Messages: a credit customer comes from his account («💬 كلّمنا»), no name or number asked',async({page,base})=>{
 const tok='c'.repeat(64);
 await page.evaluate((t)=>localStorage.setItem('__fakeTables',JSON.stringify(t)),tables());
 await page.goto(base+'store.html#me='+tok);await page.reload();
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 await page.click('#acctBox a[href="#chat"]');
 await page.waitForSelector('#chatText');
 assert.equal(await text(page,'#chatWho'),'بنرد عليك هنا · أحمد محمود');
 assert.deepEqual(await page.evaluate(()=>window.__tables.ar_chats.map(c=>[c.customer_id,c.name])),[[101,'أحمد محمود']]);
 await page.evaluate(()=>localStorage.removeItem('__fakeTables'));
},{home:true});

run('Messages in the bot: «خدمة العملاء» lists who waits, opens a chat with the photo and the voice note\'s words, the answer goes and a push is asked for',async({page,table})=>{
 const now=Date.now(),iso=(m)=>new Date(now-m*60000).toISOString();
 await page.evaluate(([i1,i2,i3,i4])=>{Object.assign(window.__tables,{
  ar_customers:[{id:101,name:'أحمد محمود',credit_limit:5000,balance:7174.5}],
  ar_chats:[{id:'c1',secret:'a'.repeat(64),customer_id:101,name:'أحمد محمود',phone:'01012345678',last_at:i1,last_from:'customer',waiting:3,last_text:'🎤 فويس'},
            {id:'c2',secret:'b'.repeat(64),customer_id:null,name:'سامية',phone:'01099998888',last_at:i4,last_from:'pharmacy',waiting:0,last_text:'تمام'}],
  ar_chat_messages:[{id:1,chat_id:'c1',at:i3,sender:'customer',kind:'text',body:'عندكم بانادول كولد؟',media:null,seconds:null,sent_by:null},
   {id:2,chat_id:'c1',at:i2,sender:'customer',kind:'photo',body:null,media:'c/2026-11-13/11111111-2222-4333-8444-555555555555.jpg',seconds:null,sent_by:null},
   {id:3,chat_id:'c1',at:i1,sender:'customer',kind:'voice',body:'وعايز فيتامين سي للعيال',media:'c/2026-11-13/11111111-2222-4333-8444-666666666666.wav',seconds:12,sent_by:null}],
  ar_chat_push:[{endpoint:'https://push.example/1',chat_id:'c1'}]})},[iso(1),iso(2),iso(3),iso(60)]);
 await page.click('[data-group="care"]');
 await page.waitForSelector('#chatPanel .ch-row');
 // the owner can have a notification on this phone when a customer writes (even with the bot closed)
 await page.waitForSelector('#chatPanel [data-chat-push]');
 assert.match(await text(page,'#chatPanel [data-chat-push]'),/إشعار على موبايلك لما عميل يكتب/);
 // waiting first: only the one who wrote last; «الكل» shows both
 assert.deepEqual(await page.$$eval('#chatPanel .ch-row strong',e=>e.map(x=>x.textContent)),['أحمد محمود']);
 assert.match(await text(page,'#chatPanel [data-chat-filter="waiting"]'),/مستنية رد 1/);
 await page.click('[data-chat-filter="all"]');
 assert.equal((await page.$$('#chatPanel .ch-row')).length,2);
 await page.click('#chatPanel [data-chat="c1"]');
 await page.waitForSelector('#chatThread .ch-b');
 assert.match(await text(page,'.ch-acct'),/آجل · كود 101.*عليه 7,174.5 ج/);
 assert.equal((await page.$$('#chatThread img.ch-photo')).length,1,'the photo from the private bucket');
 assert.match(await text(page,'#chatThread'),/اتكتب: «وعايز فيتامين سي للعيال»/);
 assert.equal((await page.$$('#chatThread audio')).length,1);
 // the answer
 await page.fill('#chatReply','أيوه متوفر بـ 59 ج، تحب نبعتهولك؟');
 await page.click('[data-chat-send]');
 await page.waitForFunction(()=>/ووصله إشعار على موبايله/.test(document.getElementById('chatPanel').textContent));
 const m=(await table('ar_chat_messages')).pop();
 assert.deepEqual([m.chat_id,m.sender,m.body],['c1','pharmacy','أيوه متوفر بـ 59 ج، تحب نبعتهولك؟']);
 assert.equal((await table('ar_chats'))[0].waiting,0);
 assert.ok((await page.evaluate(()=>window.__invokes)).includes('chat:push:c1'));
 await page.waitForFunction(()=>/أيوه متوفر بـ 59 ج/.test(document.querySelector('#chatThread .ch-b.us')?.textContent||''));
 // back to the list: nobody waiting now
 await page.click('[data-chat-back]');await page.waitForSelector('#chatPanel .ch-row');
 await page.click('[data-chat-filter="waiting"]');
 assert.match(await text(page,'#chatPanel'),/مفيش حد مستني رد/);
 // «🗑 امسح المحادثة» (owner 2026-11-14): asks first, removes its photo and voice note, then the chat and its messages
 await page.click('[data-chat-filter="all"]');
 await page.click('#chatPanel [data-chat="c1"]');await page.waitForSelector('[data-chat-del]');
 page.once('dialog',d=>{assert.match(d.message(),/تمسح المحادثة دي كلها؟/);d.accept()});
 await page.click('[data-chat-del]');
 await page.waitForFunction(()=>/اتمسحت المحادثة/.test(document.getElementById('chatPanel').textContent));
 assert.deepEqual((await page.evaluate(()=>window.__removed)).sort(),['c/2026-11-13/11111111-2222-4333-8444-555555555555.jpg','c/2026-11-13/11111111-2222-4333-8444-666666666666.wav']);
 assert.deepEqual((await table('ar_chats')).map(c=>c.id),['c2']);
 assert.equal((await table('ar_chat_messages')).filter(m=>m.chat_id==='c1').length,0);
 assert.equal(await page.$('#chatPanel [data-chat="c1"]'),null);
},{home:true});
