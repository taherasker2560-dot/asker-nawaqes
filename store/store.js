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
  const api = { STATUS, SECTIONS, ERRORS, MAX_LINES, MAX_QTY, searchTerms, termFilter, normPhone, money, canAdd, cartAdd, cartSet, cartCount, cartTotal, errorText };
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
  let shown = [], lastQuery = null, offset = 0, seq = 0, sending = false;

  function saveCart() {
    store.set('asker_store_cart', cart);
    const n = cartCount(cart);
    document.querySelectorAll('.cart-n').forEach((el) => { el.textContent = n; el.hidden = !n; });
  }
  function view(name) {
    document.querySelectorAll('[data-view]').forEach((v) => (v.hidden = v.dataset.view !== name));
    document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.go === name));
    if (name === 'cart') drawCart();
    window.scrollTo(0, 0);
  }
  function route() {
    const h = location.hash.replace('#', '');
    if (h === 'cart') view('cart');
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
      cart = []; saveCart();
      $('cNotes').value = '';
      $('doneText').textContent = `طلبك رقم ${data.order_id} وصلنا. الإجمالي ${money(data.total)} جنيه` + (changed ? ' (السعر اتحدّث من الصيدلية)' : '') + '.';
      say('');
      location.hash = 'done';
    } catch (err) {
      say(errorText(), true);
    } finally {
      sending = false; $('sendBtn').disabled = false;
    }
  }

  // events
  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const it = shown.find((x) => String(x.id) === add.dataset.add);
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
})(typeof window === 'undefined' ? globalThis : window);
