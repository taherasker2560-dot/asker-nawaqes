// The bot's new look «كبسولة وموجة» (owner 2026-11-16: ar/capsule.css + ar/motion.js). Not only the text: the dark greeting and the pill numbers are
// readable (colour contrast, day and night), the wave hangs from the header, the bottom bar is a floating capsule whose pill follows the section,
// the numbers under the greeting count and end exactly as written, and «reduce motion» stops all of it. Made-up data only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
// WCAG contrast of two "rgb(r, g, b)" strings
const contrast=(a,b)=>{const lum=s=>{const [r,g,bl]=s.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*bl};const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const ready=page=>page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));

run('New look (bot): the wave, the dark greeting, the pill numbers, the floating bar whose pill follows the section — day',async({page})=>{
 // the motion forced on (a test-driven browser keeps the endless decorations still, so the other tests stay fast)
 await page.addInitScript(()=>{window.__askerMotion=true});
 await page.reload();
 await ready(page);
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('cap-still')),false);
 // «محتاج شغل» has a row: only to look at its style
 await page.evaluate(()=>{document.getElementById('todoCard').classList.remove('hidden');document.getElementById('todoList').innerHTML='<button type="button" class="todo-row" data-go="read"><b>23</b><span>جديد في الوارد</span></button>'});
 const look=await page.evaluate(()=>{const cs=(e,p)=>getComputedStyle(e,p),bar=document.querySelector('.appbar'),hero=document.querySelector('.hero'),nav=document.querySelector('.bottomnav'),b=document.querySelector('.todo-row b'),link=document.querySelector('.hero-link'),h2=document.querySelector('.hero h2');
  return {barBg:cs(bar).backgroundColor,barImg:cs(bar).backgroundImage,barRadius:cs(bar).borderBottomLeftRadius,wave:cs(bar,'::after').getPropertyValue('-webkit-mask-image')||cs(bar,'::after').getPropertyValue('mask-image'),waveAnim:cs(bar,'::after').animationName,
   hero:cs(hero).backgroundImage,float:cs(hero,'::before').animationName,h2:cs(h2).color,h2Font:cs(h2).fontFamily,link:cs(link).color,linkBg:cs(link).backgroundColor,
   navRadius:cs(nav).borderTopLeftRadius,navBottom:parseFloat(cs(nav).bottom),navBg:cs(nav).backgroundColor,navPos:cs(nav).position,
   pillBg:cs(b).backgroundColor,pillFg:cs(b).color,pillRadius:cs(b).borderTopLeftRadius,pillW:b.getBoundingClientRect().width,pillH:b.getBoundingClientRect().height,crimson:cs(document.documentElement).getPropertyValue('--crimson').trim()}});
 assert.equal(look.barImg,'none','a flat color header (no gradient)');
 assert.equal(look.barRadius,'0px');
 assert.match(look.wave,/data:image\/svg/,'the wave hangs from the header');
 assert.equal(look.waveAnim,'cap-wave');
 assert.match(look.hero,/rgb\(58, 32, 24\)/,'the dark greeting');
 assert.equal(look.float,'cap-float');
 assert.ok(contrast(look.h2,'rgb(58, 32, 24)')>=4.5);
 assert.match(look.h2Font,/Readex Pro/);
 assert.equal(look.navRadius,'999px','the bottom bar is a capsule');
 assert.ok(look.navBottom>=10,'and it floats above the edge');
 assert.equal(look.navBg,'rgb(58, 32, 24)');
 assert.equal(look.navPos,'fixed');
 assert.equal(look.pillRadius,'999px','the number in «محتاج شغل» is a pill');
 assert.ok(look.pillW>=40&&look.pillH>=40&&look.pillH<=42);
 assert.ok(contrast(look.pillFg,look.pillBg)>=4.5,'the number reads on its pill: '+look.pillFg+' on '+look.pillBg);
 assert.ok(contrast(look.link,look.linkBg)>=4.5,'«الموقع» reads on the greeting by day: '+look.link+' on '+look.linkBg);
 // the pill sits under the section you are in, and moves when you go to another
 const pill=()=>page.evaluate(()=>{const bar=document.querySelector('.bottomnav'),on=bar.querySelector('button:not(.secondary)'),b=bar.getBoundingClientRect(),a=on.getBoundingClientRect();
  return {x:parseFloat(bar.style.getPropertyValue('--ind-x')),w:parseFloat(bar.style.getPropertyValue('--ind-w')),o:bar.style.getPropertyValue('--ind-o'),wantX:a.left-b.left,wantW:a.width,g:on.dataset.group}});
 await page.waitForFunction(()=>document.documentElement.classList.contains('cap-ind'));
 let p=await pill();
 assert.equal(p.g,'home');assert.equal(p.o,'1');
 assert.ok(p.w>30&&Math.abs(p.x-p.wantX)<1&&Math.abs(p.w-p.wantW)<1,'the pill is under «الرئيسية»: '+JSON.stringify(p));
 await page.click('[data-group="accounts"]');
 await page.waitForFunction(()=>{const bar=document.querySelector('.bottomnav'),on=bar.querySelector('button:not(.secondary)');return on&&on.dataset.group==='accounts'&&Math.abs(parseFloat(bar.style.getPropertyValue('--ind-x'))-(on.getBoundingClientRect().left-bar.getBoundingClientRect().left))<1});
 p=await pill();
 assert.equal(p.g,'accounts');assert.ok(Math.abs(p.x-p.wantX)<1,'the pill moved to «الحسابات»');
 // the text of the page is untouched
 assert.match(await text(page,'.hero h2'),/صيدلية عسكر/);
},{home:true});

run('New look (bot): night — the greeting, its link, the bar and the pill numbers stay readable',async({page})=>{
 await ready(page);
 await page.evaluate(()=>localStorage.setItem('asker-night','1'));
 await page.reload();await ready(page);
 assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('night')));
 await page.evaluate(()=>{document.getElementById('todoCard').classList.remove('hidden');document.getElementById('todoList').innerHTML='<button type="button" class="todo-row" data-go="read"><b>23</b><span>جديد في الوارد</span></button>'});
 const n=await page.evaluate(()=>{const cs=e=>getComputedStyle(e),nav=document.querySelector('.bottomnav'),b=document.querySelector('.todo-row b'),link=document.querySelector('.hero-link'),h2=document.querySelector('.hero h2'),card=document.querySelector('#homePanel');
  return {nav:cs(nav).backgroundColor,pillBg:cs(b).backgroundColor,pillFg:cs(b).color,link:cs(link).color,linkBg:cs(link).backgroundColor,h2:cs(h2).color,card:cs(card).backgroundColor}});
 assert.equal(n.nav,'rgb(28, 14, 10)');
 assert.ok(contrast(n.pillFg,n.pillBg)>=4.5,'the number reads on its pill at night');
 assert.ok(contrast(n.h2,'rgb(58, 32, 24)')>=4.5);
 assert.ok(contrast(n.link,n.linkBg)>=4.5,'«الموقع» reads on the greeting at night: '+n.link+' on '+n.linkBg);
},{home:true});

run('New look (bot): the motion — the home rises once, the numbers count and end exactly as written; «reduce motion» stops it all',async({page})=>{
 await page.addInitScript(()=>{window.__askerMotion=true;window.__k=[];window.__sawFresh=false;document.addEventListener('DOMContentLoaded',()=>{
  const el=document.getElementById('kShort'),home=document.getElementById('homePanel');
  if(el)new MutationObserver(()=>window.__k.push(el.textContent)).observe(el,{childList:true,characterData:true,subtree:true});
  if(home)new MutationObserver(()=>{if(home.classList.contains('fresh'))window.__sawFresh=true}).observe(home,{attributes:true,attributeFilter:['class']})})});
 await page.reload();await ready(page);
 assert.equal(await page.evaluate(()=>window.__sawFresh),true,'the home\'s parts rise the first time it shows');
 await page.waitForTimeout(1500);
 const k=await page.evaluate(()=>({log:window.__k,final:document.getElementById('kShort').textContent,fresh:document.getElementById('homePanel').classList.contains('fresh')}));
 assert.ok(/^\d+$/.test(k.final),'the number ends as the page wrote it: '+k.final);
 assert.ok(k.log.includes(k.final),'and the log ends with it');
 assert.ok(k.log.every(s=>s==='—'||/^\d+$/.test(s)),'always a clean number, never a broken line: '+k.log.join(','));
 assert.equal(k.fresh,false,'«fresh» goes away (a later draw does not replay it)');
 // reduce motion: no rise, no wave, no float, no count
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.reload();await ready(page);
 const r=await page.evaluate(()=>{const cs=(e,p)=>getComputedStyle(e,p).animationName;return {fresh:document.getElementById('homePanel').classList.contains('fresh'),wave:cs(document.querySelector('.appbar'),'::after'),float:cs(document.querySelector('.hero'),'::before'),k:document.getElementById('kShort').textContent}});
 assert.equal(r.fresh,false);assert.equal(r.wave,'none');assert.equal(r.float,'none');assert.ok(/^\d+$/.test(r.k));
},{home:true});

// no navy anywhere: every colour on the screen (background, text, borders) that is a dark saturated blue is a failure (the owner refused it)
const navyScan=()=>{const out=[];for(const e of document.querySelectorAll('body *')){const r=e.getBoundingClientRect();if(!r.width||!r.height)continue;const cs=getComputedStyle(e);
 for(const p of ['backgroundColor','backgroundImage']){for(const m of (cs[p]||'').matchAll(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/g)){if(m[4]!==undefined&&parseFloat(m[4])<0.5)continue;
  const R=+m[1]/255,G=+m[2]/255,B=+m[3]/255,mx=Math.max(R,G,B),mn=Math.min(R,G,B),l=(mx+mn)/2;if(mx===mn)continue;const d=mx-mn,s=l>0.5?d/(2-mx-mn):d/(mx+mn);
  let h=mx===R?(G-B)/d+(G<B?6:0):mx===G?(B-R)/d+2:(R-G)/d+4;h*=60;
  if(h>=205&&h<=265&&s>=0.25&&l<=0.45)out.push((e.id?'#'+e.id:e.tagName.toLowerCase()+'.'+String(e.className).split(' ')[0])+' '+p+' '+m[0])}}}
 return out.slice(0,8)};

run('Dark color (bot): no navy anywhere on the home, four sets in ⚙️ (warm brown by default), kept after a reload',async({page})=>{
 await ready(page);
 await page.waitForTimeout(400);
 assert.deepEqual(await page.evaluate(navyScan),[],'no navy on the home');
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.dark),'warm');
 const bar=()=>page.evaluate(()=>getComputedStyle(document.querySelector('.bottomnav')).backgroundColor);
 assert.equal(await bar(),'rgb(58, 32, 24)','the warm brown by default');
 await page.click('#settingsBtn');
 assert.deepEqual(await page.$$eval('#darkPick [data-dark]',b=>b.map(x=>x.dataset.dark)),['warm','charcoal','teal','plum']);
 assert.equal(await page.$eval('#darkPick .on',b=>b.dataset.dark),'warm');
 assert.equal(await page.$eval('#darkPick .on',b=>b.textContent.trim()),'قهوة دافية');
 await page.click('#darkPick [data-dark="teal"]');
 assert.equal(await bar(),'rgb(15, 59, 61)','the bar follows the pick at once');
 assert.equal(await page.$eval('#darkPick .on',b=>b.dataset.dark),'teal');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker-dark')),'teal');
 const hero=await page.evaluate(()=>getComputedStyle(document.querySelector('.hero')).backgroundImage);
 assert.match(hero,/rgb\(15, 59, 61\)/,'the greeting too');
 await page.reload();await ready(page);
 assert.equal(await bar(),'rgb(15, 59, 61)','kept after a reload');
 // the night look keeps the set: its near-black
 await page.evaluate(()=>localStorage.setItem('asker-night','1'));
 await page.reload();await ready(page);
 assert.equal(await bar(),'rgb(6, 28, 29)');
 assert.deepEqual(await page.evaluate(navyScan),[],'no navy at night either');
},{home:true});