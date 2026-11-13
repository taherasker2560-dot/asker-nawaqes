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
  // the phone's storage must answer within a moment (2026-11-13: on his phone it never answered and the search waited
  // a quarter of an hour): otherwise the copy is skipped for this opening and everything is read from the server
  const WAIT_MS = 2500;
  let broken = false;
  function req(mode, fn) {
    if (broken) return Promise.resolve(null);
    const work = open().then((d) => new Promise((ok) => {
      let out = null;
      const tx = d.transaction(STORE, mode), r = fn(tx.objectStore(STORE));
      if (r) r.onsuccess = () => { out = r.result === undefined ? null : r.result; };
      tx.oncomplete = () => ok(out);
      tx.onerror = tx.onabort = () => ok(null);
    })).catch(() => null);
    // a write may take its time in the background; a read is what the search waits for
    if (mode !== 'readonly') return work;
    return Promise.race([work, new Promise((ok) => setTimeout(() => { broken = true; ok(null); }, WAIT_MS))]);
  }
  const get = (k) => req('readonly', (s) => s.get(k));
  const set = (k, v) => req('readwrite', (s) => { s.put(v, k); });
  const del = (k) => req('readwrite', (s) => { s.delete(k); });
  const clear = () => req('readwrite', (s) => { s.clear(); });
  // a server read that never answers (a weak line) must not hold the search forever: each page gets a time limit and
  // one more try (supabase-js: .abortSignal)
  function limited(build, ms) {
    const once = () => {
      const q = build();
      if (!q || !q.abortSignal || !root.AbortController) return q;
      const c = new root.AbortController(), t = setTimeout(() => c.abort(), ms || 30000);
      return Promise.resolve(q.abortSignal(c.signal)).finally(() => clearTimeout(t));
    };
    return Promise.resolve(once()).then((r) => (r && r.error && /abort/i.test(String(r.error.message || r.error.name || '')) ? once() : r));
  }
  root.AskerCache = { get, set, del, clear, limited };
})(typeof window === 'undefined' ? globalThis : window);
