/* «قبل الموسم» (owner 2026-11-16, idea 6 of the three he picked): the items that sold much more than their normal month in the SAME coming
   30 days last year (and the year before), whose stock now is below what that season usually takes: ask for them before the season, not in it.
   Data: asker-private/seasonal/seasonal.json from the laptop (Hub\seasonal\BUILD_SEASONAL.ps1, read only on PharmaFly's copy, rebuilt at most every
   12 hours; owner only). A card at the top of «النواقص» and a row on the home (the ones that repeated in both years). Nothing is written from here. */
(function (root) {
  'use strict';
  const PATH = 'seasonal/seasonal.json';
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

  // ---------- pure helpers (also used by tests/season.cjs) ----------
  // the file must look like what the laptop writes; anything else is «no seasonal data»
  function parse(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.items)) return null;
    const items = o.items.filter((x) => x && x.i != null && x.n).map((x) => ({
      i: num(x.i), n: String(x.n), ex: num(x.ex), y1: num(x.y1), y2: num(x.y2), avg: num(x.avg), have: num(x.have), strong: !!x.strong,
    }));
    return { from: String(o.from || ''), to: String(o.to || ''), days: num(o.days) || 30, dataAt: String(o.data_at || ''), generatedAt: String(o.generated_at || ''), items };
  }
  // the items that repeated in both years (the home row counts these only)
  const strongCount = (d) => (d ? d.items.filter((x) => x.strong).length : 0);
  // «26» / «11.5»: one decimal at most, no trailing «.0»
  const fmt = (n) => { const v = Math.round(num(n) * 10) / 10; return String(v).replace(/\.0$/, ''); };
  // «2026-11-16» -> «16/11»
  const dm = (s) => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}` : ''; };
  // how many times its normal month the season takes (the expected over the normal month); 0 when it has no normal month
  const times = (x) => (x.avg > 0 ? Math.round((x.ex / x.avg) * 10) / 10 : 0);
  // what the season still needs on top of the stock, in packs: at least 1
  const needQty = (x) => Math.max(1, Math.ceil(num(x.ex) - num(x.have) - 1e-9));
  // the quantity he typed: a positive number up to two decimals, else null (nothing is written)
  const cleanQty = (v) => { const q = Math.round(Number(String(v ?? '').replace(',', '.')) * 100) / 100; return q > 0 && q <= 100000 ? q : null; };
  // the row «➕ ضيفه» writes into ar_po_items: the shape the bags page writes for «🛒 أمر شراء» (bag = the one PharmaFly has the item in; null when unknown)
  const poRow = (x, qty, bag) => ({
    item_id: x.i, item_name: String(x.n).slice(0, 200), bag: /^(pv|gs|[0-9]{1,12})$/.test(String(bag || '')) ? String(bag) : null, qty, status: 'open',
    item: { have: x.have, sold30: x.avg, need: qty, season: { ex: x.ex, y1: x.y1, y2: x.y2, avg: x.avg } },
  });
  // the bag PharmaFly has the item in, from the bags page's data (d.bags.list[].items[].id); null when it is in none or the data is not there
  const bagIn = (d, id) => {
    for (const b of (d && d.bags && d.bags.list) || []) for (const i of (b && b.items) || []) if (i && Number(i.id) === id) return String(b.id);
    return null;
  };
  const api = { PATH, parse, strongCount, fmt, dm, times, needQty, cleanQty, poRow, bagIn };
  root.AskerSeasonLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let data = null, loading = null, loadedAt = 0, arName = new Map();
  let inPo = new Map(), qtyDraft = new Map(), busy = false;   // inPo: item id -> { id, qty } (the open lines of the purchase order); qtyDraft: what he typed and did not add yet

  // the open lines of the purchase order, for the items of this card (an error = nothing is marked as ordered)
  async function loadPo() {
    try {
      const r = await db().from('ar_po_items').select('id,item_id,qty').eq('status', 'open');
      inPo = new Map((r.error ? [] : r.data || []).map((p) => [Number(p.item_id), { id: p.id, qty: num(p.qty) }]));
    } catch (e) { inPo = new Map(); }
  }
  // the bag PharmaFly has the item in (the bags page knows it), so the order advisor counts cosmetics apart; null when it is in none
  function bagOf(id) {
    try { return bagIn(root.AskerAlerts && root.AskerAlerts.data && root.AskerAlerts.data(), id); } catch (e) { return null; }
  }

  async function load(force) {
    if (!db()) return data;
    if (loading) return loading;
    if (data && !force && Date.now() - loadedAt < 30 * 60e3) return data;
    loading = (async () => {
      try {
        const { data: blob, error } = await db().storage.from('asker-private').download(PATH);
        if (error || !blob) { data = null; return data; }
        data = parse(JSON.parse(await blob.text()));
        loadedAt = Date.now();
        await loadPo();
        try {
          const rows = root.AskerStock ? await root.AskerStock.ensure() : [];
          arName = new Map((rows || []).filter((r) => String(r.arabic_name || '').trim()).map((r) => [Number(r.item_id), String(r.arabic_name).trim()]));
        } catch (e) { /* the English names stay */ }
      } catch (e) {
        data = null;
      } finally {
        loading = null;
        draw();
      }
      return data;
    })();
    return loading;
  }
  function row(x) {
    const ar = arName.get(x.i);
    const t = times(x);
    return `<div class="ni-row"><div class="ni-main"><b class="notr" dir="auto">${esc(ar || x.n)}</b>${ar ? `<small class="ni-meta notr" dir="ltr">${esc(x.n)}</small>` : ''}` +
      `<small class="ni-meta"><span>${esc(`السنة اللي فاتت بعت ${fmt(x.y1)} في الفترة دي (المعتاد في الشهر ${fmt(x.avg)})`)}</span>` +
      (x.y2 > 0 ? ` <span>${esc(`وقبلها بسنة بعت ${fmt(x.y2)}`)}</span>` : '') + '</small>' +
      `<small class="ni-meta"><b>${esc(`ورصيدك دلوقتي ${fmt(x.have)}`)}</b>${x.strong ? ' <span class="pill good">اتكرر سنتين</span>' : ''}${t >= 1.8 ? ` <span class="pill">${esc(`${fmt(t)}× المعتاد`)}</span>` : ''}</small>` +
      tail(x) + '</div></div>';
  }
  // «➕ ضيفه» (owner 2026-11-16: «اصناف موسم مفيش امكانيه لاضافتها لامر الشرا»): the quantity box (what the season still needs) and the add button; once in the order, the line and «رجّعه»
  function tail(x) {
    const p = inPo.get(x.i);
    if (p) return `<div class="st-done ok"><span>${esc(`✓ اتضاف لأمر الشرا (${fmt(p.qty)})`)}</span><button type="button" class="st-undo" data-se-undo="${esc(x.i)}"${busy ? ' disabled' : ''}>رجّعه</button></div>`;
    const q = qtyDraft.has(x.i) ? qtyDraft.get(x.i) : needQty(x);
    return `<div class="st-btns"><input class="se-qty" type="number" min="0.01" step="any" inputmode="decimal" value="${esc(q)}" data-se-qty="${esc(x.i)}" aria-label="الكمية">` +
      `<button type="button" data-se-add="${esc(x.i)}"${busy ? ' disabled' : ''}>➕ ضيفه</button></div>`;
  }
  const say = (t) => { const m = $('seasonMsg'); if (!m) return; m.textContent = t || ''; m.classList.toggle('hidden', !t); };
  function draw() {
    const box = $('seasonBox');
    if (!box) return;
    const d = data;
    box.classList.toggle('hidden', !d);
    if (!d) return;
    $('seasonCount').textContent = d.items.length ? String(d.items.length) : '';
    $('seasonWin').textContent = d.from && d.to ? `الفترة: ${dm(d.from)} ← ${dm(d.to)}` : '';
    $('seasonList').innerHTML = d.items.length ? d.items.map(row).join('') : '<p class="hint">مفيش أصناف موسمية رصيدها قليل دلوقتي ✅</p>';
    // one button for the ones that repeated in both years and are not in the order yet
    const strongOpen = d.items.filter((x) => x.strong && !inPo.has(x.i));
    const bulk = $('seasonBulk');
    if (bulk) {
      bulk.classList.toggle('hidden', !strongOpen.length);
      $('seasonAddAll').textContent = `➕ ضيف الـ ${strongOpen.length} اللي اتكرروا سنتين لأمر الشرا`;
      $('seasonAddAll').disabled = busy;
    }
  }
  // the quantity of an item: what he typed in its box, else what the season needs
  const qtyOf = (x) => {
    const el = document.querySelector(`[data-se-qty="${x.i}"]`);
    return cleanQty(el ? el.value : qtyDraft.has(x.i) ? qtyDraft.get(x.i) : needQty(x));
  };
  async function addRows(list) {
    if (busy || !data) return;
    const rows = [];
    for (const x of list) {
      if (inPo.has(x.i)) continue;
      const q = qtyOf(x);
      if (q == null) { say(`الكمية مش مظبوطة: ${x.n}`); return; }
      rows.push(poRow(x, q, bagOf(x.i)));
    }
    if (!rows.length) return;
    busy = true; say(''); draw();
    try {
      const res = await db().from('ar_po_items').insert(rows).select('id');
      if (res.error) throw res.error;
      // the ids come back in the order of the rows sent
      (res.data || []).forEach((r, k) => {
        const w = rows[k];
        if (!w) return;
        inPo.set(w.item_id, { id: r.id, qty: w.qty });
        qtyDraft.delete(w.item_id);
      });
    } catch (e) { say('ما اتضافش لأمر الشرا: ' + ((e && e.message) || e)); }
    busy = false; draw();
  }
  async function undo(id) {
    const p = inPo.get(id);
    if (!p || busy) return;
    busy = true; draw();
    try {
      const res = await db().from('ar_po_items').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', p.id);
      if (res.error) throw res.error;
      inPo.delete(id); say('');
    } catch (e) { say('ما اترجّعش: ' + ((e && e.message) || e)); }
    busy = false; draw();
  }
  $('seasonBox')?.addEventListener('click', (e) => {
    const a = e.target.closest('[data-se-add]'), u = e.target.closest('[data-se-undo]'), all = e.target.closest('#seasonAddAll');
    if (a) { const x = data && data.items.find((r) => String(r.i) === a.dataset.seAdd); if (x) addRows([x]); }
    else if (u) undo(Number(u.dataset.seUndo));
    else if (all && data) addRows(data.items.filter((x) => x.strong));
  });
  $('seasonBox')?.addEventListener('input', (e) => {
    const q = e.target.closest('[data-se-qty]');
    if (q) qtyDraft.set(Number(q.dataset.seQty), q.value);
  });
  // opening the card: the order may have changed from the bags page since the file was read
  $('seasonBox')?.addEventListener('toggle', async () => {
    if ($('seasonBox').open && db() && data) { await loadPo(); draw(); }
  });
  // «محتاج شغل» on the home: its «قبل الموسم» row opens the card
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.todo-row[data-view="season"]');
    if (b && $('seasonBox')) $('seasonBox').open = true;
  }, true);
  root.AskerSeason = { load, data: () => data, count: () => strongCount(data), draw };
})(typeof window === 'undefined' ? globalThis : window);
