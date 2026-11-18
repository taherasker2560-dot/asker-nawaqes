// «👥 المستخدمين» in the bot (ar/site-users.js; owner 2026-11-17 «عايز عدد الناس اللي نزّلت الموقع، كام نزّله وكام شاله وكام فتحه», 2026-11-18 «ليه مش مخليني أشوف الناس
// اللي بتسجل … واللي بتنزل الأبليكيشن … وأبقى شايف لما يشيلوه»): the names as people read them, the mobile, the state of each person, the four numbers, the filters and the
// search, the message with a temporary password, and the English of every text the screen draws. Made-up people only: the repository is public.
const assert=require('node:assert/strict');
const S=require('../ar/site-users.js');
const now=new Date(2026,10,18,22,30,0);
const at=(d,h=12,m=0)=>new Date(2026,10,d,h,m,0).toISOString();
const daysAgo=(n)=>new Date(now.getTime()-n*864e5).toISOString();
// when: «النهارده 10:26 م», «امبارح 9:10 ص», «من N يوم», «ما فتحش»
assert.equal(S.whenText(at(18,22,26),now),'النهارده 10:26 م');
assert.equal(S.whenText(at(18,0,5),now),'النهارده 12:05 ص');
assert.equal(S.whenText(at(17,9,10),now),'امبارح 9:10 ص');
assert.equal(S.whenText(at(17,12,0),now),'امبارح 12:00 م');
assert.equal(S.whenText(daysAgo(5),now),'من 5 يوم');
assert.equal(S.whenText(null,now),'ما فتحش');
assert.equal(S.ago(null,now),'ما فتحش','the old card\'s words are kept');
// how many times: the Egyptian way
assert.deepEqual([0,1,2,3,10,11,40].map(S.timesText),['','فتح مرة','فتح مرتين','فتح 3 مرات','فتح 10 مرات','فتح 11 مرة','فتح 40 مرة']);
// the name as people read it: a PharmaFly card name carries a mobile or a note; «د/…» keeps its title
assert.equal(S.cleanName('الحاج محمد حماد فتح الله_01060595664'),'الحاج محمد حماد فتح الله');
assert.equal(S.cleanName('01020500876محمد البغدادى/700جنيه/موقوف لاى حد غيره'),'محمد البغدادى');
assert.equal(S.cleanName('حماده جلاء يوسف ناجى بليح /موقوف'),'حماده جلاء يوسف ناجى بليح');
assert.equal(S.cleanName('د/عبدالفتاح على عسكر'),'د/عبدالفتاح على عسكر');
assert.equal(S.cleanName('Mona Asker'),'Mona Asker');
assert.equal(S.cleanName('01012345678'),'01012345678','only a number: kept as it is');
// the mobile: the kept one (with or without 20), else the one in the card name
assert.equal(S.phoneOf({phone:'201001112223'}),'01001112223');
assert.equal(S.phoneOf({phone:'01112345678'}),'01112345678');
assert.equal(S.phoneOf({phone:null,name:'منى_01060595664'}),'01060595664');
assert.equal(S.phoneOf({phone:'123',name:'منى'}),'');
// the state: ⚫ the push address died after his last open · ⚪ never opened · 🟢 7 days · 🟡 under 30 · 🔴 30 or more
assert.equal(S.statusOf({last_seen_at:daysAgo(1)},now),'ok');
assert.equal(S.statusOf({last_seen_at:daysAgo(7)},now),'ok');
assert.equal(S.statusOf({last_seen_at:daysAgo(8)},now),'quiet');
assert.equal(S.statusOf({last_seen_at:daysAgo(29)},now),'quiet');
assert.equal(S.statusOf({last_seen_at:daysAgo(30)},now),'away');
assert.equal(S.statusOf({last_seen_at:null},now),'never');
assert.equal(S.statusOf({last_seen_at:daysAgo(3),push_gone_at:daysAgo(1)},now),'gone','his address died after he last opened');
assert.equal(S.statusOf({last_seen_at:daysAgo(1),push_gone_at:daysAgo(3)},now),'ok','he opened after it: a new address, still with us');
assert.equal(S.statusOf({last_seen_at:null,push_gone_at:daysAgo(3)},now),'gone');
assert.equal(S.statusText({installed_at:daysAgo(40)},'away'),'🔴 غالبًا شاله');
assert.equal(S.statusText({installed_at:null},'away'),'🔴 بطّل يفتح','never installed: he just stopped opening his link');
// the four numbers and the filters, from people like the server's ar_people_list answer
const P=[
 {kind:'customer',id:101,name:'أحمد محمود_01001112223',phone:'201001112223',since_at:daysAgo(5),last_seen_at:daysAgo(0.1),opens:12,installed_at:daysAgo(4),app_at:daysAgo(1),push_gone_at:null},
 {kind:'member',id:1,name:'سارة أحمد',of_name:'أحمد محمود_01001112223',since_at:daysAgo(3),last_seen_at:daysAgo(2),opens:3,installed_at:null,app_at:null,push_gone_at:null},
 {kind:'site',id:7,name:'كريم حسن',phone:'01112345678',platform:'android',since_at:daysAgo(12),last_seen_at:daysAgo(10),opens:4,installed_at:daysAgo(12),app_at:daysAgo(9),push_gone_at:null},
 {kind:'customer',id:102,name:'منى سالم',phone:null,since_at:daysAgo(40),last_seen_at:daysAgo(35),opens:2,installed_at:daysAgo(39),app_at:null,push_gone_at:null},
 {kind:'customer',id:103,name:'هالة سمير',phone:null,since_at:daysAgo(20),last_seen_at:daysAgo(6),opens:5,installed_at:null,app_at:null,push_gone_at:daysAgo(1)},
 {kind:'customer',id:104,name:'رامي عادل',phone:null,since_at:daysAgo(2),last_seen_at:null,opens:0,installed_at:null,app_at:null,push_gone_at:null}];
const v=S.summary(P,{total:3},now);
assert.deepEqual(v,{total:6,installed:3,installedCustomers:2,installedSite:1,open7:3,app:2,appPhones:3,away:2,customers:4,members:1,sites:1},'opened in 7 days counts whoever opened, even one whose address died since');
const ids=(L)=>L.map(p=>p.kind+':'+p.id);
assert.deepEqual(ids(S.filterPeople(P,'all','',now)),ids(P));
assert.deepEqual(ids(S.filterPeople(P,'customer','',now)),['customer:101','customer:102','customer:103','customer:104']);
assert.deepEqual(ids(S.filterPeople(P,'site','',now)),['site:7']);
assert.deepEqual(ids(S.filterPeople(P,'member','',now)),['member:1']);
assert.deepEqual(ids(S.filterPeople(P,'app','',now)),['customer:101','site:7']);
assert.deepEqual(ids(S.filterPeople(P,'away','',now)),['customer:102','customer:103'],'probably removed (installed, 30 days) + the dead push address');
assert.deepEqual(ids(S.filterPeople(P,'all','أحمد',now)),['customer:101','member:1'],'a name');
assert.deepEqual(ids(S.filterPeople(P,'all','2223',now)),['customer:101'],'a piece of the mobile');
assert.deepEqual(ids(S.filterPeople(P,'all','345',now)),['site:7']);
assert.deepEqual(ids(S.filterPeople(P,'site','أحمد',now)),[],'the filter and the search together');
assert.deepEqual(S.summary(null,null,now).total,0,'an empty answer is an empty screen');
// the message he sends with a temporary password: the 6 digits only, no link
assert.equal(S.resetText('منى','483920'),'أهلًا منى 🌿\nباسورد موقع صيدلية عسكر الجديد: 483920\nادخل بيه برقمك، ولو عايز تغيّره ابعتلنا.');
assert.ok(S.waHref('01012345678','x').startsWith('https://wa.me/201012345678?text='));
assert.equal(S.waHref('01012345678',''),'https://wa.me/201012345678','a plain chat');
assert.equal(S.waHref('123','x'),'');
// the English of every text the screen draws (the real dictionary and the real translator); a person's name inside a text stays as it is
global.window=global;require('../ar/i18n-en.js');require('../ar/i18n.js');
const I=global.AskerI18n;I._use(global.AskerEN);
const AR=/[؀-ۿ]/,bad=[];
const check=(s)=>{const out=I.translate(s);if(AR.test(out))bad.push(s+'  →  '+out)};
for(const s of ['👥 المستخدمين','👥 المستخدمين · 39','نزّلوا الموقع على الموبايل','8 عملاء أجل + 4 حسابات موقع','فتحوا آخر 7 أيام','من 39 شخص','⏰ نزّلوا «منبه الدوا»','3 موبايل بيقول «أنا شغّال»','بيتعدّ من يوم التشغيل',
 'غالبًا شالوا','ما فتحوش من 30 يوم أو الإشعار رجع','🔍 دوّر باسم أو رقم موبايل','الكل 39','عملاء الأجل 34','حسابات الموقع 4','أهل البيت 1','منبه الدوا 2','غالبًا شالوا 0',
 'عميل أجل','أهل بيت','حساب موقع','🟢 شغّال','🟡 هادي','🔴 غالبًا شاله','🔴 بطّل يفتح','⚫ شاله أو قفل الإشعارات','⚪ لسه ما فتحش',
 'آخر فتح: النهارده 10:26 م','آخر فتح: امبارح 9:10 ص','آخر فتح: من 5 يوم','آخر فتح: ما فتحش','فتح مرة','فتح مرتين','فتح 3 مرات','فتح 40 مرة','أندرويد','آيفون',
 '📱 نزّل الموقع 18/11','📱 الموقع: لسه ما نزّلوش','📱 الموقع: مش معروف','⏰ نزّل المنبه 18/11','⏰ المنبه: لأ','💬 واتساب','باسورد جديد','امسح الحساب','الباسورد الجديد:','ابعته على واتساب',
 'مفيش حد بالبحث ده.','مفيش حد هنا لسه.','الحالة بتتحسب إزاي:','🟢 شغّال: فتح آخر 7 أيام','🟡 هادي: آخر فتح من 8 لـ29 يوم','🔴 غالبًا شاله: ما فتحش من 30 يوم أو أكتر',
 '⚫ شاله أو قفل الإشعارات: جوجل رجّعلنا إن عنوان موبايله مات','⚪ لسه ما فتحش: الرابط اتبعت وما اتفتحش','ماتعملش: جرب تاني',
 'الموبايل والمتصفح ما بيبلّغوش أي موقع لما حد يشيل التطبيق، فده أقرب حاجة لـ«شاله». الأرقام بتبدأ من يوم التشغيل، وأرقام الموبايل مش متأكد منها بكود (مفيش SMS).'])check(s);
assert.deepEqual(bad,[],'Arabic left in the English of the users screen:\n'+bad.join('\n'));
assert.equal(I.translate('👥 المستخدمين · 39'),'👥 Users · 39');
assert.equal(I.translate('آخر فتح: النهارده 10:26 م'),'Last opened: today 10:26 PM');
assert.equal(I.translate('من أهل أحمد محمود'),"of أحمد محمود's household",'a name stays a name');
console.log('site-users ok');
