// «الصلاحيات ← اتقبلت قصيرة» (owner 2026-11-15): the items of the purchase invoices that were accepted (on the invoice), not returned,
// expiring in under 18 months, shortest first; a partial return shows what is left; the period chips.
const {run,assert}=require('./harness.cjs');
const names=(page,sel)=>page.$$eval(sel,b=>b.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
run('Short-dated: accepted and not returned, under 18 months, shortest first, a partial return, the periods',async({page})=>{
 await page.evaluate(()=>{
  const p=n=>String(n).padStart(2,'0'),loc=d=>`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
  const now=new Date(),ago=(d,h)=>{const x=new Date(now.getFullYear(),now.getMonth(),now.getDate()-d,h,0,0);return loc(x)};
  const exp=m=>{const x=new Date(now.getFullYear(),now.getMonth()+m+1,0);return `${x.getFullYear()}-${p(x.getMonth()+1)}-${p(x.getDate())}`}; // end of the month, m months ahead
  const L=(i,pk,k,x)=>({i,p:pk,u:0,k,b:0,c:100,t:20,x});
  window.__expX=exp;
  window.__tables.ar_vendors=[{id:5,name:'A M group',short:'AMG'},{id:6,name:'رضا عطية',short:'REDA'}];
  window.__tables.ar_store_items=[{id:101,name:'PANADOL EXTRA 24 TAB',arabic_name:'بانادول اكسترا ٢٤ قرص'},{id:102,name:'LONG LIFE CREAM',arabic_name:null},{id:103,name:'FLAGYL 125MG SYRUP',arabic_name:'فلاجيل ١٢٥ شراب'},{id:104,name:'OLDER ONE',arabic_name:null}];
  window.__tables.ar_vendor_moves=[
   {id:1,vendor_id:5,at:ago(0,10),kind:'purchase',code:'11/26/1',lines:[L(101,10,1,exp(8)),L(102,5,1,exp(30)),L(103,2,1,exp(3))]},
   {id:2,vendor_id:6,at:ago(2,12),kind:'purchase',code:'11/26/7',lines:[L(104,3,1,exp(14))]},
   {id:3,vendor_id:5,at:ago(0,11),kind:'return',code:'~11/26/1',lines:[L(101,3,1,exp(8))]},
   {id:4,vendor_id:5,at:ago(0,12),kind:'payment',code:null,lines:null}];});
 await page.click('[data-pgroup="stock"]');await page.click('[data-tab="expiry"]');
 assert.deepEqual(await names(page,'#alViews [data-al-view]').then(a=>a.map(x=>x.replace(/\d+/,'').trim())),['النهارده','منتهية','قربت','فواتير']);
 await page.click('#alViews [data-al-view="short"]');
 await page.waitForSelector('#alExpiry .sd-row');
 assert.match(await page.textContent('#alExpiry .hint'),/وافقت عليها/);
 // the default period (3 days): FLAGYL (3 months), PANADOL (8 months, 7 left after the return), OLDER ONE (14 months, 2 days ago); not the long one
 const rows=await names(page,'#alExpiry .sd-row');
 assert.equal(rows.length,3);
 assert.match(rows[0],/فلاجيل ١٢٥ شراب.*FLAGYL 125MG SYRUP.*AMG.*11\/26\/1.*باقي 3 شهور.*2 علبة/);
 assert.match(rows[1],/بانادول اكسترا ٢٤ قرص.*AMG.*باقي 8 شهور.*7 علبة/,'3 of the 10 went back');
 assert.match(rows[2],/OLDER ONE.*REDA.*11\/26\/7.*باقي 14 شهر.*3 علبة/);
 assert.ok(!rows.join('|').includes('LONG LIFE'),'a 30-month item is not short');
 assert.match(await page.textContent('#alExpiry .al-h'),/3/);
 // colours: under 6 months red, under 12 amber, the rest plain
 assert.deepEqual(await page.$$eval('#alExpiry .sd-row',r=>r.map(x=>x.classList.contains('red')?'red':x.classList.contains('amber')?'amber':'')),['red','amber','']);
 // «النهارده»: only today's invoice
 await page.click('#alExpiry [data-sd-period="today"]');
 await page.waitForFunction(()=>document.querySelectorAll('#alExpiry .sd-row').length===2);
 assert.ok(!(await names(page,'#alExpiry .sd-row')).join('|').includes('OLDER ONE'));
 // everything returned: the good-news line
 await page.evaluate(()=>{window.__tables.ar_vendor_moves.push({id:5,vendor_id:5,at:new Date().toISOString().slice(0,16)+':00',kind:'return',code:null,lines:[{i:101,p:7,u:0,k:1,b:0,x:window.__expX(8)},{i:103,p:2,u:0,k:1,b:0,x:window.__expX(3)}]})});
 await page.click('#alExpiry [data-sd-period="7"]');await page.click('#alExpiry [data-sd-period="today"]');
 await page.waitForFunction(()=>/مفيش في الفواتير دي صنف/.test(document.getElementById('alExpiry').textContent));
 // the other views still work and the page fits the phone
 await page.click('#alViews [data-al-view="soon"]');assert.ok(!(await page.$('#alExpiry .sd-row')));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
});
