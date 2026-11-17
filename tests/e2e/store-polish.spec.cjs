// The store's polish pass (owner 2026-11-17: «الموقع فيه اخطاء فى التقسيمات … حسّن التصاميم»): what was found by going through every screen.
// Search that finds «بنادول» (the name is «بانادول»), the sections that hold every item, the chat bar docked to the screen's bottom (a page that kept its entrance
// transform made it float mid-screen), the cart in the bottom bar, English item names and a − 1 + stepper, a price note that is not a headline.
// Made-up items and customers only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const ITEMS=[
 {id:1060,name:'PANADOL EXTRA 24 TAB',arabic_name:'بانادول إكسترا',status:'available',price:66.7,cat:'pain_fever',needs_rx:false,is_listed:true,popular_rank:1},
 {id:24564,name:'HERO BABY 2 MILK',arabic_name:'هيرو بيبي ٢ لبن',status:'available',price:284,cat:'baby',needs_rx:false,is_listed:true,popular_rank:2},
 {id:900,name:'بامبرز رقم 3 بالقطعه',arabic_name:'بامبرز رقم ٣ بالقطعه',status:'available',price:90,cat:'baby',needs_rx:false,is_listed:true,popular_rank:null},
 {id:901,name:'MYSTERY NEW 20 TAB',arabic_name:'ميستري نيو ٢٠ قرص',status:'available',price:45,cat:'unknown',needs_rx:false,is_listed:true,popular_rank:null},
 {id:902,name:'FRESH TOOTHPASTE 100 ML',arabic_name:'معجون اسنان فريش ١٠٠ مل',status:'available',price:30,cat:'other_non_drug',needs_rx:false,is_listed:true,popular_rank:null},
 {id:903,name:'ORDER ONLY 10 TAB',arabic_name:null,status:'on_order',price:null,cat:'pain_fever',needs_rx:false,is_listed:true,popular_rank:null},
];
const seed=(page,extra)=>page.evaluate(([items,extra])=>{localStorage.setItem('__fakeTables',JSON.stringify(Object.assign({ar_store_items:items,ar_store_edits:[]},extra||{})));localStorage.removeItem('asker_store_cart')},[ITEMS,extra]);
const names=(page)=>page.$$eval('#results .item h3',h=>h.map(x=>x.textContent.trim()));
const search=async(page,q)=>{await page.fill('#q',q);await page.waitForFunction(q=>{const n=document.getElementById('resNote').textContent;return n&&!/بيدوّر/.test(n)&&n.includes(q)},q,{timeout:8000})};

run('Search: a word spelled without the long vowel finds the name, a number matches both numeral forms, the closest results come when no item has every word, «حفاضات» finds the brands',async({page,base})=>{
 await seed(page);
 await page.goto(base+'store.html#search');
 await page.waitForSelector('#q');
 await search(page,'بنادول');
 assert.deepEqual(await names(page),['PANADOL EXTRA 24 TAB'],'«بنادول» finds «بانادول»');
 await search(page,'اكسترا');
 assert.deepEqual(await names(page),['PANADOL EXTRA 24 TAB']);
 await search(page,'بامبرز 3');
 assert.deepEqual(await names(page),['بامبرز رقم 3 بالقطعه'],'the number 3 is found as 3 or ٣');
 await search(page,'لبن اطفال');
 assert.match(await text(page,'#resNote'),/مفيش حاجة فيها كل كلماتك، دي أقرب نتايج لـ «لبن اطفال»/);
 assert.ok((await names(page)).includes('HERO BABY 2 MILK'),'no item has both words: the ones with any of them');
 await search(page,'حفاضات');
 assert.ok((await names(page)).includes('بامبرز رقم 3 بالقطعه'),'diapers are sold by brand');
});

run('Sections: the catalog\'s unclassified drugs sit in «أدوية» and the non-drug goods in «تجميل وعناية»',async({page,base})=>{
 await seed(page);
 await page.goto(base+'store.html');
 const open=async(name)=>{await page.evaluate(()=>{location.hash=''});await page.waitForSelector('#sections .sec');await page.evaluate(n=>[...document.querySelectorAll('#sections .sec')].find(a=>a.textContent.includes(n)).click(),name);await page.waitForFunction(n=>document.getElementById('resNote').textContent.includes(n),name,{timeout:8000});return names(page)};
 assert.ok((await open('أدوية')).includes('MYSTERY NEW 20 TAB'),'an unclassified drug is in the drugs section');
 assert.ok((await open('تجميل وعناية')).includes('FRESH TOOTHPASTE 100 ML'),'toothpaste is in care');
});

run('Chat: the message bar is docked to the screen\'s bottom, not to the page that carries it',async({page,base})=>{
 const TOK='d'.repeat(64);
 await page.evaluate(t=>localStorage.setItem('__fakeTables',JSON.stringify({ar_customers:[{id:101,name:'أحمد محمود',credit_limit:5000,balance:300,last_at:'2026-11-17T11:00:00',last_kind:'sale',moves:0}],ar_customer_moves:[],ar_customer_phones:[],ar_customer_links:[{customer_id:101,token:t}],ar_customer_stops:[],ar_store_orders:[],ar_store_items:[]})),TOK);
 await page.goto(base+'store.html#me='+TOK);
 await page.waitForSelector('[data-view="account"]:not([hidden]) .ac-bal');
 await page.evaluate(()=>{location.hash='#chat'});
 await page.waitForSelector('[data-view="chat"]:not([hidden]) .ch-bar');
 await page.waitForTimeout(700);// the page\'s entrance has ended
 const r=await page.evaluate(()=>{const b=document.querySelector('.ch-bar').getBoundingClientRect(),v=document.querySelector('[data-view="chat"]');return {bottom:Math.round(b.bottom),h:innerHeight,pos:getComputedStyle(document.querySelector('.ch-bar')).position,tr:getComputedStyle(v).transform}});
 assert.equal(r.pos,'fixed');
 assert.equal(r.tr,'none','a page that keeps a transform becomes the box its fixed children are placed in');
 assert.equal(r.bottom,r.h,'the bar sits on the screen\'s bottom edge');
});

run('The cart in the bottom bar: the count on the icon, the total in place of the word; − 1 + keeps its places; an item to order has a note, not a headline; no name repeated on a card without a photo',async({page,base})=>{
 await seed(page);
 await page.goto(base+'store.html');
 await page.waitForSelector('#popular .pcard .plus');
 await page.click('#popular .pcard .plus');
 await page.waitForSelector('#popular .stepper');
 const bar=await page.evaluate(()=>{const a=document.querySelector('.tabbar a[data-go="cart"]'),t=a.querySelector('.tl'),c=a.querySelector('.cart-tot'),n=a.querySelector('.cart-n');return {on:a.classList.contains('has-items'),label:getComputedStyle(t).display,total:c.textContent.trim(),totalShown:getComputedStyle(c).display,badge:n.textContent.trim(),badgePos:getComputedStyle(n).position,h:Math.round(document.querySelector('.tabbar').getBoundingClientRect().height)};});
 assert.equal(bar.on,true);assert.equal(bar.label,'none');assert.equal(bar.totalShown,'block');assert.match(bar.total,/66\.7/);assert.equal(bar.badge,'1');assert.equal(bar.badgePos,'absolute');
 assert.ok(bar.h<=76,'the bar keeps one row: '+bar.h);
 // an item to order: its price line is a note
 await page.evaluate(()=>{location.hash='#item=903'});
 await page.waitForSelector('#sheet:not([hidden]) #shPrice');
 const note=await page.evaluate(()=>({fs:parseFloat(getComputedStyle(document.getElementById('shPrice')).fontSize),t:document.getElementById('shPrice').textContent.trim()}));
 assert.equal(note.t,'السعر يتأكد معاك يوم الطلب');assert.ok(note.fs<=16,'a note, not a headline: '+note.fs+'px');
 // a card without a photo carries its icon only: its name is right next to it
 await page.evaluate(()=>{location.hash=''});
 const nm=await page.evaluate(()=>{const c=document.createElement('div');c.className='thumb card c-meds';c.innerHTML='<span class="cd-nm">X</span>';document.body.appendChild(c);return getComputedStyle(c.firstChild).display});
 assert.equal(nm,'none');
});

run('English: the cards carry the English names, the plus and minus keep their sides, the Arabic description says it is Arabic, and nothing else on the home is left in Arabic',async({page,base})=>{
 await seed(page);
 await page.addInitScript(()=>localStorage.setItem('asker-lang','en'));
 await page.goto(base+'store.html');
 await page.waitForSelector('#popular .pcard .pc-nm');
 assert.deepEqual(await page.$$eval('#popular .pc-nm',e=>e.map(x=>x.textContent.trim())),['PANADOL EXTRA 24 TAB','HERO BABY 2 MILK']);
 await page.click('#popular .pcard .plus');
 await page.waitForSelector('#popular .stepper');
 const sides=await page.evaluate(()=>{const b=[...document.querySelectorAll('#popular .stepper button')].map(x=>[x.textContent.trim(),x.getBoundingClientRect().left]);return b.sort((x,y)=>x[1]-y[1]).map(x=>x[0])});
 assert.deepEqual(sides,['−','+'],'minus on the left, plus on the right, as in English everywhere');
 const left=await page.evaluate(()=>{const AR=/[؀-ۿ]/,out=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){const p=n.parentElement;if(!p||p.closest('script,style,textarea,[translate="no"],.notr,[hidden]'))continue;if(!AR.test(n.nodeValue))continue;if(getComputedStyle(p).display==='none')continue;out.push(n.nodeValue.trim())}return out});
 assert.deepEqual(left,[],'no Arabic text left on the home in English');
 assert.equal(await page.evaluate(()=>document.documentElement.dir),'ltr');
});

run('A wide screen: the header and the footer reach the screen\'s edges, and the six section tiles sit in one row',async({page,base})=>{
 await seed(page);
 await page.setViewportSize({width:1400,height:900});
 await page.goto(base+'store.html');
 await page.waitForSelector('#sections .sec');
 const w=await page.evaluate(()=>{const t=getComputedStyle(document.querySelector('[data-view="home"] .top')),f=getComputedStyle(document.querySelector('.ft')),tiles=[...document.querySelectorAll('#sections .sec')].map(x=>Math.round(x.getBoundingClientRect().top));return {top:t.clipPath+' '+t.boxShadow,ft:f.clipPath+' '+f.boxShadow,rows:new Set(tiles).size,n:tiles.length}});
 assert.match(w.top,/inset\(0px -?\d+px\)/);assert.match(w.top,/rgb\(192, 82, 42\) 0px 0px 0px 1400px/,'the orange runs to both edges');
 assert.match(w.ft,/inset\(0px -?\d+px\)/);
 assert.equal(w.n,6);assert.equal(w.rows,1,'six tiles, one row');
});
