// The pharmacy's staff (owner 2026-11-13): the owner adds a person, opens sections for him, sends his link on WhatsApp and
// stops him; a staff member sees only the sections open for him; the personal link signs him in. Made-up people only.
const {run,text,assert}=require('./harness.cjs');
run('Staff: the owner adds a person, opens sections, sends the link, stops him',async({page,table})=>{
 await page.evaluate(()=>{window.open=(u)=>{window.__opened=u;return {}};window.__tables.ar_staff=[]});
 page.on('dialog',d=>d.accept());
 await page.click('#settingsBtn');
 await page.waitForSelector('#staffAdmin:not(.hidden)');
 await page.click('#stfAdd');
 assert.match(await text(page,'#stfStatus'),/اكتب اسم الموظف/);
 await page.fill('#stfName','موظف تجربة');
 await page.click('#stfAdd');
 await page.waitForSelector('#stfRows [data-stf]');
 assert.match(await text(page,'#stfRows .stf-head'),/موظف تجربة[\s\S]*لسه ما دخلش/);
 // the link opens WhatsApp with a message for him
 assert.match(await page.evaluate(()=>decodeURIComponent(window.__opened)),/^https:\/\/wa\.me\/\?text=أهلاً موظف تجربة[\s\S]*#staff=a{64}[\s\S]*ثبّت/);
 // a switch per section: saved at once on the server
 await page.check('#stfRows [data-perm="tempsale"]');
 await page.check('#stfRows [data-perm="expiry"]');
 await page.waitForFunction(()=>(window.__tables.ar_staff[0].perms||[]).length===2);
 assert.deepEqual((await table('ar_staff'))[0].perms,['tempsale','expiry']);
 await page.uncheck('#stfRows [data-perm="expiry"]');
 await page.waitForFunction(()=>window.__tables.ar_staff[0].perms.length===1);
 // «شوف البوت زي ما هيشوفه»: his home and sections on this phone, without signing out; «رجوع لحسابي» ends it
 await page.click('#stfRows [data-stf-preview]');
 await page.waitForFunction(()=>document.documentElement.classList.contains('staff'));
 assert.match(await text(page,'#previewBar'),/بتشوف البوت زي ما موظف تجربة هيشوفه/);
 assert.deepEqual(await page.$$eval('#staffHomePanel [data-stf-go]',b=>b.map(x=>x.dataset.stfGo)),['tempsale']);
 assert.ok(await page.$eval('#settingsPanel',e=>e.classList.contains('hidden')));
 await page.click('#previewBack');
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('staff')),false);
 assert.ok(await page.$eval('#previewBar',e=>e.classList.contains('hidden')));
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker-role')&&JSON.parse(localStorage.getItem('asker-role')).me),null,'the preview is never kept as his role');
 await page.click('#settingsBtn');
 await page.waitForSelector('#staffAdmin:not(.hidden)');
 // a new link, then stopped
 await page.click('#stfRows [data-stf-link]');
 await page.waitForFunction(()=>/الرابط القديم مبقاش شغال/.test(document.getElementById('stfStatus').textContent));
 assert.match(await page.evaluate(()=>decodeURIComponent(window.__opened)),/#staff=b{64}/);
 await page.click('#stfRows [data-stf-stop]');
 await page.waitForFunction(()=>/اتوقف/.test(document.getElementById('stfStatus').textContent));
 assert.equal((await table('ar_staff'))[0].active,false);
 assert.match(await text(page,'#stfRows .stf-head'),/موقوف/);
 assert.ok(await page.$eval('#stfRows [data-perm="tempsale"]',e=>e.disabled),'a stopped account cannot be changed until it is on again');
 // what he did, under his name
 await page.evaluate(()=>{window.__tables.ar_activity=[{user_id:window.__tables.ar_staff[0].user_id,at:new Date().toISOString(),tbl:'ar_temp_sales',op:'insert',info:{no:14,n:3,total:274.7}},{user_id:window.__tables.ar_staff[0].user_id,at:new Date().toISOString(),tbl:'ar_shortages',op:'delete',info:{name:'ITEM X'}}]});
 await page.click('#stfRows [data-stf-log] summary');
 await page.waitForSelector('#stfRows .stf-act');
 assert.match(await text(page,'#stfRows .stf-log'),/سجّل بيعة مؤقتة \(#14 · 3 صنف · 274.7 ج\)[\s\S]*شال من النواقص «ITEM X»/);
});
run('Staff: a staff member sees only the sections open for him',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('__fakeTables',JSON.stringify({ar_staff:[{user_id:'u1',name:'موظف تجربة',perms:['tempsale','expiry'],active:true}]})));
 await page.reload();
 await page.waitForFunction(()=>document.documentElement.classList.contains('staff'));
 // his home: one button per open section, his name; no owner home, no search on top (not opened), no logout, no staff list
 await page.waitForSelector('#staffHomePanel:not(.hidden) [data-stf-go]');
 assert.match(await text(page,'#staffHomePanel h2'),/أهلاً موظف تجربة/);
 assert.deepEqual(await page.$$eval('#staffHomePanel [data-stf-go]',b=>b.map(x=>x.dataset.stfGo)),['expiry','tempsale']);
 const shown=sel=>page.$eval(sel,e=>getComputedStyle(e).display!=='none'&&!e.classList.contains('hidden'));
 assert.equal(await shown('#homePanel'),false);assert.equal(await shown('.topsearch'),false);assert.equal(await shown('#logoutBtn'),false);
 assert.equal(await shown('[data-group="accounts"]'),false);assert.equal(await shown('[data-group="care"]'),false);
 assert.equal(await shown('[data-group="purchases"]'),true);assert.equal(await shown('[data-group="sales"]'),true);
 // «المشتريات» opens straight on his one open tab there; the other tabs are not there
 await page.click('[data-group="purchases"]');
 assert.ok(await shown('#expiryPanel'));assert.equal(await shown('#shortPanel'),false);
 assert.equal(await shown('.subbar [data-tab="short"]'),false);assert.equal(await shown('.subbar [data-tab="expiry"]'),true);
 // a closed tab asked for by the code still lands on an open one
 await page.evaluate(()=>window.AskerApp.showTab('customers'));
 assert.equal(await shown('#customersPanel'),false);assert.ok(await shown('#staffHomePanel'));
 // the temp sale: no «مرتجع», no credit customers (not opened), and no «اتدخلت» for him
 await page.click('#staffHomePanel [data-stf-go="tempsale"]');
 await page.waitForSelector('#tempSalePanel:not(.hidden)');
 assert.equal(await shown('[data-ts-type="return"]'),false);
 assert.equal(await page.$('#tsCust [data-ts-credit]'),null);
 assert.ok(await page.$('#tsCust [data-ts-cash]'));
 // the settings: no staff list for him, but a way out of this account (the owner tried his own link: «مش عارف اخرج منه»)
 await page.click('#settingsBtn');
 assert.equal(await shown('#staffAdmin'),false);
 assert.equal(await shown('#staffOut'),true);
 page.once('dialog',d=>d.accept());
 await page.click('#staffLogout');
 await page.waitForFunction(()=>!document.getElementById('loginCard').classList.contains('hidden'));
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('staff')),false);
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker-role')),null);
 await page.evaluate(()=>{localStorage.removeItem('__fakeTables');window.__fakeSignedOut=false});
},{home:true});
run('Staff: a stopped account sees nothing but the message',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('__fakeTables',JSON.stringify({ar_staff:[{user_id:'u1',name:'موظف تجربة',perms:['tempsale'],active:false}]})));
 await page.reload();
 await page.waitForFunction(()=>document.documentElement.classList.contains('staff-off'));
 assert.match(await text(page,'#staffHomePanel'),/حسابك متوقف/);
 assert.equal(await page.$eval('.bottomnav',e=>getComputedStyle(e).display),'none');
 await page.evaluate(()=>localStorage.removeItem('__fakeTables'));
},{home:true});
run('Staff: the personal link signs him in and leaves the address clean',async({page,base})=>{
 page.on('dialog',d=>d.accept());
 await page.goto('about:blank'); // a fresh page, as when the link is opened from WhatsApp
 await page.goto(base+'asker-nawaqes-arabic.html#staff='+'c'.repeat(64));
 await page.waitForFunction(()=>window.__fakeSession);
 assert.equal(await page.evaluate(()=>window.__staffLogin),'c'.repeat(64));
 assert.deepEqual(await page.evaluate(()=>window.__fakeSession),{access_token:'at',refresh_token:'rt'});
 assert.equal(await page.evaluate(()=>location.hash),'','the secret is not left in the address');
},{home:true});
