// «ألوان الأقسام» (owner 2026-11-19, mockups/section_colors_2026-11-19.png, «ا», and his words «الزراير ليها برواز برتقالي رفيع هتزود سمكه وتلونه»): the five sections of the bottom bar wear
// five shades of the system color, the deeper the more important (المشتريات, الحسابات, الرئيسية = the system's own color, المبيعات, خدمة العملاء); the small tabs of a section wear its shade;
// the home buttons keep their white tile but their border is THICK and in their section's shade (a work app over a light tint of it); a different system color changes all five;
// the night look keeps a stripe per section. Colors are read through a canvas (a browser answers color-mix() as color(srgb …) or oklab(…)): plain [r,g,b].
const {run,assert}=require('./harness.cjs');
const ready=(page)=>page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
const RGB=()=>{window.__rgb=(s)=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d',{willReadFrequently:true});x.clearRect(0,0,1,1);x.fillStyle='#000';x.fillStyle=s;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3)}};
const lum=([r,g,b])=>0.2126*r+0.7152*g+0.0722*b;
const same=(a,b,m)=>assert.ok(a.every((v,i)=>Math.abs(v-b[i])<=2),`${m}: ${a} vs ${b}`);
const bar=(page)=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.bottomnav button[data-group]')].map(b=>{const cs=getComputedStyle(b),sv=getComputedStyle(b.querySelector('svg'));return [b.dataset.group,{bg:window.__rgb(cs.backgroundColor),bgRaw:cs.backgroundColor,shadow:cs.boxShadow,svg:window.__rgb(sv.backgroundColor),svgRaw:sv.backgroundColor,svgColor:window.__rgb(sv.color)}]})));
const ORDER=['purchases','accounts','home','sales','care']; // the deepest first
// no color is read in the middle of a transition (the bar and the tiles fade over 0.2 s: a slow CI machine read «198,85,42» for the system color «192,82,42»)
const still=async(page)=>{await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});await page.waitForTimeout(150)};
run('section colors: five shades in the bar, deepest = most important; the system color is the middle one',async({page})=>{
 await page.addInitScript(RGB);await page.reload();await ready(page);await still(page);
 const b=await bar(page);
 assert.deepEqual(Object.keys(b).sort(),[...ORDER].sort());
 const L=ORDER.map(k=>lum(b[k].bg));
 for(let i=1;i<L.length;i++)assert.ok(L[i]>L[i-1]+6,`${ORDER[i]} is lighter than ${ORDER[i-1]}: ${L.map(x=>Math.round(x))}`);
 // الرئيسية = the system's own color
 const own=await page.evaluate(()=>window.__rgb(getComputedStyle(document.documentElement).getPropertyValue('--crimson').trim()));
 same(b.home.bg,own,'the home segment is the system color');
 // the bar is edge to edge: five segments side by side, no gaps
 const r=await page.evaluate(()=>{const n=document.querySelector('.bottomnav').getBoundingClientRect();return {w:n.width,parts:[...document.querySelectorAll('.bottomnav button[data-group]')].map(x=>x.getBoundingClientRect()).map(x=>[Math.round(x.left),Math.round(x.right)])}});
 const sorted=r.parts.slice().sort((a,c)=>a[0]-c[0]);
 for(let i=1;i<sorted.length;i++)assert.ok(Math.abs(sorted[i][0]-sorted[i-1][1])<=1,'no gap between segments: '+JSON.stringify(sorted));
 assert.ok(sorted[0][0]<=1&&sorted[4][1]>=r.w-1,'from edge to edge');
 // the chosen section's icon is a white pill in its own shade; the others are a soft white
 same(b.home.svg,[255,255,255],'the white pill');
 same(b.home.svgColor,own,'in its own shade');
 assert.match(b.purchases.svgRaw,/rgba\(255, 255, 255, 0\.\d+\)/,'the other sections: a soft white, not the white pill');
 // white text stays readable on the lightest shade
 const rl=(c)=>{const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])};
 const cr=1.05/(rl(b.care.bg)+0.05);
 assert.ok(cr>=2.8,'white on the lightest shade keeps a contrast of at least 2.8: '+cr.toFixed(2));
},{home:true});

run('section colors: the small tabs of a section and the section\'s bar segment wear the same shade',async({page})=>{
 await page.addInitScript(RGB);await page.reload();await ready(page);await still(page);
 const b=await bar(page);
 for(const [g,tab] of [['purchases','short'],['accounts','customers'],['sales','storeorders']]){
  await page.click(`[data-group="${g}"]`);
  const x=await page.evaluate(([g])=>{const sb=document.querySelector(`.subbar[data-for="${g}"]`);const on=sb.querySelector('.chip.on');const off=[...sb.querySelectorAll('.chip:not(.on):not(.qa-pin)')].find(c=>c.offsetParent!==null);const cs=getComputedStyle(on),co=getComputedStyle(off);return {on:window.__rgb(cs.backgroundColor),onColor:window.__rgb(cs.color),off:window.__rgb(co.borderTopColor),offColor:window.__rgb(co.color),offW:co.borderTopWidth,tab:on.dataset.tab}},[g]);
  assert.equal(x.tab,tab);
  same(x.on,b[g].bg,`${g}: the chosen tab is the section's shade`);
  same(x.off,b[g].bg,`${g}: the other tabs are outlined in it`);
  same(x.offColor,b[g].bg,`${g}: and their words`);
  assert.ok(parseFloat(x.offW)>=1,'an outline');
 }
 // «المشتريات» has three groups (نواقص / طلبيات / مخزون): the chosen one is its shade too
 await page.click('[data-group="purchases"]');
 same(await page.evaluate(()=>window.__rgb(getComputedStyle(document.querySelector('.subbar[data-for="purchases"] .pgroups button.on')).backgroundColor)),b.purchases.bg,'the chosen group of the purchases');
},{home:true});

run('section colors: home buttons keep the white tile with a THICK border in their section\'s shade; the work apps a light tint of it; a drag copy keeps its color',async({page})=>{
 await page.addInitScript(RGB);
 await page.evaluate(()=>localStorage.setItem('asker-home-buttons',JSON.stringify(['short','customers','storeorders','care','notes','app_ibnsina','app_instapay','app_wab','app_drugeye'])));
 await page.reload();await ready(page);await still(page);
 const b=await bar(page);
 const info=await page.evaluate(()=>[...document.querySelectorAll('#homePanel .qa > button[data-qa]')].map(e=>{const cs=getComputedStyle(e),sv=getComputedStyle(e.querySelector('svg'));return {qa:e.dataset.qa,sec:e.dataset.sec,app:!!e.dataset.app,img:cs.backgroundImage,bg:window.__rgb(cs.backgroundColor),bw:cs.borderTopWidth,bc:window.__rgb(cs.borderTopColor),color:window.__rgb(cs.color),icon:window.__rgb(sv.color)}}));
 const want={short:'purchases',customers:'accounts',storeorders:'sales',care:'care',notes:'home',app_ibnsina:'purchases',app_instapay:'accounts',app_wab:'care',app_drugeye:'home'};
 for(const x of info){
  assert.equal(x.sec,want[x.qa],'the section of '+x.qa);
  assert.ok(parseFloat(x.bw)>=3,`a thick border on ${x.qa}: ${x.bw}`);
  same(x.bc,b[x.sec].bg,`the border of ${x.qa} is its section's shade`);
  same(x.icon,b[x.sec].bg,`the icon of ${x.qa} too`);
  assert.equal(x.img,'none','no gradient fill: the white tile of the brand look stays');
  if(x.app)assert.ok(lum(x.bg)<250&&lum(x.bg)>200,`a work app is over a light tint of its shade: ${x.bg}`);
  else same(x.bg,[255,255,255],`${x.qa} is a white tile`);
  same(x.color,[29,27,25],`the words of ${x.qa} stay the ink color`);
 }
 // the shades of the sections keep the importance order on the buttons too (their borders)
 const Ls=['short','customers','notes','storeorders','care'].map(q=>lum(info.find(x=>x.qa===q).bc));
 for(let i=1;i<Ls.length;i++)assert.ok(Ls[i]>Ls[i-1]+6,'importance order on the buttons: '+Ls.map(Math.round));
 // the dragged copy keeps its section's color (it carries data-sec)
 const c=async(sel)=>{const bb=await page.locator(sel).boundingBox();return {x:bb.x+bb.width/2,y:bb.y+bb.height/2}};
 const a=await c('#homePanel [data-qa="customers"]');
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.waitForTimeout(650);
 assert.equal(await page.$eval('.qa-ghost',e=>e.dataset.sec),'accounts','the copy keeps its section');
 same(await page.$eval('.qa-ghost',e=>window.__rgb(getComputedStyle(e).borderTopColor)),b.accounts.bg,'and its border');
 await page.mouse.up();
},{home:true});

run('section colors: a different system color changes all five shades (they stay in the same order), and the night look keeps a stripe per section',async({page})=>{
 await page.addInitScript(RGB);await page.reload();await ready(page);await still(page);
 await page.evaluate(()=>document.documentElement.style.setProperty('--crimson','#2e7d32'));
 const g=await bar(page);
 const L=ORDER.map(k=>lum(g[k].bg));
 for(let i=1;i<L.length;i++)assert.ok(L[i]>L[i-1]+6,'still in order with a green system color: '+L.map(Math.round));
 for(const k of ORDER){const [r,gg,bb]=g[k].bg;assert.ok(gg>r&&gg>bb,`${k} is a green now: ${g[k].bg}`)}
 // the night look: the bar is dark, every section keeps a colored stripe on top
 await page.evaluate(()=>{document.documentElement.style.removeProperty('--crimson');document.documentElement.classList.add('night')});
 const n=await bar(page);
 for(const k of ORDER){assert.match(n[k].shadow,/inset/,`${k} has a stripe at night: ${n[k].shadow}`);assert.ok(lum(n[k].bg)<120,`${k}'s segment is dark at night: ${n[k].bgRaw}`)}
 assert.ok(n.purchases.shadow!==n.care.shadow,'the stripes differ by section');
 await page.evaluate(()=>document.documentElement.classList.remove('night'));
},{home:true});
