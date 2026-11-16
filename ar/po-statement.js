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
  const api = { PATH, OLD_HOURS, parseStatement, isOld, chips, poRow, noRow, noItem, numText };
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
    decided = new Map(); // a fresh file already knows what he decided (the lines and moves are in it as «not asked again»)
    say('');
    draw();
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
    } catch (e) { say('ما اتضافش لأمر الشرا: ' + ((e && e.message) || e)); }
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
