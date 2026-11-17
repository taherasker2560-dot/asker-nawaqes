// Migration 202611170200 (owner 2026-11-17, «ب»): visitors may read the store settings the page uses, by column, and nothing else of that table.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('supabase/migrations/202611170200_ar_store_settings_public_read.sql','utf8');
const code=sql.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n');
const g=/grant select \(([^)]*)\)\s+on public\.ar_store_settings to anon;/.exec(code);
assert.ok(g,'a column grant to anon');
const cols=g[1].split(',').map(s=>s.trim()).sort();
// exactly what store.js loadSettings() reads (the base list + the two color columns)
const js=fs.readFileSync('store/store.js','utf8');
const base=/const BASE = '([^']+)'/.exec(js)[1].split(',');
assert.deepEqual(cols,[...base,'theme_color','theme_night'].sort(),'the grant is the page\'s own column list');
for(const never of ['pay_vodafone','pay_instapay','id','updated_at'])assert.ok(!cols.includes(never),never+' stays closed to visitors');
assert.doesNotMatch(code,/grant\s+select\s+on/i,'no table-wide grant');
assert.doesNotMatch(code,/to (public|authenticated)\b/i);
// the old hero texts are emptied only when they are still the ones saved on 2026-11-12 (the owner's newer words are never touched)
assert.match(code,/set hero_title = null\s+where id = 1 and hero_title = 'اطلب من صيدليتك'/);
assert.match(code,/set hero_text = null\s+where id = 1 and hero_text = 'صحتك اولويه your health is periority'/);
assert.doesNotMatch(code,/delete |drop |truncate /i);
console.log('store-settings-public-migration ok');
