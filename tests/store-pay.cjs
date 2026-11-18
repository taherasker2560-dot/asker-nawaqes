// «الدفع بتحويل» (store/pay.js, owner 2026-11-17: Vodafone Cash and InstaPay in the site and in the customer's link):
// the numbers, the dial link, the WhatsApp proof, the order note, and the same rules in the bot's settings (ar/store-settings.js).
const assert=require('node:assert/strict');
const P=require('../store/pay.js');
const S=require('../ar/store-settings.js');
const A=require('../store/account.js');

// Vodafone Cash number: any way of writing a mobile number → 01xxxxxxxxx; anything else = none
assert.equal(P.cleanWallet('01012345678'),'01012345678');
assert.equal(P.cleanWallet('+20 10 1234 5678'),'01012345678');
assert.equal(P.cleanWallet('00201012345678'),'01012345678');
assert.equal(P.cleanWallet('1012345678'),'01012345678','without the leading zero');
assert.equal(P.cleanWallet('٠١٠١٢٣٤٥٦٧٨'),'01012345678','Arabic digits');
assert.equal(P.cleanWallet('01312345678'),'','013 is not a mobile prefix');
assert.equal(P.cleanWallet('0101234'),'');
assert.equal(P.cleanWallet(''),'');
assert.equal(P.cleanWallet(null),'');
// InstaPay: an address, an ipn.eg link (https only), or a mobile number
assert.deepEqual(P.cleanInstapay('Asker@InstaPay'),{kind:'ipa',value:'asker@instapay'});
assert.deepEqual(P.cleanInstapay('https://ipn.eg/S/asker/instapay/AbC123'),{kind:'link',value:'https://ipn.eg/S/asker/instapay/AbC123'});
assert.deepEqual(P.cleanInstapay('01012345678'),{kind:'phone',value:'01012345678'});
assert.equal(P.cleanInstapay('http://ipn.eg/S/x/instapay/1'),null,'not https');
assert.equal(P.cleanInstapay('https://ipn.eg.evil.com/S/x'),null,'a look-alike address');
assert.equal(P.cleanInstapay('https://evil.com/ipn.eg/S/x'),null);
assert.equal(P.cleanInstapay('not an address'),null);
assert.equal(P.cleanInstapay(''),null);
// what the site shows from the function's answer: junk = no option
let info=P.parseInfo({vodafone:'01012345678',instapay:'asker@instapay',whatsapp:'01003032931'});
assert.deepEqual(P.methodsOf(info),['vodafone','instapay']);
assert.equal(info.whatsapp,'01003032931');
assert.deepEqual(P.methodsOf(P.parseInfo({vodafone:'x',instapay:'y'})),[]);
assert.deepEqual(P.methodsOf(P.parseInfo(null)),[]);
assert.deepEqual(P.methodsOf(P.parseInfo({vodafone:'01012345678'})),['vodafone']);
assert.equal(P.parseInfo({whatsapp:'123'}).whatsapp,'');
// the amount: whole pounds
assert.equal(P.wholeAmount(7174.5),7175);
assert.equal(P.wholeAmount(66.7),67);
assert.equal(P.wholeAmount(0.2),0);
assert.equal(P.wholeAmount(null),0);
assert.equal(P.wholeAmount('abc'),0);
// the dialer: *9*7*number*amount# (the # as %23); no amount = the number only; a bad number = the menu
assert.equal(P.vodafoneDial('01012345678',245),'tel:*9*7*01012345678*245%23');
assert.equal(P.vodafoneDial('01012345678',66.7),'tel:*9*7*01012345678*67%23');
assert.equal(P.vodafoneDial('01012345678',0),'tel:*9*7*01012345678%23');
assert.equal(P.vodafoneDial('01012345678',null),'tel:*9*7*01012345678%23');
assert.equal(P.vodafoneDial('nope',100),'tel:*9*7%23');
// the transfer's picture goes to the pharmacy on WhatsApp
assert.equal(P.proofText('vodafone',245,'أحمد محمود · كود 101'),'حوّلت 245 ج على فودافون كاش (أحمد محمود · كود 101). دي صورة التحويل.');
assert.equal(P.proofText('instapay',0,''),'حوّلت على إنستا باي. دي صورة التحويل.');
const href=P.proofHref('01003032931','vodafone',245,'أحمد');
assert.ok(href.startsWith('https://wa.me/201003032931?text='));
assert.equal(decodeURIComponent(href.split('?text=')[1]),'حوّلت 245 ج على فودافون كاش (أحمد). دي صورة التحويل.');
assert.equal(P.proofHref('','vodafone',245,''),'','no WhatsApp number = no button');
assert.equal(P.proofHref('123','vodafone',245,''),'');
// the order's note: his own notes first, the payment note always whole
assert.equal(P.orderNote('cash'),'');
assert.equal(P.orderNote('account'),'');
assert.equal(P.orderNote('vodafone'),'الدفع: تحويل فودافون كاش');
assert.equal(P.joinNotes('  عايز كيس  ','instapay'),'عايز كيس · الدفع: تحويل إنستا باي');
assert.equal(P.joinNotes('','vodafone'),'الدفع: تحويل فودافون كاش');
assert.equal(P.joinNotes('عايز كيس','cash'),'عايز كيس');
const long=P.joinNotes('ا'.repeat(500),'vodafone');
assert.equal(long.length,500);assert.ok(long.endsWith('الدفع: تحويل فودافون كاش'),'the payment note is never cut');
assert.equal(P.isTransfer('vodafone'),true);assert.equal(P.isTransfer('cash'),false);assert.equal(P.isTransfer('account'),false);

// the bot's settings screen uses the same rules (two copies, kept in step)
const wallets=['01012345678','+20 10 1234 5678','00201012345678','1012345678','٠١٠١٢٣٤٥٦٧٨','01312345678','0101234','',null,'abc'];
for(const w of wallets)assert.equal(S.cleanWallet(w),P.cleanWallet(w),'wallet '+w);
const ipas=['Asker@InstaPay','https://ipn.eg/S/asker/instapay/AbC123','01012345678','http://ipn.eg/S/x/instapay/1','https://ipn.eg.evil.com/S/x','not an address','',null];
for(const v of ipas)assert.deepEqual(S.cleanInstapay(v),P.cleanInstapay(v),'instapay '+v);
// saving: empty = off; a bad value is refused before saving; old database (no columns) = nothing sent
let r=S.settingsRow({is_open:true,whatsapp:'',pay_vodafone:' +20 10 1234 5678 ',pay_instapay:' Asker@InstaPay '});
assert.equal(r.row.pay_vodafone,'01012345678');assert.equal(r.row.pay_instapay,'asker@instapay');
r=S.settingsRow({is_open:true,whatsapp:'',pay_vodafone:'',pay_instapay:''});
assert.equal(r.row.pay_vodafone,null);assert.equal(r.row.pay_instapay,null);
assert.match(S.settingsRow({is_open:true,whatsapp:'',pay_vodafone:'123'}).error,/فودافون كاش/);
assert.match(S.settingsRow({is_open:true,whatsapp:'',pay_instapay:'???'}).error,/إنستا باي/);
assert.ok(!('pay_vodafone' in S.settingsRow({is_open:true,whatsapp:''}).row),'old database: no pay fields');

// the account's side: a transfer is kept as picked (a stopped customer too), never «account»; the Chrome hand-off works with no link
assert.equal(A.payOf(false,'vodafone'),'vodafone');
assert.equal(A.payOf(true,'instapay'),'instapay');
assert.equal(A.payOf(true,'account'),'cash');
assert.equal(A.payOf(false,'cash'),'cash');
const base='https://taherasker2560-dot.github.io/asker-nawaqes/store.html#item=5';
const plain=A.chromeIntent(base,null);
assert.ok(plain.startsWith('intent://taherasker2560-dot.github.io/asker-nawaqes/store.html?install=1#Intent;scheme=https;package=com.android.chrome;'),plain);
assert.ok(decodeURIComponent(plain).includes('S.browser_fallback_url=https://taherasker2560-dot.github.io/asker-nawaqes/store.html?install=1;end'),'no Chrome: the same site, asking to install');
assert.ok(!/[?&]me=/.test(decodeURIComponent(plain)),'no secret for a visitor');
const tok='c'.repeat(64);
assert.ok(A.chromeIntent(base,tok).includes('?me='+tok+'&install=1#Intent'),'a customer: unchanged');
// a visitor's plan on each browser (the same rules as a customer's)
const UA={samsung:'Mozilla/5.0 (Linux; Android 14; SM-A566B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',firefox:'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0',chrome:'Mozilla/5.0 (Linux; Android 14; SM-A566B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',ios:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'};
assert.equal(A.installPlan(UA.chrome,'Linux armv81',5,true,false),'app','Android Chrome: the pharmacy\'s app (this store + the dose alarm), not the installed page (owner 2026-11-18)');
assert.equal(A.installPlan('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36','Win32',0,true,false),'prompt','a computer: the browser\'s own install as before');
assert.equal(A.installPlan(UA.samsung,'Linux armv81',5,true,false),'chrome','Samsung: never its own install');
assert.equal(A.installPlan(UA.firefox,'Linux armv81',5,false,false),'chrome');
assert.equal(A.installPlan(UA.firefox,'Linux armv81',5,false,true),'steps','back from the hand-off with no Chrome: the steps');
assert.equal(A.installPlan(UA.ios,'iPhone',5,false,false),'guide');
console.log('store-pay ok');
