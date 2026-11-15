/* «الحسابات ← الخزن» (owner 2026-11-15: «عايز اعمل مكان للخزن، نفس الخزن اللي عندي في السيستم بتاعي في فارما فلاي»).
   PharmaFly's cash boxes with the balance now, today's in and out, and each box's statement (newest first, by day, with the balance
   after every move). The numbers come from the laptop's hub (Store\SYNC_CASH.ps1 → ar_cash_accounts / ar_cash_moves, migration
   202611151900, the last 365 days); the drawer's cash sales are ONE row a day. Read by the OWNER only (money): the database
   refuses everyone else. Nothing here writes anywhere. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/cash.cjs) ----------
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  function money(n) {
    const v = Math.abs(num(n)) < 0.005 ? 0 : num(n);
    const frac = Math.abs(v % 1) > 0.005;
    return v.toLocaleString('en-US', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
  }
  // +1,250 / −300 (the minus is a real minus sign so a number never reads as a dash)
  const signed = (n) => (num(n) > 0.004 ? '+' : num(n) < -0.004 ? '−' : '') + money(Math.abs(num(n)));
  // what a move is, in words: {text, who, small}
  const WORD = {
    sales: 'مبيعات نقدي', customer: 'تحصيل من عميل', vendor: 'دفعة لمورد', drawer_out: 'تسليم الدرج للخزينة', drawer_in: 'استلام من الدرج',
    transfer_out: 'تحويل لخزنة', transfer_in: 'تحويل من خزنة', expense: 'مصروف', other_in: 'حركة داخلة', other_out: 'حركة خارجة',
  };
  function label(m) {
    const word = WORD[m.kind] || 'حركة';
    const small = [];
    if (m.kind === 'sales' && m.n) small.push(`${m.n} بيعة`);
    if (m.memo) small.push(m.memo);
    if ((m.kind === 'other_in' || m.kind === 'other_out') && m.op) small.push(`رقم ${m.op}`);
    return { word, who: m.who || '', small: small.join(' · ') };
  }
  const isTransfer = (k) => k === 'transfer_in' || k === 'transfer_out' || k === 'drawer_in' || k === 'drawer_out';
  const FILTERS = [['all', 'الكل'], ['in', 'داخل'], ['out', 'خارج'], ['sales', 'مبيعات'], ['transfer', 'تحويلات'], ['expense', 'مصاريف']];
  function keep(m, f) {
    if (f === 'in') return num(m.amount) > 0;
    if (f === 'out') return num(m.amount) < 0;
    if (f === 'sales') return m.kind === 'sales';
    if (f === 'transfer') return isTransfer(m.kind);
    if (f === 'expense') return m.kind === 'expense';
    return true;
  }
  const byNewest = (a, b) => String(b.at).localeCompare(String(a.at)) || num(b.id) - num(a.id);
  // the box's moves newest first, each with «after»: the balance after it (counted back from the balance now; only valid when
  // the list holds the newest moves, which is how it is loaded)
  function withBalance(moves, balanceNow) {
    let bal = num(balanceNow);
    return [...(moves || [])].sort(byNewest).map((m) => {
      const out = { ...m, after: Math.round(bal * 100) / 100 };
      bal -= num(m.amount);
      return out;
    });
  }
  const dayOf = (at) => String(at || '').slice(0, 10);
  // moves grouped by day (newest first): [{day, net, moves}]
  function byDay(moves) {
    const out = [];
    for (const m of moves) {
      const d = dayOf(m.at);
      let g = out[out.length - 1];
      if (!g || g.day !== d) { g = { day: d, net: 0, moves: [] }; out.push(g); }
      g.net += num(m.amount);
      g.moves.push(m);
    }
    return out;
  }
  // today's in and out of every box: {accountId: {in, out}}
  function todayTotals(moves) {
    const t = {};
    for (const m of moves || []) {
      const x = (t[m.account_id] = t[m.account_id] || { in: 0, out: 0 });
      if (num(m.amount) >= 0) x.in += num(m.amount); else x.out += -num(m.amount);
    }
    return t;
  }
  const sumBalance = (accounts) => (accounts || []).reduce((s, a) => s + num(a.balance), 0);
  const pad = (n) => String(n).padStart(2, '0');
  // «اليوم» / «امبارح» / «12/11» for a day title (yyyy-mm-dd), counted on the phone's own calendar
  function dayTitle(day, now) {
    const d = new Date(now || Date.now());
    const mk = (x) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
    if (day === mk(d)) return 'النهارده';
    d.setDate(d.getDate() - 1);
    if (day === mk(d)) return 'امبارح';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(day || '');
  }
  const clock = (at) => { const m = /T(\d{2}):(\d{2})/.exec(String(at || '')); return m ? `${m[1]}:${m[2]}` : ''; };
  const api = { money, signed, label, keep, withBalance, byDay, todayTotals, sumBalance, dayTitle, clock, isTransfer, FILTERS, WORD };
  root.AskerCashLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the screen ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let accounts = [], today = [], open = null, moves = [], filter = 'all', loading = false, note = '';
  const startOfToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00`; };
  const cls = (n) => (num(n) < -0.004 ? 'neg' : 'pos');

  function lastText(at) {
    if (!at) return 'مفيش حركات';
    return `آخر حركة ${dayTitle(dayOf(at))} ${clock(at)}`.trim();
  }
  function drawList() {
    const box = $('csList');
    if (!box) return;
    if (!accounts.length) { box.innerHTML = note ? '' : '<p class="hint">مفيش خزن لسه. اللاب بيبعتها كل شوية.</p>'; return; }
    const tt = todayTotals(today);
    box.innerHTML = `<div class="cs-total"><span>مجموع الأرصدة</span><b class="${cls(sumBalance(accounts))}">${esc(money(sumBalance(accounts)))} ج</b></div>` +
      accounts.map((a) => {
        const x = tt[a.id];
        return `<button type="button" class="cs-box" data-cs-open="${esc(a.id)}"><span class="cs-main"><strong class="notr">${esc(a.name)}</strong>` +
          `<small>${esc(lastText(a.last_at))}</small>` +
          (x && (x.in || x.out) ? `<small class="cs-today">النهارده: داخل ${esc(money(x.in))} · خارج ${esc(money(x.out))}</small>` : '') + '</span>' +
          `<span class="cs-amt ${cls(a.balance)}">${esc(money(a.balance))} ج</span></button>`;
      }).join('');
  }
  function drawStatement() {
    const box = $('csStatement');
    if (!box) return;
    const a = accounts.find((x) => String(x.id) === String(open));
    if (!a) { box.innerHTML = ''; return; }
    const all = withBalance(moves, a.balance);
    const shown = all.filter((m) => keep(m, filter));
    const td = startOfToday().slice(0, 10);
    const tin = all.filter((m) => dayOf(m.at) === td && num(m.amount) > 0).reduce((s, m) => s + num(m.amount), 0);
    const tout = all.filter((m) => dayOf(m.at) === td && num(m.amount) < 0).reduce((s, m) => s - num(m.amount), 0);
    box.innerHTML = `<div class="cs-head"><button type="button" class="secondary small" data-cs-back>رجوع</button><strong class="notr">${esc(a.name)}</strong></div>` +
      `<div class="cs-now"><span>الرصيد دلوقتي</span><b class="${cls(a.balance)}">${esc(money(a.balance))} ج</b></div>` +
      `<div class="cs-sum"><span>النهارده داخل <b class="pos">${esc(money(tin))}</b></span><span>خارج <b class="neg">${esc(money(tout))}</b></span></div>` +
      `<div class="chips cs-filters" role="group" aria-label="نوع الحركة">${FILTERS.map(([k, t]) => `<button type="button" class="chip${filter === k ? ' on' : ''}" data-cs-filter="${k}">${esc(t)}</button>`).join('')}</div>` +
      (shown.length ? byDay(shown).map((g) => `<div class="cs-day"><h4>${esc(dayTitle(g.day))} <small class="${cls(g.net)}"><bdi dir="ltr">${esc(signed(g.net))}</bdi></small></h4>` +
        g.moves.map((m) => {
          const l = label(m);
          return `<div class="cs-move"><span class="cs-t">${esc(clock(m.at))}</span><span class="cs-w"><b>${esc(l.word)}${l.who ? ' <bdi class="notr">' + esc(l.who) + '</bdi>' : ''}</b>` +
            (l.small ? `<small>${m.memo ? '<bdi class="notr">' + esc(l.small) + '</bdi>' : esc(l.small)}</small>` : '') + '</span>' +
            `<span class="cs-a"><b class="${cls(m.amount)}"><bdi dir="ltr">${esc(signed(m.amount))}</bdi></b><small>${esc(money(m.after))}</small></span></div>`;
        }).join('') + '</div>').join('') : '<p class="hint">مفيش حركات بالنوع ده في آخر حركات الخزنة.</p>') +
      (moves.length >= 400 ? '<p class="hint">ده آخر 400 حركة بس.</p>' : '');
  }
  function draw() {
    const st = $('csStatus');
    if (st) { st.textContent = note; st.className = note ? 'status bad' : 'status'; }
    $('csList')?.classList.toggle('hidden', open != null);
    $('csStatement')?.classList.toggle('hidden', open == null);
    if (open == null) drawList(); else drawStatement();
  }
  const unavailable = (e) => /schema cache|does not exist|Could not find|relation/i.test(String(e && (e.message || e)));
  async function load() {
    if (loading || !db()) return;
    loading = true;
    try {
      const [a, t] = await Promise.all([
        db().from('ar_cash_accounts').select('id,name,type,balance,last_at').order('id'),
        db().from('ar_cash_moves').select('id,account_id,at,amount').gte('at', startOfToday()).limit(2000),
      ]);
      if (a.error) throw a.error;
      if (t.error) throw t.error;
      accounts = a.data || []; today = t.data || []; note = '';
      if (open != null) await loadMoves();
    } catch (e) {
      accounts = []; today = [];
      note = unavailable(e) ? 'الخزن لسه مش متاحة: محتاجة تفعيل على السيرفر الأول.' : 'مقدرتش أجيب الخزن: ' + (e && e.message);
    } finally { loading = false; draw(); }
  }
  async function loadMoves() {
    const { data, error } = await db().from('ar_cash_moves').select('id,account_id,at,op,kind,amount,who,memo,n').eq('account_id', open).order('at', { ascending: false }).order('id', { ascending: false }).limit(400);
    if (error) { note = 'مقدرتش أجيب الحركات: ' + error.message; moves = []; return; }
    moves = data || []; note = '';
  }
  async function openBox(id) {
    open = Number(id); filter = 'all'; moves = []; draw();
    try { await loadMoves(); } catch (e) { note = 'مقدرتش أجيب الحركات: ' + (e && e.message); }
    draw();
    root.scrollTo && root.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function bind() {
    $('cashPanel')?.addEventListener('click', (e) => {
      const o = e.target.closest('[data-cs-open]'); if (o) return openBox(o.dataset.csOpen);
      if (e.target.closest('[data-cs-back]')) { open = null; draw(); return; }
      const f = e.target.closest('[data-cs-filter]'); if (f) { filter = f.dataset.csFilter; draw(); }
    });
    $('csRefresh')?.addEventListener('click', load);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
  // opening the tab always starts on the list (and reads the latest)
  root.AskerCash = { open: () => { open = null; load(); draw(); }, list: () => accounts };
})(typeof window === 'undefined' ? globalThis : window);
