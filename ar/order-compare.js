/* «طلب السيستم × مشتريات تاني يوم» (card at the top of «الطلبيات», owner 2026-11-16: «عشان انا متعود على الطلب من على الجهاز، فمش عارف لسه اعتمد عليه»).
   v2 (owner 2026-11-16, later): «ما تقارنش بالامر الشراء اللي انا مسجله على الجهاز … هتقارن بالمشتريات اللي دخلت لك تاني يوم، هتقارن اللي انت حددته من الكميات
   دي بنفسك باللي انا هحدده عن طريق اللي هيخش من مشتريات تاني يوم». Every night the laptop (Hub\orders\ORDER_COMPARE.ps1, read only) takes the bot's order at the
   cut (the automatic lines of the purchase order that were open then) and the supplier invoices entered in the 30 hours after it, sorts each item into
   «ordered and arrived / arrived and not in the bot's order, with the likely reason / in the bot's order and did not arrive», keeps 7 nights and uploads ONE
   file: asker-private/orders/compare2.json. This card only READS it (owner's login; no table, no migration).
   The quantity: the bot's quantity against the packs on the invoice (the free bonus left out). The rate is provisional until the 30 hours are over.
   Nothing here writes anything and nothing is sent. The reason texts are drawn here from a CODE the laptop writes (plus the stock, the bag's name or the
   days), so the English switch (ar/i18n.js) translates them like any other text. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/order-compare.cjs) ----------
  const PATH = 'orders/compare2.json';
  const SLOTS = 7; // the week
  const OLD_HOURS = 36; // the file is rewritten whenever something changes and every 30 minutes; a day and a half old = the laptop is not updating
  const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
  const pctOf = (a, b) => (num(b) > 0 ? Math.round((100 * num(a)) / num(b)) : null);
  const arr = (x) => (Array.isArray(x) ? x.filter((r) => r && typeof r === 'object') : []);
  // «2026-11-16» -> «16/11»
  function dm(d) {
    const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(d || ''));
    return m ? `${m[3]}/${m[2]}` : '';
  }
  // «2026-11-16 00:46» -> «12:46 ص»
  function clock(at) {
    const m = /(\d\d):(\d\d)/.exec(String(at || '').slice(11));
    if (!m) return '';
    const h = Number(m[1]);
    return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'ص' : 'م'}`;
  }
  // the reason of a line: [text, tone]. tone: red = the bot got it wrong, own = something he did, warn = a rule of the bot, gray = a plain fact
  const BAG_TXT = (r) => String(r.bag || '').trim();
  const numText = (x) => String(Math.round(num(x) * 10) / 10);
  const REASONS = {
    // arrived and the bot had no automatic line at the cut
    manual: () => ['إنت حطيته بإيدك في أمر الشرا', 'own'],
    postponed: () => ['إنت أجّلته (نقلته لكل الشركات)', 'own'],
    cancelled_me: () => ['إنت لغيته من أمر الشرا', 'own'],
    closed_auto: () => ['السيستم قفل سطره قبل الطلب (الرصيد رجع أو خرج من الحقيبة)', 'gray'],
    unknown: () => ['السبب مش معروف (اتحسب بعد الطلب بوقت طويل)', 'gray'],
    gs: () => ['في النواقص العامة', 'gray'],
    had_stock: (r) => [r.cover != null ? `رصيده ${numText(r.have)} يكفي ${numText(r.cover)} يوم` : `عنده رصيد ${numText(r.have)}`, 'warn'],
    dup: () => ['ممكن نفس الصنف: مستني قرارك', 'gray'],
    missed: (r) => [BAG_TXT(r) ? `رصيده قليل في ${BAG_TXT(r)} والسيستم ما دخلهوش: محتاج نبص` : 'رصيده قليل والسيستم ما دخلهوش: محتاج نبص', 'red'],
    other_bag: (r) => [BAG_TXT(r) ? `في حقيبة تانية (${BAG_TXT(r)})` : 'في حقيبة تانية', 'gray'],
    no_bag: () => ['مش في أي حقيبة', 'gray'],
    not_short: () => ['مش ظاهر ناقص عند السيستم وقتها', 'gray'],
    // in the bot's order and did not arrive
    carried: (r) => [`سطر قديم من ${String(Math.max(1, Math.round(num(r.days))))} يوم ولسه مفتوح`, 'gray'],
    new: () => ['', 'gray'],
  };
  function reason(r) {
    const f = r && REASONS[r.why];
    return f ? f(r) : [String((r && r.txt) || ''), 'gray'];
  }
  const reasonText = (r) => reason(r)[0];
  const hoursText = (h) => String(Math.max(1, Math.round(num(h))));
  // the second chip of a line: what arrived (the vendor and how long after the cut), or for the bot's lines that did not arrive: still waiting / probably not ordered
  // final = the 30 hours are over
  function arrival(r, final) {
    if (!r) return null;
    if (r.arr) {
      const v = String(r.arr.vendor || '').trim(), h = hoursText(r.arr.h);
      return [v ? `وصل من ${v} بعد ${h} ساعة` : `وصل بعد ${h} ساعة`, 'ok'];
    }
    if (r.why === 'new' || r.why === 'carried') return final ? ['ما وصلش لحد دلوقتي: غالبًا ما اتطلبش', 'warn'] : ['لسه ما وصلش: بنستنى الفواتير', 'gray'];
    return null;
  }
  // the QUANTITY (owner 2026-11-16: «هتقارن اللي انت حددته من الكميات دي بنفسك»): the bot's quantity against the packs of the invoice (arr.q), the free bonus
  // left out. It counts the bot's lines that arrived. A warehouse that sent less shows as a difference too.
  const qtyText = (x) => String(Math.round(num(x) * 10) / 10);
  const countsQty = (r) => !!(r && r.arr && r.arr.q != null && num(r.qty) > 0 && !r.why);
  const qtySame = (r) => Math.round(num(r.qty)) === Math.round(num(r.arr.q));
  function qtyChip(r) {
    if (!countsQty(r)) return null;
    return qtySame(r) ? [`وصل ${qtyText(r.arr.q)}: نفس كمية السيستم`, 'ok'] : [`السيستم ${qtyText(r.qty)} ووصل ${qtyText(r.arr.q)}`, 'warn'];
  }
  // the MONEY (owner 2026-11-16: «نسبتك هتبقا أدق مني وأبقا عارف أنا عديتها بقد إيه»): what he bought in the 24 hours after the bot's order, at cost price, against the
  // night's cap (frozen by the laptop from po_cap.json). The purchases split into what the bot's order accounts for, items that are not in it and packs beyond its quantity.
  const numOrNull = (x) => (x == null || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
  const money = (x) => Math.round(num(x)).toLocaleString('en-US');
  function moneyOf(n) {
    const buy = numOrNull(n && n.buy_value), cap = numOrNull(n && n.cap_money);
    if (buy == null) return null; // an older file: no money
    const both = num(n.both_value), extraQty = Math.min(num(n.extra_qty_value), both);
    return { buy, cap: cap != null && cap > 0 ? cap : null, bot: both - extraQty, extraItems: num(n.extra_items_value), extraQty, misc: num(n.misc_value) };
  }
  // the headline: [text, tone]. A night whose invoices are not all in yet only says how far he is; tone: over (went over) / under / wait
  function capLine(n) {
    const m = n && n.money;
    if (!m || m.cap == null) return null;
    if (!n.final) return [`لحد دلوقتي اشتريت ${money(m.buy)} ج من سقف ${money(m.cap)} ج`, 'wait'];
    const d = Math.round(m.buy - m.cap), p = pctOf(Math.abs(d), m.cap);
    if (d > 0) return [`عدّيت سقف السيستم بـ ${money(d)} ج (${p}%)`, 'over'];
    if (d < 0) return [`كنت تحت سقف السيستم بـ ${money(-d)} ج (${p}%)`, 'under'];
    return ['اشتريت على سقف السيستم بالظبط', 'under'];
  }
  const buyLine = (m) => (!m ? '' : m.cap != null ? `اشتريت ${money(m.buy)} ج بسعر التكلفة، والسقف ${money(m.cap)} ج.` : `اشتريت ${money(m.buy)} ج بسعر التكلفة.`);
  const splitLine = (m) => (!m ? '' : `منها ${money(m.bot)} ج من أمر السيستم، و${money(m.extraItems)} ج أصناف مش في أمره، و${money(m.extraQty)} ج كميات أكتر من أمره.`);
  const miscLine = (m) => (m && m.misc > 0 ? `وغير كده ${money(m.misc)} ج أصناف متنوعة: مش محسوبة.` : '');
  // the week's money: only the nights whose invoices are all in (a night still waiting has bought less than it will) and that have a cap
  function weekMoney(nights) {
    const list = (nights || []).slice(0, SLOTS).filter((n) => n.final && n.money && n.money.cap != null);
    if (!list.length) return null;
    const buy = list.reduce((a, n) => a + n.money.buy, 0), cap = list.reduce((a, n) => a + n.money.cap, 0);
    return { nights: list.length, buy, cap, over: Math.round(buy - cap) };
  }
  function weekMoneyLine(w) {
    if (!w) return '';
    const head = `الأسبوع: اشتريت ${money(w.buy)} ج من سقف ${money(w.cap)} ج (الليالي الكاملة: ${w.nights})`;
    const p = pctOf(Math.abs(w.over), w.cap);
    return w.over > 0 ? `${head}، وعدّيته بـ ${money(w.over)} ج (${p}%).` : w.over < 0 ? `${head}، وكنت تحته بـ ${money(-w.over)} ج (${p}%).` : `${head}: على السقف بالظبط.`;
  }
  // one night as the file carries it: counts are recomputed from the lists, so the numbers and the lists never disagree.
  // arrived = what he bought in the window = in both + arrived only; the bot's order = in both + bot only
  function normNight(n) {
    if (!n || typeof n !== 'object' || !/^\d{4}-\d\d-\d\d$/.test(String(n.night || '')) || n.comparable === false) return null;
    const both = arr(n.both_items), ao = arr(n.arrived_only_items), bo = arr(n.bot_only_items);
    const counted = both.filter(countsQty);
    return {
      night: String(n.night), at: String(n.at || ''), late: !!n.late, final: !!n.final, until: String(n.window_end || ''), manual: num(n.manual),
      both: both.length, arrivedOnly: ao.length, botOnly: bo.length, arrived: both.length + ao.length, bot: both.length + bo.length,
      cover: pctOf(both.length, both.length + ao.length), prec: pctOf(both.length, both.length + bo.length),
      qtyN: counted.length, qtySame: counted.filter(qtySame).length, money: moneyOf(n),
      bothItems: both, arrivedOnlyItems: ao, botOnlyItems: bo,
    };
  }
  // the file must look like what the laptop writes (v2); anything else is treated as «no comparison yet»
  function parseCompare(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.nights)) return null;
    const nights = o.nights.map(normNight).filter(Boolean).sort((a, b) => (a.night < b.night ? 1 : a.night > b.night ? -1 : 0)).slice(0, SLOTS);
    return { generatedAt: o.generated_at || '', nights, week: weekOf(nights) };
  }
  // the week: the nights together (not an average of percentages, so a big night weighs more than a small one)
  function weekOf(nights) {
    const list = (nights || []).slice(0, SLOTS);
    const s = list.reduce((a, n) => ({ arrived: a.arrived + n.arrived, both: a.both + n.both, bot: a.bot + n.bot }), { arrived: 0, both: 0, bot: 0 });
    return { nights: list.length, cover: pctOf(s.both, s.arrived), prec: pctOf(s.both, s.bot) };
  }
  function isOld(generatedAt, now = new Date()) {
    const t = new Date(generatedAt).getTime();
    return !Number.isFinite(t) || now.getTime() - t > OLD_HOURS * 3600e3;
  }
  // the seven slots of the little chart, oldest first (the newest night is the last one filled; the rest are empty)
  function slots(nights) {
    const list = (nights || []).slice(0, SLOTS).slice().reverse();
    return Array.from({ length: SLOTS }, (_, k) => list[k] || null);
  }
  const api = { PATH, SLOTS, OLD_HOURS, dm, clock, reason, reasonText, arrival, qtyChip, countsQty, money, moneyOf, capLine, buyLine, splitLine, miscLine, weekMoney, weekMoneyLine, normNight, parseCompare, weekOf, isOld, slots, pctOf };
  root.AskerOrderCompareLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the card ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let data = null, sel = '', opened = new Set(['ao']), loaded = false;

  const GROUPS = [
    ['ao', '🟠 وصل ومش في أمر السيستم', 'arrivedOnlyItems', true],
    ['bo', '🔵 في أمر السيستم وما وصلش', 'botOnlyItems', true],
    ['both', '🟢 اتطلبوا ووصلوا', 'bothItems', false],
  ];
  function rowHtml(r, withWhy, final) {
    const [txt, tone] = reason(r), a = withWhy ? arrival(r, final) : null, qc = qtyChip(r);
    const qty = r.qty != null && num(r.qty) > 0 ? ` <span class="cmp-qty">× ${esc(String(num(r.qty)))}</span>` : '';
    const inner = `<strong dir="ltr" class="notr">${esc(r.name)}</strong>${qty}${withWhy && txt ? ` <span class="cmp-why ${tone}">${esc(txt)}</span>` : ''}${a ? ` <span class="cmp-why ${a[1]}">${esc(a[0])}</span>` : ''}${qc ? ` <span class="cmp-why ${qc[1]}">${esc(qc[0])}</span>` : ''}`;
    // the item's small photo on the side (ar/item-media.js, owner 2026-11-21)
    return `<div class="cmp-row">${root.AskerItemMedia ? root.AskerItemMedia.row(r.id, r.name, r.name, inner) : inner}</div>`;
  }
  function drawGroups(n) {
    $('cmpGroups').innerHTML = GROUPS.map(([id, title, list, why]) => {
      const rows = n[list];
      return `<details class="cmp-grp ${id}" data-grp="${id}"${opened.has(id) ? ' open' : ''}><summary><span>${title}</span><b>${rows.length}</b></summary>` +
        `<div class="cmp-list">${rows.length ? rows.map((r) => rowHtml(r, why, n.final)).join('') : '<p class="hint">مفيش</p>'}</div></details>`;
    }).join('');
  }
  function drawBars() {
    $('cmpBars').innerHTML = slots(data.nights).map((n) => {
      if (!n) return '<div class="cmp-bar e" aria-hidden="true"><i style="height:6%"></i><span>—</span><small>&nbsp;</small></div>';
      const c = n.cover == null ? 0 : n.cover;
      return `<button type="button" class="cmp-bar${n.night === sel ? ' on' : ''}" data-night="${esc(n.night)}"><i style="height:${Math.max(6, c)}%"></i><span>${n.cover == null ? '—' : esc(c) + '%'}</span><small>${esc(dm(n.night))}</small></button>`;
    }).join('');
  }
  function draw() {
    const box = $('cmpBox');
    if (!box) return;
    box.classList.remove('hidden');
    const n = data && data.nights.find((x) => x.night === sel);
    $('cmpEmpty').classList.toggle('hidden', !!n);
    $('cmpMain').classList.toggle('hidden', !n);
    $('cmpNight').textContent = n ? `ليلة ${dm(n.night)}` : '';
    $('cmpOld').classList.toggle('hidden', !(data && isOld(data.generatedAt)));
    if (!n) return;
    $('cmpSub').textContent = n.at ? `أمر السيستم الساعة ${clock(n.at)} قدام المشتريات اللي دخلت بعده (فواتير تاني يوم)` : 'أمر السيستم قدام المشتريات اللي دخلت بعده (فواتير تاني يوم)';
    $('cmpThree').innerHTML = `<div class="cmp-n g"><b>${esc(n.both)}</b><span>اتطلبوا ووصلوا</span></div><div class="cmp-n o"><b>${esc(n.arrivedOnly)}</b><span>وصل ومش في أمر السيستم</span></div><div class="cmp-n b"><b>${esc(n.botOnly)}</b><span>في أمر السيستم وما وصلش</span></div>`;
    $('cmpBig').textContent = n.cover == null ? '' : `السيستم جاب ${n.cover}% من اللي وصلك`; // one text node, so the English switch can translate it
    $('cmpPrec').textContent = n.prec == null ? '' : `و${n.prec}% من أمر السيستم وصل.`;
    // the rate is final only when the 30 hours for the invoices are over
    const until = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d)/.exec(n.until);
    $('cmpFinal').textContent = n.final ? 'النسبة دي بعد ما شفنا مشتريات تاني يوم.' : until ? `مؤقتة: لسه بنستنى الفواتير لحد ${clock(until[1] + ' ' + until[2])} يوم ${dm(until[1])}.` : '';
    $('cmpQty').classList.toggle('hidden', !n.qtyN);
    $('cmpQty').textContent = n.qtyN ? `الكمية: ${n.qtySame} من ${n.qtyN} صنف وصلوا بنفس كمية السيستم.` : '';
    $('cmpQtyNote').classList.toggle('hidden', !n.qtyN);
    $('cmpLate').classList.toggle('hidden', !n.late);
    $('cmpOutside').classList.toggle('hidden', !n.manual);
    $('cmpOutside').textContent = n.manual ? `وفيه ${n.manual} سطر إنت حطيتهم بإيدك في أمر الشرا: مش محسوبين على السيستم.` : '';
    const w = data.week;
    $('cmpWeek').innerHTML = `<span>الأسبوع: ${esc(w.nights)} من ${SLOTS} ليالي اتقارنت${w.cover == null ? '' : `، والسيستم جاب في المتوسط ${esc(w.cover)}% من اللي وصلك`}.</span>` + (w.nights < SLOTS ? ' <span>لما يكملوا 7 ليالي قرر على أساسهم.</span>' : '');
    // the money: how far he is from the bot's cap, and what the purchases are made of
    const m = n.money, cl = capLine(n);
    $('cmpMoney').classList.toggle('hidden', !m);
    $('cmpCap').className = 'cmp-cap' + (cl ? ' ' + cl[1] : ' hidden');
    $('cmpCap').textContent = cl ? cl[0] : '';
    $('cmpBuy').textContent = buyLine(m);
    $('cmpSplit').textContent = splitLine(m);
    $('cmpMisc').classList.toggle('hidden', !miscLine(m));
    $('cmpMisc').textContent = miscLine(m);
    const wm = weekMoneyLine(weekMoney(data.nights));
    $('cmpWeekMoney').classList.toggle('hidden', !wm);
    $('cmpWeekMoney').textContent = wm;
    drawBars();
    drawGroups(n);
  }
  async function open() {
    if (!$('cmpBox') || !db()) return;
    try {
      const { data: blob, error } = await db().storage.from('asker-private').download(PATH);
      data = error || !blob ? null : parseCompare(JSON.parse(await blob.text()));
    } catch (e) {
      data = null;
    }
    if (data && data.nights.length) {
      if (!data.nights.some((x) => x.night === sel)) sel = data.nights[0].night;
    } else {
      sel = '';
    }
    loaded = true;
    draw();
  }
  $('cmpBars')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-night]');
    if (!b || b.dataset.night === sel) return;
    sel = b.dataset.night;
    draw();
  });
  $('cmpGroups')?.addEventListener('toggle', (e) => {
    const d = e.target.closest && e.target.closest('[data-grp]');
    if (!d) return;
    if (d.open) opened.add(d.dataset.grp); else opened.delete(d.dataset.grp);
  }, true);
  root.AskerOrderCompare = { open, get loaded() { return loaded; } };
})(typeof window !== 'undefined' ? window : globalThis);
