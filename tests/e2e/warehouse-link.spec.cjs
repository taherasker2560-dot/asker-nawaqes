// The warehouses' link (owner 2026-11-14 «رابط للمخزن زيه زي العملاء … الربط بتاعهم بالرقم»): the reps send their lists from
// our messages page; the page knows a warehouse by its number saved in «الوارد ← الشركات» (no name, no install), what it
// sends goes to «الوارد» under the warehouse's name («🔗 من الرابط»); the bot sends each rep the link once («📲 ابعتله
// الرابط», his number in the message) and shows who sends from it; a new rep who wrote as a customer is saved once
// («🏬 ده مندوب مخزن؟»). Made-up warehouses and numbers only.
const {run,text,assert}=require('./harness.cjs');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');

run('Warehouse link: the rep writes his saved number once (no name), sends a photo and a PDF, «✓ وصلت», and they go to «الوارد»',async({page,base})=>{
 const t={ar_suppliers:[{name:'مخزن تجربة جروب',phone:'201001110001'},{name:'مخزن تجربة (حسن)',phone:'201001110001'}],ar_supplier_phones:[],ar_chats:[],ar_chat_messages:[],ar_chat_push:[],ar_inbox:[]};
 await page.evaluate((t)=>localStorage.setItem('__fakeTables',JSON.stringify(t)),t);
 await page.goto(base+'store.html#chat');await page.reload();
 await page.waitForSelector('[data-view="chat"]:not([hidden]) #chatForm');
 assert.match(await text(page,'.ch-sup-hint'),/مندوب مخزن؟ لازم تكتب رقمك اللي الصيدلية مسجلاه عندها/);
 await page.fill('#chatPhone','0100 111 0001');await page.click('.ch-start');
 // his warehouse's page at once (two names with one number: the one naming a person)
 await page.waitForSelector('.ch-big');
 assert.equal(await page.$('#chatName'),null,'no name asked');
 assert.equal(await text(page,'#chatWho'),'المشتريات · مخزن تجربة (حسن)');
 assert.match(await text(page,'#chatList .ch-ok'),/إنت متسجل كمخزن: اللي تبعته بيروح المشتريات على طول/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_me')),null,'a rep is not kept as a customer');
 // the list's photo from the big button, then a PDF
 await page.setInputFiles('#chatPhoto2',{name:'list.png',mimeType:'image/png',buffer:PNG});
 await page.waitForFunction(()=>/✓ وصلت/.test(document.querySelector('#chatList .ch-b.me small')?.textContent||''));
 await page.setInputFiles('#chatFile',{name:'عروض النهارده.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 x')});
 await page.waitForFunction(()=>/عروض النهارده\.pdf/.test(document.querySelector('#chatList .ch-doc')?.textContent||''));
 assert.deepEqual(await page.evaluate(()=>window.__tables.ar_chat_messages.map(m=>[m.kind,m.body,/^c\/\d{4}-\d\d-\d\d\/[0-9a-f-]{36}\.(jpg|png|pdf)$/.test(m.media)])),[['photo',null,true],['file','عروض النهارده.pdf',true]]);
 // a Word file is refused on the page
 await page.setInputFiles('#chatFile',{name:'a.docx',mimeType:'application/msword',buffer:Buffer.from('x')});
 assert.match(await text(page,'#chatMsg'),/الملف ده مش مدعوم/);
 // to «الوارد» under the warehouse's name; no «رسالة جديدة من عميل», nobody waits for an answer, no «🔔» offer
 await page.waitForFunction(()=>(window.__tables.ar_inbox||[]).length===2);
 assert.deepEqual(await page.evaluate(()=>window.__tables.ar_inbox.map(r=>[r.supplier,r.kind,r.via])),[['مخزن تجربة (حسن)','image','link'],['مخزن تجربة (حسن)','pdf','link']]);
 const inv=await page.evaluate(()=>window.__invokes);
 assert.ok(inv.includes('chatinbox'));assert.ok(!inv.some(x=>x.startsWith('chat:notify')),'not told as a customer');
 assert.equal(await page.evaluate(()=>window.__tables.ar_chats[0].waiting),0);
 assert.ok(await page.isHidden('#chatNotify'));
 // next time on this phone: straight into his page
 await page.evaluate(()=>localStorage.setItem('__fakeTables',JSON.stringify(window.__tables)));
 await page.reload();await page.waitForSelector('.ch-big');
 assert.equal(await text(page,'#chatWho'),'المشتريات · مخزن تجربة (حسن)');
 await page.evaluate(()=>localStorage.removeItem('__fakeTables'));
},{home:true});

run('Warehouse link in the bot: «📲 ابعتله الرابط» (WhatsApp with the link and his number), who sends from it, other numbers, «🔗 من الرابط» in the inbox',async({page,table})=>{
 const now=new Date().toISOString();
 await page.evaluate((t)=>localStorage.setItem('__fakeTables',JSON.stringify(t)),{
  ar_suppliers:[{name:'مخزن تجربة (حسن)',phone:'201001110001',link_sent_at:null},{name:'مخزن النور (سعيد)',phone:'201001110002',link_sent_at:null},{name:'شركة بلا رقم',phone:null,link_sent_at:null}],
  ar_chats:[{id:'w1',secret:'f'.repeat(64),customer_id:null,name:'مخزن النور (سعيد)',phone:'01001110002',supplier:'مخزن النور (سعيد)',last_at:now,last_from:'customer',waiting:0,last_text:'📷 صورة'}],
  ar_supplier_phones:[{phone:'201088887777',supplier:'مخزن النور (سعيد)',added_at:now}],
  ar_inbox:[{id:'i1',received_at:now,sender:'رابط المخزن',supplier:'مخزن النور (سعيد)',kind:'image',body_text:null,file_path:null,status:'new',error:null,rows:[],sure:0,review:0,maybe:null,via:'link',hidden_at:null},
   {id:'i2',received_at:now,sender:'واتس',supplier:'مخزن تجربة (حسن)',kind:'text',body_text:'x',file_path:null,status:'new',error:null,rows:[],sure:0,review:0,maybe:null,via:null,hidden_at:null}]});
 await page.reload();await page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
 await page.click('[data-group="purchases"]');await page.click('[data-tab="read"]');
 // the inbox: «🔗 من الرابط» only on what came from the link
 await page.waitForFunction(()=>document.querySelectorAll('#inboxList .inbox-item').length===2);
 const items=await page.$$eval('#inboxList .inbox-item',e=>e.map(x=>x.textContent.replace(/\s+/g,' ')));
 assert.ok(items.some(t=>/مخزن النور \(سعيد\).*🔗 من الرابط/.test(t)),items.join('\n'));
 assert.ok(items.some(t=>/مخزن تجربة \(حسن\)/.test(t)&&!/من الرابط/.test(t)));
 // «الشركات»: who sends from the link, the link to send, other numbers
 await page.click('[data-sub="companies"]');
 await page.waitForFunction(()=>/✓ بيبعت من الرابط/.test(document.getElementById('supplierRows').textContent));
 const row=(n)=>page.$eval(`#supplierRows [data-del-supplier="${n}"]`,(b)=>b.closest('.sup-row').textContent.replace(/\s+/g,' '));
 assert.match(await row('مخزن النور (سعيد)'),/✓ بيبعت من الرابط/);assert.doesNotMatch(await row('مخزن النور (سعيد)'),/ابعتله/);
 assert.match(await row('مخزن النور (سعيد)'),/أرقام تانية: 0108 888 7777/);
 assert.doesNotMatch(await row('شركة بلا رقم'),/ابعتله/,'no number: no link to send');
 await page.evaluate(()=>{window.__opened=[];window.open=(u)=>window.__opened.push(u)});
 await page.click('#supplierRows [data-send-link="مخزن تجربة (حسن)"]');
 const u=(await page.evaluate(()=>window.__opened))[0];
 assert.match(u,/^https:\/\/wa\.me\/201001110001\?text=/);
 const msg=decodeURIComponent(u.split('?text=')[1]);
 assert.match(msg,/^أهلًا يا أستاذ حسن 👋/);assert.match(msg,/\/store\.html#chat\n/);assert.match(msg,/اكتب 0100 111 0001\n/);assert.match(msg,/عندنا لـمخزن تجربة، ومن غيره القايمة مش هتوصل المشتريات\.$/);
 await page.waitForFunction(()=>/اتبعتله الرابط · لسه ما فتحوش/.test(document.getElementById('supplierRows').textContent));
 assert.ok((await table('ar_suppliers')).find((s)=>s.name==='مخزن تجربة (حسن)').link_sent_at);
 assert.match(await row('مخزن تجربة (حسن)'),/📲 ابعتهوله تاني/);
 // a number removed from a warehouse
 await page.click('#supplierRows [data-del-phone="201088887777"]');
 await page.waitForFunction(()=>!/أرقام تانية/.test(document.getElementById('supplierRows').textContent));
 assert.equal((await table('ar_supplier_phones')).length,0);
 await page.evaluate(()=>localStorage.removeItem('__fakeTables'));
},{home:true});

run('«🏬 ده مندوب مخزن؟»: a new rep who wrote as a customer is saved for his warehouse once; his chat leaves «الرسايل» and goes to «الوارد»',async({page,table})=>{
 const now=new Date().toISOString();
 await page.evaluate((now)=>{Object.assign(window.__tables,{ar_suppliers:[{name:'مخزن تجربة (حسن)',phone:'201001110001'}],ar_supplier_phones:[],ar_inbox:[],
  ar_chats:[{id:'c9',secret:'9'.repeat(64),customer_id:null,name:'محمود',phone:'01088887777',last_at:now,last_from:'customer',waiting:2,last_text:'📷 صورة',supplier:null},
            {id:'c8',secret:'8'.repeat(64),customer_id:101,name:'أحمد محمود',phone:null,last_at:now,last_from:'customer',waiting:1,last_text:'سلام',supplier:null}],
  ar_chat_messages:[{id:1,chat_id:'c9',at:now,sender:'customer',kind:'text',body:'أنا مندوب تجربة الجديد',media:null,seconds:null,sent_by:null},
   {id:2,chat_id:'c9',at:now,sender:'customer',kind:'photo',body:null,media:'c/2026-11-14/11111111-2222-4333-8444-555555555555.jpg',seconds:null,sent_by:null},
   {id:3,chat_id:'c8',at:now,sender:'customer',kind:'text',body:'سلام',media:null,seconds:null,sent_by:null}]})},now);
 await page.click('[data-group="care"]');await page.waitForSelector('#chatPanel [data-chat="c9"]');
 // a credit customer's chat: no such button
 await page.click('#chatPanel [data-chat="c8"]');await page.waitForSelector('#chatThread .ch-b');
 assert.equal(await page.$('[data-chat-sup]'),null);
 await page.click('[data-chat-back]');await page.waitForSelector('#chatPanel [data-chat="c9"]');
 await page.click('#chatPanel [data-chat="c9"]');await page.waitForSelector('[data-chat-sup]');
 await page.click('[data-chat-sup]');await page.waitForSelector('[data-chat-supname]');
 assert.match(await text(page,'.ch-mv'),/اختار مخزنه مرة واحدة: رقمه يتسجل/);
 await page.click('[data-chat-supname="مخزن تجربة (حسن)"]');
 await page.waitForFunction(()=>/اتسجل كمندوب مخزن، ورسايله رايحة الوارد/.test(document.getElementById('chatPanel').textContent));
 assert.equal(await page.$('#chatPanel [data-chat="c9"]'),null,'not in «الرسايل» any more');
 assert.deepEqual((await table('ar_supplier_phones')).map((p)=>[p.phone,p.supplier]),[['201088887777','مخزن تجربة (حسن)']]);
 assert.equal((await table('ar_chats')).find((c)=>c.id==='c9').supplier,'مخزن تجربة (حسن)');
 assert.ok((await page.evaluate(()=>window.__invokes)).includes('chatinbox'));
 assert.deepEqual((await table('ar_inbox')).map((r)=>[r.supplier,r.kind,r.via]),[['مخزن تجربة (حسن)','text','link'],['مخزن تجربة (حسن)','image','link']]);
},{home:true});
