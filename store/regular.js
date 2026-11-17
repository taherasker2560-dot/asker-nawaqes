/* «اللي باخده دايمًا» + «أدويتي المزمنة» on the customer's own page (owner 2026-11-17: «زرارين كده، كل زرار فيهم بيان بالأصناف، واحد بيان بالأصناف اللي العميل
   بياخدها على الحساب دايما، وزرار تاني بيان بالأصناف بتاعة المزمن وتحذيراتها اللي احنا عاملينها في الصفحة لينا، تبقى باينة عندهم هنا»; he said «ا» to the mockup).
   Data: ar_customer_regular_view(secret) (migration 202611171900): the rows the laptop already finds for the owner's «العملاء ← 💊 مزمن» (Hub\chronic\BUILD_CHRONIC.ps1:
   the items a credit customer buys again and again at a steady gap), for THIS customer only. Late / soon / on time is worked out here from the date, so it is right
   every day; a refill that his own statement (already on the page) shows after the file's date counts at once, so nobody is told «your medicine is late» the day after
   he bought it. The same rule as the owner's page (late = 1.15 gaps and at least 3 days more than the gap). Data the laptop stopped sending (72 hours) is not shown.
   He sees the store's «available» and never our stock numbers. No «رسالة» / «خلصنا» here: those are the pharmacy's own. Loaded before store/account.js, which draws the two
   buttons and calls load(). */
(function (root) {
  'use strict';
  const STALE_HOURS = 72;   // a list the laptop stopped updating is not trusted (its «days late» would be old)
  const SOON_DAYS = 5;      // «soon» = the next refill is due within 5 days (as on the owner's page)

  // ---------- pure helpers (also used by tests/store-regular.cjs) ----------
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const fmt = (n) => String(Math.round(num(n) * 10) / 10).replace(/\.0$/, '');
  const DAY = /^(\d{4})-(\d\d)-(\d\d)/;
  const dayOf = (s) => { const m = DAY.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const TEXTS = {
    usual: '🧾 اللي باخده دايمًا',
    chron: '💊 أدويتي المزمنة',
    usualTitle: 'اللي باخده دايمًا',
    chronTitle: 'أدويتي المزمنة',
    usualHint: 'الأصناف اللي بتاخدها على حسابك كل فترة، من فواتيرك عندنا. الأقرب ميعادًا فوق.',
    chronHint: 'الميعاد تقريبي، على حسب آخر مرة أخدت فيها الدوا من عندنا.',
    lateBox: '⏰ فيه أدوية ميعاد علبتها الجاية عدّى. لو لسه محتاجها كلّمنا أو اطلبها ونجهّزها لك.',
    allGood: '✅ كل أدويتك في معادها.',
    allOk: 'كله في معاده',
    one: 'صنف واحد على حسابي',
    two: 'صنفين على حسابي',
    some: '{n} أصناف على حسابي',
    many: '{n} صنف على حسابي',
    dueOne: 'ميعاد واحد عدّى',
    dueTwo: 'ميعادين عدّوا',
    dueMany: '{n} ميعادهم عدّى',
    gLate: 'ميعادها عدّى',
    gSoon: 'قرّب ميعادها',
    gOk: 'في معادها',
    every: 'بتاخده كل {n} يوم تقريبًا',
    lastTime: 'آخر مرة من {d}',
    lastToday: 'آخر مرة النهارده',
    lastYesterday: 'آخر مرة امبارح',
    took: 'أخدت {q} علبة',
    tookLess: 'أخدت أقل من علبة',
    late: 'ميعاده عدّى من {d}',
    dueNow: 'ميعاده دلوقتي',
    left: 'باقي {d}',
    next: 'الجاي بعد {d}',
    inStock: 'متوفر',
    back: 'رجوع',
  };
  const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => String(o[k]));
  // «يوم واحد» / «يومين» / «٣ أيام» (3-10) / «13 يوم»
  const daysText = (n) => (n === 1 ? 'يوم واحد' : n === 2 ? 'يومين' : n >= 3 && n <= 10 ? `${n} أيام` : `${n} يوم`);
  const usualSub = (n) => (n === 1 ? TEXTS.one : n === 2 ? TEXTS.two : fill(n >= 3 && n <= 10 ? TEXTS.some : TEXTS.many, { n }));
  const dueSub = (n) => (n <= 0 ? TEXTS.allOk : n === 1 ? TEXTS.dueOne : n === 2 ? TEXTS.dueTwo : fill(TEXTS.dueMany, { n }));

  // the rows must look like what the server sends; anything else is skipped
  function parseRows(list) {
    return (Array.isArray(list) ? list : []).filter((x) => x && x.i != null && String(x.n || '').trim() && num(x.gap) > 0 && DAY.test(String(x.last || ''))).map((x) => ({
      i: num(x.i), n: String(x.n).trim(), ar: x.ar ? String(x.ar).trim() : '', gap: num(x.gap), times: num(x.times), q: num(x.q), last: String(x.last).slice(0, 10), avail: x.avail === true,
    }));
  }
  const isStale = (at, now) => { const t = at ? new Date(at).getTime() : NaN; return !Number.isFinite(t) || (now || new Date()).getTime() - t > STALE_HOURS * 3600e3; };
  // the day of the last refill: the file's, or a later one his own statement shows (a sale with the same item name)
  function lastOf(r, moves) {
    let best = r.last;
    for (const m of moves || []) {
      if (!m || m.kind !== 'sale' || !Array.isArray(m.items) || !DAY.test(String(m.at || ''))) continue;
      const k = String(m.at).slice(0, 10);
      if (k > best && m.items.some((l) => l && String(l.n || '').trim() === r.n)) best = k;
    }
    return best;
  }
  // where an item stands today: the days since the last refill, the days to the next one (the usual gap minus the days since; negative = late), and its state
  function standing(r, now, moves) {
    const n = now || new Date(), today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    const last = lastOf(r, moves), d = dayOf(last);
    const since = d ? Math.max(0, Math.round((today - d) / 864e5)) : 0;
    const due = Math.round(r.gap - since);
    const lateAt = Math.max(1.15 * r.gap, r.gap + 3);
    return { since, due, last, state: since >= lateAt ? 'late' : due <= SOON_DAYS ? 'soon' : 'ok' };
  }
  // every item with its standing, the nearest next refill first (the late ones first)
  const withStanding = (rows, now, moves) => (rows || []).map((r) => ({ ...r, ...standing(r, now, moves) })).sort((a, b) => a.due - b.due || a.n.localeCompare(b.n));
  function groups(rows, now, moves) {
    const all = withStanding(rows, now, moves);
    return { all, late: all.filter((r) => r.state === 'late'), soon: all.filter((r) => r.state === 'soon'), ok: all.filter((r) => r.state === 'ok') };
  }
  // the pill that says where the next refill stands (the customer's own words)
  function dueText(r) {
    if (r.state === 'late') return { cls: 'late', text: fill(TEXTS.late, { d: daysText(-r.due) }) };
    if (r.state === 'soon') return r.due <= 0 ? { cls: 'soon', text: TEXTS.dueNow } : { cls: 'soon', text: fill(TEXTS.left, { d: daysText(r.due) }) };
    return { cls: 'ok', text: fill(TEXTS.next, { d: daysText(r.due) }) };
  }
  const sinceText = (since) => (since <= 0 ? TEXTS.lastToday : since === 1 ? TEXTS.lastYesterday : fill(TEXTS.lastTime, { d: daysText(since) }));
  const tookText = (q) => (q >= 0.95 ? fill(TEXTS.took, { q: fmt(q) }) : TEXTS.tookLess);
  const api = { TEXTS, STALE_HOURS, SOON_DAYS, parseRows, isStale, lastOf, standing, withStanding, groups, dueText, sinceText, tookText, daysText, usualSub, dueSub, fmt };
  root.AskerStoreRegularLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const st = { token: null, rows: [], at: null, loaded: false, busy: false, open: '' };
  const photos = new Map(), asked = new Set();
  let client = null, redraw = () => {}, momentsOf = () => [];
  const usable = () => st.loaded && st.rows.length > 0 && !isStale(st.at);

  // the rows of this customer (once per link; again when asked)
  async function load(c, token, opts) {
    if (!c || !token || st.busy) return;
    client = c;
    if (st.token !== token) Object.assign(st, { token, rows: [], at: null, loaded: false, open: '' });
    if (opts && opts.moves) momentsOf = opts.moves;
    if (opts && opts.redraw) redraw = opts.redraw;
    st.busy = true;
    try {
      const { data, error } = await c.rpc('ar_customer_regular_view', { p_token: token });
      if (error || !data || !data.ok) { st.loaded = false; st.rows = []; return; }
      st.rows = parseRows(data.rows); st.at = data.at || null; st.loaded = true;
    } catch (e) {
      st.loaded = false; st.rows = [];   // no list: the page is as before
    } finally {
      st.busy = false;
      redraw();
    }
  }
  function forget() { Object.assign(st, { token: null, rows: [], at: null, loaded: false, open: '' }); close(true); }

  // the two buttons under the account's own buttons (nothing when he has no regular item or the laptop's list is old)
  function buttonsHtml(moves) {
    if (!usable()) return '';
    const g = groups(st.rows, new Date(), moves);
    const dot = g.late.length ? `<span class="ac-reg-dot" aria-hidden="true">${g.late.length}</span>` : '';
    return `<div class="ac-reg-two"><button type="button" class="ac-reg-btn" data-reg-open="usual"><b>${esc(TEXTS.usual)}</b><small>${esc(usualSub(g.all.length))}</small></button>` +
      `<button type="button" class="ac-reg-btn" data-reg-open="chron">${dot}<b>${esc(TEXTS.chron)}</b><small>${esc(dueSub(g.late.length))}</small></button></div>`;
  }
  function itemHtml(r, kind) {
    const ph = photos.get(r.n);
    const pic = ph ? (ph.url ? `<a class="ac-pic" href="#item=${esc(ph.id)}"><img src="${esc(ph.img.src)}" alt=""></a>` : `<span class="ac-pic"><img src="${esc(ph.img.src)}" alt=""></span>`) : '';
    const due = dueText(r);
    const pills = kind === 'usual'
      ? `<span class="rg-pill">${esc(fill(TEXTS.every, { n: fmt(r.gap) }))}</span><span class="rg-pill">${esc(sinceText(r.since))}</span><span class="rg-pill">${esc(tookText(r.q))}</span>`
      : `<span class="rg-pill ${due.cls}">${esc(due.text)}</span><span class="rg-pill">${esc(fill(TEXTS.every, { n: fmt(r.gap) }))}</span>`;
    const stock = r.avail ? `<span class="rg-pill ok">${esc(TEXTS.inStock)}</span>` : '';
    const faded = kind === 'chron' && r.state === 'ok' ? ' rg-quiet' : '';
    // the Arabic name with the English under it; in English only the English name (as everywhere on the store)
    const en = document.documentElement.lang === 'en', showAr = !en && !!r.ar;
    return `<div class="rg-it${ph ? ' has-pic' : ''}${faded}">${pic}<div class="rg-main"><b class="notr" dir="auto">${esc(showAr ? r.ar : r.n)}</b>` +
      (showAr ? `<span class="rg-en notr" dir="ltr" translate="no">${esc(r.n)}</span>` : '') + `<div class="rg-pills">${pills}${stock}</div></div></div>`;
  }
  function sheetHtml() {
    const g = groups(st.rows, new Date(), momentsOf());
    const usual = st.open === 'usual';
    let body = '';
    if (usual) body += `<p class="rg-hint">${esc(TEXTS.usualHint)}</p>` + g.all.map((r) => itemHtml(r, 'usual')).join('');
    else {
      body += `<p class="rg-hint">${esc(TEXTS.chronHint)}</p>`;
      body += g.late.length ? `<div class="rg-warn">${esc(TEXTS.lateBox)}</div>` : `<div class="rg-warn good">${esc(TEXTS.allGood)}</div>`;
      for (const [k, label] of [['late', TEXTS.gLate], ['soon', TEXTS.gSoon], ['ok', TEXTS.gOk]]) {
        if (g[k].length) body += `<h3 class="rg-grp">${esc(label)}</h3>` + g[k].map((r) => itemHtml(r, 'chron')).join('');
      }
    }
    return `<div class="rg-top"><button type="button" class="rg-back" data-reg-close aria-label="${esc(TEXTS.back)}">›</button><b>${esc(usual ? TEXTS.usualTitle : TEXTS.chronTitle)}</b></div><div class="rg-body">${body}</div>`;
  }
  async function loadPhotos() {
    const P = root.AskerItemPhotos;
    const want = [...new Set(st.rows.map((r) => r.n).filter((n) => n && !asked.has(n)))];
    if (!P || !client || !want.length) return;
    want.forEach((n) => asked.add(n));
    try {
      const got = await P.forNames(client, want);
      got.forEach((v, k) => photos.set(k, v));
      if (got.size && st.open) draw();
    } catch (e) { /* no pictures: the lines stay as they are */ }
  }
  function draw() {
    let el = document.getElementById('regSheet');
    if (!st.open) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'regSheet'; el.className = 'rg-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
      document.body.appendChild(el);
    }
    const keep = el.querySelector('.rg-body');
    const top = keep ? keep.scrollTop : 0;
    el.innerHTML = sheetHtml();
    const b = el.querySelector('.rg-body');
    if (b && top) b.scrollTop = top;
  }
  function open(kind) {
    if (!usable()) return;
    st.open = kind === 'chron' ? 'chron' : 'usual';
    try { history.pushState({ asReg: 1 }, '', location.href); } catch (e) { /* no history: the close button still works */ }
    draw();
    loadPhotos();
  }
  // closing: the back button of the phone and the arrow do the same
  function close(quiet) {
    if (!st.open) return;
    st.open = '';
    draw();
    if (!quiet) { try { if (history.state && history.state.asReg) history.back(); } catch (e) { /* nothing to go back to */ } }
  }
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-reg-open]');
    if (o) { open(o.dataset.regOpen); return; }
    if (e.target.closest('[data-reg-close]')) { close(); return; }
    if (st.open && e.target.closest('.rg-sheet a.ac-pic')) setTimeout(() => { st.open = ''; draw(); }, 0);   // the item's page opens: this list closes behind it (after the tap is handled)
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.open) close(); });
  window.addEventListener('popstate', () => { if (st.open) { st.open = ''; draw(); } });
  root.AskerStoreRegular = { load, forget, buttonsHtml, usable, open, close, TEXTS };
})(typeof window === 'undefined' ? globalThis : window);
