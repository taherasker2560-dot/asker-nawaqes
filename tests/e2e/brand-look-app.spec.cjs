// The bot's brand look (owner 2026-11-17: ar/brand.css over capsule.css; before it «كبسولة وموجة» of 11-16). Not only the text: a white page, no blessing strip
// (he had it taken off the site and the bot the same day), a flat white header with no wave, 2 px corners, the greeting in the soft green, white tiles for the sections, a docked flat bottom bar with the section you
// are in in the accent, no navy anywhere, the motion of ar/motion.js and «reduce motion». Made-up data only: the repository is public.
const {run,text,assert}=require('./harness.cjs');// WCAG contrast of two "rgb(r, g, b)" strings
const contrast=(a,b)=>{const lum=s=>{const [r,g,bl]=s.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*bl};const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const ready=page=>page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));

run('Brand look (bot): white page, no blessing strip, no wave, the soft green greeting, white section tiles, a docked flat bar — day',async({page})=>{
 await page.addInitScript(()=>{window.__askerMotion=true});
 await page.reload();
 await ready(page);
 await page.evaluate(()=>{document.getElementById('todoCard').classList.remove('hidden');document.getElementById('todoList').innerHTML='<button type="button" class="todo-row" data-go="read"><b>23</b><span>جديد في الوارد</span></button>'});
 const look=await page.evaluate(()=>{const cs=(e,p)=>getComputedStyle(e,p),bar=document.querySelector('.appbar'),hero=document.querySelector('.hero'),nav=document.querySelector('.bottomnav'),link=document.querySelector('.hero-link'),h2=document.querySelector('.hero h2'),qa=document.querySelector('.card.home .qa button'),on=nav.querySelector('button:not(.secondary)');
  return {body:cs(document.body).backgroundColor,bless:document.querySelectorAll('.bless').length,blessText:/اللهم صل|ﷺ/.test(document.body.textContent),barBg:cs(bar).backgroundColor,barRadius:cs(bar).borderBottomLeftRadius,wave:cs(bar,'::after').display,
   hero:cs(hero).backgroundColor,heroRadius:cs(hero).borderTopLeftRadius,h2:cs(h2).color,link:cs(link).color,linkBg:cs(link).backgroundColor,
   navBg:cs(nav).backgroundColor,navPos:cs(nav).position,navBottom:cs(nav).bottom,navRadius:cs(nav).borderTopLeftRadius,onGroup:on.dataset.group,onColor:cs(on).color,onBg:cs(on).backgroundColor,
   qaBg:cs(qa).backgroundColor,qaRadius:cs(qa).borderTopLeftRadius,qaColor:cs(qa).color,card:cs(document.querySelector('.card')).borderTopLeftRadius,accent:cs(document.documentElement).getPropertyValue('--crimson').trim(),meta:document.querySelector('meta[name="theme-color"]').content}});
 assert.equal(look.body,'rgb(255, 255, 255)','the page is white');
 assert.equal(look.bless,0,'no blessing strip in the bot (owner 2026-11-17: «شيل صلى عالنبى»)');
 assert.equal(look.blessText,false,'and no blessing text anywhere on the page');
 assert.equal(look.barBg,'rgb(192, 82, 42)','the header is the calm orange');
 assert.equal(look.barRadius,'0px');assert.equal(look.wave,'none','no wave');
 assert.equal(look.hero,'rgb(192, 82, 42)','the greeting in the calm orange (no aqua green)');
 assert.equal(look.heroRadius,'2px');
 assert.ok(contrast(look.h2,look.hero)>=4.5,'the greeting reads');
 assert.ok(contrast(look.link,look.linkBg)>=4.5,'«الموقع» reads on the greeting by day: '+look.link+' on '+look.linkBg);
 assert.equal(look.navBg,'rgb(255, 255, 255)');assert.equal(look.navPos,'fixed');assert.equal(look.navBottom,'0px','the bar is docked');
 assert.equal(look.navRadius,'0px','and flat');
 assert.equal(look.onGroup,'home');assert.equal(look.onBg,'rgba(0, 0, 0, 0)','the section you are in is not a filled pill');
 assert.ok(contrast(look.onColor,'rgb(255, 255, 255)')>=4.5,'and it reads in the accent: '+look.onColor);
 assert.equal(look.qaBg,'rgb(255, 255, 255)','white tiles for the sections');assert.equal(look.qaRadius,'999px','and they stay oval (owner 2026-11-17)');
 assert.equal(look.card,'2px');
 assert.equal(look.accent,'#c0522a','the calm orange by default');
 assert.equal(look.meta,'#c0522a');
 assert.match(await text(page,'.hero h2'),/صيدلية عسكر/);
 // the bar follows the section you open
 await page.click('[data-group="accounts"]');
 assert.equal(await page.evaluate(()=>document.querySelector('.bottomnav button:not(.secondary)').dataset.group),'accounts');
},{home:true});
run('Brand look (bot): night — the greeting, its link and the bar stay readable',async({page})=>{
 await ready(page);
 await page.evaluate(()=>localStorage.setItem('asker-night','1'));
 await page.reload();await ready(page);
 assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('night')));
 const n=await page.evaluate(()=>{const cs=e=>getComputedStyle(e),nav=document.querySelector('.bottomnav'),link=document.querySelector('.hero-link'),h2=document.querySelector('.hero h2'),hero=document.querySelector('.hero');
  return {nav:cs(nav).backgroundColor,link:cs(link).color,linkBg:cs(link).backgroundColor,h2:cs(h2).color,hero:cs(hero).backgroundColor,page:cs(document.body).backgroundColor}});
 assert.equal(n.nav,'rgb(58, 25, 13)');
 assert.ok(contrast(n.h2,n.hero)>=4.5,'the greeting reads at night');
 assert.ok(contrast(n.link,n.linkBg)>=4.5,'«الموقع» reads on the greeting at night: '+n.link+' on '+n.linkBg);
 assert.notEqual(n.page,'rgb(255, 255, 255)','the page is dark');
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

run('Brand look (bot): no navy anywhere on the home or at night; the calm orange is the default',async({page})=>{
 await ready(page);
 await page.waitForTimeout(400);
 assert.deepEqual(await page.evaluate(navyScan),[],'no navy on the home');
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.accent),'terra','the calm orange is the default');
 await page.evaluate(()=>localStorage.setItem('asker-night','1'));
 await page.reload();await ready(page);
 assert.deepEqual(await page.evaluate(navyScan),[],'no navy at night either');
},{home:true});
run('Other screens: the main action buttons are the bot\'s color (the yellow invoice button), the sale save is a capsule',async({page})=>{
 await ready(page);
 await page.click('[data-group="purchases"]');
 await page.evaluate(()=>document.querySelector('.subbar .chip[data-tab="docs"], [data-tab="docs"]').click());
 await page.waitForSelector('#dcPickLabel',{state:'visible'});
 const d=await page.evaluate(()=>{const probe=document.createElement('i');probe.style.background='var(--crimson)';document.body.appendChild(probe);const want=getComputedStyle(probe).backgroundColor;probe.remove();const cs=getComputedStyle(document.getElementById('dcPickLabel'));return {want,bg:cs.backgroundColor,r:cs.borderTopLeftRadius,fg:cs.color}});
 assert.equal(d.bg,d.want,'«صوّر فاتورة جديدة» is the bot\'s color, no longer yellow: '+d.bg);
 assert.equal(d.r,'999px','the buttons stay oval');
 assert.ok(contrast(d.fg,d.bg)>=4.5,'its text reads: '+d.fg+' on '+d.bg);
 assert.deepEqual(await page.evaluate(navyScan),[],'no navy on the invoices screen');
 await page.click('[data-group="sales"]');
 await page.evaluate(()=>document.querySelector('[data-tab="tempsale"]').click());
 await page.waitForSelector('.ts-save',{state:'visible'});
 assert.equal(await page.$eval('.ts-save',e=>getComputedStyle(e).borderTopLeftRadius),'999px');
},{home:true});