/* «حسابي» on the store site (owner 2026-11-13, IDEAS row 1: «رابط نبعته للعملاء … يخش على حسابه بس هو لوحده … ولما وقوف يظهر
   له إن هو موقوف … ويقدر يطلب من المخزن بتاعنا أو يطلب حاجات نجيبها له»; his answers: account and ordering together, «موقوف»
   = his own button, a stopped customer orders cash only, the others choose on account or cash, the full statement with items).
   The owner sends the customer's personal link from the bot (store.html#me=<secret>). The secret stays on the customer's phone,
   so the site opens his account next time too. The server (ar_customer_view / ar_customer_place_order, migration
   202611132100) gives nothing but that one customer's rows; the order goes through the store's own checks and prices.
   Loaded before store/store.js: it takes the secret out of the address first, store.js then routes to #account. */
(function (root) {
  'use strict';
  const KEY = 'asker_store_customer';
  const CRUMB = 0.5; // under half a pound either way = settled (as in the bot)
  const PAGE = 100;

  // ---------- pure helpers (also used by tests/store-account.cjs) ----------
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  function tokenFromHash(h) {
    const m = /^#?me=([0-9a-f]{64})$/.exec(String(h || ''));
    return m ? m[1] : null;
  }
  function money(n) {
    const v = Math.abs(num(n)) < 0.005 ? 0 : num(n);
    const frac = Math.abs(v % 1) > 0.005;
    return v.toLocaleString('en-US', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
  }
  // the balance as the customer reads it
  function balanceWords(b) {
    const v = num(b);
    if (v > CRUMB) return { cls: 'owe', text: `عليك ${money(v)} ج` };
    if (v < -CRUMB) return { cls: 'paid', text: `ليك عندنا ${money(-v)} ج` };
    return { cls: 'zero', text: 'حسابك خالص' };
  }
  function moveTitle(m) {
    const t = num(m.total), p = num(m.paid);
    if (m.kind === 'sale') return { cls: 's', text: `فاتورة ${money(t)} ج` };
    if (m.kind === 'return') return { cls: 'r', text: `مرتجع ${money(Math.abs(t))} ج` };
    if (m.kind === 'refund') return { cls: 'f', text: `رجّعنالك ${money(Math.abs(p))} ج` };
    return { cls: 'p', text: `دفعة ${money(p)} ج` };
  }
  function afterText(b) {
    const v = num(b);
    if (v > CRUMB) return `بعدها: عليك ${money(v)}`;
    if (v < -CRUMB) return `بعدها: ليك ${money(-v)}`;
    return 'بعدها: خالص';
  }
  function itemsWord(n) {
    if (n === 1) return 'صنف واحد';
    if (n === 2) return 'صنفين';
    if (n >= 3 && n <= 10) return `${n} أصناف`;
    return `${n} صنف`;
  }
  // a line: «1 علبة · 66.70», «2 وحدة · 100» (pack price × (packs + units / units in a pack) − its discount)
  const lineValue = (l) => num(l.s) * (num(l.p) + num(l.u) / (num(l.k) > 0 ? num(l.k) : 1)) - num(l.d);
  function qtyText(l) {
    const out = [];
    if (num(l.p)) out.push(`${num(l.p)} علبة`);
    if (num(l.u)) out.push(`${num(l.u)} وحدة`);
    return out.join(' و') || '0';
  }
  const itemsOf = (m) => ((m.kind === 'sale' || m.kind === 'return') && Array.isArray(m.items) ? m.items : []);
  function discountOf(m) {
    const it = itemsOf(m);
    if (!it.length) return 0;
    const d = Math.abs(it.reduce((s, l) => s + lineValue(l), 0)) - Math.abs(num(m.total));
    return d > 0.5 ? Math.round(d * 100) / 100 : 0;
  }
  function parseAt(s) {
    const m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (t) => { const h = t.getHours(); return `${h % 12 || 12}:${pad(t.getMinutes())} ${h < 12 ? 'ص' : 'م'}`; };
  const dayKey = (t) => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  const dateText = (t) => (t ? `${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()}` : '');
  function dayLabel(t, now) {
    if (!t) return '';
    const diff = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5);
    if (diff === 0) return 'النهارده';
    if (diff === 1) return 'امبارح';
    return dateText(t);
  }
  // «آخر تحديث النهارده 8:10 م» from the server's time (timestamptz)
  function updatedText(iso, now) {
    const t = iso ? new Date(iso) : null;
    if (!t || isNaN(t)) return '';
    const d = dayLabel(t, now);
    return `آخر تحديث ${d === 'النهارده' || d === 'امبارح' ? d + ' ' + clock(t) : d}`;
  }
  function movesFor(moves, filter) {
    if (filter === 'sales') return moves.filter((m) => m.kind === 'sale' || m.kind === 'return');
    if (filter === 'payments') return moves.filter((m) => m.kind === 'payment' || m.kind === 'refund' || num(m.paid) !== 0);
    return moves;
  }
  // how he pays: a stopped customer pays cash, whatever was picked
  const payOf = (stopped, wanted) => (stopped || wanted === 'cash' ? 'cash' : 'account');
  // where the PDF starts: his last payment, else the first movement of this month, else the oldest one on the page
  function pdfStart(moves, now) {
    const asc = [...moves].sort((a, b) => String(a.at).localeCompare(String(b.at)) || num(a.id) - num(b.id));
    const pays = asc.filter((m) => m.kind === 'payment');
    if (pays.length) return pays[pays.length - 1].id;
    const month = asc.find((m) => { const t = parseAt(m.at); return t && t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth(); });
    return month ? month.id : asc.length ? asc[0].id : null;
  }
  const TEXTS = {
    stopped: 'حسابك موقوف دلوقتي',
    stoppedMore: 'تقدر تطلب عادي، والدفع كاش عند الاستلام. ولو عندك سؤال كلّمنا.',
    link: 'الرابط ده مبقاش شغال. اطلب رابط جديد من الصيدلية.',
    down: 'مقدرتش أجيب حسابك. اتأكد من النت وجرب تاني.',
    order: '🛒 اطلب من الصيدلية',
    orderCash: '🛒 اطلب (كاش عند الاستلام)',
    pdf: '📄 الكشف PDF',
    pdfBusy: 'بيعمل الكشف…',
    pdfBad: 'الكشف ما اتعملش. جرب تاني.',
    call: '📞 كلّمنا',
    older: 'اعرض أقدم',
    loading: 'بيجيب حسابك…',
    none: 'مفيش حركات في حسابك.',
    noneKind: 'مفيش حركات من النوع ده في اللي ظاهر.',
    payH: 'الدفع',
    payAccount: 'على حسابي',
    payCash: 'كاش عند الاستلام',
    payStopped: 'حسابك موقوف، فالطلب كاش عند الاستلام بس.',
    month: 'اشتريت الشهر ده',
    monthPaid: 'دفعت الشهر ده',
    all: 'الكل',
    sales: 'المشتريات',
    payments: 'المدفوعات',
    title: 'حسابي',
    every10: 'بيتحدث كل 10 دقايق',
    install: '📲 ثبّت التطبيق الآن',
    installWhy: 'عشان تفتح حسابك وتطلب مننا بدوسة واحدة من الشاشة الرئيسية',
    openChrome: '🌐 ثبّته بدوسة من جوجل كروم',
    orHere: 'أو ثبّته من المتصفح ده:',
    installIos: 'على الآيفون: دوس زرار المشاركة ⬆️، وبعدين «إضافة إلى الشاشة الرئيسية». لو مش لاقيها، افتح الرابط في سفاري.',
    installAndroid: 'دوس ⋮ فوق في كروم، وبعدين «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».',
    installFirefox: 'في فايرفوكس: دوس ⋮، وبعدين «تثبيت» أو «إضافة إلى الشاشة الرئيسية».',
    installSamsung: 'في متصفح سامسونج: دوس ≡ تحت، وبعدين «إضافة صفحة إلى» ← «الشاشة الرئيسية».',
    installOther: 'افتح قايمة المتصفح (⋮ أو ≡)، واختار «تثبيت» أو «إضافة إلى الشاشة الرئيسية».',
    installed: 'اتنزّل: هتلاقي «صيدلية عسكر» على الشاشة الرئيسية، وبتفتح على حسابك على طول.',
  };
  // installing on his phone (owner 2026-11-13 «والعميل يثبته عنده ازاى»): the app's icon opens on HIS account. The manifest
  // is the store's own (manifest-store.json) with the start page carrying his link; all addresses absolute (it is read from
  // a blob: address on the phone).
  function manifestFor(token, pageUrl) {
    const page = new URL('store.html', String(pageUrl || '').replace(/#.*$/, ''));
    const abs = (p) => new URL(p, page).href;
    return {
      id: 'store.html', name: 'صيدلية عسكر', short_name: 'صيدلية عسكر', description: 'حسابك في صيدلية عسكر', lang: 'ar', dir: 'rtl',
      start_url: page.href + '#me=' + token, scope: abs('./'), display: 'standalone', background_color: '#f3f6fc', theme_color: '#0a4aa6',
      icons: [
        { src: abs('icons/arabic-192.png?v=logo2'), sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: abs('icons/arabic-512.png?v=logo2'), sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: abs('icons/arabic-maskable-192.png?v=logo2'), sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: abs('icons/arabic-maskable-512.png?v=logo2'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };
  }
  const isIos = (ua, platform, touch) => /iPad|iPhone|iPod/.test(String(ua || '')) || (platform === 'MacIntel' && Number(touch) > 1);
  // the steps for HIS browser when it does not offer a one-tap install (owner 2026-11-13: «لو المتصفح فايرفوكس او اي متصفح
  // تاني»); every browser on an iPhone adds it the same way (Share)
  function installSteps(ua, platform, touch) {
    const u = String(ua || '');
    if (isIos(u, platform, touch)) return TEXTS.installIos;
    if (/SamsungBrowser/.test(u)) return TEXTS.installSamsung;
    if (/Firefox|FxiOS/.test(u)) return TEXTS.installFirefox;
    if (/OPR\/|Opera|EdgA\/|YaBrowser|UCBrowser|MiuiBrowser|HuaweiBrowser|HeyTap/.test(u)) return TEXTS.installOther;
    if (/Chrome\//.test(u)) return TEXTS.installAndroid;
    return TEXTS.installOther;
  }
  // an Android browser other than Chrome (Firefox, Samsung, …): it can open the same account in Google Chrome, where the
  // install is one tap (owner 2026-11-13: «يظهر له الخيار بين الفايرفوكس وبين … بتاع جوجل»)
  const offerChrome = (ua) => /Android/i.test(String(ua || '')) && /Firefox|SamsungBrowser|OPR\/|Opera|EdgA\/|YaBrowser|UCBrowser|MiuiBrowser|HuaweiBrowser|HeyTap/.test(String(ua || ''));
  // the link that opens this page in Chrome on Android (an intent: link cannot carry the #me= part, so the secret rides in
  // ?me=, which the page takes out of the address at once); with no Chrome on the phone it opens here again
  function chromeIntent(pageUrl, token) {
    const page = new URL('store.html', String(pageUrl || '').replace(/[?#].*$/, ''));
    const back = page.href + '?me=' + token;
    return `intent://${page.host}${page.pathname}?me=${token}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(back)};end`;
  }
  function tokenFromSearch(s) {
    const m = /[?&]me=([0-9a-f]{64})(?:&|$)/.exec(String(s || ''));
    return m ? m[1] : null;
  }
  // the address without ?me=… (other parts kept)
  function dropMe(s) {
    const rest = String(s || '').replace(/^\?/, '').split('&').filter((p) => p && !/^me=/.test(p));
    return rest.length ? '?' + rest.join('&') : '';
  }
  const api = { tokenFromHash, tokenFromSearch, dropMe, offerChrome, chromeIntent, money, balanceWords, moveTitle, afterText, itemsWord, qtyText, lineValue, discountOf, parseAt, dayLabel, updatedText, movesFor, payOf, pdfStart, manifestFor, isIos, installSteps, TEXTS, KEY };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') { root.AskerStoreAccountLib = api; return; }
  root.AskerStoreAccountLib = api;

  // ---------- the page ----------
  const keep = {
    get() { try { return localStorage.getItem(KEY) || null; } catch (e) { return null; } },
    set(v) { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) { /* private window */ } },
  };
  // the link just opened: keep the secret, take it out of the address (it is never shown or shared again), open «حسابي»
  // (#me= from WhatsApp; ?me= when another browser sent him to Chrome)
  const fromLink = tokenFromHash(location.hash) || tokenFromSearch(location.search);
  if (fromLink) {
    keep.set(fromLink);
    try { history.replaceState(null, '', location.pathname + dropMe(location.search) + '#account'); } catch (e) { location.hash = 'account'; }
  }
  let token = keep.get();
  if (token && !/^[0-9a-f]{64}$/.test(token)) { keep.set(null); token = null; }
  // opened from the phone's home screen (an icon installed before this, on the store's page): straight to his account
  const standalone = () => !!((root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true);
  if (token && !fromLink && !location.hash && standalone()) {
    try { history.replaceState(null, '', location.pathname + location.search + '#account'); } catch (e) { /* stays on the home */ }
  }
  // his own manifest: installing from this phone makes an icon that opens on his account
  const manifestLink = document.querySelector('link[rel="manifest"]');
  const storeManifest = manifestLink && manifestLink.getAttribute('href');
  let manifestUrl = null;
  function useManifest(on) {
    if (!manifestLink) return;
    if (manifestUrl) { URL.revokeObjectURL(manifestUrl); manifestUrl = null; }
    if (!on || !token) { manifestLink.setAttribute('href', storeManifest); return; }
    try {
      manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifestFor(token, location.href))], { type: 'application/manifest+json' }));
      manifestLink.setAttribute('href', manifestUrl);
    } catch (e) { /* the store's own manifest stays */ }
  }
  useManifest(true);
  // Chrome's «install» (store/store.js keeps it for the home's box too); null when the phone does not offer it
  let installEvt = null, installNote = '';
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; draw(); });
  window.addEventListener('appinstalled', () => { installEvt = null; installNote = TEXTS.installed; draw(); });
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let client = null;
  // st: { c: {id, name, balance}, stopped, month, data_at, phone, moves, more, busy, error, filter, open:Set, pay, pdf }
  const st = { c: null, stopped: false, month: null, data_at: null, phone: null, moves: [], more: false, busy: false, error: '', filter: 'all', open: new Set(), pay: 'account', pdf: '' };

  function showLinked(on) {
    document.querySelectorAll('[data-acct]').forEach((el) => { el.hidden = !on; });
    // his name comes from the pharmacy's card: the name box is not needed
    ['cName', 'cNameLbl'].forEach((id) => { const el = $(id); if (el) el.hidden = !!on; });
    const cash = $('cashNote');
    if (cash) cash.hidden = !!on;
  }
  async function load(older) {
    if (!client || !token || st.busy) return;
    st.busy = true; st.error = '';
    draw();
    try {
      const last = older ? st.moves[st.moves.length - 1] : null;
      const args = { p_token: token, p_limit: PAGE };
      if (last) { args.p_before_at = last.at; args.p_before_id = last.id; }
      const { data, error } = await client.rpc('ar_customer_view', args);
      if (error) throw error;
      if (!data || !data.ok) {
        if (data && data.error === 'link') { keep.set(null); token = null; st.c = null; showLinked(false); useManifest(false); st.error = TEXTS.link; return; }
        throw new Error('bad');
      }
      if (!older) {
        Object.assign(st, { c: data.customer, stopped: !!data.stopped, month: data.month, data_at: data.data_at, phone: data.phone, moves: [] });
        if (st.stopped) st.pay = 'cash';
        const ph = $('cPhone');
        if (ph && !ph.value && data.phone) ph.value = /^20\d{10}$/.test(data.phone) ? '0' + data.phone.slice(2) : data.phone;
        drawPay();
      }
      const seen = new Set(st.moves.map((m) => m.id));
      st.moves.push(...(data.moves || []).filter((m) => !seen.has(m.id)));
      st.more = !!data.more;
      showLinked(true);
    } catch (e) {
      st.error = TEXTS.down;
    } finally {
      st.busy = false;
      draw();
    }
  }
  function moveHtml(m) {
    const t = moveTitle(m), at = parseAt(m.at), items = itemsOf(m), open = st.open.has(m.id);
    const bits = [at ? clock(at) : ''];
    if (items.length) bits.push(`<button type="button" class="linklike" data-acct-items="${esc(m.id)}">${esc(itemsWord(items.length))} ${open ? '▾' : '▸'}</button>`);
    const disc = discountOf(m);
    if (disc) bits.push(`<span>خصم ${esc(money(disc))} ج</span>`);
    if (m.kind === 'sale' && num(m.paid) > 0) bits.push(`<span>دفعت منها ${esc(money(m.paid))} ج</span>`);
    const lines = open && items.length
      ? '<div class="ac-items">' + items.map((l) => `<div><span dir="ltr" translate="no">${esc(l.n)}</span><span>${esc(qtyText(l))} · ${esc(money(lineValue(l)))}</span></div>`).join('') + '</div>'
      : '';
    return `<div class="ac-mv k-${t.cls}"><div class="ac-mv-l"><span class="ac-k">${esc(t.text)}</span><span class="ac-after">${esc(afterText(m.balance))}</span></div>` +
      `<div class="ac-mv-d">${bits.filter(Boolean).join(' · ')}</div>${lines}</div>`;
  }
  function waHref() {
    const a = $('waLink');
    return a && a.getAttribute('href') && a.getAttribute('href') !== '#' ? a.getAttribute('href') : '';
  }
  function draw() {
    const box = $('acctBox');
    if (!box) return;
    const name = $('acctName');
    if (name) name.textContent = st.c ? `حسابك يا ${st.c.name} · كود ${st.c.id}` : '';
    const card = $('acctCardText');
    if (card) card.textContent = st.c ? balanceWords(st.c.balance).text : '';
    if (!st.c) {
      box.innerHTML = st.error ? `<p class="note bad">${esc(st.error)}</p>` : st.busy ? `<p class="note">${esc(TEXTS.loading)}</p>` : '';
      return;
    }
    const b = balanceWords(st.c.balance), now = new Date();
    const upd = updatedText(st.data_at, now);
    // first thing on the page, big (owner 2026-11-13: «زرار كبير مكتوب عليه ثبت التطبيق الان»); not in the installed app
    let html = '';
    if (!standalone()) {
      html += `<button type="button" class="ac-btn ac-install" data-acct-install>${esc(TEXTS.install)}</button>` +
        (installNote && installNote !== TEXTS.installed && offerChrome(navigator.userAgent)
          ? `<a class="ac-btn ac-chrome" href="${esc(chromeIntent(location.href, token))}">${esc(TEXTS.openChrome)}</a><p class="hint-sm center ac-or">${esc(TEXTS.orHere)}</p>`
          : '') +
        (installNote ? `<p class="ac-install-note">${esc(installNote)}</p>` : `<p class="hint-sm center ac-install-why">${esc(TEXTS.installWhy)}</p>`);
    }
    if (st.stopped) html += `<div class="ac-stop"><strong>⛔ ${esc(TEXTS.stopped)}</strong><span>${esc(TEXTS.stoppedMore)}</span></div>`;
    html += `<section class="ac-bal"><div class="ac-big ${b.cls}">${esc(b.text)}</div>` +
      (upd ? `<div class="hint-sm">${esc(upd)} · ${esc(TEXTS.every10)}</div>` : '') +
      (st.month ? `<div class="ac-two"><div>${esc(TEXTS.month)}<b>${esc(money(st.month.bought))} ج</b></div><div>${esc(TEXTS.monthPaid)}<b class="paid">${esc(money(st.month.paid))} ج</b></div></div>` : '') +
      '</section>';
    html += `<a href="#search" class="ac-btn ac-order">${esc(st.stopped ? TEXTS.orderCash : TEXTS.order)}</a>`;
    const wa = waHref();
    html += `<div class="ac-row"><button type="button" class="share" data-acct-pdf>${esc(st.pdf === 'busy' ? TEXTS.pdfBusy : TEXTS.pdf)}</button>` +
      (wa ? `<a class="share" href="${esc(wa)}" target="_blank" rel="noopener">${esc(TEXTS.call)}</a>` : '') + '</div>';
    if (st.pdf === 'bad') html += `<p class="hint-sm bad center">${esc(TEXTS.pdfBad)}</p>`;
    const chip = (f, label) => `<button type="button" class="chip${st.filter === f ? ' on' : ''}" data-acct-filter="${f}">${esc(label)}</button>`;
    html += `<div class="ac-chips" role="group">${chip('all', TEXTS.all)}${chip('sales', TEXTS.sales)}${chip('payments', TEXTS.payments)}</div>`;
    const shown = movesFor(st.moves, st.filter);
    let body = '', lastDay = '';
    for (const m of shown) {
      const t = parseAt(m.at), k = t ? dayKey(t) : '';
      if (k !== lastDay) { body += `<h3 class="ac-day">${esc(dayLabel(t, now))}</h3>`; lastDay = k; }
      body += moveHtml(m);
    }
    if (!shown.length && !st.busy) body = `<p class="note">${esc(st.moves.length ? TEXTS.noneKind : TEXTS.none)}</p>`;
    html += `<div class="ac-moves">${body}</div>`;
    if (st.error) html += `<p class="note bad">${esc(st.error)}</p>`;
    if (st.busy) html += `<p class="note">${esc(TEXTS.loading)}</p>`;
    else if (st.more) html += `<button type="button" class="more" data-acct-older>${esc(TEXTS.older)}</button>`;
    box.innerHTML = html;
  }
  // the checkout's «الدفع»: on account or cash; cash only when stopped
  function drawPay() {
    const box = $('payBox');
    if (!box) return;
    box.hidden = !token;
    if (!token) { box.innerHTML = ''; return; }
    const pay = payOf(st.stopped, st.pay);
    const opt = (v, label, off) => `<label class="ac-pay${off ? ' off' : ''}"><input type="radio" name="acctPay" value="${v}"${pay === v ? ' checked' : ''}${off ? ' disabled' : ''} /> ${esc(label)}</label>`;
    box.innerHTML = `<h2>${esc(TEXTS.payH)}</h2>${opt('account', TEXTS.payAccount, st.stopped)}${opt('cash', TEXTS.payCash, false)}` +
      (st.stopped ? `<p class="hint-sm">${esc(TEXTS.payStopped)}</p>` : '');
  }
  // the PDF: from his last payment (or this month) to now, the same statement the pharmacy sends
  async function pdf() {
    const L = root.AskerStatementLib, P = root.AskerStatement;
    if (!st.c || st.pdf === 'busy' || !L || !P) return;
    st.pdf = 'busy'; draw();
    try {
      // enough history to reach his last payment
      for (let i = 0; i < 10 && st.more && !st.busy && !st.moves.some((m) => m.kind === 'payment'); i++) await load(true);
      const start = pdfStart(st.moves, new Date());
      const stmt = start != null ? L.statementFrom(st.moves, start) : null;
      if (!stmt) throw new Error('empty');
      const out = await P.makePdf(stmt, { name: st.c.name, id: st.c.id, now: new Date() });
      const url = URL.createObjectURL(out.blob);
      const a = document.createElement('a');
      a.href = url; a.download = `كشف حساب صيدلية عسكر ${dateText(new Date()).replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      st.pdf = '';
    } catch (e) {
      st.pdf = 'bad';
    }
    draw();
  }

  // «نزّل حسابك على موبايلك»: Chrome installs in one tap; elsewhere the steps (iPhone: Safari keeps the page's address,
  // so the address carries his link while he adds it)
  async function install() {
    if (installEvt) {
      const e = installEvt;
      installEvt = null;
      try { e.prompt(); const c = await e.userChoice; if (c && c.outcome === 'accepted') installNote = TEXTS.installed; } catch (err) { installNote = installSteps(navigator.userAgent, navigator.platform, navigator.maxTouchPoints); }
      draw();
      return;
    }
    if (isIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)) {
      try { history.replaceState(null, '', location.pathname + location.search + '#me=' + token); } catch (err) { /* the manifest still has it */ }
    }
    installNote = installSteps(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
    draw();
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-acct-install]')) { install(); return; }
    const f = e.target.closest('[data-acct-filter]');
    if (f) { st.filter = f.dataset.acctFilter; draw(); return; }
    const it = e.target.closest('[data-acct-items]');
    if (it) {
      const id = (st.moves.find((m) => String(m.id) === it.dataset.acctItems) || {}).id;
      if (id != null) { if (st.open.has(id)) st.open.delete(id); else st.open.add(id); draw(); }
      return;
    }
    if (e.target.closest('[data-acct-older]')) { load(true); return; }
    if (e.target.closest('[data-acct-pdf]')) { pdf(); }
  });
  document.addEventListener('change', (e) => {
    if (e.target && e.target.name === 'acctPay') { st.pay = e.target.value; drawPay(); }
  });

  root.AskerStoreAccount = {
    // store.js: the client, once it is made (the first load starts here)
    attach(c) { client = c; if (token) { showLinked(true); drawPay(); load(false); } },
    // store.js view('account')
    draw() { if (token && !st.c && !st.busy) load(false); draw(); },
    linked: () => !!token,
    // the order from the checkout: null when this phone has no customer's link
    active() {
      if (!token) return null;
      return { token, name: st.c ? st.c.name : '', pay: payOf(st.stopped, st.pay) };
    },
    // the server said he is stopped (the owner stopped him meanwhile): cash from now on
    stoppedNow() { st.stopped = true; st.pay = 'cash'; drawPay(); load(false); },
    // the server said the link is no longer valid
    linkGone() { keep.set(null); token = null; st.c = null; st.error = TEXTS.link; showLinked(false); useManifest(false); drawPay(); draw(); },
    // after an order: the account may have changed
    refresh() { if (token) load(false); },
  };
})(typeof window === 'undefined' ? globalThis : window);
