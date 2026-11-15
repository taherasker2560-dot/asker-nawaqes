/* The alerts (owner 2026-11-12: «جهز مكان مناسب للتنبيهات بتاعة الاكسبير والصلاحيات المتلخبطة بسبب البيع وحدود العملا …
   اعملها كل حاجة في القسم الأنسب ليها»). The laptop (Hub\alerts\BUILD_ALERTS.ps1, read only on PharmaFly) writes
   asker-private/alerts/alerts.json every hour; this file only READS it (owner's login).
     «المشتريات ← مخزون ← الصلاحيات»: today's PharmaFly tasks (a sale took the wrong expiry = the batches' dates are mixed up;
        sold with no stock; sold expired), expired stock still on the system (outside the damaged store), and what expires
        within 3 months. Each item with its batches now, so it can be fixed in PharmaFly by hand (nothing is changed here).
     «الحسابات ← العملاء»: customers above their credit limit and close to it (balance by the verified rule).
     «الرئيسية»: the «محتاج شغل» card (ar/notify.js adds the incoming, the invoices and the store orders to it).
     «المشتريات ← نواقص ← الحقائب» (owner 2026-11-15, VISION A «one line per forgotten bag»): the shortages of every bag
        except «نواقص يوميه» (PharmaFly's own bag rule, without the general shortages and the postponed, only what sold in
        the last month or has a minimum). One home line per bag; an item short more than 7 days in a row makes it late. */
(function (root) {
  'use strict';
  const PATH = 'alerts/alerts.json';
  const OLD_HOURS = 30;

  // ---------- pure helpers (also used by tests/alerts.cjs) ----------
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const money = (n) => String(Math.round(num(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // «2026-06-28» -> «06/2026»
  const monthOf = (d) => { const m = /^(\d{4})-(\d\d)/.exec(String(d || '')); return m ? `${m[2]}/${m[1]}` : 'من غير صلاحية'; };
  // «2026-11-11T22:34:52» -> «10:34 م» today, «امبارح 10:34 م», «10/11 10:34 م»
  function when(iso, dayStartIso) {
    const t = new Date(iso);
    if (isNaN(t)) return '';
    const h = t.getHours(), clock = (h % 12 || 12) + ':' + String(t.getMinutes()).padStart(2, '0') + (h < 12 ? ' ص' : ' م');
    const start = new Date(dayStartIso);
    if (!isNaN(start) && t >= start) return clock;
    if (!isNaN(start) && t >= new Date(start.getTime() - 864e5)) return 'امبارح ' + clock;
    return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')} ${clock}`;
  }
  // a batch: «07/2028: 2 علبة» (+ the store when it is not the main one)
  function batchText(b, qtyText, parts) {
    const q = qtyText ? qtyText(b.packs, b.units, parts) : `${num(b.packs)} علبة` + (num(b.units) ? ` و${num(b.units)} شريط` : '');
    const store = b.store && b.store !== 1 ? ` (${String(b.store_name || 'مخزن ' + b.store).replace(/^مخزن\s*/, '')})` : '';
    return `${monthOf(b.exp)}: ${q}${store}`;
  }
  // «2026-10-25» -> «25/10» in the year of `ref`, else «02/11/2025»
  function dayText(d, ref) {
    const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(d || ''));
    if (!m) return '';
    return `${m[3]}/${m[2]}` + (String(ref || '').slice(0, 4) === m[1] ? '' : `/${m[1]}`);
  }
  // the bags (absent in a file from before 2026-11-15: null = not counted yet). Since the afternoon of 2026-11-15 the file has
  // every bag, «نواقص يوميه» (2428) and «نواقص كل الشركات» ('pv') included, with all their short items; `home` = a bag that gets a
  // home line, counting only what sold in the month or has a minimum (older files: every bag, already counted so)
  const sells = (i) => num(i.sold30) > 0 || num(i.min) > 0;
  function parseBags(b) {
    if (!b || typeof b !== 'object' || !Array.isArray(b.list)) return null;
    const lateDays = num(b.late_days) || 7;
    const list = b.list.filter((x) => x && x.id != null).map((x) => {
      const id = String(x.id), items = (Array.isArray(x.items) ? x.items : []).filter((i) => i && i.id != null);
      const home = x.home !== false && id !== '2428' && id !== 'pv';
      const homeItems = home ? items.filter(sells) : [];
      return { id, name: String(x.name || '#' + x.id), items, n: items.length, home, homeN: homeItems.length, late: homeItems.filter((i) => num(i.days) > lateDays).length };
    }).filter((x) => x.n > 0);
    const all = (Array.isArray(b.all) && b.all.length ? b.all : list).filter((x) => x && x.id != null).map((x) => ({ id: String(x.id), name: String(x.name || '#' + x.id) }));
    // the general shortages' ids ('gs' = «النواقص العامة»): their items are not listed here, only known to close a move there
    return { since: b.since || '', lateDays, list, all, gs: Array.isArray(b.gs) ? b.gs.map(String) : [] };
  }
  // the bags as the owner sees them: the laptop's file with his moves not yet made in PharmaFly (ar_bag_moves, status pending).
  // An item moved goes to its new bag at once, marked pending (from = where PharmaFly has it); a move whose item the file already
  // shows in the new bag is done (returned in `done`, the page closes it). An item no longer short keeps the numbers it had.
  function applyMoves(bags, moves) {
    if (!bags) return { list: [], done: [] };
    const where = new Map();
    const list = bags.list.map((b) => ({ ...b, items: b.items.map((i) => ({ ...i })) }));
    for (const b of list) for (const i of b.items) where.set(String(i.id), b.id);
    for (const id of bags.gs || []) if (!where.has(id)) where.set(id, 'gs');
    const done = [], moved = new Map();
    for (const m of moves || []) {
      if (!m || m.status !== 'pending') continue;
      const k = String(m.item_id), now = where.get(k);
      if (now === String(m.to_bag)) { done.push(m.id); continue; }
      moved.set(k, m);
    }
    const out = new Map(list.map((b) => [b.id, b]));
    const nameOf = (id) => (bags.all.find((x) => x.id === id) || list.find((x) => x.id === id) || { name: '#' + id }).name;
    for (const [k, m] of moved) {
      let item = null;
      const fromB = out.get(where.get(k));
      if (fromB) { const at = fromB.items.findIndex((i) => String(i.id) === k); if (at >= 0) item = fromB.items.splice(at, 1)[0]; }
      if (!item) item = { id: Number(m.item_id), name: m.item_name || '#' + k, ...(m.item || {}) };
      const to = String(m.to_bag);
      if (!out.has(to)) { const nb = { id: to, name: nameOf(to), items: [], home: false, homeN: 0, late: 0 }; out.set(to, nb); list.push(nb); }
      out.get(to).items.push({ ...item, pending: true, from: String(m.from_bag), fromName: nameOf(String(m.from_bag)), move: m.id });
    }
    for (const b of list) b.n = b.items.length;
    return { list: list.filter((b) => b.n > 0), done };
  }
  // the items of a bag in the order he chose: a number column, largest first (dir -1) or smallest first (dir 1), like PharmaFly
  function sortItems(items, key, dir) {
    const k = ['need', 'have', 'sold30'].includes(key) ? key : 'need', d = dir === 1 ? 1 : -1;
    return [...items].sort((x, y) => d * (num(x[k]) - num(y[k])) || String(x.name).localeCompare(String(y.name)));
  }
  function parse(o) {
    if (!o || typeof o !== 'object' || !o.tasks || !o.expiry || !o.customers) return null;
    const arr = (x) => (Array.isArray(x) ? x : []);
    return {
      bags: parseBags(o.bags),
      generatedAt: o.generated_at || '', dataAt: o.data_at || '', dayStart: o.day_start || '', soonUntil: o.soon_until || '',
      mix: arr(o.tasks.expiry_mix), negative: arr(o.tasks.negative), expiredSold: arr(o.tasks.expired_sold),
      expired: arr(o.expiry.expired), soon: arr(o.expiry.soon),
      customers: { owing: num(o.customers.owing), owed: num(o.customers.owed), prepaid: num(o.customers.prepaid), over: arr(o.customers.over), near: arr(o.customers.near) },
      counts: o.counts || {},
    };
  }
  // what needs work today, for the home card and the badges
  function todo(a) {
    if (!a) return [];
    const today = (l) => l.filter((x) => num(x.today) > 0).length;
    return [
      { key: 'mix', tab: 'expiry', view: 'today', n: today(a.mix), text: 'صنف صلاحياته اتلخبطت من البيع النهارده' },
      { key: 'negative', tab: 'expiry', view: 'today', n: today(a.negative), text: 'صنف اتباع بالسالب النهارده' },
      { key: 'expiredSold', tab: 'expiry', view: 'today', n: today(a.expiredSold), text: 'صنف منتهي اتباع النهارده' },
      { key: 'expired', tab: 'expiry', view: 'expired', n: a.expired.length, text: 'صنف منتهي الصلاحية وليه رصيد' },
      { key: 'over', tab: 'customers', view: '', n: a.customers.over.length, text: 'عميل عدّى الحد' },
      // one line per bag (not the daily one, not «كل الشركات»), the late ones first (the laptop already sorts them so)
      ...((a.bags && a.bags.list) || []).filter((b) => b.home).map((b) => ({
        key: 'bag', tab: 'bags', view: 'bag:' + b.id, n: b.homeN, text: 'ناقص في حقيبة', name: b.name, late: b.late,
        note: b.late ? `منهم ${b.late} بقالهم أكتر من ${a.bags.lateDays} أيام` : '',
      })),
    ].filter((x) => x.n > 0);
  }
  // the items short for more than 7 days in a row, all bags together (the notification and the small tab's number)
  const lateBags = (a) => ((a && a.bags && a.bags.list) || []).reduce((s, b) => s + b.late, 0);
  const value = (list) => list.reduce((s, x) => s + num(x.value), 0);
  const api = { PATH, parse, todo, when, monthOf, batchText, money, value, dayText, lateBags, applyMoves, sortItems };
  root.AskerAlertsLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const qtyText = () => (root.AskerStockLib && root.AskerStockLib.qtyText) || null;
  let data = null, loading = null, loadedAt = 0, view = 'today', failed = '', bagSel = '';
  // «الحقائب»: his open moves (ar_bag_moves), the order he chose, the ticked items, the bag picked in «حوّل», the last moves (undo)
  // the order: by the real stock only (owner 11-15: «من رصيد الاصناف، الرصيد الموجود الفعلي … الكميات اللي مفيش منها فوق»),
  // smallest first when a bag opens, a tap turns it to largest first and back
  let moves = [], movesErr = '', sortKey = 'have', sortDir = 1, sheetTo = '', lastMoved = null, bagMsg = '';
  // «أمر الشرا» (owner 11-15): the open lines of ar_po_items; the order advisor («الطلبيات») builds from them only
  let po = [], poOk = '';
  // what is in the purchase order leaves the bags (owner 11-15: «طالما راحت أمر شراء يبقى ما تظهرش في الحقائب عشان ما تعمليش
  // دوشة»); «اعرضهم» shows them again, to take one out of the order
  let showPo = false;
  // his answers to «⚠️ ممكن نفس الصنف» (ar_item_dups, owner 11-15 «الحل فين؟»): 'same' = a duplicate card, it leaves the bags and
  // waits in «مكررات تتشال من نواقص فارمافلاي»; 'different' = the warning goes away for that card. dupOk = the last answer (undo)
  let dups = [], dupOk = null;
  const dupOf = (id) => dups.find((d) => String(d.item_id) === String(id));
  const picked = new Set();

  async function load(force) {
    if (!db()) return null;
    if (loading) return loading;
    if (data && !force && Date.now() - loadedAt < 5 * 60e3) return data;
    loading = (async () => {
      try {
        // a staff member with «الصلاحيات» but not «العملاء» reads the same alerts without the customers (owner 2026-11-13)
        const st = root.AskerStaff, path = st && st.isStaff() && !st.can('customers') ? 'alerts/expiry.json' : PATH;
        const { data: blob, error } = await db().storage.from('asker-private').download(path);
        if (error || !blob) { failed = 'لسه مفيش تنبيهات: اللاب بيجهزها مع كل تحديث، كل ساعة.'; return data; }
        const p = parse(JSON.parse(await blob.text()));
        if (!p) { failed = 'ملف التنبيهات شكله مش مظبوط، استنى التحديث الجاي.'; return data; }
        data = p; failed = ''; loadedAt = Date.now();
        return data;
      } catch (e) {
        failed = 'مقدرتش أجيب التنبيهات: ' + ((e && e.message) || e);
        return data;
      } finally {
        loading = null;
        drawAll();
      }
    })();
    return loading;
  }
  function ageText(a) {
    const t = new Date(a.dataAt);
    if (isNaN(t)) return '';
    const old = (Date.now() - new Date(a.generatedAt)) / 36e5 > OLD_HOURS;
    return `حسب داتا الصيدلية ${when(a.dataAt, a.dayStart) || ''} ${old ? '· قديمة، اللاب لسه ما حدّثهاش' : ''}`.trim();
  }
  function itemCard(x, line, warn) {
    const q = qtyText();
    const bs = (x.batches || []).map((b) => `<span class="al-batch">${esc(batchText(b, q, x.parts))}</span>`).join('');
    return `<div class="al-item${warn ? ' warn' : ''}"><strong dir="ltr">${esc(x.name)}</strong>` +
      (line ? `<div class="al-line">${esc(line)}</div>` : '') +
      (bs ? `<div class="al-batches">${bs}</div>` : '<div class="hint">مفيش رصيد على أي تشغيلة دلوقتي</div>') + '</div>';
  }
  function list(title, items, line, empty, warn) {
    return `<h3 class="al-h">${esc(title)} <b class="al-n">${items.length}</b></h3>` +
      (items.length ? items.map((x) => itemCard(x, line(x), warn)).join('') : `<p class="hint">${esc(empty)}</p>`);
  }
  function drawExpiry() {
    const box = $('alExpiry');
    if (!box) return;
    const a = data;
    $('alAge').textContent = a ? ageText(a) : failed;
    $('alAge').className = 'status' + (failed && !a ? ' bad' : '');
    document.querySelectorAll('#alViews [data-al-view]').forEach((b) => b.classList.toggle('secondary', b.dataset.alView !== view));
    if (!a) { box.innerHTML = ''; return; }
    const tn = (l) => l.filter((x) => num(x.today) > 0).length;
    const setBadge = (id, n) => { const el = $(id); if (el) { el.textContent = n; el.classList.toggle('hidden', !n); } };
    setBadge('alTodayN', tn(a.mix) + tn(a.negative) + tn(a.expiredSold));
    setBadge('alExpiredN', a.expired.length);
    setBadge('alSoonN', a.soon.length);
    const times = (x) => `${num(x.today) ? `النهارده ${num(x.today)} مرة` : 'مش النهارده'} · ${num(x.n7)} في 7 أيام · آخر مرة ${when(x.last, a.dayStart)}`;
    if (view === 'today') {
      const today = (l) => l.filter((x) => num(x.today) > 0), week = (l) => l.filter((x) => !num(x.today));
      box.innerHTML =
        '<p class="hint">من شاشة المهام في فارمافلاي. صحّح التشغيلات من فارمافلاي نفسه: البوت مابيغيّرش حاجة.</p>' +
        list('صلاحيات اتلخبطت من البيع', today(a.mix), times, 'مفيش النهارده.', true) +
        list('بيع بالسالب', today(a.negative), times, 'مفيش النهارده.', true) +
        list('اتباع منتهي الصلاحية', today(a.expiredSold), times, 'مفيش النهارده.', true) +
        (week(a.mix).length + week(a.negative).length + week(a.expiredSold).length
          ? `<details class="al-week"><summary>آخر 7 أيام (قبل النهارده): ${week(a.mix).length + week(a.negative).length + week(a.expiredSold).length} صنف</summary>` +
            [...week(a.mix), ...week(a.negative), ...week(a.expiredSold)].map((x) => itemCard(x, times(x))).join('') + '</details>'
          : '');
    } else if (view === 'expired') {
      box.innerHTML = `<p class="hint">تشغيلات صلاحيتها خلصت (الشهر ده أو قبل كده) ولسه عليها رصيد على السيستم، من غير مخزن الهالك. قيمتهم حوالي ${money(value(a.expired))} ج.</p>` +
        list('منتهية وليها رصيد', a.expired, (x) => `${monthOf(x.exp)} · ${num(x.packs)} علبة · حوالي ${money(x.value)} ج`, 'مفيش.', true);
    } else {
      box.innerHTML = `<p class="hint">هتخلص قبل ${monthOf(a.soonUntil)}: ارجعها للمورد أو بيعها الأول. قيمتهم حوالي ${money(value(a.soon))} ج.</p>` +
        list('هتخلص خلال 3 شهور', a.soon, (x) => `${monthOf(x.exp)} · ${num(x.packs)} علبة · حوالي ${money(x.value)} ج`, 'مفيش.');
    }
  }
  function customerRow(c, a) {
    return `<div class="al-item${c.over > 0 ? ' warn' : ''}"><strong>${esc(c.name)}</strong>` +
      `<div class="al-line">عليه ${money(c.balance)} ج · الحد ${money(c.limit)} ج${c.over > 0 ? ` · زيادة ${money(c.over)} ج` : ` · ${num(c.pct)}% من الحد`}</div>` +
      `<div class="hint">آخر حركة ${esc(when(c.last_at, a.dayStart))} (${c.last_kind === 'payment' ? 'دفع' : 'بيع'}) · كود ${esc(c.id)}</div></div>`;
  }
  function drawCustomers() {
    const box = $('alCustomers');
    if (!box) return;
    const a = data;
    $('alCustAge').textContent = a ? ageText(a) : failed;
    if (!a) { box.innerHTML = ''; return; }
    const c = a.customers;
    box.innerHTML =
      `<div class="grid"><div class="stat"><strong>${c.over.length}</strong>عدّوا الحد</div><div class="stat"><strong>${c.owing}</strong>عليهم فلوس</div><div class="stat"><strong>${money(c.owed)}</strong>ج إجمالي</div></div>` +
      `<h3 class="al-h">عدّوا الحد <b class="al-n">${c.over.length}</b></h3>` + (c.over.length ? c.over.map((x) => customerRow(x, a)).join('') : '<p class="hint">مفيش عميل عدّى حده.</p>') +
      (c.near.length ? `<h3 class="al-h">قربوا من الحد (90% أو أكتر) <b class="al-n">${c.near.length}</b></h3>` + c.near.map((x) => customerRow(x, a)).join('') : '') +
      `<p class="hint">الرصيد = آخر حركة للعميل في فارمافلاي (بيع أو دفع)، والحد من كارت العميل. ${c.prepaid} عميل دافعين مقدّم.</p>`;
  }
  // «الحقائب» (owner 2026-11-15): every bag with what PharmaFly shows short today, «نواقص كل الشركات» as one more bag. He ticks
  // items and «حوّل» moves them to any bag: the move is recorded in ar_bag_moves and the item shows in its new bag at once
  // («⏳ لسه في فارمافلاي»); PharmaFly itself is not touched here. The arrows order a bag by a number, largest or smallest first.
  function bagItem(x, lateDays, ref) {
    const late = num(x.days) > lateDays;
    const line = num(x.min) > 0
      ? `عندك ${num(x.have)} · الحد الأدنى ${num(x.min)} · اتباع في شهر ${num(x.sold30)} · المطلوب ${num(x.need)}`
      : `عندك ${num(x.have)} · اتباع في شهر ${num(x.sold30)} · المطلوب ${num(x.need)}`;
    const since = num(x.days) > 1 ? `ناقص بقاله ${num(x.days)} يوم` : 'ناقص من النهارده';
    const k = String(x.id), inPo = po.some((p) => String(p.item_id) === k);
    return `<label class="al-item bg-it${late ? ' late' : ''}${picked.has(k) ? ' on' : ''}"><input type="checkbox" data-pick="${esc(k)}"${picked.has(k) ? ' checked' : ''} />` +
      `<div><strong dir="auto" class="notr">${esc(x.name)}</strong>` +
      (x.pending ? ` <span class="bg-pend">⏳ لسه في فارمافلاي</span>` : '') +
      (inPo ? ` <span class="bg-po-tag">🛒 في أمر الشرا</span>` : '') +
      `<div class="bg-line">${esc(line)}</div>` +
      `<div class="hint">${x.last_buy ? `<span>${esc('آخر شرا ' + dayText(x.last_buy, ref))}</span>` : '<span>ما اتشراش قبل كده</span>'} · <span class="${late ? 'al-late' : ''}">${esc(since)}</span>` +
      (x.pending ? ` · <span>جاي من</span> <bdi class="notr">${esc(x.fromName)}</bdi>` : '') + '</div>' +
      // a card with nearly the same name that HAS stock (the laptop finds it, owner 11-15: «لازم تشاورني فيها الأول»), with his two
      // answers; answered «صنف تاني» = no warning any more
      (x.dup && x.dup.name && !dupOf(x.id)
        ? `<div class="bg-dup">⚠️ <span>ممكن نفس الصنف:</span> <bdi class="notr" dir="auto">${esc(x.dup.name)}</bdi> <span>${esc(`عندك منه ${num(x.dup.have)}`)}</span>` +
          `<span class="bg-dup-btns"><button type="button" class="small bg-dup-same" data-dup-same="${esc(k)}">✔ نفس الصنف</button><button type="button" class="small secondary" data-dup-diff="${esc(k)}">✖ صنف تاني</button></span></div>`
        : '') +
      '</div></label>';
  }
  const bagView = () => applyMoves(data && data.bags, moves);
  // the bags as drawn: without what is in the purchase order, unless «اعرضهم»
  function visibleBags() {
    const poIds = new Set(po.map((p) => String(p.item_id)));
    // a card answered «نفس الصنف» is a duplicate: never shown in the bags
    const same = new Set(dups.filter((d) => d.decision === 'same').map((d) => String(d.item_id)));
    return bagView().list.map((b) => {
      if ((showPo || !poIds.size) && !same.size) return b;
      const items = b.items.filter((i) => !same.has(String(i.id)) && (showPo || !poIds.has(String(i.id))));
      return { ...b, items, n: items.length };
    });
  }
  // the two orders (owner 11-15): the real stock (smallest first when chosen) and the item's monthly average, «اتباع في شهر»
  // (largest first when chosen, «عايزين نعمل واحد للمتوسط بتاع الصنف»); a tap on the chosen one turns it around
  const SORT_FIRST = { have: 1, sold30: -1 };
  function sortBtn(k) {
    const on = sortKey === k, dir = on ? sortDir : SORT_FIRST[k];
    const t = k === 'have' ? (dir === 1 ? 'الرصيد: الأقل فوق' : 'الرصيد: الأكتر فوق') : (dir === -1 ? 'المتوسط: الأكتر فوق' : 'المتوسط: الأقل فوق');
    return `<button type="button" data-sort="${k}"${on ? '' : ' class="secondary"'}><span>${t}</span>${on ? (dir === 1 ? ' ▲' : ' ▼') : ''}</button>`;
  }
  function drawBags() {
    const box = $('bgList');
    if (!box) return;
    const a = data;
    $('bgAge').textContent = a ? ageText(a) : failed;
    $('bgAge').className = 'status' + (failed && !a ? ' bad' : '');
    const chips = $('bgChips'), bar = $('bgBar');
    if (!a || !a.bags) {
      chips.innerHTML = ''; $('bgSort').innerHTML = ''; bar.classList.add('hidden');
      box.innerHTML = a ? '<p class="hint">الحقائب لسه ما اتحسبتش: هتظهر مع تحديث اللاب الجاي.</p>' : '';
      return;
    }
    const L = visibleBags();
    // every bag, even an empty one (owner 11-15: «ما عملتش حقيبة ابن سينا … حقيبة الكاش … عايزة تبقى موجودة هنا»); «النواقص
    // العامة» only while something is on its way there
    const count = (id) => (L.find((x) => x.id === id) || { n: 0 }).n;
    const tabs = a.bags.all.filter((x) => x.id !== 'gs' || count('gs') > 0);
    for (const x of L) if (!tabs.some((t) => t.id === x.id)) tabs.push({ id: x.id, name: x.name });
    // the bags one under the other, each on its own line with its whole name; a tap opens it (and closes the one open), a
    // second tap closes it (owner 11-15: «الحقائب كلها تحت بعضها، كل واحد ادوس عليه يفتح لي اللي جواه … اسم الحقيبة … ظاهر كامل»)
    if (bagSel && !tabs.some((t) => t.id === bagSel)) { bagSel = ''; picked.clear(); }
    chips.innerHTML = ''; chips.classList.add('hidden'); $('bgSort').innerHTML = '';
    const b = bagSel ? L.find((x) => x.id === bagSel) || { id: bagSel, name: (tabs.find((t) => t.id === bagSel) || { name: bagSel }).name, items: [], n: 0 } : null;
    const items = b ? sortItems(b.items, sortKey, sortDir) : [];
    for (const k of [...picked]) if (!items.some((i) => String(i.id) === k)) picked.delete(k);
    const body = () =>
      items.length
        ? `<div class="bg-sort"><span>رتّب:</span>${sortBtn('have')}${sortBtn('sold30')}</div>` +
          `<label class="bg-all"><input type="checkbox" id="bgAllBox"${picked.size === items.length ? ' checked' : ''} /> <span>علّم الكل</span></label>` +
          items.map((x) => bagItem(x, a.bags.lateDays, a.dataAt)).join('')
        : '<p class="hint">مفيش أصناف ناقصة في الحقيبة دي.</p>';
    box.innerHTML =
      '<p class="hint">الأصناف اللي ظاهرة ناقصة النهارده في فارمافلاي، بنفس قاعدته. علّم الأصناف ودوس «حوّل» عشان تنقلها لحقيبة تانية: التحويل بيتسجل هنا، وفارمافلاي ما بيتلمسش.</p>' +
      (movesErr ? `<p class="status bad">${esc(movesErr)}</p>` : '') +
      (lastMoved ? `<div class="bg-toast">✅ <span>${esc(`اتحوّل ${lastMoved.ids.length} صنف لـ`)}</span> <bdi class="notr">${esc(lastMoved.name)}</bdi> <button type="button" class="small secondary" data-undo>تراجع</button></div>` : '') +
      (bagMsg ? `<p class="status bad">${esc(bagMsg)}</p>` : '') +
      (poOk ? `<div class="bg-toast">${esc(poOk)}</div>` : '') +
      (dupOk ? `<div class="bg-toast">✅ <bdi class="notr" dir="auto">${esc(dupOk.name)}</bdi> <span>${dupOk.decision === 'same' ? 'اتعلّم مكرر: اتشال من الحقائب وأمر الشرا' : 'صنف تاني: التحذير اتشال، وبيدخل أمر الشرا لو رصيده صفر'}</span> <button type="button" class="small secondary" data-dup-undo="${esc(dupOk.id)}">تراجع</button></div>` : '') +
      dupsList() +
      (po.length ? `<div class="bg-po"><span>${esc(`🛒 في أمر الشرا: ${po.length} صنف`)}</span> <span>${showPo ? 'ظاهرين في الحقائب.' : 'مش ظاهرين في الحقائب.'}</span> <span>مستشار الطلبيات بيقسّمهم على المخازن في خلال دقيقة أو اتنين.</span> <button type="button" class="small secondary" data-open-drafts>افتح الطلبيات</button> <button type="button" class="small secondary" data-show-po>${showPo ? 'خبّيهم' : 'اعرضهم'}</button></div>` : '') +
      (tabs.length
        ? tabs.map((t) => `<div class="bg-bag${t.id === bagSel ? ' open' : ''}"><button type="button" class="bg-bag-h" data-bag="${esc(t.id)}" aria-expanded="${t.id === bagSel}">` +
            `<span class="bg-bag-name notr">${esc(t.name)}</span> <b class="bg-bag-n">${count(t.id)}</b></button>` +
            (t.id === bagSel ? `<div class="bg-bag-body">${body()}</div>` : '') + '</div>').join('')
        : '<p class="hint">مفيش أصناف ناقصة في الحقائب.</p>');
    bar.classList.toggle('hidden', !picked.size);
    // «حوّل» (any bag), and his two quick ones (owner 11-15): «للنواقص العامة» (not found in the market) and «أجّل» («نواقص كل الشركات»)
    // «🛒 أمر شراء» for the ticked items not in the order yet; «✖ شيل من أمر الشرا» for the ticked ones already in it
    const inPo = (k) => po.some((p) => String(p.item_id) === k);
    const toAdd = [...picked].filter((k) => !inPo(k)).length, toDrop = picked.size - toAdd;
    bar.innerHTML = picked.size
      ? (toAdd ? `<button type="button" class="bg-buy" id="bgPoBtn">${esc(`🛒 أمر شراء (${toAdd})`)}</button>` : '') +
        (toDrop ? `<button type="button" class="secondary" id="bgPoDrop">${esc(`✖ شيل من أمر الشرا (${toDrop})`)}</button>` : '') +
        `<button type="button" id="bgMoveBtn">${esc(`⇄ حوّل (${picked.size})`)}</button>` +
        (bagSel !== 'gs' ? '<button type="button" class="secondary" data-quick="gs">للنواقص العامة</button>' : '') +
        (bagSel !== 'pv' ? '<button type="button" class="secondary" data-quick="pv">أجّل</button>' : '') +
        '<button type="button" class="secondary" id="bgClear">إلغاء</button>'
      : '';
    drawSheet();
  }
  // «حوّل لـ…»: every bag (even an empty one), the one they are in now greyed; a tap picks, the button under moves
  function drawSheet() {
    const sh = $('bgSheet');
    if (!sh) return;
    // on the page itself, not inside the bags card: the card's opening animation made the sheet open at the very bottom of the
    // list, off the screen (owner 11-15: «بيعمل ضباب على الشاشة … وما بيخيرنيش»)
    if (sh.parentElement !== document.body) document.body.appendChild(sh);
    if (!sheetTo && !sh.dataset.open) { sh.classList.add('hidden'); sh.innerHTML = ''; return; }
    const L = bagView().list, count = (id) => (L.find((x) => x.id === id) || { n: 0 }).n;
    const pick = (data.bags.all.find((x) => x.id === sheetTo) || {}).name;
    sh.classList.remove('hidden');
    sh.innerHTML = `<div class="bg-sheet-in" role="dialog" aria-label="حوّل لحقيبة تانية"><h3>${esc(`حوّل ${picked.size} صنف لـ…`)}</h3>` +
      data.bags.all.map((x) => x.id === bagSel
        ? `<div class="bg-dest cur"><bdi class="notr">${esc(x.name)}</bdi> <small>هنا دلوقتي</small></div>`
        : `<button type="button" class="bg-dest${sheetTo === x.id ? ' pick' : ''}" data-to="${esc(x.id)}"><bdi class="notr">${esc(x.name)}</bdi> <small>${count(x.id)}</small></button>`).join('') +
      `<div class="bg-sheet-btns">${sheetTo ? `<button type="button" id="bgGo"><span>حوّل لـ</span> <bdi class="notr">${esc(pick)}</bdi></button>` : ''}<button type="button" class="secondary" id="bgBack">رجوع</button></div></div>`;
  }
  // his open moves; a move PharmaFly already shows is closed here
  async function loadMoves() {
    if (!db()) return;
    try {
      const { data: rows, error } = await db().from('ar_bag_moves').select('id,item_id,item_name,from_bag,to_bag,item,status,created_at').eq('status', 'pending').order('created_at');
      if (error) { movesErr = 'التحويلات مش متاحة دلوقتي: ' + (error.message || error); return; }
      moves = rows || []; movesErr = '';
      const done = applyMoves(data && data.bags, moves).done;
      if (done.length) {
        await db().from('ar_bag_moves').update({ status: 'done', done_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in('id', done);
        moves = moves.filter((m) => !done.includes(m.id));
      }
    } catch (e) { movesErr = 'التحويلات مش متاحة دلوقتي: ' + ((e && e.message) || e); }
  }
  // «🗂 مكررات تتشال من نواقص فارمافلاي»: the cards he answered «نفس الصنف», until the copy shows them out of the shortages
  function dupsList() {
    const same = dups.filter((d) => d.decision === 'same');
    if (!same.length) return '';
    const bagName = (id) => ((data && data.bags && data.bags.all) || []).find((b) => b.id === String(id || '')) || null;
    return `<details class="bg-dups" open><summary>${esc(`🗂 مكررات تتشال من نواقص فارمافلاي (${same.length})`)}</summary>` +
      same.map((d) => `<div class="bg-dups-row"><strong class="notr" dir="auto">${esc(d.item_name || '#' + d.item_id)}</strong>` +
        (bagName(d.bag) ? ` <small>(<bdi class="notr">${esc(bagName(d.bag).name)}</bdi>)</small>` : '') +
        `<div><span>نفس:</span> <bdi class="notr" dir="auto">${esc(d.other_name || '#' + d.other_id)}</bdi> · <span class="bg-pend">⏳ لسه في فارمافلاي</span> ` +
        `<button type="button" class="small secondary" data-dup-undo="${esc(d.id)}">تراجع</button></div></div>`).join('') + '</details>';
  }
  // his answers; a «نفس الصنف» card the laptop's copy no longer shows short anywhere is done (he took it out in PharmaFly)
  async function loadDups() {
    if (!db()) return;
    try {
      const { data: rows, error } = await db().from('ar_item_dups').select('id,item_id,item_name,other_id,other_name,bag,decision,status').eq('status', 'open').order('created_at');
      dups = error ? [] : rows || [];
      const shortNow = new Set();
      for (const b of (data && data.bags && data.bags.list) || []) for (const i of b.items) shortNow.add(String(i.id));
      const gone = data && data.bags ? dups.filter((d) => d.decision === 'same' && !shortNow.has(String(d.item_id))).map((d) => d.id) : [];
      if (gone.length) {
        await db().from('ar_item_dups').update({ status: 'done', done_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in('id', gone);
        dups = dups.filter((d) => !gone.includes(d.id));
      }
    } catch (e) { dups = []; }
  }
  // «✔ نفس الصنف» / «✖ صنف تاني» on a card's warning; «نفس الصنف» also takes it out of the purchase order
  async function answerDup(itemId, decision) {
    let item = null, bag = '';
    for (const b of bagView().list) { const i = b.items.find((x) => String(x.id) === String(itemId)); if (i) { item = i; bag = b.id; break; } }
    if (!item || !item.dup) return;
    bagMsg = ''; poOk = ''; lastMoved = null;
    const row = { item_id: Number(item.id), item_name: String(item.name || '').slice(0, 200), other_id: Number(item.dup.id), other_name: String(item.dup.name || '').slice(0, 200), bag: /^(pv|gs|\d{1,12})$/.test(bag) ? bag : null, decision, status: 'open' };
    const r = await db().from('ar_item_dups').insert(row).select('id');
    if (r.error) { bagMsg = 'القرار ما اتسجلش: ' + (r.error.message || r.error); drawBags(); return; }
    dupOk = { id: ((r.data || [])[0] || {}).id, name: row.item_name, decision };
    if (decision === 'same') {
      const inPo = po.filter((p) => String(p.item_id) === String(itemId)).map((p) => p.id);
      if (inPo.length) await db().from('ar_po_items').update({ status: 'cancelled', updated_at: new Date().toISOString() }).in('id', inPo);
    }
    picked.delete(String(itemId));
    await loadDups(); await loadPo(); drawBags();
  }
  async function undoDup(id) {
    if (id) await db().from('ar_item_dups').update({ status: 'cancelled', updated_at: new Date().toISOString() }).in('id', [Number(id) || id]);
    dupOk = null;
    await loadDups(); drawBags();
  }
  // his purchase order: the open lines
  async function loadPo() {
    if (!db()) return;
    try {
      const { data: rows, error } = await db().from('ar_po_items').select('id,item_id,item_name,qty,status').eq('status', 'open').order('created_at');
      po = error ? [] : rows || [];
    } catch (e) { po = []; }
  }
  async function openBags() { await load(false); await loadMoves(); await loadPo(); await loadDups(); drawBags(); }
  // «🛒 أمر شراء»: the ticked items not in the order yet go in, each with what PharmaFly says is needed (at least 1)
  async function addPo() {
    const L = bagView().list, b = L.find((x) => x.id === bagSel);
    if (!b) return;
    const real = new Map();
    for (const bb of data.bags.list) for (const i of bb.items) real.set(String(i.id), bb.id);
    const rows = b.items.filter((i) => picked.has(String(i.id)) && !po.some((p) => String(p.item_id) === String(i.id))).map((i) => ({
      item_id: Number(i.id), item_name: String(i.name || '').slice(0, 200), bag: real.get(String(i.id)) || bagSel, qty: Math.max(1, Math.ceil(num(i.need) - 1e-9)), status: 'open',
      item: { have: num(i.have), sold30: num(i.sold30), min: num(i.min), need: num(i.need), last_buy: i.last_buy || null },
    }));
    bagMsg = ''; poOk = ''; lastMoved = null;
    if (rows.length) {
      const r = await db().from('ar_po_items').insert(rows).select('id');
      if (r.error) bagMsg = 'أمر الشرا ما اتسجلش: ' + (r.error.message || r.error);
      else poOk = `✅ اتضاف ${rows.length} صنف لأمر الشرا`;
    }
    picked.clear();
    await loadPo(); drawBags();
  }
  async function dropPo() {
    const ids = po.filter((p) => picked.has(String(p.item_id))).map((p) => p.id);
    bagMsg = ''; poOk = ''; lastMoved = null;
    if (ids.length) {
      const r = await db().from('ar_po_items').update({ status: 'cancelled', updated_at: new Date().toISOString() }).in('id', ids);
      if (r.error) bagMsg = 'ما اتشالوش من أمر الشرا: ' + (r.error.message || r.error);
      else poOk = `✅ اتشال ${ids.length} صنف من أمر الشرا`;
    }
    picked.clear();
    await loadPo(); drawBags();
  }
  // move the ticked items: an item already moved has that move closed first; back to where PharmaFly has it = nothing to record
  async function doMove(to) {
    const L = bagView().list, b = L.find((x) => x.id === bagSel);
    if (!b || !to) return;
    const real = new Map();
    for (const bb of data.bags.list) for (const i of bb.items) real.set(String(i.id), bb.id);
    const chosen = b.items.filter((i) => picked.has(String(i.id)));
    const close = chosen.filter((i) => i.move).map((i) => i.move);
    const rows = chosen.map((i) => ({ i, from: real.get(String(i.id)) || i.from || bagSel })).filter((x) => x.from !== to).map(({ i, from }) => ({
      item_id: Number(i.id), item_name: String(i.name || '').slice(0, 200), from_bag: from, to_bag: to, status: 'pending',
      item: { have: num(i.have), sold30: num(i.sold30), min: num(i.min), need: num(i.need), last_buy: i.last_buy || null, days: num(i.days) },
    }));
    bagMsg = '';
    try {
      if (close.length) {
        const r = await db().from('ar_bag_moves').update({ status: 'cancelled', updated_at: new Date().toISOString() }).in('id', close);
        if (r.error) throw r.error;
      }
      let ids = [];
      if (rows.length) {
        const r = await db().from('ar_bag_moves').insert(rows).select('id');
        if (r.error) throw r.error;
        ids = (r.data || []).map((x) => x.id);
      }
      lastMoved = { ids, closed: close, name: (data.bags.all.find((x) => x.id === to) || { name: to }).name };
    } catch (e) { bagMsg = 'التحويل ما اتسجلش: ' + ((e && e.message) || e); }
    picked.clear(); sheetTo = ''; delete $('bgSheet').dataset.open;
    await loadMoves(); drawBags();
  }
  async function undoMove() {
    if (!lastMoved) return;
    const { ids } = lastMoved;
    lastMoved = null;
    if (ids.length) await db().from('ar_bag_moves').update({ status: 'cancelled', updated_at: new Date().toISOString() }).in('id', ids);
    await loadMoves(); drawBags();
  }
  function drawAll() {
    drawExpiry();
    drawCustomers();
    drawBags();
    root.AskerNotify?.refresh?.();
  }
  function bind() {
    $('alViews')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-al-view]');
      if (!b) return;
      view = b.dataset.alView;
      drawExpiry();
    });
    const panel = $('bagsPanel');
    panel?.addEventListener('click', (e) => {
      const t = e.target;
      const chip = t.closest('[data-bag]'), sort = t.closest('[data-sort]');
      if (chip) {
        const id = chip.dataset.bag;
        bagSel = bagSel === id ? '' : id; picked.clear(); lastMoved = null; poOk = ''; drawBags();
        if (bagSel) $('bgList')?.querySelector(`.bg-bag.open`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      if (sort) { const k = sort.dataset.sort === 'sold30' ? 'sold30' : 'have'; if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = SORT_FIRST[k]; } drawBags(); return; }
      if (t.closest('#bgMoveBtn')) { sheetTo = ''; $('bgSheet').dataset.open = '1'; drawSheet(); return; }
      if (t.closest('#bgClear')) { picked.clear(); drawBags(); return; }
    });
    // the sheet lives on the page (see drawSheet): its own clicks; a tap on the dark part closes it
    $('bgSheet')?.addEventListener('click', (e) => {
      const t = e.target, dest = t.closest('[data-to]');
      if (dest) { sheetTo = dest.dataset.to; drawSheet(); return; }
      if (t.closest('#bgGo')) { doMove(sheetTo); return; }
      if (t.closest('#bgBack') || t === $('bgSheet')) { sheetTo = ''; delete $('bgSheet').dataset.open; drawSheet(); }
    });
    panel?.addEventListener('click', (e) => {
      const t = e.target;
      const quick = t.closest('[data-quick]');
      if (quick) { doMove(quick.dataset.quick); return; }
      if (t.closest('#bgPoBtn')) { addPo(); return; }
      if (t.closest('#bgPoDrop')) { dropPo(); return; }
      if (t.closest('[data-open-drafts]')) { root.AskerApp?.showTab?.('drafts'); return; }
      if (t.closest('[data-show-po]')) { showPo = !showPo; picked.clear(); drawBags(); return; }
      const same = t.closest('[data-dup-same]'), diff = t.closest('[data-dup-diff]'), undo = t.closest('[data-dup-undo]');
      if (same || diff || undo) e.preventDefault(); // the buttons sit inside the item's label: never tick it
      if (same) { answerDup(same.dataset.dupSame, 'same'); return; }
      if (diff) { answerDup(diff.dataset.dupDiff, 'different'); return; }
      if (undo) { undoDup(undo.dataset.dupUndo); return; }
      if (t.closest('[data-undo]')) { undoMove(); }
    });
    panel?.addEventListener('change', (e) => {
      const box = e.target.closest('[data-pick]');
      if (box) { if (box.checked) picked.add(box.dataset.pick); else picked.delete(box.dataset.pick); drawBags(); return; }
      if (e.target.id === 'bgAllBox') {
        const b = visibleBags().find((x) => x.id === bagSel);
        picked.clear();
        if (e.target.checked && b) for (const i of b.items) picked.add(String(i.id));
        drawBags();
      }
    });
  }
  // open a view from the home card or a notification: «bag:<id>» = that bag in «الحقائب», else a view of «الصلاحيات»
  function show(v) {
    if (v && /^bag:/.test(v)) { bagSel = v.slice(4); picked.clear(); drawBags(); return; }
    if (v) view = v;
    drawExpiry();
  }
  root.AskerAlerts = { open: () => load(false), load, show, bags: openBags, data: () => data, todo: () => todo(data) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(typeof window === 'undefined' ? globalThis : window);
