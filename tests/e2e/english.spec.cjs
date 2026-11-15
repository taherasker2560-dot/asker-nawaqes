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
  customers:{owing:781,owed:388218,prepaid:102,over:[{id:5,name:'CUSTOMER',balance:5400.25,limit:1000,over:4400.25,pct:540,last_at:'2026-11-11T11:17:08',last_kind:'sale'}],near:[{id:6,name:'NEAR',balance:9500,limit:10000,over:-500,pct:95,last_at:'2026-11-10T10:00:00',last_kind:'payment'}]},
  // the other bags (2026-11-15): the bag's name stays as PharmaFly writes it
  bags:{since:'2026-11-03',late_days:7,all:[{id:'2428',name:'نواقص يوميه'},{id:'pv',name:'نواقص كل الشركات'},{id:'2274',name:'فارما مول'}],list:[{id:'2428',name:'نواقص يوميه',home:false,items:[{id:5,name:'DAILY',have:1,sold30:9,min:0,need:4,last_buy:'2026-10-25',days:1}]},
   {id:'2274',name:'فارما مول',home:true,items:[{id:1,name:'ZURCAL 40MG',have:1,sold30:33,min:0,need:16,last_buy:'2026-10-25',days:8},{id:2,name:'NEW ONE',have:0,sold30:0,min:2,need:1,last_buy:null,days:1}]}]}});
  window.__tables.ar_po_items=[{id:1,item_id:5,item_name:'DAILY',qty:3,status:'received',received_qty:1,inv_code:'11/26/100001',vendor:'AMG',received_at:new Date().toISOString()}];window.__tables.ar_store_orders=[{id:1,status:'new'}];window.__tables.ar_documents=[{id:'d1',status:'new'}];});
 await page.evaluate(()=>window.AskerNotify.tick());
 await page.evaluate(()=>{const iso=m=>new Date(Date.now()-m*6e4).toISOString();window.__tables.ar_notes=[{id:1,text:'اسأل على فاتورة الفتح',place:'pharmacy',status:'open',created_at:iso(3000)},{id:2,text:'كلم المحاسب',place:'any',status:'open',created_at:iso(100)},{id:3,text:'خلصت دي',place:'pharmacy',status:'done',created_at:iso(500),done_at:iso(20)}];window.__tables.ar_presence=[{id:1,at_pharmacy:true,since:iso(5),checked_at:iso(1)}];const px=n=>String(n).padStart(2,'0'),now0=new Date(),exp0=m=>{const x=new Date(now0.getFullYear(),now0.getMonth()+m+1,0);return x.getFullYear()+'-'+px(x.getMonth()+1)+'-'+px(x.getDate())},loc0=d=>d.getFullYear()+'-'+px(d.getMonth()+1)+'-'+px(d.getDate())+'T10:00:00';window.__tables.ar_vendors=[{id:5,name:'A M group',short:'AMG'}];window.__tables.ar_store_items=[{id:101,name:'PANADOL EXTRA 24 TAB',arabic_name:'بانادول اكسترا ٢٤ قرص'},{id:103,name:'FLAGYL 125MG SYRUP',arabic_name:null}];window.__tables.ar_vendor_moves=[{id:1,vendor_id:5,at:loc0(now0),kind:'purchase',code:'11/26/1',lines:[{i:101,p:10,u:0,k:1,b:0,c:100,t:20,x:exp0(8)},{i:103,p:1,u:12,k:24,b:0,c:50,t:10,x:exp0(0)}]},{id:2,vendor_id:5,at:loc0(now0),kind:'return',code:'~1',lines:[{i:101,p:3,u:0,k:1,b:0,x:exp0(8)}]}];window.__tables.ar_new_items=[{id:1,name_key:'ZETAPRO 5MG SYRUP',name_en:'Zetapro 5mg syrup',price:85.5,note:'Eva',status:'new',created_at:iso(500)},{id:2,name_key:'NEWDRUG 10MG',name_en:'Newdrug 10mg',price:null,note:null,status:'ordered',created_at:iso(900)},{id:3,name_key:'OLDONE',name_en:'Oldone',price:10,note:null,status:'arrived',created_at:iso(9000)}];window.__tables.ar_names=(window.__tables.ar_names||[]).concat([{name_key:'ZETAPRO 5MG SYRUP',english_name:'Zetapro 5mg syrup',arabic_name:'زيتابرو ٥ مجم شراب',status:'suggested'}]);return window.AskerNotes.refresh()});await page.waitForSelector('#ntList .nt-row');

 const seen=new Map();
 const scan=async(where)=>{for(const v of await leftArabic(page))if(!ALLOWED.some(r=>r.test(v))&&!seen.has(v))seen.set(v,where)};
 const go=async(sel)=>{const el=await page.$(sel);if(el){await el.click();await page.waitForTimeout(300)}};
 await scan('home');await go('#ntMic');await scan('home/notes-mic');await go('#ntDoneBox summary');await scan('home/notes-done');
 // his own home buttons: the edit sheet, a full home's note and the 📌 note (2026-11-15)
 await go('#qaEdit');await scan('home/buttons');await go('#qaSheet [data-qa-flip="vendors"]');await scan('home/buttons-added');await go('#qaDone');
 await go('[data-group="sales"]');await go('.subbar[data-for="sales"] .qa-pin');await scan('home/pin');
 await go('[data-group="home"]');await go('#qaEdit');for(let i=0;i<4;i++)await go('#qaSheet .qa-add:not([disabled])');await go('#qaDone');
 await go('[data-group="sales"]');await go('[data-tab="sales"]');await go('.subbar[data-for="sales"] .qa-pin');await scan('home/full');
 await go('[data-group="home"]');await go('#qaEdit');await scan('home/buttons-full');await go('#qaReset');await go('#qaDone');
 await page.fill('#hsQ','FLAGYL');await page.waitForTimeout(900);await scan('search');await go('#hsClear');
 await go('[data-group="purchases"]');await scan('shortages');await page.evaluate(()=>window.AskerNewItems.open());await page.waitForSelector('#niBox:not(.hidden)');await page.evaluate(()=>{document.getElementById('niBox').open=true});await page.waitForTimeout(300);await scan('new-items');await go('#niOld summary');await scan('new-items/closed');await go('#niList [data-ni-edit]');await scan('new-items/edit');await go('#niAdd');await scan('new-items/empty-name');
 await go('[data-tab="read"]');for(const s of ['manual','companies','today'])await go(`[data-sub="${s}"]`);await scan('read');
 await go('[data-tab="translate"]');await scan('translate');
 await go('[data-tab="bags"]');await page.waitForTimeout(400);await scan('bags');
 // tick an item, the «move» sheet, a move and its note (2026-11-15)
 await go('#bgList [data-bag="2428"]');await go('#bgList [data-pick="5"]');await go('#bgMoveBtn');await go('#bgSheet [data-to="pv"]');await scan('bags/move');await go('#bgGo');await page.waitForTimeout(400);await scan('bags/moved');
 await go('#bgList [data-bag="pv"]');await scan('bags/pending');
 // two approved new products on the orders tab (2026-11-16): one found in two warehouses' lists, one in none
 await page.evaluate(()=>{const iso=new Date().toISOString();window.__tables.ar_new_items=(window.__tables.ar_new_items||[]).concat([{id:98,name_key:'ZETA 5MG SYRUP',name_en:'Zeta 5mg syrup',price:90,qty:2,form:'شراب',status:'approved',created_at:iso},{id:99,name_key:'NOLIST 10 TAB',name_en:'Nolist 10 tab',price:40,qty:1,form:'حبوب',status:'approved',created_at:iso}]);window.__tables.ar_orders=window.__tables.ar_orders||[];window.__tables.ar_suppliers=window.__tables.ar_suppliers||[];
  window.__storage['orders/drafts.json']=JSON.stringify({generated_at:iso,suppliers:[],no_offer:[],new_items:[{key:'ZETA 5MG SYRUP',name_en:'Zeta 5mg syrup',qty:2,price:90,form:'شراب',best:'REDA',offers:[{supplier:'REDA',label:'رضا عطية',name:'زيتا شراب',price:90,discount:27,date:'2026-11-07',fresh:true,strength:'strong'},{supplier:'NEWCITY',label:'نيو سيتي',name:'زيتا ٥ مجم شراب',price:90,discount:24,date:'2026-11-08',fresh:true,strength:'strong'}]}]})});
 await go('[data-pgroup="orders"]');for(const t of ['drafts','docs','suppliers']){await go(`[data-tab="${t}"]`);await page.waitForTimeout(400);await scan(t)}
 await go('[data-pgroup="stock"]');await go('[data-tab="stock"]');await page.fill('#stQ','BR');await page.waitForTimeout(300);await go('[data-tab="count"]');await scan('stock');
 await go('[data-tab="expiry"]');await page.waitForTimeout(400);for(const v of ['today','expired','soon','short']){await go(`[data-al-view="${v}"]`);await page.waitForTimeout(300);await scan('expiry/'+v)}await go('#alExpiry [data-sd-period="7"]');await page.waitForTimeout(300);await scan('expiry/short-7');
 // the customers' accounts and a statement (2026-11-12), made-up customers; names and item names stay as they are
 await page.evaluate(()=>{const d=new Date(),p=n=>String(n).padStart(2,'0'),at=(x,h)=>`${x.getFullYear()}-${p(x.getMonth()+1)}-${p(x.getDate())}T${p(h)}:05:00`,old=new Date(Date.now()-40*864e5);
  window.__tables.ar_customers=[{id:5,name:'عميل تجربة',credit_limit:1000,balance:5400.25,last_at:at(d,11),last_kind:'sale'},{id:6,name:'NEAR',credit_limit:10000,balance:9500,last_at:at(old,10),last_kind:'payment'},{id:7,name:'CREDIT',credit_limit:0,balance:-300,last_at:null,last_kind:null},{id:8,name:'ZERO',credit_limit:10000,balance:0.2,last_at:at(old,9),last_kind:'refund'}];
  window.__tables.ar_customer_moves=[{id:11,customer_id:5,at:at(d,9),kind:'sale',total:90,paid:50,balance:5450.25,items:[{n:'PANADOL',p:1,u:2,k:3,s:60,d:0},{n:'لزق جروح',p:5,u:0,k:1,s:0.5,d:0},{n:'C',p:1,u:0,k:1,s:1,d:0}]},{id:12,customer_id:5,at:at(d,10),kind:'return',total:-50,paid:0,balance:5400.25,items:[{n:'X',p:1,u:0,k:1,s:50,d:0}]},{id:13,customer_id:5,at:at(old,10),kind:'payment',total:0,paid:500,balance:5379.75,items:null},{id:-14,customer_id:5,at:at(old,9),kind:'refund',total:0,paid:-20,balance:5879.75,items:null}];
  window.__tables.ar_cash_accounts=[{id:1,name:'درج خزينة النقدية',type:0,balance:2150,last_at:at(d,9)},{id:2,name:'الخزينة الرئيسية',type:0,balance:-580.5,last_at:null}];
  window.__tables.ar_cash_moves=[{id:-1,account_id:1,at:at(d,9),op:1,kind:'sales',amount:700,n:12},{id:10,account_id:1,at:at(d,8),op:2,kind:'customer',amount:150,who:'أحمد'},{id:11,account_id:1,at:at(old,8),op:1002,kind:'expense',amount:-50,who:'فواتير كهرباة',memo:'كهربا'},{id:12,account_id:1,at:at(old,7),op:5,kind:'drawer_out',amount:-90},{id:13,account_id:1,at:at(old,6),op:52,kind:'transfer_out',amount:-10,who:'احتياطى'},{id:14,account_id:1,at:at(old,5),op:9,kind:'vendor',amount:-5,who:'مخزن'},{id:15,account_id:1,at:at(old,4),op:51,kind:'other_out',amount:-1},{id:16,account_id:1,at:at(old,3),op:50,kind:'other_in',amount:1},{id:17,account_id:1,at:at(old,2),op:53,kind:'transfer_in',amount:2,who:'احتياطى'},{id:18,account_id:1,at:at(old,1),op:6,kind:'drawer_in',amount:3}];
  window.__tables.ar_customer_phones=[{customer_id:5,phone:'201012345678',contact_name:'TEST',last_sent_at:new Date(Date.now()-864e5).toISOString(),last_sent_from:null}]});
 await go('[data-group="accounts"]');await page.waitForTimeout(400);for(const v of ['over','owing','prepaid','all'])await go(`#cuChips [data-cu-view="${v}"]`);await scan('customers');
 await page.fill('#cuQ','zzz');await page.waitForTimeout(200);await scan('customers/search');await go('#cuClear');
 await go('#cuRows [data-cu="5"]');await page.waitForTimeout(400);await go('[data-cu-items="11"]');await scan('statement');
 // its WhatsApp number and the send box (2026-11-12); the message itself is for the customer, in Arabic (a textarea)
 await go('[data-cu-send]');await page.waitForTimeout(500);await scan('send');
 await go('[data-cu-make]');await page.waitForSelector('#cuMsg',{timeout:20000});await scan('send/ready');await go('[data-cu-send-close]');
 await go('[data-cu-phone-edit]');await page.fill('#cuPhoneIn','0101');await go('[data-cu-phone-save]');await scan('phone/edit');await go('[data-cu-phone-cancel]');
 for(const f of ['payments','sales'])await go(`[data-cu-filter="${f}"]`);await scan('statement/filters');await go('[data-cu-back]');await page.waitForTimeout(300);
 await go('#cuRows [data-cu="7"]');await page.waitForTimeout(400);await scan('statement/empty');await go('[data-cu-back]');await page.waitForTimeout(300);
 await go('[data-tab="vendors"]');await scan('accounts');await go('[data-tab="cash"]');await page.waitForTimeout(400);await scan('cash');await go('#csList [data-cs-open="1"]');await page.waitForTimeout(300);await scan('cash/statement');for(const f of ['in','out','sales','transfer','expense'])await go(`#csStatement [data-cs-filter="${f}"]`);await scan('cash/filters');await go('#csStatement [data-cs-back]');await go('[data-tab="ops"]');await page.waitForTimeout(300);await scan('ops');
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
