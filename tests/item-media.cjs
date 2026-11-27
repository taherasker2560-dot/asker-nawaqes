// The item's photo and description inside the bot (owner 2026-11-14): same photos and texts as the store, his fixes first.
const assert = require('node:assert/strict');
const M = require('../ar/item-media.js');
const pics = { 5: '5.jpg', 6: '6.webp' };
const edits = { 6: { img: 'e/6-abcdef012345.jpg' }, 7: { img_off: true }, 8: { descr: { h: 'نصه هو' } }, 9: { desc_off: true } };
assert.equal(M.photoOf(5, pics, edits), 'store/img/5.jpg');
assert.equal(M.photoOf(6, pics, edits), M.IMG_URL + 'e/6-abcdef012345.jpg', 'his photo wins');
assert.equal(M.photoOf(7, { 7: '7.jpg' }, edits), null, 'he removed it');
assert.equal(M.photoOf(99, pics, edits), null);
const shard = { t: [{ h: 'جملة', u: ['أ'], f: [], w: ['ب'] }], i: { 8: 0, 9: 0, 10: 0 } };
assert.deepEqual(M.descFrom(8, shard, edits), { h: 'نصه هو' }, 'his text wins');
assert.equal(M.descFrom(9, shard, edits), null, 'he hid it');
assert.equal(M.descFrom(10, shard, edits).h, 'جملة');
assert.equal(M.descFrom(11, shard, edits), null);
const h = M.descHtml(shard.t[0]);
assert.match(h, /im-hook" translate="no">جملة/); assert.match(h, /بيستخدم في/); assert.doesNotMatch(h, /مميزاته/); assert.match(h, /im-sec warn/);
assert.match(M.descHtml(null), /مفيش بيان/);
assert.match(M.thumbHtml(5, 'PANADOL 500', pics, edits), /data-im="5".*<img src="store\/img\/5\.jpg"/);
assert.match(M.thumbHtml(99, 'ANGIOFOX TAB 25MG', pics, edits), /im-none.*>ANGIOFOX TAB</);
assert.equal(M.thumbHtml(null, 'X', pics, edits), '');
assert.equal(M.short('<b>x</b> 10MG'), '<B>X</B>'); assert.doesNotMatch(M.thumbHtml(1, '<b>x</b>', {}, {}), /<b>/, 'escaped');
// the active ingredient (owner 2026-11-21): the page's language first, the other one when only that is written, nothing when nothing
const act = { 1: { active_ar: 'ديكلوفيناك بوتاسيوم ٥٠ مجم', active_en: 'Diclofenac potassium 50 mg' }, 2: { active_ar: 'باراسيتامول' }, 3: { active_en: 'Paracetamol' }, 4: { active_ar: '  ', active_en: null } };
assert.equal(M.activeOf(1, act, 'ar'), 'ديكلوفيناك بوتاسيوم ٥٠ مجم'); assert.equal(M.activeOf(1, act, 'en'), 'Diclofenac potassium 50 mg');
assert.equal(M.activeOf(2, act, 'en'), 'باراسيتامول', 'only Arabic written: shown as it is in English too');
assert.equal(M.activeOf(3, act, 'ar'), 'Paracetamol', 'only English written: shown as it is in Arabic too');
assert.equal(M.activeOf(4, act, 'ar'), '', 'blank = nothing'); assert.equal(M.activeOf(99, act, 'ar'), ''); assert.equal(M.activeOf(1, null, 'ar'), '');
// English: every text the sheet draws for the owner comes out with no Arabic left
global.window = global; require('../ar/i18n-en.js'); require('../ar/i18n.js');
const I = global.AskerI18n; I._use(global.AskerEN);
const AR = /[؀-ۿ]/, bad = [];
for (const t of ['✏️ تعديل الصنف', '✖ اقفل التعديل', 'صورة الصنف', 'الاسم', 'الاسم العربي', 'الاسم في فارما فلاي (للقراية بس)', '💊 المادة الفعالة', '💊 المادة الفعالة:', 'المادة الفعالة بالعربي', 'المادة الفعالة بالإنجليزي',
  'اللي تكتبه بلغة واحدة بس بيتعرض زي ما هو في اللغتين.', 'البيان', '✍️ احفظ', 'مفيش تغيير', 'اتحفظ ✔', 'بيحفظ…', 'الاسم قصير قوي', 'ماتحفظش: network error', 'اكتب الاسم الصح بالعربي',
  'مفيش بيان للصنف ده لسه. تقدر تكتبه من «✏️ تعديل الصنف».']) { const e = I.translate(t); if (AR.test(e)) bad.push(t + ' -> ' + e); }
// the photo reading (owner 2026-11-21): every state's texts
for (const t of ['📷 صوّر المادة الفعالة من العلبة', 'بيبعت الصورة…', 'بيتقرا…', 'اللاب بيقرا الصورة ويترجمها (حوالي نص دقيقة). تقدر تقفل الشاشة، والنتيجة هتلاقيها هنا لما تفتح الصنف تاني.',
  'اللاب يمكن مش شغال دلوقتي: الطلب مستني وهيتقري أول ما يرجع.', 'اتقرا من الصورة', 'مكتوب بالإنجليزي على العلبة', 'مكتوب بالعربي على العلبة', 'مكتوب بالعربي والإنجليزي على العلبة',
  'راجعه وصحّحه لو فيه غلط، وبعدين اضغط «احفظ». لحد ما تحفظ مفيش حاجة اتغيّرت.', 'مش متأكد 100%: راجع الحروف والأرقام كويس.', 'مقدرتش أقرا المادة الفعالة من الصورة',
  'مش مكتوبة في الجنب ده أو الصورة مش واضحة. صوّر الجنب التاني أو قرّب. السيستم بيقرا المكتوب بس، مش بيخمّن من اسم الدوا.', 'القراية فشلت', 'جرّب تصوّر تاني.', 'الملف ده مش صورة.', 'ما اتبعتتش: network error']) {
  const e = I.translate(t); if (AR.test(e)) bad.push(t + ' -> ' + e);
}
assert.deepEqual(bad, [], 'untranslated: ' + bad.join(' | '));
assert.equal(I.translate('✍️ احفظ'), '✍️ Save'); assert.equal(I.translate('💊 المادة الفعالة'), '💊 Active ingredient');
// the photo's state (2026-11-27, «صور الأصناف»): none / net (nobody of ours chose it) / ok
const PS = require('../ar/item-media.js').photoState;
const P = { 1: 'a.jpg', 6: 'f.jpg' };
assert.equal(PS(2, P, {}), 'none');
assert.equal(PS(1, P, {}), 'net', "the site's own list");
assert.equal(PS(3, P, { 3: { img: 'e/3.jpg', updated_by: null } }), 'net', 'the night search');
assert.equal(PS(3, P, { 3: { img: 'e/3.jpg', updated_by: 'u1' } }), 'ok', 'a person took or picked it');
assert.equal(PS(1, P, { 1: { img: null, updated_by: 'u1' } }), 'net', 'a person who only wrote the description did not choose the photo');
assert.equal(PS(4, P, { 4: { img_off: true } }), 'ok', 'removed on purpose: not asked');
assert.equal(PS(6, P, { 6: { img: null, photo_ok_at: '2026-11-27T01:00:00Z' } }), 'ok', 'kept with «تمام»');
console.log('item-media ok');
