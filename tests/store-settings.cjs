// «إعدادات الموقع» helpers (ar/store-settings.js): the WhatsApp number and the row saved to ar_store_settings
// (same limits as the table's checks).
const assert=require('node:assert/strict');
const S=require('../ar/store-settings.js');
assert.equal(S.cleanPhone('01012345678'),'01012345678');
assert.equal(S.cleanPhone('+20 10 1234 5678'),'01012345678');
assert.equal(S.cleanPhone('٠١٠١٢٣٤٥٦٧٨'),'01012345678');
assert.equal(S.cleanPhone(''),'','empty = no number shown');
assert.equal(S.cleanPhone('0101234'),null);
let r=S.settingsRow({is_open:false,closed_message:'  الطلبات هترجع 9 الصبح ',hero_title:'',hero_text:'x'.repeat(500),whatsapp:'01012345678'});
assert.deepEqual(r.row,{is_open:false,closed_message:'الطلبات هترجع 9 الصبح',hero_title:null,hero_text:'x'.repeat(400),whatsapp:'01012345678'});
r=S.settingsRow({is_open:true,whatsapp:''});assert.equal(r.row.whatsapp,null);assert.equal(r.row.is_open,true);
assert.ok(S.settingsRow({is_open:true,whatsapp:'123'}).error,'bad number refused before saving');
// the site's look (2026-11-12): a ready color id or c:#rrggbb; nothing sent when the columns are not there yet
assert.deepEqual(S.settingsRow({is_open:true,whatsapp:'',theme_color:'teal',theme_night:1}).row.theme_color,'teal');
assert.equal(S.settingsRow({is_open:true,whatsapp:'',theme_color:'c:#0A4AA6',theme_night:0}).row.theme_color,'c:#0a4aa6');
assert.equal(S.settingsRow({is_open:true,whatsapp:'',theme_color:'red;drop'}).error,'اللون مش مظبوط');
assert.ok(!('theme_color' in S.settingsRow({is_open:true,whatsapp:''}).row),'old database: no color fields');
// the most boxes one order may hold of an item (2026-11-19): empty = no limit of his own, a whole number 1..20, Arabic digits read, anything else refused before saving
assert.deepEqual(S.cleanMaxQty(''),{value:null});assert.deepEqual(S.cleanMaxQty(null),{value:null});assert.deepEqual(S.cleanMaxQty('   '),{value:null});
assert.deepEqual(S.cleanMaxQty('5'),{value:5});assert.deepEqual(S.cleanMaxQty(' 20 '),{value:20});assert.deepEqual(S.cleanMaxQty('١'),{value:1});assert.deepEqual(S.cleanMaxQty(3),{value:3});
for(const bad of ['0','21','-1','2.5','abc','1e1','٠'])assert.ok(S.cleanMaxQty(bad).error,'refused: '+bad);
console.log('store-settings ok');
