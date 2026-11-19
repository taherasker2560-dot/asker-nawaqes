// «📱 تطبيقات الشغل» (owner 2026-11-19, mockups/work_apps_2026-11-19.png, «ا»): his work apps open from inside the system. On Android (a phone's user
// agent here) a home button opens WhatsApp Business straight and any other app by its Google Play page; an item card has «دراج آي» / «الجرعات» (its trade
// name copied), a payment order «إنستا باي» (its amount copied), an Ibn Sina / Pharma order «انسخ وافتح» (the order copied). On a computer the phone-only
// buttons are not drawn and WhatsApp Business opens WhatsApp Web. The phone's own way of following a link is replaced by a recorder (AskerWorkApps.go).
const {run,assert}=require('./harness.cjs');
const ANDROID=()=>{Object.defineProperty(Navigator.prototype,'userAgent',{configurable:true,get:()=>'Mozilla/5.0 (Linux; Android 14; SM-A525F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'})};
const CLIP=()=>{window.__clip=null;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(t)=>{window.__clip=t},readText:async()=>window.__clip||''}})};
const ready=(page)=>page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
const rec=(page)=>page.evaluate(()=>{window.__went=[];window.__opened=[];window.AskerWorkApps.go=(u)=>window.__went.push(u);window.open=(u)=>{window.__opened.push(u)}});
const toast=(page)=>page.$eval('#appToast',e=>e.textContent.replace(/\s+/g,' ').trim());
const SEARCH={ar_store_items:[{id:301,name:'CONCOR 5MG 30TAB',arabic_name:'كونكور ٥',price:120,status:'available',is_listed:true,hidden:false}]};
const PAY=()=>{const T=window.__tables;T.ar_cash_accounts=[{id:4,name:'احتياطى',balance:45040}];T.ar_cash_cats=[];T.ar_cash_moves=[];
 T.ar_vendors=[{id:2495,name:'IBN SINA 1',short:'IBN',balance:3471.51,active:true}];
 T.ar_pay_orders=[{id:11,kind:'vendor',account_id:4,account_name:'احتياطى',vendor_id:2495,cat_id:null,who:'IBN SINA 1',amount:50000.5,memo:null,status:'approved',created_at:new Date().toISOString(),approved_at:new Date().toISOString(),move_id:null,move:null}]};
const item=(id,name,qty)=>({item_id:id,name_pf:name,qty,need:qty,have:0,avg30:9,min:0,public_price:100,discount:20,source:'list',source_date:'2026-11-18',stale:false,bonus:0,mismatch:false,list:{discount:20,date:'2026-11-18'},buy:null,est_cost:qty*80,fallback:null});
const DRAFTS={generated_at:new Date().toISOString(),suppliers:[{id:'IBNSINA',label:'ابن سينا',count:2,items:[item(1,'CONCOR 5MG 30TAB',2),item(2,'GLUCOPHAGE 1000MG 30TAB',3)]},{id:'NEWCITY',label:'نيو سيتي',count:1,items:[item(3,'BRUFEN 400MG 30TAB',1)]}],no_offer:[]};
const openOrders=async(page)=>{await page.evaluate((d)=>{window.__storage['orders/drafts.json']=JSON.stringify(d);window.__tables.ar_orders=[];window.__tables.ar_suppliers=[]},DRAFTS);
 await page.click('[data-group="purchases"]');await page.click('[data-pgroup="orders"]');await page.click('[data-tab="drafts"]');
 await page.evaluate(()=>document.querySelectorAll('details.od-fold').forEach(d=>{d.open=true})); // the orders' folds (2026-11-17) start closed
 await page.waitForSelector('#odChips [data-sup="IBNSINA"]')};

run('work apps on Android: home buttons open the apps (WhatsApp Business straight, the others by their store page), one not known yet says so, the sheet has the group',async({page})=>{
 await page.addInitScript(ANDROID);await page.addInitScript(CLIP);
 await page.evaluate(()=>localStorage.setItem('asker-home-buttons',JSON.stringify(['short','app_wab','app_drugeye','app_cams'])));
 await page.reload();await ready(page);await rec(page);
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('is-android')),true);
 const b=await page.$$eval('#homePanel .qa > button[data-qa]',x=>x.map(e=>({qa:e.dataset.qa,app:e.dataset.app||null,go:e.dataset.go||null,cls:e.className})));
 assert.deepEqual(b.map(x=>[x.qa,x.app,x.go]),[['short',null,'short'],['app_wab','wab',null],['app_drugeye','drugeye',null],['app_cams','cams',null]]);
 assert.ok(b[1].cls.includes('qa-app'),'an app button looks apart (it leaves the system)');
 await page.click('#homePanel [data-qa="app_wab"]');
 await page.waitForFunction(()=>window.__went.length===1);
 assert.equal(await page.evaluate(()=>window.__went[0]),'intent://send#Intent;scheme=whatsapp;package=com.whatsapp.w4b;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.whatsapp.w4b;end');
 assert.equal(await toast(page),'واتساب بيزنس اتفتح.');
 assert.ok(await page.isVisible('#homePanel'),'the system stays where it was');
 await page.click('#homePanel [data-qa="app_drugeye"]');
 await page.waitForFunction(()=>window.__went.length===2);
 assert.equal(await page.evaluate(()=>window.__went[1]),'intent://open?pkg=com.phycod.drugeye#Intent;scheme=askerapps;package=com.askerpharmacy.apps;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.phycod.drugeye;end');
 assert.equal(await toast(page),'دراج آي بيفتح.');
 await page.click('#homePanel [data-qa="app_cams"]');
 await page.waitForFunction(()=>/لسه ما عرفتش/.test(document.getElementById('appToast').textContent));
 assert.equal(await page.evaluate(()=>window.__went.length),2,'nothing is opened for an app not known yet');
 // the sheet: «تطبيقات الشغل», the ones not on the home yet are there to add
 await page.click('#qaEdit');
 assert.match(await page.textContent('#qaSheet'),/تطبيقات الشغل/);
 for(const t of['app_ibnsina','app_pharma','app_doses','app_instapay'])assert.ok(await page.isVisible(`#qaSheet [data-qa-flip="${t}"]`),'to add: '+t);
 // «مفتاح التطبيقات»: its download, on Android
 assert.equal(await page.getAttribute('#qaKeyApk','href'),'https://github.com/taherasker2560-dot/asker-nawaqes/releases/download/apps-build/asker-apps.apk');
 assert.match(await page.textContent('.qa-key'),/بدوسة واحدة/);
 await page.click('#qaSheet [data-qa-flip="app_instapay"]');await page.click('#qaDone');
 assert.equal(await page.getAttribute('#homePanel [data-qa="app_instapay"]','data-app'),'instapay');
},{home:true});

run('work apps on Android: an item card has «دراج آي» / «الجرعات» (the trade name copied), a payment order «إنستا باي» (the amount copied), an Ibn Sina order «انسخ وافتح»',async({page})=>{
 await page.addInitScript(ANDROID);await page.addInitScript(CLIP);
 await page.evaluate((T)=>localStorage.setItem('__fakeTables',JSON.stringify(T)),SEARCH);
 await page.reload();await ready(page);await rec(page);
 // the item card
 await page.fill('#hsQ','CONCOR');
 await page.waitForSelector('#hsItems .hs-apps [data-app="drugeye"]');
 assert.deepEqual(await page.$$eval('#hsItems .hs-apps [data-app]',x=>x.map(e=>[e.dataset.app,e.dataset.copy,e.textContent.trim()])),[['drugeye','CONCOR','👁️ دراج آي'],['doses','CONCOR','🧮 الجرعات']]);
 await page.click('#hsItems .hs-apps [data-app="drugeye"]');
 await page.waitForFunction(()=>window.__went.length===1);
 assert.equal(await page.evaluate(()=>window.__clip),'CONCOR');
 assert.equal(await toast(page),'✅ اتنسخ اسم الصنف. دراج آي بيفتح. الصق جوه التطبيق.');
 await page.fill('#hsQ','');
 // a payment order: the amount, as a plain number
 await page.evaluate(PAY);
 await page.click('[data-group="accounts"]');await page.click('[data-tab="pay"]');
 await page.waitForSelector('.py-apps [data-app="instapay"]');
 assert.equal(await page.getAttribute('.py-apps [data-app="instapay"]','data-copy'),'50000.5');
 await page.click('.py-apps [data-app="instapay"]');
 await page.waitForFunction(()=>window.__went.length===2);
 assert.equal(await page.evaluate(()=>window.__went[1]),'intent://open?pkg=com.egyptianbanks.instapay#Intent;scheme=askerapps;package=com.askerpharmacy.apps;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.egyptianbanks.instapay;end');
 assert.equal(await page.evaluate(()=>window.__clip),'50000.5');
 assert.equal(await page.evaluate(()=>window.__tables.ar_pay_orders[0].status),'approved','nothing paid or changed by it');
 // the Ibn Sina order: the order is copied and its app opens; another supplier has no app button
 await openOrders(page);
 await page.click('#odChips [data-sup="IBNSINA"]');
 await page.waitForFunction(()=>!document.getElementById('odApp').classList.contains('hidden'));
 assert.equal(await page.textContent('#odApp'),'📋 انسخ وافتح تطبيق ابن سينا');
 const msg=await page.inputValue('#odMsg');
 assert.match(msg,/CONCOR 5MG 30TAB × 2/);
 assert.equal(await page.getAttribute('#odApp','data-copy'),msg);
 await page.click('#odApp');
 await page.waitForFunction(()=>window.__went.length===3);
 assert.equal(await page.evaluate(()=>window.__went[2]),'intent://open?pkg=com.ibnsina_pharma.selfservice#Intent;scheme=askerapps;package=com.askerpharmacy.apps;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.ibnsina_pharma.selfservice;end');
 assert.equal(await page.evaluate(()=>window.__clip),msg);
 assert.match(await toast(page),/^✅ اتنسخ الطلبية\. ابن سينا بيفتح/);
 assert.deepEqual(await page.evaluate(()=>window.__tables.ar_orders),[],'nothing marked as ordered by it');
 await page.click('#odChips [data-sup="NEWCITY"]');
 await page.waitForFunction(()=>document.getElementById('odApp').classList.contains('hidden'));
},{home:true});

run('work apps on a computer: no phone-only buttons, WhatsApp Business opens WhatsApp Web, the others say they are on the phone',async({page})=>{
 await page.evaluate((T)=>{localStorage.setItem('__fakeTables',JSON.stringify(T));localStorage.setItem('asker-home-buttons',JSON.stringify(['short','app_wab','app_drugeye']))},SEARCH);
 await page.reload();await ready(page);await rec(page);
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('is-android')),false);
 await page.click('#homePanel [data-qa="app_wab"]');
 await page.waitForFunction(()=>window.__opened.length===1);
 assert.equal(await page.evaluate(()=>window.__opened[0]),'https://web.whatsapp.com/');
 await page.click('#homePanel [data-qa="app_drugeye"]');
 await page.waitForFunction(()=>/على الموبايل بس/.test(document.getElementById('appToast').textContent));
 assert.equal(await page.evaluate(()=>window.__went.length),0);
 await page.click('#qaEdit');assert.equal(await page.$$eval('#qaKeyApk',x=>x.length),0,'no «مفتاح التطبيقات» on a computer');await page.click('#qaDone');
 await page.fill('#hsQ','CONCOR');
 await page.waitForFunction(()=>/CONCOR/.test(document.getElementById('hsItems').textContent));
 assert.equal(await page.$$eval('#hsItems .hs-apps',x=>x.length),0,'no «دراج آي» on a computer');
 await page.fill('#hsQ','');
 await page.evaluate(PAY);
 await page.click('[data-group="accounts"]');await page.click('[data-tab="pay"]');
 await page.waitForSelector('#pyMain .py-card');
 assert.equal(await page.$$eval('.py-apps',x=>x.length),0,'no «إنستا باي» on a computer');
 await openOrders(page);
 await page.click('#odChips [data-sup="IBNSINA"]');
 await page.waitForTimeout(300);
 assert.ok(await page.$eval('#odApp',e=>e.classList.contains('hidden')),'no app button for the order on a computer');
},{home:true});
