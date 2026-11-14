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
    // «صعب طلبه» على فارمافلاي = أصناف النواقص (مينالاكس مثلًا): «غير متوفر» ومش بيتطلب، وبيظهر البديل (قراره 2026-11-12)
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
  // «محتاج إيه النهارده؟» على الرئيسية (2026-11-12): شكاوى شائعة ← أنواع التصنيف بتاعتها (المتوفر بس)
  const NEEDS = [
    { key: 'n-cold', name: 'برد وكحة', cats: ['cold_allergy'] },
    { key: 'n-pain', name: 'صداع ووجع', cats: ['pain_fever'] },
    { key: 'n-stomach', name: 'معدة وهضم', cats: ['stomach_simple'] },
    { key: 'n-skin', name: 'بشرة وشعر', cats: ['skin_drug', 'cosmetic'] },
    { key: 'n-eye', name: 'عين وأنف وودن', cats: ['eye_ear_nose_simple'] },
    { key: 'n-kids', name: 'أطفال ورضّع', cats: ['baby'] },
    { key: 'n-vit', name: 'فيتامينات ومناعة', cats: ['vitamins_supplements'] },
  ];
  // «شفته قريب»: آخر الأصناف اللي الزبون فتحها على الموبايل ده (أحدث واحد الأول، 10 بالكتير)
  const MAX_SEEN = 10;
  function rememberSeen(list, it) {
    if (!it || it.id == null) return Array.isArray(list) ? list : [];
    const keep = { id: it.id, name: it.name, arabic_name: it.arabic_name || null, status: it.status, price: it.price, cat: it.cat, needs_rx: !!it.needs_rx };
    return [keep].concat((Array.isArray(list) ? list : []).filter((x) => x && x.id !== it.id)).slice(0, MAX_SEEN);
  }
  const ERRORS = {
    bad_phone: 'رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01',
    bad_name: 'اكتب اسمك',
    bad_address: 'اكتب العنوان بالتفصيل',
    bad_items: 'السلة فاضية أو فيها أكتر من 30 صنف',
    too_many: 'بعت طلبات كتير في ساعة واحدة. استنى شوية وجرب تاني، أو كلمنا واتساب',
    item_not_available: 'صنف في السلة مبقاش متوفر. افتح السلة وشيله، وبعدين ابعت تاني',
    closed: 'الصيدلية مش بتستقبل طلبات من الموقع دلوقتي. جرب تاني بعد شوية',
    bad_rx: 'صورة الروشتة ماوصلتش. اختارها تاني وابعت',
    rx_upload: 'صورة الروشتة مارفعتش. اتأكد من النت وجرب تاني',
    rx_big: 'الصورة أكبر من 8 ميجا. صوّرها تاني',
    bad_text: 'اسم الصنف اللي كتبته لازم يكون من 2 لـ 120 حرف',
    too_many_text: 'تقدر تكتب 10 أصناف بالكتير في الطلب الواحد',
    // a customer ordering from his personal link (store/account.js)
    stopped: 'حسابك اتوقف، فالطلب ده كاش عند الاستلام. دوس «إرسال الطلب» تاني',
    link: 'الرابط ده مبقاش شغال. اطلب رابط جديد من الصيدلية، أو اكتب اسمك وابعت الطلب عادي',
    bad_pay: 'اختار طريقة الدفع',
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
  // «بالطلب» (مفيش رصيد، الصيدلية بتجيبه): بيتطلب من غير سعر، والسعر بيتأكد مع الزبون يوم الطلب (قرار 2026-11-10)
  // «غير متوفر» (unavailable = النواقص) مش بيتطلب؛ بيظهر تحته البديل المتوفر
  function onOrder(it) {
    return !!it && it.status === 'on_order';
  }
  function canAdd(it) {
    return !!it && !it.needs_rx && ((it.status === 'available' && Number(it.price) > 0) || onOrder(it));
  }
  // صنف مش على الموقع خالص: الزبون بيكتب اسمه ويضيفه للطلب سطر لوحده من غير سعر (عشان يتزامن مع النواقص بعدين)
  const MAX_TEXT_LINES = 10;
  function cleanText(t) {
    return String(t || '').replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function cartAddText(cart, text) {
    const name = cleanText(text);
    if (name.length < 2 || name.length > 120) return { cart, error: 'bad_text' };
    const c = cart.map((x) => ({ ...x }));
    const id = 't:' + name.toLowerCase();
    const f = c.find((x) => x.id === id);
    if (f) { f.qty = Math.min(MAX_QTY, f.qty + 1); return { cart: c }; }
    if (c.length >= MAX_LINES) return { cart, error: 'bad_items' };
    if (c.filter((x) => x.free_text).length >= MAX_TEXT_LINES) return { cart, error: 'too_many_text' };
    c.push({ id, name, arabic_name: null, price: null, qty: 1, on_order: true, free_text: true });
    return { cart: c };
  }
  // اللي بيتبعت للسيرفر: {id, qty} للصنف اللي على الموقع، و{text, qty} للي الزبون كتبه
  function orderItems(cart) {
    return cart.map((x) => (x.free_text ? { text: x.name, qty: x.qty } : { id: x.id, qty: x.qty }));
  }
  // السلة: [{id, name, arabic_name, price, qty, on_order}] (price = null للصنف اللي بالطلب)
  function cartAdd(cart, it) {
    const c = cart.map((x) => ({ ...x }));
    const f = c.find((x) => x.id === it.id);
    if (f) f.qty = Math.min(MAX_QTY, f.qty + 1);
    else if (c.length < MAX_LINES) {
      const later = onOrder(it);
      c.push(later ? { id: it.id, name: it.name, arabic_name: it.arabic_name || null, price: null, qty: 1, on_order: true }
                    : { id: it.id, name: it.name, arabic_name: it.arabic_name || null, price: Number(it.price), qty: 1 });
    }
    return c;
  }
  function cartLater(cart) {
    return cart.filter((x) => x.on_order).length;
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
      if (l.free_text) { add.push({ text: l.name, qty: Math.max(1, Math.min(MAX_QTY, Number(l.qty) || 1)) }); continue; }
      const it = byId.get(Number(l.id));
      if (canAdd(it)) add.push({ item: it, qty: Math.max(1, Math.min(MAX_QTY, Number(l.qty) || 1)) });
      else missing.push(l.name);
    }
    return { add, missing };
  }
  // صور الروشتة: نفس المسار اللي السيرفر بيقبله (rx/<يوم>/<اسم عشوائي>.<نوع>)، 4 صور بالكتير، 8 ميجا للصورة
  const MAX_RX = 4, MAX_RX_BYTES = 8 * 1024 * 1024;
  function rxExt(type, name) {
    const t = String(type || '').toLowerCase(), n = String(name || '').toLowerCase();
    if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
    if (t === 'image/png') return 'png';
    if (t === 'image/webp') return 'webp';
    if (t === 'image/heic' || t === 'image/heif' || n.endsWith('.heic')) return 'heic';
    return 'jpg';
  }
  function rxPath(day, id, ext) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^[0-9a-f-]{20,40}$/.test(id) || !/^(jpg|png|webp|heic|pdf)$/.test(ext)) return null;
    return `rx/${day}/${id}.${ext}`;
  }
  // شكل الصنف من اسمه (للأيقونة لما مايكونش له صورة)
  function shapeOf(name, cat) {
    const n = ' ' + String(name || '').toUpperCase() + ' ';
    if (/\b(SYR|SYP|SYRUP|SUSP|SUSPENSION|ELIXIR|SOLUTION|ORAL SOL)\b|\d+\s*(ML|CC)\b.*\b(SYR|SUSP)|شراب/.test(n)) return 'bottle';
    if (/\b(AMP|AMPOULE|VIAL|VL|INJ|INJECTION|I\.?M\.?|I\.?V\.?|PEN|SYRINGE|UNIT\/ML)\b|حقن|امبول/.test(n)) return 'injection';
    if (/\b(DROP|DROPS|E\.?D\.?|EYE|EAR|NASAL|NSE)\b|نقط|قطرة/.test(n)) return 'drops';
    if (/\b(CREAM|CREA|CR|OINT|OINTMENT|GEL|LOTION|LOT|PASTE)\b|كريم|مرهم|جل/.test(n)) return 'tube';
    if (/\b(SPRAY|INH|INHALER|AEROSOL|FOAM)\b|بخاخ|سبراي/.test(n)) return 'spray';
    if (/\b(MILK|FORMULA)\b|\d+\s*(G|GM|GR)\b/.test(n) || cat === 'baby') return 'can';
    if (/\b(TAB|TABS|TABLET|TABLETS|T|CAP|CAPS|CAPSULE|CAPSULES|EFF|SACH|SACHETS)\b|\d+\s*(T|TAB|CAP)\b|قرص|كبسول|اكياس/.test(n)) return 'pills';
    if (cat === 'cosmetic') return 'tube';
    return 'box';
  }
  // كارت الصنف اللي مالوش صورة (owner 2026-11-13 «اعمله»): لون القسم، الشكل، اسم قصير، والتركيز أو الحجم.
  // مش صورة العلبة؛ أول ما صورة حقيقية تتوافق عليها بتاخد مكانه.
  const FORM_WORDS = /^(TAB|TABS|TABLET|TABLETS|TAP|T|CAP|CAPS|CAPSULE|CAPSULES|SYR|SYP|SYRUP|SUSP|SUSPENSION|CREAM|CREA|CR|OINT|OINTMENT|GEL|EMULGEL|LOTION|AMP|AMPOULE|AMPOULES|VIAL|VL|INJ|DROPS|DRPS|DROP|SPRAY|SACH|SACHETS|EFF|SUPP|F\.?C\.?|SR|XR|MR|CR|ER|ORAL|SOL|SOLUTION|POWDER|PDR|IM|IV|I\.?M\.?|I\.?V\.?)\.?$/;
  function cardInfo(it) {
    const name = String((it && it.name) || '').replace(/\s+/g, ' ').trim();
    const cat = it && it.cat;
    const sec = (SECTIONS.find((s) => s.cats.includes(cat)) || { key: 'other' }).key;
    // التركيز أو الحجم: أول رقم بوحدة (25MG، 120 ML، 10000 IU، 0.1%، 400 GM)
    const m = /(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)*)\s*(MG|MCG|ML|CC|GM|G|IU|%)(?![A-Z])/i.exec(name);
    const strength = m ? (m[1].replace(/\s+/g, '') + ' ' + (m[2].toUpperCase() === 'CC' ? 'ML' : m[2].toUpperCase())).replace(' %', '%') : '';
    // اسم قصير: الكلام قبل أول رقم أو كلمة شكل (TAB, SYRUP...)، كلمتين بالكتير
    const words = [];
    for (const w of name.split(' ')) {
      const u = w.toUpperCase();
      if (/\d/.test(u) || FORM_WORDS.test(u)) break;
      words.push(w);
      if (words.length === 2) break;
    }
    let short = (words.length ? words : name.split(' ').slice(0, 2)).join(' ');
    if (short.length > 18) short = short.slice(0, 17).trim() + '…';
    return { sec, shape: shapeOf(name, cat), short, strength };
  }
  // رابط صنف واحد (#item=رقم): بيفتح صفحة الصنف على طول (زرار «ابعت الصنف لحد»)
  function itemIdFromHash(h) {
    const m = /^#?item=(\d{1,9})$/.exec(String(h || ''));
    return m ? Number(m[1]) : null;
  }
  function itemLink(base, id) {
    return String(base || '').replace(/#.*$/, '') + '#item=' + Number(id);
  }
  function shareText(it, link) {
    const nm = it.arabic_name || it.name;
    const pr = it.status === 'available' && Number(it.price) > 0 ? ` بـ ${money(it.price)} جنيه` : '';
    return `${nm}${pr} من صيدلية عسكر، اطلبه من هنا: ${link}`;
  }
  // بيان الصنف (2026-11-14): جملة تسويقية + بيستخدم في / مميزاته / تنبيهات، وتحته إن ده مش بديل عن الصيدلي
  const DESC_SECTIONS = [['u', 'بيستخدم في', ''], ['f', 'مميزاته', ''], ['w', 'تنبيهات وأضرار', ' warn']];
  function descHtml(d) {
    if (!d || typeof d !== 'object') return '';
    const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const list = (a) => (Array.isArray(a) ? a.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 5) : []);
    const parts = DESC_SECTIONS.map(([k, title, cls]) => {
      const l = list(d[k]);
      return l.length ? `<div class="ds-sec${cls}"><h4>${title}</h4><ul>${l.map((x) => `<li translate="no">${e(x)}</li>`).join('')}</ul></div>` : '';
    }).join('');
    const h = String(d.h || '').trim();
    if (!h && !parts) return '';
    return `${h ? `<p class="ds-hook" translate="no">${e(h)}</p>` : ''}${parts}<p class="ds-note">المعلومات دي للتعريف بس ومش بديل عن استشارة الصيدلي أو الطبيب.</p>`;
  }
  const api = { descHtml, DESC_SECTIONS, cardInfo, NEEDS, rememberSeen, MAX_SEEN, cartAddText, orderItems, cleanText, MAX_TEXT_LINES, itemIdFromHash, itemLink, shareText, STATUS, SECTIONS, ERRORS, MAX_LINES, MAX_QTY, ORDER_STATUS, MAX_SAVED_ORDERS, MAX_RX, MAX_RX_BYTES, shapeOf, searchTerms, termFilter, normPhone, money, onOrder, canAdd, cartAdd, cartLater, cartSet, cartCount, cartTotal, errorText, rememberOrder, reorderPlan, rxExt, rxPath };
  root.AskerStoreLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const SUPABASE_URL = 'https://qwrzdjdgvanmhaicncuk.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_af0XfsvB0Fwwo3HORqMN2g_iJNd9o0q';
  const client = root.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  // a credit customer's personal link (store/account.js, owner 2026-11-13): «حسابي» and ordering on his account
  const acct = root.AskerStoreAccount || null;
  // «الرسايل» (store/chat.js, owner 2026-11-13): our own messages page
  const chat = root.AskerStoreChat || null;
  const COLS = 'id,name,arabic_name,status,price,cat,needs_rx';
  const DESC_SHARDS = 20, DESC_VER = '20261114a';
  const PAGE = 40;
  const $ = (id) => document.getElementById(id);
  // the name read out for an item (screen readers, photo text): the English name in English, else the Arabic one if any
  const label = (it) => (root.AskerI18n && root.AskerI18n.lang() === 'en' ? it.name : (it.arabic_name || it.name));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window */ } },
  };
  let cart = store.get('asker_store_cart', []);
  if (!Array.isArray(cart)) cart = [];
  let myOrders = store.get('asker_store_orders', []);
  if (!Array.isArray(myOrders)) myOrders = [];
  let seen = store.get('asker_store_seen', []);
  if (!Array.isArray(seen)) seen = [];
  let cartShown = null; // the cart number already on screen (null = page just opened: no jump)
  let shown = [], popular = [], lastQuery = null, offset = 0, seq = 0, sending = false;
  // البدايل: {id الصنف اللي مش متوفر: [أصناف متوفرة بنفس المادة الفعالة والتركيز والشكل]} (ar_store_alternatives، 2026-11-11)
  let alts = {};
  let settings = { is_open: true };
  let rxFiles = []; // [{file, url}] صور الروشتة اللي الزبون اختارها (على الموبايل لحد ما يبعت)
  // صور الأصناف اللي صاحب الصيدلية وافق عليها: store/img/index.json = {id: "اسم الملف"}
  let pics = {};
  const ICONS = {
    pills: '<rect x="3" y="9" width="18" height="6" rx="3"/><path d="M12 9v6"/>',
    bottle: '<path d="M9 3h6v3l2 3v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9l2-3z"/><path d="M7 12h10"/>',
    injection: '<path d="M18 2l4 4M17 7l-9 9-3 1 1-3 9-9zM14 4l6 6M3 21l3-3"/>',
    drops: '<path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z"/>',
    tube: '<path d="M8 3h8l-1 4H9zM9 7h6v12a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/>',
    spray: '<path d="M9 8h6v13H9zM10 8V5h4v3M14 5h3M18 3v1M19 6h1"/>',
    can: '<ellipse cx="12" cy="5" rx="7" ry="2"/><path d="M5 5v14c0 1.1 3.1 2 7 2s7-.9 7-2V5"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
  };
  // أيقونات الأقسام في الرئيسية (بدل الحرف)
  const SEC_ICONS = {
    meds: '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-35 12 12)"/><path d="M9.5 8.3l5 7.4" />',
    vit: '<path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z"/><path d="M5 19l7-7"/>',
    care: '<path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
    baby: '<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/><path d="M10.5 8h.01M13.5 8h.01"/>',
    supplies: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M12 11v5M9.5 13.5h5"/>',
  };
  // تعديلات صاحب الصيدلية من الموقع نفسه (ar_store_edits، 2026-11-14): صورة تانية / من غير صورة / بيان بتاعه / من غير بيان
  let edits = {};
  const EDIT_IMG = SUPABASE_URL + '/storage/v1/object/public/ar-store-img/';
  function picSrc(it) {
    const e = edits[it.id];
    if (e && e.img_off) return null;
    if (e && e.img) return EDIT_IMG + e.img;
    return pics[it.id] ? 'store/img/' + pics[it.id] : null;
  }
  async function loadEdits() {
    try {
      const { data, error } = await client.from('ar_store_edits').select('item_id,img,img_off,descr,desc_off');
      if (error || !Array.isArray(data)) return;
      edits = {}; for (const r of data) edits[r.item_id] = r;
      drawList(!$('more').hidden); if (sheetItem) drawSheet();
    } catch (e) { /* the table is not there yet: the site works as before */ }
  }
  // بيان الصنف (2026-11-14): store/desc/<id % 20>.json = {t: [{h,u,f,w}], i: {id: رقم البيان}}، بيتحمّل لما تفتح صنف بس
  const descShards = {};
  function descShard(id) {
    const n = Number(id) % DESC_SHARDS;
    if (!descShards[n]) descShards[n] = fetch(`store/desc/${n}.json?v=${DESC_VER}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return descShards[n];
  }
  async function descOf(id) {
    const e = edits[id];
    if (e && e.desc_off) return null;
    if (e && e.descr) return e.descr;
    const s = await descShard(id);
    return s && s.i && s.i[id] != null ? s.t[s.i[id]] || null : null;
  }
  function thumb(it) {
    const src = picSrc(it);
    if (src) return `<div class="thumb" data-open="${it.id}"><img src="${esc(src)}" alt="" loading="lazy"></div>`;
    return `<div class="thumb card c-${cardInfo(it).sec}" data-open="${it.id}" aria-hidden="true">${cardHtml(it)}</div>`;
  }
  function cardHtml(it) {
    const c = cardInfo(it);
    return `${c.strength ? `<span class="cd-st" dir="ltr">${esc(c.strength)}</span>` : ''}<svg viewBox="0 0 24 24">${ICONS[c.shape]}</svg>`
      + `<span class="cd-nm" dir="auto" translate="no">${esc(c.short)}</span><span class="cd-lg">صيدلية عسكر</span>`;
  }
  async function loadPics() {
    try {
      const r = await fetch('store/img/index.json', { cache: 'no-cache' });
      if (r.ok) pics = await r.json();
    } catch (e) { pics = {}; }
    drawList(!$('more').hidden);
    if (sheetItem) drawSheet(); // an item opened from a link before the photo list came
  }

  function saveCart() {
    store.set('asker_store_cart', cart);
    const n = cartCount(cart);
    // a jump of the cart number (and the cart button) when something is added, the first item included
    const up = cartShown !== null && n > cartShown;
    cartShown = n;
    document.querySelectorAll('.cart-n').forEach((el) => {
      el.textContent = n; el.hidden = !n;
      if (up) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    });
    if (up) document.querySelectorAll('a.cart-btn[href="#cart"], .tabbar a[data-go="cart"]').forEach((el) => { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); });
    drawHomeCards();
  }
  function view(name) {
    document.querySelectorAll('[data-view]').forEach((v) => (v.hidden = v.dataset.view !== name));
    document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.go === name));
    if (name === 'cart') drawCart();
    if (name === 'orders') drawOrders();
    if (name === 'account' && acct) acct.draw();
    if (chat) { if (name === 'chat') chat.open(); else chat.close(); }
    window.scrollTo(0, 0);
  }
  function route() {
    const linked = itemIdFromHash(location.hash);
    if (linked) {
      if (document.querySelectorAll('[data-view]:not([hidden])').length !== 1) view('home');
      openFromLink(linked);
      return;
    }
    closeItem();
    if (root.AskerStoreTheme && !$('themeSheet').hidden) root.AskerStoreTheme.open(false);
    const h = location.hash.replace('#', '');
    if (h === 'cart') view('cart');
    else if (h === 'orders') view('orders');
    else if (h === 'search') { view('search'); if (!lastQuery) $('q').focus(); }
    else if (h === 'done') view('done');
    else if (h === 'account' && acct && acct.linked()) view('account');
    else if (h === 'chat' && chat) view('chat');
    else view('home');
  }

  function row(it) {
    const st = STATUS[it.status] || STATUS.on_order;
    const inCart = cart.find((x) => x.id === it.id);
    let action = '';
    if (canAdd(it)) {
      action = `<button type="button" class="add" data-add="${it.id}">${inCart ? 'في السلة (' + inCart.qty + ') +' : onOrder(it) ? 'اطلبه' : 'ضيف للسلة'}</button>`;
    } else if (it.needs_rx) {
      action = `<span class="hint-sm">بالروشتة: ابعت صورة الروشتة</span>`;
    }
    const al = !canAdd(it) || it.status !== 'available' ? alts[it.id] || [] : [];
    const altBox = al.length ? `<div class="alts"><span class="alts-h">بديل متوفر بنفس المادة الفعالة والتركيز:</span>
      ${al.map((a) => `<div class="alt"><span dir="ltr">${esc(a.name)}</span><span class="alt-p">${money(a.price)} ج</span>
        <button type="button" class="add sm" data-add="${a.id}">${cart.find((x) => x.id === a.id) ? 'في السلة +' : 'ضيف'}</button></div>`).join('')}
      <span class="hint-sm">اتأكد مع الصيدلي قبل ما تغيّر الدوا</span></div>` : '';
    return `<article class="item${altBox ? ' has-alts' : ''}">
      ${thumb(it)}
      <div class="item-text" data-open="${it.id}" role="button" tabindex="0" aria-label="تفاصيل ${esc(label(it))}">
        <h3 dir="ltr">${esc(it.name)}</h3>
        ${it.arabic_name ? `<p class="ar">${esc(it.arabic_name)}</p>` : ''}
        <span class="badge ${st.cls}">${st.label}</span>
      </div>
      <div class="item-side">
        <span class="price${onOrder(it) ? ' later' : ''}">${onOrder(it) ? 'السعر يوم الطلب' : canAdd(it) ? money(it.price) + ' ج' : '—'}</span>
        ${action}
      </div>
      ${altBox}
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
    drawSeen();
  }
  // «شفته قريب» (السعر والحالة من آخر مرة اتفتح فيها؛ السيرفر بيحسب السعر الصح وقت الطلب)
  function drawSeen() {
    const list = seen.filter((x) => !popular.some((p) => p.id === x.id)).slice(0, MAX_SEEN);
    $('seenBox').hidden = list.length < 2;
    $('seen').innerHTML = list.length < 2 ? '' : list.map(row).join('');
  }
  // كروت الرئيسية: «كمّل طلبك» لما السلة فيها حاجة، و«اطلب طلبك اللي فات تاني»
  function drawHomeCards() {
    const n = cartCount(cart);
    $('cartCard').hidden = !n;
    if (n) {
      const t = cartTotal(cart), later = cart.filter((x) => x.on_order).length;
      $('cartCardText').textContent = `${n} صنف في السلة` + (t > 0 ? ` · ${money(t)} ج` : '') + (later ? ' + أصناف بالطلب' : '');
    }
    const last = myOrders.find((o) => (o.items || []).length);
    $('againCard').hidden = !last || !!n;
    if (last && !n) {
      $('againText').textContent = `طلب رقم ${last.id} · ${last.items.length} صنف`;
      $('againBtn').dataset.again = last.id;
    }
  }
  // الشرايح اللي فوق: بتلف لوحدها كل 5 ثواني، وبتتسحب بالصباع
  function startSlides() {
    const box = $('slides'), dots = $('dots');
    const slides = () => [...box.querySelectorAll('.slide:not([hidden])')];
    const drawDots = () => { dots.innerHTML = slides().map(() => '<i></i>').join(''); mark(); };
    const at = () => Math.round(Math.abs(box.scrollLeft) / Math.max(1, box.clientWidth));
    const mark = () => { const i = at(); [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i)); };
    box.addEventListener('scroll', () => { clearTimeout(box._t); box._t = setTimeout(mark, 60); }, { passive: true });
    let paused = false;
    box.addEventListener('pointerdown', () => { paused = true; setTimeout(() => { paused = false; }, 8000); });
    setInterval(() => {
      if (paused || document.hidden || box.closest('[hidden]')) return;
      const n = slides().length; if (n < 2) return;
      const next = (at() + 1) % n, dir = getComputedStyle(box).direction === 'rtl' ? -1 : 1;
      box.scrollTo({ left: dir * next * box.clientWidth, behavior: 'smooth' });
    }, 5000);
    drawDots();
    startSlides.redraw = drawDots;
  }
  const skel = (n) => Array.from({ length: n }, () => '<article class="item skel" aria-hidden="true"><div class="thumb"></div><i></i><i></i><i class="s"></i></article>').join('');
  async function loadPopular() {
    const cached = store.get('asker_store_pop', null);
    if (Array.isArray(cached) && cached.length) { popular = cached; drawPopular(); }
    else { $('popularBox').hidden = false; $('popular').innerHTML = skel(3); }
    const { data, error } = await client.from('ar_store_items').select(COLS).not('popular_rank', 'is', null).eq('status', 'available').order('popular_rank').limit(12);
    if (error || !data) { if (!popular.length) drawPopular(); return; }
    popular = data;
    store.set('asker_store_pop', data);
    drawPopular();
  }
  // إعدادات الموقع (صاحب الصيدلية بيغيّرها من صفحة البوت)
  // speed (owner 2026-11-12, «حسّن هيئة وأداء الموقع»): the last settings and best sellers are kept on the phone and drawn at
  // once on the next visit, then refreshed from the server; until the first answer, gray placeholder cards (skeleton)
  async function loadSettings() {
    const cached = store.get('asker_store_settings', null);
    if (cached && typeof cached === 'object') applySettings(cached);
    // the visitor may read only some columns (column grants): with the colors first, and if the colors are not readable
    // (no grant yet), without them. Never '*': one column without a grant makes the whole answer fail (401).
    const BASE = 'is_open,closed_message,hero_title,hero_text,whatsapp';
    let { data, error } = await client.from('ar_store_settings').select(BASE + ',theme_color,theme_night').limit(1);
    if (error) ({ data, error } = await client.from('ar_store_settings').select(BASE).limit(1));
    if (error || !data || !data[0]) return;
    store.set('asker_store_settings', data[0]);
    applySettings(data[0]);
  }
  function applySettings(s) {
    settings = s;
    if (root.AskerStoreTheme && 'theme_color' in settings) root.AskerStoreTheme.setDefault(settings.theme_color, settings.theme_night);
    // the owner's own texts: in English they are used only when the dictionary knows them, else the page's English stays
    const own = (t) => {
      const I = root.AskerI18n;
      if (!t || !I || I.lang() !== 'en') return t || null;
      return /[؀-ۿ]/.test(I.translate(t)) ? null : t;
    };
    if (own(settings.hero_title)) $('heroTitle').textContent = settings.hero_title;
    if (own(settings.hero_text)) $('heroText').textContent = settings.hero_text;
    const closed = settings.is_open === false;
    document.querySelectorAll('.closed-note').forEach((el) => {
      el.hidden = !closed;
      el.textContent = own(settings.closed_message) || ERRORS.closed;
    });
    $('sendBtn').disabled = closed;
    if (settings.whatsapp) {
      // «اسأل الصيدلي»: شريحة فوق وزرار واتساب عايم
      const wa = 'https://wa.me/2' + settings.whatsapp + '?text=' + encodeURIComponent('عندي سؤال للصيدلي');
      $('slideWaBtn').href = wa; $('waFab').href = wa;
      $('slideWa').hidden = false; $('waFab').hidden = false;
      if (startSlides.redraw) startSlides.redraw();
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
    if (!append) { $('results').innerHTML = skel(4); $('more').hidden = true; }
    const { data, error } = await req;
    if (my !== seq) return;
    if (error) { $('resNote').textContent = 'مقدرتش أجيب الأصناف. اتأكد من النت وجرب تاني.'; return; }
    shown = append ? shown.concat(data || []) : data || [];
    loadAlts((data || []).filter((x) => x.status !== 'available').map((x) => x.id));
    $('resNote').textContent = shown.length ? (q.title || `نتايج «${q.text}»`) : (q.text ? `مفيش حاجة باسم «${q.text}». جرب جزء من الاسم أو اكتبه إنجليزي.` : 'مفيش أصناف هنا دلوقتي.');
    drawList((data || []).length === PAGE);
  }
  // البدايل للأصناف اللي مش متوفرة في الصفحة دي (طلب واحد للصفحة كلها)
  async function loadAlts(ids) {
    const need = ids.filter((id) => !(id in alts)).slice(0, 40);
    if (!need.length) return;
    need.forEach((id) => { alts[id] = []; });
    const { data, error } = await client.rpc('ar_store_alternatives', { p_ids: need });
    if (error || !Array.isArray(data)) return;
    for (const r of data) alts[r.id] = r.alts || [];
    if (data.length) { drawList(!$('more').hidden); if (sheetItem) drawSheet(); }
  }

  // ---------- صفحة الصنف (sheet) ----------
  let sheetItem = null, sheetQty = 1, sheetFromLink = false;
  const known = () => shown.concat(popular, seen, sheetItem ? [sheetItem] : [], ...Object.values(alts));
  function openItem(it, fromLink) {
    sheetItem = it; sheetQty = 1; sheetFromLink = !!fromLink;
    seen = rememberSeen(seen, it); store.set('asker_store_seen', seen); drawSeen();
    $('shNote').textContent = '';
    if (!canAdd(it) || it.status !== 'available') loadAlts([it.id]);
    drawSheet();
    $('sheet').hidden = false;
    document.body.classList.add('sheet-open');
    $('shAdd').focus({ preventScroll: true });
  }
  function closeItem() {
    if ($('sheet').hidden) return;
    $('sheet').hidden = true;
    document.body.classList.remove('sheet-open');
    sheetItem = null;
    if (sheetFromLink && itemIdFromHash(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  }
  function drawSheet() {
    const it = sheetItem;
    if (!it) return;
    const f = picSrc(it), st = STATUS[it.status] || STATUS.on_order;
    $('shPic').className = 'sh-pic' + (f ? '' : ' card c-' + cardInfo(it).sec);
    $('shPic').innerHTML = f ? `<img src="${esc(f)}" alt="صورة ${esc(label(it))}">` : cardHtml(it);
    drawDesc(it);
    if (root.AskerStoreEdit) root.AskerStoreEdit.onSheet(it);
    $('shName').textContent = it.name;
    $('shAr').textContent = it.arabic_name || '';
    $('shAr').hidden = !it.arabic_name;
    $('shPrice').className = 'price' + (onOrder(it) ? ' later' : '');
    $('shPrice').textContent = onOrder(it) ? 'السعر يتأكد معاك يوم الطلب' : canAdd(it) ? money(it.price) + ' جنيه' : '';
    $('shBadge').className = 'badge ' + st.cls;
    $('shBadge').textContent = st.label;
    const rx = !!it.needs_rx;
    $('shRx').hidden = !rx; $('shRxBtn').hidden = !rx;
    $('shAct').hidden = !canAdd(it);
    const inCart = cart.find((x) => x.id === it.id);
    $('shQty').textContent = sheetQty;
    $('shMinus').disabled = sheetQty <= 1;
    $('shAdd').textContent = (onOrder(it) ? 'اطلبه' : 'ضيف للسلة') + (inCart ? ` (في السلة ${inCart.qty})` : '');
    const al = !canAdd(it) || it.status !== 'available' ? alts[it.id] || [] : [];
    $('shAlts').innerHTML = al.length ? `<div class="alts"><span class="alts-h">بديل متوفر بنفس المادة الفعالة والتركيز:</span>
      ${al.map((a) => `<div class="alt"><span dir="ltr">${esc(a.name)}</span><span class="alt-p">${money(a.price)} ج</span>
        <button type="button" class="add sm" data-add="${a.id}">${cart.find((x) => x.id === a.id) ? 'في السلة +' : 'ضيف'}</button></div>`).join('')}
      <span class="hint-sm">اتأكد مع الصيدلي قبل ما تغيّر الدوا</span></div>` : '';
  }
  async function drawDesc(it) {
    const box = $('shDesc');
    if (!box) return;
    if (box.dataset.id !== String(it.id)) { box.innerHTML = ''; box.dataset.id = it.id; }
    const d = await descOf(it.id);
    if (sheetItem !== it) return;
    box.innerHTML = descHtml(d);
  }
  // for store/edit.js (the owner's «✏️ عدّل»)
  root.AskerStore = {
    client, SUPABASE_URL, SUPABASE_KEY, EDIT_IMG,
    edits: () => edits, picSrc, descOf, pics: () => pics,
    setEdit(id, row) { if (row) edits[id] = row; else delete edits[id]; drawList(!$('more').hidden); if (sheetItem) drawSheet(); },
  };
  function sheetAdd() {
    const it = sheetItem;
    if (!it || !canAdd(it)) return;
    const had = cart.find((x) => x.id === it.id);
    if (!had && cart.length >= MAX_LINES) { $('shNote').textContent = 'السلة فيها 30 صنف، ودي أقصى حاجة في الطلب الواحد'; return; }
    cart = cartAdd(cart, it);
    cart = cartSet(cart, it.id, (had ? had.qty : 0) + sheetQty);
    saveCart(); drawList(!$('more').hidden);
    sheetQty = 1; drawSheet();
    $('shNote').innerHTML = 'اتضاف للسلة · <a href="#cart">افتح السلة</a>';
  }
  async function shareItem() {
    const it = sheetItem;
    if (!it) return;
    const link = itemLink(location.href, it.id), text = shareText(it, link);
    try {
      if (navigator.share) { await navigator.share({ title: 'صيدلية عسكر', text }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }
  async function openFromLink(id) {
    const it = known().find((x) => Number(x.id) === id);
    if (it) { openItem(it, true); return; }
    const { data, error } = await client.from('ar_store_items').select(COLS).eq('id', id).limit(1);
    if (!error && data && data[0]) openItem(data[0], true);
  }
  function search(text) {
    const terms = searchTerms(text);
    if (!terms.length) { shown = []; drawList(false); $('resNote').textContent = 'اكتب حرفين على الأقل من اسم الدوا أو المنتج'; return; }
    lastQuery = { terms, text: String(text).trim() };
    offset = 0;
    $('freeText').value = lastQuery.text.slice(0, 120); $('freeMsg').textContent = '';
    runQuery(lastQuery, false);
  }
  function openSection(key) {
    const s = SECTIONS.find((x) => x.key === key) || NEEDS.find((x) => x.key === key);
    if (!s) return;
    lastQuery = { cats: s.cats, title: s.name + ' (المتوفر)' };
    offset = 0;
    $('q').value = '';
    location.hash = 'search';
    runQuery(lastQuery, false);
  }

  function drawRx() {
    $('rxThumbs').innerHTML = rxFiles.map((r, i) => `<div class="rx-thumb">
      ${r.url ? `<img src="${r.url}" alt="صورة الروشتة ${i + 1}">` : '<span>PDF</span>'}
      <button type="button" data-rx-remove="${i}" aria-label="شيل الصورة ${i + 1}">×</button></div>`).join('');
    $('rxPickLabel').textContent = rxFiles.length ? 'زوّد صورة تانية للروشتة' : 'صوّر الروشتة أو اختار صورتها';
    $('rxPickLabel').hidden = rxFiles.length >= MAX_RX;
  }
  function addRx(files) {
    for (const f of files) {
      if (rxFiles.length >= MAX_RX) break;
      if (f.size > MAX_RX_BYTES && rxExt(f.type, f.name) === 'pdf') { say(ERRORS.rx_big, true); continue; }
      rxFiles.push({ file: f, url: /^image\//.test(f.type) ? URL.createObjectURL(f) : null });
    }
    drawRx(); drawCart();
  }
  // الصور الكبيرة بتتصغّر لـ 1600 بكسل (JPEG) قبل الرفع، عشان تترفع بسرعة على نت الموبايل
  async function shrink(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
      return blob ? new File([blob], 'rx.jpg', { type: 'image/jpeg' }) : file;
    } catch (e) { return file; }
  }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
  }
  async function uploadRx() {
    const day = new Date().toISOString().slice(0, 10), paths = [];
    for (const r of rxFiles) {
      const f = await shrink(r.file);
      if (f.size > MAX_RX_BYTES) throw new Error('rx_big');
      const path = rxPath(day, uuid(), rxExt(f.type, f.name));
      const up = await client.storage.from('ar-store-rx').upload(path, f, { contentType: f.type || 'image/jpeg', upsert: false });
      if (up.error) throw new Error('rx_upload');
      paths.push(path);
    }
    return paths;
  }
  function drawCart() {
    const box = $('cartItems');
    $('checkout').hidden = !cart.length && !rxFiles.length;
    $('sumBox').hidden = !cart.length;
    if (!cart.length) {
      box.innerHTML = rxFiles.length ? '' : '<p class="empty">السلة فاضية. دوّر على اللي محتاجه وضيفه، أو ابعت صورة الروشتة.</p>';
      return;
    }
    box.innerHTML = cart.map((x) => `<article class="item cart-line">
      <div class="item-text"><h3 dir="ltr">${esc(x.name)}</h3>${x.arabic_name ? `<p class="ar">${esc(x.arabic_name)}</p>` : ''}
        <span class="hint-sm">${x.free_text ? 'كتبته بنفسك · هنجيبه ونكلمك بسعره' : x.on_order ? 'بالطلب · السعر يتأكد معاك على واتساب' : money(x.price) + ' ج للواحدة'}</span></div>
      <div class="qty">
        <button type="button" data-qty="${esc(x.id)}" data-d="1" aria-label="زوّد واحدة">+</button>
        <span>${x.qty}</span>
        <button type="button" data-qty="${esc(x.id)}" data-d="-1" aria-label="${x.qty > 1 ? 'قلّل واحدة' : 'شيله من السلة'}">−</button>
      </div></article>`).join('');
    const later = cartLater(cart);
    const sum = later && later === cart.length ? '—' : money(cartTotal(cart)) + ' ج';
    $('sumItems').textContent = sum;
    $('sumTotal').textContent = sum;
    $('sumLater').hidden = !later;
    $('sumLater').textContent = later ? `+ ${later} صنف بالطلب، سعره هيتأكد معاك على واتساب` : '';
  }
  function say(t, bad) {
    const el = $('formMsg');
    el.textContent = t || '';
    el.className = 'form-msg' + (bad ? ' bad' : '');
  }
  async function send(e) {
    e.preventDefault();
    if (sending) return;
    // from a customer's link: his name comes from the pharmacy's card, he picks on account or cash
    const link = acct && acct.active();
    const typed = $('cName').value.trim(), name = link ? link.name || typed : typed;
    const phone = normPhone($('cPhone').value), address = $('cAddr').value.trim(), notes = $('cNotes').value.trim();
    if (!cart.length && !rxFiles.length) return say(ERRORS.bad_items, true);
    if (!link && name.length < 2) return say(ERRORS.bad_name, true);
    if (!phone) return say(ERRORS.bad_phone, true);
    if (address.length < 5) return say(ERRORS.bad_address, true);
    store.set('asker_store_me', { name: typed, phone, address });
    sending = true; $('sendBtn').disabled = true; say(rxFiles.length ? 'بيرفع صورة الروشتة…' : 'بيبعت الطلب…');
    try {
      let rx = [];
      if (rxFiles.length) {
        try { rx = await uploadRx(); } catch (err) { return say(errorText(err.message), true); }
        say('بيبعت الطلب…');
      }
      const args = { p_name: name, p_phone: phone, p_address: address, p_notes: notes || null, p_items: orderItems(cart) };
      if (rx.length) args.p_rx = rx;
      let fn = 'ar_store_place_order';
      if (link) { delete args.p_name; Object.assign(args, { p_token: link.token, p_pay: link.pay }); fn = 'ar_customer_place_order'; }
      const { data, error } = await client.rpc(fn, args);
      if (error) throw error;
      if (!data || !data.ok) {
        if (link && data && data.error === 'stopped') acct.stoppedNow();
        if (link && data && data.error === 'link') acct.linkGone();
        return say(errorText(data && data.error), true);
      }
      const changed = Math.abs(Number(data.total) - cartTotal(cart)) > 0.009;
      myOrders = rememberOrder(myOrders, {
        id: data.order_id, phone, at: new Date().toISOString(), total: Number(data.total), status: 'new',
        items: (data.items || []).map((x) => (x.free_text ? { name: x.name, qty: x.qty, free_text: true } : { id: x.id, name: x.name, qty: x.qty })),
      });
      store.set('asker_store_orders', myOrders);
      const onlyRx = !cart.length, later = (data.items || []).filter((x) => x.on_order).length;
      cart = []; saveCart();
      rxFiles.forEach((r) => r.url && URL.revokeObjectURL(r.url)); rxFiles = []; drawRx();
      $('cNotes').value = '';
      $('doneText').textContent = onlyRx
        ? `طلب الروشتة رقم ${data.order_id} وصلنا. هنقرا الروشتة ونكلمك بالأسعار.`
        : `طلبك رقم ${data.order_id} وصلنا. الإجمالي ${money(data.total)} جنيه` + (changed ? ' (السعر اتحدّث من الصيدلية)' : '') + (data.rx ? '، ومعاه الروشتة' : '') + '.'
          + (later ? ` و${later} صنف بالطلب، هنكلمك بسعرهم وميعادهم.` : '');
      $('donePay').hidden = !data.pay;
      $('donePay').textContent = data.pay === 'account' ? 'الطلب هيتحط على حسابك في الصيدلية' : 'الدفع كاش عند الاستلام';
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
      <span class="hint-sm">${esc(when(o.at))}${(o.items || []).length ? ' · ' + money(o.total) + ' ج' : ''}</span>
      ${(o.items || []).length ? `<ul class="order-lines">${o.items.map((x) => `<li><span dir="ltr">${esc(x.name)}</span> × ${esc(x.qty)}</li>`).join('')}</ul>
      <button type="button" class="again" data-again="${esc(o.id)}">اطلب تاني</button>` : '<span class="hint-sm">طلب بالروشتة</span>'}
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
    const ids = (o.items || []).filter((x) => !x.free_text).map((x) => x.id);
    const { data, error } = ids.length ? await client.from('ar_store_items').select(COLS).in('id', ids) : { data: [], error: null };
    btn.disabled = false;
    if (error) { $('ordersNote').textContent = 'مقدرتش أجيب الأصناف. اتأكد من النت وجرب تاني.'; return; }
    const plan = reorderPlan(o.items, data);
    for (const a of plan.add) {
      if (a.text) { const r = cartAddText(cart, a.text); cart = r.cart; const l = cart.find((x) => x.free_text && x.name === cleanText(a.text)); if (l) cart = cartSet(cart, l.id, a.qty); continue; }
      cart = cartAdd(cart, a.item); cart = cartSet(cart, a.item.id, a.qty);
    }
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
    const rm = e.target.closest('[data-rx-remove]');
    if (rm) {
      const r = rxFiles.splice(Number(rm.dataset.rxRemove), 1)[0];
      if (r && r.url) URL.revokeObjectURL(r.url);
      drawRx(); drawCart(); return;
    }
    const add = e.target.closest('[data-add]');
    if (add) {
      const it = shown.concat(popular, seen, ...Object.values(alts)).find((x) => String(x.id) === add.dataset.add);
      if (it && canAdd(it)) {
        if (cart.length >= MAX_LINES && !cart.find((x) => x.id === it.id)) { $('resNote').textContent = 'السلة فيها 30 صنف، ودي أقصى حاجة في الطلب الواحد'; return; }
        cart = cartAdd(cart, it); saveCart(); drawList(!$('more').hidden);
        if (sheetItem) drawSheet();
      }
      return;
    }
    if (e.target.closest('[data-close]')) { closeItem(); return; }
    const open = e.target.closest('[data-open]');
    if (open) {
      const it = known().find((x) => String(x.id) === open.dataset.open);
      if (it) openItem(it);
      return;
    }
    const q = e.target.closest('[data-qty]');
    if (q) {
      const line = cart.find((x) => String(x.id) === q.dataset.qty), id = line && line.id;
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
  $('rxFile').addEventListener('change', () => { addRx([...($('rxFile').files || [])]); $('rxFile').value = ''; });
  window.addEventListener('hashchange', route);
  $('freeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = cartAddText(cart, $('freeText').value);
    if (r.error) { $('freeMsg').textContent = errorText(r.error); $('freeMsg').className = 'hint-sm bad'; return; }
    cart = r.cart; saveCart();
    $('freeMsg').className = 'hint-sm';
    $('freeMsg').innerHTML = `«${esc(cleanText($('freeText').value))}» اتضاف للسلة · <a href="#cart">افتح السلة</a>`;
    $('freeText').value = '';
  });
  $('shAdd').addEventListener('click', sheetAdd);
  $('shPlus').addEventListener('click', () => { sheetQty = Math.min(MAX_QTY, sheetQty + 1); drawSheet(); });
  $('shMinus').addEventListener('click', () => { sheetQty = Math.max(1, sheetQty - 1); drawSheet(); });
  $('shShare').addEventListener('click', shareItem);
  $('shRxBtn').addEventListener('click', closeItem);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeItem();
    else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.item-text[data-open]')) { e.preventDefault(); e.target.click(); }
  });
  // «نزّل الصيدلية على موبايلك»: الزرار بيظهر بس لما المتصفح يقول إن التنزيل متاح (كروم على أندرويد)
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('installBox').hidden = false; });
  window.addEventListener('appinstalled', () => { installEvt = null; $('installBox').hidden = true; });
  $('installBtn').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch (e) { /* closed */ }
    installEvt = null; $('installBox').hidden = true;
  });

  $('needs').innerHTML = NEEDS.map((s) => `<a href="#search" data-section="${s.key}" class="need">${s.name}</a>`).join('');
  startSlides();
  $('sections').innerHTML = SECTIONS.map((s) => `<a href="#search" data-section="${s.key}" class="sec"><span class="sec-mark"><svg viewBox="0 0 24 24" aria-hidden="true">${SEC_ICONS[s.key] || ''}</svg></span><span>${s.name}</span></a>`).join('')
    + '<a href="#search" class="sec"><span class="sec-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg></span><span>كل الأصناف</span></a>';
  const me = store.get('asker_store_me', null);
  if (me) { $('cName').value = me.name || ''; $('cPhone').value = me.phone || ''; $('cAddr').value = me.address || ''; }
  if (acct) acct.attach(client);
  if (chat) chat.attach(client);
  saveCart();
  route();
  loadSettings();
  // English: the translator never touches message boxes, so their hint (placeholder) is translated here
  if (root.AskerI18n && root.AskerI18n.lang() === 'en') {
    document.querySelectorAll('textarea[placeholder]').forEach((t) => { t.placeholder = root.AskerI18n.translate(t.placeholder); });
  }
  loadPopular();
  loadPics();
  loadEdits();
})(typeof window === 'undefined' ? globalThis : window);
