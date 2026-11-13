// «الرسايل» (owner 2026-11-13): pure parts of the customer's page (store/chat.js) and the bot's list (ar/chat.js).
const assert = require('node:assert/strict');
global.window = global;
const C = require('../store/chat.js');
const B = require('../ar/chat.js');

// the number: 11 digits from 01, Arabic digits and +20 accepted
assert.equal(C.normPhone('01012345678'), '01012345678');
assert.equal(C.normPhone('+20 101 234 5678'), '01012345678');
assert.equal(C.normPhone('٠١٠١٢٣٤٥٦٧٨'), '01012345678');
assert.equal(C.normPhone('0101234'), null);
assert.equal(C.cleanName('  أحمد   <b>محمود</b> '), 'أحمد b محمود /b');

// the voice note: 48 kHz brought down to 16 kHz (averaging), then a 16-bit mono WAV
const s = new Float32Array(48000).map((_, i) => (i % 3 === 0 ? 0.3 : 0));
const d = C.downsample(s, 48000, 16000);
assert.equal(d.length, 16000);
assert.ok(Math.abs(d[0] - 0.1) < 1e-6, 'each 3 samples averaged');
assert.equal(C.downsample(new Float32Array(10), 16000, 16000).length, 10, 'same rate: as it is');
const w = C.encodeWav(Float32Array.from([0, 1, -1, 0.5]), 16000);
const txt = (a, b) => String.fromCharCode(...w.slice(a, b));
assert.equal(txt(0, 4), 'RIFF'); assert.equal(txt(8, 12), 'WAVE'); assert.equal(txt(36, 40), 'data');
const v = new DataView(w.buffer);
assert.equal(v.getUint32(24, true), 16000, 'rate'); assert.equal(v.getUint16(22, true), 1, 'mono'); assert.equal(v.getUint16(34, true), 16, '16 bit');
assert.equal(v.getUint32(40, true), 8, '4 samples × 2 bytes');
assert.deepEqual([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true)], [0, 32767, -32768, 16383]);
assert.equal(w.length, 52);
assert.equal(C.mmss(72), '1:12');
// the push key: 65 bytes, starting with 4 (an uncompressed P-256 point)
const k = C.keyBytes(C.VAPID);
assert.equal(k.length, 65); assert.equal(k[0], 4);

// the bot's list: waiting first means «the customer wrote last»; newest first
const chats = [
  { id: 'a', waiting: 0, last_at: '2026-11-13T20:00:00Z' },
  { id: 'b', waiting: 2, last_at: '2026-11-13T21:00:00Z' },
  { id: 'c', waiting: 1, last_at: '2026-11-13T22:00:00Z' },
];
assert.deepEqual(B.pickChats(chats, 'waiting').map((c) => c.id), ['c', 'b']);
assert.deepEqual(B.pickChats(chats, 'all').map((c) => c.id), ['c', 'b', 'a']);
assert.equal(B.waitingCount(chats), 2);
assert.equal(B.showPhone('01012345678'), '0101 234 5678');
const now = new Date(2026, 10, 13, 23, 0);
assert.equal(B.whenText(new Date(2026, 10, 13, 22, 33).toISOString(), now), '10:33 م');
assert.equal(B.whenText(new Date(2026, 10, 12, 9, 5).toISOString(), now), 'امبارح 9:05 ص');
assert.equal(B.whenText(new Date(2026, 10, 8, 9, 5).toISOString(), now), '08/11');
// a warehouse's file (owner 2026-11-14): PDF or Excel, by its name, else by its type; anything else is refused
const L = require('../store/chat.js');
assert.equal(L.fileExt({ name: 'عروض.PDF', type: '' }), 'pdf');
assert.equal(L.fileExt({ name: 'list.xlsx', type: 'application/octet-stream' }), 'xlsx');
assert.equal(L.fileExt({ name: 'old.xls', type: '' }), 'xls');
assert.equal(L.fileExt({ name: 'document', type: 'application/pdf' }), 'pdf');
assert.equal(L.fileExt({ name: 'sheet', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'xlsx');
assert.equal(L.fileExt({ name: 'a.docx', type: 'application/msword' }), '');
assert.equal(L.fileExt({ name: 'a.exe', type: '' }), '');
assert.deepEqual(Object.keys(L.FILE_TYPES).sort(), ['pdf', 'xls', 'xlsx']);
console.log('PASS: chat helpers (number, WAV 16 kHz, push key, the bot\'s list, a warehouse\'s files)');
