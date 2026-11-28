// «📊 التقارير» (owner 2026-11-26: «تلم لي كل ما هو تقرير… في قائمه واحده»، «هيبقى هو ده الزرار السادس»، «ا، ابنيها»): the pure part of ar/reports.js and of the sixth button in ar/shortcuts.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.window = global;
const R = require('../ar/reports.js');
const S = require('../ar/shortcuts.js');
require('../ar/i18n-en.js'); require('../ar/i18n.js'); const I = global.AskerI18n; I._use(global.AskerEN);

// five groups, twenty reports, each once, each opening a screen the page really has (the three of «الأصناف يوم بيوم» on top since 2026-11-28: one screen)
assert.deepEqual(R.GROUPS.map((g) => g[0]), ['الأصناف يوم بيوم', 'الفلوس والربح', 'المبيعات والعملاء', 'المخزون', 'المشتريات والموردين']);
assert.equal(R.ALL.length, 20);
assert.equal(new Set(R.ALL.map((r) => r.id)).size, 20);
assert.equal(R.ALL.find((r) => r.id === 'retmarks').alview, 'returns', '«المرتجعات المطلوبة» opens the returns view of «الصلاحيات» (owner 2026-11-28)');
const app = fs.readFileSync(path.join(__dirname, '..', 'ar', 'app.js'), 'utf8');
const groupOf = app.slice(app.indexOf('const GROUP_OF = {'), app.indexOf('const PGROUP_OF'));
for (const r of R.ALL) assert.ok(new RegExp('\\b' + r.tab + ': \'').test(groupOf), 'a screen of the page: ' + r.tab);
for (const r of R.ALL) assert.ok(R.ICONS[r.ic], 'an icon: ' + r.ic);
// the reports that are screens of their own live in no section of the bar, and «‹ التقارير» is always on top of them
assert.deepEqual(R.OWN.slice().sort(), ['day', 'dayclose', 'dayitems', 'profit', 'sales', 'stockval']);
for (const t of [...R.OWN, 'reports']) assert.ok(new RegExp('\\b' + t + ': \'reports\'').test(groupOf), t + ' is in the reports group');
const html = fs.readFileSync(path.join(__dirname, '..', 'asker-nawaqes-arabic.html'), 'utf8');
for (const t of R.OWN) assert.equal(html.includes(`data-tab="${t}"`), false, t + ' is no section tab any more');
assert.equal(R.showBack('day', null), true);
assert.equal(R.showBack('cash', 'cash'), true, 'opened from the reports page');
assert.equal(R.showBack('cash', null), false, 'opened from its own section');
assert.equal(R.showBack('customers', 'vendors'), false);

// every report screen of its own can also be a button; «التقارير» too
for (const t of ['reports', 'day', 'profit', 'dayclose', 'stockval', 'sales', 'dayitems']) assert.ok(S.LABEL[t], 'in the buttons list: ' + t);

// the sixth button: the first slot is always «التقارير»; what he had there moves to the first empty slot
assert.deepEqual(S.pinReports(S.spareParse(null)), ['reports', null, null, null, null]);
assert.deepEqual(S.pinReports(['docs', null, 'stock', null, null]), ['reports', 'docs', 'stock', null, null]);
assert.deepEqual(S.pinReports(['docs', 'docs', null, null, null]), ['reports', 'docs', null, null, null], 'already in another slot: not twice');
assert.deepEqual(S.pinReports(['docs', 'stock', 'cash', 'pay', 'care']), ['reports', 'stock', 'cash', 'pay', 'care'], 'no empty slot: his four stay, the first one stays reachable from its section');
assert.deepEqual(S.pinReports(['reports', 'reports', 'cash', null, null]), ['reports', null, 'cash', null, null], 'picked twice before: once now');
assert.deepEqual(S.pinReports(S.pinReports(['docs', null, null, null, null])), ['reports', 'docs', null, null, null], 'opening again changes nothing');

// the English
for (const s of R.WORDS) assert.doesNotMatch(I.translate(s), /[؀-ۿ]/, 'Arabic left in English: ' + s + ' → ' + I.translate(s));
console.log('PASS: reports: the four groups, the screens behind them, the sixth button, the English');
