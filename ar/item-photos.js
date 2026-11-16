/* «صور الأصناف في كشف حساب العميل» (owner 2026-11-16: «عايز لما أبعت كشف الحساب للعميل يبقى فيه صورة الأصناف اللي هو واخدها مع التفصيل، أو على الأقل رابط يوصل
   العميل لصورة الصنف في الستور»): for the items of a statement, the store's picture of each item (store/img/<file> from store/img/index.json; the owner's own change in
   ar_store_edits wins, «من غير صورة» = none) and the item's page in the store (store.html#item=<id>). A statement line only carries the PharmaFly item NAME, so the ids
   come from ar_store_items by exact name. ar/statement-pdf.js draws the pictures and makes each item a link. Read only; an item with no picture is drawn as before. */
(function (root) {
  'use strict';
  const MAX_NAMES = 150, CHUNK = 40, PARALLEL = 6, LOAD_MS = 8000;
  const INDEX_URL = 'store/img/index.json', EDIT_BUCKET = '/storage/v1/object/public/ar-store-img/';

  // ---------- pure helpers (also used by tests/item-photos.cjs) ----------
  // the distinct item names of a statement (sales and returns carry items), in order of appearance, at most `max`
  function namesOf(stmt, max) {
    const out = [], seen = new Set();
    for (const m of (stmt && stmt.rows) || []) {
      if (!(m.kind === 'sale' || m.kind === 'return') || !Array.isArray(m.items)) continue;
      for (const l of m.items) {
        const n = String((l && l.n) || '').trim();
        if (n && !seen.has(n)) { seen.add(n); out.push(n); if (out.length >= (max || MAX_NAMES)) return out; }
      }
    }
    return out;
  }
  // the item's page in the store, next to this page (store.html#item=<id>)
  function storeLink(id, base) {
    try { return new URL('store.html#item=' + Number(id), base || (root.location && root.location.href) || 'https://example.invalid/').href; } catch (e) { return ''; }
  }
  // where an item's picture is: the owner's change wins (a picture of his own, or «من غير صورة»), else the catalog's; '' = none
  function picUrl(id, index, edit, editBase) {
    if (edit && edit.img_off) return '';
    if (edit && edit.img) return String(editBase || '') + edit.img;
    return index && index[id] ? 'store/img/' + index[id] : '';
  }
  const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
  const api = { MAX_NAMES, namesOf, storeLink, picUrl, chunks };
  root.AskerItemPhotosLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  let index = null;
  async function loadIndex() {
    if (index) return index;
    try { const r = await fetch(INDEX_URL); index = r.ok ? await r.json() : {}; } catch (e) { index = {}; }
    return index;
  }
  // one picture; null when it does not load in time (the statement is made without it)
  function loadImage(src) {
    return new Promise((ok) => {
      const i = new Image(); let done = false;
      const end = (v) => { if (!done) { done = true; ok(v); } };
      i.crossOrigin = 'anonymous'; i.onload = () => end(i.naturalWidth ? i : null); i.onerror = () => end(null);
      setTimeout(() => end(null), LOAD_MS);
      i.src = src;
    });
  }
  async function pool(list, fn) {
    const out = new Array(list.length); let next = 0;
    await Promise.all(Array.from({ length: Math.min(PARALLEL, list.length) }, async () => { while (next < list.length) { const k = next++; out[k] = await fn(list[k]); } }));
    return out;
  }
  // Map(name -> { id, img, url }) for the names that have a picture; any trouble = fewer pictures, never an error
  async function forNames(db, names) {
    const out = new Map();
    if (!db || !names || !names.length) return out;
    const idx = await loadIndex();
    const idOf = new Map();
    for (const part of chunks(names, CHUNK)) {
      try {
        const { data, error } = await db.from('ar_store_items').select('id,name').in('name', part);
        if (!error) for (const r of data || []) if (!idOf.has(String(r.name).trim())) idOf.set(String(r.name).trim(), Number(r.id));
      } catch (e) { /* no store items: no pictures */ }
    }
    const ids = [...new Set(idOf.values())];
    const edits = new Map();
    for (const part of chunks(ids, 100)) {
      try {
        const { data, error } = await db.from('ar_store_edits').select('item_id,img,img_off').in('item_id', part);
        if (!error) for (const r of data || []) edits.set(Number(r.item_id), r);
      } catch (e) { /* the table is not there: the catalog's pictures */ }
    }
    const editBase = (db.supabaseUrl || '').replace(/\/$/, '') + EDIT_BUCKET;
    const todo = [...idOf.entries()].map(([name, id]) => ({ name, id, src: picUrl(id, idx, edits.get(id), editBase), alt: picUrl(id, idx, null, editBase) })).filter((x) => x.src);
    await pool(todo, async (x) => {
      let img = await loadImage(x.src);
      if (!img && x.alt && x.alt !== x.src) img = await loadImage(x.alt);   // his own picture did not load: the catalog's
      if (img) out.set(x.name, { id: x.id, img, url: storeLink(x.id) });
    });
    return out;
  }
  root.AskerItemPhotos = { forNames, namesOf };
})(typeof window === 'undefined' ? globalThis : window);
