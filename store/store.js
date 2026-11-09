/* موقع البيع لصيدلية عسكر (store.html) — نسخة تجريبية (قرار صاحب الصيدلية 2026-11-09).
   الأصناف من الجدول ar_store_items (بييجي من فارمافلاي عن طريق اللاب كل رفع): الاسم والاسم العربي والحالة والسعر للمتوفر بس.
   الطلب بيروح للدالة ar_store_place_order بس، وهي اللي بتحسب السعر والإجمالي من الجدول (مش من الموبايل).
   الدفع كاش عند الاستلام، وصاحب الصيدلية بيأكد مع الزبون على واتساب. السلة وبيانات الزبون محفوظة على موبايل الزبون بس. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/store.cjs) ----------
  const STATUS = {
    available: { label: 'متوفر', cls: 'ok' },
    on_order: { label: 'بالطلب', cls: 'order' },
    unavailable: { label: 'غير متوفر', cls: 'out' },
  };
  // أقسام الرئيسية: أنواع التصنيف (Store\rx\classified.txt) متجمعة
  const SECTIONS = [
    { key: 'meds', name: 'أدوية', mark: 'د', cats: ['antibiotic', 'blood_pressure_heart', 'diabetes', 'neuro_psych', 'hormones', 'controlled_pain', 'anticoagulant', 'cholesterol', 'antiviral_antifungal', 'respiratory_rx', 'urology', 'gi_rx', 'injection_other', 'oncology_immuno', 'other_rx', 'pain_fever', 'cold_allergy', 'stomach_simple', 'skin_drug', 'eye_ear_nose_simple', 'other_otc'] },
    { key: 'vit', name: 'فيتامينات ومكملات', mark: 'ف', cats: ['vitamins_supplements'] },
    { key: 'care', name: 'تجميل وعناية', mark: 'ت', cats: ['cosmetic'] },
    { key: 'baby', name: 'الأم والطفل', mark: 'ط', cats: ['baby'] },
    { key: 'supplies', name: 'مستلزمات طبية', mark: 'م', cats: ['supplies_devices'] },
  ];
  const ERRORS = {
    bad_phone: 'رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01',
    bad_name: 'اكتب اسمك',
    bad_address: 'اكتب العنوان بالتفصيل',
    bad_items: 'السلة فاضية أو فيها أكتر من 30 صنف',
    too_many: 'بعت طلبات كتير في ساعة واحدة. استنى شوية وجرب تاني، أو كلمنا واتساب',
    item_not_available: 'صنف في السلة مبقاش متوفر. افتح السلة وشيله، وبعدين ابعت تاني',
    closed: 'الصيدلية مش بتستقبل طلبات من الموقع دلوقتي. جرب تاني بعد شوية',
  };
  const MAX_LINES = 30, MAX_QTY = 20;

  // كلمات البحث: حروف وأرقام بس (عربي وإنجليزي)، من 2 حروف، وأقصى 5 كلمات. كل كلمة لازم تكون في الاسم أو الاسم العربي.
  function searchTerms(q) {
    const words = String(q || '')
      .replace(/[ً-ْـ]/g, '') // التشكيل والتطويل
      .replace(/[أإآ]/g, 'ا')
      .replace(/[^0-9A-Za-zء-ي٠-٩ ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    return [...new Set(words)].slice(0, 5);
  }
  // فلتر PostgREST لكلمة واحدة: في الاسم أو الاسم العربي (الكلمة متنضفة من الفواصل والأقواس في searchTerms)
  function termFilter(w) {
    const v = /[ء-ي]/.test(w) ? w.replace(/ا/g, '_') : w; // ا ممكن تبقى أ أو إ في الاسم العربي
    return `name.ilike.*${v}*,arabic_name.ilike.*${v}*`;
  }
  function normPhone(p) {
    let d = String(p || '').replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
    if (/^201\d{9}$/.test(d)) d = d.slice(1);
    return /^01\d{9}$/.test(d) ? d : null;
  }
  function money(n) {
    const x = Number(n);
    if (!isFinite(x)) return '';
    return (Math.round(x * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function canAdd(it) {
    return !!it && it.status === 'available' && Number(it.price) > 0 && !it.needs_rx;
  }
  // السلة: [{id, name, arabic_name, price, qty}]
  function cartAdd(cart, it) {
    const c = cart.map((x) => ({ ...x }));
    const f = c.find((x) => x.id === it.id);
    if (f) f.qty = Math.min(MAX_QTY, f.qty + 1);
    else if (c.length < MAX_LINES) c.push({ id: it.id, name: it.name, arabic_name: it.arabic_name || null, price: Number(it.price), qty: 1 });
    return c;
  }
  function cartSet(cart, id, qty) {
    return cart.map((x) => (x.id === id ? { ...x, qty: Math.min(MAX_QTY, qty) } : { ...x })).filter((x) => x.qty > 0);
  }
  function cartCount(cart) {
    return cart.reduce((s, x) => s + x.qty, 0);
  }
  function cartTotal(cart) {
    return Math.round(cart.reduce((s, x) => s + x.qty * Number(x.price || 0), 0) * 100) / 100;
  }
  function errorText(code) {
    return ERRORS[code] || 'الطلب ماتبعتش. جرب تاني بعد شوية';
  }
  // «طلباتي»: الطلبات اللي اتبعتت من الموبايل ده (الأحدث الأول، آخر 20)
  const ORDER_STATUS = { new: 'وصل الصيدلية', confirmed: 'اتأكد', done: 'اتسلّم', cancelled: 'اتلغى' };
  const MAX_SAVED_ORDERS = 20;
  function rememberOrder(list, o) {
    const rest = (Array.isArray(list) ? list : []).filter((x) => x && x.id !== o.id);
    return [o, ...rest].slice(0, MAX_SAVED_ORDERS);
  }
  // «اطلب تاني»: الأصناف اللي لسه متوفرة تتضاف بنفس الكمية، والباقي يتقال اسمه
  function reorderPlan(lines, current) {
    const byId = new Map((current || []).map((it) => [Number(it.id), it]));
    const add = [], missing = [];
    for (const l of lines || []) {
      const it = byId.get(Number(l.id));
      if (canAdd(it)) add.push({ item: it, qty: Math.max(1, Math.min(MAX_QTY, Number(l.qty) || 1)) });
      else missing.push(l.name);
    }
    return { add, missing };
  }
  const api = { STATUS, SECTIONS, ERRORS, MAX_LINES, MAX_QTY, ORDER_STATUS, MAX_SAVED_ORDERS, searchTerms, termFilter, normPhone, money, canAdd, cartAdd, cartSet, cartCount, cartTotal, errorText, rememberOrder, reorderPlan };
  root.AskerStoreLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const SUPABASE_URL = 'https://qwrzdjdgvanmhaicncuk.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_af0XfsvB0Fwwo3HORqMN2g_iJNd9o0q';
  const client = root.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const COLS = 'id,name,arabic_name,status,price,cat,needs_rx';
  const PAGE = 40;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window */ } },
  };
  let cart = store.get('asker_store_cart', []);
  if (!Array.isArray(cart)) cart = [];
  let myOrders = store.get('asker_store_orders', []);
  if (!Array.isArray(myOrders)) myOrders = [];
  let shown = [], popular = [], lastQuery = null, offset = 0, seq = 0, sending = false;
  let settings = { is_open: true };

  function saveCart() {
    store.set('asker_store_cart', cart);
    const n = cartCount(cart);
    document.querySelectorAll('.cart-n').forEach((el) => { el.textContent = n; el.hidden = !n; });
  }
  function view(name) {
    document.querySelectorAll('[data-view]').forEach((v) => (v.hidden = v.dataset.view !== name));
    document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.go === name));
    if (name === 'cart') drawCart();
    if (name === 'orders') drawOrders();
    window.scrollTo(0, 0);
  }
  function route() {
    const h = location.hash.replace('#', '');
    if (h === 'cart') view('cart');
    else if (h === 'orders') view('orders');
    else if (h === 'search') { view('search'); if (!lastQuery) $('q').focus(); }
    else if (h === 'done') view('done');
    else view('home');
  }

  function row(it) {
    const st = STATUS[it.status] || STATUS.on_order;
    const inCart = cart.find((x) => x.id === it.id);
    let action = '';
    if (canAdd(it)) {
      action = `<button type="button" class="add" data-add="${it.id}">${inCart ? 'في السلة (' + inCart.qty + ') +' : 'ضيف للسلة'}</button>`;
    } else if (it.status === 'on_order') {
      action = `<span class="hint-sm">ممكن نجيبهولك: اكتبه في ملاحظات الطلب</span>`;
    }
    return `<article class="item">
      <div class="item-text">
        <h3 dir="ltr">${esc(it.name)}</h3>
        ${it.arabic_name ? `<p class="ar">${esc(it.arabic_name)}</p>` : ''}
        <span class="badge ${st.cls}">${st.label}</span>
      </div>
      <div class="item-side">
        <span class="price">${canAdd(it) ? money(it.price) + ' ج' : '—'}</span>
        ${action}
      </div>
    </article>`;
  }
  function drawList(more) {
    $('results').innerHTML = shown.length ? shown.map(row).join('') : '';
    $('more').hidden = !more;
    drawPopular();
  }
  // الأكثر طلبًا (الرئيسية): الترتيب بييجي من مبيعات الصيدلية على اللاب
  function drawPopular() {
    $('popularBox').hidden = !popular.length;
    $('popular').innerHTML = popular.map(row).join('');
  }
  async function loadPopular() {
    const { data, error } = await client.from('ar_store_items').select(COLS).not('popular_rank', 'is', null).eq('status', 'available').order('popular_rank').limit(12);
    if (error || !data) return;
    popular = data;
    drawPopular();
  }
  // إعدادات الموقع (صاحب الصيدلية بيغيّرها من صفحة البوت)
  async function loadSettings() {
    const { data, error } = await client.from('ar_store_settings').select('is_open,closed_message,hero_title,hero_text,whatsapp').limit(1);
    if (error || !data || !data[0]) return;
    settings = data[0];
    if (settings.hero_title) $('heroTitle').textContent = settings.hero_title;
    if (settings.hero_text) $('heroText').textContent = settings.hero_text;
    const closed = settings.is_open === false;
    document.querySelectorAll('.closed-note').forEach((el) => {
      el.hidden = !closed;
      el.textContent = settings.closed_message || ERRORS.closed;
    });
    $('sendBtn').disabled = closed;
    if (settings.whatsapp) {
      $('contact').hidden = false;
      $('waNumber').textContent = settings.whatsapp;
      $('waLink').href = 'https://wa.me/2' + settings.whatsapp;
    }
  }
  async function runQuery(q, append) {
    const my = ++seq;
    let req = client.from('ar_store_items').select(COLS);
    if (q.terms) for (const w of q.terms) req = req.or(termFilter(w));
    if (q.cats) req = req.in('cat', q.cats).eq('status', 'available');
    req = req.order('status').order('name').range(offset, offset + PAGE - 1);
    $('resNote').textContent = 'بيدوّر…';
    const { data, error } = await req;
    if (my !== seq) return;
    if (error) { $('resNote').textContent = 'مقدرتش أجيب الأصناف. اتأكد من النت وجرب تاني.'; return; }
    shown = append ? shown.concat(data || []) : data || [];
    $('resNote').textContent = shown.length ? (q.title || `نتايج «${q.text}»`) : (q.text ? `مفيش حاجة باسم «${q.text}». جرب جزء من الاسم أو اكتبه إنجليزي.` : 'مفيش أصناف هنا دلوقتي.');
    drawList((data || []).length === PAGE);
  }
  function search(text) {
    const terms = searchTerms(text);
    if (!terms.length) { shown = []; drawList(false); $('resNote').textContent = 'اكتب حرفين على الأقل من اسم الدوا أو المنتج'; return; }
    lastQuery = { terms, text: String(text).trim() };
    offset = 0;
    runQuery(lastQuery, false);
  }
  function openSection(key) {
    const s = SECTIONS.find((x) => x.key === key);
    if (!s) return;
    lastQuery = { cats: s.cats, title: s.name + ' (المتوفر)' };
    offset = 0;
    $('q').value = '';
    location.hash = 'search';
    runQuery(lastQuery, false);
  }

  function drawCart() {
    const box = $('cartItems');
    if (!cart.length) {
      box.innerHTML = '<p class="empty">السلة فاضية. دوّر على اللي محتاجه وضيفه.</p>';
      $('checkout').hidden = true;
      return;
    }
    $('checkout').hidden = false;
    box.innerHTML = cart.map((x) => `<article class="item cart-line">
      <div class="item-text"><h3 dir="ltr">${esc(x.name)}</h3>${x.arabic_name ? `<p class="ar">${esc(x.arabic_name)}</p>` : ''}
        <span class="hint-sm">${money(x.price)} ج للواحدة</span></div>
      <div class="qty">
        <button type="button" data-qty="${x.id}" data-d="1" aria-label="زوّد واحدة">+</button>
        <span>${x.qty}</span>
        <button type="button" data-qty="${x.id}" data-d="-1" aria-label="${x.qty > 1 ? 'قلّل واحدة' : 'شيله من السلة'}">−</button>
      </div></article>`).join('');
    $('sumItems').textContent = money(cartTotal(cart)) + ' ج';
    $('sumTotal').textContent = money(cartTotal(cart)) + ' ج';
  }
  function say(t, bad) {
    const el = $('formMsg');
    el.textContent = t || '';
    el.className = 'form-msg' + (bad ? ' bad' : '');
  }
  async function send(e) {
    e.preventDefault();
    if (sending) return;
    const name = $('cName').value.trim(), phone = normPhone($('cPhone').value), address = $('cAddr').value.trim(), notes = $('cNotes').value.trim();
    if (!cart.length) return say(ERRORS.bad_items, true);
    if (name.length < 2) return say(ERRORS.bad_name, true);
    if (!phone) return say(ERRORS.bad_phone, true);
    if (address.length < 5) return say(ERRORS.bad_address, true);
    store.set('asker_store_me', { name, phone, address });
    sending = true; $('sendBtn').disabled = true; say('بيبعت الطلب…');
    try {
      const { data, error } = await client.rpc('ar_store_place_order', {
        p_name: name, p_phone: phone, p_address: address, p_notes: notes || null,
        p_items: cart.map((x) => ({ id: x.id, qty: x.qty })),
      });
      if (error) throw error;
      if (!data || !data.ok) return say(errorText(data && data.error), true);
      const changed = Math.abs(Number(data.total) - cartTotal(cart)) > 0.009;
      myOrders = rememberOrder(myOrders, {
        id: data.order_id, phone, at: new Date().toISOString(), total: Number(data.total), status: 'new',
        items: (data.items || []).map((x) => ({ id: x.id, name: x.name, qty: x.qty })),
      });
      store.set('asker_store_orders', myOrders);
      cart = []; saveCart();
      $('cNotes').value = '';
      $('doneText').textContent = `طلبك رقم ${data.order_id} وصلنا. الإجمالي ${money(data.total)} جنيه` + (changed ? ' (السعر اتحدّث من الصيدلية)' : '') + '.';
      say('');
      location.hash = 'done';
    } catch (err) {
      say(errorText(), true);
    } finally {
      sending = false; $('sendBtn').disabled = settings.is_open === false;
    }
  }

  // «طلباتي»: الطلبات اللي اتبعتت من الموبايل ده، وحالتها من الصيدلية، و«اطلب تاني»
  function when(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' }) + ' · ' + d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
  }
  function drawOrders() {
    const box = $('ordersList');
    if (!myOrders.length) { box.innerHTML = '<p class="empty">لسه مابعتش طلبات من الموبايل ده.</p>'; return; }
    box.innerHTML = myOrders.map((o) => `<article class="order">
      <div class="order-head"><strong>طلب رقم ${esc(o.id)}</strong><span class="badge st-${esc(o.status)}">${esc(ORDER_STATUS[o.status] || '')}</span></div>
      <span class="hint-sm">${esc(when(o.at))} · ${money(o.total)} ج</span>
      <ul class="order-lines">${(o.items || []).map((x) => `<li><span dir="ltr">${esc(x.name)}</span> × ${esc(x.qty)}</li>`).join('')}</ul>
      <button type="button" class="again" data-again="${esc(o.id)}">اطلب تاني</button>
    </article>`).join('');
    refreshStatuses();
  }
  let statusAt = 0;
  async function refreshStatuses() {
    if (!myOrders.length || Date.now() - statusAt < 30000) return;
    statusAt = Date.now();
    const byPhone = {};
    for (const o of myOrders) (byPhone[o.phone] = byPhone[o.phone] || []).push(o.id);
    let changed = false;
    for (const phone of Object.keys(byPhone)) {
      const { data, error } = await client.rpc('ar_store_order_status', { p_ids: byPhone[phone], p_phone: phone });
      if (error || !Array.isArray(data)) continue;
      for (const s of data) {
        const o = myOrders.find((x) => x.id === s.id);
        if (o && o.status !== s.status) { o.status = s.status; changed = true; }
      }
    }
    if (changed) { store.set('asker_store_orders', myOrders); if (location.hash === '#orders') drawOrders(); }
  }
  async function orderAgain(id, btn) {
    const o = myOrders.find((x) => String(x.id) === String(id));
    if (!o) return;
    btn.disabled = true;
    const { data, error } = await client.from('ar_store_items').select(COLS).in('id', (o.items || []).map((x) => x.id));
    btn.disabled = false;
    if (error) { $('ordersNote').textContent = 'مقدرتش أجيب الأصناف. اتأكد من النت وجرب تاني.'; return; }
    const plan = reorderPlan(o.items, data);
    for (const a of plan.add) { cart = cartAdd(cart, a.item); cart = cartSet(cart, a.item.id, a.qty); }
    saveCart();
    $('ordersNote').textContent = plan.add.length
      ? `اتضاف ${plan.add.length} صنف للسلة` + (plan.missing.length ? `، و${plan.missing.length} مش متوفر دلوقتي: ${plan.missing.join('، ')}` : '')
      : 'الأصناف دي كلها مش متوفرة دلوقتي';
    if (plan.add.length) location.hash = 'cart';
  }

  // events
  document.addEventListener('click', (e) => {
    const again = e.target.closest('[data-again]');
    if (again) { orderAgain(again.dataset.again, again); return; }
    const add = e.target.closest('[data-add]');
    if (add) {
      const it = shown.concat(popular).find((x) => String(x.id) === add.dataset.add);
      if (it && canAdd(it)) {
        if (cart.length >= MAX_LINES && !cart.find((x) => x.id === it.id)) { $('resNote').textContent = 'السلة فيها 30 صنف، ودي أقصى حاجة في الطلب الواحد'; return; }
        cart = cartAdd(cart, it); saveCart(); drawList(!$('more').hidden);
      }
      return;
    }
    const q = e.target.closest('[data-qty]');
    if (q) {
      const id = Number(q.dataset.qty), line = cart.find((x) => x.id === id);
      if (line) { cart = cartSet(cart, id, line.qty + Number(q.dataset.d)); saveCart(); drawCart(); }
      return;
    }
    const sec = e.target.closest('[data-section]');
    if (sec) { e.preventDefault(); openSection(sec.dataset.section); }
  });
  let timer = null;
  $('q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => search($('q').value), 350); });
  $('searchForm').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); search($('q').value); $('q').blur(); });
  $('homeSearch').addEventListener('focus', () => { location.hash = 'search'; setTimeout(() => $('q').focus(), 50); });
  $('more').addEventListener('click', () => { if (!lastQuery) return; offset += PAGE; runQuery(lastQuery, true); });
  $('orderForm').addEventListener('submit', send);
  window.addEventListener('hashchange', route);

  $('sections').innerHTML = SECTIONS.map((s) => `<a href="#search" data-section="${s.key}" class="sec"><span class="sec-mark">${s.mark}</span><span>${s.name}</span></a>`).join('');
  const me = store.get('asker_store_me', null);
  if (me) { $('cName').value = me.name || ''; $('cPhone').value = me.phone || ''; $('cAddr').value = me.address || ''; }
  saveCart();
  route();
  loadSettings();
  loadPopular();
})(typeof window === 'undefined' ? globalThis : window);
