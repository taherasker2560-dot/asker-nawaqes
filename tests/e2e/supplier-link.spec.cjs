// The supplier's personal link (owner 2026-11-19: «عايز ابعت لهم رابط للصفحة زيهم زي العملاء كده، يتثبت عندهم زي ابلكيشن … كشف حساب من
// يوم ما بدأت اشتغل معاهم … بالفواتير، بالأصناف، بصور الأصناف، بالمرتجعات، بالمدفوعات»). The owner sends the link from the supplier's
// statement; the supplier opens supplier.html#v=<secret>, sees only his own account with the items and pictures, and can install it.
// Made-up suppliers only: the repository is public.
const {run,assert}=require('./harness.cjs');
const text=(page,sel)=>page.$eval(sel,e=>e.innerText.replace(/\s+/g,' ').trim());
const pad=n=>String(n).padStart(2,'0');
const at=(daysAgo,h=12)=>{const d=new Date();d.setDate(d.getDate()-daysAgo);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(h)}:00:00`};
// 1060 has a picture in store/img/index.json, 102 has none
const ITEMS=[{id:1060,name:'PANADOL EXTRA 24 TAB',arabic_name:'بانادول اكسترا'},{id:102,name:'LICID 60CC LOTION',arabic_name:null}];
const VENDORS=[
 {id:2374,name:'A M group',short:'AMG',active:true,balance:3120,invoices:3,last_invoice_at:at(1),last_payment_at:at(3),last_payment:2000},
 {id:2278,name:'رضا عطية',short:'SKY',active:true,balance:900,invoices:1,last_invoice_at:at(30),last_payment_at:null,last_payment:null},
];
const MOVES=[
 {id:14,vendor_id:2374,at:at(1),kind:'purchase',code:'11/26/300',inv_date:null,amount:1100,total:1100,balance:3120,lines:[{i:1060,p:10,u:0,k:1,b:1,c:86,t:16,x:'2028-08-28'},{i:102,p:5,u:0,k:1,b:0,c:46,t:10,x:'2029-03-28'}]},
 {id:-500,vendor_id:2374,at:at(3),kind:'payment',code:null,inv_date:null,amount:-2000,total:null,balance:2020,lines:null},
 {id:12,vendor_id:2374,at:at(4),kind:'return',code:'~11/26/200',inv_date:null,amount:-180,total:-180,balance:4020,lines:[{i:102,p:5,u:0,k:1,b:0,c:36,t:10,x:'2026-12-28'}]},
 {id:11,vendor_id:2374,at:at(5),kind:'purchase',code:'11/26/200',inv_date:null,amount:1200,total:1200,balance:4200,lines:[{i:1060,p:12,u:0,k:1,b:0,c:84,t:18,x:'2028-06-28'}]},
 {id:5,vendor_id:2374,at:at(400),kind:'purchase',code:'10/25/100',inv_date:null,amount:3000,total:3000,balance:3000,lines:[{i:1060,p:30,u:0,k:1,b:0,c:80,t:15,x:'2027-06-28'}]},
 {id:9,vendor_id:2278,at:at(30),kind:'purchase',code:'10/26/900',inv_date:null,amount:900,total:900,balance:900,lines:[{i:102,p:12,u:0,k:1,b:0,c:82,t:19,x:'2028-05-28'}]},
];
const TOK='d'.repeat(64);
// a full load every time (going from supplier.html to supplier.html#v=… is only a change of the address, the page would not run again)
const open=async(page,url)=>{await page.goto('about:blank');await page.goto(url)};
const seed=(page,extra)=>page.evaluate(([v,m,i,t,x])=>{localStorage.setItem('__fakeTables',JSON.stringify(Object.assign({ar_vendors:v,ar_vendor_moves:m,ar_store_items:i,ar_store_edits:[],ar_vendor_links:[{vendor_id:2374,token:t,created_at:'2026-11-19T09:00:00Z',last_seen_at:null,seen_count:0}]},x||{})))},[VENDORS,MOVES,ITEMS,TOK,extra]);

run('Supplier link: the owner sends it from the supplier\'s statement, the same one again, a new one replaces it, a look is not an opening',async({page})=>{
 await page.evaluate(([v,m,i])=>{Object.assign(window.__tables,{ar_vendors:v,ar_vendor_moves:m,ar_store_items:i,ar_vendor_links:[]});window.__opened=[];window.open=(u)=>{window.__opened.push(u);return null}},[VENDORS,MOVES,ITEMS]);
 await page.click('[data-group="accounts"]');
 await page.click('.subbar[data-for="accounts"] [data-tab="vendors"]');
 await page.waitForSelector('#veRows .ve-row');
 await page.click('[data-ve-open="2374"]');
 await page.waitForSelector('#veStHead [data-ve-link-send]');
 assert.match(await text(page,'#veStHead .cu-link'),/لسه ما اتبعتلوش رابط/);
 assert.equal(await page.$('[data-ve-link-new]'),null,'no «رابط جديد» before the first link');
 // the first link: made on the server; WhatsApp opens on its chat list (no number is saved for a warehouse) with the link in the message
 await page.click('[data-ve-link-send]');
 await page.waitForFunction(()=>window.__opened.length===1);
 let opened=await page.evaluate(()=>window.__opened);
 assert.ok(opened[0].startsWith('https://wa.me/?text='),opened[0]);
 const msg=decodeURIComponent(opened[0].split('?text=')[1]);
 const m1=/supplier\.html#v=([0-9a-f]{64})\n/.exec(msg);
 assert.ok(m1,'the link is in the message: '+msg);
 assert.match(msg,/^أهلًا بحضرتكم 🌿\nده رابط كشف حساب شركة A M group عند صيدلية عسكر من أول تعامل:\n/);
 assert.match(msg,/الرابط ده للشركة بس، ما تبعتوهوش لحد\.$/);
 assert.deepEqual((await page.evaluate(()=>window.__tables.ar_vendor_links)).map(r=>[r.vendor_id,r.token]),[[2374,m1[1]]]);
 await page.waitForFunction(()=>/لسه ما فتحش رابطه/.test(document.querySelector('#veStHead .cu-link')?.textContent||''));
 assert.match(await text(page,'#veStHead .cu-link'),/اتفتحت محادثته في الواتس ومعاها رابطه/);
 // the same link again: no new secret
 await page.click('[data-ve-link-send]');
 opened=await page.evaluate(()=>window.__opened);
 assert.equal(opened.length,2);assert.ok(decodeURIComponent(opened[1]).includes('#v='+m1[1]));
 // «👁 شوف صفحته»: opens his page in a tab, nothing is sent to him
 // (the tab is opened inside the tap, empty, and then gets its address: two calls of window.open)
 await page.click('[data-ve-link-view]');
 await page.waitForFunction(()=>window.__opened.length===4);
 opened=await page.evaluate(()=>window.__opened);
 assert.equal(opened[2],'');assert.equal(opened[3].endsWith('supplier.html#v='+m1[1]),true);
 // «رابط جديد»: asks first, then a new secret (the old one stops)
 page.once('dialog',d=>{assert.match(d.message(),/الرابط القديم هيبطل/);d.accept()});
 await page.click('[data-ve-link-new]');
 await page.waitForFunction(()=>window.__opened.length===5);
 const t2=(await page.evaluate(()=>window.__tables.ar_vendor_links))[0].token;
 assert.notEqual(t2,m1[1]);assert.ok(decodeURIComponent((await page.evaluate(()=>window.__opened))[4]).includes('#v='+t2));
 // another supplier is a separate link
 await page.click('[data-ve-back]');await page.waitForSelector('#veListView:not(.hidden)');
 await page.click('[data-ve-open="2278"]');await page.waitForSelector('#veStHead [data-ve-link-send]');
 assert.match(await text(page,'#veStHead .cu-link'),/لسه ما اتبعتلوش رابط/);
},{home:true});

run('Supplier link: he opens it and sees only his own account: invoices with items and pictures, the return, the payment, the sums; it installs',async({page,base})=>{
 await seed(page);
 await open(page,base+'supplier.html#v='+TOK);
 await page.waitForSelector('#spBody:not([hidden]) .mv');
 assert.equal(await text(page,'#spTitle'),'كشف حساب A M group');
 assert.match(await text(page,'#spBal'),/مستحق لكم عندنا ?الرصيد الحالي ?3,120 ج/);
 // from the first dealing: all the sums with the opening and closing balance
 assert.match(await text(page,'#spSum'),/من أول تعامل \(.*\): فواتير 5,300 \(3\) · مرتجعات 180 \(1\) · مدفوعات 2,000 \(1\)/);
 assert.match(await text(page,'#spSum'),/رصيد أول الفترة 0 · آخرها 3,120/);
 // his moves only, newest first; the return shows its items at once, our «~» marker is not on his paper number
 assert.deepEqual(await page.$$eval('#spMoves .mv .tag',e=>e.map(x=>x.textContent)),['فاتورة','دفعة','مرتجع','فاتورة','فاتورة']);
 assert.deepEqual(await page.$$eval('#spMoves .mv .code',e=>e.map(x=>x.textContent)),['11/26/300','11/26/200','11/26/200','10/25/100']);
 const all=await text(page,'#spMoves');
 assert.doesNotMatch(all,/رضا|SKY|10\/26\/900|AMG|~/,'nothing of another supplier or of ours');
 assert.match(await text(page,'#spMoves .mv:nth-child(2)'),/دفعة ?دفعة على الحساب ?−2,000 ?.*الرصيد بعدها: مستحق لكم 2,020/);
 assert.match(await text(page,'#spMoves .mv:nth-child(3) .lines'),/LICID 60CC LOTION ?5 علبة · صافي العلبة 36 · خصم 10% · صلاحية 12\/2026 · 180/);
 assert.equal(await page.$$eval('#spMoves .mv:nth-child(1) .lines',x=>x.length),0,'an invoice opens on a tap');
 await page.click('[data-sp-move="14"]');
 const lines=await page.$$eval('[data-sp-move="14"] .it',r=>r.map(d=>d.innerText.replace(/\s+/g,' ').trim()));
 assert.match(lines[0],/PANADOL EXTRA 24 TAB ?بانادول اكسترا ?10 علبة \+ بونص 1 · صافي العلبة 86 · خصم 16% · صلاحية 08\/2028 · 860/);
 assert.match(lines[1],/LICID 60CC LOTION ?5 علبة · صافي العلبة 46 · خصم 10% · صلاحية 03\/2029 · 230/);
 // the store's picture of an item that has one; a plain icon for the one that has none
 assert.equal(await page.$$eval('[data-sp-move="14"] .it:nth-child(1) img',x=>x.length),1);
 assert.match(await page.$eval('[data-sp-move="14"] .it:nth-child(1) img',x=>x.getAttribute('src')),/^store\/img\/1060\.jpg$/);
 assert.equal(await page.$$eval('[data-sp-move="14"] .it:nth-child(2) img',x=>x.length),0);
 // the tabs
 await page.click('[data-sp-kind="return"]');
 await page.waitForFunction(()=>document.querySelectorAll('#spMoves .mv').length===1);
 await page.click('[data-sp-kind="payment"]');
 await page.waitForFunction(()=>document.querySelectorAll('#spMoves .mv').length===1&&/دفعة/.test(document.querySelector('#spMoves .tag').textContent));
 await page.click('[data-sp-kind=""]');
 await page.waitForFunction(()=>document.querySelectorAll('#spMoves .mv').length===5);
 // the dates: two days ago until today = only the newest invoice, and the sums are of that period
 await page.fill('#spFrom',at(2).slice(0,10));
 await page.waitForFunction(()=>document.querySelectorAll('#spMoves .mv').length===1);
 assert.match(await text(page,'#spSum'),/في الفترة دي: فواتير 1,100 \(1\) · مرتجعات 0 \(0\) · مدفوعات 0 \(0\)/);
 await page.fill('#spFrom','');
 await page.waitForFunction(()=>document.querySelectorAll('#spMoves .mv').length===5);
 // the secret stays on his phone, the page makes the app's own manifest (the icon opens on his statement)
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_vendor_link')),TOK);
 assert.equal(await page.evaluate(()=>document.querySelector('link[rel="manifest"]').href.startsWith('blob:')),true);
 const man=await page.evaluate(async()=>JSON.parse(await (await fetch(document.querySelector('link[rel="manifest"]').href)).text()));
 assert.equal(man.start_url.endsWith('supplier.html#v='+TOK),true);
 // install: no browser prompt in this test, so the written steps for his browser
 assert.equal(await page.isVisible('#spInstall'),true);
 await page.click('#spInstall');
 assert.match(await text(page,'#spGuide'),/تثبيت/);
 // the owner counted: he opened it once (the server saw the first page)
 assert.equal((await page.evaluate(()=>window.__tables.ar_vendor_links))[0].seen_count,1);
 // opening supplier.html again with no secret in the address: the phone remembers whose it is
 await open(page,base+'supplier.html');
 await page.waitForSelector('#spBody:not([hidden]) .mv');
 assert.equal(await text(page,'#spTitle'),'كشف حساب A M group');
});

run('Supplier link: a dead link, no link, the owner\'s own look, many moves (older + print)',async({page,base})=>{
 // a link that is not in the table: a clear sentence, and the phone forgets it
 await seed(page);
 await page.evaluate(()=>localStorage.setItem('asker_vendor_link','e'.repeat(64)));
 await open(page,base+'supplier.html');
 await page.waitForFunction(()=>/الرابط ده مبقاش شغال/.test(document.getElementById('spStatus').textContent));
 assert.equal(await page.isVisible('#spBody'),false);
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_vendor_link')),null);
 // no link at all
 await open(page,base+'supplier.html');
 await page.waitForFunction(()=>/افتحوا الرابط اللي بعتته لكم الصيدلية/.test(document.getElementById('spStatus').textContent));
 // the pharmacy's own phone (the bot is signed in there): a look only, not saved, not installed, not counted as the supplier opening it
 await page.evaluate(()=>localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{"x":1}'));
 await open(page,base+'supplier.html#v='+TOK);
 await page.waitForSelector('#spBody:not([hidden]) .mv');
 assert.equal(await page.isVisible('#spPreview'),true);
 assert.equal(await page.isVisible('#spInstall'),false);
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_vendor_link')),null);
 assert.equal((await page.evaluate(()=>window.__tables.ar_vendor_links))[0].seen_count,0);
 await page.evaluate(()=>localStorage.removeItem('sb-qwrzdjdgvanmhaicncuk-auth-token'));
 // many moves: 25 a page, «حركة أقدم» brings the rest, and print brings and opens everything first
 const many=[];for(let n=0;n<40;n++)many.push({id:1000+n,vendor_id:2374,at:at(10+n,9),kind:'purchase',code:'11/26/'+(100+n),inv_date:null,amount:10,total:10,balance:10*(n+1),lines:[{i:102,p:1,u:0,k:1,b:0,c:10,t:0,x:'2028-01-28'}]});
 await seed(page,{ar_vendor_moves:many});
 await open(page,base+'supplier.html#v='+TOK);
 await page.waitForSelector('#spBody:not([hidden]) .mv');
 assert.equal(await page.$$eval('#spMoves .mv',x=>x.length),25);
 assert.equal(await page.isVisible('#spMore'),true);
 await page.click('#spMore');
 await page.waitForFunction(()=>document.querySelectorAll('#spMoves .mv').length===40);
 assert.equal(await page.isVisible('#spMore'),false);
 await open(page,base+'supplier.html#v='+TOK);
 await page.waitForSelector('#spBody:not([hidden]) .mv');
 assert.equal(await page.$$eval('#spMoves .mv',x=>x.length),25);
 await page.evaluate(()=>{window.__printed=0;window.print=()=>{window.__printed++}});
 await page.click('#spPrint');
 await page.waitForFunction(()=>window.__printed===1);
 assert.equal(await page.$$eval('#spMoves .mv',x=>x.length),40);
 assert.equal(await page.$$eval('#spMoves .mv .lines',x=>x.length),40,'every invoice is open when printed');
});

// The quiet music on his page (owner 2026-11-19: «موسيقى بصوت هادي شويه، ضعيف وهادي، اهدى، حاجة ما تبقاش مزعجة وبس … مش عايز لا بيع ولا طلب الدواء ولا الكلام ده كله»).
// The sound engine and the audio element are small fakes that, like Chrome, refuse to start before a touch (as in store-music.spec.cjs): what is tested is OUR logic.
const AUDIO=()=>{
 let gesture=false;
 ['pointerdown','touchend','click','keydown'].forEach(n=>addEventListener(n,()=>{gesture=true},true));
 window.__audio={ramps:[],srcs:[],plays:0};window.__fetches=[];
 const f=window.fetch.bind(window);window.fetch=(...a)=>{window.__fetches.push(String(a[0]&&a[0].url||a[0]));return f(...a)};
 class P{constructor(v){this.value=v||0}setValueAtTime(v){this.value=v}linearRampToValueAtTime(v){window.__audio.ramps.push(v)}cancelScheduledValues(){}}
 window.AudioContext=class{constructor(){this.state='suspended';this.currentTime=0;this.destination={}}createGain(){return {connect(){},gain:new P(1)}}createMediaElementSource(){return {connect(){}}}
  resume(){if(!gesture)return new Promise(()=>{});if(this.state!=='running'){this.state='running';Promise.resolve().then(()=>this.onstatechange&&this.onstatechange())}return Promise.resolve()}
  suspend(){this.state='suspended';Promise.resolve().then(()=>this.onstatechange&&this.onstatechange());return Promise.resolve()}};
 window.Audio=class extends EventTarget{constructor(){super();this.paused=true;this._a={};this._src='';this._t=0}
  setAttribute(k,v){this._a[k]=v}getAttribute(k){return this._a[k]==null?null:this._a[k]}
  set src(v){this._src=v;window.__audio.srcs.push(v);Promise.resolve().then(()=>this.dispatchEvent(new Event('loadedmetadata')))}get src(){return this._src}
  set currentTime(v){this._t=v}get currentTime(){return this._t}
  play(){window.__audio.plays++;if(!gesture)return Promise.reject(new DOMException('needs a tap first','NotAllowedError'));if(this.paused){this.paused=false;Promise.resolve().then(()=>{this.dispatchEvent(new Event('play'));this.dispatchEvent(new Event('playing'))})}return Promise.resolve()}
  pause(){if(!this.paused){this.paused=true;Promise.resolve().then(()=>this.dispatchEvent(new Event('pause')))}}};
};
const SLOW=['07-dreamy.mp3','05-smooth.mp3','03-chill-pop.mp3','01-bossa.mp3'];
const sounding=page=>page.evaluate(()=>window.AskerStoreMusic&&window.AskerStoreMusic.sounding());
const lastRamp=page=>page.evaluate(()=>window.__audio.ramps[window.__audio.ramps.length-1]);

run('Supplier link: quiet calm music only — slow pieces, soft, no spoken advert, a button that stops it and is remembered, the owner\'s phone hears it too',async({page,base})=>{
 await seed(page);
 await page.addInitScript(AUDIO);
 await open(page,base+'supplier.html#v='+TOK);
 await page.waitForSelector('#spBody:not([hidden]) .mv');
 await page.waitForFunction(()=>window.AskerStoreMusic);
 assert.equal(await page.isVisible('.mus-btn'),true,'the quiet button is there');
 assert.equal(await sounding(page),false,'nothing before a touch (the browser would refuse)');
 // the first tap anywhere starts it: a slow piece, at about a third less than the store's level, and NO advert is even waiting
 await page.click('#spBal');
 await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 assert.equal(await lastRamp(page),0.11,'softer than the store (0.18)');
 const src=await page.evaluate(()=>window.__audio.srcs[0]);
 assert.ok(SLOW.some(f=>src.includes('store/music/'+f)),'one of the four slow pieces: '+src);
 assert.deepEqual(await page.evaluate(()=>window.AskerStoreMusic.promoState()),{armed:false,playing:false,done:false},'no spoken advert');
 await page.waitForTimeout(1500);
 assert.equal((await page.evaluate(()=>window.__fetches)).some(u=>/asker-dose/.test(u)),false,'the voice function is never asked');
 // the button stops it, and his own memory (not the store\'s) keeps it stopped
 await page.click('.mus-btn');
 await page.waitForFunction(()=>!window.AskerStoreMusic.sounding());
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_vendor_music_off')),'1');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_store_music_off')),null,'the store\'s memory is untouched');
 await open(page,base+'supplier.html#v='+TOK);
 await page.waitForSelector('#spBody:not([hidden]) .mv');await page.waitForFunction(()=>window.AskerStoreMusic);
 await page.click('#spBal');
 assert.equal(await sounding(page),false,'stopped once: it does not start by itself again');
 await page.click('.mus-btn');
 await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker_vendor_music_off')),null);
 // the pharmacy\'s own phone (the bot is signed in there) hears it too: it is his look at the page
 await page.evaluate(()=>localStorage.setItem('sb-qwrzdjdgvanmhaicncuk-auth-token','{"x":1}'));
 await open(page,base+'supplier.html#v='+TOK);
 await page.waitForSelector('#spBody:not([hidden]) .mv');await page.waitForFunction(()=>window.AskerStoreMusic);
 assert.equal(await page.isVisible('#spPreview'),true);
 assert.equal(await page.isVisible('.mus-btn'),true,'the owner hears what the supplier hears');
 await page.click('#spBal');
 await page.waitForFunction(()=>window.AskerStoreMusic.sounding());
 // the button is not printed and not in the way of the page's own buttons
 assert.equal(await page.$eval('.mus-btn',e=>getComputedStyle(e).position),'fixed');
});