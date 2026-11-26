/* «🔒 تقفيل اليوم» (owner 2026-11-26: «طيب اعمل تقفيل اليوم», mockup day_close_2026-11-26, his «طيب كمل»): the drawer's closes, shift by shift, from PharmaFly's OWN records, nothing typed by anyone:
   what PharmaFly expected in the drawer, what was counted, and the shortage or overage (counted − expected). All the counted money reaches the main safe (checked on 122 of 122 shifts, 2026-11-26:
   operation 8 corrects a hand-over in two rows), so the counted amount is also «دخل الخزنة الرئيسية». Under it the money that left the day outside the sales (expenses, suppliers, the owner), and a
   «آخر ٣٠ يوم» view with the shifts whose difference reaches his own line (default 50). A shift closed before 06:00 belongs to the day before (the laptop groups them).
   Data (owner only): day/day.json's `closes` (written by the laptop, Hub\day\BUILD_DAY.ps1, read only) + that file's day numbers. Nothing is written from here. */
(function (root) {
  'use strict';
  const D = root.AskerDayLib || (typeof require !== 'undefined' ? require('./day.js') : null);
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const r2 = (x) => Math.round(num(x) * 100) / 100;
  const BIG_DEFAULT = 50;      // the «big difference» line in pounds: his own number, changed on the screen
  // every fixed word the page draws, whole or as a piece next to a number (the English lines are checked against this list in tests/close.cjs)
  const WORDS = ['🔒 التقفيل', '🔒 تقفيل اليوم', 'عجز اليوم', 'زيادة اليوم', 'الدرج مظبوط', 'المفروض', 'اتعدّ', 'واتعدّ', 'دخل الخزنة الرئيسية', 'كل اللي اتعدّ', 'ورديات اليوم', 'عجز', 'زيادة', 'مظبوط',
    'فلوس طلعت برّه البيع', 'مصروفات', 'دفعات للموردين', 'سحب المالك', 'آخر ٣٠ يوم', 'آخر ٣٠ يوم ›', 'عدد الورديات', 'اتعدّ في الورديات', 'صافي الفرق', 'مجموع العجز', 'مجموع الزيادة', 'ورديات الفرق فيها أكتر من',
    'مفيش تقفيل لليوم ده', 'رجوع', 'تحديث', 'الصفحة محتاجة ملف اليوم من اللاب: لسه ما وصلش.', 'ملف التقفيل لسه ما وصلش من اللاب.', 'النهارده', 'امبارح', 'من أسبوع', 'اختار يوم', 'مفيش ورديات بالفرق ده',
    'الوردية اللي بتتقفل بعد نص الليل بتتحسب على اليوم اللي قبلها.', 'اليوم اللي قبله', 'اليوم اللي بعده', 'من ورديات فارما فلاي', 'جنيه', 'من', 'إلى'];

  // ---------- pure helpers (also used by tests/close.cjs) ----------
  // the laptop's closes: { 'YYYY-MM-DD' (business day): [ { s: start, e: end, exp: expected, cnt: counted } ] }
  function parse(o) {
    const out = {};
    for (const [k, v] of Object.entries(o && typeof o === 'object' ? o : {})) {
      if (!/^\d{4}-\d\d-\d\d$/.test(k) || !Array.isArray(v)) continue;
      const list = v.filter((x) => x && x.e).map((x) => ({ s: String(x.s || ''), e: String(x.e), exp: num(x.exp), cnt: num(x.cnt) }));
      if (list.length) out[k] = list;
    }
    return out;
  }
  const diffOf = (sh) => r2(sh.cnt - sh.exp);
  function sum(list) {
    const t = { n: 0, exp: 0, cnt: 0, diff: 0, short: 0, over: 0 };
    for (const sh of list || []) { const d = diffOf(sh); t.n++; t.exp += sh.exp; t.cnt += sh.cnt; t.diff += d; if (d < 0) t.short += -d; else t.over += d; }
    for (const k of ['exp', 'cnt', 'diff', 'short', 'over']) t[k] = r2(t[k]);
    return t;
  }
  // the word of a difference: short, over or right
  const word = (d) => (Math.abs(num(d)) < 0.005 ? { k: 'ok', t: 'مظبوط', v: 0 } : (num(d) < 0 ? { k: 'short', t: 'عجز', v: r2(-d) } : { k: 'over', t: 'زيادة', v: r2(d) }));
  const days = (closes) => Object.keys(closes || {}).sort().reverse();
  // the 30 days up to `to`: the totals and the shifts whose difference reaches the line, newest first
  function month(closes, to, line) {
    const from = D.addDays(to, -29), list = [];
    for (const k of days(closes)) if (k >= from && k <= to) for (const sh of closes[k]) list.push({ ...sh, day: k });
    const t = sum(list);
    const big = list.filter((sh) => Math.abs(diffOf(sh)) >= num(line)).sort((a, b) => b.e.localeCompare(a.e));
    return { from, to, totals: t, big };
  }
  const clockOf = (dt) => D.hm(String(dt || '').slice(11, 16));
  // the day the page opens on: today when it has a close, else the newest day that has one
  const pickDay = (closes, today) => (closes && closes[today] ? today : (days(closes)[0] || today || ''));
  const api = { WORDS, BIG_DEFAULT, parse, diffOf, sum, word, days, month, clockOf, pickDay };
  root.AskerCloseLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const { money, money2, dateText, addDays } = D;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let data = null, closes = {}, picked = '', view = null, big = BIG_DEFAULT;
  try { const v = Number(root.localStorage && root.localStorage.getItem('cl_big')); if (Number.isFinite(v) && v > 0) big = v; } catch (e) { /* a private window: the default stays */ }
  const signed = (d) => (d > 0 ? '+' : '') + money2(d);

  function shiftCard(sh, day) {
    const w = word(diffOf(sh)), bad = w.k === 'short';
    const head = `<div class="dy-a"><span class="cl-w${bad ? ' dy-neg' : ' cl-ok'}">${esc(w.t)}${w.k === 'ok' ? '' : ' <bdi dir="ltr">' + esc(money2(w.v)) + '</bdi>'}</span><b>${day ? esc(dateText(day)) + ' · ' : ''}${day ? esc(clockOf(sh.e)) : 'من <bdi>' + esc(clockOf(sh.s)) + '</bdi> إلى <bdi>' + esc(clockOf(sh.e)) + '</bdi>'}</b></div>`;
    const grid = `<div class="cl-g"><div>المفروض<b>${esc(money2(sh.exp))}</b></div><div>اتعدّ<b>${esc(money2(sh.cnt))}</b></div></div>`;
    return day ? `<button type="button" class="dy-tk cl-sh${bad ? ' cl-bad' : ''}" data-cl-day="${esc(day)}">${head}${grid}</button>` : `<div class="dy-tk dy-static cl-sh${bad ? ' cl-bad' : ''}">${head}${grid}</div>`;
  }
  function dateBar() {
    const all = days(closes), first = all[all.length - 1] || data.today, i = all.indexOf(picked);
    const quick = [['النهارده', data.today], ['امبارح', addDays(data.today, -1)], ['من أسبوع', addDays(data.today, -7)]];
    return `<div class="dy-card"><div class="dy-pick"><button type="button" class="dy-b" data-cl-prev aria-label="اليوم اللي قبله"${i < 0 || i >= all.length - 1 ? ' disabled' : ''}>›</button>` +
      `<label class="dy-date"><span>${esc(dateText(picked))}</span><small>📅 اختار يوم</small><input id="clDate" type="date" min="${esc(first)}" max="${esc(data.today)}" value="${esc(picked)}" aria-label="اختار يوم" /></label>` +
      `<button type="button" class="dy-b" data-cl-next aria-label="اليوم اللي بعده"${i <= 0 ? ' disabled' : ''}>‹</button></div>` +
      `<div class="dy-line">${quick.map(([l, k]) => `<button type="button" class="dy-chip${k === picked ? ' on' : ''}" data-cl-day="${esc(k)}"${closes[k] ? '' : ' disabled'}>${esc(l)}</button>`).join('')}</div><div class="dy-stamp">من ورديات فارما فلاي</div></div>`;
  }
  function drawDay() {
    const main = $('clMain'), list = closes[picked];
    if (!list) { main.innerHTML = dateBar() + '<p class="hint">مفيش تقفيل لليوم ده</p>'; return; }
    const t = sum(list), w = word(t.diff);
    const label = w.k === 'ok' ? 'الدرج مظبوط' : (w.k === 'short' ? 'عجز اليوم' : 'زيادة اليوم');
    const kp = `<div class="dy-grid"><div class="dy-k"><small>${label}</small><b class="${w.k === 'short' ? 'dy-neg' : 'dy-c'}" dir="ltr">${esc(signed(t.diff))}</b><i>المفروض <bdi dir="ltr">${esc(money2(t.exp))}</bdi> واتعدّ <bdi dir="ltr">${esc(money2(t.cnt))}</bdi></i></div>` +
      `<div class="dy-k"><small>دخل الخزنة الرئيسية</small><b class="dy-c" dir="ltr">${esc(money2(t.cnt))}</b><i>كل اللي اتعدّ</i></div></div>`;
    const d = data.days.find((x) => x.date === picked);
    const outs = d ? [d.expenses.length ? 'مصروفات: ' + d.expenses.map((e) => `<span class="notr">${esc(e.name)}</span> <bdi dir="ltr">${esc(money(e.amount))}</bdi>`).join('، ') : '', d.supplierPaid ? `دفعات للموردين: <bdi dir="ltr">${esc(money(d.supplierPaid))}</bdi>` : '', d.ownerOut ? `سحب المالك: <bdi dir="ltr">${esc(money(d.ownerOut))}</bdi>` : ''].filter(Boolean) : [];
    const out = outs.length ? `<h3 class="dy-h">فلوس طلعت برّه البيع</h3><div class="dy-card dy-text">${outs.map((x) => `<div>${x}</div>`).join('')}</div>` : '';
    main.innerHTML = dateBar() + kp + `<h3 class="dy-h">ورديات اليوم</h3>${list.map((sh) => shiftCard(sh)).join('')}${out}<div class="dy-line"><button type="button" class="dy-pill dy-ptap" data-cl-month>آخر ٣٠ يوم ›</button></div><p class="hint">الوردية اللي بتتقفل بعد نص الليل بتتحسب على اليوم اللي قبلها.</p>`;
  }
  function bigRows(m) { return m.big.length ? m.big.map((sh) => shiftCard(sh, sh.day)).join('') : '<p class="hint">مفيش ورديات بالفرق ده</p>'; }
  function drawMonth() {
    const main = $('clMain'), m = month(closes, days(closes)[0] || data.today, big), t = m.totals;
    const line = (l, v, neg) => `<div class="dy-tot"><span>${l}</span><b dir="ltr"${neg ? ' class="dy-neg"' : ''}>${v}</b></div>`;
    main.innerHTML = `<button type="button" class="dy-back" data-cl-back>› رجوع</button><h3 class="dy-h2">آخر ٣٠ يوم</h3><div class="dy-card">` +
      line('عدد الورديات', esc(t.n)) + line('اتعدّ في الورديات', esc(money(t.cnt))) + line('صافي الفرق', esc(signed(t.diff)), t.diff < 0) + line('مجموع العجز', esc(money2(t.short))) + line('مجموع الزيادة', esc(money2(t.over))) + '</div>' +
      `<div class="pf-thr"><label for="clBig">ورديات الفرق فيها أكتر من</label><input id="clBig" type="number" inputmode="decimal" min="0" step="1" value="${esc(big)}" /><span>جنيه</span></div><div id="clRows">${bigRows(m)}</div>`;
  }
  function draw() {
    const main = $('clMain');
    if (!main) return;
    if (!data) { main.innerHTML = '<p class="hint">الصفحة محتاجة ملف اليوم من اللاب: لسه ما وصلش.</p>'; return; }
    if (!days(closes).length) { main.innerHTML = '<p class="hint">ملف التقفيل لسه ما وصلش من اللاب.</p>'; return; }
    if (view === 'month') drawMonth(); else drawDay();
  }
  async function open() {
    bind();
    view = null;
    data = root.AskerDay ? await root.AskerDay.load() : null;
    closes = parse(data && data.closes);
    picked = pickDay(closes, data && data.today);
    draw();
  }
  function go(day) { if (!day) return; picked = day; view = null; draw(); window.scrollTo({ top: 0 }); }
  function bind() {
    const p = $('closePanel');
    if (!p || p.dataset.bound) return;
    p.dataset.bound = '1';
    p.addEventListener('click', (e) => {
      if (!data) return;
      const t = (s) => e.target.closest(s);
      let el;
      if ((el = t('[data-cl-day]'))) { if (!el.disabled) go(el.dataset.clDay); return; }
      if (t('[data-cl-month]')) { view = 'month'; draw(); window.scrollTo({ top: 0 }); return; }
      if (t('[data-cl-back]')) { view = null; draw(); return; }
      const all = days(closes), i = all.indexOf(picked);
      if (t('[data-cl-prev]')) { if (i >= 0 && i < all.length - 1) go(all[i + 1]); return; }
      if (t('[data-cl-next]')) { if (i > 0) go(all[i - 1]); }
    });
    p.addEventListener('input', (e) => {
      if (e.target.id !== 'clBig') return;
      const v = Number(e.target.value);
      if (Number.isFinite(v) && v > 0) { big = v; try { root.localStorage.setItem('cl_big', String(v)); } catch (x) { /* nothing to keep it in */ } }
      $('clRows').innerHTML = bigRows(month(closes, days(closes)[0] || data.today, big));
    });
    p.addEventListener('change', (e) => { if (e.target.id === 'clDate' && e.target.value) go(e.target.value); });
    $('clRefresh')?.addEventListener('click', () => { open(); });
  }
  root.AskerClose = { open };
})(typeof window === 'undefined' ? globalThis : window);
