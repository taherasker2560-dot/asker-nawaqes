// Smart search (ar/fuzzy.js) used by «النواقص» and «المخازن»: letters in order with skips, sound-alike letters, one wrong
// letter forgiven in long words, every word typed must be found, closest names first.
const assert = require('node:assert/strict');
const F = require('../ar/fuzzy.js');

// one spelling: alef / yaa / taa marbuta / Persian forms / sound-alike letters / digits / diacritics
assert.equal(F.fold('أمبيسلين ٥٠٠ شراب'), F.fold('امبیسلین 500 شراب'));
assert.equal(F.fold('طاقة'), F.fold('تاكه'));
assert.equal(F.fold('صَيْدَلِيَّة'), 'سيدليه');
assert.equal(F.fold('Concor 5 PLUS'), 'concor 5 plus');
assert.equal(F.fold('اتاكاند ١٢٫٥/١٦'), 'اتاكاند 12 5 16');
assert.deepEqual(F.words('  '), []);

const NAMES = [
  'ابيروفاستين ٤٠ مجم اقراص',
  'ابيروفاستين ٢٠ مجم اقراص',
  'كونكور ٥ بلس',
  'كونكور ١٠ مجم اقراص',
  'بروفين ٤٠٠ مجم ٣٠ قرص',
  'امبيسلين ٥٠٠ شراب',
  'فلاجيل ١٢٥ شراب',
  'سيتال اكسترا 20 قرص',
  'سيتال شراب',
  'طاقة بلس اكياس',
];
const items = NAMES.map((n) => ({ n, h: [F.fold(n)] }));
const find = (q, limit) => F.rank(q, items, (x) => x.h, limit).map((x) => x.n);

// the owner's way: first letter, skip the second, then the third, the fourth, the last
assert.equal(find('ابرفستن')[0], 'ابيروفاستين ٤٠ مجم اقراص');
assert.ok(find('ابرفستن').every((n) => n.startsWith('ابيروفاستين')), 'only ابيروفاستين matches');
assert.deepEqual(find('ابرفستن 20'), ['ابيروفاستين ٢٠ مجم اقراص'], 'a number picks the strength');
assert.deepEqual(find('كنكر٥'), ['كونكور ٥ بلس'], 'letters glued to a number are two words');
assert.deepEqual(find('كنكر 10'), ['كونكور ١٠ مجم اقراص']);
// sound-alike letters: ط/ت and ق/ك
assert.deepEqual(find('تاكه'), ['طاقة بلس اكياس']);
// one wrong letter in a long word (ز instead of س) is forgiven; in a short word it is not
assert.equal(find('امبيزلين')[0], 'امبيسلين ٥٠٠ شراب');
assert.deepEqual(find('زيت'), []);
// every word must be found, in any order
assert.deepEqual(find('شراب سيتال'), ['سيتال شراب']);
assert.deepEqual(find('اكسترا سيتال'), ['سيتال اكسترا 20 قرص']);
// the name that starts with what was typed comes before one that only contains it
assert.deepEqual(find('شراب').slice(0, 1), ['سيتال شراب'], 'shorter name with the word wins the tie');
assert.equal(find('بروفين')[0], 'بروفين ٤٠٠ مجم ٣٠ قرص');
// letters side by side beat the same letters spread out
assert.equal(find('سيتال')[0], 'سيتال شراب');
// nothing typed = everything, in the given order; a limit is kept
assert.deepEqual(find(''), NAMES);
assert.equal(find('ا', 3).length, 3);
// English names: letters with skips too
const en = ['CLEOCIN 50GM CREAM', 'CONCOR 5 PLUS 30TAB', 'CONTRA MEDICATED CONDITIONER 200ML', 'BRUFEN 400MG 30TAB'].map((n) => ({ n, h: [F.fold(n)] }));
assert.equal(F.rank('cncr', en, (x) => x.h)[0].n, 'CONCOR 5 PLUS 30TAB');
assert.equal(F.rank('cncr 5', en, (x) => x.h)[0].n, 'CONCOR 5 PLUS 30TAB', 'letters inside one word beat letters spread over words');
// a name given as [folded, minus] counts less: the warehouse's own Arabic name beats our (maybe wrong) PharmaFly name
const lines = [{ n: 'برو درينك اكياس', h: [F.fold('برو درينك اكياس'), [F.fold('ابيرو فاستين'), 1]] }, { n: 'ابيروفاستين ٤٠', h: [F.fold('ابيروفاستين ٤٠'), [F.fold('EPIROVASTIN 40'), 1]] }];
assert.equal(F.rank('ابرفستن', lines, (x) => x.h)[0].n, 'ابيروفاستين ٤٠');
assert.deepEqual(F.rank('brfn 400', en, (x) => x.h).map((x) => x.n), ['BRUFEN 400MG 30TAB']);
// an item with two names (Arabic + English) is found by either
const two = [{ n: 'x', h: [F.fold('بروفين ٤٠٠'), F.fold('BRUFEN 400MG')] }];
assert.equal(F.rank('brufen', two, (x) => x.h).length, 1);
assert.equal(F.rank('بروفين', two, (x) => x.h).length, 1);
assert.equal(F.rank('بروفين brufen', two, (x) => x.h).length, 0, 'all words must be in the same name');
// strict (the warehouses' lines that are not one of our items, owner 2026-11-13 «اصناف تانية غريبة ملهاش علاقة»):
// a typed word stays inside one word of the line, no letter is forgiven, and the match must be close enough
const wl = ['ابيمول اقراص', 'ابیمول اكسترا اقراص', 'اب كیر امبولات', 'ابكير امبولات للشعر', 'ابيرازول ٤٠ مجم ١٠ كبسولات', 'امبروبيم ١جم فيال', 'صابيميثارون امبول', 'ابيروفاستين ٤٠ مجم اقراص'].map((n) => ({ n, h: [F.fold(n)] }));
const strict = (q) => F.rank(q, wl, (x) => x.h, 10, { strict: true, min: 0.6 }).map((x) => x.n);
assert.deepEqual(strict('ابيمول'), ['ابيمول اقراص', 'ابیمول اكسترا اقراص'], 'no «اب كير امبول» picked from three words');
assert.ok(F.rank('ابيمول', wl, (x) => x.h).some((x) => x.n === 'اب كیر امبولات'), 'the normal search is unchanged');
assert.deepEqual(strict('ابكير'), ['ابكير امبولات للشعر', 'اب كیر امبولات'], 'only the space itself may be skipped');
assert.deepEqual(strict('شامبو'), [], 'no letter forgiven («امبروبيم»)');
assert.deepEqual(strict('ابرفستن'), ['ابيروفاستين ٤٠ مجم اقراص'], "the owner's way still works");
// speed: 30,000 names, one search well under a second
const many = [];
for (let i = 0; i < 30000; i++) many.push({ h: [F.fold(NAMES[i % NAMES.length] + ' ' + i)] });
const t0 = Date.now();
F.rank('ابرفستن 40', many, (x) => x.h, 60);
assert.ok(Date.now() - t0 < 1000, 'search over 30,000 names took ' + (Date.now() - t0) + ' ms');
console.log('fuzzy ok');
