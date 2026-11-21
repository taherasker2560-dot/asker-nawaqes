// ar/cache.js (2026-11-21): a quick read must NOT mark the phone's storage as broken. The 2.5 s timer of a read used to fire
// even after the read had answered, so every write later than that (the fresh copy saved when a slow server read ended) was
// skipped. Only a read that really does not answer marks it broken (then the search goes to the server at once).
// A small in-memory IndexedDB stands in for the phone's storage.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'ar', 'cache.js'), 'utf8');
const later = (fn) => setTimeout(fn, 1);
// a storage that answers at once (hang = true: the open never answers, like his phone on 2026-11-13)
function fakeIDB(hang) {
  const data = new Map();
  const reqOf = (fn) => { const r = {}; later(() => { r.result = fn(); r.onsuccess && r.onsuccess(); }); return r; };
  const db = {
    createObjectStore() {},
    transaction() {
      const tx = {};
      tx.objectStore = () => ({ get: (k) => reqOf(() => data.get(k)), put: (v, k) => reqOf(() => { data.set(k, v); }), delete: (k) => reqOf(() => { data.delete(k); }), clear: () => reqOf(() => { data.clear(); }) });
      setTimeout(() => tx.oncomplete && tx.oncomplete(), 5);
      return tx;
    },
  };
  return { open() { const r = {}; if (!hang) later(() => { r.result = db; r.onupgradeneeded && r.onupgradeneeded(); r.onsuccess && r.onsuccess(); }); return r; } };
}
function load(idb) { const ctx = { indexedDB: idb, setTimeout, clearTimeout, Promise, AbortController }; vm.runInNewContext(src, ctx); return ctx.AskerCache; }
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

(async () => {
  // a quick storage: read, wait past the 2.5 s limit, then write and read again: both still work
  const C = load(fakeIDB(false));
  await C.set('hs-catalog-v1', { sig: 'a', rows: [1] });
  assert.deepEqual(await C.get('hs-catalog-v1'), { sig: 'a', rows: [1] });
  await sleep(2800);   // longer than WAIT_MS: the old timer fired here and marked the storage broken
  await C.set('hs-catalog-v1', { sig: 'b', rows: [1, 2] });
  assert.deepEqual(await C.get('hs-catalog-v1'), { sig: 'b', rows: [1, 2] }, 'a write after a quick read is kept (the fresh copy reaches the phone)');
  assert.equal(await C.get('nothing'), null);

  // a storage that never answers: the read gives up in about 2.5 s, and the next reads do not wait at all
  const H = load(fakeIDB(true));
  let t = Date.now();
  assert.equal(await H.get('hs-catalog-v1'), null);
  const first = Date.now() - t;
  assert.ok(first >= 2400 && first < 4000, 'the first read waits the limit once: ' + first + ' ms');
  t = Date.now();
  assert.equal(await H.get('hs-catalog-v1'), null);
  assert.ok(Date.now() - t < 100, 'after that the copy is skipped at once (the server is read)');
  console.log('cache-slow-write ok');
})().catch((e) => { console.error(e); process.exit(1); });
