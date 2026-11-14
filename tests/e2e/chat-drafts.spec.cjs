// «الرسايل», part 2 (owner 2026-11-14 «خليه يرد على كل حاجة … لو ما عجبتنيش الرسالة هعدلها او همسحها»): the bot's suggested
// answer in «خدمة العملاء»: «🤖 الرد جاهز» in the list, the suggestion with what it used, ابعت (as it is) / عدّل (the text that
// went is kept) / سيبه, and the owner's auto switches (the trial week: off). Made-up customers only.
const {run,text,assert}=require('./harness.cjs');

run('Suggested answers: «🤖 الرد جاهز», ابعت / عدّل / سيبه kept for the trial week, and the auto switches',async({page,table})=>{
 const now=Date.now(),iso=(m)=>new Date(now-m*60000).toISOString();
 await page.evaluate(([i1,i2,i3])=>{Object.assign(window.__tables,{
  ar_chats:[{id:'c1',secret:'a'.repeat(64),customer_id:null,name:'سامية',phone:'01011112222',last_at:i1,last_from:'customer',waiting:1,last_text:'عندكم بانادول كولد؟',supplier:null},
            {id:'c2',secret:'b'.repeat(64),customer_id:null,name:'منى',phone:'01033334444',last_at:i2,last_from:'customer',waiting:1,last_text:'بكام فيتامين سي؟',supplier:null},
            {id:'c3',secret:'c'.repeat(64),customer_id:null,name:'كريم',phone:'01055556666',last_at:i3,last_from:'customer',waiting:1,last_text:'شكرا',supplier:null}],
  ar_chat_messages:[{id:1,chat_id:'c1',at:i1,sender:'customer',kind:'text',body:'عندكم بانادول كولد؟',media:null,seconds:null,sent_by:null},
   {id:2,chat_id:'c2',at:i2,sender:'customer',kind:'text',body:'بكام فيتامين سي؟',media:null,seconds:null,sent_by:null},
   {id:3,chat_id:'c3',at:i3,sender:'customer',kind:'text',body:'شكرا',media:null,seconds:null,sent_by:null}],
  ar_chat_drafts:[{id:31,chat_id:'c1',for_msg:1,kind:'availability',body:'أيوه متوفر بـ 59 ج، تحب نجهزهولك؟',facts:['PANADOL COLD & FLU (بانادول كولد): متوفر · 59 ج · 12 علبة'],status:'ready',created_at:i1},
   {id:32,chat_id:'c2',for_msg:2,kind:'availability',body:'فيتامين سي بـ 45 ج',facts:['VITACID C: متوفر · 45 ج'],status:'ready',created_at:i2},
   {id:33,chat_id:'c3',for_msg:3,kind:'other',body:'العفو يا فندم',facts:[],status:'ready',created_at:i3}],
  ar_chat_settings:[{id:1,auto_kinds:[]}],ar_chat_push:[]})},[iso(1),iso(2),iso(3)]);
 await page.click('[data-group="care"]');await page.waitForSelector('#chatPanel .ch-row');
 // the list: the chats whose answer is written
 await page.waitForFunction(()=>document.querySelectorAll('#chatPanel .ch-bot').length===3);
 assert.match(await text(page,'#chatPanel [data-chat="c1"]'),/🤖 الرد جاهز/);
 // the trial week: the bot only writes; the switches with the numbers, kind by kind
 assert.match(await text(page,'[data-chat-auto]'),/أسبوع التجربة: البوت بيكتب الرد بس، وإنت اللي بتبعت/);
 await page.click('[data-chat-auto]');await page.waitForSelector('[data-auto-kind="availability"]');
 assert.equal(await page.$$eval('[data-auto-kind]',(e)=>e.length),8);
 // ابعت: as it is
 await page.click('#chatPanel [data-chat="c1"]');await page.waitForSelector('.ch-draft');
 assert.match(await text(page,'.ch-draft'),/الرد المقترح.*متوفر؟ بكام؟.*أيوه متوفر بـ 59 ج، تحب نجهزهولك؟.*PANADOL COLD & FLU \(بانادول كولد\): متوفر · 59 ج · 12 علبة/);
 await page.click('[data-draft-send]');
 await page.waitForFunction(()=>/اتبعت/.test(document.getElementById('chatPanel').textContent));
 let m=(await table('ar_chat_messages')).pop();assert.deepEqual([m.chat_id,m.sender,m.body],['c1','pharmacy','أيوه متوفر بـ 59 ج، تحب نجهزهولك؟']);
 assert.equal((await table('ar_chat_drafts')).find((d)=>d.id===31).status,'sent');
 assert.equal(await page.$('.ch-draft'),null);
 assert.ok((await page.evaluate(()=>window.__invokes)).includes('chat:push:c1'));
 // عدّل: the suggestion in the box, changed, and the text that went is kept
 await page.click('[data-chat-back]');await page.click('[data-chat-filter="all"]');
 await page.click('#chatPanel [data-chat="c2"]');await page.waitForSelector('[data-draft-edit]');
 await page.click('[data-draft-edit]');
 assert.equal(await page.inputValue('#chatReply'),'فيتامين سي بـ 45 ج');
 await page.fill('#chatReply','فيتامين سي متوفر بـ 45 ج، تحب نبعتهولك؟');await page.click('[data-chat-send]');
 await page.waitForFunction(()=>/اتبعت/.test(document.getElementById('chatPanel').textContent));
 const d2=(await table('ar_chat_drafts')).find((d)=>d.id===32);assert.deepEqual([d2.status,d2.final_body],['edited','فيتامين سي متوفر بـ 45 ج، تحب نبعتهولك؟']);
 // سيبه: nothing goes, kept as skipped
 await page.click('[data-chat-back]');await page.click('[data-chat-filter="all"]');
 await page.click('#chatPanel [data-chat="c3"]');await page.waitForSelector('[data-draft-skip]');
 const before=(await table('ar_chat_messages')).length;
 await page.click('[data-draft-skip]');
 await page.waitForFunction(()=>!document.querySelector('.ch-draft'));
 assert.equal((await table('ar_chat_drafts')).find((d)=>d.id===33).status,'skipped');
 assert.equal((await table('ar_chat_messages')).length,before,'nothing sent');
 // the owner turns on «متوفر؟ بكام؟» by itself
 await page.click('[data-chat-back]');await page.waitForSelector('[data-chat-auto]');
 if(!(await page.$('[data-auto-kind="availability"]')))await page.click('[data-chat-auto]');
 await page.check('[data-auto-kind="availability"]');
 await page.waitForFunction(()=>/الرد التلقائي شغال على 1 نوع/.test(document.querySelector('[data-chat-auto]')?.textContent||''));
 assert.deepEqual((await table('ar_chat_settings'))[0].auto_kinds,['availability']);
},{home:true});
