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
  // the customer's discount on a sale or a return: the items' value minus what was charged (the laptop sends the charged
  // amount: PharmaFly's Total minus the ticket's Discount, e.g. 374 − 9.9% = 336.97). 0 when there is none.
  function discountOf(m) {
    if ((m.kind !== 'sale' && m.kind !== 'return') || !Array.isArray(m.items) || !m.items.length) return 0;
    const gross = m.items.reduce((s, l) => s + lineValue(l), 0);
    const d = Math.abs(gross) - Math.abs(num(m.total));
    return d > 0.5 ? Math.round(d * 100) / 100 : 0;
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
  // a WhatsApp number as it is kept: digits with the country code (Egyptian 01xxxxxxxxx -> 201xxxxxxxxx); '' if it is not one
  function intlPhone(s) {
    let d = String(s || '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[^\d+]/g, '');
    if (d.startsWith('+')) d = d.slice(1);
    if (d.startsWith('00')) d = d.slice(2);
    if (/^0[1-9]\d{7,9}$/.test(d)) d = '20' + d.slice(1); // an Egyptian number written the local way (01…, 02…)
    else if (/^1\d{9}$/.test(d)) d = '20' + d;
    return /^\d{8,15}$/.test(d) ? d : '';
  }
  // as people read it: 201012345678 -> «0101 234 5678»
  function showPhone(p) {
    const d = String(p || '');
    if (/^20\d{10}$/.test(d)) { const l = '0' + d.slice(2); return `${l.slice(0, 4)} ${l.slice(4, 7)} ${l.slice(7)}`; }
    return d ? '+' + d : '';
  }
  const api = { money, balanceText, norm, counts, pick, parseAt, dayLabel, whenText, moveTitle, afterText, itemsWord, lineValue, discountOf, monthSums, movesFor, sortMoves, isOver, isNear, KIND_WORD, intlPhone, showPhone };
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
  // the customers' WhatsApp numbers (ar_customer_phones, owner 2026-11-12); null = not there (the send part stays hidden)
  let phones = null;
  // the open statement
  let st = null;   // { c, moves, done, filter, open: Set, busy, error, phoneEdit, tels, send }
  const canPick = () => !!(navigator.contacts && navigator.contacts.select && root.ContactsManager);
  const S = () => root.AskerStatementLib;

  async function loadPhones() {
    try {
      const { data, error } = await db().from('ar_customer_phones').select('customer_id,phone,contact_name,last_sent_at,last_sent_from,updated_at').range(0, 4999);
      if (error) throw new Error(error.message || String(error));
      // several numbers a customer (owner 2026-11-12: «رقم و2 و3»), the first saved first
      const m = new Map();
      [...(data || [])].sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || '')))
        .forEach((r) => { const k = String(r.customer_id); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
      phones = m;
    } catch (e) {
      phones = null;
    }
  }

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
        await loadPhones();
        // the bot was closed and reopened while the phone's contacts list was open: back to that customer, and say so
        const pp = pendingPick();
        if (pp && !st && phones) {
          forgetPick();
          if (list.some((x) => String(x.id) === String(pp.id))) {
            openStatement(pp.id);
            Object.assign(st, { phoneEdit: true, phoneBad: true,
              phoneMsg: 'البوت اتقفل واتفتح تاني وانت في أسامي الموبايل، فالرقم ماوصلش. انسخ الرقم من الموبايل ودوس «الصق الرقم»، أو جرّب أسامي الموبايل تاني.' });
          }
        }
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
      `<span class="cu-main"><strong class="notr">${esc(c.name)}${phones && phones.has(String(c.id)) ? ' 📱' : ''}</strong>${last}` +
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
  const payCount = (s) => s.moves.filter((m) => m.kind === 'payment').length;
  // needPays: keep loading until that many payments are there (the send box offers them), else the usual pages
  async function loadMoves(needPays) {
    if (!st || st.busy || st.done) return;
    st.busy = true; st.error = '';
    drawStatement();
    const me = st, wasMonthDone = me.monthDone;
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
        if (!oldest || oldest < monthStart) me.monthDone = true;
        if (needPays) { if (payCount(me) >= needPays && me.monthDone) break; continue; }
        if (wasMonthDone || me.monthDone) break;
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
    // only a sale or a return has items (a payment ticket in PharmaFly carries a placeholder line «أصناف متنوعة» at 0)
    const items = (m.kind === 'sale' || m.kind === 'return') && Array.isArray(m.items) ? m.items : [];
    const open = st.open.has(m.id);
    const bits = [at ? clock(at) : ''];
    if (items.length) bits.push(`<button type="button" class="linklike" data-cu-items="${esc(m.id)}">${esc(itemsWord(items.length))} ${open ? '▾' : '▸'}</button>`);
    const disc = discountOf(m);
    if (disc) bits.push(`<span>خصم ${esc(money(disc))} ج</span>`);
    if (m.kind === 'sale' && num(m.paid) > 0) bits.push(`<span>دفع منها ${esc(money(m.paid))} ج</span>`);
    const lines = open && items.length
      ? '<div class="cu-items">' + items.map((l) => `<div><span class="notr" dir="ltr">${esc(l.n)}</span><span>${esc(qtyText(l))} · ${esc(money(lineValue(l)))} ج</span></div>`).join('') + '</div>'
      : '';
    return `<div class="cu-mv k-${t.cls}"><div class="cu-mv-l"><span class="cu-k">${esc(t.text)}</span><span class="cu-after">${esc(afterText(m.balance))}</span></div>` +
      `<div class="cu-mv-d">${bits.filter(Boolean).join(' · ')}</div>${lines}</div>`;
  }
  // ---------- the customer's WhatsApp number and sending the statement (owner 2026-11-12) ----------
  const localIso = (d) => { const t = new Date(d); return isNaN(t) ? '' : `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:00`; };
  const errText = (e) => (e && e.message) || String(e);
  const MAX_NUMBERS = 5;
  const numbersOf = (id) => (phones && phones.get(String(id))) || [];
  // a text for a browser dialog (confirm) in the bot's language
  const tr = (s) => (root.AskerI18n && root.AskerI18n.lang && root.AskerI18n.lang() === 'en' ? root.AskerI18n.translate(s) : s);
  function phoneHtml() {
    if (!phones) return ''; // the numbers' table is not on the server (yet)
    const list = numbersOf(st.c.id);
    const note = st.phoneMsg ? `<p class="status ${st.phoneBad ? 'bad' : 'good'}">${esc(st.phoneMsg)}</p>` : '';
    const rows = list.map((p) => `<div class="cu-phone"><span>📱 واتس: <b dir="ltr">${esc(showPhone(p.phone))}</b>` +
      (p.contact_name ? `<small><span class="notr">${esc(p.contact_name)}</span> في الموبايل</small>` : '') +
      (p.last_sent_at ? `<small>آخر كشف اتبعت ${esc(whenText(localIso(p.last_sent_at), new Date()))}</small>` : '') + '</span>' +
      `<button type="button" class="linklike" data-cu-phone-del="${esc(p.phone)}">شيله</button></div>`).join('');
    if (list.length && !st.phoneEdit) {
      return rows +
        (list.length < MAX_NUMBERS ? '<button type="button" class="linklike cu-add" data-cu-phone-edit>+ ضيف رقم تاني</button>' : '') +
        (st.send ? '' : '<button type="button" class="cu-send" data-cu-send>ابعت كشف الحساب على الواتس</button>') + note;
    }
    // the numbers that came from the contacts list ({ p, name }), when more than one
    const tels = st.tels && st.tels.length > 1
      ? '<p class="hint">جه أكتر من رقم، اختار اللي هتضيفه:</p><div class="cu-tels">' +
        st.tels.map((t, i) => `<button type="button" class="secondary small" data-cu-tel="${i}"><b dir="ltr">${esc(showPhone(t.p))}</b>${t.name ? ` <small class="notr">${esc(t.name)}</small>` : ''}</button>`).join('') +
        '<button type="button" class="small" data-cu-tel="all">ضيفهم كلهم</button></div>'
      : '';
    return rows + `<div class="cu-phone"><span>${list.length ? '📱 رقم واتس جديد' : '📱 مالوش رقم واتس'}</span>` +
      (list.length ? '<button type="button" class="linklike" data-cu-phone-cancel>لغي</button>' : '') + '</div>' +
      (canPick() ? '<button type="button" class="secondary cu-pick" data-cu-pick>اختار رقمه من أسامي الموبايل</button>' : '') +
      (canPaste() ? '<button type="button" class="secondary cu-pick" data-cu-paste>الصق الرقم اللي نسخته</button>' : '') + tels +
      `<div class="cu-phone-in"><input id="cuPhoneIn" type="tel" inputmode="tel" autocomplete="off" placeholder="${canPick() ? 'أو اكتب رقمه: 01xxxxxxxxx' : 'اكتب رقمه: 01xxxxxxxxx'}" value="${esc(st.phoneDraft || '')}" />` +
      '<button type="button" class="small" data-cu-phone-save>احفظ</button></div>' + note;
  }
  // add a number (a number already there only gets its name updated)
  async function savePhone(phone, name, quiet) {
    const me = st, p = intlPhone(phone);
    if (!p) { me.phoneMsg = 'الرقم ده مش مظبوط. اكتبه زي 01012345678.'; me.phoneBad = true; drawStatement(); return false; }
    const list = numbersOf(me.c.id), had = list.find((x) => x.phone === p);
    if (!had && list.length >= MAX_NUMBERS) { me.phoneMsg = 'العميل ده عليه 5 أرقام، شيل واحد الأول.'; me.phoneBad = true; drawStatement(); return false; }
    const row = { customer_id: me.c.id, phone: p, contact_name: name ? String(name).trim().slice(0, 120) : (had && had.contact_name) || null, updated_at: new Date().toISOString() };
    const { error } = await db().from('ar_customer_phones').upsert(row, { onConflict: 'customer_id,phone' });
    if (error) { me.phoneMsg = 'مقدرتش أحفظ الرقم: ' + errText(error); me.phoneBad = true; if (st === me) drawStatement(); return false; }
    if (had) Object.assign(had, row);
    else { if (!phones.has(String(me.c.id))) phones.set(String(me.c.id), []); phones.get(String(me.c.id)).push(row); }
    if (!quiet) {
      Object.assign(me, { phoneEdit: false, tels: null, phoneDraft: '', phoneMsg: had ? 'الرقم ده كان متسجل، اتحدّث.' : 'اتحفظ الرقم.', phoneBad: false });
      if (st === me) drawStatement();
    }
    return true;
  }
  async function saveAll(tels) {
    const me = st;
    let n = 0;
    me.phoneBad = false;
    for (const t of tels) { if (await savePhone(t.p, t.name, true)) n++; if (st !== me) return; if (me.phoneBad) break; }
    if (!me.phoneBad) Object.assign(me, { phoneEdit: false, tels: null, phoneDraft: '', phoneMsg: `اتحفظ ${n} رقم.`, phoneBad: false });
    if (st === me) drawStatement();
  }
  async function deletePhone(phone) {
    const me = st;
    if (!root.confirm(tr('تشيل الرقم ده من العميل؟') + ' ' + showPhone(phone))) return;
    const { error } = await db().from('ar_customer_phones').delete().eq('customer_id', me.c.id).eq('phone', phone);
    if (error) { me.phoneMsg = 'مقدرتش أشيل الرقم: ' + errText(error); me.phoneBad = true; if (st === me) drawStatement(); return; }
    const list = numbersOf(me.c.id), i = list.findIndex((x) => x.phone === phone);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) phones.delete(String(me.c.id));
    if (me.send && me.send.to === phone) me.send.to = null;
    Object.assign(me, { phoneMsg: 'اتشال الرقم.', phoneBad: false });
    if (st === me) drawStatement();
  }
  // the phone's contacts list (owner 2026-11-12: «باختار الرقم وبدوس تم … ما بلاقيش الرقم اتسحب»): every outcome now says
  // something, and if the phone closes and reopens the bot while the list is open (the pick is lost), the bot comes back to
  // that customer and says so
  const PICK_KEY = 'asker-cu-pick';
  function rememberPick(id) { try { localStorage.setItem(PICK_KEY, JSON.stringify({ id, at: Date.now() })); } catch (e) {} }
  function forgetPick() { try { localStorage.removeItem(PICK_KEY); } catch (e) {} }
  function pendingPick() {
    try { const x = JSON.parse(localStorage.getItem(PICK_KEY) || 'null'); return x && x.id != null && Date.now() - x.at < 10 * 60e3 ? x : null; } catch (e) { return null; }
  }
  async function pickContact() {
    const me = st;
    rememberPick(me.c.id);
    Object.assign(me, { phoneMsg: 'علّم على الاسم (أو أكتر) ودوس «تم»…', phoneBad: false, tels: null });
    drawStatement();
    let got;
    try {
      // the tick-box list (2026-11-12: on the owner's Chrome 156 the one-name list came back empty after «تم»)
      got = await navigator.contacts.select(['name', 'tel'], { multiple: true });
    } catch (e) {
      forgetPick();
      Object.assign(me, { phoneMsg: 'مقدرتش أفتح أسامي الموبايل: ' + errText(e) + '. انسخ الرقم ودوس «الصق الرقم».', phoneBad: true });
      if (st === me) drawStatement();
      return;
    }
    forgetPick();
    const people = Array.isArray(got) ? got : [];
    if (!people.length) {
      Object.assign(me, { phoneMsg: 'ماوصلش أي اسم من القايمة. علّم على المربع اللي جنب الاسم ودوس «تم»، أو انسخ الرقم ودوس «الصق الرقم».', phoneBad: true });
      if (st === me) drawStatement();
      return;
    }
    // every number of every ticked name, once
    const seen = new Set(), tels = [];
    const raw = [];
    for (const c of people) {
      const name = (c && c.name && c.name[0]) || '';
      for (const t of (c && c.tel) || []) {
        if (!String(t || '').trim()) continue;
        raw.push(t);
        const p = intlPhone(t);
        if (p && !seen.has(p)) { seen.add(p); tels.push({ p, name }); }
      }
    }
    if (!tels.length) {
      me.phoneMsg = raw.length
        ? `الرقم اللي وصل (${raw[0]}) مش رقم ينفع للواتس. انسخ الرقم الصح ودوس «الصق الرقم».`
        : 'الاسم وصل من غير رقم. في قايمة الأسامي خلّي «أرقام التليفون» متعلّمة وجرّب تاني، أو انسخ الرقم ودوس «الصق الرقم».';
      me.phoneBad = true;
      if (st === me) drawStatement();
      return;
    }
    if (tels.length === 1) { await savePhone(tels[0].p, tels[0].name); return; }
    me.tels = tels; me.phoneMsg = ''; if (st === me) drawStatement();
  }
  // the number copied on the phone (from the contacts app or a WhatsApp chat): one tap
  const canPaste = () => !!(navigator.clipboard && navigator.clipboard.readText);
  async function pastePhone() {
    const me = st;
    let t = '';
    try {
      t = await navigator.clipboard.readText();
    } catch (e) {
      Object.assign(me, { phoneMsg: 'مقدرتش أقرا اللي متنسخ. الصقه في الخانة ودوس «احفظ».', phoneBad: true });
      if (st === me) drawStatement();
      return;
    }
    const p = intlPhone(t);
    if (!p) {
      Object.assign(me, { phoneDraft: String(t || '').trim().slice(0, 40), phoneMsg: 'اللي متنسخ مش رقم تليفون. انسخ الرقم نفسه وجرّب تاني.', phoneBad: true });
      if (st === me) drawStatement();
      return;
    }
    await savePhone(p, '');
  }
  function sendHtml() {
    const s = st.send, L2 = S();
    if (!s || !L2 || !phones) return '';
    const pays = L2.paymentChoices(st.moves);
    const monthId = L2.monthStartId(st.moves, new Date());
    if (s.from == null) s.from = pays.length ? pays[0].id : monthId;
    const opt = (id, title, sub) => `<button type="button" class="cu-opt${String(s.from) === String(id) ? ' on' : ''}" data-cu-from="${esc(id)}"><span>${esc(title)}<small>${esc(sub)}</small></span><i></i></button>`;
    const after = (p) => `${dateText(parseAt(p.at))} · بعدها ${p.sales} فاتورة` + (p.returns ? ` و${p.returns} مرتجع` : '');
    // which number (when there are several): the last one a statement went to, else the first
    const nums = numbersOf(st.c.id);
    if (!s.to || !nums.some((x) => x.phone === s.to)) {
      const last = [...nums].filter((x) => x.last_sent_at).sort((a, b) => String(b.last_sent_at).localeCompare(String(a.last_sent_at)))[0];
      s.to = (last || nums[0] || {}).phone || null;
    }
    let html = '<div class="cu-sendbox">';
    if (nums.length > 1) {
      html += '<h3>ابعت على:</h3><div class="chips cu-to">' + nums.map((x) => `<button type="button" class="chip${x.phone === s.to ? ' on' : ''}" data-cu-to="${esc(x.phone)}" dir="ltr">${esc(showPhone(x.phone))}</button>`).join('') + '</div>';
    }
    html += '<h3>الكشف يبدأ من:</h3>';
    html += pays.slice(0, s.showAll ? 60 : 4).map((p, i) => opt(p.id, i === 0 ? `آخر دفعة: ${money(p.paid)} ج` : i === 1 ? `الدفعة اللي قبلها: ${money(p.paid)} ج` : `دفعة ${money(p.paid)} ج`, after(p))).join('');
    if (!pays.length && !st.busy) html += '<p class="hint">مفيش دفعات في حسابه.</p>';
    if ((pays.length > 4 && !s.showAll) || (!st.done && s.showAll)) html += '<button type="button" class="secondary small cu-more" data-cu-more-pays>دفعات أقدم</button>';
    if (monthId != null && !pays.some((p) => String(p.id) === String(monthId))) {
      const n = st.moves.filter((m) => String(m.at) >= String(st.moves.find((x) => String(x.id) === String(monthId)).at)).length;
      html += opt(monthId, 'من أول الشهر ده', `${n} حركة`);
    }
    if (st.busy) html += '<p class="status">بيجيب الحركات…</p>';
    if (s.busy) html += '<p class="status">بيعمل الكشف…</p>';
    if (s.error) html += `<p class="status bad">مقدرتش أعمل الكشف: ${esc(s.error)}</p>`;
    if (!s.msg) {
      html += (s.from != null && !s.busy ? '<button type="button" class="cu-send" data-cu-make>جهّز الكشف والرسالة</button>' : '') +
        '<button type="button" class="secondary cu-more" data-cu-send-close>لغي</button>';
    } else {
      html += `<p class="status good">الكشف جاهز: ${s.pages} صفحة. <button type="button" class="linklike" data-cu-pdf>اتفرّج عليه</button></p>` +
        `<textarea id="cuMsg" rows="7">${esc(s.msg)}</textarea>` +
        '<button type="button" class="cu-send" data-cu-wa>افتح محادثته في الواتس وابعت</button>' +
        (s.sent ? '<p class="status good">اتفتحت محادثته في الواتس: دوس إرسال هناك.</p>' : '') +
        '<button type="button" class="secondary cu-more" data-cu-send-close>لغي</button>';
    }
    return html + '</div>';
  }
  async function openSend() {
    st.send = { from: null };
    drawStatement();
    // enough history for a few payments to choose from
    if (!st.done && payCount(st) < 4) await loadMoves(4);
  }
  async function makeStatement() {
    const me = st, s = me && me.send, L2 = S();
    if (!s || s.busy || !L2 || !root.AskerStatement) return;
    const stmt = L2.statementFrom(me.moves, s.from);
    if (!stmt) return;
    s.busy = true; s.error = ''; drawStatement();
    try {
      const now = new Date();
      const pdf = await root.AskerStatement.makePdf(stmt, { name: me.c.name, id: me.c.id, now });
      const rand = (root.crypto && root.crypto.randomUUID && root.crypto.randomUUID()) || Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      const key = L2.fileKey(now, rand);
      const up = await db().storage.from('ar-statements').upload(key, pdf.blob, { contentType: 'application/pdf', upsert: false });
      if (up && up.error) throw new Error(up.error.message || String(up.error));
      const sg = await db().storage.from('ar-statements').createSignedUrls([key], 30 * 86400);
      const link = sg && !sg.error && sg.data && sg.data[0] && sg.data[0].signedUrl;
      if (!link) throw new Error((sg && sg.error && sg.error.message) || 'مفيش لينك');
      if (s.pdfUrl) URL.revokeObjectURL(s.pdfUrl);
      Object.assign(s, { stmt, link, pages: pdf.pages, pdfUrl: URL.createObjectURL(pdf.blob), sent: false });
      s.msg = L2.messageText({ name: me.c.name, from: stmt.from, balance: stmt.closing, link });
    } catch (e) {
      s.error = errText(e);
    } finally {
      s.busy = false;
      if (st === me) drawStatement();
    }
  }
  function openWa() {
    const me = st, s = me.send, p = s && numbersOf(me.c.id).find((x) => x.phone === s.to);
    if (!s || !s.msg || !p) return;
    const t = String(($('cuMsg') && $('cuMsg').value) || s.msg).trim();
    if (root.AskerApp && root.AskerApp.openWhatsApp) root.AskerApp.openWhatsApp(t, p.phone);
    else root.open('https://wa.me/' + p.phone + '?text=' + encodeURIComponent(t), '_blank');
    s.sent = true;
    const at = new Date().toISOString();
    db().from('ar_customer_phones').update({ last_sent_at: at, last_sent_from: s.stmt.from }).eq('customer_id', me.c.id).eq('phone', p.phone)
      .then(({ error }) => { if (!error) Object.assign(p, { last_sent_at: at, last_sent_from: s.stmt.from }); });
    drawStatement();
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
      phoneHtml() +
      '</div>' +
      sendHtml() +
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
      if (e.target.closest('[data-cu-older]')) { loadMoves(); return; }
      // the customer's WhatsApp number
      if (!st) return;
      const keepDraft = () => { const i = $('cuPhoneIn'); if (i) st.phoneDraft = i.value; };
      if (e.target.closest('[data-cu-phone-edit]')) { Object.assign(st, { phoneEdit: true, phoneMsg: '', tels: null }); drawStatement(); return; }
      if (e.target.closest('[data-cu-phone-cancel]')) { Object.assign(st, { phoneEdit: false, phoneMsg: '', tels: null, phoneDraft: '' }); drawStatement(); return; }
      if (e.target.closest('[data-cu-pick]')) { keepDraft(); pickContact(); return; }
      if (e.target.closest('[data-cu-paste]')) { keepDraft(); pastePhone(); return; }
      const tel = e.target.closest('[data-cu-tel]');
      if (tel && st.tels) { if (tel.dataset.cuTel === 'all') saveAll(st.tels); else { const t = st.tels[+tel.dataset.cuTel]; if (t) savePhone(t.p, t.name); } return; }
      if (e.target.closest('[data-cu-phone-save]')) { keepDraft(); savePhone(st.phoneDraft, ''); return; }
      const del = e.target.closest('[data-cu-phone-del]');
      if (del) { deletePhone(del.dataset.cuPhoneDel); return; }
      const to = e.target.closest('[data-cu-to]');
      if (to && st.send) { st.send.to = to.dataset.cuTo; st.send.sent = false; drawStatement(); return; }
      // sending the statement
      if (e.target.closest('[data-cu-send]')) { openSend(); return; }
      if (e.target.closest('[data-cu-send-close]')) { if (st.send && st.send.pdfUrl) URL.revokeObjectURL(st.send.pdfUrl); st.send = null; drawStatement(); return; }
      const fr = e.target.closest('[data-cu-from]');
      if (fr && st.send) { if (String(st.send.from) !== fr.dataset.cuFrom) Object.assign(st.send, { from: fr.dataset.cuFrom, msg: '', link: '', sent: false, error: '' }); drawStatement(); return; }
      if (e.target.closest('[data-cu-more-pays]') && st.send) { st.send.showAll = true; drawStatement(); if (!st.done) loadMoves(payCount(st) + 6); return; }
      if (e.target.closest('[data-cu-make]')) { makeStatement(); return; }
      if (e.target.closest('[data-cu-pdf]') && st.send && st.send.pdfUrl) { root.open(st.send.pdfUrl, '_blank'); return; }
      if (e.target.closest('[data-cu-wa]')) { openWa(); return; }
    });
    // the message can be changed before sending; a redraw keeps the change
    panel.addEventListener('input', (e) => { if (e.target.id === 'cuMsg' && st && st.send) st.send.msg = e.target.value; });
    $('cuQ')?.addEventListener('input', (e) => { query = e.target.value; shown = SHOW; drawList(); });
    $('cuClear')?.addEventListener('click', () => { query = ''; $('cuQ').value = ''; drawList(); $('cuQ').focus(); });
    // the phone's back button closes the statement
    window.addEventListener('popstate', () => { if (st) closeStatement(); });
    // reopened while picking from the contacts: go to the customers (the list's load then opens that customer)
    if (pendingPick()) setTimeout(() => { if (root.AskerApp && root.AskerApp.showTab) root.AskerApp.showTab('customers'); }, 800);
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
