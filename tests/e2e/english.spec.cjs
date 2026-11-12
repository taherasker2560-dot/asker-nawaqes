// English (owner 2026-11-12, «أ»): every screen in English; item names, the warehouses' own lines and the WhatsApp messages stay
// as they are. Visits every section in English and fails on any Arabic text still shown (outside item names and message
// boxes), so a new Arabic text in the code must get its line in ar/i18n-en.js.
const {run,assert}=require('./harness.cjs');
// the share entry in WhatsApp is really called «نواقص عربي»
const ALLOWED=[/«نواقص عربي»/];
const leftArabic=(page)=>page.evaluate(()=>{
 const SKIP='script,style,textarea,[translate="no"],.notr',NAMES='.sr-ar,.hs-names > strong,.st-item > strong',AR=/[؀-ۿ]/,out=[];
 const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
 while((n=w.nextNode())){const p=n.parentElement;if(!p||p.closest(SKIP)||p.matches(NAMES))continue;const v=n.nodeValue.replace(/\s+/g,' ').trim();if(v&&AR.test(v))out.push(v)}
 for(const el of document.querySelectorAll('[placeholder],[aria-label],[title]'))for(const a of ['placeholder','aria-label','title']){const v=el.getAttribute(a);if(v&&AR.test(v)&&!el.closest(SKIP))out.push('@'+a+': '+v)}
 return out;});
run('English: the switch, every section in English, names and messages untouched',async({page})=>{
 // the switch in the settings sheet reloads the page in English
 await page.click('#settingsBtn');
 await Promise.all([page.waitForNavigation(),page.click('[data-lang="en"]')]);
 await page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
 assert.equal(await page.evaluate(()=>[document.documentElement.lang,document.documentElement.dir].join(' ')),'en ltr');
 assert.equal(await page.textContent('.brand h1'),'Asker Pharmacy');
 assert.deepEqual(await page.$$eval('.bottomnav button span',s=>s.map(x=>x.textContent.trim())),['Home','Purchases','Accounts','Sales','Customer care']);
 assert.deepEqual(await page.$$eval('#hsScope [data-scope]',b=>b.map(x=>x.textContent.trim())),['All','Stock','Lists','Shortages']);
 // the alerts (2026-11-12) with real-looking rows, so their lines are checked too
 await page.evaluate(()=>{window.__storage['alerts/alerts.json']=JSON.stringify({generated_at:new Date().toISOString(),data_at:'2026-11-11T23:59:08',day_start:'2026-11-11T06:00:00',soon_until:'2027-03-01',
  tasks:{expiry_mix:[{id:1,name:'LAMIFEN CREAM 15GM',parts:1,today:2,n7:5,last:'2026-11-11T22:34:52',batches:[{store:1,exp:'2028-07-28',packs:2,units:0},{store:5,store_name:'مخزن انتظار ابن سينا',exp:'2028-09-28',packs:3,units:1}]},{id:2,name:'OLDER',parts:1,today:0,n7:1,last:'2026-11-08T10:00:00',batches:[]}],
   negative:[{id:3,name:'EZAPRIL-CO 72 TAB',parts:3,today:1,n7:1,last:'2026-11-11T18:52:00',batches:[{store:1,exp:'2029-07-28',packs:5,units:0}]}],expired_sold:[]},
  expiry:{expired:[{id:68195,name:'SOLONAL FACIAL WASH',parts:1,exp:'2026-06-28',packs:1,value:150,batches:[{store:1,exp:'2026-06-28',packs:1,units:0}]}],soon:[{id:9,name:'SOON ITEM',parts:1,exp:'2027-01-28',packs:2,value:200,batches:[{store:6,store_name:'مخزن انتظار فارما',exp:'2027-01-28',packs:2,units:0}]}]},
  customers:{owing:781,owed:388218,prepaid:102,over:[{id:5,name:'CUSTOMER',balance:5400.25,limit:1000,over:4400.25,pct:540,last_at:'2026-11-11T11:17:08',last_kind:'sale'}],near:[{id:6,name:'NEAR',balance:9500,limit:10000,over:-500,pct:95,last_at:'2026-11-10T10:00:00',last_kind:'payment'}]}});
  window.__tables.ar_store_orders=[{id:1,status:'new'}];window.__tables.ar_documents=[{id:'d1',status:'new'}];});
 await page.evaluate(()=>window.AskerNotify.tick());
 const seen=new Map();
 const scan=async(where)=>{for(const v of await leftArabic(page))if(!ALLOWED.some(r=>r.test(v))&&!seen.has(v))seen.set(v,where)};
 const go=async(sel)=>{const el=await page.$(sel);if(el){await el.click();await page.waitForTimeout(300)}};
 await scan('home');
 await page.fill('#hsQ','FLAGYL');await page.waitForTimeout(900);await scan('search');await go('#hsClear');
 await go('[data-group="purchases"]');await scan('shortages');
 await go('[data-tab="read"]');for(const s of ['manual','companies','today'])await go(`[data-sub="${s}"]`);await scan('read');
 await go('[data-tab="translate"]');await scan('translate');
 await go('[data-pgroup="orders"]');for(const t of ['drafts','docs','suppliers']){await go(`[data-tab="${t}"]`);await page.waitForTimeout(400);await scan(t)}
 await go('[data-pgroup="stock"]');await go('[data-tab="stock"]');await page.fill('#stQ','BR');await page.waitForTimeout(300);await go('[data-tab="count"]');await scan('stock');
 await go('[data-tab="expiry"]');await page.waitForTimeout(400);for(const v of ['today','expired','soon']){await go(`[data-al-view="${v}"]`);await scan('expiry/'+v)}
 await go('[data-group="accounts"]');await go('[data-tab="vendors"]');await scan('accounts');
 await go('[data-group="sales"]');await page.waitForTimeout(400);await go('[data-tab="sales"]');await go('[data-tab="tempsale"]');await scan('sales');
 await go('[data-group="care"]');await scan('care');
 await go('#settingsBtn');await scan('settings');await go('#settingsClose');
 assert.deepEqual([...seen.entries()],[],'Arabic left on the screens in English (add them to ar/i18n-en.js)');
 // back to Arabic
 await go('#settingsBtn');
 await Promise.all([page.waitForNavigation(),page.click('[data-lang="ar"]')]);
 await page.waitForFunction(()=>document.documentElement.dir==='rtl');
 assert.equal(await page.textContent('.brand h1'),'صيدلية عسكر');
},{home:true});
