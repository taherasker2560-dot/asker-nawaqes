// «ألوان الأقسام» (owner 2026-11-19, mockups/section_colors_2026-11-19.png, «ا»), second round the same night (his words «انا ما بحبش البني دي اصلا … بحب الأورنج الهادي»,
// «ألونها كاملة، مش هنعملها دواير», «الحاجة اللي خاصة بالمشتريات تبقى عليها علامة المشتريات»; mockups/home_B_section_marks_2026-11-19.png, «ب» + «برتقالي»):
// the five sections of the bottom bar wear five steps of the system color that never go DARKER than it (no brown): المشتريات = the system color itself, then الحسابات, الرئيسية,
// المبيعات, خدمة العملاء, each a little lighter (same hue); the words on a shade are white or near-black, whichever reads; the small tabs of a section wear its shade;
// the home buttons are FILLED with their section's shade (rounded rectangles, not ovals) and carry a small white mark = the section's own icon of the bar (a work app keeps a light tint
// with the thick border of the section it serves); a different system color changes all five; the night look keeps a stripe per section.
// Colors are read through a canvas (a browser answers color-mix() as color(srgb …) or oklab(…)): plain [r,g,b].
const {run,assert}=require('./harness.cjs');
const ready=(page)=>page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
const RGB=()=>{window.__rgb=(s)=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d',{willReadFrequently:true});x.clearRect(0,0,1,1);x.fillStyle='#000';x.fillStyle=s;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3)}};
const lum=([r,g,b])=>0.2126*r+0.7152*g+0.0722*b;
const same=(a,b,m)=>assert.ok(a.every((v,i)=>Math.abs(v-b[i])<=2),`${m}: ${a} vs ${b}`);
const rl=(c)=>{const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])};
const contrast=(a,b)=>{const x=rl(a),y=rl(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
const bar=(page)=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.bottomnav button[data-group]')].map(b=>{const cs=getComputedStyle(b),sv=getComputedStyle(b.querySelector('svg'));return [b.dataset.group,{bg:window.__rgb(cs.backgroundColor),bgRaw:cs.backgroundColor,fg:window.__rgb(cs.color),shadow:cs.boxShadow,svg:window.__rgb(sv.backgroundColor),svgRaw:sv.backgroundColor,svgColor:window.__rgb(sv.color),path:b.querySelector('svg path').getAttribute('d')}]})));
const ORDER=['purchases','accounts','home','sales','care']; // the system color first, then a little lighter each
// no color is read in the middle of a transition (the bar and the tiles fade over 0.2 s: a slow CI machine read «198,85,42» for the system color «192,82,42»)
const still=async(page)=>{await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});await page.waitForTimeout(150)};
run('section colors: five steps of the system color in the bar, never darker than it; المشتريات = the system color; the words on every step read',async({page})=>{
 await page.addInitScript(RGB);await page.reload();await ready(page);await still(page);
 const b=await bar(page);
 assert.deepEqual(Object.keys(b).sort(),[...ORDER].sort());
 const L=ORDER.map(k=>lum(b[k].bg));
 for(let i=1;i<L.length;i++)assert.ok(L[i]>L[i-1]+6,`${ORDER[i]} is lighter than ${ORDER[i-1]}: ${L.map(x=>Math.round(x))}`);
 // المشتريات = the system's own color, the strongest step: nothing is darker (no brown)
 const own=await page.evaluate(()=>window.__rgb(getComputedStyle(document.documentElement).getPropertyValue('--crimson').trim()));
 same(b.purchases.bg,own,'the purchases segment is the system color');
 // the steps are the SAME color: one hue (the red of each step leads, the blue is the least), only lighter
 for(const k of ORDER){const [r,g,bl]=b[k].bg;assert.ok(r>g&&g>bl,`${k} is still the orange: ${b[k].bg}`)}
 // the bar is edge to edge: five segments side by side, no gaps
 const r=await page.evaluate(()=>{const n=document.querySelector('.bottomnav').getBoundingClientRect();return {w:n.width,parts:[...document.querySelectorAll('.bottomnav button[data-group]')].map(x=>x.getBoundingClientRect()).map(x=>[Math.round(x.left),Math.round(x.right)])}});
 const sorted=r.parts.slice().sort((a,c)=>a[0]-c[0]);
 for(let i=1;i<sorted.length;i++)assert.ok(Math.abs(sorted[i][0]-sorted[i-1][1])<=1,'no gap between segments: '+JSON.stringify(sorted));
 assert.ok(sorted[0][0]<=1&&sorted[4][1]>=r.w-1,'from edge to edge');
 // the chosen section's icon is a white pill with the system color's icon; the others are a soft white
 same(b.home.svg,[255,255,255],'the white pill');
 same(b.home.svgColor,own,'in the system color');
 assert.match(b.purchases.svgRaw,/rgba\(255, 255, 255, 0\.\d+\)/,'the other sections: a soft white, not the white pill');
 // the words on every step read (white on the strong ones, near-black on the light ones): at least 3.9:1
 for(const k of ORDER)assert.ok(contrast(b[k].fg,b[k].bg)>=3.9,`the words on ${k} read: ${contrast(b[k].fg,b[k].bg).toFixed(2)}`);
 assert.ok(lum(b.purchases.fg)>200&&lum(b.care.fg)<80,'white on the strong end, near-black on the light end');
},{home:true});

run('section colors: the small tabs of a section and the section\'s bar segment wear the same shade',async({page})=>{
 await page.addInitScript(RGB);await page.reload();await ready(page);await still(page);
 const b=await bar(page);
 for(const [g,tab] of [['purchases','short'],['accounts','customers'],['sales','storeorders']]){
  await page.click(`[data-group="${g}"]`);
  const x=await page.evaluate(([g])=>{const sb=document.querySelector(`.subbar[data-for="${g}"]`);const on=sb.querySelector('.chip.on');const off=[...sb.querySelectorAll('.chip:not(.on):not(.qa-pin)')].find(c=>c.offsetParent!==null);const cs=getComputedStyle(on),co=getComputedStyle(off);return {on:window.__rgb(cs.backgroundColor),onColor:window.__rgb(cs.color),off:window.__rgb(co.borderTopColor),offColor:window.__rgb(co.color),offW:co.borderTopWidth,tab:on.dataset.tab}},[g]);
  assert.equal(x.tab,tab);
  same(x.on,b[g].bg,`${g}: the chosen tab is the section's shade`);
  same(x.onColor,b[g].fg,`${g}: and its words are the ones that read on it`);
  same(x.off,b[g].bg,`${g}: the other tabs are outlined in it`);
  same(x.offColor,b[g].bg,`${g}: and their words`);
  assert.ok(parseFloat(x.offW)>=1,'an outline');
 }
 // «المشتريات» has three groups (نواقص / طلبيات / مخزون): the chosen one is its shade too
 await page.click('[data-group="purchases"]');
 same(await page.evaluate(()=>window.__rgb(getComputedStyle(document.querySelector('.subbar[data-for="purchases"] .pgroups button.on')).backgroundColor)),b.purchases.bg,'the chosen group of the purchases');
},{home:true});

run('section colors: home buttons are FILLED with their section\'s shade (rounded rectangles) and carry the section\'s mark; the work apps keep a light tint with the thick border; a drag copy keeps its color',async({page})=>{
 await page.addInitScript(RGB);
 await page.evaluate(()=>localStorage.setItem('asker-home-buttons',JSON.stringify(['short','customers','storeorders','care','notes','app_ibnsina','app_instapay','app_wab','app_drugeye'])));
 await page.reload();await ready(page);await still(page);
 const b=await bar(page);
 const info=await page.evaluate(()=>[...document.querySelectorAll('#homePanel .qa > button[data-qa]')].map(e=>{const cs=getComputedStyle(e),sv=getComputedStyle(e.querySelector('svg')),mk=e.querySelector('.qa-mk'),mcs=mk&&getComputedStyle(mk);return {qa:e.dataset.qa,sec:e.dataset.sec,app:!!e.dataset.app,img:cs.backgroundImage,bg:window.__rgb(cs.backgroundColor),bw:cs.borderTopWidth,bc:window.__rgb(cs.borderTopColor),radius:cs.borderTopLeftRadius,color:window.__rgb(cs.color),icon:window.__rgb(sv.color),mark:!!mk,markPath:mk&&mk.querySelector('path').getAttribute('d'),markBg:mk&&window.__rgb(mcs.backgroundColor),markW:mk&&mcs.width,markPos:mk&&mcs.position}}));
 const want={short:'purchases',customers:'accounts',storeorders:'sales',care:'care',notes:'home',app_ibnsina:'purchases',app_instapay:'accounts',app_wab:'care',app_drugeye:'home'};
 for(const x of info){
  assert.equal(x.sec,want[x.qa],'the section of '+x.qa);
  assert.equal(x.radius,'14px',`${x.qa} is a rounded rectangle, not an oval: ${x.radius}`);
  assert.equal(x.img,'none','no gradient fill');
  if(x.app){
   assert.ok(parseFloat(x.bw)>=3,`a thick border on the work app ${x.qa}: ${x.bw}`);
   same(x.bc,b[x.sec].bg,`the border of ${x.qa} is its section's shade`);
   same(x.icon,b[x.sec].bg,`the icon of ${x.qa} too`);
   assert.ok(lum(x.bg)<250&&lum(x.bg)>200,`a work app is over a light tint of its shade: ${x.bg}`);
   same(x.color,[29,27,25],`the words of ${x.qa} stay the ink color`);
  } else {
   same(x.bg,b[x.sec].bg,`${x.qa} is filled with its section's shade`);
   assert.equal(parseFloat(x.bw),0,`no border on ${x.qa}`);
   same(x.color,b[x.sec].fg,`the words of ${x.qa} are the ones that read on its shade`);
   same(x.icon,b[x.sec].fg,`the icon of ${x.qa} too`);
   assert.ok(contrast(x.color,x.bg)>=3.9,`${x.qa} reads: ${contrast(x.color,x.bg).toFixed(2)}`);
  }
  // the section's mark: a small white badge on the button's top edge, the SAME icon as the section's button in the bottom bar
  assert.ok(x.mark,`${x.qa} has its section's mark`);
  assert.equal(x.markPath,b[x.sec].path,`the mark of ${x.qa} is the bar's icon of ${x.sec}`);
  same(x.markBg,[255,255,255],`the mark of ${x.qa} is white`);
  assert.equal(x.markW,'22px');assert.equal(x.markPos,'absolute');
 }
 // the shades of the sections keep the order on the buttons too (the system color first, then lighter)
 const Ls=['short','customers','notes','storeorders','care'].map(q=>lum(info.find(x=>x.qa===q).app?info.find(x=>x.qa===q).bc:info.find(x=>x.qa===q).bg));
 for(let i=1;i<Ls.length;i++)assert.ok(Ls[i]>Ls[i-1]+6,'the order on the buttons: '+Ls.map(Math.round));
 // the dragged copy keeps its section's color and its mark (it carries data-sec and is a clone)
 const c=async(sel)=>{const bb=await page.locator(sel).boundingBox();return {x:bb.x+bb.width/2,y:bb.y+bb.height/2}};
 const a=await c('#homePanel [data-qa="customers"]');
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.waitForTimeout(650);
 assert.equal(await page.$eval('.qa-ghost',e=>e.dataset.sec),'accounts','the copy keeps its section');
 same(await page.$eval('.qa-ghost',e=>window.__rgb(getComputedStyle(e).backgroundColor)),b.accounts.bg,'and its color');
 assert.equal(await page.$$eval('.qa-ghost .qa-mk',n=>n.length),1,'and its mark');
 await page.mouse.up();
},{home:true});

run('section colors: a different system color changes all five steps (same order, still never darker than it), the words keep reading, and the night look keeps a stripe per section',async({page})=>{
 await page.addInitScript(RGB);await page.reload();await ready(page);await still(page);
 await page.evaluate(()=>document.documentElement.style.setProperty('--crimson','#2e7d32'));
 const g=await bar(page);
 const L=ORDER.map(k=>lum(g[k].bg));
 for(let i=1;i<L.length;i++)assert.ok(L[i]>L[i-1]+3,'still in order with a green system color: '+L.map(Math.round));
 for(const k of ORDER){const [r,gg,bb]=g[k].bg;assert.ok(gg>r&&gg>bb,`${k} is a green now: ${g[k].bg}`);assert.ok(contrast(g[k].fg,g[k].bg)>=3.9,`the words on ${k} read on green: ${contrast(g[k].fg,g[k].bg).toFixed(2)}`)}
 // a dark color of his own (charcoal): white words on every step, the steps are still lighter and lighter
 await page.evaluate(()=>document.documentElement.style.setProperty('--crimson','#263238'));
 const d=await bar(page);
 for(const k of ORDER)assert.ok(contrast(d[k].fg,d[k].bg)>=3.9,`the words on ${k} read on charcoal: ${contrast(d[k].fg,d[k].bg).toFixed(2)}`);
 assert.ok(lum(d.care.bg)>lum(d.purchases.bg)+3,'lighter steps on charcoal too');
 // the night look: the bar is dark, every section keeps a colored stripe on top
 await page.evaluate(()=>{document.documentElement.style.removeProperty('--crimson');document.documentElement.classList.add('night')});
 const n=await bar(page);
 for(const k of ORDER){assert.match(n[k].shadow,/inset/,`${k} has a stripe at night: ${n[k].shadow}`);assert.ok(lum(n[k].bg)<120,`${k}'s segment is dark at night: ${n[k].bgRaw}`)}
 assert.ok(n.purchases.shadow!==n.care.shadow,'the stripes differ by section');
 await page.evaluate(()=>document.documentElement.classList.remove('night'));
},{home:true});
