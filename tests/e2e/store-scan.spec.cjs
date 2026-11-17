// «كرّر دواك بالباركود» (owner 2026-11-17): for EVERYONE on the store site (a customer with his link, a person with a site account, a visitor): three ways to put an
// item in the order: the camera reads the barcode on the pharmacy's sticker, or the number above it is typed, or the name. The camera here is a stand-in (this browser has
// no barcode reader): a canvas stream and a reader that returns what the test says is in front of it. Made-up items only.
const {run,text,assert}=require('./harness.cjs');
const ITEMS=[
 {id:1060,name:'PANADOL EXTRA 24 TAB',arabic_name:'بانادول إكسترا',status:'available',price:66.7,cat:'meds',needs_rx:false,is_listed:true},
 {id:4875,name:'CONCOR 5MG 30 TAB',arabic_name:null,status:'available',price:112,cat:'meds',needs_rx:false,is_listed:true},
 {id:63476,name:'FEMOGESAL TAB',arabic_name:null,status:'on_order',price:null,cat:'meds',needs_rx:false,is_listed:true},
 {id:7777,name:'RX ONLY ITEM 20 TAB',arabic_name:null,status:'available',price:50,cat:'meds',needs_rx:true,is_listed:true},
 {id:8888,name:'GONE ITEM 10 TAB',arabic_name:null,status:'unavailable',price:null,cat:'meds',needs_rx:false,is_listed:true},
];
const tok='c'.repeat(64);
const CUSTOMERS=[{id:101,name:'أحمد محمود',credit_limit:5000,balance:300,last_at:'2026-11-17T11:00:00',last_kind:'sale',moves:0}];
// a camera and a barcode reader that are not there in this browser: what is «in front of the camera» is window.__barcodes
const setup=(page,{reader=true,deny=false}={})=>page.addInitScript(([reader,deny])=>{
 window.__barcodes=[];window.__camStops=0;window.__camOpens=0;
 if(reader){window.BarcodeDetector=class{static async getSupportedFormats(){return ['code_128','itf','ean_13']}constructor(){}async detect(){return window.__barcodes.slice(0,1)}}}
 else delete window.BarcodeDetector;
 navigator.mediaDevices.getUserMedia=async()=>{
  if(deny)throw new DOMException('denied','NotAllowedError');
  window.__camOpens++;const c=document.createElement('canvas');c.width=640;c.height=360;c.getContext('2d').fillRect(0,0,640,360);
  const s=c.captureStream();s.getTracks().forEach(t=>{const st=t.stop.bind(t);t.stop=()=>{window.__camStops++;st()}});return s};
 navigator.mediaDevices.enumerateDevices=async()=>[{kind:'videoinput',label:'camera2 0, facing back',deviceId:'cam0'}];
},[reader,deny]);
const seed=(page,extra)=>page.evaluate(([items,extra])=>{localStorage.setItem('__fakeTables',JSON.stringify(Object.assign({ar_store_items:items,ar_store_edits:[]},extra||{})));localStorage.removeItem('asker_store_cart');localStorage.removeItem('asker_store_scan_mode');localStorage.removeItem('asker_store_customer')},[ITEMS,extra]);
const lines=(page)=>page.$$eval('#scanList .scan-line-row',r=>r.map(x=>[x.querySelector('h3').textContent.trim(),x.querySelector('.qty span').textContent.trim()]));
const msg=(page)=>text(page,'#scanMsg');

run('Scan by camera: a sticker in front of the camera adds the item once, a second box only after it leaves the view; an item that is not on the site, a prescription item and an «on order» item each say what they are',async({page,base})=>{
 await seed(page);await setup(page);
 await page.goto(base+'store.html#scan');
 await page.waitForSelector('[data-view="scan"]:not([hidden]) #scanCam:not([hidden])');
 assert.equal(await page.evaluate(()=>window.__camOpens>=1),true,'the camera opened (a second time when the phone\'s main back camera is another one)');
 assert.equal(await text(page,'#scanHint'),'وجّه الكاميرا على باركود الصيدلية، وثبّت الموبايل ثانية');
 assert.equal(await text(page,'.scan-intro'),'لو عايز تكرر أصناف: عدّي بس باركود الصيدلية الملزوق على الصنف، وهو ينزل لك في الفاتورة.');
 // the pharmacy's sticker in front of the camera: PANADOL (printed number 101060 = 100000 + code 1060)
 await page.evaluate(()=>{window.__barcodes=[{rawValue:'101060',format:'code_128'}]});
 await page.waitForFunction(()=>document.querySelectorAll('#scanList .scan-line-row').length===1,null,{timeout:8000});
 assert.deepEqual(await lines(page),[['PANADOL EXTRA 24 TAB','1']]);
 assert.equal(await msg(page),'اتضاف: بانادول إكسترا');
 assert.match(await text(page,'#scanList .scan-new'),/اتضاف دلوقتي/);
 assert.equal(await text(page,'#scanGo'),'كمّل الطلب · 1 صنف · 66.7 ج');
 // the same sticker still in view: counted once
 await page.waitForTimeout(1500);
 assert.deepEqual(await lines(page),[['PANADOL EXTRA 24 TAB','1']],'one sticker in view = one box');
 // it leaves the view (2 s), then comes back: one more box
 await page.evaluate(()=>{window.__barcodes=[]});
 await page.waitForTimeout(2300);
 await page.evaluate(()=>{window.__barcodes=[{rawValue:'101060',format:'code_128'}]});
 await page.waitForFunction(()=>document.querySelector('#scanList .qty span')&&document.querySelector('#scanList .qty span').textContent.trim()==='2',null,{timeout:8000});
 // a sticker of an item the site does not have: told once
 await page.evaluate(()=>{window.__barcodes=[{rawValue:'109999',format:'code_128'}]});
 await page.waitForFunction(()=>/مش على الموقع/.test(document.getElementById('scanMsg').textContent),null,{timeout:8000});
 assert.equal((await lines(page)).length,1);
 // a prescription item: it says so and does not go in
 await page.evaluate(()=>{window.__barcodes=[{rawValue:'107777',format:'code_128'}]});
 await page.waitForFunction(()=>/بالروشتة/.test(document.getElementById('scanMsg').textContent),null,{timeout:8000});
 assert.match(await msg(page),/^«RX ONLY ITEM 20 TAB» بالروشتة: ابعت صورة الروشتة من السلة\.$/);
 assert.equal((await lines(page)).length,1);
 // an item the pharmacy brings on order: it goes in, with the price «السعر يوم الطلب»
 await page.evaluate(()=>{window.__barcodes=[{rawValue:'163476',format:'code_128'}]});
 await page.waitForFunction(()=>document.querySelectorAll('#scanList .scan-line-row').length===2,null,{timeout:8000});
 assert.match(await text(page,'#scanList .scan-line-row:nth-child(2) .hint-sm'),/السعر يوم الطلب/);
 assert.equal(await text(page,'#scanGo'),'كمّل الطلب · 2 صنف');
 // a barcode that is not a sticker (a factory EAN on the box): told once, nothing added
 await page.evaluate(()=>{window.__barcodes=[{rawValue:'4006381333931',format:'ean_13'}]});
 await page.waitForFunction(()=>/ده مش رقم ملصق الصيدلية/.test(document.getElementById('scanMsg').textContent),null,{timeout:8000});
 assert.equal((await lines(page)).length,2);
 await page.evaluate(()=>{window.__barcodes=[]});
 // «كمّل الطلب»: the cart has what was scanned, ready to be paid for and sent
 await page.click('#scanGo');
 await page.waitForSelector('[data-view="cart"]:not([hidden]) #cartItems article');
 assert.equal(await page.$$eval('#cartItems article',a=>a.length),2);
 assert.equal(await page.evaluate(()=>window.__camStops>=1),true,'leaving the screen let the camera go');
},{home:true});

run('Scan by code and by name: the number above the barcode (Arabic digits too, or the item\'s own code), a bad one says so; the name finds items and only what can be ordered has «ضيف»; the list steps up and down',async({page,base})=>{
 await seed(page);await setup(page);
 await page.goto(base+'store.html#scan');
 await page.waitForSelector('[data-view="scan"]:not([hidden])');
 // the code
 await page.click('[data-scan-mode="code"]');
 await page.waitForSelector('#scanCodeForm:not([hidden])');
 assert.equal(await page.evaluate(()=>window.__camStops>=1),true,'the camera is let go when he types instead');
 assert.equal(await page.$eval('#scanCam',e=>e.hidden),true);
 await page.fill('#scanCode','104875');await page.click('#scanCodeForm button');
 await page.waitForFunction(()=>document.querySelectorAll('#scanList .scan-line-row').length===1);
 assert.deepEqual(await lines(page),[['CONCOR 5MG 30 TAB','1']]);
 assert.equal(await page.inputValue('#scanCode'),'','the box is empty for the next one');
 await page.fill('#scanCode','١٠٤٨٧٥');await page.press('#scanCode','Enter');
 await page.waitForFunction(()=>document.querySelector('#scanList .qty span').textContent.trim()==='2');
 await page.fill('#scanCode','4875');await page.click('#scanCodeForm button');
 await page.waitForFunction(()=>document.querySelector('#scanList .qty span').textContent.trim()==='3','the item\'s own code works too');
 await page.fill('#scanCode','abc');await page.click('#scanCodeForm button');
 assert.equal(await msg(page),'اكتب الرقم اللي فوق الباركود (6 أرقام) أو كود الصنف.');
 await page.fill('#scanCode','105555');await page.click('#scanCodeForm button');
 await page.waitForFunction(()=>/مش على الموقع/.test(document.getElementById('scanMsg').textContent));
 // the name
 await page.click('[data-scan-mode="name"]');
 await page.waitForSelector('#scanNameBox:not([hidden])');
 await page.fill('#scanName','panad');
 await page.waitForSelector('#scanHits .scan-hit');
 assert.deepEqual(await page.$$eval('#scanHits .scan-hit h3',h=>h.map(x=>x.textContent.trim())),['PANADOL EXTRA 24 TAB']);
 await page.click('#scanHits [data-scan-add="1060"]');
 await page.waitForFunction(()=>document.querySelectorAll('#scanList .scan-line-row').length===2);
 assert.equal(await page.inputValue('#scanName'),'');
 assert.equal(await page.$$eval('#scanHits .scan-hit',h=>h.length),0,'the hits close after a pick');
 // an item that cannot be ordered shows with no «ضيف»
 await page.fill('#scanName','item');
 await page.waitForSelector('#scanHits .scan-hit');
 assert.deepEqual(await page.$$eval('#scanHits .scan-hit',h=>h.map(x=>[x.querySelector('h3').textContent.trim(),!!x.querySelector('[data-scan-add]')]).sort()),[['GONE ITEM 10 TAB',false],['RX ONLY ITEM 20 TAB',false]]);
 await page.fill('#scanName','zzzz');
 await page.waitForFunction(()=>/مفيش حاجة بالاسم ده/.test(document.getElementById('scanHits').textContent));
 // the list: + and − (down to nothing)
 await page.click('#scanList [data-scan-step="1060"][data-d="1"]');
 assert.deepEqual(await lines(page),[['CONCOR 5MG 30 TAB','3'],['PANADOL EXTRA 24 TAB','2']]);
 await page.click('#scanList [data-scan-step="1060"][data-d="-1"]');await page.click('#scanList [data-scan-step="1060"][data-d="-1"]');
 assert.deepEqual(await lines(page),[['CONCOR 5MG 30 TAB','3']]);
 for(let i=0;i<3;i++)await page.click('#scanList [data-scan-step="4875"][data-d="-1"]');
 assert.match(await text(page,'#scanList'),/لسه ما ضفتش حاجة/);
 assert.equal(await page.$eval('#scanGo',e=>e.hidden),true);
 // his way is remembered
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_scan_mode')),'name');
},{home:true});

run('Scan: no barcode reader on the phone (an iPhone) = the camera way is not offered, the code opens; a camera that is refused falls back to the code with the reason; the entry points are on the home, in the cart and in a customer\'s account',async({page,base})=>{
 await seed(page);await setup(page,{reader:false});
 await page.goto(base+'store.html#scan');
 await page.waitForSelector('[data-view="scan"]:not([hidden]) #scanCodeForm:not([hidden])');
 assert.equal(await page.$eval('[data-scan-mode="cam"]',e=>e.hidden),true,'no camera way');
 assert.equal(await page.$eval('#scanCam',e=>e.hidden),true);
 assert.equal(await page.evaluate(()=>window.__camOpens),0);
 // a phone with a reader but the customer says no to the camera
 await page.evaluate(()=>localStorage.removeItem('asker_store_scan_mode'));
 await page.addInitScript(()=>{window.BarcodeDetector=class{static async getSupportedFormats(){return ['code_128']}constructor(){}async detect(){return []}};navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError')}});
 await page.goto(base+'store.html?x=2#scan');await page.reload();
 await page.waitForSelector('#scanCodeForm:not([hidden])');
 assert.match(await msg(page),/^الكاميرا ما اتفتحتش\. اسمح للموقع بالكاميرا/);
 // the way in: the home's card and the cart's link
 await page.goto(base+'store.html?x=3');await page.reload();
 await page.waitForSelector('[data-view="home"]:not([hidden]) #scanCard');
 assert.equal(await page.getAttribute('#scanCard','href'),'#scan');
 assert.equal(await text(page,'#scanCard strong'),'كرّر دواك بالباركود');
 await page.evaluate(()=>localStorage.setItem('asker_store_cart',JSON.stringify([{id:4875,name:'CONCOR 5MG 30 TAB',arabic_name:null,price:112,qty:1}])));
 await page.goto(base+'store.html?x=4#cart');await page.reload();
 await page.waitForSelector('[data-view="cart"]:not([hidden]) #cartScanLink');
 assert.equal(await page.getAttribute('#cartScanLink','href'),'#scan');
 // a customer with his link: the same, in his account (and what he scanned is in his cart)
 await page.evaluate(([c,t,items])=>{localStorage.setItem('__fakeTables',JSON.stringify({ar_customers:c,ar_customer_moves:[],ar_customer_phones:[],ar_customer_links:[{customer_id:101,token:t}],ar_customer_stops:[],ar_store_items:items,ar_store_edits:[]}))},[CUSTOMERS,tok,ITEMS]);
 await page.goto(base+'store.html?x=5#me='+tok);await page.reload();
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 assert.equal(await page.getAttribute('#acctBox .ac-scan','href'),'#scan');
 assert.equal(await text(page,'#acctBox .ac-scan'),'📷 كرّر دواك بالباركود');
 await page.evaluate(()=>{localStorage.removeItem('asker_store_customer');localStorage.removeItem('__fakeTables')});
},{home:true});
