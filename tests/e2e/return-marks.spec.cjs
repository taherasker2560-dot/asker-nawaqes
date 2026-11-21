// «↩️ إرجاع» (owner 2026-11-19): a line of the short-dated list «فواتير» is marked «return it to the supplier», the marks make a statement per supplier
// (copy / WhatsApp) and a tick «اتجهّز»; a staff member with the switch «returns» sees only that view and can tick but not mark.
const {run,assert,text}=require('./harness.cjs');
const names=(page,sel)=>page.$$eval(sel,b=>b.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
const setup=()=>{
 const p=n=>String(n).padStart(2,'0'),loc=d=>`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
 const now=new Date(),ago=(d,h)=>loc(new Date(now.getFullYear(),now.getMonth(),now.getDate()-d,h,0,0));
 const exp=m=>{const x=new Date(now.getFullYear(),now.getMonth()+m+1,0);return `${x.getFullYear()}-${p(x.getMonth()+1)}-${p(x.getDate())}`};
 const L=(i,pk,k,x)=>({i,p:pk,u:0,k,b:0,c:100,t:20,x});
 window.__exp=exp;
 window.__tables.ar_vendors=[{id:5,name:'A M group',short:'AMG'},{id:6,name:'رضا عطية',short:'REDA'}];
 window.__tables.ar_store_items=[{id:103,name:'FLAGYL 125MG SYRUP',arabic_name:'فلاجيل ١٢٥ شراب'},{id:101,name:'PANADOL EXTRA 24 TAB',arabic_name:null},{id:104,name:'OLDER ONE',arabic_name:null}];
 window.__tables.ar_vendor_moves=[
  {id:1,vendor_id:5,at:ago(1,16),kind:'purchase',code:'11/26/474411',lines:[L(103,2,1,exp(3)),L(101,10,1,exp(8))]},
  {id:2,vendor_id:6,at:ago(0,0),kind:'purchase',code:'11/26/777',lines:[L(104,3,1,exp(14))]}];
 const st=(id,packs,near)=>({item_id:id,packs,units:0,parts:1,exp_near:near,other:[]});
 window.__tables.ar_stock=[st(103,2,exp(3)),st(101,10,exp(8)),st(104,3,exp(14))];
 window.__tables.ar_return_marks=[];
 const T=window.__tables;let next=1;
 const find=id=>T.ar_return_marks.find(r=>String(r.id)===String(id));
 window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{
  ar_return_sync:()=>({ok:true,closed:0,touched:0}),
  ar_return_mark:a=>{const m=T.ar_vendor_moves.find(x=>x.id===a.p_move),it=T.ar_store_items.find(x=>x.id===a.p_item),v=T.ar_vendors.find(x=>x.id===m.vendor_id);
   const l=m.lines.find(x=>x.i===a.p_item);let r=T.ar_return_marks.find(x=>x.move_id===a.p_move&&x.item_id===a.p_item&&['marked','prepared'].includes(x.status));
   if(r){r.units=a.p_units;return {ok:true,id:r.id,dup:true}}
   r={id:next++,move_id:a.p_move,vendor_id:m.vendor_id,vendor_name:v.short,code:m.code,invoiced_at:m.at,item_id:a.p_item,item_name:it.name,item_ar:it.arabic_name,expiry:a.p_x,k:l.k,units:a.p_units,returned_units:0,status:'marked',marked_at:new Date().toISOString(),prepared_by:null};
   T.ar_return_marks.push(r);return {ok:true,id:r.id}},
  ar_return_unmark:a=>{const r=find(a.p_id);if(!r||!['marked','prepared'].includes(r.status))return {ok:false,error:'state'};r.status='cancelled';return {ok:true,id:r.id}},
  ar_return_prepare:a=>{const r=find(a.p_id);if(!r||!['marked','prepared'].includes(r.status))return {ok:false,error:'state'};r.status=a.p_done?'prepared':'marked';r.prepared_by=a.p_done?(window.__who||'المالك'):null;return {ok:true,id:r.id,status:r.status}}});
};
run('Return marks: mark a line, the statement for WhatsApp, the tick «اتجهّز», the staff view',async({page})=>{
 await page.evaluate(setup);
 await page.click('[data-pgroup="stock"]');await page.click('[data-tab="expiry"]');
 assert.deepEqual((await names(page,'#alViews [data-al-view]')).map(x=>x.replace(/\d+/,'').trim()),['النهارده','منتهية','قربت','فواتير','↩️ مرتجعات']);
 await page.click('#alViews [data-al-view="short"]');await page.waitForSelector('#alExpiry .sd-row');
 let rows=await names(page,'#alExpiry .sd-row');
 assert.equal(rows.length,3,'FLAGYL (3 months), PANADOL (8), OLDER ONE (14)');
 assert.ok(rows.every(r=>/↩️ إرجاع/.test(r)),'every line has the button');
 const ret=(i)=>page.locator('#alExpiry .sd-row').nth(i);
 // too many boxes: refused here, nothing written
 await ret(0).locator('[data-sd-ret]').click();
 assert.equal(await page.inputValue('#alExpiry [data-sd-qty]'),'2','what is left by default');
 await page.fill('#alExpiry [data-sd-qty]','5');await page.click('#alExpiry [data-sd-ret-ok]');
 assert.match(await page.textContent('#alExpiry .sd-ret .status'),/أكبر من اللي فاضل/);
 assert.equal((await page.evaluate(()=>window.__fakeWrites)).filter(w=>w.rpc==='ar_return_mark').length,0);
 // an Arabic digit is read: one box of the two
 await page.fill('#alExpiry [data-sd-qty]','١');await page.click('#alExpiry [data-sd-ret-ok]');
 await page.waitForSelector('#alExpiry .rm-chip');
 const w=(await page.evaluate(()=>window.__fakeWrites)).filter(x=>x.rpc==='ar_return_mark');
 assert.equal(w.length,1);assert.equal(w[0].args.p_move,1);assert.equal(w[0].args.p_item,103);assert.equal(w[0].args.p_units,1);assert.match(w[0].args.p_x,/^\d{4}-\d\d-\d\d$/);
 assert.match((await names(page,'#alExpiry .rm-chip'))[0],/مطلوب إرجاعه · 1 علبة/);
 assert.ok(await ret(0).locator('[data-sd-unmark]').count(),'the mark can be taken off');
 // PANADOL: all 10 boxes by default; OLDER ONE of the other supplier: marked, then taken off
 await ret(1).locator('[data-sd-ret]').click();await page.click('#alExpiry [data-sd-ret-ok]');
 await page.waitForFunction(()=>document.querySelectorAll('#alExpiry .rm-chip').length===2);
 await ret(2).locator('[data-sd-ret]').click();await page.click('#alExpiry [data-sd-ret-ok]');
 await page.waitForFunction(()=>document.querySelectorAll('#alExpiry .rm-chip').length===3);
 await ret(2).locator('[data-sd-unmark]').click();
 await page.waitForFunction(()=>document.querySelectorAll('#alExpiry .rm-chip').length===2);

 // the view «↩️ مرتجعات»
 await page.click('#alViews [data-al-view="returns"]');await page.waitForSelector('#alExpiry .rm-row');
 assert.equal((await text(page,'#alReturnsN')),'2');
 rows=await names(page,'#alExpiry .rm-row');assert.equal(rows.length,2);
 assert.deepEqual((await page.$$eval('#alExpiry .rm-row > .im-th',b=>b.map(x=>x.dataset.im))).sort(),['101','103'],'the marks have the item\'s photo (owner 2026-11-21)');
 assert.match(rows.join('|'),/PANADOL EXTRA 24 TAB.*فاتورة رقم 474411 · اتدخلت \d\d\/\d\d\/\d{4}.*مطلوب إرجاعه/);
 assert.match(rows.join('|'),/فلاجيل ١٢٥ شراب.*فاتورة رقم 474411/,'item FLAGYL: 1 of the 2 boxes');
 const heads=await names(page,'#alExpiry .rm-group > .al-h');assert.equal(heads.length,1,'one supplier: AMG (the other line was taken off)');
 await page.click('#alExpiry [data-rm-statement]');
 const t=await page.inputValue('#alExpiry [data-rm-text]');
 assert.match(t,/^مرتجعات للمورد AMG:\n1\) FLAGYL 125MG SYRUP \(فلاجيل ١٢٥ شراب\) \| 1 علبة \| صلاحية \d\d\/\d{4} \| فاتورة 474411 \(اتدخلت \d\d\/\d\d\/\d{4}\)\n2\) PANADOL EXTRA 24 TAB \| 10 علبة \| صلاحية \d\d\/\d{4} \| فاتورة 474411 \(اتدخلت \d\d\/\d\d\/\d{4}\)\nالإجمالي: 2 صنف$/);
 assert.ok((await page.getAttribute('#alExpiry .rm-statement a','href')).startsWith('https://wa.me/?text='+encodeURIComponent('مرتجعات للمورد AMG:')));
 // the tick: the owner can; who and the chip change; back again
 await page.click('#alExpiry .rm-row [data-rm-prep]');
 await page.waitForFunction(()=>/✓ اتجهّز · المالك/.test(document.querySelector('#alExpiry .rm-row').textContent));
 assert.equal((await page.evaluate(()=>window.__fakeWrites)).filter(x=>x.rpc==='ar_return_prepare').length,1);
 await page.click('#alExpiry .rm-row [data-rm-prep]');
 await page.waitForFunction(()=>!/✓ اتجهّز ·/.test(document.querySelector('#alExpiry .rm-row').textContent));

 // a staff member with only the switch «returns»: that view alone, the tick but no «شيل العلامة», no marking
 await page.evaluate(()=>{window.__who='أحمد';window.AskerStaff.isStaff=()=>true;window.AskerStaff.can=p=>p==='returns';window.AskerReturnMarks.reload();window.AskerAlerts.show('returns')});
 await page.waitForSelector('#alExpiry .rm-row');
 assert.deepEqual(await page.$$eval('#alViews [data-al-view]',b=>b.filter(x=>!x.classList.contains('hidden')).map(x=>x.dataset.alView)),['returns']);
 assert.ok(!(await page.$('#alExpiry [data-rm-unmark]')),'staff do not take marks off');
 assert.ok(await page.$('#alExpiry [data-rm-prep]'));
 await page.click('#alExpiry .rm-row [data-rm-prep]');
 await page.waitForFunction(()=>/✓ اتجهّز · أحمد/.test(document.querySelector('#alExpiry .rm-row').textContent));
 // a staff member with «الصلاحيات» only: the three views, no «فواتير», no «↩️ مرتجعات»
 await page.evaluate(()=>{window.AskerStaff.can=p=>p==='expiry';window.AskerAlerts.show('today')});
 await page.waitForFunction(()=>[...document.querySelectorAll('#alViews [data-al-view]')].filter(x=>!x.classList.contains('hidden')).length===3);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
});
