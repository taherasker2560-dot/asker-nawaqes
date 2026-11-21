/* «الصلاحيات ← قصيرة» (owner 2026-11-15: «تقرير بعد ما تدخل الفواتير يظهر لي في السيستم بالصلاحيات الاصناف اللي انا وافقت عليها وما
   رجعتهاش وصلاحيتها اقل من سنة وست شهور»).
   After the purchase invoices are entered in PharmaFly: the items on them that he accepted (they are on the invoice) and did NOT
   return to the supplier, whose expiry is less than 18 months away, shortest expiry first, with the supplier, the invoice and what
   is left of the quantity. A return (an invoice of kind «return» from the same supplier, for the same item, entered after the
   purchase) takes its quantity off the purchase, the same expiry first, so a partly returned line shows what is left.
   Read only from ar_vendor_moves / ar_vendors / ar_store_items (the laptop sends them, Store\SYNC_VENDORS.ps1); nothing is written. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/short-dated.cjs) ----------
  const LIMIT_MONTHS = 18;
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const pad = (n) => String(n).padStart(2, '0');
  const PERIODS = [['today', 'النهارده', 0], ['3', 'آخر 3 أيام', 2], ['7', 'آخر أسبوع', 6], ['30', 'آخر شهر', 29]];
  function parseDay(s) {
    const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(s || ''));
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }
  // whole months from this month to the expiry's month (an expiry is the end of its month): 2027-11-30 from 2026-11-15 = 12
  function monthsLeft(x, now) {
    const e = parseDay(x);
    if (!e) return null;
    const n = now || new Date();
    return (e.y - n.getFullYear()) * 12 + (e.m - (n.getMonth() + 1));
  }
  // the day a period starts, as the server's time
  function sinceOf(key, now) {
    const p = PERIODS.find((x) => x[0] === key) || PERIODS[1];
    const t = new Date((now || new Date()).getFullYear(), (now || new Date()).getMonth(), (now || new Date()).getDate() - p[2]);
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T00:00:00`;
  }
  // units of a line: (packs + bonus packs) × units in a pack + loose units (absolute: a return may be written with minus signs)
  const unitsOf = (l, withBonus) => {
    const k = num(l.k) > 0 ? num(l.k) : 1;
    return (Math.abs(num(l.p)) + (withBonus ? Math.abs(num(l.b)) : 0)) * k + Math.abs(num(l.u));
  };
  // what the pharmacy holds of an item now, from an ar_stock row {packs, units, parts, exp_near, other:[{packs, units}]}:
  // {units (this store + the other stores), near (the nearest expiry in this store), other (some of it is in another store)}
  function stockOf(row) {
    const parts = num(row && row.parts) > 0 ? num(row.parts) : 1;
    const other = Array.isArray(row && row.other) ? row.other : [];
    const mine = num(row && row.packs) * parts + num(row && row.units);
    const elsewhere = other.reduce((s, o) => s + num(o && o.packs) * parts + num(o && o.units), 0);
    return { units: Math.max(0, mine + elsewhere), near: (row && row.exp_near) || null, other: elsewhere > 0 };
  }
  /* purchases, returns: ar_vendor_moves rows ({id, vendor_id, at, code, lines:[{i,p,u,k,b,c,t,x}]}); returns the lines that are
     still with us and short-dated: [{vendor_id, move, code, at, item, x, months, units, k, left}] shortest expiry first.
     stock (optional, Map item id → stockOf(row)): what is really on the shelves NOW. A lot that was sold, or that is nearer than the
     nearest expiry still in stock (a farther-dated lot came in after it and the shortest went first), or beyond what is left, goes. */
  function shortLines(purchases, returns, now, limit, stock) {
    const lim = limit == null ? LIMIT_MONTHS : limit;
    const recs = [];
    for (const m of purchases || []) {
      for (const l of Array.isArray(m.lines) ? m.lines : []) {
        const item = num(l.i);
        if (!item) continue;
        const units = unitsOf(l, true);
        if (units <= 0) continue;
        recs.push({ vendor_id: m.vendor_id, move: m.id, code: m.code || null, at: m.at, item, x: l.x || null, k: num(l.k) > 0 ? num(l.k) : 1, c: l.c == null ? null : num(l.c), t: l.t == null ? null : num(l.t), left: units, bought: units });
      }
    }
    // the returns, oldest first: each takes its units off the same supplier's purchases of the same item, the same expiry first,
    // then the oldest ones; only a purchase entered before the return (or the same moment) can be returned by it
    const rets = [...(returns || [])].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    for (const r of rets) {
      // PharmaFly names a return «~<the purchase's number>»: that purchase is the one it takes from first
      const own = /^~/.test(String(r.code || '')) ? String(r.code).slice(1) : null;
      for (const l of Array.isArray(r.lines) ? r.lines : []) {
        const item = num(l.i);
        let need = unitsOf(l, false) || unitsOf(l, true);
        if (!item || need <= 0) continue;
        const pool = recs.filter((q) => q.item === item && String(q.vendor_id) === String(r.vendor_id) && String(q.at) <= String(r.at) && q.left > 0)
          .sort((a, b) => (Number(own != null && b.code === own) - Number(own != null && a.code === own)) ||
            (Number(b.x === (l.x || null)) - Number(a.x === (l.x || null))) || String(a.at).localeCompare(String(b.at)));
        for (const q of pool) {
          if (need <= 0) break;
          const take = Math.min(q.left, need);
          q.left -= take; need -= take;
        }
      }
    }
    if (stock) {
      // the shelves now: sales took the SHORTEST expiry first, so what is still there belongs to the farthest-dated lots
      const byItem = new Map();
      for (const q of recs) if (q.left > 0) { if (!byItem.has(q.item)) byItem.set(q.item, []); byItem.get(q.item).push(q); }
      for (const [item, lots] of byItem) {
        const s = stock.get(item) || stock.get(String(item));
        let rem = s ? s.units : 0;
        lots.sort((a, b) => (b.x ? String(b.x) : '9999').localeCompare(a.x ? String(a.x) : '9999') || String(b.at).localeCompare(String(a.at)));
        for (const q of lots) {
          // nearer than the nearest expiry in this store = no longer in it (stock in another store keeps the doubt, so the lot stays)
          const gone = !s || (s.near && !s.other && q.x && String(q.x).slice(0, 7) < String(s.near).slice(0, 7));
          const take = gone ? 0 : Math.min(q.left, rem);
          rem -= take; q.left = take;
        }
      }
    }
    return recs
      .map((q) => ({ ...q, months: monthsLeft(q.x, now) }))
      .filter((q) => q.left > 0.0001 && q.months != null && q.months < lim)
      .sort((a, b) => String(a.x).localeCompare(String(b.x)) || String(b.at).localeCompare(String(a.at)))
      .map((q) => ({ vendor_id: q.vendor_id, move: q.move, code: q.code, at: q.at, item: q.item, x: q.x, months: q.months, units: q.left, k: q.k, left: q.left, bought: q.bought, c: q.c, t: q.t }));
  }
  // «8 علبة» / «2.5 علبة» / «3 وحدة» for what is left of a line
  function leftText(q) {
    const packs = q.left / q.k;
    if (q.k > 1 && Math.abs(packs - Math.round(packs)) > 0.001 && packs < 1) return `${Math.round(q.left * 100) / 100} وحدة`;
    return `${Math.round(packs * 100) / 100} علبة`;
  }
  const expText = (x) => { const e = parseDay(x); return e ? `${pad(e.m)}/${e.y}` : '—'; };
  const monthsText = (m) => (m < 0 ? 'منتهية' : m === 0 ? 'الشهر ده' : m === 1 ? 'باقي شهر' : m === 2 ? 'باقي شهرين' : m <= 10 ? `باقي ${m} شهور` : `باقي ${m} شهر`);
  const dayText = (at) => { const e = parseDay(at); return e ? `${pad(e.d)}/${pad(e.m)}` : ''; };
  const fullDayText = (at) => { const e = parseDay(at); return e ? `${pad(e.d)}/${pad(e.m)}/${e.y}` : ''; };
  // PharmaFly's number «11/26/474411» = the month/year it was entered under + the supplier's own invoice number
  const invoiceNo = (code) => String(code || '').replace(/^~/, '').replace(/^\d{1,2}\/\d{2}\//, '');
  const api = { LIMIT_MONTHS, PERIODS, monthsLeft, sinceOf, shortLines, stockOf, leftText, expText, monthsText, dayText, fullDayText, invoiceNo };
  root.AskerShortDatedLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the view (inside «الصلاحيات») ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let period = '3', loadedAt = 0, rows = null, vendors = new Map(), items = new Map(), loading = false, failed = '', box = null, seq = 0;
  const missing = (e) => /schema cache|does not exist|Could not find/i.test(String(e && (e.message || e)));
  async function chunked(table, cols, ids, key) {
    const out = [];
    const list = [...new Set(ids)];
    for (let i = 0; i < list.length; i += 100) {
      const { data, error } = await db().from(table).select(cols).in(key || 'id', list.slice(i, i + 100));
      if (error) throw error;
      out.push(...(data || []));
    }
    return out;
  }
  async function load() {
    if (!db()) return;
    const my = ++seq, since = sinceOf(period);
    loading = true; failed = ''; draw();
    try {
      const q = (kind) => db().from('ar_vendor_moves').select('id,vendor_id,at,kind,code,lines').eq('kind', kind).gte('at', since).order('at', { ascending: false }).limit(1500);
      const [p, r] = await Promise.all([q('purchase'), q('return')]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      // the lines after the returns, then what is really on the shelves now (the pharmacy's stock rows only exist for items we hold)
      const cand = shortLines(p.data, r.data, new Date());
      let found, stockKnown = true;
      try {
        const st = await chunked('ar_stock', 'item_id,packs,units,parts,exp_near,other', cand.map((x) => x.item), 'item_id');
        // a stock table that came back empty for a long list is a table not filled yet, not a pharmacy with nothing on its shelves
        if (!st.length && cand.length >= 5) throw new Error('empty stock');
        const stock = new Map(st.map((x) => [x.item_id, stockOf(x)]));
        found = shortLines(p.data, r.data, new Date(), LIMIT_MONTHS, stock);
      } catch (e) {
        stockKnown = false; found = cand;
      }
      const [vs, its] = await Promise.all([
        chunked('ar_vendors', 'id,name,short', found.map((x) => x.vendor_id)),
        chunked('ar_store_items', 'id,name,arabic_name', found.map((x) => x.item)),
      ]);
      // the lines he already marked «return» (ar/return-marks.js): read before the list is drawn, never a reason for the list to fail
      try { await root.AskerReturnMarks?.ensure?.(); } catch (e) { /* the list stays without marks */ }
      if (my !== seq) return;
      vendors = new Map(vs.map((v) => [String(v.id), v])); items = new Map(its.map((x) => [String(x.id), x]));
      rows = { list: found, invoices: (p.data || []).length, stockKnown }; loadedAt = Date.now();
    } catch (e) {
      if (my !== seq) return;
      rows = null; failed = missing(e) ? 'الموردين لسه مش متاحين على السيرفر.' : 'مقدرتش أجيب الفواتير: ' + (e && e.message);
    } finally { if (my === seq) { loading = false; draw(); } }
  }
  // the line a tap on «↩️ إرجاع» belongs to (its key = invoice + item + expiry), what is typed in the box, the message under it
  const retKey = (q) => `${q.move}:${q.item}:${q.x || ''}`;
  const lineOf = (key) => (rows && rows.list.find((q) => retKey(q) === key)) || null;
  let retOpen = '', retQty = '', retNote = '';
  // «↩️ إرجاع» (the owner only, ar/return-marks.js): the button, the box that asks how many boxes, or the mark that is already on the line
  function retBlock(q) {
    const RM = root.AskerReturnMarks, L = root.AskerReturnMarksLib;
    if (!RM || !RM.canMark()) return '';
    const key = retKey(q), m = RM.markOf(q);
    if (m) {
      const prepared = m.status === 'prepared';
      return `<div class="sd-ret"><span class="rm-chip ${prepared ? 'prepared' : 'marked'}">${prepared ? '✓ اتجهّز للإرجاع' : '↩️ مطلوب إرجاعه'} · ${esc(L.boxesText(m.units, m.k))}</span>` +
        `<button type="button" class="secondary" data-sd-unmark="${esc(m.id)}">شيل العلامة</button></div>`;
    }
    if (retOpen === key) {
      return `<div class="sd-ret"><label>كام علبة؟ <input type="text" inputmode="decimal" dir="ltr" size="4" value="${esc(retQty)}" data-sd-qty></label>` +
        `<button type="button" data-sd-ret-ok="${esc(key)}">علّم للإرجاع</button><button type="button" class="secondary" data-sd-ret-x>إلغاء</button>` +
        (retNote ? `<span class="status bad">${esc(retNote)}</span>` : '') + '</div>';
    }
    return `<div class="sd-ret"><button type="button" class="secondary" data-sd-ret="${esc(key)}">↩️ إرجاع</button></div>`;
  }
  function row(q) {
    const it = items.get(String(q.item)) || {}, v = vendors.get(String(q.vendor_id));
    const cls = q.months < 6 ? ' red' : q.months < 12 ? ' amber' : '';
    // the small photo first (owner 2026-11-21): a tap opens «تعديل الصنف»; the expiry stays on the other end
    const photo = root.AskerItemMedia ? root.AskerItemMedia.thumb(q.item, it.name || '', it.arabic_name || it.name || '') : '';
    return `<div class="sd-row${cls}">${photo}<div class="sd-main"><span class="sd-name notr" dir="auto">${esc(it.arabic_name || it.name || '#' + q.item)}</span>` +
      (it.arabic_name && it.name ? `<small class="notr" dir="ltr">${esc(it.name)}</small>` : '') +
      // what he needs to send it back: the supplier, the supplier's invoice number and the day the item was entered (with the year)
      `<small class="sd-doc">${v ? `<bdi class="notr">${esc(v.short || v.name)}</bdi> · ` : ''}${q.code ? `<span>فاتورة رقم</span> <bdi class="notr" dir="ltr">${esc(invoiceNo(q.code))}</bdi> · ` : ''}<span>اتدخلت</span> <bdi class="notr" dir="ltr">${esc(fullDayText(q.at))}</bdi></small>${retBlock(q)}</div>` +
      `<div class="sd-exp"><b dir="ltr">${esc(expText(q.x))}</b><small>${esc(monthsText(q.months))}</small><small>${esc(leftText(q))}</small></div></div>`;
  }
  function draw() {
    if (!box) return;
    const chips = `<div class="chips sd-periods" role="group" aria-label="الفترة">${PERIODS.map(([k, t]) => `<button type="button" class="chip${period === k ? ' on' : ''}" data-sd-period="${k}">${esc(t)}</button>`).join('')}</div>`;
    let body;
    if (failed) body = `<p class="status bad">${esc(failed)}</p>`;
    else if (!rows) body = '<p class="hint">بيجيب الفواتير…</p>';
    else if (!rows.list.length) body = `<p class="hint">${rows.invoices ? 'مفيش في الفواتير دي صنف صلاحيته أقل من سنة ونص ولسه معانا ✅' : 'مفيش فواتير شرا اتدخلت في الفترة دي.'}</p>`;
    else {
      const packs = rows.list.reduce((s, q) => s + q.left / q.k, 0);
      body = `<h3 class="al-h">صلاحيته أقل من سنة ونص <b class="al-n">${rows.list.length}</b></h3>` + rows.list.map(row).join('') +
        `<p class="hint">حوالي ${Math.round(packs)} علبة في ${rows.list.length} سطر.</p>`;
    }
    const warn = rows && rows.stockKnown === false ? '<p class="status bad">مقدرتش أقرأ المخزون دلوقتي، فالقايمة ممكن يكون فيها صنف اتباع.</p>' : '';
    box.innerHTML = '<p class="hint">الأصناف اللي دخلت فواتير الشرا (يعني وافقت عليها) ومارجعتهاش للمورد، وصلاحيتها أقل من سنة وست شهور، الأقصر صلاحية الأول. اللي اترجع للمورد أو اتباع أو جه بعده نفس الصنف بتاريخ أبعد بيتشال من هنا، واللي اتباع منه جزء بيظهر اللي فاضل. وتقدر تعلّم أي صنف «↩️ إرجاع» عشان يروح لبيان المرتجعات.</p>' + warn + chips + body;
  }
  // called by ar/alerts.js when the view «قصيرة» is the open one
  function show(el) {
    box = el;
    if (!box.dataset.sdBound) {
      box.dataset.sdBound = '1';
      box.addEventListener('click', async (e) => {
        const t = e.target, b = t.closest('[data-sd-period]'), op = t.closest('[data-sd-ret]'), ok = t.closest('[data-sd-ret-ok]'), no = t.closest('[data-sd-ret-x]'), un = t.closest('[data-sd-unmark]');
        const RM = root.AskerReturnMarks;
        if (b) { period = b.dataset.sdPeriod; load(); return; }
        // «↩️ إرجاع»: ask how many boxes (what is left by default), then mark the lot (ar/return-marks.js, the owner only)
        if (op) { const q = lineOf(op.dataset.sdRet); retOpen = op.dataset.sdRet; retQty = q ? String(Math.round(q.left / q.k * 100) / 100) : ''; retNote = ''; draw(); return; }
        if (no) { retOpen = ''; retNote = ''; draw(); return; }
        if (ok && RM) {
          const q = lineOf(ok.dataset.sdRetOk);
          const boxes = Number(String(retQty).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(',', '.').replace('٫', '.'));
          if (!q) return;
          if (!(boxes > 0)) { retNote = 'اكتب عدد العلب اللي هترجعها.'; draw(); return; }
          const units = Math.round(boxes * q.k * 100) / 100;
          if (units > q.left + 0.001) { retNote = 'أكبر من اللي فاضل.'; draw(); return; }
          const res = await RM.mark(q, units);
          if (res.ok) { retOpen = ''; retNote = ''; } else retNote = RM.errText(res.error);
          draw(); return;
        }
        if (un && RM) { const res = await RM.unmark(un.dataset.sdUnmark); retNote = res.ok ? '' : RM.errText(res.error); draw(); }
      });
      box.addEventListener('input', (e) => { if (e.target.matches('[data-sd-qty]')) retQty = e.target.value; });
    }
    if (!loading && (!rows || Date.now() - loadedAt > 120000)) load(); else draw();
  }
  root.AskerShortDated = { show, reload: load };
})(typeof window === 'undefined' ? globalThis : window);
