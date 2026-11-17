// «كرّر دواك بالباركود» (store/scan.js, owner 2026-11-17): the sticker's number, the strip of the picture, the camera's reading rules (copied from the bot's sale,
// ar/tempsale.js: kept in step here), and the words.
const assert=require('node:assert/strict');
const S=require('../store/scan.js');
const T=require('../ar/tempsale.js');
const yy=String((new Date().getFullYear()+2)%100).padStart(2,'0');
// the sticker's barcode (an ITF of 10 digits: 1 + code(5) + expiry month + year) and the number printed above it (6 digits, 100000 + code)
assert.deepEqual(S.stickerRead('101060'),{code:1060,exp:null});
assert.deepEqual(S.stickerRead('163070'),{code:63070,exp:null});
assert.deepEqual(S.stickerRead(`1634760${'7'}${yy}`.slice(0,10)),S.stickerRead(`16347607${yy}`));
assert.equal(S.stickerRead(`16347607${yy}`).code,63476);
assert.match(S.stickerRead(`16347607${yy}`).exp,/^20\d\d-07$/);
assert.equal(S.stickerRead('100000'),null,'code 0 is nothing');
assert.equal(S.stickerRead('4006381333931'),null,'a factory EAN is not a sticker');
assert.equal(S.stickerRead('1634036085'),null,'a misread with a year far from now is dropped');
assert.equal(S.stickerRead('1634760799'),null,'month 79 does not exist');
assert.equal(S.stickerRead(''),null);
// a typed code: the printed 6 digits, the whole barcode, or the item's code; Arabic digits too; a camera reading counts only as a whole sticker number
assert.equal(S.stickerCode('101060',false),1060);
assert.equal(S.stickerCode('١٠١٠٦٠',false),1060);
assert.equal(S.stickerCode('1060',false),1060,'the item\'s own code');
assert.equal(S.stickerCode(' 4875 ',false),4875);
assert.equal(S.stickerCode('abc',false),null);
assert.equal(S.stickerCode('',false),null);
assert.equal(S.stickerCode('1234567',false),null,'7 digits is not a code');
assert.equal(S.stickerCode('1060',true),null,'the camera: a short reading is a misread');
assert.equal(S.stickerCode('101060',true),1060);
// the camera's reading rules are the bot's: the same value twice in a row (ITF three times), the same sticker in view counts once
const rd=S.makeReader();let t=1000;
assert.equal(rd.feed('101060','code_128',t),null,'once is not enough');
assert.equal(rd.feed('101060','code_128',t+200),'101060','twice in a row counts');
rd.accept('101060',t+200);
assert.equal(rd.feed('101060','code_128',t+400),null,'the same sticker still in view');
assert.equal(rd.feed('101060','code_128',t+700),null);
assert.equal(rd.feed('101060','code_128',t+700+2500),null,'it left the view for 2 s: counted again only after two more readings');
assert.equal(rd.feed('101060','code_128',t+700+2700),'101060');
const rd2=S.makeReader();
assert.equal(rd2.feed('1634760729','itf',5000),null);assert.equal(rd2.feed('1634760729','itf',5200),null,'ITF has no check digit: three');
assert.equal(rd2.feed('1634760729','itf',5400),'1634760729');
const rd3=S.makeReader();
assert.equal(rd3.feed('101060','code_128',9000),null);assert.equal(rd3.feed('101061','code_128',9200),null,'another value restarts the count');
assert.equal(rd3.feed('101061','code_128',9400),'101061');
assert.equal(rd3.feed('','code_128',9500),null);
// the same decisions as the bot's own functions
for(const v of ['101060','163070','1634760729','1634036085','4006381333931','100000','','abc','1060','١٠١٠٦٠'])assert.deepEqual(S.stickerRead(v),T.stickerRead(v),'stickerRead '+v);
for(const v of ['101060','١٠١٠٦٠','1060','12345678','abc',''])for(const sc of [true,false])assert.equal(S.stickerCode(v,sc),T.stickerCode(v,sc),`stickerCode ${v} ${sc}`);
for(const [w,h,a] of [[1920,1080,3.5],[1080,1920,3.5],[640,480,3.5],[0,0,3.5]])assert.deepEqual(S.stripBox(w,h,a),T.stripBox(w,h,a),'stripBox '+w);
const cams=[{label:'camera2 2, facing back'},{label:'camera2 0, facing back'},{label:'camera2 1, facing front'}];
assert.deepEqual(S.mainBack(cams),T.mainBack(cams));assert.equal(S.mainBack([]),null);assert.equal(S.mainBack(null),null);
assert.equal(S.NEED.itf,3);assert.equal(S.GONE_MS,2000);
// the words: every text exists in Arabic with the placeholders the page fills
for(const [k,v] of Object.entries(S.TEXTS))assert.ok(/[؀-ۿ]/.test(v),k);
for(const k of ['notSticker','needsRx','notOrderable','added','each'])assert.match(S.TEXTS[k],/\{0\}/,k);
assert.match(S.TEXTS.goItems,/\{0\}.*\{1\}/);
console.log('store-scan ok');
