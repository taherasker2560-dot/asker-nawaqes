/* «الرئيسية»: the quick buttons are his own (owner 2026-11-15, his idea of 11-14: «اقدر من السيستم اشيل النواقص من الرئيسية،
   واحط اي حاجة تانية … لحد 10 12 حاجه يبقوا في الوش»; mockup mockups/home_shortcuts_2026-11-15.html, «أيوه، ابدأ»).
   1) the grid under the numbers shows the sections he picked, up to 12, in his order (the first time: the six it always had);
   2) «✏️ عدّل الزراير» opens a sheet: the ones on the home in their order (▲ ▼ ✕), then every other section by group (+ ضيف);
   3) inside every section a 📌 at the end of its small tabs puts it on the home or takes it off (with «شيله» / «رجّعه»).
   Kept on this phone (localStorage); writes nothing to the server. Staff never see this home (they have their own). */
(function (root) {
  'use strict';
  const MAX = 12;
  const KEY = 'asker-home-buttons';
  const DEFAULT = ['short', 'read', 'drafts', 'docs', 'tempsale', 'stock'];
  // [tab, label, group, icon]: every section a button can open (the tabs of ar/app.js showTab)
  const ALL = [
    ['short', 'النواقص', 'المشتريات', 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'],
    ['read', 'الوارد', 'المشتريات', 'M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 13h5l1 2h4l1-2h5'],
    ['translate', 'الترجمة', 'المشتريات', 'M4 5h8M8 3v2M5 9c1.5 3 4 5 7 6M11 5c-1 4-3.5 7-7 9M13 21l4-9 4 9M14.5 18h5'],
    ['bags', 'الحقائب', 'المشتريات', 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2'],
    ['drafts', 'الطلبيات', 'المشتريات', 'M4 5h2l2 10h10l2-7H7M10 19a1 1 0 1 0 0 .01M17 19a1 1 0 1 0 0 .01'],
    ['docs', 'الفواتير', 'المشتريات', 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5'],
    ['suppliers', 'قوايم المخازن', 'المشتريات', 'M3 21V9l9-5 9 5v12M7 21v-7h10v7M7 17h10'],
    ['stock', 'المخزون', 'المشتريات', 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9'],
    ['count', 'جرد المخزون', 'المشتريات', 'M9 4h6v3H9zM15 6h3v15H6V6h3M9 13l2 2 4-4'],
    ['expiry', 'الصلاحيات', 'المشتريات', 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18'],
    ['customers', 'العملاء', 'الحسابات', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7'],
    ['vendors', 'الموردين', 'الحسابات', 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0 .01M17 19a2 2 0 1 0 0 .01'],
    ['cash', 'الخزن', 'الحسابات', 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h12M16 13h3'],
    ['ops', 'العمليات', 'الحسابات', 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3M5 11a7 7 0 0 0 14 0M12 18v3'],
    ['storeorders', 'الموقع', 'المبيعات', 'M4 9l1.5-5h13L20 9M4 9h16v11H4zM9 20v-6h6v6'],
    ['sales', 'حركة البيع', 'المبيعات', 'M4 19h16M7 16V10M12 16V6M17 16v-4'],
    ['tempsale', 'البيع المؤقت', 'المبيعات', 'M4 7h16v12H4zM8 7V5h8v2M8 12h8M8 15h5'],
    ['care', 'الرسايل', 'خدمة العملاء', 'M4 5h16v11H9l-5 4z'],
  ];
  const LABEL = Object.fromEntries(ALL.map((x) => [x[0], x[1]]));
  const ICON = Object.fromEntries(ALL.map((x) => [x[0], x[3]]));
  const GROUPS = [...new Set(ALL.map((x) => x[2]))];

  // ---------- pure helpers (tests/home-shortcuts.cjs) ----------
  // known sections only, each once, at most 12
  function clean(list) {
    const out = [];
    for (const t of Array.isArray(list) ? list : []) if (LABEL[t] && !out.includes(t) && out.length < MAX) out.push(t);
    return out;
  }
  // what the phone kept; nothing kept (or something broken) = the six the home always had. An empty list is his choice.
  function parse(raw) {
    if (raw == null || raw === '') return DEFAULT.slice();
    try { const v = JSON.parse(raw); return Array.isArray(v) ? clean(v) : DEFAULT.slice(); } catch (e) { return DEFAULT.slice(); }
  }
  // on → off, off → on (at the end); a 13th is refused
  function toggle(list, tab) {
    if (!LABEL[tab]) return { list, changed: false };
    if (list.includes(tab)) return { list: list.filter((t) => t !== tab), changed: true, added: false };
    if (list.length >= MAX) return { list, changed: false, full: true };
    return { list: [...list, tab], changed: true, added: true };
  }
  // one place up (dir -1) or down (+1)
  function move(list, tab, dir) {
    const i = list.indexOf(tab), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const out = list.slice();
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  }
  const api = { MAX, KEY, DEFAULT, ALL, LABEL, clean, parse, toggle, move };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  let mine = DEFAULT.slice();
  try { mine = parse(localStorage.getItem(KEY)); } catch (e) {}
  let current = 'home';
  let toastTimer = 0;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mine)); } catch (e) {} };

  // 1) the home's grid
  function drawHome() {
    const box = document.querySelector('#homePanel .qa');
    if (!box) return;
    box.innerHTML = mine.map((t) => `<button type="button" data-go="${t}">${svg(ICON[t])}<span>${esc(LABEL[t])}</span></button>`).join('');
    box.classList.toggle('qa-none', !mine.length);
  }

  // 3) the 📌 at the end of each row of small tabs (and on top of «الرسايل», which has none)
  function pinRows() {
    const rows = [...document.querySelectorAll('.subbar .chips, .subbar.chips')];
    const care = $('carePanel');
    if (care && !care.querySelector('.qa-pinrow')) {
      const r = document.createElement('div');
      r.className = 'qa-pinrow';
      care.prepend(r);
    }
    if (care) rows.push(care.querySelector('.qa-pinrow'));
    for (const r of rows) {
      if (!r || r.querySelector(':scope > .qa-pin')) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip qa-pin';
      b.dataset.pin = '';
      b.textContent = '📌';
      r.appendChild(b);
    }
  }
  function drawPins() {
    const on = mine.includes(current);
    document.querySelectorAll('.qa-pin').forEach((b) => {
      b.classList.toggle('on-home', on);
      b.setAttribute('aria-pressed', String(on));
      const t = on ? 'في الرئيسية: دوس تشيله' : 'حطه في الرئيسية';
      b.setAttribute('aria-label', t);
      b.title = t;
    });
  }
  function toast(html) {
    let t = $('qaToast');
    if (!t) { t = document.createElement('div'); t.id = 'qaToast'; t.className = 'qa-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.innerHTML = html;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
  }
  function flip(tab, fromPin) {
    const r = toggle(mine, tab);
    if (r.full) {
      toast('<span>الرئيسية مليانة (12 زرار). شيل واحد الأول من «✏️ عدّل الزراير».</span>');
      return;
    }
    if (!r.changed) return;
    mine = r.list;
    save();
    drawHome();
    drawPins();
    if (fromPin) {
      toast(`<span>✅</span> <b>${esc(LABEL[tab])}</b> <span>${r.added ? 'بقى في الرئيسية' : 'اتشال من الرئيسية'}</span> ` +
        `<button type="button" class="small secondary" data-qa-undo="${tab}">${r.added ? 'شيله' : 'رجّعه'}</button>`);
    }
    if ($('qaSheet') && !$('qaSheet').classList.contains('hidden')) drawSheet();
  }

  // 2) «✏️ عدّل الزراير»
  function drawSheet() {
    let sh = $('qaSheet');
    if (!sh) { sh = document.createElement('div'); sh.id = 'qaSheet'; sh.className = 'bg-sheet qa-sheet hidden'; document.body.appendChild(sh); }
    const full = mine.length >= MAX;
    const onRows = mine.map((t, i) => `<div class="qa-row on"><span class="qa-n">${i + 1}</span><span class="qa-l">${esc(LABEL[t])}</span>` +
      `<button type="button" class="qa-b" data-qa-up="${t}" aria-label="لفوق"${i === 0 ? ' disabled' : ''}>▲</button>` +
      `<button type="button" class="qa-b" data-qa-down="${t}" aria-label="لتحت"${i === mine.length - 1 ? ' disabled' : ''}>▼</button>` +
      `<button type="button" class="qa-b qa-x" data-qa-flip="${t}" aria-label="شيل">✕</button></div>`).join('');
    const rest = GROUPS.map((g) => {
      const rows = ALL.filter((x) => x[2] === g && !mine.includes(x[0]));
      if (!rows.length) return '';
      return `<h4>${esc(g)}</h4>` + rows.map(([t, l]) => `<div class="qa-row"><span class="qa-l">${esc(l)}</span>` +
        `<button type="button" class="small qa-add" data-qa-flip="${t}"${full ? ' disabled' : ''}>+ ضيف</button></div>`).join('');
    }).join('');
    sh.innerHTML = `<div class="bg-sheet-in qa-sheet-in" role="dialog" aria-label="زراير الرئيسية">` +
      `<h3><span>زراير الرئيسية</span> <small>${mine.length} من 12 زرار</small></h3>` +
      `<p class="hint">اللي هنا ظاهر في الرئيسية بالترتيب ده: الأسهم بترتّبهم، و✕ بيشيل الزرار.</p>` +
      (onRows || '<p class="hint">مفيش زراير في الرئيسية. ضيف من تحت.</p>') +
      (rest ? `<h3 class="qa-more">ضيف من الأقسام</h3>` + (full ? '<p class="hint">الرئيسية فيها 12 زرار. شيل واحد الأول عشان تضيف.</p>' : '') + rest : '') +
      `<div class="bg-sheet-btns"><button type="button" id="qaDone">تمام</button><button type="button" class="secondary" id="qaReset">رجّع الأصلي</button></div></div>`;
  }
  function openSheet() { drawSheet(); $('qaSheet').classList.remove('hidden'); }
  function closeSheet() { $('qaSheet')?.classList.add('hidden'); }

  function onClick(e) {
    const t = e.target;
    if (t.closest('#qaEdit')) return openSheet();
    if (t.closest('[data-pin]')) return flip(current, true);
    const u = t.closest('[data-qa-undo]');
    if (u) { $('qaToast').hidden = true; return flip(u.dataset.qaUndo, false); }
    const sh = $('qaSheet');
    if (!sh || !sh.contains(t)) return;
    if (t === sh || t.closest('#qaDone')) return closeSheet();
    if (t.closest('#qaReset')) { mine = DEFAULT.slice(); save(); drawHome(); drawPins(); return drawSheet(); }
    const up = t.closest('[data-qa-up]'), down = t.closest('[data-qa-down]'), f = t.closest('[data-qa-flip]');
    if (up || down) { mine = move(mine, (up || down).dataset[up ? 'qaUp' : 'qaDown'], up ? -1 : 1); save(); drawHome(); return drawSheet(); }
    if (f) return flip(f.dataset.qaFlip, false);
  }
  // ar/app.js tells us each tab it opens (the 📌 shows whether that section is on the home)
  function onTab(tab) { current = tab; drawPins(); }

  function start() {
    drawHome();
    pinRows();
    drawPins();
    document.addEventListener('click', onClick);
  }
  Object.assign(api, { onTab, open: openSheet, mine: () => mine.slice() });
  root.AskerShortcuts = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window === 'undefined' ? globalThis : window);
