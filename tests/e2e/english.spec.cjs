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
 const seen=new Map();
 const scan=async(where)=>{for(const v of await leftArabic(page))if(!ALLOWED.some(r=>r.test(v))&&!seen.has(v))seen.set(v,where)};
 const go=async(sel)=>{const el=await page.$(sel);if(el){await el.click();await page.waitForTimeout(300)}};
 await scan('home');
 await page.fill('#hsQ','FLAGYL');await page.waitForTimeout(900);await scan('search');await go('#hsClear');
 await go('[data-group="purchases"]');await scan('shortages');
 await go('[data-tab="read"]');for(const s of ['manual','companies','today'])await go(`[data-sub="${s}"]`);await scan('read');
 await go('[data-tab="translate"]');await scan('translate');
 await go('[data-pgroup="orders"]');for(const t of ['drafts','docs','suppliers']){await go(`[data-tab="${t}"]`);await page.waitForTimeout(400);await scan(t)}
 await go('[data-pgroup="stock"]');await go('[data-tab="stock"]');await go('[data-tab="count"]');await scan('stock');
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
