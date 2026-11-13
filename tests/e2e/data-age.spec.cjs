// «حسب داتا الساعة …»: the strip under the app bar shows how old the list's pharmacy data is (newest successful
// ar_sync_log row), turns green / yellow / red by age, opens its detail lines on a tap, and fits a phone screen.
const {run,text,assert}=require('./harness.cjs');
run('data age strip',async({page})=>{
 // Cairo wall clock text, N minutes ago (same shape the laptop writes: yyyy-MM-dd HH:mm:ss)
 const setRows=(rows)=>page.evaluate(rows=>{
  const f=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const cairo=ms=>{const p={};f.formatToParts(new Date(ms)).forEach(x=>p[x.type]=x.value);return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`};
  window.__tables.ar_sync_log=rows.map((r,i)=>({id:i+1,at:new Date(Date.now()-r.sentMin*60e3).toISOString(),data_at:cairo(Date.now()-r.dataMin*60e3),dry_run:!!r.dry,status:r.status||'ok'}));
  document.dispatchEvent(new Event('visibilitychange'));
 },rows);
 const level=()=>page.getAttribute('#dataAge','class');
 const waitLevel=l=>page.waitForFunction(l=>document.getElementById('dataAge').classList.contains(l),l,{timeout:5000});

 // nothing sent yet
 await waitLevel('none');
 assert.equal(await text(page,'#dataAgeText'),'لسه مفيش نواقص اتبعتت من اللاب');
 assert.ok(await page.isVisible('#dataAge'));

 // fresh: green
 await setRows([{dataMin:20,sentMin:19}]);await waitLevel('good');
 // owner 2026-11-13 «أيوه الوقتين»: the update time and the last sale; «من …» counts from the update
 assert.match(await text(page,'#dataAgeText'),/^آخر تحديث (النهارده|امبارح) \d{1,2}:\d\d (ص|م) · آخر بيع ((النهارده|امبارح) )?\d{1,2}:\d\d (ص|م)$/);
 assert.equal(await text(page,'#dataAgeAgo'),'من 19 دقيقة');
 // no sale for 2 hours but updated 3 minutes ago: still green, and «من 3 دقايق» (the update), not «من ساعتين»
 await setRows([{dataMin:120,sentMin:3,status:'STORE_OK'}]);await page.waitForFunction(()=>document.getElementById('dataAgeAgo').textContent==='من 3 دقايق',null,{timeout:5000});
 assert.match(await level(),/dataage good/);
 assert.ok(!(await page.isVisible('#dataAgeMore')),'details closed at first');

 // 8 hours: yellow
 await setRows([{dataMin:8*60,sentMin:30}]);await waitLevel('warn');
 assert.equal(await text(page,'#dataAgeAgo'),'من 30 دقيقة');

 // the list goes twice a day only: a fresh store / stock send keeps the strip green although the list's own send is 20 hours old
 await setRows([{dataMin:30,sentMin:29,status:'STORE_OK'},{dataMin:20*60,sentMin:20*60}]);await waitLevel('good');
 assert.equal(await text(page,'#dataAgeAgo'),'من 29 دقيقة');

 // 17 hours: red, and a dry run or a refused send never counts as fresh data
 await setRows([{dataMin:5,sentMin:5,dry:true},{dataMin:5,sentMin:5,status:'rejected'},{dataMin:17*60,sentMin:60}]);await waitLevel('bad');
 assert.match(await text(page,'#dataAgeText'),/^الداتا قديمة: آخر تحديث .+ · آخر بيع /);
 assert.equal(await text(page,'#dataAgeAgo'),'من ساعة');

 // tap: the detail lines (last send, the laptop's data, the list's own update); tap again: closed
 await page.click('#dataAge');
 assert.equal(await page.getAttribute('#dataAge','aria-expanded'),'true');
 const more=await text(page,'#dataAgeMore');
 assert.match(more,/آخر مرة اللاب بعت: .+ (ص|م)/);assert.match(more,/داتا الصيدلية عند اللاب: .+ (ص|م)/);assert.match(more,/آخر تحديث للنواقص: .+ (ص|م)/);
 await page.click('#dataAge');assert.ok(!(await page.isVisible('#dataAgeMore')));

 // visible on every tab, and no sideways scrolling on a phone
 for(const t of ['translate','read','short']){await page.click(`[data-tab="${t}"]`);assert.ok(await page.isVisible('#dataAge'),t)}
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'fits the screen');

 // the page reads ar_sync_log only: nothing written anywhere by the strip
 assert.deepEqual(await page.evaluate(()=>window.__fakeWrites.filter(w=>w.table==='ar_sync_log')),[]);
 assert.match(await level(),/dataage bad/);
});
