// «👥 المستخدمين» in the bot (owner 2026-11-17: «عايز عدد الناس اللي نزّلت الموقع، كام نزّله وكام شاله وكام فتحه»; 2026-11-18: «ليه مش مخليني أشوف الناس اللي بتسجل في الموقع،
// والناس اللي بتنزل الأبليكيشن، والناس اللي بتنزل الموقع … وأبقى شايف لما يشيلوه»): every person (credit customers by link, household, site accounts) with his state,
// installs and «منبه الدوا»; four numbers; filters and a search; WhatsApp, «باسورد جديد» and «امسح الحساب» for a site account. Made-up people only: the repository is public.
const {run,text,assert}=require('./harness.cjs');
const now=Date.now(),iso=(d,h=0)=>new Date(now-d*864e5-h*36e5).toISOString();
const LIST={ok:true,apps:{total:3,active7:2,silent3:1},people:[
 {kind:'customer',id:101,name:'أحمد محمود_01001112223',phone:'201001112223',platform:null,of_name:null,since_at:iso(5),last_seen_at:iso(0,0.2),opens:12,installed_at:iso(4),app_at:iso(1),push_gone_at:null},
 {kind:'member',id:1,name:'سارة أحمد',phone:null,platform:null,of_name:'أحمد محمود_01001112223',since_at:iso(3),last_seen_at:iso(2),opens:3,installed_at:null,app_at:null,push_gone_at:null},
 {kind:'site',id:7,name:'كريم حسن',phone:'01112345678',platform:'android',of_name:null,since_at:iso(12),last_seen_at:iso(10),opens:4,installed_at:iso(12),app_at:iso(9),push_gone_at:null},
 {kind:'site',id:9,name:'هالة سمير',phone:'01212345678',platform:'ios',of_name:null,since_at:iso(45),last_seen_at:iso(38),opens:2,installed_at:iso(44),app_at:null,push_gone_at:null},
 {kind:'customer',id:103,name:'منى سالم',phone:null,platform:null,of_name:null,since_at:iso(20),last_seen_at:iso(6),opens:5,installed_at:null,app_at:null,push_gone_at:iso(1)},
 {kind:'customer',id:104,name:'رامي عادل',phone:null,platform:null,of_name:null,since_at:iso(2),last_seen_at:null,opens:0,installed_at:null,app_at:null,push_gone_at:null}]};
const people=(page)=>page.$$eval('#suList .su-person',r=>r.map(x=>({key:x.dataset.su,st:x.dataset.st,name:x.querySelector('.su-l1 strong').textContent,kind:x.querySelector('.su-kind').textContent,state:x.querySelector('.su-st').textContent})));

run('Bot: «👥 المستخدمين» lists every person with his state, installs and «منبه الدوا»; four numbers; filters and a search',async({page})=>{
 await page.evaluate(([l])=>{window.__fakeRpcs={ar_people_list:()=>l}},[LIST]);
 await page.click('[data-group="sales"]');
 await page.waitForSelector('#siteUsers:not([hidden])');
 assert.equal(await text(page,'#suSummary'),'👥 المستخدمين · 6');
 await page.click('#suSummary');
 await page.waitForSelector('.su-tiles .su-tile');
 assert.deepEqual(await page.$$eval('.su-tile',t=>t.map(x=>x.innerText.replace(/\s+/g,' ').trim())),[
  'نزّلوا الموقع على الموبايل 3 1 عملاء أجل + 2 حسابات موقع','فتحوا آخر 7 أيام 3 من 6 شخص','⏰ نزّلوا «منبه الدوا» 2 3 موبايل بيقول «أنا شغّال»','غالبًا شالوا 2 ما فتحوش من 30 يوم أو الإشعار رجع']);
 // every person, newest open first (the server's order), his name as people read it, his kind and state
 assert.deepEqual(await people(page),[
  {key:'customer:101',st:'ok',name:'أحمد محمود',kind:'عميل أجل',state:'🟢 شغّال'},
  {key:'member:1',st:'ok',name:'سارة أحمد',kind:'أهل بيت',state:'🟢 شغّال'},
  {key:'site:7',st:'quiet',name:'كريم حسن',kind:'حساب موقع',state:'🟡 هادي'},
  {key:'site:9',st:'away',name:'هالة سمير',kind:'حساب موقع',state:'🔴 غالبًا شاله'},
  {key:'customer:103',st:'gone',name:'منى سالم',kind:'عميل أجل',state:'⚫ شاله أو قفل الإشعارات'},
  {key:'customer:104',st:'never',name:'رامي عادل',kind:'عميل أجل',state:'⚪ لسه ما فتحش'}]);
 assert.equal(await page.getAttribute('[data-su="customer:101"] .su-l1 strong','title'),'أحمد محمود_01001112223','the full card name on hover');
 const c1=await page.$eval('[data-su="customer:101"]',e=>e.textContent.replace(/\s+/g,' '));
 assert.match(c1,/01001112223/);assert.match(c1,/فتح 12 مرة/);assert.match(c1,/📱 نزّل الموقع \d+\/\d+/);assert.match(c1,/⏰ نزّل المنبه \d+\/\d+/);
 assert.equal(await page.getAttribute('[data-su="customer:101"] a.su-act','href'),'https://wa.me/201001112223');
 assert.equal(await page.$('[data-su="customer:101"] [data-su-reset]'),null,'a customer has no password');
 assert.match(await page.$eval('[data-su="member:1"]',e=>e.textContent),/من أهل أحمد محمود/);
 assert.match(await page.$eval('[data-su="member:1"]',e=>e.textContent),/📱 الموقع: مش معروف/);
 assert.match(await page.$eval('[data-su="site:7"]',e=>e.textContent),/أندرويد/);
 assert.ok(await page.$('[data-su="site:7"] [data-su-reset="7"]')&&await page.$('[data-su="site:7"] [data-su-del="7"]'));
 assert.match(await page.$eval('[data-su="customer:104"]',e=>e.textContent),/آخر فتح: ما فتحش/);
 // the filters (with their counts) and the search
 assert.deepEqual(await page.$$eval('[data-su-chip]',c=>c.map(x=>x.textContent.trim())),['الكل 6','عملاء الأجل 3','حسابات الموقع 2','أهل البيت 1','منبه الدوا 2','غالبًا شالوا 2']);
 await page.click('[data-su-chip="away"]');
 assert.deepEqual((await people(page)).map(p=>p.key),['site:9','customer:103']);
 await page.click('[data-su-chip="app"]');
 assert.deepEqual((await people(page)).map(p=>p.key),['customer:101','site:7']);
 await page.click('[data-su-chip="all"]');
 await page.fill('#suQ','2223');
 assert.deepEqual((await people(page)).map(p=>p.key),['customer:101'],'a piece of the mobile');
 await page.fill('#suQ','هالة');
 assert.deepEqual((await people(page)).map(p=>p.key),['site:9']);
 await page.fill('#suQ','مش موجود');
 assert.equal(await text(page,'#suList .hint'),'مفيش حد بالبحث ده.');
 await page.fill('#suQ','');
 assert.equal((await people(page)).length,6);
 const html=await page.$eval('#siteUsers',e=>e.innerHTML);
 assert.ok(!/pw_hash|password|token/i.test(html),'no hash, no password, no secret on the screen');
},{home:true});

run('Bot: «👥 المستخدمين» — «باسورد جديد» shows the 6 digits with a WhatsApp message; «امسح الحساب» asks, deletes and takes him off the list',async({page})=>{
 await page.evaluate(([l])=>{window.__calls=[];window.__fakeRpcs={ar_people_list:()=>l,ar_site_user_reset:(a)=>{window.__calls.push(['reset',a]);return {ok:true,password:'483920'}},ar_site_user_delete:(a)=>{window.__calls.push(['delete',a]);return {ok:true}}}},[LIST]);
 await page.click('[data-group="sales"]');
 await page.waitForSelector('#siteUsers:not([hidden])');
 await page.click('#suSummary');
 await page.waitForSelector('[data-su="site:7"]');
 page.once('dialog',d=>{assert.match(d.message(),/باسورد جديد للمستخدم ده/);d.accept()});
 await page.click('[data-su-reset="7"]');
 await page.waitForSelector('[data-su="site:7"] .su-pw');
 assert.equal(await text(page,'[data-su="site:7"] .su-pw b'),'483920');
 const href=await page.getAttribute('[data-su="site:7"] .su-pw a','href');
 assert.ok(href.startsWith('https://wa.me/201112345678?text='));
 assert.equal(decodeURIComponent(href.split('?text=')[1]),'أهلًا كريم حسن 🌿\nباسورد موقع صيدلية عسكر الجديد: 483920\nادخل بيه برقمك، ولو عايز تغيّره ابعتلنا.');
 // delete: asks first; «no» keeps him
 page.once('dialog',d=>{assert.match(d.message(),/هتمسح حساب هالة سمير/);d.dismiss()});
 await page.click('[data-su-del="9"]');await page.waitForTimeout(300);
 assert.ok(await page.$('[data-su="site:9"]'),'kept when he says no');
 page.once('dialog',d=>d.accept());
 await page.click('[data-su-del="9"]');
 await page.waitForSelector('[data-su="site:9"]',{state:'detached'});
 assert.deepEqual(await page.evaluate(()=>window.__calls),[['reset',{p_user:7}],['delete',{p_user:9}]]);
 assert.equal(await text(page,'#suSummary'),'👥 المستخدمين · 5');
},{home:true});

run('Bot: «👥 المستخدمين» stays away for staff (the server refuses) and before the migration (no such function)',async({page})=>{
 // the server answers an error (staff, or the function is not on the server yet): the card is hidden, nothing breaks
 await page.evaluate(()=>{window.__fakeRpcs={ar_people_list:()=>null}});
 await page.click('[data-group="sales"]');
 await page.waitForSelector('#storeOrdersPanel:not(.hidden)');
 await page.waitForTimeout(700);
 assert.equal(await page.$eval('#siteUsers',e=>e.hidden),true);
 assert.equal(await page.$eval('#storeSettings',e=>e.hidden),false,'the settings next to it are untouched');
},{home:true});
