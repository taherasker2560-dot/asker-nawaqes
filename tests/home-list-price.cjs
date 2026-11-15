// The search card (ar/home.js): a warehouse list priced differently from ours (owner 2026-11-15: «لو … سعره عندي جنيه، وفي حد في
// القوائم سعره جنيه وربع، تكتب لي جنبه وفي القوائم مخزن كذا جنيه وربع»). Pure part only.
const assert = require('node:assert/strict');
global.window = global;
const H = require('../ar/home.js');
const it = { offers: [
  { supplier: 'AMG', price: 1.25, disc: 20, date: '2026-11-12' },
  { supplier: 'AMG', price: 1, disc: 22, date: '2026-11-01' },       // an older AMG line: only the newest one counts
  { supplier: 'REDA', price: 1, disc: 18, date: '2026-11-11' },      // same price as ours: not shown
  { supplier: 'NEWCITY', price: 0, disc: 30, date: '2026-11-11' },   // no price on the list: not shown
] };
assert.equal(H.listPriceText(it, 1), 'وفي القوايم AMG 1.25 ج');
assert.equal(H.listPriceText(it, 1.25), 'وفي القوايم رضا عطية 1 ج');
assert.equal(H.listPriceText(it, null), '', 'no price of ours: nothing to compare');
assert.equal(H.listPriceText({ offers: [] }, 5), '');
console.log('home-list-price ok');
