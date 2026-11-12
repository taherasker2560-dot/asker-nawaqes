/* Customers' accounts (owner 2026-11-12, «ا»: «مكان العدد اللي هو 781 يبقى زرار هدوس عليه يفتح حسابات العملاء، فيهم بحث بالاسم،
   وجوه كل اسم لو دوست عليه يفتح لي بيان تفصيلي لحركة المبيعات وحركة المدفوعات»).
   «الحسابات ← العملاء»: the numbers on top are buttons (عدّوا الحد / عليهم فلوس / ليهم فلوس), a search by name or code, and every
   customer; a tap on a name opens the statement: balance, limit, what was bought and paid this month, and every movement
   newest first (sale with its items, return, payment) with the balance after it, back to 2018.
   Data: ar_customers + ar_customer_moves (migration 202611121000), filled every hour by the laptop (Store\SYNC_CUSTOMERS.ps1,
   read only on PharmaFly). Owner-only read. Nothing is written from here. Until the tables have data the panel keeps the
   alerts' list (ar/alerts.js). */
(function (root) {
  'use strict';
  const PAGE = 1000;        // the server gives at most 1000 rows a call
  const MOVES_PAGE = 100;
  const SHOW = 80;          // rows drawn at first in the list
  const CRUMB = 0.5;        // under half a pound either way = settled (rounding leftovers)

  // ---------- pure helpers (also used by tests/customers.cjs) ----------
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  // «1234.5» -> «1,234.50», «1234» -> «1,234»
  function money(n) {
    const v = Math.abs(num(n)) < 0.005 ? 0 : num(n);
    const frac = Math.abs(v % 1) > 0.005;
    return v.toLocaleString('en-US', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
  }
  const owes = (c) => num(c.balance) > CRUMB;
  const prepaid = (c) => num(c.balance) < -CRUMB;
  const limitOf = (c) => (num(c.credit_limit) > 0 ? num(c.credit_limit) : 0);
  const isOver = (c) => limitOf(c) > 0 && num(c.balance) > limitOf(c);
  const isNear = (c) => limitOf(c) > 0 && !isOver(c) && num(c.balance) >= 0.9 * limitOf(c);
  // «عليه 7,174 ج» / «ليه 200 ج» / «خالص»
  function balanceText(b) {
    const v = num(b);
    if (v > CRUMB) return { cls: 'owe', text: `عليه ${money(v)} ج` };
    if (v < -CRUMB) return { cls: 'paid', text: `ليه ${money(-v)} ج` };
    return { cls: 'zero', text: 'خالص' };
  }
  // Arabic letters that are written more than one way, Arabic digits, no diacritics
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[ً-ْـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/\s+/g, ' ').trim();
  }
  function counts(list) {
    let over = 0, near = 0, owing = 0, pre = 0, owed = 0;
    for (const c of list) {
      if (isOver(c)) over++; else if (isNear(c)) near++;
      if (owes(c)) { owing++; owed += num(c.balance); } else if (prepaid(c)) pre++;
    }
    return { over, near, owing, prepaid: pre, all: list.length, owed };
  }
  // the list for a view and a search; searching from «عدّوا الحد» looks in everyone
  function pick(list, view, q) {
    const words = norm(q).split(' ').filter(Boolean);
    let v = view;
    if (words.length && v === 'over') v = 'all';
    let out = list.filter((c) => (v === 'over' ? isOver(c) || isNear(c) : v === 'owing' ? owes(c) : v === 'prepaid' ? prepaid(c) : true));
    if (words.length) {
      out = out.filter((c) => {
        const n = norm(c.name), id = String(c.id);
        return words.every((w) => n.includes(w) || id === w || (/^\d+$/.test(w) && w.length >= 3 && id.startsWith(w)));
      });
    }
    const by = {
      over: (a, b) => (isOver(b) - isOver(a)) || (num(b.balance) - limitOf(b)) - (num(a.balance) - limitOf(a)),
      owing: (a, b) => num(b.balance) - num(a.balance),
      prepaid: (a, b) => num(a.balance) - num(b.balance),
      all: (a, b) => String(a.name).localeCompare(String(b.name), 'ar'),
    }[v] || ((a, b) => num(b.balance) - num(a.balance));
    return { view: v, rows: out.sort(by) };
  }
  // «2026-11-11T22:33:10» -> a Date in the phone's own time (the pharmacy's clock, no zone)
  function parseAt(s) {
    const m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (t) => { const h = t.getHours(); return `${h % 12 || 12}:${pad(t.getMinutes())} ${h < 12 ? 'ص' : 'م'}`; };
  const dayKey = (t) => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  const dateText = (t) => (t ? `${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()}` : '');
  // a day's title: «النهارده», «امبارح», «05/11/2026»
  function dayLabel(t, now) {
    if (!t) return '';
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const diff = Math.round((today - d) / 864e5);
    if (diff === 0) return 'النهارده';
    if (diff === 1) return 'امبارح';
    return dateText(t);
  }
  // when the last movement was: «النهارده 4:32 م», «امبارح 9:10 ص», «08/11/2026»
  function whenText(s, now) {
    const t = parseAt(s);
    if (!t) return '';
    const day = dayLabel(t, now);
    return day === 'النهارده' || day === 'امبارح' ? `${day} ${clock(t)}` : day;
  }
  const KIND_WORD = { sale: 'بيع', return: 'مرتجع', payment: 'دفع', refund: 'رجّعناله فلوس' };
  // the movement's title: «فاتورة بيع 166.70 ج», «مرتجع 54 ج», «دفعة 8,000 ج», «رجّعناله 200 ج»
  function moveTitle(m) {
    const t = num(m.total), p = num(m.paid);
    if (m.kind === 'sale') return { cls: 's', text: `فاتورة بيع ${money(t)} ج` };
    if (m.kind === 'return') return { cls: 'r', text: `مرتجع ${money(Math.abs(t))} ج` };
    if (m.kind === 'refund') return { cls: 'f', text: `رجّعناله ${money(Math.abs(p))} ج` };
    return { cls: 'p', text: `دفعة ${money(p)} ج` };
  }
  function afterText(b) {
    const v = num(b);
    if (v > CRUMB) return `بعدها: عليه ${money(v)} ج`;
    if (v < -CRUMB) return `بعدها: ليه ${money(-v)} ج`;
    return 'بعدها: خالص';
  }
  function itemsWord(n) {
    if (n === 1) return 'صنف واحد';
    if (n === 2) return 'صنفين';
    if (n >= 3 && n <= 10) return `${n} أصناف`;
    return `${n} صنف`;
  }
  // a line's value: price of a pack × (packs + strips / strips in a pack) − its discount
  function lineValue(l) {
    const k = num(l.k) > 0 ? num(l.k) : 1;
    return num(l.s) * (num(l.p) + num(l.u) / k) - num(l.d);
  }
  // this month: what was bought (sales minus returns) and paid (payments and what was paid on a sale, minus refunds)
  function monthSums(moves, now) {
    const y = now.getFullYear(), mo = now.getMonth();
    let bought = 0, paid = 0;
    for (const m of moves) {
      const t = parseAt(m.at);
      if (!t || t.getFullYear() !== y || t.getMonth() !== mo) continue;
      if (m.kind === 'sale' || m.kind === 'return') bought += num(m.total);
      paid += num(m.paid);
    }
    return { bought, paid };
  }
  // the statement's filter: «المبيعات» = sales and returns, «المدفوعات» = anything with money paid or given back
  function movesFor(moves, filter) {
    if (filter === 'sales') return moves.filter((m) => m.kind === 'sale' || m.kind === 'return');
    if (filter === 'payments') return moves.filter((m) => m.kind === 'payment' || m.kind === 'refund' || num(m.paid) !== 0);
    return moves;
  }
  const sortMoves = (list) => list.sort((a, b) => String(b.at).localeCompare(String(a.at)) || num(b.id) - num(a.id));
  const api = { money, balanceText, norm, counts, pick, parseAt, dayLabel, whenText, moveTitle, afterText, itemsWord, lineValue, monthSums, movesFor, sortMoves, isOver, isNear, KIND_WORD };
  root.AskerCustomersLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const qtyText = (l) => {
    const f = root.AskerStockLib && root.AskerStockLib.qtyText;
    return f ? f(l.p, l.u, l.k) : `${num(l.p)} علبة` + (num(l.u) ? ` و${num(l.u)} وحدة` : '');
  };
  let list = null, loading = null, loadedAt = 0, failed = '';
  let view = null, query = '', shown = SHOW;
  // the open statement
  let st = null;   // { c, moves, done, filter, open: Set, busy, error }

  async function loadList(force) {
    if (!db()) return list;
    if (loading) return loading;
    if (list && !force && Date.now() - loadedAt < 5 * 60e3) return list;
    loading = (async () => {
      try {
        const rows = [];
        for (let from = 0; from < 20000; from += PAGE) {
          const { data, error } = await db().from('ar_customers').select('id,name,credit_limit,balance,last_at,last_kind,moves').order('id').range(from, from + PAGE - 1);
          if (error) throw new Error(error.message || String(error));
          rows.push(...(data || []));
          if (!data || data.length < PAGE) break;
        }
        list = rows; failed = ''; loadedAt = Date.now();
      } catch (e) {
        failed = (e && e.message) || String(e);
      } finally {
        loading = null;
        draw();
      }
      return list;
    })();
    return loading;
  }

  function rowHtml(c) {
    const b = balanceText(c.balance), lim = limitOf(c);
    const pct = lim ? Math.max(0, Math.min(100, Math.round(100 * num(c.balance) / lim))) : 0;
    const last = c.last_at ? `<small>آخر حركة ${esc(whenText(c.last_at, new Date()))} (${esc(KIND_WORD[c.last_kind] || 'بيع')})</small>` : '<small>مفيش حركات</small>';
    return `<button type="button" class="cu-row${isOver(c) ? ' warn' : ''}" data-cu="${esc(c.id)}">` +
      `<span class="cu-main"><strong class="notr">${esc(c.name)}</strong>${last}` +
      (lim && owes(c) ? `<i class="cu-bar"><b class="${isOver(c) ? 'r' : ''}" style="width:${pct}%"></b></i>` : '') + '</span>' +
      `<span class="cu-amt ${b.cls}">${esc(b.text)}${lim ? `<small>الحد ${esc(money(lim))}</small>` : ''}</span></button>`;
  }
  function drawList() {
    const box = $('cuBox');
    if (!box) return;
    const have = Array.isArray(list) && list.length > 0;
    box.classList.toggle('hidden', !have);
    $('alCustomers')?.classList.toggle('hidden', have);
    if (!have) return;
    const n = counts(list);
    if (!view) view = n.over ? 'over' : 'owing';
    const stat = (v, x, label) => `<button type="button" class="stat cu-stat${view === v ? ' on' : ''}" data-cu-view="${v}"><strong>${x}</strong>${label}</button>`;
    $('cuStats').innerHTML = stat('over', n.over, 'عدّوا الحد') + stat('owing', n.owing, 'عليهم فلوس') + stat('prepaid', n.prepaid, 'ليهم فلوس');
    const r = pick(list, view, query);
    const chip = (v, label, x) => `<button type="button" class="chip${r.view === v ? ' on' : ''}" data-cu-view="${v}">${label} <b>${x}</b></button>`;
    $('cuChips').innerHTML = chip('over', 'عدّوا الحد', n.over) + chip('owing', 'عليهم', n.owing) + chip('prepaid', 'ليهم', n.prepaid) + chip('all', 'الكل', n.all);
    $('cuClear')?.classList.toggle('hidden', !query);
    let html = '';
    if (r.view === 'over') {
      const over = r.rows.filter(isOver), near = r.rows.filter(isNear);
      html = (over.length ? over.map(rowHtml).join('') : '<p class="hint">مفيش عميل عدّى حده.</p>') +
        (near.length ? `<h3 class="al-h">قربوا من الحد (90% أو أكتر) <b class="al-n">${near.length}</b></h3>` + near.map(rowHtml).join('') : '');
      $('cuCount').textContent = '';
    } else {
      html = r.rows.slice(0, shown).map(rowHtml).join('') || '<p class="hint">مفيش عميل بالاسم ده.</p>';
      if (r.rows.length > shown) html += `<button type="button" class="secondary cu-more" data-cu-more>اعرض ${Math.min(SHOW, r.rows.length - shown)} كمان</button>`;
      $('cuCount').textContent = query ? `${r.rows.length} عميل` : r.view === 'owing' ? `${r.rows.length} عميل عليهم ${money(n.owed)} ج` : `${r.rows.length} عميل`;
    }
    $('cuRows').innerHTML = html;
  }

  // ---------- the statement ----------
  async function loadMoves() {
    if (!st || st.busy || st.done) return;
    st.busy = true; st.error = '';
    drawStatement();
    const me = st;
    try {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      // the first time: pages until this month is complete (for its sums), then 100 more each tap on «اعرض أقدم»
      for (let i = 0; i < 20; i++) {
        const from = me.moves.length;
        const { data, error } = await db().from('ar_customer_moves').select('id,at,kind,total,paid,balance,items')
          .eq('customer_id', me.c.id).order('at', { ascending: false }).order('id', { ascending: false }).range(from, from + MOVES_PAGE - 1);
        if (error) throw new Error(error.message || String(error));
        const seen = new Set(me.moves.map((m) => m.id));
        me.moves.push(...(data || []).filter((m) => !seen.has(m.id)));
        sortMoves(me.moves);
        if (!data || data.length < MOVES_PAGE) { me.done = true; break; }
        const oldest = parseAt(me.moves[me.moves.length - 1].at);
        if (me.monthDone || !oldest || oldest < monthStart) { me.monthDone = true; break; }
      }
      if (me.done) me.monthDone = true;
    } catch (e) {
      me.error = (e && e.message) || String(e);
    } finally {
      me.busy = false;
      if (st === me) drawStatement();
    }
  }
  function moveHtml(m) {
    const t = moveTitle(m), at = parseAt(m.at);
    const items = Array.isArray(m.items) ? m.items : [];
    const open = st.open.has(m.id);
    const bits = [at ? clock(at) : ''];
    if (items.length) bits.push(`<button type="button" class="linklike" data-cu-items="${esc(m.id)}">${esc(itemsWord(items.length))} ${open ? '▾' : '▸'}</button>`);
    if (m.kind === 'sale' && num(m.paid) > 0) bits.push(`<span>دفع منها ${esc(money(m.paid))} ج</span>`);
    const lines = open && items.length
      ? '<div class="cu-items">' + items.map((l) => `<div><span class="notr" dir="ltr">${esc(l.n)}</span><span>${esc(qtyText(l))} · ${esc(money(lineValue(l)))} ج</span></div>`).join('') + '</div>'
      : '';
    return `<div class="cu-mv k-${t.cls}"><div class="cu-mv-l"><span class="cu-k">${esc(t.text)}</span><span class="cu-after">${esc(afterText(m.balance))}</span></div>` +
      `<div class="cu-mv-d">${bits.filter(Boolean).join(' · ')}</div>${lines}</div>`;
  }
  function drawStatement() {
    const box = $('cuSt');
    if (!box) return;
    $('cuListView')?.classList.toggle('hidden', !!st);
    box.classList.toggle('hidden', !st);
    if (!st) { box.innerHTML = ''; return; }
    const c = st.c, b = balanceText(c.balance), lim = limitOf(c), now = new Date();
    const limLine = lim
      ? (isOver(c) ? `الحد ${money(lim)} ج · زيادة ${money(num(c.balance) - lim)} ج` : `الحد ${money(lim)} ج · ${Math.max(0, Math.round(100 * num(c.balance) / lim))}% من الحد`)
      : 'مالوش حد في كارته';
    const sums = monthSums(st.moves, now);
    const shownMoves = movesFor(st.moves, st.filter);
    let body = '', lastDay = '';
    for (const m of shownMoves) {
      const t = parseAt(m.at), k = t ? dayKey(t) : '';
      if (k !== lastDay) { body += `<h3 class="cu-day">${esc(dayLabel(t, now))}</h3>`; lastDay = k; }
      body += moveHtml(m);
    }
    if (!shownMoves.length && !st.busy && !st.error) body = `<p class="hint">${st.moves.length ? 'مفيش حركات من النوع ده في اللي ظاهر.' : 'مفيش حركات للعميل ده.'}</p>`;
    const chip = (f, label) => `<button type="button" class="chip${st.filter === f ? ' on' : ''}" data-cu-filter="${f}">${label}</button>`;
    box.innerHTML =
      `<button type="button" class="secondary small cu-back" data-cu-back>→ رجوع للعملاء</button>` +
      `<div class="cu-head"><div class="cu-name"><strong class="notr">${esc(c.name)}</strong> <span class="hint">كود ${esc(c.id)}</span></div>` +
      `<div class="cu-bal ${b.cls}">${esc(b.text)}</div><div class="hint">${esc(limLine)}</div>` +
      (st.monthDone ? `<div class="cu-sum"><div>اشترى الشهر ده<b>${esc(money(sums.bought))} ج</b></div><div>دفع الشهر ده<b class="paid">${esc(money(sums.paid))} ج</b></div></div>` : '') +
      '</div>' +
      `<div class="chips cu-filter" role="group" aria-label="نوع الحركة">${chip('all', 'الكل')}${chip('sales', 'المبيعات')}${chip('payments', 'المدفوعات')}</div>` +
      `<div id="cuMoves">${body}</div>` +
      (st.error ? `<p class="status bad">مقدرتش أجيب الحركات: ${esc(st.error)}</p>` : '') +
      (st.busy ? '<p class="status">بيجيب الحركات…</p>' : '') +
      (!st.done && !st.busy ? '<button type="button" class="secondary cu-more" data-cu-older>اعرض أقدم</button>' : '') +
      (st.done && st.moves.length ? `<p class="hint">ده كل حسابه: ${st.moves.length} حركة من أول ${esc(dateText(parseAt(st.moves[st.moves.length - 1].at)))}.</p>` : '');
  }
  function openStatement(id, fromHistory) {
    const c = (list || []).find((x) => String(x.id) === String(id));
    if (!c) return;
    st = { c, moves: [], done: false, monthDone: false, filter: 'all', open: new Set(), busy: false, error: '' };
    if (!fromHistory) { try { history.pushState({ cuSt: c.id }, ''); } catch (e) {} }
    drawStatement();
    window.scrollTo?.(0, 0);
    loadMoves();
  }
  function closeStatement() {
    st = null;
    drawStatement();
    drawList();
  }

  function draw() {
    drawList();
    if (st) drawStatement();
  }
  function bind() {
    const panel = $('customersPanel');
    if (!panel) return;
    panel.addEventListener('click', (e) => {
      const v = e.target.closest('[data-cu-view]');
      if (v) { view = v.dataset.cuView; shown = SHOW; if (query && view === 'over') { query = ''; $('cuQ').value = ''; } drawList(); return; }
      const row = e.target.closest('[data-cu]');
      if (row) { openStatement(row.dataset.cu); return; }
      if (e.target.closest('[data-cu-more]')) { shown += SHOW; drawList(); return; }
      if (e.target.closest('[data-cu-back]')) {
        if (history.state && history.state.cuSt) history.back(); else closeStatement();
        return;
      }
      const f = e.target.closest('[data-cu-filter]');
      if (f && st) { st.filter = f.dataset.cuFilter; drawStatement(); return; }
      const it = e.target.closest('[data-cu-items]');
      if (it && st) {
        const id = st.moves.find((m) => String(m.id) === it.dataset.cuItems)?.id;
        if (id != null) { if (st.open.has(id)) st.open.delete(id); else st.open.add(id); drawStatement(); }
        return;
      }
      if (e.target.closest('[data-cu-older]')) loadMoves();
    });
    $('cuQ')?.addEventListener('input', (e) => { query = e.target.value; shown = SHOW; drawList(); });
    $('cuClear')?.addEventListener('click', () => { query = ''; $('cuQ').value = ''; drawList(); $('cuQ').focus(); });
    // the phone's back button closes the statement
    window.addEventListener('popstate', () => { if (st) closeStatement(); });
  }
  root.AskerCustomers = {
    open: () => loadList(false),
    load: loadList,
    list: () => list,
    show: (v) => { if (v) view = v; if (st) closeStatement(); else drawList(); },
    statement: (id) => openStatement(id),
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(typeof window === 'undefined' ? globalThis : window);
