// Fast opening: the page loads once per sign-in, asks the server for everything at the same time, reads long tables in
// pages two at a time, opens on the data saved on the phone, and forgets that data on logout.
const {run,assert}=require('./harness.cjs');
const CACHE='ar-cache-v1',ready=p=>p.waitForFunction(()=>/\d/.test(document.getElementById('shStats')?.textContent||''),null,{timeout:15000});
const reads=(page,t)=>page.evaluate(t=>window.__reads.filter(r=>!t||r.table===t),t);
const reload=async(page,store={})=>{await page.evaluate(s=>{for(const k of['__fakeDelay','__fakeNames','ar-cache-v1'])localStorage.removeItem(k);for(const[k,v]of Object.entries(s))localStorage.setItem(k,v)},store);await page.reload()};
const strongs=page=>page.$$eval('#shStats .stat strong',e=>e.map(x=>x.textContent.trim()));

run('fast opening',async({page})=>{
 // 1) once per sign-in: the auth listener and the first call both ask, but every table is read once
 await page.waitForTimeout(600);
 for(const t of['ar_shortages','ar_names','ar_suppliers','ar_orders','ar_inbox','ar_sync_log'])assert.equal((await reads(page,t)).length,1,`${t} read once`);

 // 2) everything is asked at the same time: with every read taking 500 ms, the five reads start together
 //    (one after the other they would start 500 ms apart)
 await reload(page,{__fakeDelay:'500'});
 await ready(page);
 await page.waitForFunction(()=>['ar_shortages','ar_names','ar_suppliers','ar_orders','ar_inbox'].every(t=>window.__reads.some(r=>r.table===t)));
 const at=(await reads(page)).filter(r=>['ar_shortages','ar_names','ar_suppliers','ar_orders','ar_inbox'].includes(r.table)).map(r=>r.at);
 assert.ok(Math.max(...at)-Math.min(...at)<250,`reads start together (${Math.round(Math.max(...at)-Math.min(...at))} ms apart)`);

 // 3) a long table: first page, then the next two together, nothing missed (the list's own names are the last rows)
 await reload(page,{__fakeNames:'2497'});await ready(page);await page.waitForTimeout(300);
 assert.equal((await reads(page,'ar_names')).length,3,'names: page 1, then pages 2 and 3 together');
 assert.deepEqual(await strongs(page),['3','3','3'],'names from the last page reached the list');

 // 4) saved on the phone after a full load
 await reload(page);await ready(page);await page.waitForTimeout(2200);
 const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),CACHE);
 assert.equal(saved.uid,'u1');assert.equal(saved.shortages.length,3);assert.ok(Array.isArray(saved.names)&&Array.isArray(saved.suppliers));
 assert.ok(!('inbox' in saved)&&!('orders' in saved),'messages and orders are not kept on the phone');

 // 5) opens on the saved data at once while the server is slow, then the server's answer wins
 await page.evaluate(k=>{localStorage.setItem(k,JSON.stringify({uid:'u1',at:Date.now(),shortages:[{id:'c1',product_name:'CACHED ITEM'}],names:[],suppliers:[]}));localStorage.setItem('__fakeDelay','3000')},CACHE);
 const t1=Date.now();await page.reload();await ready(page);
 assert.ok(Date.now()-t1<1800,'shown from the saved data before the server answered');
 assert.deepEqual((await strongs(page))[0],'1','saved list first');
 await page.waitForFunction(()=>document.querySelector('#shStats .stat strong')?.textContent.trim()==='3',null,{timeout:15000});

 // 6) saved data of another sign-in is never shown
 await page.evaluate(k=>{localStorage.setItem(k,JSON.stringify({uid:'someone-else',at:Date.now(),shortages:[{id:'c1',product_name:'OTHER'}],names:[],suppliers:[]}))},CACHE);
 await page.reload();await page.waitForTimeout(1200);
 assert.equal((await page.textContent('#shStats')).trim(),'','nothing shown before the server answers');
 await page.waitForFunction(()=>document.querySelector('#shStats .stat strong')?.textContent.trim()==='3',null,{timeout:15000});

 // 7) logout forgets the saved data
 await reload(page);await ready(page);await page.waitForTimeout(2200);
 assert.ok(await page.evaluate(k=>!!localStorage.getItem(k),CACHE),'saved before logout');
 await page.click('#logoutBtn');
 await page.waitForFunction(()=>!document.getElementById('loginCard').classList.contains('hidden'));
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),CACHE),null,'saved data removed on logout');
});
