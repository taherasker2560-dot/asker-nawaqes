/* A copy kept on this phone (IndexedDB) of the big read-only lists the search uses: the warehouses' lines, every item of
   the system, the last purchases (owner 2026-11-13: «قوايم المخازن بتغيب على ما تحمّل … مش مفيد للشغل»).
   The server stays the source: the search shows the kept copy at once, then the copy is checked and replaced in the
   background when it changed. Nothing here is ever written to the server. Cleared on «خروج». */
(function (root) {
  'use strict';
  const DB = 'asker-cache', STORE = 'kv';
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((ok, no) => {
      if (!root.indexedDB) return no(new Error('no IndexedDB'));
      const r = root.indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
      r.onblocked = () => no(new Error('blocked'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  function req(mode, fn) {
    return open().then((d) => new Promise((ok) => {
      let out = null;
      const tx = d.transaction(STORE, mode), r = fn(tx.objectStore(STORE));
      if (r) r.onsuccess = () => { out = r.result === undefined ? null : r.result; };
      tx.oncomplete = () => ok(out);
      tx.onerror = tx.onabort = () => ok(null);
    })).catch(() => null);
  }
  const get = (k) => req('readonly', (s) => s.get(k));
  const set = (k, v) => req('readwrite', (s) => { s.put(v, k); });
  const del = (k) => req('readwrite', (s) => { s.delete(k); });
  const clear = () => req('readwrite', (s) => { s.clear(); });
  root.AskerCache = { get, set, del, clear };
})(typeof window === 'undefined' ? globalThis : window);
