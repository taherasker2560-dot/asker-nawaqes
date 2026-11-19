// «الشكل الهادي» of the system (owner 2026-11-19 night, the look session; ar/airy.css, mockups/home_airy_2026-11-19_sky.png: «هختار اللبني وعاوزك تمشي النمط ده حالا في كل تفاصيل المشروع»).
// It replaced «ألوان الأقسام» of the same day (five colored bar segments, filled buttons: «خنيق، مكلكح ومرزق»): the bar is white with a light pill behind the page you are on, and the home's quick
// buttons are SOFT rounded rectangles (a light tint of the system color, deeper for the more important section: purchases, accounts, home, sales, care), a thin line, the words in ink,
// the icon in the color, and a small white mark on the top edge = the section's own icon of the bottom bar (a work app is white with a thicker line); a different system color changes
// them all; the night look keeps its dark surfaces. Colors are read through a canvas (a browser answers color-mix() as color(srgb …) or oklab(…)): plain [r,g,b].
const {run,assert}=require('./harness.cjs');
const ready=(page)=>page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
const RGB=()=>{window.__rgb=(s)=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d',{willReadFrequently:true});x.clearRect(0,0,1,1);x.fillStyle='#000';x.fillStyle=s;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3)}};
const lum=([r,g,b])=>0.2126*r+0.7152*g+0.0722*b;
const same=(a,b,m)=>assert.ok(a.every((v,i)=>Math.abs(v-b[i])<=2),`${m}: ${a} vs ${b}`);
const rl=(c)=>{const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])};
const contrast=(a,b)=>{const x=rl(a),y=rl(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
// no color is read in the middle of a transition
const still=async(page)=>{await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});await page.waitForTimeout(150)};
const ORDER=['purchases','accounts','home','sales','care']; // the deepest tint first
const barIcons=(page)=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.bottomnav button[data-group]')].map(b=>[b.dataset.group,b.querySelector('svg path').getAttribute('d')])));

run('airy look: a white header and bar, a light pill behind the page you are on, no colored segments; the greeting is a light tint',async({page})=>{
 await page.addInitScript(RGB);await page.reload();await ready(page);await still(page);
 const own=await page.evaluate(()=>window.__rgb(getComputedStyle(document.documentElement).getPropertyValue('--crimson').trim()));
 same(own,[33,123,171],'the calm sky blue by default');
 const x=await page.evaluate(()=>{const cs=(e)=>getComputedStyle(e),hd=document.querySelector('.appbar'),nav=document.querySelector('.bottomnav'),bs=[...nav.querySelectorAll('button[data-group]')],on=nav.querySelector('button:not(.secondary)'),off=nav.querySelector('button.secondary'),hero=document.querySelector('.hero'),h2=document.querySelector('.hero h2'),link=document.querySelector('.hero-link');
  return {hd:window.__rgb(cs(hd).backgroundColor),hdTitle:window.__rgb(cs(hd.querySelector('h1')).color),nav:window.__rgb(cs(nav).backgroundColor),segs:bs.map(b=>cs(b).backgroundColor),onGroup:on.dataset.group,onSvg:window.__rgb(cs(on.querySelector('svg')).backgroundColor),onSvgColor:window.__rgb(cs(on.querySelector('svg')).color),onText:window.__rgb(cs(on).color),offSvgBg:cs(off.querySelector('svg')).backgroundColor,offText:window.__rgb(cs(off).color),hero:window.__rgb(cs(hero).backgroundColor),heroR:cs(hero).borderTopLeftRadius,h2:window.__rgb(cs(h2).color),link:window.__rgb(cs(link).color),linkBg:window.__rgb(cs(link).backgroundColor)}});
 same(x.hd,[255,255,255],'the header is white');
 assert.ok(contrast(x.hdTitle,x.hd)>=7,'the name reads on it');
 same(x.nav,[255,255,255],'the bar is white');
 assert.ok(x.segs.every(c=>c==='rgba(0, 0, 0, 0)'),'no colored segments in the bar: '+x.segs.join(' | '));
 assert.equal(x.onGroup,'home');
 assert.ok(lum(x.onSvg)>230&&lum(x.onSvg)<255,'a light pill behind the page you are on: '+x.onSvg);
 same(x.onSvgColor,own,'its icon in the color');
 assert.ok(contrast(x.onText,[255,255,255])>=4.5,'its words read');
 assert.equal(x.offSvgBg,'rgba(0, 0, 0, 0)','the other icons have no pill');
 assert.ok(contrast(x.offText,[255,255,255])>=4.5,'and quiet words that still read');
 assert.ok(lum(x.hero)>225&&lum(x.hero)<255,'the greeting is a very light tint: '+x.hero);assert.equal(x.heroR,'16px');
 assert.ok(contrast(x.h2,x.hero)>=7,'the greeting reads');
 same(x.linkBg,own,'«الموقع» is the one solid button of the greeting');assert.ok(contrast(x.link,x.linkBg)>=4.5,'and reads');
 // the section you open gets the pill
 await page.click('[data-group="accounts"]');await still(page);
 assert.equal(await page.evaluate(()=>document.querySelector('.bottomnav button:not(.secondary)').dataset.group),'accounts');
},{home:true});

run('airy look: the small tabs of a section keep the one-color brand (the chosen tab a light fill with the color)',async({page})=>{
 await page.addInitScript(RGB);await page.reload();await ready(page);await still(page);
 const own=await page.evaluate(()=>window.__rgb(getComputedStyle(document.documentElement).getPropertyValue('--crimson').trim()));
 for(const [g,tab] of [['purchases','short'],['accounts','customers'],['sales','storeorders']]){
  await page.click(`[data-group="${g}"]`);
  const x=await page.evaluate(([g])=>{const sb=document.querySelector(`.subbar[data-for="${g}"]`);const on=sb.querySelector('.chip.on');const cs=getComputedStyle(on);return {tab:on.dataset.tab,bg:window.__rgb(cs.backgroundColor),border:window.__rgb(cs.borderTopColor),color:window.__rgb(cs.color)}},[g]);
  assert.equal(x.tab,tab);
  same(x.border,own,`${g}: the chosen tab has a line in the color`);
  assert.ok(contrast(x.color,x.bg)>=4.5,`${g}: its words read`);
 }
},{home:true});

run('airy look: home buttons are SOFT rounded rectangles in a tint of the color (deeper = more important), with the section\'s mark; a work app is white with a thicker line; a drag copy keeps its look',async({page})=>{
 await page.addInitScript(RGB);
 await page.evaluate(()=>localStorage.setItem('asker-home-buttons',JSON.stringify(['short','customers','storeorders','care','notes','app_ibnsina','app_instapay','app_wab','app_drugeye'])));
 await page.reload();await ready(page);await still(page);
 const own=await page.evaluate(()=>window.__rgb(getComputedStyle(document.documentElement).getPropertyValue('--crimson').trim()));
 const icons=await barIcons(page);
 const info=await page.evaluate(()=>[...document.querySelectorAll('#homePanel .qa > button[data-qa]')].map(e=>{const cs=getComputedStyle(e),sv=getComputedStyle(e.querySelector('svg')),mk=e.querySelector('.qa-mk'),mcs=mk&&getComputedStyle(mk);return {qa:e.dataset.qa,sec:e.dataset.sec,app:!!e.dataset.app,img:cs.backgroundImage,bg:window.__rgb(cs.backgroundColor),bw:cs.borderTopWidth,bc:window.__rgb(cs.borderTopColor),radius:cs.borderTopLeftRadius,color:window.__rgb(cs.color),icon:window.__rgb(sv.color),mark:!!mk,markPath:mk&&mk.querySelector('path').getAttribute('d'),markBg:mk&&window.__rgb(mcs.backgroundColor),markW:mk&&mcs.width,markPos:mk&&mcs.position,markIcon:mk&&window.__rgb(getComputedStyle(mk.querySelector('svg')).color)}}));
 const want={short:'purchases',customers:'accounts',storeorders:'sales',care:'care',notes:'home',app_ibnsina:'purchases',app_instapay:'accounts',app_wab:'care',app_drugeye:'home'};
 for(const x of info){
  assert.equal(x.sec,want[x.qa],'the section of '+x.qa);
  assert.equal(x.radius,'14px',`${x.qa} is a rounded rectangle, not an oval: ${x.radius}`);
  assert.equal(x.img,'none','no gradient fill');
  same(x.icon,own,`the icon of ${x.qa} is in the color`);
  assert.ok(contrast(x.color,[255,255,255])>=7,`the words of ${x.qa} are ink`);
  if(x.app){ same(x.bg,[255,255,255],`the work app ${x.qa} is white`); assert.ok(parseFloat(x.bw)>=2,`with a thicker line: ${x.bw}`); }
  else { assert.equal(parseFloat(x.bw),1,`a thin line on ${x.qa}`); assert.ok(lum(x.bg)<=254.5,`${x.qa} has a tint, not plain white: ${x.bg}`); assert.ok(contrast(x.color,x.bg)>=7,`${x.qa} reads: ${contrast(x.color,x.bg).toFixed(2)}`); }
  // the section's mark: a small white badge on the button's top edge, the SAME icon as the section's button in the bottom bar
  assert.ok(x.mark,`${x.qa} has its section's mark`);
  assert.equal(x.markPath,icons[x.sec],`the mark of ${x.qa} is the bar's icon of ${x.sec}`);
  same(x.markBg,[255,255,255],`the mark of ${x.qa} is white`);same(x.markIcon,own,`and its icon in the color`);
  assert.equal(x.markW,'22px');assert.equal(x.markPos,'absolute');
 }
 // the tints keep the importance order (deeper = lower luminance: purchases, accounts, home, sales, care), each clearly lighter than the one before
 const Ls=['short','customers','notes','storeorders','care'].map(q=>lum(info.find(x=>x.qa===q).bg));
 for(let i=1;i<Ls.length;i++)assert.ok(Ls[i]>Ls[i-1]+1,'the tints get lighter in the importance order: '+Ls.map(v=>v.toFixed(1)));
 // the dragged copy keeps its look and its mark
 const c=async(sel)=>{const bb=await page.locator(sel).boundingBox();return {x:bb.x+bb.width/2,y:bb.y+bb.height/2}};
 const a=await c('#homePanel [data-qa="customers"]');
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.waitForTimeout(650);
 assert.equal(await page.$eval('.qa-ghost',e=>e.dataset.sec),'accounts','the copy keeps its section');
 same(await page.$eval('.qa-ghost',e=>window.__rgb(getComputedStyle(e).backgroundColor)),info.find(x=>x.qa==='customers').bg,'and its tint');
 assert.equal(await page.$$eval('.qa-ghost .qa-mk',n=>n.length),1,'and its mark');
 await page.mouse.up();
},{home:true});

run('airy look: a different system color changes the tints, the icons and the marks (same order); the night look keeps its dark surfaces',async({page})=>{
 await page.addInitScript(RGB);
 await page.evaluate(()=>localStorage.setItem('asker-home-buttons',JSON.stringify(['short','customers','notes','storeorders','care'])));
 await page.reload();await ready(page);await still(page);
 await page.evaluate(()=>document.documentElement.style.setProperty('--crimson','#2e7d32'));
 const g=await page.evaluate(()=>['short','customers','notes','storeorders','care'].map(q=>{const e=document.querySelector(`#homePanel [data-qa="${q}"]`),cs=getComputedStyle(e);return {bg:window.__rgb(cs.backgroundColor),icon:window.__rgb(getComputedStyle(e.querySelector('svg')).color),mark:window.__rgb(getComputedStyle(e.querySelector('.qa-mk svg')).color)}}));
 const L=g.map(x=>lum(x.bg));
 for(let i=1;i<L.length;i++)assert.ok(L[i]>L[i-1]+1,'still in order with a green system color: '+L.map(v=>v.toFixed(1)));
 for(const x of g){assert.ok(x.bg[1]>=x.bg[0]&&x.bg[1]>=x.bg[2],`the tint is a green now: ${x.bg}`);same(x.icon,[46,125,50],'the icon is the green');same(x.mark,[46,125,50],'the mark too')}
 // the night look: the bar and the page are dark, the buttons are dark tints, the marks are still there
 await page.evaluate(()=>{document.documentElement.style.removeProperty('--crimson');localStorage.setItem('asker-night','1')});
 await page.reload();await ready(page);await still(page);
 const n=await page.evaluate(()=>{const e=document.querySelector('#homePanel [data-qa="short"]');return {page:window.__rgb(getComputedStyle(document.body).backgroundColor),nav:window.__rgb(getComputedStyle(document.querySelector('.bottomnav')).backgroundColor),btn:window.__rgb(getComputedStyle(e).backgroundColor),mark:!!e.querySelector('.qa-mk'),hd:window.__rgb(getComputedStyle(document.querySelector('.appbar')).backgroundColor)}});
 assert.ok(lum(n.page)<60&&lum(n.nav)<60&&lum(n.hd)<80,'the page, the bar and the header are dark at night: '+JSON.stringify(n));
 assert.ok(lum(n.btn)<110,'a dark tint button at night: '+n.btn);assert.ok(n.mark);
},{home:true});
