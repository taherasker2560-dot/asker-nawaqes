/* «طلب الجهاز × طلب البوت» (card at the top of «الطلبيات», owner 2026-11-16: «عشان انا متعود على الطلب من على الجهاز، فمش عارف لسه اعتمد عليه»).
   Every night the laptop (Hub\orders\ORDER_COMPARE.ps1, read only) takes the items he ordered on PharmaFly (Items.LastOrderTime) and the
   lines of the bot's purchase order that were open at that moment, sorts each item into «in both / only on the machine / only in the
   bot» with the likely reason, keeps 7 nights and uploads ONE file: asker-private/orders/compare.json. This card only READS it
   (owner's login; no table, no migration). The compared bag is the daily bag «نواقص يوميه»; other bags are counted apart.
   Nothing here writes anything and nothing is sent. The reason texts are drawn here from a CODE the laptop writes (plus the
   stock, the bag's name or the days), so the English switch (ar/i18n.js) translates them like any other text. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/order-compare.cjs) ----------
  const PATH = 'orders/compare.json';
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
  const REASONS = {
    postponed: () => ['إنت أجّلته (نقلته لكل الشركات)', 'own'],
    cancelled_me: () => ['إنت لغيته من أمر الشرا', 'own'],
    closed_auto: () => ['البوت قفل سطره قبل طلبك (الرصيد رجع أو خرج من الحقيبة)', 'gray'],
    unknown: () => ['السبب مش معروف (اتحسب بعد الطلب بوقت طويل)', 'gray'],
    gs: () => ['في النواقص العامة', 'gray'],
    had_stock: (r) => [`عنده رصيد ${String(num(r.have))} (البوت بيطلب الصفر بس)`, 'warn'],
    dup: () => ['ممكن نفس الصنف: مستني قرارك', 'gray'],
    missed: (r) => [BAG_TXT(r) ? `رصيده صفر في ${BAG_TXT(r)} والبوت ما دخلهوش: محتاج نبص` : 'رصيده صفر والبوت ما دخلهوش: محتاج نبص', 'red'],
    other_bag: (r) => [BAG_TXT(r) ? `في حقيبة تانية (${BAG_TXT(r)})` : 'في حقيبة تانية', 'gray'],
    no_bag: () => ['مش في أي حقيبة', 'gray'],
    not_short: () => ['مش ظاهر ناقص عند البوت', 'gray'],
    manual: () => ['إنت حطيته بإيدك في أمر الشرا', 'own'],
    ordered_before: () => ['اتطلب في طلب الليلة اللي فاتت ولسه ما وصلش', 'gray'],
    carried: (r) => [`سطر قديم من ${String(Math.max(1, Math.round(num(r.days))))} يوم ولسه مفتوح`, 'gray'],
    skipped: () => ['البوت طلبه وإنت ما طلبتوش من الجهاز', 'warn'],
  };
  function reason(r) {
    const f = r && REASONS[r.why];
    return f ? f(r) : [String((r && r.txt) || ''), 'gray'];
  }
  const reasonText = (r) => reason(r)[0];
  // one night as the file carries it: counts are recomputed from the lists when they are there, so the numbers and the lists never disagree
  function normNight(n) {
    if (!n || typeof n !== 'object' || !/^\d{4}-\d\d-\d\d$/.test(String(n.night || '')) || n.comparable === false) return null;
    const both = arr(n.both_items), om = arr(n.only_machine_items), ob = arr(n.only_bot_items);
    const machine = both.length + om.length, bot = num(n.bot);
    const bothScope = Math.min(num(n.both_scope), both.length);
    return {
      night: String(n.night), at: String(n.at || ''), late: !!n.late, machine: machine || num(n.machine), bot, outside: num(n.outside),
      both: both.length, onlyMachine: om.length, onlyBot: ob.length,
      cover: pctOf(both.length, machine || num(n.machine)), prec: pctOf(bothScope, bot),
      bothScope, bothItems: both, onlyMachineItems: om, onlyBotItems: ob,
    };
  }
  // the file must look like what the laptop writes; anything else is treated as «no comparison yet»
  function parseCompare(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.nights)) return null;
    const nights = o.nights.map(normNight).filter(Boolean).sort((a, b) => (a.night < b.night ? 1 : a.night > b.night ? -1 : 0)).slice(0, SLOTS);
    return { generatedAt: o.generated_at || '', nights, week: weekOf(nights) };
  }
  // the week: the nights together (not an average of percentages, so a big night weighs more than a small one)
  function weekOf(nights) {
    const list = (nights || []).slice(0, SLOTS);
    const s = list.reduce((a, n) => ({ machine: a.machine + n.machine, both: a.both + n.both, bot: a.bot + n.bot, bothScope: a.bothScope + n.bothScope }), { machine: 0, both: 0, bot: 0, bothScope: 0 });
    return { nights: list.length, cover: pctOf(s.both, s.machine), prec: pctOf(s.bothScope, s.bot) };
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
  const api = { PATH, SLOTS, OLD_HOURS, dm, clock, reason, reasonText, normNight, parseCompare, weekOf, isOld, slots, pctOf };
  root.AskerOrderCompareLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the card ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let data = null, sel = '', opened = new Set(['om']), loaded = false;

  const GROUPS = [
    ['om', '🟠 الجهاز بس: البوت فاته', 'onlyMachineItems', true],
    ['ob', '🔵 البوت بس: إنت ما طلبتوش', 'onlyBotItems', true],
    ['both', '🟢 اتطلبوا في الاتنين', 'bothItems', false],
  ];
  function rowHtml(r, withWhy) {
    const [txt, tone] = reason(r);
    const qty = r.qty != null && num(r.qty) > 0 ? ` <span class="cmp-qty">× ${esc(String(num(r.qty)))}</span>` : '';
    return `<div class="cmp-row"><strong dir="ltr" class="notr">${esc(r.name)}</strong>${qty}${withWhy && txt ? ` <span class="cmp-why ${tone}">${esc(txt)}</span>` : ''}</div>`;
  }
  function drawGroups(n) {
    $('cmpGroups').innerHTML = GROUPS.map(([id, title, list, why]) => {
      const rows = n[list];
      return `<details class="cmp-grp ${id}" data-grp="${id}"${opened.has(id) ? ' open' : ''}><summary><span>${title}</span><b>${rows.length}</b></summary>` +
        `<div class="cmp-list">${rows.length ? rows.map((r) => rowHtml(r, why)).join('') : '<p class="hint">مفيش</p>'}</div></details>`;
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
    $('cmpSub').textContent = n.at ? `طلبك على فارمافلاي الساعة ${clock(n.at)} قدام طلب البوت في نفس الوقت (نواقص يوميه)` : 'طلبك على فارمافلاي قدام طلب البوت في نفس الوقت (نواقص يوميه)';
    $('cmpThree').innerHTML = `<div class="cmp-n g"><b>${esc(n.both)}</b><span>اتطلبوا في الاتنين</span></div><div class="cmp-n o"><b>${esc(n.onlyMachine)}</b><span>الجهاز بس (البوت فاته)</span></div><div class="cmp-n b"><b>${esc(n.onlyBot)}</b><span>البوت بس (إنت ما طلبتوش)</span></div>`;
    $('cmpBig').textContent = n.cover == null ? '' : `البوت جاب ${n.cover}% من اللي طلبته إنت`; // one text node, so the English switch can translate it
    $('cmpPrec').textContent = n.prec == null ? '' : `و${n.prec}% من اللي طلبه البوت إنت طلبته كمان.`;
    $('cmpLate').classList.toggle('hidden', !n.late);
    $('cmpOutside').classList.toggle('hidden', !n.outside);
    $('cmpOutside').textContent = n.outside ? `وفي ${n.outside} صنف تانيين في أمر البوت من حقايب تانية (سرحان / كل الشركات) مش داخلين في المقارنة.` : '';
    const w = data.week;
    $('cmpWeek').innerHTML = `<span>الأسبوع: ${esc(w.nights)} من ${SLOTS} ليالي اتقارنت${w.cover == null ? '' : `، والبوت جاب في المتوسط ${esc(w.cover)}% من طلبك`}.</span>` + (w.nights < SLOTS ? ' <span>لما يكملوا 7 ليالي قرر على أساسهم.</span>' : '');
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
