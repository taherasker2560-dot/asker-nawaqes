/* «محتاج قرارك قبل أمر الشرا» (the statement, top of «الطلبيات»; owner 2026-11-16: «الأصناف الجديدة أو الأصناف اللي الطلب التاريخي بتاعها إنها بتيجي تتباع وما
   تتشاريش تاني يوم دي تعمل لي قبل ما تدخلها في أمر الشراء بيان تخيرني أضيفها ولا لأ»).
   The laptop (Hub\orders\BUILD_ORDER_DRAFTS.ps1 step 0a, read only) does not put a NEW item (card made in the last 60 days) or a «بالطلب» item (its last 2-3 buys were
   all quick sell-outs) in the automatic purchase order: it lists them in asker-private/orders/statement.json. This card READS that file and, on his tap, writes what the
   bags page already writes (no new table, no migration):
     «➕ ضيفه»      = a line in ar_po_items (the same row the bags page «🛒 أمر شراء» inserts), «رجّعه» cancels that line;
     «مش دلوقتي»   = a CANCELLED line with item.decision = 'no' in ar_po_items: the laptop does not ask again nor order that item by itself for 7 days («رجّعه للبيان»
                    marks it 'undone'). (The bags page's «أجّل» cannot be used: a move to the bag the item is already in is refused by the table, and «كل الشركات» items are in it.)
   Nothing is sent and nothing in PharmaFly or in a shortages list is touched. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/po-statement.cjs) ----------
  const PATH = 'orders/statement.json';
  const OLD_HOURS = 36; // the file is rewritten whenever something changes and every 30 minutes; older = the laptop is not updating
  const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
  const numText = (x) => String(Math.round(num(x) * 10) / 10);
  const rowOf = (r) => {
    if (!r || typeof r !== 'object' || !(num(r.id) > 0) || !String(r.name || '').trim()) return null;
    const why = r.why === 'byreq' ? 'byreq' : r.why === 'new' ? 'new' : '';
    if (!why) return null;
    return { id: num(r.id), name: String(r.name).trim(), why, bag: String(r.bag || ''), have: num(r.have), sold30: num(r.sold30), min: num(r.min), need: num(r.need), qty: Math.max(1, Math.round(num(r.qty)) || 1), lastBuy: r.last_buy || null, age: num(r.age), n: num(r.n) };
  };
  // the file must look like what the laptop writes; anything else means «nothing to decide»
  function parseStatement(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.items)) return null;
    return { generatedAt: o.generated_at || '', items: o.items.map(rowOf).filter(Boolean) };
  }
  function isOld(generatedAt, now = new Date()) {
    const t = new Date(generatedAt).getTime();
    return !Number.isFinite(t) || now.getTime() - t > OLD_HOURS * 3600e3;
  }
  // the chips under an item: [text, tone] (tone: new = blue, req = orange, gray = a plain fact)
  function chips(r) {
    const out = [r.why === 'byreq' ? [`بالطلب: آخر ${Math.max(2, Math.round(r.n))} مرات اتباع في يومين`, 'req'] : [`جديد: اتعمل من ${Math.max(0, Math.round(r.age))} يوم`, 'new']];
    out.push([`رصيده ${numText(r.have)}`, 'gray']);
    if (r.sold30 > 0) out.push([`بيع الشهر ${numText(r.sold30)}`, 'gray']);
    out.push([`الكمية المقترحة ${r.qty}`, 'gray']);
    return out;
  }
  // the row that «ضيفه» writes into ar_po_items: exactly what the bags page writes for «🛒 أمر شراء»
  const poRow = (r) => ({ item_id: r.id, item_name: r.name.slice(0, 200), bag: r.bag || 'pv', qty: r.qty, status: 'open', item: { have: r.have, sold30: r.sold30, min: r.min, need: r.need, last_buy: r.lastBuy || null } });
  // the row that «مش دلوقتي» writes into ar_po_items: a cancelled line that says «no» (decision), which the laptop reads for 7 days; «رجّعه للبيان» rewrites it as 'undone'
  const noItem = (r, decision) => ({ have: r.have, sold30: r.sold30, min: r.min, need: r.need, last_buy: r.lastBuy || null, decision });
  const noRow = (r) => ({ item_id: r.id, item_name: r.name.slice(0, 200), bag: r.bag || 'pv', qty: r.qty, status: 'cancelled', item: noItem(r, 'no') });
  // what ar_po_items already says about the items of a file (owner 2026-11-17: «بدوس الزرار … ومجرد ما بحدّث الصنف بيرجع تاني»): the laptop rewrites the file a minute or two
  // after a tap and every 30 minutes, so a file read in between still lists what he already decided. Rule (the same one the laptop uses): an OPEN line that is his own (not the
  // laptop's automatic one) = «added»; a cancelled line that says «no», made in the last 7 days = «skipped»; an «undone» or a plainly cancelled line decides nothing; «added» wins
  // over «skipped», and the newest line of a kind wins. rows = [{id, item_id, status, item, created_at, updated_at}] → Map(item id → { kind, rid })
  const NO_DAYS = 7;
  function knownDecisions(rows, now = new Date()) {
    const out = new Map();
    const since = now.getTime() - NO_DAYS * 864e5;
    for (const r of Array.isArray(rows) ? rows : []) {
      if (!r || !(num(r.item_id) > 0)) continue;
      const id = num(r.item_id), item = r.item && typeof r.item === 'object' ? r.item : {};
      let kind = '';
      if (r.status === 'open' && item.auto !== true) kind = 'added';
      else if (r.status === 'cancelled' && item.decision === 'no') {
        const t = new Date(r.created_at || r.updated_at).getTime();
        if (Number.isFinite(t) && t >= since) kind = 'skipped';
      }
      if (!kind) continue;
      const cur = out.get(id), rid = r.id == null ? null : r.id;
      if (!cur || (kind === 'added' && cur.kind === 'skipped') || (kind === cur.kind && num(rid) > num(cur.rid))) out.set(id, { kind, rid });
    }
    return out;
  }
  // «ar_po_items_one_open»: one open line per item. The item is already in the order (the laptop put it in, or he did in another tap): that is not a failure
  const isDuplicate = (e) => !!e && (e.code === '23505' || /duplicate key|ar_po_items_one_open/i.test(String(e.message || '')));
  const api = { PATH, OLD_HOURS, NO_DAYS, parseStatement, isOld, chips, poRow, noRow, noItem, numText, knownDecisions, isDuplicate };
  root.AskerPoStatementLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the card ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let data = null, decided = new Map(), busy = false; // decided: item id -> { kind: 'added' | 'skipped', rid }

  function itemHtml(r) {
    const d = decided.get(r.id);
    const ch = chips(r).map(([t, tone]) => `<span class="st-chip ${tone}">${esc(t)}</span>`).join('');
    let tail;
    if (d && d.kind === 'added') tail = `<div class="st-done ok"><span>✓ اتضاف لأمر الشرا (${esc(r.qty)})</span><button type="button" class="st-undo" data-st-undo="${esc(r.id)}">رجّعه</button></div>`;
    else if (d && d.kind === 'skipped') tail = `<div class="st-done skip"><span>مش دلوقتي: مش هيتطلب لوحده 7 أيام</span><button type="button" class="st-undo" data-st-undo="${esc(r.id)}">رجّعه للبيان</button></div>`;
    else tail = `<div class="st-btns"><button type="button" data-st-add="${esc(r.id)}"${busy ? ' disabled' : ''}>➕ ضيفه</button><button type="button" class="secondary" data-st-skip="${esc(r.id)}"${busy ? ' disabled' : ''}>مش دلوقتي</button></div>`;
    return `<div class="st-item" data-st="${esc(r.id)}"><strong dir="ltr" class="notr">${esc(r.name)}</strong><div class="st-chips">${ch}</div>${tail}</div>`;
  }
  function draw() {
    const box = $('stBox');
    if (!box) return;
    const items = data ? data.items : [];
    const waiting = items.filter((r) => !decided.has(r.id)).length;
    box.classList.toggle('hidden', !items.length || (data && isOld(data.generatedAt) && !decided.size));
    $('stCount').textContent = String(waiting);
    $('stList').innerHTML = items.map(itemHtml).join('');
  }
  const say = (t) => { const m = $('stMsg'); if (!m) return; m.textContent = t || ''; m.classList.toggle('hidden', !t); };
  async function open() {
    if (!$('stBox') || !db()) return;
    try {
      const { data: blob, error } = await db().storage.from('asker-private').download(PATH);
      data = error || !blob ? null : parseStatement(JSON.parse(await blob.text()));
    } catch (e) {
      data = null;
    }
    decided = new Map(); // a fresh file already knows what he decided (the lines and moves are in it as «not asked again»); an older one is checked against the table below
    say('');
    if (data && data.items.length) await syncDecided();
    draw();
  }
  // the items of the file he already answered (see knownDecisions): they show as done, with their undo, instead of asking again
  async function syncDecided() {
    try {
      const ids = data.items.map((r) => r.id);
      const since = new Date(Date.now() - NO_DAYS * 864e5).toISOString();
      const cols = 'id,item_id,status,item,created_at,updated_at';
      const [a, b] = await Promise.all([
        db().from('ar_po_items').select(cols).in('item_id', ids).eq('status', 'open'),
        db().from('ar_po_items').select(cols).in('item_id', ids).eq('status', 'cancelled').gte('created_at', since),
      ]);
      const rows = [...((a && !a.error && a.data) || []), ...((b && !b.error && b.data) || [])];
      for (const [id, d] of knownDecisions(rows)) decided.set(id, d);
    } catch (e) { /* the table is not readable now: the file alone decides, as before */ }
  }
  async function add(id) {
    const r = data && data.items.find((x) => x.id === id);
    if (!r || busy || decided.has(id)) return;
    busy = true; draw();
    try {
      const res = await db().from('ar_po_items').insert(poRow(r)).select('id');
      if (res.error) throw res.error;
      decided.set(id, { kind: 'added', rid: (res.data && res.data[0] && res.data[0].id) || null });
      say('');
    } catch (e) {
      if (isDuplicate(e)) {
        // already an open line for it: the item IS in the order, so show it as added (and keep the line's id for «رجّعه»)
        let rid = null;
        try { const o = await db().from('ar_po_items').select('id').eq('item_id', id).eq('status', 'open').limit(1); rid = (o && !o.error && o.data && o.data[0] && o.data[0].id) || null; } catch (e2) { /* no id: the card still says added */ }
        decided.set(id, { kind: 'added', rid });
        say('');
      } else say('ما اتضافش لأمر الشرا: ' + ((e && e.message) || e));
    }
    busy = false; draw();
  }
  async function skip(id) {
    const r = data && data.items.find((x) => x.id === id);
    if (!r || busy || decided.has(id)) return;
    busy = true; draw();
    try {
      const res = await db().from('ar_po_items').insert(noRow(r)).select('id');
      if (res.error) throw res.error;
      decided.set(id, { kind: 'skipped', rid: (res.data && res.data[0] && res.data[0].id) || null });
      say('');
    } catch (e) { say('ما اتسجلش «مش دلوقتي»: ' + ((e && e.message) || e)); }
    busy = false; draw();
  }
  async function undo(id) {
    const d = decided.get(id);
    if (!d || busy) return;
    busy = true; draw();
    try {
      if (d.rid) {
        const r = data && data.items.find((x) => x.id === id);
        const patch = d.kind === 'added' ? { status: 'cancelled', updated_at: new Date().toISOString() } : { item: noItem(r, 'undone'), updated_at: new Date().toISOString() };
        const res = await db().from('ar_po_items').update(patch).eq('id', d.rid);
        if (res.error) throw res.error;
      }
      decided.delete(id);
      say('');
    } catch (e) { say('ما اترجّعش: ' + ((e && e.message) || e)); }
    busy = false; draw();
  }
  $('stList')?.addEventListener('click', (e) => {
    const a = e.target.closest('[data-st-add]'), s = e.target.closest('[data-st-skip]'), u = e.target.closest('[data-st-undo]');
    if (a) add(Number(a.dataset.stAdd)); else if (s) skip(Number(s.dataset.stSkip)); else if (u) undo(Number(u.dataset.stUndo));
  });
  root.AskerPoStatement = { open };
})(typeof window !== 'undefined' ? window : globalThis);
