// «مستخدمين الموقع» in the bot (ar/site-users.js, owner 2026-11-17): the words for «since», «probably removed» (installed, not opened for 30 days), the card's
// numbers, the message with a temporary password, and the English of every text the card draws.
const assert=require('node:assert/strict');
const S=require('../ar/site-users.js');
const now=new Date(2026,10,17,12,0,0);
const at=(d,h=12,m=0)=>new Date(2026,10,d,h,m,0).toISOString();
assert.equal(S.ago(at(17,11,55),now),'دلوقتي');
assert.equal(S.ago(at(17,9),now),'النهارده');
assert.equal(S.ago(at(16,23),now),'امبارح');
assert.equal(S.ago(at(15,10),now),'من 2 يوم');
assert.equal(S.ago(at(1,10),now),'من 16 يوم');
assert.equal(S.ago(null,now),'ما فتحش');
// «غالبًا شالوه»: installed and not opened for 30 days (a guess, a browser never says it); never for someone who did not install
assert.equal(S.probablyGone({installed_at:at(1),last_seen_at:at(5)},now),false,'12 days');
assert.equal(S.probablyGone({installed_at:at(1),last_seen_at:new Date(2026,9,10).toISOString()},now),true,'38 days');
assert.equal(S.probablyGone({installed_at:at(1),last_seen_at:null},now),true,'installed and never seen');
assert.equal(S.probablyGone({installed_at:null,last_seen_at:new Date(2026,8,1).toISOString()},now),false,'never installed');
// the card's numbers from the server's answer
const v=S.view({users:{total:23,today:2,last7:9,opened_today:5,opened7:14,installed:19,removed:3,android:15,ios:8},customers:{opened:14,installed:9},
 recent:[{id:7,name:'منى إبراهيم',phone:'01012345678',platform:'android',created_at:at(17,9),last_seen_at:at(17,11,58),installed_at:at(17,9,5)},
  {id:5,name:'هالة سمير',phone:'01212345678',platform:'ios',created_at:new Date(2026,9,5).toISOString(),last_seen_at:new Date(2026,9,10).toISOString(),installed_at:new Date(2026,9,6).toISOString()},
  {id:9,name:'كريم',phone:'01112345678',platform:null,created_at:at(16),last_seen_at:null,installed_at:null}]},now);
assert.deepEqual([v.total,v.today,v.last7,v.openedToday,v.opened7,v.installed,v.removed,v.customersOpened,v.customersInstalled],[23,2,9,5,14,19,3,14,9]);
assert.deepEqual(v.rows.map(r=>[r.name,r.platform,r.seen,r.gone,r.installed]),[['منى إبراهيم','أندرويد','دلوقتي',false,true],['هالة سمير','آيفون','من 38 يوم',true,true],['كريم','','ما فتحش',false,false]]);
assert.deepEqual(S.view(null,now).rows,[],'an empty answer is an empty card');
assert.equal(S.view({},now).total,0);
// the message he sends with a temporary password: the 6 digits only, no link
assert.equal(S.resetText('منى','483920'),'أهلًا منى 🌿\nباسورد موقع صيدلية عسكر الجديد: 483920\nادخل بيه برقمك، ولو عايز تغيّره ابعتلنا.');
assert.ok(S.waHref('01012345678','x').startsWith('https://wa.me/201012345678?text='));
assert.equal(S.waHref('123','x'),'');
// the English of every text the card draws (the real dictionary and the real translator)
global.window=global;require('../ar/i18n-en.js');require('../ar/i18n.js');
const I=global.AskerI18n;I._use(global.AskerEN);
const AR=/[؀-ۿ]/,bad=[];
const check=(s)=>{const out=I.translate(s);if(AR.test(out))bad.push(s+'  →  '+out)};
for(const s of ['👥 مستخدمين الموقع','👥 مستخدمين الموقع · 23','عملوا حساب في الموقع','النهارده 2 · آخر 7 أيام 9','فتحوا آخر 7 أيام','فتحوا النهارده','نزّلوا التطبيق','غالبًا شالوه','عملاء بالرابط','من غير باسورد','فتحوا رابط حسابهم','منهم نزّلوا التطبيق','آخر المستخدمين','آخر فتح','لسه محدش عمل حساب.','باسورد جديد','الباسورد الجديد:','ابعته على واتساب','دلوقتي','النهارده','امبارح','من 33 يوم','من 33 يوم · غالبًا شاله','ما فتحش','ما فتحش · غالبًا شاله','سجّل 17/11','نزّل التطبيق','أندرويد','آيفون','كمبيوتر','غير معروف','ماتعملش: جرب تاني','جرب تاني','المتصفح ما بيقولش لما حد يمسح التطبيق، فـ«غالبًا شالوه» = نزّلوه وما فتحوهوش من 30 يوم. الأرقام بتبدأ من يوم التشغيل، وأرقام الموبايل مش متأكد منها بكود (مفيش SMS).'])check(s);
assert.deepEqual(bad,[],'Arabic left in the English of the users card:\n'+bad.join('\n'));
assert.equal(I.translate('👥 مستخدمين الموقع · 23'),'👥 Site users · 23');
assert.equal(I.translate('من 33 يوم · غالبًا شاله'),'33 days ago · probably removed it');
console.log('site-users ok');
