/* «الحسابات ← 💸 المدفوعات» (owner 2026-11-19: «عايزين نعمل حساب المدفوعات، ان انت تدفع من الخزنة اللي احنا ثبتناها في السيستم
   بتاعنا لأماكن المدفوعات، بقى ايه زي الموردين، المصروفات … عشان نعرف نديرها برضو من هنا»; mockup mockups/payments_2026-11-19.png,
   he chose «ب» for now: he enters the payment in PharmaFly by hand, the system keeps the order and closes it by itself).
   1) «+ دفع جديد»: a supplier (ar_vendors, with its balance) or an expense type (ar_cash_cats = PharmaFly's CashAccountsOthers), the
      box (ar_cash_accounts, with its balance), the amount, a note → a summary (the box and the supplier before → after) → «أوافق على
      الدفع» or «احفظه وأوافق عليه بعدين» (ar_pay_order_save).
   2) the open orders: waiting (approve / edit / cancel), approved (enter it in PharmaFly; late after 2 hours), a difference (the
      order and what came from PharmaFly side by side: «هي دي، اقفله» / «مش هي» / cancel) (ar_pay_order_act).
   3) what was paid (ar_cash_moves kind vendor / expense / owner, the last 365 days): suppliers / expenses / the owner / a box; a move
      that closed an order says so. Three numbers on top: suppliers, expenses and the owner in the last 30 days.
   The owner (2026-11-19: «انت ازاى ما حسبتش الدفع لصاحب المنشاه … عمر الخزن ما هتظبط معاك من غيرها»): «👤 صاحب المنشأة» = PharmaFly's
   op 51 (kind 'owner'): a box, an amount and a note (for whom), no supplier or type (migration 202611190400).
   The server closes an order by itself when the move with the same box, party and amount comes in (migration 202611190300).
   OWNER only (the database refuses everyone else). Nothing here writes to PharmaFly. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/pay.cjs) ----------
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  function money(n) {
    const v = Math.abs(num(n)) < 0.005 ? 0 : num(n);
    const frac = Math.abs(v % 1) > 0.005;
    return v.toLocaleString('en-US', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
  }
  // what he typed: Arabic digits, a comma for thousands, the Arabic decimal mark → a number (NaN when it is not one)
  function parseAmount(s) {
    const t = String(s ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫]/g, '.').replace(/[,،\s]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
    return Math.round(Number(t) * 100) / 100;
  }
  const LATE_MS = 2 * 3600e3;
  const isLate = (o, now) => o.status === 'approved' && !!o.approved_at && (now || Date.now()) - new Date(o.approved_at).getTime() > LATE_MS;
  // the order's state in words
  function statusText(o, now) {
    if (o.status === 'waiting') return 'مستني موافقتك';
    if (o.status === 'approved') return isLate(o, now) ? 'اتوافق من أكتر من ساعتين ولسه ما ظهرش في فارمافلاي' : 'اتوافق عليه: دخّله في فارمافلاي';
    if (o.status === 'matched') return '✓ ظهر في فارمافلاي وطابق';
    if (o.status === 'mismatch') return 'فيه فرق';
    if (o.status === 'cancelled') return 'اتلغى';
    return String(o.status || '');
  }
  const isOpen = (o) => o.status === 'waiting' || o.status === 'approved' || o.status === 'mismatch';
  // what needs his look: a difference, or approved and not in PharmaFly after 2 hours (the red number); and what waits for his yes
  function needs(orders, now) {
    let look = 0, wait = 0;
    for (const o of orders || []) {
      if (o.status === 'mismatch' || isLate(o, now)) look++;
      else if (o.status === 'waiting') wait++;
    }
    return { look, wait };
  }
  // the open ones first (a difference, then late, then waiting, then approved), newest first inside
  function openOrders(orders, now) {
    const rank = (o) => (o.status === 'mismatch' ? 0 : isLate(o, now) ? 1 : o.status === 'waiting' ? 2 : 3);
    return (orders || []).filter(isOpen).sort((a, b) => rank(a) - rank(b) || String(b.created_at).localeCompare(String(a.created_at)));
  }
  // the payments of the last N days (moves are PharmaFly's local time: compared as text with the phone's own calendar day)
  const pad = (n) => String(n).padStart(2, '0');
  const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  function totals(moves, days, now) {
    const from = localIso(new Date((now || Date.now()) - days * 864e5));
    const t = { vendor: 0, vendorN: 0, expense: 0, expenseN: 0, owner: 0, ownerN: 0 };
    for (const m of moves || []) {
      if (String(m.at) < from) continue;
      if (m.kind === 'vendor') { t.vendor += -num(m.amount); t.vendorN++; }
      else if (m.kind === 'expense') { t.expense += -num(m.amount); t.expenseN++; }
      else if (m.kind === 'owner') { t.owner += -num(m.amount); t.ownerN++; }
    }
    for (const k of ['vendor', 'expense', 'owner']) t[k] = Math.round(t[k] * 100) / 100;
    return t;
  }
  // the three kinds of payment out of a box: a supplier (op 9), an expense (op 1000+type), the owner (op 51, owner 2026-11-19)
  const KINDS = ['vendor', 'expense', 'owner'];
  function keepMove(m, filter, box) {
    if (box != null && box !== '' && String(m.account_id) !== String(box)) return false;
    if (KINDS.includes(filter)) return m.kind === filter;
    return KINDS.includes(m.kind);
  }
  // the moves that closed an order: {moveId: order}
  function byMove(orders) {
    const out = {};
    for (const o of orders || []) if (o.status === 'matched' && o.move_id != null) out[String(o.move_id)] = o;
    return out;
  }
  // «18/11 20:00» from PharmaFly's local time (or an ISO time from the server, shown on the phone's clock)
  function when(at) {
    const s = String(at || '');
    let m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s);
    if (m && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return `${m[3]}/${m[2]} ${m[4]}:${m[5]}`;
    const d = new Date(s);
    if (isNaN(d)) return '';
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  // the supplier search: Arabic letters that are written several ways, case, spaces
  const norm = (s) => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();
  function findVendors(vendors, q, max) {
    const k = norm(q);
    const list = (vendors || []).filter((v) => !k || norm(v.name).includes(k) || norm(v.short).includes(k));
    list.sort((a, b) => (b.active === false ? 0 : 1) - (a.active === false ? 0 : 1) || num(b.balance) - num(a.balance) || String(a.name).localeCompare(String(b.name)));
    return list.slice(0, max || 8);
  }
  // the server's refusals in words
  const ERR = {
    kind: 'نوع الدفع مش مظبوط.', amount: 'المبلغ مش مظبوط.', account: 'الخزنة دي مش موجودة.', party: 'المورد أو نوع المصروف مش موجود.',
    not_waiting: 'الأمر ده اتوافق عليه أو اتقفل قبل كده.', closed: 'الأمر ده اتقفل قبل كده.', taken: 'الدفعة دي اتقفل بيها أمر تاني.',
    not_mismatch: 'الأمر ده مبقاش فيه فرق.', no_order: 'الأمر ده مش موجود.',
  };
  const errText = (code) => ERR[code] || 'مقدرتش أكمّل. جرّب تاني.';
  const api = { money, parseAmount, isLate, statusText, isOpen, needs, openOrders, totals, keepMove, byMove, when, norm, findVendors, errText, LATE_MS, KINDS };
  root.AskerPayLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the screen ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const amt = (n) => `${esc(money(n))} ج`; // one text: «20,000 ج» (the English page makes it «20,000 EGP»)
  let accounts = [], cats = [], vendors = [], orders = [], moves = [], loading = false, note = '';
  let filter = 'all', box = '', shown = 60, sure = null, busy = false;
  // the form: null = closed; {id, kind, party, account, amount, memo, step: 'edit' | 'confirm', q, msg}
  let form = null;

  const acctName = (id) => (accounts.find((a) => String(a.id) === String(id)) || {}).name || '';
  const vendorOf = (id) => vendors.find((v) => String(v.id) === String(id));
  const catOf = (id) => cats.find((c) => String(c.id) === String(id));
  const kindWord = (k) => (k === 'vendor' ? 'دفعة لمورد' : k === 'owner' ? 'لصاحب المنشأة' : 'مصروف');
  // the title of an order or a move: «دفعة لمورد · A M group», «مصروف · البوفيه», «لصاحب المنشأة · طاهر» (the owner's note is his «who»)
  const title = (kind, who, memo) => `${esc(kindWord(kind))}` + (kind === 'owner' ? (memo ? ` · <bdi class="notr">${esc(memo)}</bdi>` : '') : ` · <bdi class="notr">${esc(who || '')}</bdi>`);

  function tiles() {
    const t = totals(moves, 30);
    return `<div class="py-tiles"><div class="py-tile"><span>اتدفع لموردين (30 يوم)</span><b>${amt(t.vendor)}</b><small>${esc(t.vendorN)} دفعة</small></div>` +
      `<div class="py-tile"><span>مصروفات (30 يوم)</span><b>${amt(t.expense)}</b><small>${esc(t.expenseN)} مصروف</small></div>` +
      `<div class="py-tile"><span>لصاحب المنشأة (30 يوم)</span><b>${amt(t.owner)}</b><small>${esc(t.ownerN)} مرة</small></div></div>`;
  }
  function orderCard(o) {
    const late = isLate(o);
    const cls = o.status === 'mismatch' || late ? ' py-look' : o.status === 'waiting' ? ' py-wait' : '';
    let html = `<div class="py-card${cls}" data-py-order="${esc(o.id)}"><div class="py-l1"><span class="py-name">${title(o.kind, o.who, o.memo)}</span>` +
      `<span class="py-amt">${amt(o.amount)}</span></div>` +
      `<div class="py-l2"><span>من خزنة</span> <bdi class="notr">${esc(o.account_name || acctName(o.account_id))}</bdi>` +
      (o.memo && o.kind !== 'owner' ? ` · <bdi class="notr">${esc(o.memo)}</bdi>` : '') + `<span class="py-pill">${esc(statusText(o))}</span></div>`;
    if (o.status === 'mismatch' && o.move) {
      const m = o.move;
      html += `<div class="py-diff"><div><span>الأمر:</span> ${amt(o.amount)} · <bdi class="notr">${esc(o.account_name || acctName(o.account_id))}</bdi></div>` +
        `<div><span>اللي ظهر في فارمافلاي:</span> ${amt(-num(m.amount))} · <bdi class="notr">${esc(acctName(m.account_id))}</bdi> · <bdi dir="ltr">${esc(when(m.at))}</bdi></div></div>`;
    }
    const b = [];
    if (o.status === 'waiting') b.push(['approve', 'أوافق', 'p'], ['edit', 'عدّل', '']);
    if (o.status === 'mismatch') b.push(['accept', 'هي دي، اقفله', 'p'], ['skip', 'مش هي', '']);
    if (isOpen(o)) b.push(sure === String(o.id) ? ['cancel', 'متأكد؟ الغيه', 'warn'] : ['ask', o.status === 'mismatch' ? 'الغي الأمر' : 'الغي', '']);
    html += `<div class="py-acts">${b.map(([a, t, c]) => `<button type="button" class="${c === 'p' ? 'py-p' : c === 'warn' ? 'py-warn' : 'secondary'} small" data-py-act="${a}" data-py-id="${esc(o.id)}"${busy ? ' disabled' : ''}>${esc(t)}</button>`).join('')}</div>`;
    return html + '</div>';
  }
  function drawMain() {
    const el = $('pyMain');
    if (!el) return;
    const open = openOrders(orders);
    const done = byMove(orders);
    const list = moves.filter((m) => keepMove(m, filter, box));
    const boxes = [...new Set(moves.map((m) => m.account_id))];
    el.innerHTML = `<button id="pyNew" type="button" class="py-new">+ دفع جديد</button>` + tiles() +
      `<h3 class="py-h">أوامر الدفع${open.length ? ` <span class="py-num">${esc(open.length)}</span>` : ''}</h3>` +
      (open.length ? open.map(orderCard).join('') : '<p class="hint">مفيش أوامر دفع مفتوحة.</p>') +
      `<h3 class="py-h">اللي اتدفع</h3>` +
      `<div class="py-filters"><div class="chips" role="group" aria-label="نوع الدفع">${[['all', 'الكل'], ['vendor', 'موردين'], ['expense', 'مصروفات'], ['owner', 'صاحب المنشأة']].map(([k, t]) => `<button type="button" class="chip${filter === k ? ' on' : ''}" data-py-filter="${k}">${esc(t)}</button>`).join('')}</div>` +
      `<select id="pyBox" aria-label="الخزنة"><option value="">كل الخزن</option>${boxes.map((id) => `<option value="${esc(id)}"${String(box) === String(id) ? ' selected' : ''} class="notr">${esc(acctName(id) || id)}</option>`).join('')}</select></div>` +
      (list.length ? list.slice(0, shown).map((m) => {
        const o = done[String(m.id)];
        return `<div class="py-card py-move"><div class="py-l1"><span class="py-name">${title(m.kind, m.who, m.memo)}</span><span class="py-amt">${amt(-num(m.amount))}</span></div>` +
          `<div class="py-l2"><bdi dir="ltr">${esc(when(m.at))}</bdi> · <bdi class="notr">${esc(acctName(m.account_id))}</bdi>` + (m.memo && m.kind !== 'owner' ? ` · <bdi class="notr">${esc(m.memo)}</bdi>` : '') +
          `<span class="py-pill${o ? ' on' : ''}">${o ? '✓ من أمر دفع' : 'اتدخلت في فارمافلاي'}</span></div></div>`;
      }).join('') + (list.length > shown ? '<button id="pyMore" type="button" class="secondary">اعرض أكتر</button>' : '')
        : '<p class="hint">مفيش مدفوعات بالشكل ده.</p>');
  }

  // ---------- the form ----------
  function formTotals() {
    const a = parseAmount(form.amount);
    const acc = accounts.find((x) => String(x.id) === String(form.account));
    const v = form.kind === 'vendor' ? vendorOf(form.party) : null;
    return { a, acc, v };
  }
  function drawForm() {
    const el = $('pyForm');
    if (!el || !form) return;
    const { a, acc, v } = formTotals();
    const back = `<div class="cs-head"><button type="button" class="secondary small" data-py-back>رجوع</button><strong>${form.id ? 'تعديل أمر دفع' : 'دفع جديد'}</strong></div>`;
    if (form.step === 'confirm') {
      const who = form.kind === 'vendor' ? (v && (v.name || v.short)) : (catOf(form.party) || {}).name;
      el.innerHTML = back + `<div class="py-card py-confirm"><div class="py-name">${title(form.kind, who, form.memo.trim())}</div>` +
        `<div class="py-big">${amt(a)}</div><div class="py-l2"><span>من خزنة</span> <bdi class="notr">${esc(acc && acc.name)}</bdi>` +
        (form.memo.trim() && form.kind !== 'owner' ? ` · <bdi class="notr">${esc(form.memo.trim())}</bdi>` : '') + '</div>' + summary(a, acc, v) + '</div>' +
        `<button type="button" class="py-new" data-py-save="approve"${busy ? ' disabled' : ''}>أوافق على الدفع</button>` +
        `<button type="button" class="secondary py-wide" data-py-save="later"${busy ? ' disabled' : ''}>احفظه وأوافق عليه بعدين</button>` +
        `<button type="button" class="secondary py-wide" data-py-step="edit">رجوع للتعديل</button>` +
        `<p class="hint">بعد موافقتك دخّل الدفعة في فارمافلاي، والسيستم بيقفل الأمر لوحده لما تظهر في الخزنة.</p>` +
        (form.msg ? `<p class="status bad">${esc(form.msg)}</p>` : '');
      return;
    }
    let party = '';
    if (form.kind === 'vendor') {
      if (v) {
        party = `<div class="py-field"><span><b class="notr">${esc(v.name || v.short)}</b> <small class="notr">${esc(v.short || '')}</small></span>` +
          `<span><small>عليه</small> <small>${amt(v.balance)}</small> <button type="button" class="secondary small" data-py-party="">غيّر</button></span></div>`;
      } else {
        const found = findVendors(vendors, form.q, 8);
        party = `<input id="pyVQ" type="search" placeholder="دوّر على المورد" value="${esc(form.q)}" autocomplete="off" />` +
          (found.length ? `<div class="py-picks">${found.map((x) => `<button type="button" class="py-pick" data-py-party="${esc(x.id)}"><b class="notr">${esc(x.name || x.short)}</b><small>${amt(x.balance)}</small></button>`).join('')}</div>`
            : '<p class="hint">مفيش مورد بالاسم ده.</p>');
      }
    } else if (form.kind === 'expense') {
      party = cats.length ? `<div class="py-cats">${cats.map((c) => `<button type="button" class="chip${String(form.party) === String(c.id) ? ' on' : ''}" data-py-party="${esc(c.id)}"><span class="notr">${esc(c.name)}</span></button>`).join('')}</div>`
        : '<p class="hint">أنواع المصروفات لسه ما وصلتش من اللاب.</p>';
    }
    const boxes = accounts.length ? `<div class="py-boxes">${accounts.map((x) => `<button type="button" class="py-bx${String(form.account) === String(x.id) ? ' on' : ''}${Number.isFinite(a) && num(x.balance) < a ? ' low' : ''}" data-py-account="${esc(x.id)}"><b class="notr">${esc(x.name)}</b><small>${amt(x.balance)}</small></button>`).join('')}</div>`
      : '<p class="hint">مفيش خزن لسه. اللاب بيبعتها كل شوية.</p>';
    el.innerHTML = back +
      `<label class="py-lab">الدفع لمين؟</label><div class="py-seg">${[['vendor', '🏭 مورد'], ['expense', '🧾 مصروف'], ['owner', '👤 صاحب المنشأة']].map(([k, t]) => `<button type="button" class="${form.kind === k ? 'on' : ''}" data-py-kind="${k}">${esc(t)}</button>`).join('')}</div>` +
      (form.kind === 'owner' ? '' : `<label class="py-lab">${form.kind === 'vendor' ? 'المورد' : 'نوع المصروف'}</label>${party}`) +
      `<label class="py-lab">من أنهي خزنة؟</label>${boxes}` +
      `<label class="py-lab" for="pyAmount">المبلغ</label><div class="py-field"><input id="pyAmount" inputmode="decimal" autocomplete="off" value="${esc(form.amount)}" /><small>جنيه</small></div>` +
      `<label class="py-lab" for="pyMemo">${form.kind === 'owner' ? 'لمين أو ليه؟ (اختياري)' : 'ملاحظة (اختياري)'}</label><input id="pyMemo" maxlength="200" placeholder="${form.kind === 'owner' ? 'مثلًا: لمين أو ليه' : 'مثلًا: دفعة تحت الحساب'}" value="${esc(form.memo)}" />` +
      `<div id="pySum">${summary(a, acc, v)}</div>` +
      `<button type="button" class="py-new" data-py-step="confirm">راجع وأكّد</button>` +
      (form.msg ? `<p class="status bad">${esc(form.msg)}</p>` : '');
  }
  function summary(a, acc, v) {
    if (!Number.isFinite(a) || a <= 0 || !acc) return '';
    let s = `<div class="py-sum"><div><span>الخزنة:</span> <bdi class="notr">${esc(acc.name)}</bdi> <bdi dir="ltr">${esc(money(acc.balance))}</bdi> ← <bdi dir="ltr">${esc(money(num(acc.balance) - a))}</bdi></div>`;
    if (v) s += `<div><span>رصيد المورد:</span> <bdi dir="ltr">${esc(money(v.balance))}</bdi> ← <bdi dir="ltr">${esc(money(num(v.balance) - a))}</bdi></div>`;
    if (num(acc.balance) < a) s += `<div class="py-warnline">المبلغ أكبر من رصيد الخزنة (${amt(acc.balance)}).</div>`;
    return s + '</div>';
  }
  // only the summary changes while he types (the inputs keep their cursor)
  function drawSum() {
    const s = $('pySum');
    if (!s || !form) return;
    const { a, acc, v } = formTotals();
    s.innerHTML = summary(a, acc, v);
    document.querySelectorAll('#pyForm .py-bx').forEach((b) => {
      const x = accounts.find((y) => String(y.id) === b.dataset.pyAccount);
      b.classList.toggle('low', Number.isFinite(a) && !!x && num(x.balance) < a);
    });
  }
  function check() {
    if (!form.party && form.kind !== 'owner') return form.kind === 'vendor' ? 'اختار المورد.' : 'اختار نوع المصروف.';
    if (!form.account) return 'اختار الخزنة.';
    const a = parseAmount(form.amount);
    if (!Number.isFinite(a) || a <= 0) return 'اكتب المبلغ.';
    return '';
  }
  function draw() {
    const st = $('pyStatus');
    if (st) { st.textContent = note; st.className = note ? 'status bad' : 'status'; }
    $('pyMain')?.classList.toggle('hidden', !!form);
    $('pyForm')?.classList.toggle('hidden', !form);
    if (form) drawForm(); else drawMain();
  }
  function openForm(o) {
    form = o ? { id: o.id, kind: o.kind, party: o.kind === 'owner' ? '' : String(o.kind === 'vendor' ? o.vendor_id : o.cat_id), account: String(o.account_id), amount: String(o.amount), memo: o.memo || '', step: 'edit', q: '', msg: '' }
      : { id: null, kind: 'vendor', party: '', account: '', amount: '', memo: '', step: 'edit', q: '', msg: '' };
    draw();
    root.scrollTo && root.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const unavailable = (e) => /schema cache|does not exist|Could not find|relation/i.test(String(e && (e.message || e)));
  async function load() {
    if (loading || !db()) return;
    loading = true;
    try {
      const since = localIso(new Date(Date.now() - 365 * 864e5));
      const [a, c, v, o, m] = await Promise.all([
        db().from('ar_cash_accounts').select('id,name,balance').order('id'),
        db().from('ar_cash_cats').select('id,name').order('id'),
        db().from('ar_vendors').select('id,name,short,balance,active').limit(2000),
        db().from('ar_pay_orders').select('id,kind,account_id,account_name,vendor_id,cat_id,who,amount,memo,status,created_at,approved_at,move_id,move,closed_at').order('created_at', { ascending: false }).limit(300),
        db().from('ar_cash_moves').select('id,account_id,at,op,kind,amount,who,memo').in('kind', KINDS).gte('at', since).order('at', { ascending: false }).limit(2000),
      ]);
      for (const r of [a, c, v, o, m]) if (r.error) throw r.error;
      accounts = (a.data || []).sort((x, y) => num(x.id) - num(y.id));
      cats = (c.data || []).sort((x, y) => num(x.id) - num(y.id));
      vendors = v.data || [];
      orders = o.data || [];
      moves = (m.data || []).sort((x, y) => String(y.at).localeCompare(String(x.at)) || num(y.id) - num(x.id));
      note = '';
    } catch (e) {
      note = unavailable(e) ? 'المدفوعات لسه مش متاحة: محتاجة تفعيل على السيرفر الأول.' : 'مقدرتش أجيب المدفوعات: ' + (e && e.message);
    } finally { loading = false; draw(); }
  }
  async function rpc(name, args) {
    const { data, error } = await db().rpc(name, args);
    if (error) return { ok: false, error: error.message };
    return data || { ok: false };
  }
  async function save(approve) {
    if (busy || !form) return;
    const msg = check();
    if (msg) { form.msg = msg; form.step = 'edit'; draw(); return; }
    busy = true; draw();
    const r = await rpc('ar_pay_order_save', {
      p_id: form.id, p_kind: form.kind, p_account: Number(form.account), p_party: form.kind === 'owner' ? null : Number(form.party),
      p_amount: parseAmount(form.amount), p_memo: form.memo.trim() || null, p_approve: !!approve,
    });
    busy = false;
    if (!r.ok) { form.msg = ERR[r.error] ? errText(r.error) : 'مقدرتش أحفظ: ' + (r.error || ''); draw(); return; }
    form = null; filter = 'all';
    await load();
  }
  async function act(id, action) {
    if (busy) return;
    busy = true; sure = null; draw();
    const r = await rpc('ar_pay_order_act', { p_id: Number(id), p_action: action });
    busy = false;
    note = r.ok ? '' : ERR[r.error] ? errText(r.error) : 'مقدرتش أكمّل: ' + (r.error || '');
    await load();
    if (!r.ok) draw();
  }
  function bind() {
    const panel = $('payPanel');
    if (!panel) return;
    panel.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('#pyNew')) return openForm(null);
      if (t.closest('#pyMore')) { shown += 100; return drawMain(); }
      const f = t.closest('[data-py-filter]'); if (f) { filter = f.dataset.pyFilter; shown = 60; return drawMain(); }
      const b = t.closest('[data-py-act]');
      if (b) {
        const id = b.dataset.pyId, a = b.dataset.pyAct;
        if (a === 'ask') { sure = id; return drawMain(); }
        if (a === 'edit') { const o = orders.find((x) => String(x.id) === id); return o && openForm(o); }
        return act(id, a);
      }
      if (!form) return;
      if (t.closest('[data-py-back]')) { form = null; return draw(); }
      const k = t.closest('[data-py-kind]'); if (k) { if (form.kind !== k.dataset.pyKind) { form.kind = k.dataset.pyKind; form.party = ''; form.q = ''; } form.msg = ''; return drawForm(); }
      const p = t.closest('[data-py-party]'); if (p) { form.party = p.dataset.pyParty; form.msg = ''; return drawForm(); }
      const ac = t.closest('[data-py-account]'); if (ac) { form.account = ac.dataset.pyAccount; form.msg = ''; return drawForm(); }
      const s = t.closest('[data-py-step]');
      if (s) {
        if (s.dataset.pyStep === 'confirm') { const msg = check(); form.msg = msg; if (!msg) form.step = 'confirm'; } else { form.step = 'edit'; form.msg = ''; }
        return drawForm();
      }
      const sv = t.closest('[data-py-save]'); if (sv) return save(sv.dataset.pySave === 'approve');
    });
    panel.addEventListener('input', (e) => {
      if (!form) return;
      if (e.target.id === 'pyVQ') {
        form.q = e.target.value;
        const pos = e.target.selectionStart;
        drawForm();
        const q = $('pyVQ'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (x) { /* some inputs have no selection */ } }
      } else if (e.target.id === 'pyAmount') { form.amount = e.target.value; drawSum(); }
      else if (e.target.id === 'pyMemo') form.memo = e.target.value;
    });
    panel.addEventListener('change', (e) => { if (e.target.id === 'pyBox') { box = e.target.value; shown = 60; drawMain(); } });
    $('pyRefresh')?.addEventListener('click', load);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
  // opening the tab starts on the list and reads the latest
  root.AskerPay = { open: () => { form = null; sure = null; load(); draw(); }, orders: () => orders };
})(typeof window === 'undefined' ? globalThis : window);
