/* «💊 مزمن» (owner 2026-11-16, idea 5: «تنبيه مزمن للعملا ده مهم»): the credit customers who buy the SAME item again and again at a steady gap
   (a chronic medicine) and whose next refill is late: a reminder for him to call or write to them, before they go to another pharmacy.
   Data: asker-private/chronic/chronic.json from the laptop (Hub\chronic\BUILD_CHRONIC.ps1, read only on PharmaFly's copy, rebuilt every few hours;
   owner only). A chip in «العملاء» (the list is drawn by ar/customers.js with listHtml here) and a row on the home. Nothing is sent from here:
   «رسالة» opens WhatsApp (or copies) a polite message and he sends it himself. «✓ خلصنا» hides a customer's lines on this phone until he buys
   again or 14 days pass. A cash customer has no name, so he is not here. */
(function (root) {
  'use strict';
  const PATH = 'chronic/chronic.json';
  const KEY = 'asker-chron-done';      // this phone: { "customer|item": { last, at } }
  const SNOOZE_DAYS = 14;
  const OLD_HOURS = 72;                // a file the laptop stopped updating is not trusted (its «days late» would be old)
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

  // ---------- pure helpers (also used by tests/chronic.cjs) ----------
  // the file must look like what the laptop writes; anything else is «no chronic data»
  const mapRows = (list) => (Array.isArray(list) ? list : []).filter((x) => x && x.c != null && x.i != null && x.n).map((x) => ({
    c: num(x.c), i: num(x.i), n: String(x.n), gap: num(x.gap), times: num(x.times), q: num(x.q), have: num(x.have), last: String(x.last || ''), since: num(x.since),
  }));
  function parse(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.rows)) return null;
    // rows = the late ones; regular = every item a customer buys at a steady gap and still buys (late or not): «الأصناف اللي هو متعود ياخدها» (owner 2026-11-16)
    return { generatedAt: String(o.generated_at || ''), dataAt: String(o.data_at || ''), rows: mapRows(o.rows), regular: mapRows(o.regular) };
  }
  // where a regular item stands today: the days since the last refill, the days to the next one (the usual gap minus the days since; negative = late), and its state:
  // «late» (the laptop's own rule: 1.15 gaps, at least 3 days more than the gap), «soon» (due within 5 days), «ok»
  function standing(r, now) {
    const s = sinceDays(r, now), since = s == null ? r.since : s;
    const due = Math.round(r.gap - since);
    const lateAt = Math.max(1.15 * r.gap, r.gap + 3);
    return { since, due, state: since >= lateAt ? 'late' : due <= 5 ? 'soon' : 'ok' };
  }
  // all the regular items by customer: the ones that are late first, then the soonest due; a customer with a late item first, then the one whose next refill is nearest
  function regularGroups(rows, now) {
    const by = new Map();
    for (const r of rows || []) { if (!by.has(r.c)) by.set(r.c, []); by.get(r.c).push({ ...r, ...standing(r, now) }); }
    const out = [...by.entries()].map(([c, list]) => ({ c, rows: list.sort((a, b) => a.due - b.due || a.n.localeCompare(b.n)) }));
    return out.sort((a, b) => a.rows[0].due - b.rows[0].due || b.rows.length - a.rows.length || a.c - b.c);
  }
  function isOld(generatedAt, now) {
    const t = new Date(generatedAt).getTime();
    return !Number.isFinite(t) || (now || new Date()).getTime() - t > OLD_HOURS * 3600e3;
  }
  // days since the last refill, from its date (always today's number, whenever the file was written)
  function sinceDays(r, now) {
    const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(r.last || '');
    if (!m) return null;
    const n = now || new Date();
    return Math.floor((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(+m[1], +m[2] - 1, +m[3])) / 864e5);
  }
  const keyOf = (r) => `${r.c}|${r.i}`;
  // «✓ خلصنا» hides the line while the last refill is the same one and less than 14 days passed; a new refill or two weeks bring it back
  function isSnoozed(done, r, now) {
    const s = done && done[keyOf(r)];
    return !!s && s.last === r.last && (now || new Date()).getTime() - num(s.at) < SNOOZE_DAYS * 864e5;
  }
  // the lines not hidden, grouped by customer in the order of the file (the ones that just became late first)
  function groups(rows, done, now) {
    const by = new Map();
    for (const r of rows || []) {
      if (isSnoozed(done, r, now)) continue;
      if (!by.has(r.c)) by.set(r.c, []);
      by.get(r.c).push(r);
    }
    return [...by.entries()].map(([c, list]) => ({ c, rows: list }));
  }
  // the name he is called by: no phone number, no brackets, no title («د/عبدالفتاح على» -> «عبدالفتاح»)
  const TITLES = new Set(['د', 'دكتور', 'الدكتور', 'د.', 'م', 'مهندس', 'المهندس', 'استاذ', 'أستاذ', 'الأستاذ', 'الاستاذ', 'حاج', 'الحاج', 'ا', 'أ']);
  function firstName(name) {
    const s = String(name || '').replace(/\(.*?\)/g, ' ').replace(/[0-9٠-٩+]+/g, ' ');
    for (let tok of s.split(/[\s_]+/)) {
      if (tok.includes('/')) { const p = tok.split('/').filter(Boolean); tok = (p.length > 1 && TITLES.has(p[0]) ? p[1] : p[0]) || ''; }   // «د/سامي» -> سامي, «رامي/موقوف» -> رامي
      tok = tok.replace(/[-.,:;]+/g, '');
      if (tok && !TITLES.has(tok)) return tok;
    }
    return '';
  }
  // «علبة» wording of what he took last time
  const fmt = (n) => { const v = Math.round(num(n) * 10) / 10; return String(v).replace(/\.0$/, ''); };
  // the message he sends himself: polite, the medicines by name, an offer to get them ready
  function message(name, items) {
    const f = firstName(name);
    return [
      f ? `أهلًا يا ${f} 🌷` : 'أهلًا بحضرتك 🌷',
      `ده من صيدلية عسكر. أدويتك اللي بتاخدها بانتظام (${items.join('، ')}) ميعادها عدّى.`,
      'تحب نجهّزها لك؟',
    ].join('\n');
  }
  const api = { PATH, KEY, SNOOZE_DAYS, parse, isOld, sinceDays, keyOf, isSnoozed, groups, firstName, message, fmt, standing, regularGroups };
  root.AskerChronicLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let data = null, loading = null, loadedAt = 0, arName = new Map();
  const readDone = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
  const writeDone = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private window: it stays until the page is closed */ } };

  const usable = () => !!data && !isOld(data.generatedAt);
  const visible = () => (usable() ? groups(data.rows, readDone(), new Date()) : []);
  async function load(force) {
    if (!db()) return data;
    if (loading) return loading;
    if (data && !force && Date.now() - loadedAt < 30 * 60e3) return data;
    loading = (async () => {
      try {
        const { data: blob, error } = await db().storage.from('asker-private').download(PATH);
        if (error || !blob) { data = null; return data; }
        data = parse(JSON.parse(await blob.text()));
        loadedAt = Date.now();
        try {
          const rows = root.AskerStock ? await root.AskerStock.ensure() : [];
          arName = new Map((rows || []).filter((r) => String(r.arabic_name || '').trim()).map((r) => [Number(r.item_id), String(r.arabic_name).trim()]));
        } catch (e) { /* the English names stay */ }
      } catch (e) {
        data = null;
      } finally {
        loading = null;
      }
      return data;
    })();
    return loading;
  }
  // how many customers have a late refill that is not hidden (the chip and the home row)
  const count = () => visible().length;
  // the names to say to the customer: the Arabic name when the bot has it, else the item's own
  const nameOf = (r) => arName.get(r.i) || r.n;
  // «خلصنا» for a customer: every line of his that shows now is hidden until his next refill or 14 days
  function snooze(customerId) {
    const done = readDone(), now = Date.now();
    for (const r of data ? data.rows : []) if (String(r.c) === String(customerId)) done[keyOf(r)] = { last: r.last, at: now };
    // old entries (a different last refill, or older than the snooze) are dropped so the key does not grow
    for (const k of Object.keys(done)) if (!done[k] || now - num(done[k].at) >= SNOOZE_DAYS * 864e5) delete done[k];
    writeDone(done);
  }
  // the lines of one customer that show now
  const rowsOf = (customerId) => { const g = visible().find((x) => String(x.c) === String(customerId)); return g ? g.rows : []; };
  const messageFor = (customerName, customerId) => message(customerName, rowsOf(customerId).map(nameOf));

  // the customer cards for «العملاء ← 💊 مزمن»: `list` = the customers (ar_customers rows, already filtered by his search); h = { money, hasPhone, isStopped }
  function listHtml(list, h) {
    const byId = new Map((list || []).map((c) => [String(c.id), c]));
    const now = new Date();
    const cards = [];
    for (const g of visible()) {
      const c = byId.get(String(g.c));
      if (!c) continue;
      const owed = num(c.balance) > 0.5 ? `<span class="cu-amt owe">${esc(`عليه ${h.money(c.balance)} ج`)}</span>` : '';
      const items = g.rows.map((r) => {
        const ar = arName.get(r.i);
        const took = r.q >= 0.95 ? `أخد ${fmt(r.q)} علبة` : 'أخد أقل من علبة';
        const stock = r.have > 0 ? `<span class="pill good">${esc(`عندك ${fmt(r.have)}`)}</span>` : '<span class="pill bad">خلص من عندك</span>';
        return `<div class="cu-chron-it"><b class="notr" dir="auto">${esc(ar || r.n)}</b>${ar ? `<small class="ni-meta notr" dir="ltr">${esc(r.n)}</small>` : ''}` +
          `<small class="ni-meta"><span>${esc(`بياخده كل ${fmt(r.gap)} يوم (${fmt(r.times)} مرة)`)}</span> <span>${esc(`آخر مرة من ${sinceDays(r, now)} يوم`)}</span> <span>${esc(took)}</span> ${stock}</small></div>`;
      }).join('');
      cards.push(`<div class="cu-oldrow cu-chron"><div class="cu-chron-top"><button type="button" class="linklike notr" data-cu="${esc(c.id)}">${esc(c.name)}${h.hasPhone(c.id) ? ' 📱' : ''}${h.isStopped(c.id) ? ' ⛔' : ''}</button>${owed}</div>${items}` +
        `<div class="cu-oldact"><button type="button" class="small" data-cu-chron="${esc(c.id)}"><span>رسالة</span>${h.hasPhone(c.id) ? ' 📱' : ''}</button><button type="button" class="small secondary" data-cu-chron-done="${esc(c.id)}">✓ خلصنا</button></div></div>`);
    }
    return { html: cards.join(''), n: cards.length };
  }
  // «كل المعتادين» (owner 2026-11-16: «لستة بالاصناف اللي هو متعود ياخدها»): every customer with the items he is used to taking, late or not, the nearest next refill first
  const allGroups = () => (usable() ? regularGroups(data.regular, new Date()) : []);
  const allCount = () => allGroups().length;
  function listAllHtml(list, h) {
    const byId = new Map((list || []).map((c) => [String(c.id), c]));
    const cards = [];
    for (const g of allGroups()) {
      const c = byId.get(String(g.c));
      if (!c) continue;
      const owed = num(c.balance) > 0.5 ? `<span class="cu-amt owe">${esc(`عليه ${h.money(c.balance)} ج`)}</span>` : '';
      const items = g.rows.map((r) => {
        const ar = arName.get(r.i);
        const next = r.state === 'late' ? `<span class="pill bad">${esc(`متأخر ${Math.abs(r.due)} يوم`)}</span>` : r.due <= 0 ? '<span class="pill warn">الجاي النهارده</span>'
          : `<span class="pill ${r.state === 'soon' ? 'warn' : 'good'}">${esc(`الجاي كمان ${r.due} يوم`)}</span>`;
        const stock = r.have > 0 ? `<span class="pill good">${esc(`عندك ${fmt(r.have)}`)}</span>` : '<span class="pill bad">خلص من عندك</span>';
        return `<div class="cu-chron-it"><b class="notr" dir="auto">${esc(ar || r.n)}</b>${ar ? `<small class="ni-meta notr" dir="ltr">${esc(r.n)}</small>` : ''}` +
          `<small class="ni-meta"><span>${esc(`بياخده كل ${fmt(r.gap)} يوم (${fmt(r.times)} مرة)`)}</span> <span>${esc(`آخر مرة من ${r.since} يوم`)}</span> ${next} ${stock}</small></div>`;
      }).join('');
      cards.push(`<div class="cu-oldrow cu-chron"><div class="cu-chron-top"><button type="button" class="linklike notr" data-cu="${esc(c.id)}">${esc(c.name)}${h.hasPhone(c.id) ? ' 📱' : ''}${h.isStopped(c.id) ? ' ⛔' : ''}</button>${owed}</div>${items}</div>`);
    }
    return { html: cards.join(''), n: cards.length };
  }
  root.AskerChronic = { load, data: () => data, count, listHtml, listAllHtml, allCount, snooze, rowsOf, messageFor, loaded: () => !!data };
})(typeof window === 'undefined' ? globalThis : window);
