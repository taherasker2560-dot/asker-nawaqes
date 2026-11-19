// The supplier's statement page helpers (supplier/vendor.js, owner 2026-11-19) and the owner's link helpers in ar/vendors.js.
const assert = require('node:assert/strict');
const S = require('../supplier/vendor.js');
const V = require('../ar/vendors.js');
const TOKEN = 'ab'.repeat(32);

// the secret rides in the address: #v=… or ?v=…, exactly 64 hex
assert.equal(S.tokenFromHash('#v=' + TOKEN), TOKEN);
assert.equal(S.tokenFromHash('v=' + TOKEN), TOKEN);
assert.equal(S.tokenFromHash('#v=' + TOKEN + 'x'), null);
assert.equal(S.tokenFromHash('#me=' + TOKEN), null, 'a customer link is not a supplier link');
assert.equal(S.tokenFromSearch('?install=1&v=' + TOKEN), TOKEN);
assert.equal(S.tokenFromSearch('?v=short'), null);

// the balance as the supplier reads it (positive = we owe him)
assert.deepEqual(S.balanceWords(86450), { cls: 'owe', label: 'مستحق لكم عندنا', text: '86,450 ج' });
assert.deepEqual(S.balanceWords(-500), { cls: 'ours', label: 'لنا عندكم', text: '500 ج' });
assert.deepEqual(S.balanceWords(0.3), { cls: 'zero', label: 'الحساب', text: 'خالص' });
assert.equal(S.afterText(3120), 'الرصيد بعدها: مستحق لكم 3,120');
assert.equal(S.afterText(-20.5), 'الرصيد بعدها: لنا عندكم 20.50');
assert.equal(S.afterText(0), 'الرصيد بعدها: خالص');

// lines: quantity with bonus, value = packs × net cost of a pack, expiry month/year
assert.equal(S.qtyText({ p: 10, u: 0, b: 1 }), '10 علبة + بونص 1');
assert.equal(S.qtyText({ p: 0, u: 2, b: 0 }), '2 وحدة');
assert.equal(S.qtyText({ p: 3, u: 0 }), '3 علبة');
assert.equal(S.lineValue({ p: 10, u: 0, k: 1, c: 86 }), 860);
assert.equal(S.lineValue({ p: 1, u: 1, k: 2, c: 100 }), 150);
assert.equal(S.expText('2028-08-28'), '08/2028');
assert.equal(S.expText(null), '');
assert.equal(S.dayLabel('2026-11-18T12:00:00'), '18 نوفمبر 2026');
assert.equal(S.dayLabel(''), '');
// our «~» return marker is ours, not the supplier's paper number
assert.equal(S.codeText({ code: '~11/26/200' }), '11/26/200');
assert.equal(S.codeText({ code: '11/26/300' }), '11/26/300');
assert.equal(S.codeText({ code: null }), '');
// what a move did to the balance as shown: a purchase adds, a return and a payment take away
assert.equal(S.shownAmount({ kind: 'purchase', amount: 1100 }), 1100);
assert.equal(S.shownAmount({ kind: 'return', amount: -180 }), 180);
assert.equal(S.shownAmount({ kind: 'payment', amount: -2000 }), 2000);
// dates → the server's arguments; open ends stay open; a reversed pair is turned round; junk is ignored
assert.deepEqual(S.rangeArgs('', ''), { p_from: null, p_to: null });
assert.deepEqual(S.rangeArgs('2026-01-01', ''), { p_from: '2026-01-01', p_to: null });
assert.deepEqual(S.rangeArgs('2026-05-01', '2026-02-01'), { p_from: '2026-02-01', p_to: '2026-05-01' });
assert.deepEqual(S.rangeArgs('x', '2026-02-01'), { p_from: null, p_to: '2026-02-01' });
// the install manifest: the icon opens on HIS statement (absolute addresses, the secret in the start address, its own app id)
const man = S.manifestFor(TOKEN, 'https://pharmacy.example/app/supplier.html#v=' + TOKEN);
assert.equal(man.id, 'supplier.html');
assert.equal(man.start_url, 'https://pharmacy.example/app/supplier.html#v=' + TOKEN);
assert.equal(man.scope, 'https://pharmacy.example/app/');
assert.ok(man.icons.every((i) => i.src.startsWith('https://pharmacy.example/app/icons/')));
// the install steps follow the browser; every browser on an iPhone adds it with Share
assert.match(S.installSteps('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5), /زرار المشاركة/);
assert.match(S.installSteps('Mozilla/5.0 (Linux; Android 13) Chrome/120.0 Mobile Safari/537.36', 'Linux armv8l', 5), /تثبيت التطبيق/);
assert.match(S.installSteps('Mozilla/5.0 (Android 13; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0', 'Linux armv8l', 5), /تثبيت/);
// the quiet music (owner 2026-11-19: «موسيقى بصوت هادي شويه، ضعيف وهادي، اهدى … مش عايز لا بيع ولا طلب الدواء ولا الكلام»): the four SLOWEST pieces, softer than the store's, no spoken advert,
// its own «stopped» memory, and the owner's phone hears it too
const fs = require('node:fs'), path = require('node:path');
const score = fs.readFileSync(path.join(__dirname, '..', 'tools', 'music', 'score.js'), 'utf8');
const bpmOf = Object.fromEntries([...score.matchAll(/name: '([a-z ]+)', bpm: (\d+)/g)].map((m) => [m[1].replace(/ /g, '-'), +m[2]]));
const index = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'store', 'music', 'index.json'), 'utf8'));
const slowest = index.slice().sort((a, b) => bpmOf[a.id] - bpmOf[b.id]).slice(0, 4).map((p) => p.file).sort();
assert.deepEqual(S.MUSIC.tracks.slice().sort(), slowest, 'the four slowest pieces: ' + slowest.join(', '));
assert.ok(Math.max(...S.MUSIC.tracks.map((f) => bpmOf[index.find((p) => p.file === f).id])) <= 96, 'none faster than 96 bpm');
assert.ok(S.MUSIC.volume > 0.05 && S.MUSIC.volume < 0.18, 'quieter than the store (0.18) but not silent: ' + S.MUSIC.volume);
assert.equal(S.MUSIC.promo, false, 'no spoken advert, no selling');
assert.equal(S.MUSIC.pharmacyToo, true);
assert.equal(S.MUSIC.key, 'asker_vendor_music_off', 'not the store\'s «stopped» memory');
// the page's own words never say «بوت»
for (const t of Object.values(S.TEXTS)) assert.doesNotMatch(t, /بوت/);

// the owner's side (ar/vendors.js): the link is supplier.html next to the bot's page, and the message carries it
const url = V.linkUrl('https://pharmacy.example/app/asker-nawaqes-arabic.html#x', TOKEN);
assert.equal(url, 'https://pharmacy.example/app/supplier.html#v=' + TOKEN);
const msg = V.linkMessage(' A M group ', url);
assert.match(msg, /^أهلًا بحضرتكم 🌿\nده رابط كشف حساب شركة A M group عند صيدلية عسكر من أول تعامل:\n/);
assert.ok(msg.includes('\n' + url + '\n'));
assert.match(msg, /الرابط ده للشركة بس، ما تبعتوهوش لحد\.$/);
assert.doesNotMatch(msg, /بوت/);
console.log('PASS: supplier page helpers and the owner\'s link message');
