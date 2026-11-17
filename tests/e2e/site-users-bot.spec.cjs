// «مستخدمين الموقع» in the bot (owner 2026-11-17): the owner sees how many made an account, opened, installed, «غالبًا شالوه»; the latest users; «باسورد جديد» for
// someone who forgot (a temporary 6-digit one to send on WhatsApp). Made-up people only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const now=Date.now(),iso=(d,h=0)=>new Date(now-d*864e5-h*36e5).toISOString();
const STATS={ok:true,
 users:{total:23,today:2,last7:9,opened_today:5,opened7:14,installed:19,removed:3,android:15,ios:8},
 customers:{opened:14,installed:9},
 recent:[
  {id:7,name:'منى إبراهيم',phone:'01012345678',platform:'android',created_at:iso(0,3),last_seen_at:iso(0,0.01),installed_at:iso(0,3)},
  {id:5,name:'هالة سمير',phone:'01212345678',platform:'ios',created_at:iso(45),last_seen_at:iso(38),installed_at:iso(44)},
  {id:9,name:'كريم حسن',phone:'01112345678',platform:null,created_at:iso(1),last_seen_at:null,installed_at:null}]};

run('Bot: «مستخدمين الموقع» shows the numbers and the latest users, and gives a forgotten password a new temporary one to send on WhatsApp',async({page})=>{
 await page.evaluate(([s])=>{window.__fakeRpcs={ar_site_users_stats:()=>s,ar_site_user_reset:(a)=>({ok:true,password:'483920'})};window.__opened=[]},[STATS]);
 await page.click('[data-group="sales"]');
 await page.waitForSelector('#siteUsers:not([hidden])');
 assert.equal(await text(page,'#suSummary'),'👥 مستخدمين الموقع · 23');
 await page.click('#suSummary');
 await page.waitForSelector('.su-dark .su-big');
 assert.equal(await text(page,'.su-big'),'23');
 assert.equal(await text(page,'.su-sub'),'النهارده 2 · آخر 7 أيام 9');
 assert.deepEqual(await page.$$eval('.su-grid div',d=>d.map(x=>x.textContent.replace(/\s+/g,' ').trim())),['فتحوا آخر 7 أيام14','فتحوا النهارده5','نزّلوا التطبيق19','غالبًا شالوه3']);
 assert.deepEqual(await page.$$eval('.su-card:nth-of-type(2) .su-line',l=>l.map(x=>x.textContent.replace(/\s+/g,' ').trim())),['فتحوا رابط حسابهم14','منهم نزّلوا التطبيق9']);
 // the latest users: who, the phone, android/iphone, when he registered, installed, and when he last opened
 const rows=await page.$$eval('.su-row',r=>r.map(x=>({name:x.querySelector('.su-who strong').textContent,phone:x.querySelector('.su-who span').textContent,chip:x.querySelector('.su-chip').textContent.trim(),gone:x.querySelector('.su-chip').classList.contains('gone'),meta:x.querySelector('.su-meta').textContent.replace(/\s+/g,' ').trim()})));
 assert.deepEqual(rows.map(r=>[r.name,r.phone,r.chip,r.gone]),[['منى إبراهيم','01012345678','دلوقتي',false],['هالة سمير','01212345678','من 38 يوم · غالبًا شاله',true],['كريم حسن','01112345678','ما فتحش',false]]);
 assert.match(rows[0].meta,/^أندرويد/);assert.match(rows[0].meta,/نزّل التطبيق$/);assert.match(rows[1].meta,/^آيفون/);assert.equal(rows[2].meta,'سجّل '+new Date(now-864e5).getDate()+'/'+(new Date(now-864e5).getMonth()+1));
 assert.ok(!/pw_hash|password/i.test(await page.$eval('#siteUsers',e=>e.innerHTML)),'no hash and no password on the card');
 // «باسورد جديد»: asks, then shows the 6 digits and a WhatsApp button with the message (the old password stops on the server)
 page.once('dialog',d=>{assert.match(d.message(),/باسورد جديد للمستخدم ده/);d.accept()});
 await page.click('[data-su-reset="9"]');
 await page.waitForSelector('[data-su="9"] .su-pw');
 assert.equal(await text(page,'[data-su="9"] .su-pw b'),'483920');
 const href=await page.getAttribute('[data-su="9"] .su-pw a','href');
 assert.ok(href.startsWith('https://wa.me/201112345678?text='));
 assert.equal(decodeURIComponent(href.split('?text=')[1]),'أهلًا كريم حسن 🌿\nباسورد موقع صيدلية عسكر الجديد: 483920\nادخل بيه برقمك، ولو عايز تغيّره ابعتلنا.');
 assert.deepEqual(await page.evaluate(()=>window.__fakeCalls||null),null);
},{home:true});

run('Bot: «مستخدمين الموقع» stays away for staff (the server refuses) and before the migration (no such function)',async({page})=>{
 // the server answers an error (staff, or the function is not on the server yet): the card is hidden, nothing breaks
 await page.evaluate(()=>{window.__fakeRpcs={ar_site_users_stats:()=>null}});
 await page.click('[data-group="sales"]');
 await page.waitForSelector('#storeOrdersPanel:not(.hidden)');
 await page.waitForTimeout(700);
 assert.equal(await page.$eval('#siteUsers',e=>e.hidden),true);
 assert.equal(await page.$eval('#storeSettings',e=>e.hidden),false,'the settings next to it are untouched');
},{home:true});
