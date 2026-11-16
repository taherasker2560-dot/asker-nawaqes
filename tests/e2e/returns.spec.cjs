// «↩️ المرتجعات» (owner 2026-11-16): the card on top of «الحسابات ← الموردين», the home row and the statement he copies. The file comes from the laptop
// (returns/returns.json, Hub\returns\BUILD_RETURNS.ps1). Made-up companies and items only.
const {run,text,assert}=require('./harness.cjs');
const iso=h=>new Date(Date.now()-h*3600e3).toISOString();
const ret=o=>({id:1,at:'2026-11-15T16:54:08',no:'5001',code:'~11/26/5001',amount:100,status:'pending',notice:null,items:[{n:'TEST DRUG 10TAB',ar:'',p:1,u:0}],...o});
const FILE=(over={})=>({generated_at:iso(1),days:60,vendors:[
 {id:7,name:'شركة تجربة',tracked_from:'2026-11-10',notices:2,pending:{n:2,amount:489.62},handed:{n:1,amount:112.18},untracked:{n:48,amount:21424.62},
  returns:[ret({id:3,at:'2026-11-15T16:54:08',no:'106676',amount:412.2,items:[{n:'OCEAN SPRAY 15ML',ar:'اوشن بخاخ',p:1,u:0},{n:'CALCI 100ML',ar:'',p:0,u:2}]}),
           ret({id:2,at:'2026-11-12T18:25:10',no:'100210',amount:77.42,items:[{n:'IVY SYRUP 100ML',ar:'',p:1,u:0}]}),
           ret({id:1,at:'2026-11-11T10:00:00',no:'97692',amount:112.18,status:'handed',notice:{no:'28563',at:'2026-11-13 06:32:23',total:112.18},items:[{n:'PREDNI 20TAB',ar:'',p:1,u:0}]}),
           ret({id:0,at:'2026-10-01T10:00:00',no:'70001',amount:500,status:'untracked'})]},
 {id:8,name:'شركة تانية',tracked_from:'2026-11-10',notices:1,pending:{n:0,amount:0},handed:{n:1,amount:50},untracked:{n:0,amount:0},
  returns:[ret({id:9,no:'8001',amount:50,status:'handed',notice:{no:'7',at:'2026-11-14 10:00:00',total:50}})]},
 {id:9,name:'شركة من غير إشعارات',tracked_from:null,notices:0,pending:{n:0,amount:0},handed:{n:0,amount:0},untracked:{n:12,amount:3000},returns:[ret({id:20,status:'untracked'})]},
],...over});
const put=(page,f)=>page.evaluate(f=>{window.__storage['returns/returns.json']=JSON.stringify(f)},f);
const openVendors=async(page)=>{await page.click('[data-group="accounts"]');await page.click('[data-tab="vendors"]')};
run('Returns: the home row, the card per company, the lines by invoice number, the statement copied; a stale or missing file',async({page})=>{
 await page.evaluate(()=>{window.__copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied=t}},configurable:true})});
 await put(page,FILE());
 // the home: 2 returns waiting, 489.62
 await page.click('[data-group="home"]');
 await page.evaluate(()=>window.AskerNotify.tick());
 await page.waitForSelector('#todoList .todo-row[data-go="vendors"]');
 const row=await page.$eval('#todoList .todo-row[data-go="vendors"]',r=>[...r.children].map(c=>c.textContent.replace(/\s+/g,' ').trim()).join(' | '));
 assert.equal(row,'2 | مرتجع لسه ما راحش للشركات 490 ج');
 // the card on top of «الموردين»: the companies with something to say (the one with only untracked returns is not there)
 await openVendors(page);
 await page.waitForSelector('#rtBox:not(.hidden)');
 assert.equal(await text(page,'#rtCount'),'2');
 const heads=await page.$$eval('#rtList .rt-v',r=>r.map(x=>({open:x.open,head:x.querySelector('summary').textContent.replace(/\s+/g,' ').trim()})));
 assert.equal(heads.length,2);
 assert.deepEqual([heads[0].open,heads[1].open],[true,false],'the first company with something waiting is open');
 assert.match(heads[0].head,/شركة تجربة\s*2 لسه ما راحتش 489.62 ج\s*1 راحت/);
 assert.match(heads[1].head,/شركة تانية\s*✓\s*1 راحت/);
 // its lines: newest first, by invoice number, items with quantities, the status; the untracked ones only counted
 const lines=await page.$$eval('#rtList .rt-v:first-child .rt-ret',r=>r.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 assert.equal(lines.length,3);
 assert.match(lines[0],/فاتورة 106676\s*15\/11\s*412.20 ج\s*اوشن بخاخ\s*1 علبة\s*CALCI 100ML\s*2 وحدة\s*لسه عندك/);
 assert.match(lines[1],/فاتورة 100210\s*12\/11\s*77.42 ج.*لسه عندك/);
 assert.match(lines[2],/فاتورة 97692\s*11\/11\s*112.18 ج.*إشعار 28563 وصل 13\/11/);
 assert.match(await text(page,'#rtList .rt-v:first-child .rt-body > .hint'),/قبل ما التتبع يبدأ \(10\/11\): 48 مرتجع بـ 21,424.62 ج/);
 // the statement: copied, the pending ones only, by invoice number
 await page.click('#rtList [data-rt-copy="7"]');
 await page.waitForFunction(()=>/كشف مرتجعات/.test(window.__copied));
 const msg=await page.evaluate(()=>window.__copied);
 assert.match(msg,/لدى شركة تجربة/);assert.match(msg,/1\) فاتورة 100210 \(12\/11\): 77.42 ج/);assert.match(msg,/2\) فاتورة 106676 \(15\/11\): 412.20 ج — اوشن بخاخ \(1 علبة\)، CALCI 100ML \(2 وحدة\)/);
 assert.match(msg,/الإجمالي: 489.62 ج$/);assert.doesNotMatch(msg,/97692/,'a return that went is not in it');
 assert.match(await text(page,'#rtNote'),/اتنسخ كشف المرتجعات/);
 // a company with nothing waiting has no copy button
 assert.equal(await page.$$eval('#rtList .rt-v:nth-child(2) [data-rt-copy]',b=>b.length),0);
 // a stale file says so; no file or an empty one hides the card
 await put(page,FILE({generated_at:iso(96)}));
 await page.evaluate(()=>window.AskerReturns.load(true));
 assert.ok(await page.isVisible('#rtOld'),'a stale file is flagged');
 await page.evaluate(()=>{delete window.__storage['returns/returns.json']});
 await page.evaluate(()=>window.AskerReturns.load(true));
 assert.ok(!(await page.isVisible('#rtBox')),'no file = no card');
 await put(page,{generated_at:iso(1),vendors:[]});
 await page.evaluate(()=>window.AskerReturns.load(true));
 assert.ok(!(await page.isVisible('#rtBox')),'no companies = no card');
});
run('Returns: the text is readable (colour on the card) and nothing scrolls sideways',async({page})=>{
 await put(page,FILE());
 await openVendors(page);
 await page.waitForSelector('#rtBox:not(.hidden)');
 const seen=await page.$$eval('#rtBox .rt-v > summary > b, #rtBox .rt-top, #rtBox .rt-top b',els=>{const lum=c=>{const m=c.match(/\d+(\.\d+)?/g).map(Number);return 0.299*m[0]+0.587*m[1]+0.114*m[2]};
   return els.map(e=>Math.abs(lum(getComputedStyle(e).color)-lum(getComputedStyle(document.getElementById('rtBox')).backgroundColor)))});
 assert.ok(seen.length>=5&&seen.every(x=>x>120),'every name and amount has a readable colour on the card: '+seen.join(','));
 const w=await page.evaluate(()=>({vw:document.documentElement.clientWidth,sw:document.documentElement.scrollWidth}));
 assert.ok(w.sw<=w.vw+1,'no sideways scroll: '+JSON.stringify(w));
});
