// «قبل الموسم» (owner 2026-11-16, idea 6): the card at the top of «النواقص» from the laptop's seasonal file, and the home row for the items
// that repeated in both years. Made-up items only.
const {run,text,assert}=require('./harness.cjs');
const FILE={generated_at:new Date().toISOString(),data_at:'2026-11-16T00:00:58',from:'2026-11-16',to:'2026-12-16',days:30,items:[
 {i:1001,n:'ALL-VENT 125ML SYP',ex:22.5,y1:24,y2:21,avg:4.5,have:9,strong:true},
 {i:1002,n:'TADALONG 20MG 4 TAB',ex:21,y1:39,y2:0,avg:6,have:3,strong:false},
 {i:1003,n:'CETAL COLD & FLU 20CAP',ex:10.8,y1:5.5,y2:16,avg:3.5,have:0,strong:true},
]};
run('Before the season: the card in «النواقص» and the home row for the ones that repeated in both years',async({page})=>{
 await page.evaluate((f)=>{window.__storage['seasonal/seasonal.json']=JSON.stringify(f);
  window.__tables.ar_stock=[{item_id:1001,name:'ALL-VENT 125ML SYP',arabic_name:'اوول فينت شراب ١٢٥',price:50,packs:9,units:0,parts:1,exp_near:null,other:0,data_at:'2026-11-16T00:00:58'}]},FILE);
 // the home: 2 of the 3 repeated in both years
 await page.click('[data-group="home"]');
 await page.evaluate(()=>window.AskerNotify.tick());
 await page.waitForSelector('#todoList .todo-row[data-view="season"]');
 const row=await page.$eval('#todoList .todo-row[data-view="season"]',r=>[...r.children].map(c=>c.textContent.replace(/\s+/g,' ').trim()).join(' | '));
 assert.equal(row,'2 | صنف موسمي رصيده أقل من اللي هيتباع الشهر الجاي');
 // a tap opens «النواقص» with the card open
 await page.click('#todoList .todo-row[data-view="season"]');
 await page.waitForSelector('#seasonBox:not(.hidden)');
 assert.equal(await page.$eval('#seasonBox',b=>b.open),true,'the card opens by itself from the home row');
 assert.equal(await text(page,'#seasonCount'),'3');
 assert.equal(await text(page,'#seasonWin'),'الفترة: 16/11 ← 16/12');
 const rows=await page.$$eval('#seasonList .ni-row',r=>r.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 assert.equal(rows.length,3);
 // the Arabic name when the bot has it, the English one under it
 assert.match(rows[0],/اوول فينت شراب ١٢٥\s*ALL-VENT 125ML SYP\s*السنة اللي فاتت بعت 24 في الفترة دي \(المعتاد في الشهر 4.5\)\s*وقبلها بسنة بعت 21\s*ورصيدك دلوقتي 9\s*اتكرر سنتين\s*5× المعتاد/);
 // one year only: no «the year before», no «repeated»
 assert.match(rows[1],/TADALONG 20MG 4 TAB\s*السنة اللي فاتت بعت 39 في الفترة دي \(المعتاد في الشهر 6\)\s*ورصيدك دلوقتي 3\s*3.5× المعتاد\s*➕ ضيفه$/);
 assert.doesNotMatch(rows[1],/وقبلها بسنة|اتكرر سنتين/);
 assert.match(rows[2],/CETAL COLD & FLU 20CAP.*ورصيدك دلوقتي 0\s*اتكرر سنتين/);
 // no file (or not the laptop's file): the card is not there
 await page.evaluate(()=>{delete window.__storage['seasonal/seasonal.json']});
 await page.evaluate(()=>window.AskerSeason.load(true));
 assert.equal(await page.$eval('#seasonBox',b=>b.classList.contains('hidden')),true,'no file = no card');
});
// «اصناف موسم مفيش امكانيه لاضافتها لامر الشرا» (owner 2026-11-16): «➕ ضيفه» with its quantity box, the bulk button, «رجّعه»
run('Before the season: add to the purchase order one by one or all that repeated, with the quantity he types, and take it back',async({page,table})=>{
 await page.evaluate((f)=>{window.__storage['seasonal/seasonal.json']=JSON.stringify(f);
  // item 1002 is in the order already
  window.__tables.ar_po_items=[{id:900,item_id:1002,item_name:'TADALONG 20MG 4 TAB',qty:2,status:'open'}];},FILE);
 await page.click('[data-group="home"]');
 await page.evaluate(()=>window.AskerNotify.tick());
 await page.waitForSelector('#todoList .todo-row[data-view="season"]');
 await page.click('#todoList .todo-row[data-view="season"]');
 await page.waitForSelector('#seasonBox:not(.hidden)');
 const rows=()=>page.$$eval('#seasonList .ni-row',r=>r.map(x=>({done:x.querySelector('.st-done')?x.querySelector('.st-done').textContent.replace(/\s+/g,' ').trim():null,qty:x.querySelector('[data-se-qty]')?x.querySelector('[data-se-qty]').value:null})));
 let r=await rows();
 assert.deepEqual(r.map(x=>x.qty),['14',null,'11'],'what the season still needs on top of the stock: 22.5-9 -> 14, 10.8-0 -> 11');
 assert.match(r[1].done,/✓ اتضاف لأمر الشرا \(2\)\s*رجّعه/,'the one already in the order says so');
 assert.equal(await text(page,'#seasonAddAll'),'➕ ضيف الـ 2 اللي اتكرروا سنتين لأمر الشرا');
 // a wrong quantity writes nothing and says so
 await page.fill('[data-se-qty="1001"]','0');
 await page.click('[data-se-add="1001"]');
 await page.waitForSelector('#seasonMsg:not(.hidden)');
 assert.equal(await text(page,'#seasonMsg'),'الكمية مش مظبوطة: ALL-VENT 125ML SYP');
 assert.equal((await table('ar_po_items')).length,1);
 // the quantity he typed is what is written (the other rows keep what they had)
 await page.fill('[data-se-qty="1001"]','20');
 await page.fill('[data-se-qty="1003"]','7');
 await page.click('[data-se-add="1001"]');
 await page.waitForSelector('#seasonList .ni-row:nth-child(1) .st-done.ok');
 assert.equal(await page.$eval('[data-se-qty="1003"]',e=>e.value),'7','the box of the other item keeps what he typed');
 let po=await table('ar_po_items');assert.equal(po.length,2);
 const a=po.find(x=>x.item_id===1001);
 assert.deepEqual([a.item_name,a.qty,a.status,a.bag],['ALL-VENT 125ML SYP',20,'open',null]);
 assert.deepEqual(a.item,{have:9,sold30:4.5,need:20,season:{ex:22.5,y1:24,y2:21,avg:4.5}});
 assert.equal(await text(page,'#seasonAddAll'),'➕ ضيف الـ 1 اللي اتكرروا سنتين لأمر الشرا');
 // the bulk button adds the rest of the ones that repeated: 1003 with the 7 he typed (its bag is not known here: the bags data is not loaded in this test, bagIn is unit-tested)
 await page.click('#seasonAddAll');
 await page.waitForSelector('#seasonList .ni-row:nth-child(3) .st-done.ok');
 po=await table('ar_po_items');assert.equal(po.length,3);
 const c=po.find(x=>x.item_id===1003);
 assert.deepEqual([c.qty,c.status,c.bag],[7,'open',null]);
 assert.ok(await page.$eval('#seasonBulk',b=>b.classList.contains('hidden')),'nothing left to add in bulk');
 // «رجّعه»: the line is cancelled, the box is back with the suggested quantity
 await page.click('[data-se-undo="1001"]');
 await page.waitForSelector('[data-se-add="1001"]');
 po=await table('ar_po_items');assert.equal(po.find(x=>x.item_id===1001).status,'cancelled');
 assert.equal(await page.$eval('[data-se-qty="1001"]',e=>e.value),'14');
 assert.equal(await text(page,'#seasonAddAll'),'➕ ضيف الـ 1 اللي اتكرروا سنتين لأمر الشرا');
});
