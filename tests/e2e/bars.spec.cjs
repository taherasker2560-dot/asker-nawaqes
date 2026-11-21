// The bars (owner 2026-11-21, the look session: «الهيدر ونافيجيشن بار بلون التطبيق الأساسي»، «البوتوم بنفس لون الأزرار الفاتح ماعدا الرئيسية في النص أزرق ومدوّر»، «٥ أزرار احتياطيين تحت الهيدر»،
// «الموجتين يمشوا مع بعض»، «Agza في آخر الصفحة»): the header is the system color with the wave closing its bottom edge, the bottom bar is the light tint with the same wave rising on its
// top edge, «الرئيسية» is a ROUND button in the middle, the owner has five spare buttons under the header (each empty or holding a section, kept on the phone; staff and customers have none), and
// «Agza» + a thin circle with tm sits at the END of every page. The same bars in the customers' site. Colors are read through a canvas.
const {run,assert}=require('./harness.cjs');
const ready=(page)=>page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
const RGB=()=>{window.__rgb=(s)=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d',{willReadFrequently:true});x.clearRect(0,0,1,1);x.fillStyle='#000';x.fillStyle=s;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3)}};
const same=(a,b,m)=>assert.ok(a.every((v,i)=>Math.abs(v-b[i])<=2),`${m}: ${a} vs ${b}`);
const still=async(page)=>{await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});await page.waitForTimeout(150)};
run('bars: the system\'s header is the color with the wave, the bar is the tint with the wave, «الرئيسية» is round in the middle, the signature ends the page',async({page})=>{
 await page.addInitScript(RGB);await page.reload();await ready(page);await still(page);
 const own=await page.evaluate(()=>window.__rgb(getComputedStyle(document.documentElement).getPropertyValue('--crimson').trim()));
 const x=await page.evaluate(()=>{const hd=document.querySelector('.appbar'),nav=document.querySelector('.bottomnav'),home=nav.querySelector('[data-group="home"]'),hs=getComputedStyle(home.querySelector('svg')),bs=[...nav.querySelectorAll('button')].map(b=>({g:b.dataset.group,x:b.getBoundingClientRect().left+b.getBoundingClientRect().width/2})).sort((a,b)=>b.x-a.x),vw=document.documentElement.clientWidth,hw=getComputedStyle(hd,'::after'),bw=getComputedStyle(nav,'::before');
  return {hd:window.__rgb(getComputedStyle(hd).backgroundColor),hdWave:hw.display+'|'+hw.maskImage+'|'+hw.webkitMaskImage,navWave:bw.display+'|'+(bw.maskImage||bw.webkitMaskImage),order:bs.map(b=>b.g),homeX:bs.find(b=>b.g==='home').x,vw,homeBg:window.__rgb(hs.backgroundColor),homeR:hs.borderTopLeftRadius,homeW:hs.width,homeColor:window.__rgb(hs.color),navBg:window.__rgb(getComputedStyle(nav).backgroundColor),theme:document.querySelector('meta[name="theme-color"]').content,sig:!!document.querySelector('main > .agza-sign:last-child')}});
 same(x.hd,own,'the header is the system color');
 assert.match(x.hdWave,/^block\|.*url/,'a wave closes the header: '+x.hdWave);assert.match(x.navWave,/^block\|.*url/,'the same wave rises on the bar: '+x.navWave);
 assert.deepEqual(x.order,['purchases','accounts','home','sales','care'],'the order of the bar from the right: «الرئيسية» in the middle');
 assert.ok(Math.abs(x.homeX-x.vw/2)<=2,'«الرئيسية» is in the middle of the screen: '+x.homeX+' of '+x.vw);
 assert.equal(x.homeR,'50%','a round button');assert.equal(parseFloat(x.homeW),54);same(x.homeBg,own,'in the system color');same(x.homeColor,[255,255,255],'with a white icon');
 assert.ok(x.navBg[0]>200&&x.navBg[2]>200&&x.navBg.some(v=>v<254),'the bar is the light tint of the color: '+x.navBg);
 assert.equal(x.theme,'#217bab','the phone\'s strips (status bar, the three Android buttons) take the system color');
 assert.ok(x.sig,'«Agza» ends the page content');
 const s=await page.evaluate(()=>{const e=document.querySelector('main > .agza-sign'),cs=getComputedStyle(e),b=getComputedStyle(e.querySelector('b'));return {txt:e.textContent,font:parseFloat(cs.fontSize),ff:cs.fontFamily,r:b.borderTopLeftRadius,bw:parseFloat(b.borderTopWidth),bg:b.backgroundColor,va:b.verticalAlign}});
 assert.equal(s.txt,'Agzatm','«Agza» alone, then tm');assert.ok(s.font<=12,'small: '+s.font);assert.match(s.ff,/Cormorant|Georgia|serif/);assert.equal(s.r,'50%');assert.ok(s.bw>0&&s.bw<=1,'a thin outline');assert.equal(s.bg,'rgba(0, 0, 0, 0)','empty center');assert.match(s.va,/px|super/,'above the letter\'s level: '+s.va);
},{home:true});

run('bars: five spare buttons under the owner\'s header: empty slots, picked from the sections, a tap opens, a long press changes, kept on the phone',async({page})=>{
 await ready(page);
 assert.equal(await page.$$eval('#spareBar .sp-slot',n=>n.length),5,'five slots');
 assert.equal(await page.$$eval('#spareBar .sp-slot.on',n=>n.length),0,'all empty at first');
 // an empty slot opens the picker; picking «الفواتير» fills it
 await page.click('#spareBar .sp-slot >> nth=2');assert.ok(await page.isVisible('#spSheet .qa-sheet-in'),'the picker opens');
 await page.click('#spSheet [data-sp-pick="docs"]');assert.ok(!(await page.isVisible('#spSheet .qa-sheet-in')),'and closes');
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('asker-spare-buttons'))),[null,null,'docs',null,null],'kept on the phone');
 assert.match(await page.textContent('#spareBar .sp-slot.on'),/الفواتير/);
 // a tap opens the section
 await page.click('#spareBar .sp-slot.on');await page.waitForSelector('#docsPanel',{state:'visible'});
 // after a reload it is still there, and a long press changes it
 await page.reload();await ready(page);
 assert.equal(await page.$$eval('#spareBar .sp-slot.on',n=>n.length),1,'still there after a reload');
 const b=await page.locator('#spareBar .sp-slot.on').boundingBox();
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
 assert.ok(await page.isVisible('#spSheet .qa-sheet-in'),'a long press opens the picker');
 await page.click('#spClear');assert.equal(await page.$$eval('#spareBar .sp-slot.on',n=>n.length),0,'«فضّي الخانة» empties it');
 // a staff phone has no row
 await page.evaluate(()=>document.documentElement.classList.add('staff'));
 assert.ok(!(await page.isVisible('#spareBar')),'staff do not see the spare row');
},{home:true});

run('bars: the customers\' site has the same bars: the header with the wave, the tinted bar with the round «الرئيسية» in the middle, the signature at the end',async({page,base})=>{
 await page.addInitScript(RGB);
 await page.goto('about:blank');await page.goto(base+'store.html');await page.waitForSelector('.tabbar a[data-go="home"]');await still(page);
 const x=await page.evaluate(()=>{const top=document.querySelector('[data-view="home"] .top'),nav=document.querySelector('.tabbar'),as=[...nav.querySelectorAll('a')].filter(a=>a.offsetParent!==null).map(a=>({g:a.dataset.go||'acct',x:a.getBoundingClientRect().left+a.getBoundingClientRect().width/2})).sort((a,b)=>b.x-a.x),home=nav.querySelector('[data-go="home"] svg'),hs=getComputedStyle(home),vw=document.documentElement.clientWidth,tw=getComputedStyle(top,'::after'),bw=getComputedStyle(nav,'::before');
  return {top:window.__rgb(getComputedStyle(top).backgroundColor),topWave:tw.display,navWave:bw.display,order:as.map(a=>a.g),homeX:as.find(a=>a.g==='home').x,vw,homeR:hs.borderTopLeftRadius,homeBg:window.__rgb(hs.backgroundColor),navBg:window.__rgb(getComputedStyle(nav).backgroundColor),theme:document.querySelector('meta[name="theme-color"]').content,sig:document.querySelector('.agza-sign')?.textContent,sigBeforeBar:!!document.querySelector('.agza-sign + .tabbar')}});
 same(x.top,[33,123,171],'the header is the color');assert.equal(x.topWave,'block','the wave closes the header');assert.equal(x.navWave,'block','the same wave rises on the bar');
 assert.deepEqual(x.order,['search','chat','home','orders','cart'],'the bar from the right: «الرئيسية» in the middle');
 assert.ok(Math.abs(x.homeX-x.vw/2)<=2,'«الرئيسية» in the middle of the screen: '+x.homeX+' of '+x.vw);
 assert.equal(x.homeR,'50%','round');same(x.homeBg,[33,123,171],'in the color');
 assert.ok(x.navBg[0]>200&&x.navBg.some(v=>v<254),'the bar is the light tint: '+x.navBg);
 assert.equal(x.theme,'#217bab','the phone\'s strips take the color');
 assert.equal(x.sig,'Agzatm','«Agza» and tm at the end of the page');assert.ok(x.sigBeforeBar,'right above the bottom bar');
 assert.equal(await page.$$eval('#spareBar',n=>n.length),0,'the spare buttons are for the system only');
},{home:true});

run('bars: the two rows at the top slide away when you scroll down and come back when you scroll up a little, at the top and when you tap the bar',async({page})=>{
 await ready(page);
 await page.evaluate(()=>{document.querySelector('main').style.paddingBottom='3000px'});
 const state=()=>page.evaluate(()=>({away:document.documentElement.classList.contains('bars-away'),tf:getComputedStyle(document.querySelector('.appbar')).transform,st:getComputedStyle(document.documentElement).getPropertyValue('--sticky-top').trim()}));
 let s=await state();assert.equal(s.away,false,'the rows are there at the top');assert.equal(s.tf,'none');
 await page.evaluate(()=>window.scrollTo(0,700));await page.waitForTimeout(450);
 s=await state();assert.equal(s.away,true,'scrolling down hides the two rows');assert.match(s.tf,/^matrix\(1, 0, 0, 1, 0, -\d+/,'they slid up: '+s.tf);assert.equal(s.st,'0px','the sticky tabs go up under the screen\'s edge');
 await page.evaluate(()=>window.scrollTo(0,650));await page.waitForTimeout(450);
 s=await state();assert.equal(s.away,false,'scrolling up a little brings them back');assert.equal(s.tf,'none');
 await page.evaluate(()=>window.scrollTo(0,1400));await page.waitForTimeout(450);assert.equal((await state()).away,true);
 await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(450);assert.equal((await state()).away,false,'at the top they are always there');
 await page.evaluate(()=>window.scrollTo(0,1400));await page.waitForTimeout(450);assert.equal((await state()).away,true);
 await page.evaluate(()=>document.querySelector('.bottomnav [data-group="accounts"]').click());await page.waitForTimeout(300);
 assert.equal((await state()).away,false,'a tap on the bottom bar brings them back');
},{home:true});

run('bars: three switches in the settings (the header, the five spare buttons, the bottom bar), each decides what hides while you scroll down; the phone remembers',async({page})=>{
 await ready(page);
 await page.evaluate(()=>{document.querySelector('main').style.paddingBottom='3000px'});
 const cls=()=>page.evaluate(()=>['hd-away','sp-away','bt-away'].filter(c=>document.documentElement.classList.contains(c)));
 const ty=(sel)=>page.evaluate((s)=>{const m=/matrix\(1, 0, 0, 1, 0, (-?[\d.]+)\)/.exec(getComputedStyle(document.querySelector(s)).transform);return m?parseFloat(m[1]):0},sel);
 const sw=(id,on)=>page.evaluate(([id,on])=>{const b=document.getElementById(id);b.checked=on;b.dispatchEvent(new Event('change',{bubbles:true}))},[id,on]);
 const st=()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--sticky-top').trim());
 assert.deepEqual(await page.evaluate(()=>['hideHead','hideSpare','hideBottom'].map(i=>document.getElementById(i).checked)),[true,true,false],'the header and the spare row hide by default, the bottom bar stays');
 const H=await page.evaluate(()=>document.querySelector('.appbar').offsetHeight);
 await page.evaluate(()=>window.scrollTo(0,800));await page.waitForTimeout(450);
 assert.deepEqual(await cls(),['hd-away','sp-away'],'by default the header and the spare row go');assert.equal(await ty('.bottomnav'),0,'the bottom bar stays');
 // the bottom bar's own switch: it goes down and out at once
 await sw('hideBottom',true);await page.waitForTimeout(350);
 assert.deepEqual(await cls(),['hd-away','sp-away','bt-away']);assert.ok((await ty('.bottomnav'))>60,'the bottom bar slid down');
 await sw('hideBottom',false);await page.waitForTimeout(350);assert.equal(await ty('.bottomnav'),0,'and comes back when its switch is off');
 // the header off, the spare row on: only the spare row slides (up by its own height)
 await sw('hideHead',false);await page.waitForTimeout(350);
 assert.deepEqual(await cls(),['sp-away']);assert.equal(Math.round(await ty('.appbar')),0,'the header stays where it is');assert.match(await page.evaluate(()=>getComputedStyle(document.querySelector('.appbar')).clipPath),/inset\(0px 0px 56px/,'the spare row\'s strip is cut off at the bottom');assert.equal(await st(),'calc('+H+'px - 56px)','the sticky tabs sit under the header only (the header\'s height minus the spare row\'s)');
 // the header on, the spare row off: the header slides up and the spare row stays at the top
 await sw('hideHead',true);await sw('hideSpare',false);await page.waitForTimeout(350);
 assert.deepEqual(await cls(),['hd-away']);assert.equal(Math.round(await ty('.appbar')),-(H-56),'the header slides out, the spare row stays');assert.equal(await st(),'56px','the sticky tabs sit under the spare row');
 // everything off: nothing hides
 await sw('hideHead',false);await page.waitForTimeout(350);
 assert.deepEqual(await cls(),[]);assert.equal(await ty('.appbar'),0);
 await page.evaluate(()=>window.scrollTo(0,1600));await page.waitForTimeout(450);assert.deepEqual(await cls(),[],'all off: scrolling down hides nothing');
 // the choices are kept on the phone
 assert.deepEqual(await page.evaluate(()=>['asker-hide-head','asker-hide-spare','asker-hide-bottom'].map(k=>localStorage.getItem(k))),['0','0','0']);
 await page.reload();await ready(page);
 assert.deepEqual(await page.evaluate(()=>['hideHead','hideSpare','hideBottom'].map(i=>document.getElementById(i).checked)),[false,false,false],'after a reload the switches show what he chose');
 // the first version's single switch still counts for the header and the spare row until the new ones are touched
 await page.evaluate(()=>{['asker-hide-head','asker-hide-spare','asker-hide-bottom'].forEach(k=>localStorage.removeItem(k));localStorage.setItem('asker-bars-hide','0')});
 await page.reload();await ready(page);
 assert.deepEqual(await page.evaluate(()=>['hideHead','hideSpare','hideBottom'].map(i=>document.getElementById(i).checked)),[false,false,false],'the old «off» is respected');
 await page.evaluate(()=>{localStorage.removeItem('asker-bars-hide')});
},{home:true});