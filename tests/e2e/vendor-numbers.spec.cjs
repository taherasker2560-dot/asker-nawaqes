// «📇 أرقام الشركة» (owner 2026-11-20: «تليسيلز هنطلب منه، موزع هنبعتله بيان مرتجعات، محاسب نبعتله كشف حساب ونحدث منه قايمة المخزن»): in a supplier's page the owner picks up to three numbers
// from his number book (a suggestion from the name, a search), and WhatsApp opens on them: the missing-item request on the telesales number, the returns statement on the distributor's, the account
// statement on the accountant's. Made-up companies and people only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const pad=n=>String(n).padStart(2,'0');
const at=(daysAgo,h=12)=>{const d=new Date();d.setDate(d.getDate()-daysAgo);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(h)}:00:00`};
const VENDORS=[
 {id:2278,name:'رضا عطية',short:'SKY',active:true,balance:900,invoices:1,last_invoice_at:at(30),last_payment_at:null,last_payment:null},
 {id:188,name:'IBN SINA 2',short:'IBN',active:true,balance:-500,invoices:1,last_invoice_at:at(2),last_payment_at:at(800),last_payment:100}];
const MOVES=[{id:9,vendor_id:2278,at:at(30),kind:'purchase',code:'10/26/900',inv_date:null,amount:900,total:900,balance:900,lines:[]},{id:5,vendor_id:188,at:at(2),kind:'purchase',code:'11/26/5',inv_date:null,amount:100,total:100,balance:-500,lines:[]}];
const CONTACTS=[
 {phone:'01000000001',name:'المحاسب رضا عطيه',kind:'other',last_item:null,private:true},
 {phone:'01000000002',name:'هاني عطيه محاسب Sky',kind:'other',last_item:null,private:true},
 {phone:'01000000003',name:'موزع رضا عطيه الجديد',kind:'other',last_item:null,private:true},
 {phone:'01000000004',name:'مخزن رضا عطيه (ادهم)',kind:'other',last_item:null,private:true},
 {phone:'01000000005',name:'رضا الحداد',kind:'other',last_item:null,private:true},
 {phone:'01000000006',name:'تليسيلز رضا عطيه',kind:'other',last_item:null,private:true}];
const seed=(page,extra={})=>page.evaluate(([v,m,c,x])=>{Object.assign(window.__tables,{ar_vendors:v,ar_vendor_moves:m,ar_store_items:[],ar_vendor_links:[],ar_contacts:c,ar_vendor_contacts:[]},x);
 window.__wa=[];window.AskerApp.openWhatsApp=(t,p)=>{window.__wa.push({t,p})}},[VENDORS,MOVES,CONTACTS,extra]);
const openVendor=async(page,id)=>{await page.click('[data-group="accounts"]');await page.click('.subbar[data-for="accounts"] [data-tab="vendors"]');await page.waitForSelector('#veRows .ve-row');await page.click(`[data-ve-open="${id}"]`);await page.waitForSelector('#veStHead .vn-card')};
const slots=(page)=>page.$$eval('#veStHead .vn-slot',(s)=>s.map((x)=>x.innerText.replace(/\s+/g,' ').trim()));

run('Company numbers: three empty places, the suggestions from the name, one tap sets a number, another replaces it, «شيله» removes it; the account statement goes to the accountant',async({page})=>{
 await seed(page);
 await openVendor(page,2278);
 assert.deepEqual(await slots(page),['التليسيلز الطلبات و«طلب مش موجود» لسه ما اتحددش','الموزع بيان المرتجعات لسه ما اتحددش','المحاسب كشف الحساب وقايمة المخزن لسه ما اتحددش']);
 // no accountant yet: the statement's link opens WhatsApp with no number (he picks the chat)
 await page.click('[data-ve-link-send]');
 await page.waitForFunction(()=>window.__wa.length===1);
 assert.equal(await page.evaluate(()=>window.__wa[0].p),'');
 assert.ok(!(await text(page,'#veStHead')).includes('هيروح للمحاسب'));
 // the picker: what the company's name points to (two words «رضا عطية» in the name), with the job its name says marked; «رضا الحداد» and «هاني عطيه محاسب» are not offered (search finds them)
 await page.click('[data-vn-pick]');
 await page.waitForSelector('#vnRows .vn-sg');
 assert.deepEqual(await page.$$eval('#vnRows .vn-who b',(b)=>b.map((x)=>x.textContent)),['المحاسب رضا عطيه','تليسيلز رضا عطيه','موزع رضا عطيه الجديد','مخزن رضا عطيه (ادهم)']);
 const guess=await page.$$eval('#vnRows .vn-sg',(rows)=>rows.map((r)=>[...r.querySelectorAll('.vn-pk.guess')].map((x)=>x.dataset.vnSet)));
 assert.deepEqual(guess,[['accountant'],['telesales'],['distributor'],['distributor']],'a name that says «محاسب» points to the accountant, «تليسيلز» to telesales, «موزع» / «مخزن» to the distributor');
 // one tap: the accountant. Saved as that company's, the slot shows the name and the number
 await page.click('#vnRows [data-vn-set="accountant"][data-phone="01000000001"]');
 await page.waitForFunction(()=>window.__fakeWrites.some((w)=>w.table==='ar_vendor_contacts'));
 const w=(await page.evaluate(()=>window.__fakeWrites)).filter((x)=>x.table==='ar_vendor_contacts');
 assert.equal(w.length,1);assert.equal(w[0].k,'upsert');
 assert.deepEqual({...w[0].v[0],updated_at:'x'},{vendor_id:2278,role:'accountant',phone:'01000000001',name:'المحاسب رضا عطيه',updated_at:'x'});
 await page.waitForSelector('#veStHead .vn-slot.set');
 assert.match((await slots(page))[2],/المحاسب كشف الحساب وقايمة المخزن المحاسب رضا عطيه 01000000001 شيله/);
 // the picker stays open for the next ones: telesales and the distributor
 await page.click('#vnRows [data-vn-set="telesales"][data-phone="01000000006"]');
 await page.waitForFunction(()=>(window.__tables.ar_vendor_contacts||[]).length===2);
 await page.click('#vnRows [data-vn-set="distributor"][data-phone="01000000003"]');
 await page.waitForFunction(()=>(window.__tables.ar_vendor_contacts||[]).length===3);
 assert.deepEqual((await page.evaluate(()=>window.__tables.ar_vendor_contacts.map((r)=>[r.role,r.phone]))).sort(),[['accountant','01000000001'],['distributor','01000000003'],['telesales','01000000006']]);
 assert.equal(await page.$$eval('#vnRows .vn-pk.on',(b)=>b.length),3,'the roles taken are marked');
 // another number for the distributor replaces the first (one number per job)
 await page.click('#vnRows [data-vn-set="distributor"][data-phone="01000000004"]');
 await page.waitForFunction(()=>window.__tables.ar_vendor_contacts.find((r)=>r.role==='distributor').phone==='01000000004');
 assert.equal(await page.evaluate(()=>window.__tables.ar_vendor_contacts.length),3);
 // a search finds the ones the name did not point to
 await page.fill('#vnQ','عطيه');
 assert.ok((await page.$$eval('#vnRows .vn-who b',(b)=>b.map((x)=>x.textContent))).includes('هاني عطيه محاسب Sky'));
 await page.fill('#vnQ','zzzz');
 assert.match(await text(page,'#vnRows'),/مفيش حد بالاسم ده في دفترك/);
 await page.fill('#vnQ','');
 // the account statement now opens WhatsApp on the accountant's number
 assert.match(await text(page,'#veStHead'),/هيروح للمحاسب: المحاسب رضا عطيه/);
 await page.click('[data-ve-link-send]');
 await page.waitForFunction(()=>window.__wa.length===2);
 const wa=await page.evaluate(()=>window.__wa[1]);
 assert.equal(wa.p,'01000000001');assert.match(wa.t,/ده رابط كشف حساب شركة رضا عطية/);
 // remove one: the slot is empty again and the row is gone
 await page.click('[data-vn-clear="telesales"]');
 await page.waitForFunction(()=>window.__tables.ar_vendor_contacts.length===2);
 assert.match((await slots(page))[0],/لسه ما اتحددش/);
 assert.ok(!(await page.evaluate(()=>window.__tables.ar_vendor_contacts.some((r)=>r.role==='telesales'))));
 // another company has its own places; its link has no number
 await page.click('[data-ve-back]');await page.waitForSelector('#veListView:not(.hidden)');
 await page.click('[data-ve-open="188"]');await page.waitForSelector('#veStHead .vn-card');
 assert.deepEqual((await slots(page)).map((s)=>/لسه ما اتحددش/.test(s)),[true,true,true]);
 await page.click('[data-ve-link-send]');await page.waitForFunction(()=>window.__wa.length===3);
 assert.equal(await page.evaluate(()=>window.__wa[2].p),'');
});

run('Company numbers: the people saved in «الوارد» are offered first (the sales people who send the lists and carry out the orders), the company\'s own first; one already saved shows as taken',async({page})=>{
 await page.evaluate(()=>{});
 await seed(page,{ar_suppliers:[{name:'مخزن ايه ام جروب (محمد كمال)',phone:'201000009001'},{name:'مخزن رضا عطيه (بهاء)',phone:'201000009006'},{name:'مخزن رضا عطيه (ادهم)',phone:'201000009002'},{name:'شركه ابن سينا (محمد صبرى)',phone:'201000009008'}],
  ar_vendors:[...VENDORS,{id:2374,name:'A M group',short:'AMG',active:true,balance:3120,invoices:3,last_invoice_at:at(1),last_payment_at:null,last_payment:null}],
  ar_vendor_moves:[...MOVES,{id:14,vendor_id:2374,at:at(1),kind:'purchase',code:'11/26/300',inv_date:null,amount:1100,total:1100,balance:3120,lines:[]}],
  ar_vendor_contacts:[{vendor_id:2374,role:'telesales',phone:'01000009001',name:'مخزن ايه ام جروب (محمد كمال)'}]});
 await openVendor(page,2278);
 await page.click('[data-vn-pick]');
 await page.waitForSelector('#vnRows .vn-h');
 assert.match(await text(page,'#vnRows .vn-h'),/مسجلين في «الوارد»: بيبعتوا القوايم وبينفذوا الطلبيات/);
 // «رضا عطية»'s own people first, then the others saved there; the name of the person as saved in «الوارد», the number as the book writes it
 const rows=await page.$$eval('#vnRows .vn-sg',(r)=>r.map((x)=>[x.querySelector('.vn-who b').textContent,x.querySelector('.vn-who small').textContent.trim()]));
 assert.deepEqual(rows.slice(0,4),[['مخزن رضا عطيه (ادهم)','01000009002'],['مخزن رضا عطيه (بهاء)','01000009006'],['شركه ابن سينا (محمد صبرى)','01000009008'],['مخزن ايه ام جروب (محمد كمال)','01000009001']]);
 // an inbox person is a sales person: telesales is the highlighted job
 assert.equal(await page.$$eval('#vnRows .vn-sg:first-of-type .vn-pk.guess',(b)=>b.map((x)=>x.dataset.vnSet).join()),'telesales');
 // the book's own suggestions come after, under their own heading
 assert.match(await text(page,'#vnRows'),/من دفترك/);
 // one tap on an inbox person: saved with the name as saved in «الوارد»
 await page.click('#vnRows [data-vn-set="telesales"][data-phone="01000009002"]');
 await page.waitForFunction(()=>window.__fakeWrites.some((w)=>w.table==='ar_vendor_contacts'));
 const w=(await page.evaluate(()=>window.__fakeWrites)).filter((x)=>x.table==='ar_vendor_contacts');
 assert.deepEqual({...w[0].v[0],updated_at:'x'},{vendor_id:2278,role:'telesales',phone:'01000009002',name:'مخزن رضا عطيه (ادهم)',updated_at:'x'});
 assert.match((await slots(page))[0],/مخزن رضا عطيه \(ادهم\) 01000009002/);
 // the search covers them
 await page.fill('#vnQ','بهاء');
 assert.deepEqual(await page.$$eval('#vnRows .vn-who b',(b)=>b.map((x)=>x.textContent)),['مخزن رضا عطيه (بهاء)']);
 // a company the names do not fit (Latin name here, Arabic there): all of them are offered, and the one already saved as its telesales is marked taken
 await page.click('[data-ve-back]');await page.waitForSelector('#veListView:not(.hidden)');
 await page.click('[data-ve-open="2374"]');await page.waitForSelector('#veStHead .vn-card');
 assert.match((await slots(page))[0],/مخزن ايه ام جروب \(محمد كمال\) 01000009001/);
 await page.click('[data-vn-pick]');await page.waitForSelector('#vnRows .vn-sg');
 assert.equal(await page.$$eval('#vnRows .vn-sg',(r)=>r.length>=4),true,'all four inbox people are there');
 assert.equal(await page.$$eval('#vnRows .vn-pk.on',(b)=>b.map((x)=>x.dataset.phone+':'+x.dataset.vnSet).join()),'01000009001:telesales');
});

run('Company numbers: the missing-item request opens WhatsApp on the telesales number; no number = «انسخ» as before; staff see none of it',async({page})=>{
 await seed(page,{ar_vendor_contacts:[{vendor_id:10,role:'telesales',phone:'01012345678',name:'تليسيلز مثال'},{vendor_id:10,role:'accountant',phone:'01099990000',name:'محاسب مثال'}],ar_waitlist:[{id:1,status:'waiting'}]});
 await page.evaluate(()=>{window.__calls=[];window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{
  ar_waitlist_overview:()=>({ok:true,waiting:[],call:[],leftover:[],vendors:[{id:10,name:'المتحدة للأدوية',short:'UNIT',kind:'warehouse'},{id:11,name:'مورد من غير رقم',short:'NONE',kind:'warehouse'}]}),
  ar_waitlist_add:(a)=>{window.__calls.push(a);return {ok:true,id:1,status:'waiting'}}});
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied=t}},configurable:true})});
 await page.click('[data-group="purchases"]');await page.click('[data-pgroup="orders"]');await page.click('[data-tab="wait"]');await page.waitForSelector('[data-wl-new]');
 await page.click('[data-wl-new]');
 await page.fill('#wlItem','NEWDRUG 10MG');await page.waitForSelector('[data-wl-typed]');await page.click('[data-wl-typed]');
 await page.fill('#wlPhone','01055550000');
 // no supplier: the buttons are the old ones
 assert.equal(await page.$('[data-wl-save="wa"]'),null);
 // a supplier with no telesales number: the same
 await page.selectOption('#wlVendor','11');
 assert.equal(await page.$('[data-wl-save="wa"]'),null);assert.equal(await page.getAttribute('[data-wl-save="copy"]','class'),'py-p');
 // a supplier with one: «سجّل وابعت للتليسيلز» first, «انسخ» second
 await page.selectOption('#wlVendor','10');
 assert.equal((await page.textContent('[data-wl-save="wa"]')).trim(),'سجّل وابعت للتليسيلز على واتساب');
 assert.match(await text(page,'#wlTele'),/التليسيلز: تليسيلز مثال 01012345678/);
 assert.equal(await page.getAttribute('[data-wl-save="copy"]','class'),'secondary');
 await page.click('[data-wl-save="wa"]');
 await page.waitForFunction(()=>window.__wa.length===1);
 const wa=await page.evaluate(()=>window.__wa[0]);
 assert.equal(wa.p,'01012345678','on the telesales number, not the accountant\'s');
 assert.equal(wa.t,'السلام عليكم\nمحتاج علبة NEWDRUG 10MG لو متوفر.\nابعتلي السعر والخصم.\nشكرًا.');
 assert.doesNotMatch(wa.t,/\d{8,}/,'no number of the customer goes to the supplier');
 assert.deepEqual(await page.evaluate(()=>window.__calls.map((c)=>[c.p_item_name,c.p_phone,c.p_vendor_id])),[['NEWDRUG 10MG','01055550000',10]]);
 await page.waitForFunction(()=>/اتفتح الواتس على التليسيلز/.test(document.getElementById('wlStatus').textContent));
 assert.equal(await text(page,'#wlStatus'),'اتسجّل. اتفتح الواتس على التليسيلز ومعاه الرسالة: دوس إرسال هناك.');
 // «انسخ» still copies and opens nothing
 await page.click('[data-wl-new]');await page.fill('#wlItem','OTHERDRUG');await page.waitForSelector('[data-wl-typed]');await page.click('[data-wl-typed]');await page.fill('#wlPhone','01066660000');
 await page.selectOption('#wlVendor','10');await page.click('[data-wl-save="copy"]');
 await page.waitForFunction(()=>window.__calls.length===2);
 assert.equal(await page.evaluate(()=>window.__wa.length),1,'copying opens nothing');
 assert.match(await page.evaluate(()=>window.__copied),/OTHERDRUG/);
 // staff: no telesales button, no copy button (they do not choose a supplier)
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;return window.AskerWait.open()});
 await page.click('[data-wl-new]');
 assert.equal(await page.$('[data-wl-save="wa"]'),null);assert.equal(await page.$('[data-wl-save="copy"]'),null);assert.ok(await page.$('[data-wl-save="only"]'));
});

// owner 2026-11-21: «عايز اعمل طلب انتظار ومش عارف اضيف رقم المخزن … مش عارف اضيف رقم واحد منهم»: the number is added from the form itself, and a number can be typed
const waitSeed=async(page)=>{
 await seed(page,{ar_suppliers:[{name:'مخزن النور (هاني)',phone:'201033334444'},{name:'مخزن مورد تجربة (سامي)',phone:'201011112222'}],ar_waitlist:[{id:1,status:'waiting'}]});
 await page.evaluate(()=>{window.__calls=[];window.__fakeRpcs=Object.assign(window.__fakeRpcs||{},{
  ar_waitlist_overview:()=>({ok:true,waiting:[],call:[],leftover:[],vendors:[{id:11,name:'مورد تجربة',short:'EXP',kind:'warehouse'},{id:12,name:'مورد تاني',short:'TWO',kind:'warehouse'}]}),
  ar_waitlist_add:(a)=>{window.__calls.push(a);return {ok:true,id:1,status:'waiting'}}})});
};
const openForm=async(page)=>{
 await page.click('[data-group="purchases"]');await page.click('[data-pgroup="orders"]');await page.click('[data-tab="wait"]');await page.waitForSelector('[data-wl-new]');
 await page.click('[data-wl-new]');
 await page.fill('#wlItem','NEWDRUG 10MG');await page.waitForSelector('[data-wl-typed]');await page.click('[data-wl-typed]');
 await page.fill('#wlPhone','01055550000');
};
const vcWrites=(page)=>page.evaluate(()=>window.__fakeWrites.filter((w)=>w.table==='ar_vendor_contacts').map((w)=>({k:w.k,v:{...w.v[0],updated_at:'x'}})));

run('Missing-item form: a supplier with no telesales number gets «+ ضيف رقم» (the people of «الوارد» first, the book, a typed number); one tap saves it and the WhatsApp button appears',async({page})=>{
 await waitSeed(page);
 await openForm(page);
 // no supplier chosen: nothing to add a number to
 assert.equal(await text(page,'#wlTele'),'');
 await page.selectOption('#wlVendor','11');
 assert.match(await text(page,'#wlTele'),/مفيش رقم للتليسيلز عند المورد ده/);
 assert.equal(await page.$('[data-wl-save="wa"]'),null,'no number yet: only the old buttons');
 await page.click('[data-wl-numopen]');
 await page.waitForSelector('#wlNumRows .vn-sg');
 // «الوارد» first, the supplier\'s own people before the others; one job per row: telesales
 assert.match(await text(page,'#wlNumRows'),/مسجلين في «الوارد»: بيبعتوا القوايم وبينفذوا الطلبيات/);
 assert.deepEqual(await page.$$eval('#wlNumRows .vn-who b',(b)=>b.map((x)=>x.textContent)),['مخزن مورد تجربة (سامي)','مخزن النور (هاني)']);
 assert.deepEqual(await page.$$eval('#wlNumRows .vn-sg',(r)=>r.map((x)=>[...x.querySelectorAll('button')].map((b)=>b.dataset.wlNumset+':'+b.textContent.trim()).join())),['01011112222:التليسيلز','01033334444:التليسيلز']);
 // the search covers them and does not lose its focus
 await page.fill('#wlNQ','هاني');
 assert.deepEqual(await page.$$eval('#wlNumRows .vn-who b',(b)=>b.map((x)=>x.textContent)),['مخزن النور (هاني)','هاني عطيه محاسب Sky'],'the search covers «الوارد» first and then the book');
 assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.id),'wlNQ');
 await page.fill('#wlNQ','');
 // what was typed above stays
 assert.equal(await page.inputValue('#wlPhone'),'01055550000');
 // one tap on a person: saved as THIS supplier\'s telesales (one row per supplier and job), the picker closes, the first save button is WhatsApp now
 await page.click('[data-wl-numset="01011112222"]');
 await page.waitForFunction(()=>window.__fakeWrites.some((w)=>w.table==='ar_vendor_contacts'));
 assert.deepEqual(await vcWrites(page),[{k:'upsert',v:{vendor_id:11,role:'telesales',phone:'01011112222',name:'مخزن مورد تجربة (سامي)',updated_at:'x'}}]);
 await page.waitForSelector('[data-wl-save="wa"]');
 assert.equal(await page.$('#wlNumRows'),null,'the picker is closed');
 assert.match(await text(page,'#wlTele'),/التليسيلز: مخزن مورد تجربة \(سامي\) 01011112222\s*غيّره/);
 assert.equal(await page.inputValue('#wlPhone'),'01055550000','the form keeps what was typed');
 await page.click('[data-wl-save="wa"]');
 await page.waitForFunction(()=>window.__wa.length===1);
 assert.equal(await page.evaluate(()=>window.__wa[0].p),'01011112222','WhatsApp opens on the number just added');
 assert.deepEqual(await page.evaluate(()=>window.__calls.map((c)=>[c.p_item_name,c.p_phone,c.p_vendor_id])),[['NEWDRUG 10MG','01055550000',11]]);
 // the same number is on the company\'s card («الموردين ← أرقام الشركة»): one row, two places
 assert.deepEqual(await page.evaluate(()=>window.__tables.ar_vendor_contacts.map((r)=>[r.vendor_id,r.role,r.phone])),[[11,'telesales','01011112222']]);
});

run('Missing-item form: a number typed (Arabic digits, with or without a name) is saved; a wrong one is refused with a line; «غيّره» replaces the number; staff see none of it',async({page})=>{
 await waitSeed(page);
 await openForm(page);
 await page.selectOption('#wlVendor','12');
 await page.click('[data-wl-numopen]');await page.waitForSelector('#wlNP');
 // not a number: a line, nothing saved
 await page.fill('#wlNP','123');await page.fill('#wlNN','مخزن التجربة');
 await page.click('[data-wl-numtyped]');
 await page.waitForSelector('#wlTele .status.bad');
 assert.equal(await text(page,'#wlTele .status.bad'),'الرقم لازم يكون أرقام بس، من 8 لـ 15 رقم.');
 assert.deepEqual(await vcWrites(page),[]);
 assert.equal(await page.inputValue('#wlNP'),'123','what he typed stays for him to fix');assert.equal(await page.inputValue('#wlNN'),'مخزن التجربة');
 // a number that is in neither «الوارد» nor his phone: typed with Arabic digits and a name
 await page.fill('#wlNP','٠١٠٥٥٥٥٦٦٦٦');
 await page.click('[data-wl-numtyped]');
 await page.waitForFunction(()=>window.__fakeWrites.some((w)=>w.table==='ar_vendor_contacts'));
 assert.deepEqual(await vcWrites(page),[{k:'upsert',v:{vendor_id:12,role:'telesales',phone:'01055556666',name:'مخزن التجربة',updated_at:'x'}}]);
 await page.waitForSelector('[data-wl-save="wa"]');
 assert.match(await text(page,'#wlTele'),/التليسيلز: مخزن التجربة 01055556666\s*غيّره/);
 // «غيّره»: the picker again; a number with no name at all replaces it (the line then shows the number)
 await page.click('[data-wl-numopen]');await page.waitForSelector('#wlNP');
 assert.equal(await page.inputValue('#wlNP'),'','the boxes are empty again');
 await page.fill('#wlNP','+20 10 9999-8888');
 await page.click('[data-wl-numtyped]');
 await page.waitForFunction(()=>window.__fakeWrites.filter((w)=>w.table==='ar_vendor_contacts').length===2);
 const w2=await vcWrites(page);
 assert.deepEqual(w2[1],{k:'upsert',v:{vendor_id:12,role:'telesales',phone:'01099998888',name:null,updated_at:'x'}});
 await page.waitForFunction(()=>/التليسيلز: 01099998888/.test(document.getElementById('wlTele').innerText.replace(/\s+/g,' ')));
 assert.deepEqual(await page.evaluate(()=>window.__tables.ar_vendor_contacts.map((r)=>[r.vendor_id,r.role,r.phone])),[[12,'telesales','01099998888']],'one number per supplier and job: replaced, not added');
 // the other supplier is untouched; changing the supplier closes an open picker
 await page.selectOption('#wlVendor','11');
 assert.match(await text(page,'#wlTele'),/مفيش رقم للتليسيلز عند المورد ده/);
 await page.click('[data-wl-numopen]');await page.waitForSelector('#wlNP');
 await page.selectOption('#wlVendor','12');
 assert.equal(await page.$('#wlNP'),null);
 // staff: no supplier box, so no line (the table is the owner\'s)
 await page.click('[data-wl-close]');
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true;return window.AskerWait.open()});
 await page.click('[data-wl-new]');
 assert.equal(await page.$('#wlVendor'),null);assert.equal(await text(page,'#wlTele'),'');
});

run('Company numbers: a number typed in the card (not in his book or «الوارد») is saved for the job he taps; the name is optional; a wrong one is refused',async({page})=>{
 await seed(page);
 await openVendor(page,2278);
 await page.click('[data-vn-pick]');await page.waitForSelector('#vnTP');
 // the typed block: two boxes and the three jobs
 assert.deepEqual(await page.$$eval('#veStHead [data-vn-typed]',(b)=>b.map((x)=>x.dataset.vnTyped)),['telesales','distributor','accountant']);
 await page.fill('#vnTP','abc');await page.click('[data-vn-typed="accountant"]');
 await page.waitForSelector('#veStHead .status.bad');
 assert.equal(await text(page,'#veStHead .status.bad'),'الرقم لازم يكون أرقام بس، من 8 لـ 15 رقم.');
 assert.deepEqual(await vcWrites(page),[]);
 assert.equal(await page.inputValue('#vnTP'),'abc');
 await page.fill('#vnTP','٠١٠١٢٣٤٥٦٧٨');await page.fill('#vnTN','مخزن جديد');
 await page.click('[data-vn-typed="distributor"]');
 await page.waitForFunction(()=>window.__fakeWrites.some((w)=>w.table==='ar_vendor_contacts'));
 assert.deepEqual(await vcWrites(page),[{k:'upsert',v:{vendor_id:2278,role:'distributor',phone:'01012345678',name:'مخزن جديد',updated_at:'x'}}]);
 await page.waitForSelector('#veStHead .vn-slot.set');
 assert.match((await slots(page))[1],/الموزع بيان المرتجعات مخزن جديد 01012345678 شيله/);
 assert.equal(await page.$('#veStHead .status.bad'),null,'the line is gone after a good save');
 // the boxes are empty for the next one, the picker is still open; no name: the slot shows the number only
 assert.equal(await page.inputValue('#vnTP'),'');assert.equal(await page.inputValue('#vnTN'),'');
 await page.fill('#vnTP','01099998888');await page.click('[data-vn-typed="telesales"]');
 await page.waitForFunction(()=>(window.__tables.ar_vendor_contacts||[]).length===2);
 assert.deepEqual((await vcWrites(page))[1],{k:'upsert',v:{vendor_id:2278,role:'telesales',phone:'01099998888',name:null,updated_at:'x'}});
 assert.match((await slots(page))[0],/التليسيلز الطلبات و«طلب مش موجود» 01099998888 شيله/);
 // the button that opens it says what it does now
 await page.click('[data-vn-pick-close]');
 assert.equal((await text(page,'[data-vn-pick]')).trim(),'+ ضيف رقم');
});

run('Missing-item form in English: no Arabic left on the «add a number» line, its picker and its typed boxes except names',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('asker-lang','en'));
 await page.reload();
 await page.waitForSelector('[data-group="purchases"]');
 await waitSeed(page);
 await openForm(page);
 await page.selectOption('#wlVendor','11');
 await page.click('[data-wl-numopen]');await page.waitForSelector('#wlNumRows .vn-sg');
 const left=()=>page.evaluate(()=>{const p=document.getElementById('wlTele'),AR=/[؀-ۿ]/,out=[];
  const w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n;
  while((n=w.nextNode())){const e=n.parentElement;if(AR.test(n.nodeValue)&&!e.closest('.notr'))out.push(n.nodeValue.trim())}
  for(const el of p.querySelectorAll('[placeholder],[aria-label]'))for(const a of ['placeholder','aria-label'])if(AR.test(el.getAttribute(a)||''))out.push(a+': '+el.getAttribute(a));
  return out});
 let l=await left();assert.deepEqual(l,[],'Arabic left: '+l.join(' | '));
 await page.fill('#wlNP','12');await page.click('[data-wl-numtyped]');await page.waitForSelector('#wlTele .status.bad');
 l=await left();assert.deepEqual(l,[],'Arabic left in the error line: '+l.join(' | '));
 const t=await text(page,'#wlTele');
 for(const s of ['Or type the number','Save as this supplier\'s telesales','The number must be digits only'])assert.ok(t.includes(s),'missing in English: '+s);
 await page.click('[data-wl-numclose]');
 assert.match(await text(page,'#wlTele'),/No telesales number for this supplier\s*\+ Add a number/);
});

run('Company numbers: the returns statement opens WhatsApp on the distributor; a long one is copied and the chat opens bare; no number, no button; staff get none',async({page})=>{
 const ret=(i,o={})=>({id:i,at:'2026-11-15T16:54:08',no:String(5000+i),code:'~11/26/'+(5000+i),amount:100+i,status:'pending',notice:null,items:[{n:'TEST DRUG 10TAB ÉXTRA LONG NAME FOR A BIG STATEMENT',ar:'',p:1,u:0}],...o});
 const FILE={generated_at:new Date(Date.now()-3600e3).toISOString(),days:60,vendors:[
  {id:7,name:'شركة تجربة',tracked_from:'2026-11-10',notices:2,pending:{n:2,amount:203},handed:{n:0,amount:0},untracked:{n:0,amount:0},returns:[ret(1),ret(2)]},
  {id:8,name:'شركة من غير رقم',tracked_from:'2026-11-10',notices:2,pending:{n:1,amount:101},handed:{n:0,amount:0},untracked:{n:0,amount:0},returns:[ret(3)]},
  {id:9,name:'شركة كبيرة',tracked_from:'2026-11-10',notices:2,pending:{n:80,amount:9000},handed:{n:0,amount:0},untracked:{n:0,amount:0},returns:Array.from({length:80},(_,i)=>ret(100+i,{no:String(70000+i)}))}]};
 await seed(page,{ar_vendor_contacts:[{vendor_id:7,role:'distributor',phone:'01122223333',name:'موزع مثال'},{vendor_id:7,role:'accountant',phone:'01299990000',name:'محاسب مثال'},{vendor_id:9,role:'distributor',phone:'447710173736',name:'موزع برة'}]});
 await page.evaluate((f)=>{window.__storage['returns/returns.json']=JSON.stringify(f);window.__copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied=t}},configurable:true})},FILE);
 await page.click('[data-group="accounts"]');await page.click('[data-tab="vendors"]');
 await page.waitForSelector('#rtBox:not(.hidden)');
 await page.evaluate(()=>window.AskerReturns.load(true));
 assert.ok(await page.$('[data-rt-wa="7"]'));assert.equal(await page.$('[data-rt-wa="8"]'),null,'no distributor number saved: no button');
 assert.match(await text(page,'#rtList .rt-v[data-rt="7"] .rt-body'),/الموزع: موزع مثال/);
 assert.ok(await page.$('[data-rt-copy="8"]'),'«انسخ» stays for every company with something waiting');
 // the short one goes in the link, to the distributor (not the accountant)
 await page.evaluate(()=>{document.querySelector('.rt-v[data-rt="7"]').open=true});
 await page.click('[data-rt-wa="7"]');
 await page.waitForFunction(()=>window.__wa.length===1);
 const a=await page.evaluate(()=>window.__wa[0]);
 assert.equal(a.p,'01122223333');assert.match(a.t,/^كشف مرتجعات صيدلية عسكر\nلدى شركة تجربة/);assert.match(a.t,/الإجمالي: 203 ج$/);
 assert.match(await text(page,'#rtNote'),/اتفتحت محادثة الموزع ومعاها الكشف/);assert.equal(await page.evaluate(()=>window.__copied),'','a short one is not copied');
 // a long one cannot ride in a link: copied, the chat opens bare on his number
 await page.evaluate(()=>{document.querySelector('.rt-v[data-rt="9"]').open=true});
 await page.click('[data-rt-wa="9"]');
 await page.waitForFunction(()=>window.__wa.length===2);
 const b=await page.evaluate(()=>window.__wa[1]);
 assert.equal(b.p,'447710173736');assert.equal(b.t,'');
 assert.match(await page.evaluate(()=>window.__copied),/^كشف مرتجعات صيدلية عسكر\nلدى شركة كبيرة/);
 assert.match(await text(page,'#rtNote'),/الكشف طويل: اتنسخ/);
 // staff: no numbers reach them (the table is the owner's), so no button
 await page.evaluate(()=>{window.AskerStaff.isStaff=()=>true});
 await page.evaluate(()=>window.AskerReturns.load(true));
 assert.equal(await page.$('[data-rt-wa]'),null);assert.ok(await page.$('[data-rt-copy="7"]'));
});

run('Company numbers in English: no Arabic left on the numbers card and its picker except names',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('asker-lang','en'));
 await page.reload();
 await page.waitForSelector('[data-group="accounts"]');
 await seed(page,{ar_vendor_contacts:[{vendor_id:2278,role:'accountant',phone:'01000000001',name:'المحاسب رضا عطيه'}]});
 await openVendor(page,2278);
 await page.click('[data-vn-pick]');await page.waitForSelector('#vnRows .vn-sg');
 const left=async()=>page.evaluate(()=>{const p=document.getElementById('veStHead'),AR=/[؀-ۿ]/,out=[];
  const w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n;
  while((n=w.nextNode())){const e=n.parentElement;if(AR.test(n.nodeValue)&&!e.closest('.notr'))out.push(n.nodeValue.trim())}
  for(const el of p.querySelectorAll('[placeholder],[aria-label]'))for(const a of ['placeholder','aria-label'])if(AR.test(el.getAttribute(a)||''))out.push(a+': '+el.getAttribute(a));
  return out});
 let l=await left();assert.deepEqual(l,[],'Arabic left: '+l.join(' | '));
 await page.fill('#vnQ','zzzz');l=await left();assert.deepEqual(l,[],'Arabic left in the empty search: '+l.join(' | '));
 const t=await text(page,'#veStHead');
 for(const s of ['Company numbers','Telesales','Distributor','Accountant','Returns statement','Not set yet','It goes to the accountant:'])assert.ok(t.includes(s),'missing in English: '+s);
});
