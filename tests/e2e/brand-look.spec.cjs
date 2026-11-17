// The store's brand look (owner 2026-11-17: store/brand.css over capsule.css; before it «كبسولة وموجة» of 11-16). Not only the text: white page, the blessing
// strip, a flat header with no wave, 2 px corners, a docked flat bottom bar, the calm orange by default and the soft green on small things, the balance on a
// quiet card that reads day and night; the motion of store/motion.js (the balance counts and ends exactly as written) and «reduce motion still hold.
// Made-up customers only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const pad=n=>String(n).padStart(2,'0');
const at=(d,h,m)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00`;
const today=new Date();
const CUSTOMERS=[{id:101,name:'أحمد محمود',credit_limit:5000,balance:7174.5,last_at:at(today,11,0),last_kind:'sale',moves:2}];
const MOVES=[
 {id:11,customer_id:101,at:at(today,9,0),kind:'sale',total:166.7,paid:0,balance:6966.7,items:[{n:'PANADOL EXTRA 24 TAB',p:1,u:0,k:1,s:66.7,d:0}]},
 {id:13,customer_id:101,at:at(today,11,0),kind:'sale',total:207.8,paid:0,balance:7174.5,items:[{n:'OMEZ 40 20 CAP',p:1,u:0,k:1,s:207.8,d:0}]},
];
const TOK='d'.repeat(64);
const seed=(page)=>page.evaluate(([c,m,t])=>{localStorage.setItem('__fakeTables',JSON.stringify({ar_customers:c,ar_customer_moves:m,ar_customer_phones:[],ar_customer_links:[{customer_id:101,token:t}],ar_customer_stops:[],ar_store_orders:[]}))},[CUSTOMERS,MOVES,TOK]);
// WCAG contrast of two "rgb(r, g, b)" strings
const contrast=(a,b)=>{const lum=s=>{const [r,g,bl]=s.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*bl};const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};

run('Brand look: the account — white page, the blessing strip, no wave, a quiet balance card, a docked flat bar, the calm orange and the soft green',async({page,base})=>{
 await seed(page);
 await page.goto(base+'store.html#me='+TOK);
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 // the text is untouched (a test-driven browser shows the final numbers at once)
 assert.equal(await text(page,'.ac-big'),'عليك 7,174.50 ج');
 const look=await page.evaluate(()=>{const cs=(e,p)=>getComputedStyle(e,p),bal=document.querySelector('.ac-bal'),big=document.querySelector('.ac-big'),
  top=document.querySelector('[data-view="account"] .top'),bar=document.querySelector('.tabbar'),order=document.querySelector('#acctBox .ac-order'),pay=document.querySelector('#acctBox .ac-paybtn');
  return {body:cs(document.body).backgroundColor,bless:document.querySelector('.bless').textContent.trim(),balBg:cs(bal).backgroundColor,balRadius:cs(bal).borderTopLeftRadius,big:cs(big).color,
   wave:cs(top,'::after').display,topBg:cs(top).backgroundColor,topRadius:cs(top).borderBottomLeftRadius,
   barPos:cs(bar).position,barBottom:cs(bar).bottom,barRadius:cs(bar).borderTopLeftRadius,barBg:cs(bar).backgroundColor,
   accent:cs(document.documentElement).getPropertyValue('--accent').trim(),orderBg:cs(order).backgroundColor,orderRadius:cs(order).borderTopLeftRadius,payBg:pay?cs(pay).backgroundColor:'',meta:document.querySelector('meta[name="theme-color"]').content}});
 assert.equal(look.body,'rgb(255, 255, 255)','the page is white');
 assert.equal(look.bless,'اللهم صل على النبي ﷺ');
 assert.equal(look.topBg,'rgb(255, 255, 255)','a white header');
 assert.equal(look.topRadius,'0px');
 assert.equal(look.wave,'none','no wave');
 assert.equal(look.balBg,'rgb(246, 244, 239)','a quiet balance card (no dark surface)');
 assert.equal(look.balRadius,'2px');
 assert.ok(contrast(look.big,look.balBg)>=4.5,'the big balance reads on the card: '+look.big);
 assert.equal(look.barPos,'fixed');assert.equal(look.barBottom,'0px','the bar is docked');
 assert.equal(look.barRadius,'0px','and flat');
 assert.equal(look.barBg,'rgb(255, 255, 255)');
 assert.equal(look.accent,'#c0522a','the calm orange by default (not the vivid one)');
 assert.ok(contrast(look.orderBg,'rgb(255, 255, 255)')>=4.5,'white text reads on the main button: '+look.orderBg);
 assert.equal(look.orderRadius,'2px');
 if(look.payBg){assert.equal(look.payBg,'rgb(47, 125, 104)','the soft green');assert.ok(contrast(look.payBg,'rgb(255, 255, 255)')>=4.5,'white reads on the green');}
 assert.equal(look.meta,'#ffffff','the phone\'s top bar is white');
 // the home: a quiet hero with the round logo, two tiles, three perks, the green footer with the hours
 await page.click('.tabbar a[data-go="home"]');
 await page.waitForSelector('[data-view="home"]:not([hidden]) .hero');
 const home=await page.evaluate(()=>{const cs=(e,p)=>getComputedStyle(e,p),hero=document.querySelector('[data-view="home"] .hero'),ft=document.querySelector('.ft');
  return {hero:cs(hero).backgroundColor,dir:cs(hero).flexDirection,radius:cs(hero).borderTopLeftRadius,badge:!!hero.querySelector('img.hero-badge'),tiles:document.querySelectorAll('.two-tiles .tile').length,perks:document.querySelectorAll('.trust li').length,
   secs:document.querySelectorAll('#sections .sec').length,ft:cs(ft).backgroundColor,hours:ft.textContent.replace(/\s+/g,' '),promo:!!document.querySelector('.promo')}});
 assert.equal(home.hero,'rgb(246, 244, 239)');assert.equal(home.dir,'row');assert.equal(home.radius,'2px');assert.ok(home.badge,'the round logo with 1981');
 assert.equal(home.tiles,2);assert.equal(home.perks,3);assert.equal(home.secs,6);assert.equal(home.promo,false);
 assert.equal(home.ft,'rgb(47, 125, 104)','the soft green closes the page');
 assert.match(home.hours,/كل يوم 9 ص – 12 بالليل/);assert.match(home.hours,/الجمعة 3 – 11 بالليل/);assert.match(home.hours,/اللهم صل على النبي ﷺ/);
},{home:true});
run('Brand look: night — the balance card, the bar and the footer stay readable',async({page,base})=>{
 await seed(page);
 await page.evaluate(()=>localStorage.setItem('asker-store-night','1'));
 await page.goto(base+'store.html#me='+TOK);
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('night')));
 const n=await page.evaluate(()=>{const cs=e=>getComputedStyle(e),bal=document.querySelector('.ac-bal'),big=document.querySelector('.ac-big'),bar=document.querySelector('.tabbar');
  return {bg:cs(bal).backgroundColor,big:cs(big).color,barBg:cs(bar).backgroundColor,page:cs(document.body).backgroundColor,ink:cs(document.body).color}});
 assert.ok(contrast(n.big,n.bg)>=3,'the big balance reads on the night card: '+n.big+' on '+n.bg);
 assert.ok(contrast(n.ink,n.page)>=4.5,'the text reads on the night page');
 assert.notEqual(n.page,'rgb(255, 255, 255)','the page is dark');
 assert.ok(contrast(n.barBg,n.page)<3,'the bar is part of the night page');
 await page.click('.tabbar a[data-go="home"]');
 await page.waitForSelector('[data-view="home"]:not([hidden]) .hero');
 const ft=await page.evaluate(()=>getComputedStyle(document.querySelector('.ft')).backgroundColor);
 assert.ok(contrast(ft,'rgb(255, 255, 255)')>=4.5,'the footer text reads at night: '+ft);
},{home:true});
run('New look: the motion — the balance counts and ends exactly as written, the cards rise once; «reduce motion» stops it all',async({page,base})=>{
 await seed(page);
 await page.addInitScript(()=>{window.__askerMotion=true});
 await page.goto(base+'store.html#me='+TOK);
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 assert.ok(await page.evaluate(()=>document.getElementById('acctBox').classList.contains('fresh')),'the cards rise the first time');
 const samples=await page.evaluate(()=>new Promise(ok=>{const out=[],t0=performance.now(),tick=()=>{const e=document.querySelector('.ac-big');out.push(e?e.textContent:'');performance.now()-t0<1500?setTimeout(tick,40):ok(out)};tick()}));
 const final='عليك 7,174.50 ج';
 assert.ok(new Set(samples).size>3,'the number changed while counting: '+samples.slice(0,6).join(' / '));
 assert.equal(samples[samples.length-1],final,'and ends exactly as the page wrote it');
 assert.ok(samples.every(s=>/^عليك [\d,.]+ ج$/.test(s)),'always a clean line, never a broken one');
 assert.ok(!(await page.evaluate(()=>document.getElementById('acctBox').classList.contains('fresh'))),'«fresh» goes away (a later draw does not replay it)');
 // a later draw (a filter) does not count again
 await page.click('[data-acct-filter="sales"]');
 assert.equal(await text(page,'.ac-big'),final);
 // reduce motion: no count, no rise, no wave, no sheen
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.reload();
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 assert.equal(await text(page,'.ac-big'),final);
 const r=await page.evaluate(()=>{const cs=(e,p)=>getComputedStyle(e,p).animationName;return {fresh:document.getElementById('acctBox').classList.contains('fresh'),sheen:cs(document.querySelector('.ac-bal'),'::before'),wave:cs(document.querySelector('[data-view="account"] .top'),'::after'),view:cs(document.querySelector('[data-view="account"]'))}});
 assert.equal(r.fresh,false);assert.equal(r.sheen,'none');assert.equal(r.wave,'none');assert.equal(r.view,'none');
},{home:true});

