// The customers' look (owner 2026-11-16: «شاشات العملاء والكشف بالتفصيل», ar/capsule.css + ar/motion.js): a round mark with the first letter before
// each name, the balance a pill, the statement's balance on a dark capsule that counts up and ends exactly as written, the main buttons in the bot's
// color (no WhatsApp green), day and night. Made-up customers only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const pad=n=>String(n).padStart(2,'0');
const at=(d,h,m)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00`;
const today=new Date(),old=new Date(Date.now()-40*864e5);
const CUSTOMERS=[
 {id:101,name:'أحمد محمود',credit_limit:5000,balance:7174.5,last_at:at(today,11,0),last_kind:'sale',moves:2},
 {id:102,name:'د/سامية عبد الله',credit_limit:10000,balance:9500,last_at:at(old,9,10),last_kind:'payment',moves:1},
 {id:104,name:'مصطفى إبراهيم',credit_limit:10000,balance:-200,last_at:at(old,12,0),last_kind:'payment',moves:1},
];
const MOVES=[
 {id:11,customer_id:101,at:at(today,9,0),kind:'sale',total:166.7,paid:0,balance:6966.7,items:[{n:'PANADOL EXTRA 24 TAB',p:1,u:0,k:1,s:66.7,d:0}]},
 {id:13,customer_id:101,at:at(today,11,0),kind:'sale',total:207.8,paid:0,balance:7174.5,items:[{n:'OMEZ 40 20 CAP',p:1,u:0,k:1,s:207.8,d:0}]},
];
const setData=(page)=>page.evaluate(([c,m])=>{window.__tables.ar_customers=c;window.__tables.ar_customer_moves=m},[CUSTOMERS,MOVES]);
// WCAG contrast of two "rgb(r, g, b)" strings
const contrast=(a,b)=>{const lum=s=>{const [r,g,bl]=s.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*bl};const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const open=async(page)=>{await setData(page);await page.click('[data-group="accounts"]');await page.waitForSelector('#cuBox:not(.hidden)');await page.click('#cuChips [data-cu-view="all"]');await page.waitForSelector('#cuRows .cu-row')};

run('Customers look: a round mark with the first letter, the balance a pill, the over-the-limit one marked, the statement\'s balance on a dark capsule',async({page})=>{
 await open(page);
 // the letter (a title like «د/» is skipped), as a mark before the name
 const marks=await page.$$eval('#cuRows .cu-row',r=>r.map(x=>[x.dataset.cu,x.dataset.ini,getComputedStyle(x,'::before').content]));
 assert.deepEqual(marks,[['101','أ','"أ"'],['102','س','"س"'],['104','م','"م"']].sort((a,b)=>marks.findIndex(m=>m[0]===a[0])-marks.findIndex(m=>m[0]===b[0])));
 const row=await page.evaluate(()=>{const r=document.querySelector('#cuRows .cu-row'),cs=getComputedStyle(r),mk=getComputedStyle(r,'::before'),amt=getComputedStyle(r.querySelector('.cu-amt')),card=cs.backgroundColor;
  return {radius:cs.borderTopLeftRadius,markW:mk.width,markH:mk.height,markR:mk.borderTopLeftRadius,markFont:mk.fontFamily,amtR:amt.borderTopLeftRadius,amtFg:amt.color,card}});
 assert.equal(row.radius,'2px','square corners in the brand look');assert.equal(row.markW,'46px');assert.equal(row.markH,'46px');assert.equal(row.markR,'999px');
 assert.match(row.markFont,/Readex Pro/);
 assert.ok(parseFloat(row.amtR)>=2,'the balance keeps a small shape: '+row.amtR);
 assert.ok(contrast(row.amtFg,row.card)>=4.5,'the amount reads on the row: '+row.amtFg+' on '+row.card);
 // the over-the-limit customer is marked by the color of the bot (a ring and a filled mark)
 const warn=await page.evaluate(()=>{const r=document.querySelector('#cuRows .cu-row.warn'),mk=getComputedStyle(r,'::before');return {mkBg:mk.backgroundColor,mkFg:mk.color,crimson:getComputedStyle(document.documentElement).getPropertyValue('--crimson').trim()}});
 assert.ok(contrast(warn.mkFg,warn.mkBg)>=4.5,'the letter reads on the filled mark');
 // the statement: the name, the balance on the dark capsule (the picture's green by default), the text untouched
 await page.click('#cuRows [data-cu="101"]');
 await page.waitForSelector('#cuSt:not(.hidden) .cu-mv');
 assert.equal(await text(page,'#cuSt .cu-bal'),'عليه 7,174.50 ج');
 assert.equal(await text(page,'#cuSt .cu-head > .hint'),'الحد 5,000 ج · زيادة 2,174.50 ج');
 const st=await page.evaluate(()=>{const cs=e=>getComputedStyle(e),bal=document.querySelector('#cuSt .cu-bal'),send=document.querySelector('#cuSt button.cu-send'),head=document.querySelector('#cuSt .cu-head');
  return {bg:cs(bal).backgroundColor,fg:cs(bal).color,r:cs(bal).borderTopLeftRadius,font:cs(bal).fontFamily,sendBg:send?cs(send).backgroundColor:'',sendR:send?cs(send).borderTopLeftRadius:'',headR:cs(head).borderTopLeftRadius,sheen:cs(bal,'::before').animationName}});
 assert.equal(st.bg,'rgb(47, 125, 104)','the soft green by day');assert.ok(parseFloat(st.r)<=24,'a quiet corner: '+st.r);assert.match(st.font,/Readex Pro/);
 assert.ok(contrast(st.fg,st.bg)>=3,'the big balance reads on the dark capsule (large text): '+st.fg+' on '+st.bg);
 assert.ok(parseFloat(st.headR)<=28,'a quiet head: '+st.headR);
 if(st.sendBg){assert.notEqual(st.sendBg,'rgb(31, 168, 85)','no WhatsApp green: the main button is the bot\'s color');assert.ok(parseFloat(st.sendR)<=4,'the send button has square corners: '+st.sendR);}
 // «ليه» (a credit) is a green-white text on the dark capsule
 await page.click('[data-cu-back]');await page.waitForSelector('#cuListView:not(.hidden)');
 await page.click('#cuRows [data-cu="104"]');await page.waitForSelector('#cuSt:not(.hidden) .cu-bal');
 const paid=await page.evaluate(()=>{const b=document.querySelector('#cuSt .cu-bal'),cs=getComputedStyle(b);return {fg:cs.color,bg:cs.backgroundColor}});
 assert.ok(contrast(paid.fg,paid.bg)>=3,'a credit balance reads: '+paid.fg);
},{home:true});

run('Customers look: night — the rows, the mark and the dark capsule stay readable',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('asker-night','1'));
 await page.reload();
 await page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
 await open(page);
 assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('night')));
 const n=await page.evaluate(()=>{const r=document.querySelector('#cuRows .cu-row'),cs=getComputedStyle(r),mk=getComputedStyle(r,'::before'),amt=getComputedStyle(r.querySelector('.cu-amt'));return {mkFg:mk.color,mkBg:mk.backgroundColor,amtFg:amt.color,row:cs.backgroundColor}});
 assert.ok(contrast(n.mkFg,n.mkBg)>=4.5,'the letter reads at night: '+n.mkFg+' on '+n.mkBg);
 assert.ok(contrast(n.amtFg,n.row)>=4.5,'the amount reads at night: '+n.amtFg+' on '+n.row);
 await page.click('#cuRows [data-cu="101"]');await page.waitForSelector('#cuSt:not(.hidden) .cu-bal');
 const s=await page.evaluate(()=>{const b=document.querySelector('#cuSt .cu-bal'),cs=getComputedStyle(b);return {fg:cs.color,bg:cs.backgroundColor}});
 assert.equal(s.bg,'rgb(6, 111, 116)');
 assert.ok(contrast(s.fg,s.bg)>=3,'the balance reads at night: '+s.fg);
},{home:true});

run('Customers look: the motion — the balance counts up and ends exactly as written, the statement\'s parts rise once; «reduce motion» stops it',async({page})=>{
 await page.addInitScript(()=>{window.__askerMotion=true});
 await page.reload();
 await page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
 await open(page);
 await page.click('#cuRows [data-cu="101"]');
 await page.waitForSelector('#cuSt:not(.hidden) .cu-bal');
 assert.equal(await page.evaluate(()=>document.getElementById('cuSt').classList.contains('fresh')),true,'the parts rise the first time');
 const samples=await page.evaluate(()=>new Promise(ok=>{const out=[],t0=performance.now(),tick=()=>{const e=document.querySelector('#cuSt .cu-bal');out.push(e?e.textContent:'');performance.now()-t0<1500?setTimeout(tick,40):ok(out)};tick()}));
 const final='عليه 7,174.50 ج';
 assert.ok(new Set(samples).size>3,'the number changed while counting: '+samples.slice(0,5).join(' / '));
 assert.equal(samples[samples.length-1],final,'and ends exactly as written');
 assert.ok(samples.every(s=>/^عليه [\d,.]+ ج$/.test(s)),'always a clean line');
 assert.equal(await page.evaluate(()=>document.getElementById('cuSt').classList.contains('fresh')),false,'«fresh» goes away');
 // reduce motion: no count, no rise, no sheen
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.reload();
 await page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
 await open(page);
 await page.click('#cuRows [data-cu="101"]');await page.waitForSelector('#cuSt:not(.hidden) .cu-bal');
 assert.equal(await text(page,'#cuSt .cu-bal'),final);
 const r=await page.evaluate(()=>({fresh:document.getElementById('cuSt').classList.contains('fresh'),sheen:getComputedStyle(document.querySelector('#cuSt .cu-bal'),'::before').animationName}));
 assert.equal(r.fresh,false);assert.equal(r.sheen,'none');
},{home:true});
