// Where a return stands in PharmaFly (owner 2026-11-28: «اول ما ادوس على الزرار» the robot enters it; the mark stays on the list until the goods are prepared,
// migration 202611281800_ar_return_entered). Pure part of ar/return-marks.js + the migration's text.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.window = global;
const L = require('../ar/return-marks.js');
assert.deepEqual(L.entryState({ units: 3, returned_units: 3, robot_state: 'saved' }), { kind: 'done', text: '📄 اتسجل مرتجع في فارمافلاي' }, 'entered in full wins');
assert.equal(L.entryState({ units: 3, returned_units: 1, robot_state: 'typing' }).kind, 'busy');
assert.equal(L.entryState({ units: 3, returned_units: 0, robot_state: 'saved' }).text, '🤖 اتسجل، مستني نسخة فارمافلاي');
assert.equal(L.entryState({ units: 3, returned_units: 0, robot_state: 'stopped', robot_note: 'الفاتورة مش لاقيها' }).text, '🤖 الروبوت وقف: الفاتورة مش لاقيها');
assert.equal(L.entryState({ units: 3, returned_units: 0 }).kind, 'wait');
assert.equal(L.entryState(null), null);
// the migration: entering never closes an unprepared mark; preparing an entered one closes it; the laptop's functions check its key
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202611281800_ar_return_entered.sql'), 'utf8');
assert.match(sql, /status = case when r\.status = 'prepared' then 'returned' else r\.status end/);
assert.match(sql, /v_status := case when m\.returned_units >= m\.units then 'returned' else 'prepared' end/);
for (const fn of ['ar_return_sync_key', 'ar_return_todo', 'ar_return_robot_set']) assert.match(sql, new RegExp(`function public\\.${fn}\\([\\s\\S]*?perform public\\.ar_return_key_ok\\(p_key\\)`), fn + ' checks the laptop key');
assert.match(sql, /revoke all on function public\.ar_return_sync_core\(\) from public, anon, authenticated;/, 'the core is never called from a page');
console.log('return-entered ok');
