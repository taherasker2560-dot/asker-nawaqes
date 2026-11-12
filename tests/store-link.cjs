// «رابط الموقع» in the bot (ar/store-link.js): the store link next to the bot page, and the WhatsApp message.
const assert=require('node:assert/strict');
const L=require('../ar/store-link.js');

assert.equal(L.storeUrl('https://taherasker2560-dot.github.io/asker-nawaqes/asker-nawaqes-arabic.html?x=1#sales'),'https://taherasker2560-dot.github.io/asker-nawaqes/store.html');
assert.equal(L.storeUrl('http://localhost:8765/asker-nawaqes-arabic.html'),'http://localhost:8765/store.html');
const m=L.shareMessage('https://x.io/store.html');
assert.ok(m.startsWith('اطلب من صيدلية عسكر'));
assert.ok(m.endsWith('https://x.io/store.html'),'the link is last so WhatsApp shows its preview');
// «البوت» button on the store (store/from-bot.js): only when opened from the bot, remembered for that tab
const B=require('../store/from-bot.js');
assert.equal(B.cameFromBot('?from=bot',null),true);
assert.equal(B.cameFromBot('',null),false,'a customer never sees it');
assert.equal(B.cameFromBot('?from=x',null),false);
assert.equal(B.cameFromBot('','1'),true,'still shown after moving inside the store');
assert.equal(B.BOT,'asker-nawaqes-arabic.html');
console.log('store-link ok');
