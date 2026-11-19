// «الرئيسية»: his own buttons (ar/shortcuts.js, owner 2026-11-15: «اقدر من السيستم اشيل النواقص من الرئيسية، واحط اي حاجة تانية …
// لحد 10 12 حاجه يبقوا في الوش»). The first time the six it always had; «✏️ عدّل الزراير» takes off, adds and orders them; the 📌
// inside a section puts it on the home or takes it off; at most 30 (2026-11-19, it was 12); kept on this phone. Press and HOLD a button, drag it where you want it (2026-11-19).
const {run,assert}=require('./harness.cjs');
const names=(page,sel)=>page.$$eval(sel,b=>b.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
const ready=(page)=>page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
run('home buttons: his own, up to 30, in his order; the 📌 inside a section',async({page})=>{
 const home='#homePanel .qa button';
 assert.deepEqual(await names(page,home),['النواقص','الوارد','الطلبيات','الفواتير','البيع المؤقت','المخزون'],'the first time: the six it always had');
 // a button opens its section
 await page.click('#homePanel .qa [data-go="docs"]');assert.ok(await page.isVisible('#docsPanel'));
 await page.click('[data-group="home"]');
 // «✏️ عدّل الزراير»: «النواقص» off, «الموردين» on, and up to the top
 await page.click('#qaEdit');assert.ok(await page.isVisible('#qaSheet .qa-sheet-in'));
 assert.match(await page.textContent('#qaSheet h3'),/6 من 30 زرار/);
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
 // at most 30 (2026-11-19, it was 12): a full home refuses the 31st with a note
 await page.evaluate(()=>localStorage.setItem('asker-home-buttons',JSON.stringify(AskerShortcuts.ALL.map(x=>x[0]).filter(x=>x!=='sales').slice(0,30))));
 await page.reload();await ready(page);
 assert.equal((await names(page,home)).length,30);
 await page.click('[data-group="sales"]');await page.click('[data-tab="sales"]');
 await page.click('.subbar[data-for="sales"] .qa-pin');
 assert.match(await page.textContent('#qaToast'),/مليانة \(30 زرار\)/);
 assert.equal((await names(page,home)).length,30);
 await page.click('[data-group="home"]');await page.click('#qaEdit');
 assert.ok(await page.$eval('#qaSheet [data-qa-flip="sales"]',b=>b.disabled),'«+ ضيف» is off while the home is full');
 // «رجّع الأصلي»: the six again
 await page.click('#qaReset');await page.click('#qaDone');
 assert.deepEqual(await names(page,home),['النواقص','الوارد','الطلبيات','الفواتير','البيع المؤقت','المخزون']);
 // «محتاج شغل» stays right under the buttons
 assert.equal(await page.evaluate(()=>document.querySelector('#homePanel .qa').nextElementSibling.id),'todoCard');
},{home:true});

// ---------- press and hold, then drag (ar/shortcuts.js, owner 2026-11-19) ----------
const centre=async(page,sel)=>{const b=await page.locator(sel).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2}};
const order=(page)=>page.evaluate(()=>[...document.querySelectorAll('#homePanel .qa > button[data-qa]')].map(b=>b.dataset.qa));
const stored=(page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('asker-home-buttons')||'null'));
const lifted=(page)=>page.evaluate(()=>({ghost:document.querySelectorAll('.qa-ghost').length,ph:document.querySelectorAll('.qa-ph').length,body:document.body.classList.contains('qa-dragging')}));
const SIX=['short','read','drafts','docs','tempsale','stock'];
run('home buttons: press and hold lifts a button, drag puts it anywhere, a tap still opens, a swipe only scrolls',async({page})=>{
 assert.deepEqual(await order(page),SIX);
 // a button, held (about half a second) and dragged to the first place; the others make room
 let c=await centre(page,'[data-qa="stock"]');
 await page.mouse.move(c.x,c.y);await page.mouse.down();
 assert.deepEqual(await lifted(page),{ghost:0,ph:0,body:false},'not lifted before the hold');
 await page.waitForTimeout(650);
 assert.deepEqual(await lifted(page),{ghost:1,ph:1,body:true},'lifted: a copy follows the finger, the real one stays as a place-holder');
 const to=await centre(page,'[data-qa="short"]');
 await page.mouse.move(to.x,to.y,{steps:14});
 assert.deepEqual(await order(page),['stock','short','read','drafts','docs','tempsale'],'the others made room while dragging');
 await page.mouse.up();
 assert.deepEqual(await lifted(page),{ghost:0,ph:0,body:false},'let go: nothing stays lifted');
 assert.deepEqual(await order(page),['stock','short','read','drafts','docs','tempsale']);
 assert.deepEqual(await stored(page),['stock','short','read','drafts','docs','tempsale'],'kept on this phone');
 assert.ok(await page.isVisible('#homePanel'),'letting go did not open the section');
 assert.ok(!(await page.isVisible('#stockPanel')));
 // the same after a reload
 await page.reload();await ready(page);
 assert.deepEqual(await order(page),['stock','short','read','drafts','docs','tempsale'],'still in his order after a reload');
 // a quick tap still opens its section
 await page.click('#homePanel [data-qa="short"]');assert.ok(await page.isVisible('#shortPanel'));
 await page.click('[data-group="home"]');
 // held without moving and let go: lifted and put back where it was, and the section does not open
 c=await centre(page,'[data-qa="docs"]');
 await page.mouse.move(c.x,c.y);await page.mouse.down();await page.waitForTimeout(650);
 assert.equal((await lifted(page)).ghost,1);
 await page.mouse.up();await page.waitForTimeout(100);
 assert.deepEqual(await order(page),['stock','short','read','drafts','docs','tempsale'],'held and let go in place: the same order');
 assert.ok(await page.isVisible('#homePanel'));assert.ok(!(await page.isVisible('#docsPanel')),'the let-go after a hold is not a tap');
 await page.waitForTimeout(600);
 // a swipe (it moves before the hold is up) is only scrolling: nothing lifts, however long it goes on
 c=await centre(page,'[data-qa="read"]');
 await page.mouse.move(c.x,c.y);await page.mouse.down();await page.mouse.move(c.x,c.y+40,{steps:4});
 await page.waitForTimeout(700);
 assert.deepEqual(await lifted(page),{ghost:0,ph:0,body:false});
 await page.mouse.up();await page.waitForTimeout(100);
 assert.deepEqual(await order(page),['stock','short','read','drafts','docs','tempsale']);
 // to the last place, too
 await page.waitForTimeout(600);
 c=await centre(page,'[data-qa="stock"]');
 await page.mouse.move(c.x,c.y);await page.mouse.down();await page.waitForTimeout(650);
 const last=await centre(page,'[data-qa="tempsale"]');
 await page.mouse.move(last.x,last.y,{steps:14});
 await page.mouse.up();
 assert.deepEqual(await order(page),['short','read','drafts','docs','tempsale','stock'],'dragged to the last place');
 assert.deepEqual(await stored(page),['short','read','drafts','docs','tempsale','stock']);
 // «محتاج شغل» stays right under the buttons
 assert.equal(await page.evaluate(()=>document.querySelector('#homePanel .qa').nextElementSibling.id),'todoCard');
},{home:true});

run('home buttons: thirty fit, the page scrolls itself while a button is held near the edge, and nothing is lost',async({page})=>{
 const all=await page.evaluate(()=>AskerShortcuts.ALL.map(x=>x[0]).slice(0,30));
 await page.evaluate((l)=>localStorage.setItem('asker-home-buttons',JSON.stringify(l)),all);
 await page.reload();await ready(page);
 assert.equal((await order(page)).length,30);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'thirty buttons still fit the width');
 assert.equal(await page.evaluate(()=>scrollY),0);
 const h=await page.evaluate(()=>innerHeight);
 const c=await centre(page,'#homePanel .qa > button[data-qa]:first-child');
 await page.mouse.move(c.x,c.y);await page.mouse.down();await page.waitForTimeout(650);
 assert.equal((await lifted(page)).ghost,1);
 // near the bottom edge: the page goes down by itself
 await page.mouse.move(c.x,h-110,{steps:6});await page.waitForTimeout(800);
 const down=await page.evaluate(()=>scrollY);assert.ok(down>40,'scrolled down by itself: '+down);
 // near the top edge: back up
 await page.mouse.move(c.x,50,{steps:6});await page.waitForTimeout(900);
 assert.ok(await page.evaluate(()=>scrollY)<down,'and back up');
 await page.mouse.up();
 const after=await order(page);
 assert.equal(after.length,30);assert.deepEqual([...after].sort(),[...all].sort(),'every button is still there, once');
 assert.deepEqual(await stored(page),after,'what is shown is what is kept');
 assert.deepEqual(await lifted(page),{ghost:0,ph:0,body:false});
},{home:true});

run('home buttons: the screens inside a section open that section and scroll to the block; the sheet lists them',async({page})=>{
 await page.evaluate(()=>localStorage.setItem('asker-home-buttons',JSON.stringify(['users','sitelink','newitems','compare','returns','todo'])));
 await page.reload();await ready(page);
 assert.deepEqual(await names(page,'#homePanel .qa button'),['المستخدمين','رابط الموقع','أصناف جديدة','مقارنة الطلبيات','كشف المرتجعات','محتاج شغل']);
 // «رابط الموقع» lives inside the site's page: that page opens and the block comes up near the top (the made-up page is short, so it is made long enough to scroll)
 await page.evaluate(()=>{document.body.style.paddingBottom='2500px'});
 await page.click('#homePanel [data-qa="sitelink"]');assert.ok(await page.isVisible('#storeOrdersPanel'));
 await page.waitForFunction(()=>{const e=document.getElementById('storeLink');return e&&scrollY>0&&Math.abs(e.getBoundingClientRect().top-76)<30},null,{timeout:5000});
 await page.click('[data-group="home"]');
 await page.click('#homePanel [data-qa="users"]');assert.ok(await page.isVisible('#storeOrdersPanel'));await page.click('[data-group="home"]');
 await page.click('#homePanel [data-qa="newitems"]');assert.ok(await page.isVisible('#shortPanel'));await page.click('[data-group="home"]');
 await page.click('#homePanel [data-qa="compare"]');assert.ok(await page.isVisible('#draftsPanel'));await page.click('[data-group="home"]');
 await page.click('#homePanel [data-qa="returns"]');assert.ok(await page.isVisible('#vendorsPanel'));await page.click('[data-group="home"]');
 await page.click('#homePanel [data-qa="todo"]');assert.ok(await page.isVisible('#homePanel'));
 // the sheet: the new screens are there to add, in their groups, and it tells about the hold
 await page.click('#qaEdit');
 assert.match(await page.textContent('#qaSheet h3'),/6 من 30 زرار/);
 assert.match(await page.textContent('#qaSheet'),/دوسة طويلة/);
 for(const t of['sitesettings','repinv','ordneeds','ordnew','whofrom','notes'])assert.ok(await page.isVisible(`#qaSheet [data-qa-flip="${t}"]`),'to add: '+t);
 await page.click('#qaSheet [data-qa-flip="notes"]');
 assert.deepEqual((await stored(page)).slice(-1),['notes']);
 await page.click('#qaDone');
 assert.equal((await order(page)).length,7);
},{home:true});

run('home buttons in English: the new buttons and the sheet',async({page})=>{
 await page.evaluate(()=>{localStorage.setItem('asker-lang','en');localStorage.setItem('asker-home-buttons',JSON.stringify(['users','returns','whofrom']))});
 await page.reload();await ready(page);
 assert.deepEqual(await names(page,'#homePanel .qa button'),['Users','Returns statement','Where an item came from']);
 await page.click('#qaEdit');
 assert.match(await page.textContent('#qaSheet h3'),/3 of 30 buttons/);
 assert.match(await page.textContent('#qaSheet'),/press and hold a button and drag it/);
 await page.evaluate(()=>localStorage.removeItem('asker-lang'));
},{home:true});