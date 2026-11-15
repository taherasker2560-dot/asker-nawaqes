// «الرئيسية»: his own buttons (ar/shortcuts.js, owner 2026-11-15: «اقدر من البوت اشيل النواقص من الرئيسية، واحط اي حاجة تانية …
// لحد 10 12 حاجه يبقوا في الوش»). The first time the six it always had; «✏️ عدّل الزراير» takes off, adds and orders them; the 📌
// inside a section puts it on the home or takes it off; at most 12; kept on this phone.
const {run,assert}=require('./harness.cjs');
const names=(page,sel)=>page.$$eval(sel,b=>b.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
const ready=(page)=>page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
run('home buttons: his own, up to 12, in his order; the 📌 inside a section',async({page})=>{
 const home='#homePanel .qa button';
 assert.deepEqual(await names(page,home),['النواقص','الوارد','الطلبيات','الفواتير','البيع المؤقت','المخزون'],'the first time: the six it always had');
 // a button opens its section
 await page.click('#homePanel .qa [data-go="docs"]');assert.ok(await page.isVisible('#docsPanel'));
 await page.click('[data-group="home"]');
 // «✏️ عدّل الزراير»: «النواقص» off, «الموردين» on, and up to the top
 await page.click('#qaEdit');assert.ok(await page.isVisible('#qaSheet .qa-sheet-in'));
 assert.match(await page.textContent('#qaSheet h3'),/6 من 12 زرار/);
 await page.click('#qaSheet .qa-row.on [data-qa-flip="short"]');
 await page.click('#qaSheet [data-qa-flip="vendors"]');
 for(let i=0;i<5;i++)await page.click('#qaSheet [data-qa-up="vendors"]');
 const mine=['الموردين','الوارد','الطلبيات','الفواتير','البيع المؤقت','المخزون'];
 assert.deepEqual(await names(page,'#qaSheet .qa-row.on .qa-l'),mine);
 assert.ok(await page.$eval('#qaSheet [data-qa-up="vendors"]',b=>b.disabled),'the first one has no ▲');
 await page.click('#qaDone');assert.ok(!(await page.isVisible('#qaSheet .qa-sheet-in')));
 assert.deepEqual(await names(page,home),mine,'the home changed at once');
 // kept on this phone
 await page.reload();await ready(page);
 assert.deepEqual(await names(page,home),mine,'still there after a reload');
 // the 📌 inside a section: «الحقائب» goes on the home, and off again from the note
 await page.click('[data-group="purchases"]');await page.click('[data-tab="bags"]');
 const pin='[data-pfor="short"] .qa-pin';
 assert.ok(await page.isVisible(pin));
 assert.equal(await page.getAttribute(pin,'aria-pressed'),'false');
 const box=await page.$eval(pin,b=>{const r=b.getBoundingClientRect();return [r.left,r.right]});
 assert.ok(box[0]>=0&&box[1]<=412,'the 📌 is in sight at the end of the row');
 await page.click(pin);
 assert.equal(await page.getAttribute(pin,'aria-pressed'),'true');
 assert.match(await page.textContent('#qaToast'),/الحقائب\s*بقى في الرئيسية/);
 assert.deepEqual(await names(page,home),[...mine,'الحقائب']);
 await page.click('#qaToast [data-qa-undo]');
 assert.equal(await page.getAttribute(pin,'aria-pressed'),'false');
 assert.deepEqual(await names(page,home),mine);
 // a section already on the home shows a lit 📌; the page still fits the phone
 await page.click('[data-group="accounts"]');await page.click('[data-tab="vendors"]');
 assert.equal(await page.getAttribute('.subbar[data-for="accounts"] .qa-pin','aria-pressed'),'true');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
 // «الرسايل» has no small tabs: its 📌 sits on top of it
 await page.click('[data-group="care"]');assert.ok(await page.isVisible('#carePanel .qa-pin'));
 // at most 12: a full home refuses the 13th with a note
 await page.evaluate(()=>localStorage.setItem('asker-home-buttons',JSON.stringify(['short','read','translate','bags','drafts','docs','suppliers','stock','count','expiry','customers','vendors'])));
 await page.reload();await ready(page);
 assert.equal((await names(page,home)).length,12);
 await page.click('[data-group="sales"]');await page.click('[data-tab="sales"]');
 await page.click('.subbar[data-for="sales"] .qa-pin');
 assert.match(await page.textContent('#qaToast'),/مليانة/);
 assert.equal((await names(page,home)).length,12);
 await page.click('[data-group="home"]');await page.click('#qaEdit');
 assert.ok(await page.$eval('#qaSheet [data-qa-flip="sales"]',b=>b.disabled),'«+ ضيف» is off while the home is full');
 // «رجّع الأصلي»: the six again
 await page.click('#qaReset');await page.click('#qaDone');
 assert.deepEqual(await names(page,home),['النواقص','الوارد','الطلبيات','الفواتير','البيع المؤقت','المخزون']);
 // «محتاج شغل» stays right under the buttons
 assert.equal(await page.evaluate(()=>document.querySelector('#homePanel .qa').nextElementSibling.id),'todoCard');
},{home:true});
