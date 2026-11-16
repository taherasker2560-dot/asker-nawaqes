// The store's new look «كبسولة وموجة» (owner 2026-11-16: store/capsule.css + store/motion.js). Not only the text: the dark (warm brown) balance card is readable
// (colour contrast, day and night), the wave closes the header, the bottom bar is a floating capsule whose pill follows the page, the balance
// counts and ends exactly as written, and «reduce motion» stops all of it. Made-up customers only: the repository is public.
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

run('New look: the account — a dark balance card that reads well, the wave on the header, a floating capsule bar whose pill follows the page',async({page,base})=>{
 await seed(page);
 await page.goto(base+'store.html#me='+TOK);
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 // the text is untouched (a test-driven browser shows the final numbers at once)
 assert.equal(await text(page,'.ac-big'),'عليك 7,174.50 ج');
 const look=await page.evaluate(()=>{const cs=(e,p)=>getComputedStyle(e,p),bal=document.querySelector('.ac-bal'),big=document.querySelector('.ac-big'),two=document.querySelector('.ac-two b'),
  top=document.querySelector('[data-view="account"] .top'),bar=document.querySelector('.tabbar');
  return {balBg:cs(bal).backgroundColor,balRadius:cs(bal).borderTopLeftRadius,big:cs(big).color,bigFont:cs(big).fontFamily,two:two?cs(two).color:'',
   wave:cs(top,'::after').getPropertyValue('-webkit-mask-image')||cs(top,'::after').getPropertyValue('mask-image'),topBg:cs(top).backgroundImage,topRadius:cs(top).borderBottomLeftRadius,
   barRadius:cs(bar).borderTopLeftRadius,barBottom:parseFloat(cs(bar).bottom),barBg:cs(bar).backgroundColor,pos:cs(bar).position,
   sheen:cs(bal,'::before').animationName}});
 assert.equal(look.balBg,'rgb(6, 111, 116)','the dark (aqua green, the picture\'s green) balance card');
 assert.equal(look.balRadius,'32px');
 assert.ok(contrast(look.big,look.balBg)>=3,'the big balance reads on the dark card (large text, 3:1): '+look.big);
 if(look.two)assert.ok(contrast(look.two,look.balBg)>=4.5,'the month numbers read: '+look.two);
 assert.match(look.bigFont,/Readex Pro/);
 assert.match(look.wave,/data:image\/svg/,'the wave closes the header');
 assert.equal(look.topBg,'none','a flat color header (no gradient)');
 assert.equal(look.topRadius,'0px');
 assert.equal(look.barRadius,'999px','the bottom bar is a capsule');
 assert.ok(look.barBottom>=10,'and it floats above the edge');
 assert.equal(look.barBg,'rgb(6, 111, 116)');
 assert.equal(look.pos,'fixed');
 assert.equal(look.sheen,'cap-sheen');
 // the pill sits under the page you are on, and moves when you go to another
 const pill=()=>page.evaluate(()=>{const bar=document.querySelector('.tabbar'),on=bar.querySelector('a.on:not([hidden])'),b=bar.getBoundingClientRect(),a=on.getBoundingClientRect();
  return {cap:document.documentElement.classList.contains('cap-ind'),x:parseFloat(bar.style.getPropertyValue('--ind-x')),w:parseFloat(bar.style.getPropertyValue('--ind-w')),o:bar.style.getPropertyValue('--ind-o'),wantX:a.left-b.left,wantW:a.width,go:on.dataset.go}});
 await page.waitForFunction(()=>document.documentElement.classList.contains('cap-ind'));
 let p=await pill();
 assert.equal(p.go,'account');assert.equal(p.o,'1');
 assert.ok(p.w>30&&Math.abs(p.x-p.wantX)<1&&Math.abs(p.w-p.wantW)<1,'the pill is under «حسابي»: '+JSON.stringify(p));
 await page.click('.tabbar a[data-go="search"]');
 await page.waitForFunction(()=>{const bar=document.querySelector('.tabbar'),on=bar.querySelector('a.on');return on&&on.dataset.go==='search'&&Math.abs(parseFloat(bar.style.getPropertyValue('--ind-x'))-(on.getBoundingClientRect().left-bar.getBoundingClientRect().left))<1});
 p=await pill();
 assert.equal(p.go,'search');assert.ok(Math.abs(p.x-p.wantX)<1,'the pill moved to «بحث»');
 // the home: a flat color header, a dark first slide, the wave
 await page.click('.tabbar a[data-go="home"]');
 await page.waitForSelector('[data-view="home"]:not([hidden]) .hero');
 const home=await page.evaluate(()=>{const cs=(e,p)=>getComputedStyle(e,p),h=document.querySelector('[data-view="home"] .top'),hero=document.querySelector('[data-view="home"] .hero');
  return {topImg:cs(h).backgroundImage,wave:cs(h,'::after').getPropertyValue('-webkit-mask-image')||cs(h,'::after').getPropertyValue('mask-image'),hero:cs(hero).backgroundImage,float:cs(hero,'::before').animationName}});
 assert.equal(home.topImg,'none');assert.match(home.wave,/data:image\/svg/);
 assert.match(home.hero,/rgb\(6, 111, 116\)/,'the dark slide');assert.equal(home.float,'cap-float');
},{home:true});

run('New look: night — the balance card and the bar stay readable',async({page,base})=>{
 await seed(page);
 await page.evaluate(()=>localStorage.setItem('asker-store-night','1'));
 await page.goto(base+'store.html#me='+TOK);
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('night')));
 const n=await page.evaluate(()=>{const cs=e=>getComputedStyle(e),bal=document.querySelector('.ac-bal'),big=document.querySelector('.ac-big'),bar=document.querySelector('.tabbar');
  return {bg:cs(bal).backgroundColor,big:cs(big).color,barBg:cs(bar).backgroundColor,page:cs(document.body).backgroundColor}});
 assert.equal(n.bg,'rgb(6, 111, 116)');assert.ok(contrast(n.big,n.bg)>=3,'the big balance reads on the night card: '+n.big+' on '+n.bg);assert.equal(n.barBg,'rgb(3, 41, 44)');
 assert.ok(contrast(n.bg,n.page)>1.05,'the card is told apart from the night page');
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

run('Dark color (site): aqua green (the picture\'s) by default, four sets and his own color in the look sheet, kept after a reload, «رجّع» takes it back; the bot\'s pick does not leak in',async({page,base})=>{
 await page.evaluate(()=>localStorage.setItem('asker-dark','warm')); // the bot's own choice on this phone
 await page.goto(base+'store.html?x=1');
 await page.waitForSelector('[data-view="home"]:not([hidden]) .hero');
 const bar=()=>page.evaluate(()=>getComputedStyle(document.querySelector('.tabbar')).backgroundColor);
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.dark),'teal','the site has its own pick, not the bot\'s');
 assert.equal(await bar(),'rgb(6, 111, 116)');
 await page.click('#themeBtn');
 assert.deepEqual(await page.$$eval('#storeDarkPick [data-dark]',b=>b.map(x=>x.dataset.dark)),['teal','warm','charcoal','plum']);
 await page.click('#storeDarkPick [data-dark="plum"]');
 assert.equal(await bar(),'rgb(58, 28, 51)');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker-store-dark')),'plum');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker-dark')),'warm','the bot\'s choice is not touched');
 await page.reload();
 await page.waitForSelector('[data-view="home"]:not([hidden]) .hero');
 assert.equal(await bar(),'rgb(58, 28, 51)','kept after a reload');
 // a color of his own: darkened until white text on it reads
 await page.click('#themeBtn');
 await page.$eval('#storeDarkCustom',e=>{e.value='#e0a030';e.dispatchEvent(new Event('input',{bubbles:true}))});
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.dark),'custom');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker-store-dark')),'c:#e0a030');
 assert.ok(contrast(await bar(),'rgb(255, 255, 255)')>=4.5,'white text reads on his own color: '+await bar());
 await page.click('#themeReset');
 assert.equal(await bar(),'rgb(6, 111, 116)','«رجّع لاختيار الصيدلية» brings the green back');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker-store-dark')),null);
},{home:true});