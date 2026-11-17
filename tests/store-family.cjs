// «👨‍👩‍👧 أهل البيت» (owner 2026-11-18; store/family.js): the pure helpers, and every text it draws comes out fully English with the store's dictionary and the bot's engine.
const assert=require('node:assert/strict');
global.window=global;
require('../store/i18n-en-store.js');
require('../ar/i18n.js');
const T=global.AskerI18n;T._use(global.AskerEN);
const F=require('../store/family.js');
const A=require('../store/account.js');
const S=require('../store/store.js');

// the name: trimmed, one space, 40 at most
assert.equal(F.cleanName('  عمر   أحمد '),'عمر أحمد');assert.equal(F.cleanName(null),'');assert.equal(F.cleanName('x'.repeat(60)).length,40);
// his link: this page's own address with his secret in #me= (query and old hash dropped)
const tok='ab'.repeat(32);
assert.equal(F.linkOf(tok,'https://taherasker2560-dot.github.io/asker-nawaqes/store.html?x=1#account'),'https://taherasker2560-dot.github.io/asker-nawaqes/store.html#me='+tok);
assert.equal(F.linkOf(tok,'https://example.com/a/b/store.html'),'https://example.com/a/b/store.html#me='+tok);
// the WhatsApp text carries his name and the link on its own line
const msg=F.shareText(' ماما ','https://x.test/store.html#me='+tok);assert.match(msg,/^أهلاً يا ماما،/);assert.ok(msg.endsWith('\nhttps://x.test/store.html#me='+tok));
// the tile's count
assert.equal(F.countText(1),'واحد من أهلك');assert.equal(F.countText(2),'اتنين من أهلك');assert.equal(F.countText(3),'3 من أهلك');assert.equal(F.countText(10),'10 من أهلك');
// when he last opened it
const now=new Date(2026,10,18,15,0,0);
assert.equal(F.seenText(null,now),'لسه ما فتحش الرابط');assert.equal(F.seenText('garbage',now),'لسه ما فتحش الرابط');
assert.equal(F.seenText(new Date(2026,10,18,9,0,0).toISOString(),now),'فتح التطبيق النهارده');assert.equal(F.seenText(new Date(2026,10,17,23,0,0).toISOString(),now),'فتح التطبيق امبارح');
assert.equal(F.seenText(new Date(2026,10,13,9,0,0).toISOString(),now),'فتح التطبيق من 5 يوم');
// the errors the server can give
assert.equal(F.errText('max'),F.TEXTS.max);assert.equal(F.errText('bad_name'),F.TEXTS.needName);assert.equal(F.errText('not_owner'),F.TEXTS.notOwner);assert.equal(F.errText('anything else'),F.TEXTS.down);assert.equal(F.errText(undefined),F.TEXTS.down);

// English: every fixed text, and the ones with a name or a number put in
const AR=/[؀-ۿ]/,bad=[];
const check=(s)=>{s=String(s).replace(/\s+/g,' ').trim();if(s&&AR.test(s)&&AR.test(T.translate(s)))bad.push(s)};
for(const [k,v] of Object.entries(F.TEXTS)){
 if(['countN','delAsk','openedDays'].includes(k))continue; // templates: checked below with the value in
 check(v);
}
check(F.TEXTS.countN.replace('{n}','3'));check(F.fill(F.TEXTS.delAsk,{n:'Mum'}));check(F.fill(F.TEXTS.openedDays,{d:5}));
// the account's own new texts for a person of the house, and the order error the store shows him
check(F.fill(A.TEXTS.memberName,{n:'Omar',o:'Ahmed'}));check(F.fill(A.TEXTS.memberHi,{n:'Omar'}));check(F.fill(A.TEXTS.memberHint,{o:'Ahmed'}));check(A.TEXTS.payMemberCash);check(S.ERRORS.member_cash);
assert.deepEqual(bad,[],'Arabic left after the English engine: '+bad.join(' | '));
assert.equal(T.translate(F.fill(A.TEXTS.memberHi,{n:'Omar'})),'Hi Omar');
assert.equal(T.translate(F.TEXTS.countN.replace('{n}','3')),'3 family members');
console.log('store-family ok');
