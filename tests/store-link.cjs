// «رابط الموقع» in the bot (ar/store-link.js): the store link next to the bot page, and the WhatsApp message.
const assert=require('node:assert/strict');
const L=require('../ar/store-link.js');

assert.equal(L.storeUrl('https://taherasker2560-dot.github.io/asker-nawaqes/asker-nawaqes-arabic.html?x=1#sales'),'https://taherasker2560-dot.github.io/asker-nawaqes/store.html');
assert.equal(L.storeUrl('http://localhost:8765/asker-nawaqes-arabic.html'),'http://localhost:8765/store.html');
const m=L.shareMessage('https://x.io/store.html');
assert.ok(m.startsWith('اطلب من صيدلية عسكر'));
assert.ok(m.endsWith('https://x.io/store.html'),'the link is last so WhatsApp shows its preview');
console.log('store-link ok');
