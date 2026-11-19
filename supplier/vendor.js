/* The supplier's statement page (supplier.html), owner 2026-11-19: «عايز ابعت لهم رابط للصفحة زيهم زي العملاء كده، يتثبت عندهم زي ابلكيشن
   … كشف حساب من يوم ما بدأت اشتغل معاهم، كل شركة تجيب لي تفصيل حساب بالفواتير، بالأصناف، بصور الأصناف، بالمرتجعات، بالمدفوعات».
   The owner sends the supplier's personal link from the bot (supplier.html#v=<secret>). The secret stays on the supplier's phone and in the installed
   app's start address. The server (ar_vendor_view, migration 202611192000) gives nothing but that one supplier's moves: the name and balance, purchases
   with their lines (item, quantity, bonus, net cost of a pack, discount, expiry, the store's picture), returns, payments, the sums of the range.
   Nothing is written from here. Our selling prices, stock and notes are never sent. */
(function (root) {
  'use strict';
  const KEY = 'asker_vendor_link';
  const PAGE = 25, PRINT_PAGE = 60, PRINT_MAX = 40;
  const CRUMB = 0.5; // under half a pound either way = settled (as in the bot)
  const SUPABASE_URL = 'https://qwrzdjdgvanmhaicncuk.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_af0XfsvB0Fwwo3HORqMN2g_iJNd9o0q';
  const EDIT_IMG = SUPABASE_URL + '/storage/v1/object/public/ar-store-img/';

  // ---------- pure helpers (also used by tests/supplier-page.cjs) ----------
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const pad = (n) => String(n).padStart(2, '0');
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const KIND = { purchase: 'فاتورة', return: 'مرتجع', payment: 'دفعة' };
  const TEXTS = {
    noLink: 'افتحوا الرابط اللي بعتته لكم الصيدلية عشان يظهر كشف حساب شركتكم.',
    dead: 'الرابط ده مبقاش شغال. اطلبوا رابط جديد من الصيدلية.',
    down: 'مقدرتش أجيب الحساب. اتأكدوا من النت وجرّبوا تاني.',
    loading: 'بيجيب الحساب…',
    none: 'مفيش حركة في الفترة دي.',
    noLines: 'الأصناف مش متسجلة.',
    older: 'حركة أقدم',
    printing: 'بيجهّز الكشف…',
    installIos: 'على الآيفون: دوسوا زرار المشاركة ⬆️، وبعدين «إضافة إلى الشاشة الرئيسية». لو مش لاقينها، افتحوا الرابط في سفاري.',
    installAndroid: 'دوسوا ⋮ فوق في كروم، وبعدين «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».',
    installOther: 'افتحوا قايمة المتصفح (⋮ أو ≡)، واختاروا «تثبيت» أو «إضافة إلى الشاشة الرئيسية».',
    foot: 'الكشف ده من حسابات الصيدلية وبيتحدّث كل نص ساعة تقريبًا. لو فيه أي فرق عن دفاتركم قولوا لنا عليه.',
  };
  function tokenFromHash(h) { const m = /^#?v=([0-9a-f]{64})$/.exec(String(h || '')); return m ? m[1] : null; }
  function tokenFromSearch(s) { const m = /[?&]v=([0-9a-f]{64})(?:&|$)/.exec(String(s || '')); return m ? m[1] : null; }
  function money(n) {
    const v = Math.abs(num(n)) < 0.005 ? 0 : num(n);
    const frac = Math.abs(v % 1) > 0.005;
    return v.toLocaleString('en-US', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
  }
  // the balance as the supplier reads it (positive = we owe him)
  function balanceWords(b) {
    const v = num(b);
    if (v > CRUMB) return { cls: 'owe', label: 'مستحق لكم عندنا', text: money(v) + ' ج' };
    if (v < -CRUMB) return { cls: 'ours', label: 'لنا عندكم', text: money(-v) + ' ج' };
    return { cls: 'zero', label: 'الحساب', text: 'خالص' };
  }
  function afterText(b) {
    const w = balanceWords(b);
    return w.cls === 'zero' ? 'الرصيد بعدها: خالص' : `الرصيد بعدها: ${w.cls === 'owe' ? 'مستحق لكم' : 'لنا عندكم'} ${money(Math.abs(num(b)))}`;
  }
  function parseAt(s) {
    const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d))?/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
  }
  // «18 نوفمبر 2026»
  function dayLabel(s) { const t = parseAt(s); return t ? `${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()}` : ''; }
  const expText = (x) => { const m = /^(\d{4})-(\d\d)/.exec(String(x || '')); return m ? `${m[2]}/${m[1]}` : ''; };
  // the number written on the supplier's paper: our return marker «~» is ours, not his
  const codeText = (m) => String((m && m.code) || '').replace(/^~/, '').trim();
  // a line's quantity in words: «3 علبة», «2 علبة + بونص 1», «2 وحدة»
  function qtyText(l) {
    const p = Math.round(num(l.p) * 100) / 100, u = Math.round(num(l.u) * 100) / 100, b = Math.round(num(l.b) * 100) / 100;
    const bits = [];
    if (p) bits.push(`${p} علبة`);
    if (u) bits.push(`${u} وحدة`);
    let s = bits.join(' + ') || '0';
    if (b) s += ` + بونص ${b}`;
    return s;
  }
  // a line's value: (packs + units / units in a pack) × the net cost of a pack
  const lineValue = (l) => (num(l.p) + num(l.u) / (num(l.k) > 0 ? num(l.k) : 1)) * num(l.c);
  // what a move did to the balance as shown: a purchase adds, a return and a payment take away
  function shownAmount(m) { return m.kind === 'purchase' ? num(m.amount) : -num(m.amount); }
  // dates of the inputs → the server's arguments (a day each, both included; empty = open); a reversed pair is turned round
  function rangeArgs(from, to) {
    let a = /^\d{4}-\d\d-\d\d$/.test(String(from || '')) ? from : null, b = /^\d{4}-\d\d-\d\d$/.test(String(to || '')) ? to : null;
    if (a && b && a > b) { const t = a; a = b; b = t; }
    return { p_from: a, p_to: b };
  }
  // the item's picture: the owner's own change wins, «من غير صورة» = none, else the store catalog's
  function picOf(l, index) {
    const lib = root.AskerItemPhotosLib;
    if (!lib || !l) return '';
    const edit = l.off ? { img_off: true } : l.img ? { img: l.img } : null;
    return lib.picUrl(String(l.i), index || {}, edit, EDIT_IMG);
  }
  // installing: the app's icon opens on the supplier's own statement (all addresses absolute: the manifest is read from a blob: address)
  function manifestFor(token, pageUrl) {
    const page = new URL('supplier.html', String(pageUrl || '').replace(/[?#].*$/, ''));
    const abs = (p) => new URL(p, page).href;
    return {
      id: 'supplier.html', name: 'كشف حساب شركتكم · صيدلية عسكر', short_name: 'حساب الشركة', description: 'كشف حساب شركتكم عند صيدلية عسكر', lang: 'ar', dir: 'rtl',
      start_url: page.href + '#v=' + token, scope: abs('./'), display: 'standalone', background_color: '#ffffff', theme_color: '#ffffff',
      icons: [
        { src: abs('icons/arabic-192.png?v=logo2'), sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: abs('icons/arabic-512.png?v=logo2'), sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: abs('icons/arabic-maskable-192.png?v=logo2'), sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: abs('icons/arabic-maskable-512.png?v=logo2'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };
  }
  const isIos = (ua, platform, touch) => /iPad|iPhone|iPod/.test(String(ua || '')) || (platform === 'MacIntel' && Number(touch) > 1);
  // what the install button does: the browser's own prompt, or the written steps for his browser
  function installSteps(ua, platform, touch) {
    const u = String(ua || '');
    if (isIos(u, platform, touch)) return TEXTS.installIos;
    if (/SamsungBrowser|Firefox|FxiOS|OPR\/|Opera|EdgA\/|YaBrowser|UCBrowser|MiuiBrowser|HuaweiBrowser|HeyTap/.test(u)) return TEXTS.installOther;
    if (/Chrome\//.test(u)) return TEXTS.installAndroid;
    return TEXTS.installOther;
  }
  // The quiet music (store/music.js, loaded after this file; owner 2026-11-19: «موسيقى بصوت هادي شويه، ضعيف وهادي، اهدى، حاجة ما تبقاش مزعجة وبس … مش عايز لا بيع ولا طلب الدواء ولا الكلام ده كله»):
  // only the four slowest pieces (84-96 bpm, soft keys and vibes), about a third quieter than the store's, NO spoken advert, its own «stopped» memory, and the owner's phone hears it too (his look).
  const MUSIC = { volume: 0.11, tracks: ['07-dreamy.mp3', '05-smooth.mp3', '03-chill-pop.mp3', '01-bossa.mp3'], key: 'asker_vendor_music_off', promo: false, pharmacyToo: true };
  const api = { KEY, tokenFromHash, tokenFromSearch, money, balanceWords, afterText, parseAt, dayLabel, expText, codeText, qtyText, lineValue, shownAmount, rangeArgs, picOf, manifestFor, isIos, installSteps, TEXTS, KIND, MUSIC };
  root.AskerSupplierLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;
  root.AskerStore = Object.assign(root.AskerStore || {}, { music: MUSIC });

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
  // the pharmacy's own phone (the bot signed in there): a look only, never saved or installed, and not counted as the supplier opening his link
  const preview = (() => { try { return Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k)); } catch (e) { return false; } })();
  let token = tokenFromHash(location.hash) || tokenFromSearch(location.search) || (preview ? null : store.get(KEY));
  if (token && !/^[0-9a-f]{64}$/.test(token)) token = null;
  const client = root.supabase ? root.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }) : null;
  let index = null;
  const S = { kind: '', from: '', to: '', vendor: null, firstAt: null, dataAt: null, sum: null, moves: [], done: false, busy: false, seq: 0, open: new Set(), error: '' };

  async function loadIndex() {
    if (index) return index;
    try { const r = await fetch('store/img/index.json'); index = r.ok ? await r.json() : {}; } catch (e) { index = {}; }
    return index;
  }
  function setStatus(text, bad) { const el = $('spStatus'); el.textContent = text || ''; el.className = 'sp-status' + (bad ? ' bad' : ''); el.hidden = !text; }
  function dead() {
    store.del(KEY);
    $('spBody').hidden = true;
    setStatus(TEXTS.dead, true);
  }
  function lineHtml(l) {
    const pic = picOf(l, index);
    const name = l.n || ('صنف #' + l.i);
    const bits = [esc(qtyText(l))];
    if (num(l.c)) bits.push(`صافي العلبة <span dir="ltr">${esc(money(l.c))}</span>`);
    if (num(l.t) > 0) bits.push(`خصم ${esc(Math.round(num(l.t) * 100) / 100)}%`);
    if (expText(l.x)) bits.push(`صلاحية <span dir="ltr">${esc(expText(l.x))}</span>`);
    return `<div class="it"><div class="ph">${pic ? `<img src="${esc(pic)}" alt="" loading="lazy" onerror="this.parentNode.textContent='💊'" />` : '💊'}</div>` +
      `<div><div class="en">${esc(name)}</div>${l.an ? `<div class="an">${esc(l.an)}</div>` : ''}<div class="d">${bits.join(' · ')} · <b>${esc(money(lineValue(l)))}</b></div></div></div>`;
  }
  function moveHtml(m) {
    const cls = m.kind === 'payment' ? 'pay' : m.kind === 'return' ? 'ret' : 'inv';
    const amt = shownAmount(m);
    const ls = Array.isArray(m.lines) ? m.lines : [];
    const canOpen = m.kind !== 'payment';
    const isOpen = canOpen && (m.kind === 'return' || S.open.has(String(m.id)));
    const code = codeText(m);
    const title = m.kind === 'payment' ? 'دفعة على الحساب' : '';
    return `<div class="mv${canOpen ? ' tap' : ''}"${canOpen ? ` data-sp-move="${esc(m.id)}" role="button" tabindex="0"` : ''}>` +
      `<div class="r1"><span><span class="tag ${cls}">${esc(KIND[m.kind] || m.kind)}</span>${code ? `<span class="code">${esc(code)}</span>` : esc(title)}</span>` +
      `<span class="n${m.kind === 'return' ? ' neg' : m.kind === 'payment' ? ' pay' : ''}">${m.kind === 'purchase' ? '+' : '−'}${esc(money(Math.abs(amt)))}</span></div>` +
      `<div class="r2">${esc(dayLabel(m.at))}${canOpen && ls.length ? ` · ${ls.length} صنف` : ''} · ${esc(afterText(m.balance))}</div>` +
      (isOpen ? `<div class="lines">${ls.length ? ls.map(lineHtml).join('') : `<p class="sp-note">${esc(TEXTS.noLines)}</p>`}</div>` : '') + '</div>';
  }
  function sumHtml() {
    const s = S.sum;
    if (!s) return '';
    const ranged = !!(S.from || S.to);
    const head = ranged ? 'في الفترة دي' : S.firstAt ? `من أول تعامل (${dayLabel(S.firstAt)})` : 'من أول تعامل';
    let h = `<div class="box"><b>${esc(head)}:</b> فواتير <b dir="ltr">${esc(money(s.purchases))}</b> (${esc(num(s.purchases_n))}) · مرتجعات <b dir="ltr">${esc(money(-num(s.returns)))}</b> (${esc(num(s.returns_n))}) · مدفوعات <b dir="ltr">${esc(money(-num(s.payments)))}</b> (${esc(num(s.payments_n))})`;
    if (s.opening != null && s.closing != null) h += `<small>رصيد أول الفترة <span dir="ltr">${esc(money(s.opening))}</span> · آخرها <span dir="ltr">${esc(money(s.closing))}</span></small>`;
    return h + '</div>';
  }
  function draw() {
    const v = S.vendor;
    if (v) {
      document.title = 'كشف حساب ' + v.name + ' · صيدلية عسكر';
      $('spTitle').textContent = 'كشف حساب ' + v.name;
      const b = balanceWords(v.balance);
      $('spBal').className = 'sp-bal ' + b.cls;
      $('spBal').innerHTML = `<span>${esc(b.label)}<small>الرصيد الحالي</small></span><b>${esc(b.text)}</b>`;
    }
    document.querySelectorAll('[data-sp-kind]').forEach((x) => x.classList.toggle('on', (x.dataset.spKind || '') === S.kind));
    $('spSum').innerHTML = sumHtml();
    const st = $('spListStatus');
    if (S.error) { st.textContent = S.error; st.className = 'sp-status bad'; }
    else if (S.busy && !S.moves.length) { st.textContent = TEXTS.loading; st.className = 'sp-status'; }
    else if (!S.moves.length) { st.textContent = TEXTS.none; st.className = 'sp-status'; }
    else { st.textContent = ''; st.className = 'sp-status'; }
    st.hidden = !st.textContent;
    $('spMoves').innerHTML = S.moves.map(moveHtml).join('');
    $('spMore').hidden = S.done || !S.moves.length;
    $('spMore').disabled = S.busy;
    const when = S.dataAt ? new Date(S.dataAt) : null;
    $('spFoot').textContent = TEXTS.foot + (when && !isNaN(when) ? ` آخر تحديث: ${dayLabel(`${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`)} ${pad(when.getHours())}:${pad(when.getMinutes())}.` : '');
  }
  function args(more, limit) {
    const last = more && S.moves.length ? S.moves[S.moves.length - 1] : null;
    return Object.assign({ p_token: token, p_kind: S.kind || null, p_before_at: last ? last.at : null, p_before_id: last ? last.id : null, p_limit: limit || PAGE, p_look: preview }, rangeArgs(S.from, S.to));
  }
  // one call; the answer is dropped when the supplier changed the tab or the dates meanwhile
  async function call(more, limit) {
    const seq = S.seq;
    const { data, error } = await client.rpc('ar_vendor_view', args(more, limit));
    if (error) throw new Error(error.message || String(error));
    if (seq !== S.seq) return null;
    if (!data || !data.ok) { if (data && data.error === 'link') { dead(); return null; } throw new Error('answer'); }
    return data;
  }
  async function load(more) {
    if (!token || !client || (more && (S.busy || S.done))) return;
    if (!more) { S.seq++; S.moves = []; S.done = false; }
    S.busy = true; S.error = ''; draw();
    const seq = S.seq;
    try {
      const data = await call(more);
      if (!data || seq !== S.seq) return;
      if (!more) { S.vendor = data.vendor; S.firstAt = data.first_at; S.dataAt = data.data_at; S.sum = data.sum; $('spBody').hidden = false; setStatus(''); }
      S.moves = more ? S.moves.concat(data.moves || []) : data.moves || [];
      S.done = !data.more;
      if (!preview) { store.set(KEY, token); swapManifest(); }
      await loadIndex();
    } catch (e) {
      if (seq === S.seq) {
        if (!S.vendor) { $('spBody').hidden = true; setStatus(TEXTS.down, true); } else S.error = TEXTS.down;
      }
    } finally {
      if (seq === S.seq) { S.busy = false; draw(); }
    }
  }
  // «🖨 طباعة / حفظ الكشف PDF»: every move of the chosen dates is brought and opened first, then the browser's print (save as PDF)
  async function printAll() {
    const btn = $('spPrint');
    btn.disabled = true; const old = btn.textContent; btn.textContent = TEXTS.printing;
    try {
      let n = 0;
      const seq = S.seq;
      while (!S.done && n++ < PRINT_MAX && seq === S.seq) {
        const data = await call(true, PRINT_PAGE);
        if (!data) break;
        S.moves = S.moves.concat(data.moves || []); S.done = !data.more;
      }
    } catch (e) { /* what is loaded is printed */ }
    S.moves.forEach((m) => { if (m.kind !== 'payment') S.open.add(String(m.id)); });
    await loadIndex();
    draw();
    btn.disabled = false; btn.textContent = old;
    setTimeout(() => root.print(), 100);
  }
  // ---------- install ----------
  let installEvt = null, manifestUrl = null;
  function swapManifest() {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link || !token || preview) return;
    try {
      if (manifestUrl) URL.revokeObjectURL(manifestUrl);
      manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifestFor(token, location.href))], { type: 'application/manifest+json' }));
      link.setAttribute('href', manifestUrl);
    } catch (e) { /* the page's own manifest stays */ }
  }
  const standalone = () => (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) || root.navigator.standalone === true;
  function drawInstall() { $('spInstall').hidden = preview || standalone() || !token; }
  root.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; drawInstall(); });
  root.addEventListener('appinstalled', () => { installEvt = null; $('spInstall').hidden = true; $('spGuide').hidden = true; });
  async function install() {
    const guide = $('spGuide');
    if (installEvt) {
      try { installEvt.prompt(); await installEvt.userChoice; } catch (e) { /* closed */ }
      installEvt = null;
      return;
    }
    const nav = root.navigator;
    guide.textContent = installSteps(nav.userAgent, nav.platform, nav.maxTouchPoints);
    guide.hidden = false;
  }
  // ---------- wiring ----------
  document.addEventListener('click', (e) => {
    const k = e.target.closest('[data-sp-kind]');
    if (k) { S.kind = k.dataset.spKind || ''; load(false); return; }
    const mv = e.target.closest('[data-sp-move]');
    if (mv) { const id = mv.dataset.spMove; if (S.open.has(id)) S.open.delete(id); else S.open.add(id); draw(); return; }
    if (e.target.closest('#spMore')) { load(true); return; }
    if (e.target.closest('#spPrint')) { printAll(); return; }
    if (e.target.closest('#spInstall')) install();
  });
  document.addEventListener('keydown', (e) => {
    const mv = e.target.closest && e.target.closest('[data-sp-move]');
    if (mv && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); mv.click(); }
  });
  $('spFrom').addEventListener('change', () => { S.from = $('spFrom').value; load(false); });
  $('spTo').addEventListener('change', () => { S.to = $('spTo').value; load(false); });

  $('spPreview').hidden = !(preview && token);
  drawInstall();
  if (!token) setStatus(TEXTS.noLink, true);
  else if (!client) setStatus(TEXTS.down, true);
  else load(false);
}(typeof window !== 'undefined' ? window : globalThis));
