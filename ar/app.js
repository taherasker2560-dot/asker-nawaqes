/* Trial bot (asker-nawaqes-arabic.html): login, shortage list, Arabic names, supplier input, WhatsApp. */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://qwrzdjdgvanmhaicncuk.supabase.co',
    SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_af0XfsvB0Fwwo3HORqMN2g_iJNd9o0q',
    FN = 'arabic-shortages',
    // The server version this page expects (VERSION in supabase/functions/arabic-shortages/index.ts).
    // tests/shared-matcher.cjs fails when they differ; the page warns when the deployed function is older.
    SERVER_VERSION = 'ar12',
    OFFER_MIN = 0.45,
    NOT_LISTED = '*'; // same as NOT_LISTED in the function: «مش واحد منهم» for a whole line
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  window.AskerApp = { client }; // shared with ar/suppliers.js («المخازن»), so there is one login session
  const $ = (id) => document.getElementById(id),
    esc = (s) =>
      String(s ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      );
  const key = (s) =>
    String(s || '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  // Arabic names and answers are kept per product (English name), so an item that leaves the shortage list and comes
  // back later keeps its approved translation. Same key as the function and the database.
  const nk = (s) => key(s).slice(0, 250);
  async function fetchNames() {
    try {
      // spoken_name: how the phone says the item (optional; migration 202611050027)
      return await all('ar_names', 'name_key,english_name,arabic_name,status,spoken_name');
    } catch (e) {
      if (!/spoken_name|column/i.test(e.message)) throw e;
      return await all('ar_names', 'name_key,english_name,arabic_name,status');
    }
  }
  function applyNames(rows) {
    const byKey = new Map(rows.map((n) => [n.name_key, n]));
    knownNames = byKey;
    names = new Map();
    shortages.forEach((x) => {
      const n = byKey.get(nk(x.product_name));
      if (n) names.set(x.id, n);
    });
  }
  async function loadNames() {
    applyNames(await fetchNames());
    saveCache();
  }
  const status = (id, m, cls = '') => {
    $(id).textContent = m;
    $(id).className = 'status ' + cls;
  };
  // every product name this bot ever translated (also those not in the list now): used to restore cut names
  let knownNames = new Map();
  let shortages = [],
    names = new Map(),
    show = 'suggested',
    shown = 30,
    results = [],
    undo = null,
    stopAll = false;

  async function invoke(body) {
    const { data, error } = await client.functions.invoke(FN, { body });
    if (error) {
      let m = error.message;
      try {
        const j = await error.context?.json?.();
        if (j?.message) m = j.message;
      } catch (e) {}
      throw Error(m);
    }
    if (data?.version && data.version !== SERVER_VERSION && !warnedVersion) {
      warnedVersion = true;
      console.warn('arabic-shortages', data.version, 'expected', SERVER_VERSION);
      $('versionWarn').textContent =
        `تنبيه: السيرفر شغال بنسخة ${data.version} والصفحة مستنية ${SERVER_VERSION}. النتايج ممكن تكون ناقصة؛ قول للمطوّر يرفع الدالة.`;
      $('versionWarn').classList.remove('hidden');
    }
    return data;
  }
  let warnedVersion = false;
  // every row of a table, 1000 per page: after the first page the next pages come two at a time
  async function all(table, cols, q = (x) => x) {
    const page = async (from) => {
      const { data, error } = await q(client.from(table).select(cols))
        .order(table === 'ar_names' ? 'name_key' : 'id')
        .range(from, from + 999);
      if (error) throw Error(error.message);
      return data || [];
    };
    let last = await page(0);
    const out = [...last];
    for (let from = 1000; last.length === 1000; from += 2000) {
      const [a, b] = await Promise.all([page(from), page(from + 1000)]);
      out.push(...a, ...b);
      last = b;
    }
    return out;
  }

  // ---------- last data kept on the phone: the page opens on it at once, then updates ----------
  // Only the list, the Arabic names and the companies (no messages, no customer data); removed on logout.
  const CACHE_KEY = 'ar-cache-v1';
  let currentUid = null,
    cacheReady = false, // true once a full load worked: a half-loaded page must never overwrite the saved data
    cacheTimer = null;
  function saveCache() {
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => {
      try {
        if (!currentUid || !cacheReady) return;
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ uid: currentUid, at: Date.now(), shortages, names: [...knownNames.values()], suppliers, dataAge: dataAgeRow }),
        );
      } catch (e) {}
    }, 1500);
  }
  function readCache(uid) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return c && c.uid === uid && Array.isArray(c.shortages) && Array.isArray(c.names) ? c : null;
    } catch (e) {
      return null;
    }
  }

  // ---------- login ----------
  // loadedFor / loadingFor: the page loads once per sign-in (the auth listener and the first call both ask for it)
  let loadedFor = null,
    loadingFor = null;
  async function refresh() {
    const { data } = await client.auth.getSession();
    const on = !!data.session;
    $('loginCard').classList.toggle('hidden', on);
    $('app').classList.toggle('hidden', !on);
    $('logoutBtn').classList.toggle('hidden', !on);
    if (!on) {
      $('dataAge').classList.add('hidden');
      currentUid = loadedFor = loadingFor = null;
      cacheReady = false;
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch (e) {}
      return;
    }
    const uid = data.session.user.id;
    if (loadedFor === uid || loadingFor === uid) return;
    loadingFor = currentUid = uid;
    const ok = await loadAll(uid);
    if (loadingFor === uid) loadingFor = null;
    if (ok && currentUid === uid) loadedFor = uid;
  }
  // ---------- «حسب داتا الساعة …»: how old the list's pharmacy data is (ar/data-age.js) ----------
  // The newest send of any kind from the laptop (ar_sync_log: the shortage list 'ok', or the store / stock items 'STORE_OK' that go
  // every 2 hours) says how fresh the laptop's copy of the pharmacy data is. The shortage list itself is sent twice a day only
  // (owner, 2026-11-09), so its own newest send is read apart and shown under the strip. A failed read keeps the strip as it was.
  // ONE read (the page reads each table once when it opens: tests/e2e/fast-load.spec.cjs): the newest 60 sends of both kinds; the
  // newest of them is the strip, and the newest 'ok' among them is the list's own send (false = older than these 60 sends).
  const SYNC_ROWS = 60;
  let dataAgeRow = null, listRow = null;
  async function loadDataAge() {
    try {
      const { data, error } = await client
        .from('ar_sync_log')
        .select('at,data_at,status')
        .eq('dry_run', false)
        .in('status', ['ok', 'STORE_OK'])
        .order('at', { ascending: false })
        .limit(SYNC_ROWS);
      if (error) throw Error(error.message);
      const rows = data || [];
      dataAgeRow = rows[0] || null;
      listRow = rows.find((r) => r.status === 'ok') || (rows.length >= SYNC_ROWS ? false : null);
      drawDataAge();
    } catch (e) {
      console.warn('data age:', e.message);
    }
  }
  function drawDataAge() {
    const d = window.AskerDataAge.describe(dataAgeRow, Date.now(), listRow);
    $('dataAge').className = 'dataage ' + d.level;
    $('dataAgeText').textContent = d.text;
    $('dataAgeAgo').textContent = d.ago;
    $('dataAgeMore').innerHTML = d.details.map(esc).join('<br>');
  }
  $('dataAge').onclick = () => {
    const open = $('dataAge').getAttribute('aria-expanded') !== 'true';
    $('dataAge').setAttribute('aria-expanded', String(open));
    $('dataAgeMore').classList.toggle('hidden', !open);
  };
  setInterval(() => {
    if (!document.hidden && !$('app').classList.contains('hidden')) loadDataAge();
  }, 5 * 60e3);
  $('loginBtn').onclick = async () => {
    status('loginStatus', 'بيدخل…');
    const { error } = await client.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('password').value,
    });
    if (error) {
      status('loginStatus', 'مادخلش: ' + error.message, 'bad');
      return;
    }
    status('loginStatus', '');
    refresh();
  };
  $('logoutBtn').onclick = async () => {
    await client.auth.signOut();
    refresh();
  };
  // The bar at the bottom has the main places (owner's layout of 2026-11-09): «النواقص العامة» (القايمة، الترجمة، الوارد),
  // «الطلبيات» (الطلبيات، الفواتير، قوايم المخازن), «المخزون» (رصيد الصيدلية, ar/stock.js) and «الموقع» (طلبات الموقع). Each
  // place has its small tabs under the top strip (the .subbar for that place); a small tab is still a [data-tab], and a place
  // remembers the small tab you were on.
  const GROUP_OF = { short: 'general', translate: 'general', read: 'general', drafts: 'orders', docs: 'orders', suppliers: 'orders', stock: 'stock', storeorders: 'site' };
  const lastTab = { general: 'short', orders: 'drafts', stock: 'stock', site: 'storeorders' };
  function showTab(tab) {
    const group = GROUP_OF[tab] || 'general';
    lastTab[group] = tab;
    document.querySelectorAll('[data-group]').forEach((x) => x.classList.toggle('secondary', x.dataset.group !== group));
    document.querySelectorAll('.subbar').forEach((s) => (s.hidden = s.dataset.for !== group));
    document.querySelectorAll('.subbar [data-tab]').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
    $('shortPanel').classList.toggle('hidden', tab !== 'short');
    if (tab === 'short') { drawShort(); window.AskerRefresh?.open(); } // names may have changed in the other tabs
    $('translatePanel').classList.toggle('hidden', tab !== 'translate');
    $('readPanel').classList.toggle('hidden', tab !== 'read');
    $('suppliersPanel')?.classList.toggle('hidden', tab !== 'suppliers');
    if (tab === 'suppliers') window.AskerSuppliers?.open();
    $('docsPanel')?.classList.toggle('hidden', tab !== 'docs');
    if (tab === 'docs') window.AskerDocs?.open();
    $('draftsPanel')?.classList.toggle('hidden', tab !== 'drafts');
    if (tab === 'drafts') window.AskerOrderDrafts?.open();
    $('stockPanel')?.classList.toggle('hidden', tab !== 'stock');
    if (tab === 'stock') window.AskerStock?.open();
    $('storeOrdersPanel')?.classList.toggle('hidden', tab !== 'storeorders');
    if (tab === 'storeorders') { window.AskerStoreOrders?.open(); window.AskerStoreSettings?.open(); }
  }
  document.querySelectorAll('.subbar [data-tab]').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  document.querySelectorAll('[data-group]').forEach((b) => (b.onclick = () => showTab(lastTab[b.dataset.group])));
  // «الوارد» has three small tabs: today (the automatic inbox), reading by hand, and the companies / phone link.
  // The status line, the results and the message to the company sit under the first two and are hidden under «الشركات».
  function showSub(name) {
    document.querySelectorAll('[data-sub]').forEach((b) => b.classList.toggle('secondary', b.dataset.sub !== name));
    $('subToday').classList.toggle('hidden', name !== 'today');
    $('subManual').classList.toggle('hidden', name !== 'manual');
    $('subCompanies').classList.toggle('hidden', name !== 'companies');
    $('readOut').classList.toggle('hidden', name === 'companies');
  }
  document.querySelectorAll('[data-sub]').forEach((b) => (b.onclick = () => showSub(b.dataset.sub)));

  async function fetchShortages() {
    const active = (q) => q.eq('is_active', true);
    let rows;
    try {
      // suggested_qty: «المطلوب» sent by the pharmacy laptop; order_qty: the quantity the owner typed (wins)
      rows = await all('ar_shortages', 'id,product_name,suggested_qty,order_qty', active);
    } catch (e) {
      // database without the quantity columns yet (migration 202611050026): the list still loads, without quantities
      if (!/suggested_qty|order_qty|column/i.test(e.message)) throw e;
      rows = await all('ar_shortages', 'id,product_name', active);
    }
    return rows.sort((a, b) => a.product_name.localeCompare(b.product_name));
  }
  async function loadShortages() {
    shortages = await fetchShortages();
    saveCache();
  }
  // Opens on the data saved on the phone (if it belongs to this sign-in), then asks the server for everything at once
  // and shows it in the same order as before. Returns true when the data loaded.
  async function loadAll(uid) {
    const cached = readCache(uid);
    if (cached) {
      shortages = cached.shortages;
      applyNames(cached.names);
      applySuppliers(cached.suppliers || []);
      if (cached.dataAge) {
        dataAgeRow = cached.dataAge;
        drawDataAge();
      }
      drawTranslate();
      drawShort();
    }
    try {
      loadDataAge();
      const asked = [fetchShortages(), fetchNames(), fetchSuppliers(), fetchOrders(), fetchInbox()];
      asked.forEach((p) => p.catch(() => {})); // an answer nobody is waiting for yet is not an error
      shortages = await asked[0];
      applyNames(await asked[1]);
      drawTranslate();
      drawShort();
      applySuppliers((await asked[2]) ?? (cached ? cached.suppliers || [] : []));
      orders = await asked[3];
      drawShort(); // the «اتطلب» marks need the orders
      drawPending();
      inbox = await asked[4];
      drawInbox();
      if (cached) status('shNote', '');
      cacheReady = true;
      saveCache();
      // opened from the phone's notification (…html#inbox): go straight to the incoming list
      if (location.hash === '#inbox') {
        document.querySelector('[data-tab="read"]').click();
        $('inboxBox').scrollIntoView({ block: 'start' });
      }
      await takeShare();
      return true;
    } catch (e) {
      status('trStatus', 'تعذّر التحميل: ' + e.message, 'bad');
      if (cached) status('shNote', 'النت واقف: ده آخر داتا اتحفظت على الموبايل، مش لسه محدّثة.', 'bad');
      return false;
    }
  }

  // ---------- shortages (this bot's own list) ----------
  // The list itself: search, a view (alphabetical / most needed / ordered today / no Arabic name) and one row per item.
  // Read-only; the quantity is the owner's (order_qty) if he typed one, else the laptop's suggestion (suggested_qty).
  let shView = 'alpha',
    shQuery = '';
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  // for searching and sorting: western digits, no diacritics, one form of alef / yaa / taa marbuta, upper case
  const normAr = (s) =>
    String(s || '')
      .toUpperCase()
      .replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d))
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim();
  const arSort = new Intl.Collator('ar');
  // the letter an item is filed under: digits first, then the Arabic letters, then names with no Arabic name
  const letterOf = (s) => {
    const c = normAr(aName(s.id) || s.product_name).charAt(0);
    return /\d/.test(c) ? '١٢٣' : /[ا-ي]/.test(c) ? c : 'A-Z';
  };
  const LETTER_ORDER = (l) => (l === '١٢٣' ? 0 : l === 'A-Z' ? 2 : 1);
  function drawShort() {
    // the companies each item was ordered from today (same answer as orderedFrom, worked out once for the whole list)
    const ordBy = new Map();
    orders.forEach((o) => ordBy.set(o.name_key, [...(ordBy.get(o.name_key) || []), o.supplier || '']));
    const fromOf = (s) => ordBy.get(nk(s.product_name)) || [],
      orderedNow = (s) => fromOf(s).length > 0,
      written = (s) => qtyNum(s.order_qty) !== null,
      noAr = shortages.filter((s) => !names.has(s.id)).length;
    $('shStats').innerHTML =
      `<div class="stat"><strong>${shortages.length}</strong>صنف</div><div class="stat"><strong>${shortages.filter(orderedNow).length}</strong>اتطلب النهارده</div><div class="stat"><strong>${shortages.filter(written).length}</strong>كمية كتبتها</div>`;
    if (shView === 'noar' && !noAr) shView = 'alpha';
    const chips = [
      ['alpha', 'أبجدي'],
      ['qty', 'الأكتر مطلوب'],
      ['ordered', 'اتطلب النهارده'],
      ...(noAr ? [['noar', `من غير اسم عربي ${noAr}`]] : []),
    ];
    $('shChips').innerHTML = chips
      .map(([v, t]) => `<button type="button" class="chip${v === shView ? ' on' : ''}" data-view="${v}" aria-pressed="${v === shView}">${esc(t)}</button>`)
      .join('');
    // smart search (ar/fuzzy.js, owner 2026-11-08): letters in order with skips, sound-alike letters, Arabic or English;
    // while searching, the closest names come first in every view
    const fz = window.AskerFuzzy,
      words = fz.words(shQuery),
      closeness = new Map();
    let rows = shortages.filter((s) => {
      if (shView === 'ordered' && !orderedNow(s)) return false;
      if (shView === 'noar' && names.has(s.id)) return false;
      if (!words.length) return true;
      const c = fz.score(words, fz.fold(aName(s.id)), fz.fold(s.product_name));
      if (c === -Infinity) return false;
      closeness.set(s.id, c);
      return true;
    });
    const shown = rows.length;
    const byName = (a, b) => arSort.compare(normAr(aName(a.id) || a.product_name), normAr(aName(b.id) || b.product_name));
    if (words.length) rows = rows.sort((a, b) => closeness.get(b.id) - closeness.get(a.id) || byName(a, b));
    else if (shView === 'qty') rows = rows.sort((a, b) => (qtyOf(b.id) ?? -1) - (qtyOf(a.id) ?? -1) || byName(a, b));
    else rows = rows.sort(byName);
    const row = (s) => {
      const q = qtyOf(s.id),
        from = fromOf(s),
        ar = aName(s.id),
        pill = from.length ? ` <span class="pill good">اتطلب${esc(who(from))}</span>` : '',
        miss = ar ? '' : ' <span class="pill warn">لسه ماتترجمش</span>';
      return `<div class="srow"><div class="sr-main"><div class="sr-ar" dir="auto">${esc(ar || s.product_name)}${pill}${miss}</div>${ar ? `<div class="sr-en" dir="ltr">${esc(s.product_name)}</div>` : ''}</div>${q === null ? '' : `<div class="qty${written(s) ? ' own' : ''}"${written(s) ? ' title="الكمية اللي كتبتها"' : ''}>${esc(fmtQty(q))}</div>`}</div>`;
    };
    let html = '';
    if (shView === 'alpha' && !words.length) {
      const groups = new Map();
      rows.forEach((s) => groups.set(letterOf(s), [...(groups.get(letterOf(s)) || []), s]));
      html = [...groups.entries()]
        .sort(([a], [b]) => LETTER_ORDER(a) - LETTER_ORDER(b) || arSort.compare(a, b))
        // one box per letter, so each sticky letter lets go when its group ends
        .map(([l, list]) => `<div class="sr-group"><div class="sr-letter">${esc(l)}</div>${list.map(row).join('')}</div>`)
        .join('');
    } else html = rows.map(row).join('');
    $('shList').innerHTML = html || `<p class="hint sr-empty">${shortages.length ? 'مفيش صنف بالشكل ده.' : 'مفيش نواقص لسه.'}</p>`;
    $('shCount').textContent = `عرض ${shown} من ${shortages.length}`;
    $('shCount').classList.toggle('hidden', shown === shortages.length);
    document.documentElement.style.setProperty('--sticky-top', (document.querySelector('.appbar')?.offsetHeight || 72) + 'px');
  }
  $('shChips').onclick = (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    shView = b.dataset.view;
    drawShort();
  };
  $('shSearch').addEventListener('input', () => {
    shQuery = $('shSearch').value;
    $('shClear').classList.toggle('hidden', !shQuery);
    drawShort();
  });
  $('shClear').onclick = () => {
    $('shSearch').value = shQuery = '';
    $('shClear').classList.add('hidden');
    $('shSearch').focus();
    drawShort();
  };
  // PharmaFly's shortage report cuts names at 25 letters (MOVIPREP POWDER ORAL SOLU). A cut name that is the start of
  // exactly one product this bot already knows (translated before, or in the list now) gets that product's full name
  // back, so it keeps its Arabic name and matches as well as before.
  const CUT_AT = 25;
  function fullName(n) {
    const k = nk(n);
    if (k.length < CUT_AT || knownNames.has(k)) return n;
    const hits = new Map();
    for (const [key, x] of knownNames)
      if (key.length > k.length && key.startsWith(k)) hits.set(key, x.english_name || key);
    for (const x of shortages) {
      const key = nk(x.product_name);
      if (key.length > k.length && key.startsWith(k)) hits.set(key, x.product_name);
    }
    return hits.size === 1 ? [...hits.values()][0] : n;
  }
  let restored = 0;
  const cleanNames = (list) => {
    const byKey = new Map();
    restored = 0;
    for (const v of list) {
      let n = String(v ?? '')
        .split(/[|\t]/)[0]
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 250);
      if (n.length < 2 || !/\p{L}/u.test(n)) continue;
      const full = fullName(n);
      if (full !== n) restored++;
      n = full;
      if (!byKey.has(nk(n))) byKey.set(nk(n), n);
    }
    return byKey;
  };
  async function afterSave(msg) {
    await loadShortages();
    await loadNames();
    drawShort();
    drawTranslate();
    const noAr = shortages.filter((s) => !names.has(s.id)).length;
    status(
      'shStatus',
      msg +
        ` النواقص دلوقتي ${shortages.length} صنف، منهم ${shortages.length - noAr} ليهم ترجمة محفوظة.${noAr ? ` فيه ${noAr} صنف لسه ماليهمش اسم عربي: ترجمهم من «٢. ترجمة النواقص».` : ''}`,
      'good',
    );
  }
  async function upsertActive(byKey) {
    const rows = [...byKey].map(([name_key, product_name]) => ({ name_key, product_name, is_active: true }));
    for (let i = 0; i < rows.length; i += 500) {
      status('shStatus', `بيحفظ ${Math.min(i + 500, rows.length)} من ${rows.length}…`);
      const { error } = await client.from('ar_shortages').upsert(rows.slice(i, i + 500), { onConflict: 'name_key' });
      if (error) throw Error(error.message);
    }
  }
  // typed lines: added to the list, nothing taken out
  async function addShortages(list, btn) {
    const byKey = cleanNames(list);
    if (!byKey.size) {
      status('shStatus', 'مفيش أسماء أصناف.', 'bad');
      return;
    }
    const have = new Set(shortages.map((s) => nk(s.product_name))),
      fresh = [...byKey.keys()].filter((k) => !have.has(k)).length;
    btn.disabled = true;
    try {
      await upsertActive(byKey);
      await afterSave(`اتضاف ${fresh} صنف جديد، و${byKey.size - fresh} كانوا موجودين.`);
      $('shText').value = '';
    } catch (e) {
      status('shStatus', 'ماتحفظش: ' + e.message, 'bad');
    }
    btn.disabled = false;
  }
  // the shop's file replaces the list: names not in it leave the list (is_active=false, nothing deleted); Arabic names
  // (ar_names) and answers are kept per product name, so a name that comes back later finds its translation again
  function replaceShortages(list, btn) {
    const byKey = cleanNames(list);
    $('shConfirm').classList.add('hidden');
    if (!byKey.size) {
      status('shStatus', 'مفيش أسماء أصناف في العمود ده.', 'bad');
      return;
    }
    const have = new Map(shortages.map((s) => [nk(s.product_name), s.id])),
      add = [...byKey.keys()].filter((k) => !have.has(k)).length,
      out = [...have].filter(([k]) => !byKey.has(k)).map(([, id]) => id),
      stay = byKey.size - add;
    const few = shortages.length >= 50 && byKey.size < shortages.length * 0.3;
    status(
      'shStatus',
      `الملف فيه ${byKey.size} صنف: ${add} جديد، ${stay} موجودين وهيفضلوا، و${out.length} هيطلعوا من النواقص (ترجمتهم بتفضل محفوظة).${restored ? ` و${restored} اسم كان مقطوع في الملف رجّعته لاسمه الكامل.` : ''}`,
      few ? 'bad' : '',
    );
    $('shConfirm').innerHTML =
      `${few ? '<p class="status bad">الملف ده أصغر بكتير من القايمة الحالية. اتأكد إنه الملف الصح وإن العمود المختار هو اسم الصنف.</p>' : ''}<button id="shYes">أيوه، استبدل</button> <button id="shNo" class="secondary">إلغاء</button>`;
    $('shConfirm').classList.remove('hidden');
    $('shNo').onclick = () => {
      $('shConfirm').classList.add('hidden');
      status('shStatus', 'اتلغى، والقايمة زي ما هي.');
    };
    $('shYes').onclick = async () => {
      $('shConfirm').classList.add('hidden');
      btn.disabled = true;
      try {
        await upsertActive(byKey);
        for (let i = 0; i < out.length; i += 200) {
          const { error } = await client
            .from('ar_shortages')
            .update({ is_active: false })
            .in('id', out.slice(i, i + 200));
          if (error) throw Error('الأصناف الجديدة اتحفظت، بس القديمة ماطلعتش: ' + error.message);
        }
        await afterSave(`اتبدلت النواقص: ${add} جديد، ${stay} فضلوا، ${out.length} طلعوا.`);
      } catch (e) {
        status('shStatus', 'ماتحفظش: ' + e.message, 'bad');
      }
      btn.disabled = false;
    };
  }
  excelPicker('shx', 'shStatus', (n, label, btn) => replaceShortages(n, btn));
  $('shTextBtn').onclick = () => addShortages($('shText').value.split(/\r?\n/), $('shTextBtn'));

  // ---------- translate ----------
  function drawTranslate() {
    const appr = [...names.values()].filter((n) => n.status === 'approved').length,
      act = shortages.filter((s) => names.has(s.id)).length;
    $('trStats').innerHTML =
      `<div class="stat"><strong>${shortages.length}</strong>نواقص</div><div class="stat"><strong>${act}</strong>اتترجمت</div><div class="stat"><strong>${appr}</strong>اتأكدت منك</div>`;
    const f = key($('trFilter').value);
    const list = shortages.filter((s) => {
      const n = names.get(s.id);
      const st = n ? n.status : 'none';
      // a search looks in every list (reviewed, approved, not translated), so a saved translation is always findable
      return f ? key(s.product_name + ' ' + (n?.arabic_name || '')).includes(f) : st === show;
    });
    $('trList').innerHTML =
      list
        .slice(0, shown)
        .map((s) => {
          const n = names.get(s.id);
          const pill = f
            ? n?.status === 'approved'
              ? ' <span class="pill good">اتأكدت</span>'
              : n
                ? ' <span class="pill warn">محتاجة مراجعة</span>'
                : ' <span class="pill bad">لسه ماتترجمتش</span>'
            : '';
          return `<div class="item" data-id="${esc(s.id)}"><div class="en">${esc(s.product_name)}${pill}</div>${n ? `<input type="text" dir="auto" value="${esc(n.arabic_name)}" data-ar><input type="text" dir="auto" class="say" value="${esc(n.spoken_name || '')}" placeholder="النطق (اختياري): الموبايل يقول الصنف كده" data-say><button data-ok>${n.status === 'approved' ? 'احفظ التعديل' : 'تمام'}</button>` : '<p class="hint">لسه ماتترجمش.</p>'}</div>`;
        })
        .join('') || '<p class="hint">مفيش.</p>';
    $('trMore').classList.toggle('hidden', list.length <= shown);
    $('trList')
      .querySelectorAll('[data-ok]')
      .forEach(
        (b) =>
          (b.onclick = async () => {
            const box = b.closest('[data-id]'),
              id = box.dataset.id,
              ar = box.querySelector('[data-ar]').value.replace(/\s+/g, ' ').trim(),
              sayBox = box.querySelector('[data-say]'),
              say = sayBox ? sayBox.value.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
            if (ar.length < 2) return;
            b.disabled = true;
            const en = shortages.find((x) => x.id === id)?.product_name || '';
            const before = names.get(id) ? { ...names.get(id) } : null;
            const row = {
              name_key: nk(en),
              english_name: en,
              arabic_name: ar,
              status: 'approved',
              updated_at: new Date().toISOString(),
            };
            // the spoken form is sent only when it is set or changed, so a database without the column still saves names
            if (say || before?.spoken_name) row.spoken_name = say.length >= 2 ? say : null;
            const { error } = await client.from('ar_names').upsert(row, { onConflict: 'name_key' });
            if (error) {
              status('trStatus', 'ماتحفظش: ' + error.message, 'bad');
              b.disabled = false;
              return;
            }
            shortages
              .filter((x) => nk(x.product_name) === nk(en))
              .forEach((x) =>
                names.set(x.id, {
                  name_key: nk(en),
                  arabic_name: ar,
                  status: 'approved',
                  spoken_name: 'spoken_name' in row ? row.spoken_name : before?.spoken_name || null,
                }),
              );
            status('trStatus', 'اتحفظ: ' + ar + (row.spoken_name ? ` (بيتنطق: ${row.spoken_name})` : ''), 'good');
            drawTranslate();
            savedBar(en, before);
          }),
      );
  }
  // after «تمام»: fix it right away («عدّل») or put the previous Arabic name back («تراجع»)
  function savedBar(en, before) {
    const bar = document.createElement('span');
    bar.innerHTML =
      ' <button class="secondary" data-tr-edit>عدّل</button> <button class="secondary" data-tr-undo>تراجع</button>';
    $('trStatus').append(bar);
    bar.querySelector('[data-tr-edit]').onclick = () => {
      $('trFilter').value = en;
      shown = 30;
      drawTranslate();
      $('trList').querySelector('[data-ar]')?.focus();
    };
    bar.querySelector('[data-tr-undo]').onclick = async () => {
      const k = nk(en);
      const { error } = before
        ? await client.from('ar_names').upsert(
            {
              name_key: k,
              english_name: en,
              arabic_name: before.arabic_name,
              status: before.status,
              ...('spoken_name' in before ? { spoken_name: before.spoken_name } : {}),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'name_key' },
          )
        : await client.from('ar_names').delete().eq('name_key', k);
      if (error) return status('trStatus', 'ماترجعتش: ' + error.message, 'bad');
      shortages
        .filter((x) => nk(x.product_name) === k)
        .forEach((x) => (before ? names.set(x.id, { ...before, name_key: k }) : names.delete(x.id)));
      status('trStatus', 'رجعت زي ما كانت: ' + (before ? before.arabic_name : en), 'good');
      drawTranslate();
    };
  }
  $('trFilter').oninput = () => {
    shown = 30;
    drawTranslate();
  };
  $('trMore').onclick = () => {
    shown += 30;
    drawTranslate();
  };
  document.querySelectorAll('[data-show]').forEach(
    (b) =>
      (b.onclick = () => {
        show = b.dataset.show;
        shown = 30;
        document.querySelectorAll('[data-show]').forEach((x) => x.classList.toggle('secondary', x !== b));
        drawTranslate();
      }),
  );
  async function translateOnce() {
    const r = await invoke({ action: 'translate', limit: 60 });
    await loadNames();
    drawTranslate();
    return r;
  }
  $('trOne').onclick = async () => {
    $('trOne').disabled = true;
    status('trStatus', 'بيترجم…');
    try {
      const r = await translateOnce();
      status('trStatus', `اتترجم ${r.translated} صنف. فاضل ${r.remaining}.`, 'good');
    } catch (e) {
      status('trStatus', 'تعذّر: ' + e.message, 'bad');
    }
    $('trOne').disabled = false;
  };
  // Google's free plan also limits requests per minute: wait between batches, and after a "quota" answer wait a
  // minute and try once more; a second refusal is most likely the daily limit (back at midnight Pacific = 10 AM Cairo).
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitStoppable(sec, label) {
    for (let i = sec; i > 0; i--) {
      if (stopAll) return;
      status('trStatus', `${label} (${i} ثانية)`);
      await sleep(1000);
    }
  }
  $('trAll').onclick = async () => {
    stopAll = false;
    $('trAll').disabled = $('trOne').disabled = true;
    $('trStop').classList.remove('hidden');
    let done = 0,
      retried = false;
    for (;;) {
      if (stopAll) {
        status('trStatus', `وقفت. اتترجم ${done} صنف.`);
        break;
      }
      status('trStatus', `بيترجم… (${done} لحد دلوقتي) — سيب الصفحة مفتوحة`);
      try {
        const r = await translateOnce();
        done += r.translated;
        retried = false;
        if (!r.remaining || !r.translated) {
          status('trStatus', `خلص: اتترجم ${done} صنف.`, 'good');
          break;
        }
        await waitStoppable(12, `استنى شوية عشان حد Google في الدقيقة — اتترجم ${done}`);
      } catch (e) {
        if (/حصة|quota/i.test(e.message) && !retried) {
          retried = true;
          await waitStoppable(65, `Google قال استنى — هيكمّل لوحده`);
          continue;
        }
        status(
          'trStatus',
          `وقف بعد ${done} صنف: ${e.message}${/حصة|quota/i.test(e.message) ? ' غالبًا ده الحد اليومي، وبيتجدد الساعة ١٠ الصبح بتوقيت مصر.' : ''}`,
          'bad',
        );
        break;
      }
    }
    $('trAll').disabled = $('trOne').disabled = false;
    $('trStop').classList.add('hidden');
  };
  $('trStop').onclick = () => {
    stopAll = true;
  };

  // ---------- read ----------
  const toBase64 = (f) =>
    new Promise((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(',')[1] || '');
      r.onerror = () => no(r.error);
      r.readAsDataURL(f);
    });
  $('images').onchange = () => {
    $('readBtn').disabled = !$('images').files.length;
  };
  document.querySelectorAll('[data-src]').forEach(
    (b) =>
      (b.onclick = () => {
        document.querySelectorAll('[data-src]').forEach((x) => x.classList.toggle('secondary', x !== b));
        document
          .querySelectorAll('[data-src-box]')
          .forEach((x) => x.classList.toggle('hidden', x.dataset.srcBox !== b.dataset.src));
      }),
  );
  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  $('readBtn').onclick = () => readFiles([...$('images').files]);
  async function readFiles(files) {
    files = files.slice(0, 20);
    if (!files.length) return;
    $('readBtn').disabled = true;
    results = [];
    $('results').innerHTML = '';
    newRun();
    try {
      for (let i = 0; i < files.length; i++) {
        if (files[i].size > 8 * 1024 * 1024) throw Error(`الملف ${i + 1} أكبر من ٨ ميجا`);
        status('readStatus', `بيقرا ${isPdf(files[i]) ? 'ملف PDF' : 'الصورة'} ${i + 1} من ${files.length}…`);
        const d = await invoke({
          action: 'read',
          image: await toBase64(files[i]),
          mimeType: isPdf(files[i]) ? 'application/pdf' : files[i].type || 'image/jpeg',
        });
        results.push(...(d.rows || []).map((r) => ({ ...r, file: files[i].name })));
        if (d.supplier) guessSupplier(d.supplier);
      }
      showDone();
    } catch (e) {
      status('readStatus', 'تعذّرت القراءة: ' + e.message, 'bad');
    }
    $('readBtn').disabled = false;
  }
  function showDone() {
    drawResults();
    const n = new Set(results.filter(isSure).map((r) => r.match.id)).size,
      co = $('supplier').value.trim();
    status(
      'readStatus',
      `${co ? co + ': ' : ''}اتقرا ${results.length} سطر. وصل من النواقص: ${n}.${co ? '' : ' اختار اسم الشركة فوق.'}`,
      'good',
    );
    notifyDone(co, n);
  }
  // typed lines and Excel names: matched on the server with the same tools, no Gemini (no quota used)
  async function matchLines(lines, label, btn) {
    lines = lines.map((x) => String(x ?? '').trim()).filter((x) => x.length >= 2);
    if (!lines.length) {
      status('readStatus', 'مفيش أسماء أصناف.', 'bad');
      return;
    }
    btn.disabled = true;
    results = [];
    $('results').innerHTML = '';
    newRun();
    try {
      for (let i = 0; i < lines.length; i += 500) {
        status('readStatus', `بيقارن ${Math.min(i + 500, lines.length)} من ${lines.length}…`);
        const d = await invoke({ action: 'lines', lines: lines.slice(i, i + 500) });
        results.push(...(d.rows || []).map((r) => ({ ...r, file: label })));
      }
      showDone();
    } catch (e) {
      status('readStatus', 'تعذّرت المقارنة: ' + e.message, 'bad');
    }
    btn.disabled = false;
  }
  // Text copied from WhatsApp (several messages) starts each message with "[28/10/2026, 1:15 م] Company name: ...":
  // drop that prefix from every line, and use the sender's name as the company when none is chosen.
  const WA_PREFIX = /^\s*\[[^\]]{4,40}\]\s*([^:\n]{1,60}):\s?/;
  function waLines(text) {
    let sender = '';
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((l) => {
        const m = l.match(WA_PREFIX);
        if (m) {
          if (!sender) sender = m[1].trim();
          return l.slice(m[0].length);
        }
        return l;
      });
    return { lines, sender };
  }
  function runText(label, btn) {
    const { lines, sender } = waLines($('pasteText').value);
    if (sender && !/^\+?[\d\s-]+$/.test(sender)) guessSupplier(sender);
    return matchLines(lines, label, btn);
  }
  // WhatsApp has no «مشاركة» for text messages, only «نسخ»: one tap pastes what was copied and compares it
  $('textBtn').onclick = () => runText('مكتوب', $('textBtn'));
  $('pasteBtn').onclick = async () => {
    let t = '';
    try {
      t = await navigator.clipboard.readText();
    } catch (e) {}
    if (!t.trim()) {
      status(
        'readStatus',
        'مالقيتش كلام منسوخ. انسخ الرسايل من الواتس الأول، أو الصقها في الخانة بإيدك (ضغطة طويلة ← لصق).',
        'bad',
      );
      $('pasteText').focus();
      return;
    }
    $('pasteText').value = t;
    await runText('من الواتس', $('pasteBtn'));
  };
  let xlsxLib = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return (
      xlsxLib ||
      (xlsxLib = new Promise((ok, no) => {
        const sc = document.createElement('script');
        sc.src = 'vendor/xlsx-0.20.3.full.min.js';
        sc.onload = () => (window.XLSX ? ok(window.XLSX) : no(Error('قارئ Excel مااشتغلش')));
        sc.onerror = () => {
          xlsxLib = null;
          no(Error('قارئ Excel ماتحمّلش؛ حدّث الصفحة'));
        };
        document.head.append(sc);
      }))
    );
  }
  const NAME_HEAD = /اسم|صنف|منتج|دواء|بيان|name|item|product|description|desc/i,
    NOT_NAME =
      /سعر|خصم|كمي|عدد|رصيد|قيم|اجمال|تاريخ|كود|باركود|price|qty|quantity|disc|total|amount|code|barcode|date|expiry/i;
  // header row = the first of the top 20 rows with a name-like title; name column = that title, or else the column with the most text
  function guessSheet(m) {
    let head = -1,
      col = -1;
    for (let r = 0; r < Math.min(20, m.length) && head < 0; r++) {
      const c = (m[r] || []).findIndex(
        (v) => NAME_HEAD.test(String(v ?? '')) && !NOT_NAME.test(String(v ?? '')) && String(v).length < 40,
      );
      if (c >= 0) {
        head = r;
        col = c;
      }
    }
    const width = Math.max(0, ...m.slice(0, 200).map((r) => (r || []).length));
    if (col < 0) {
      let best = -1;
      for (let c = 0; c < width; c++) {
        const n = m.slice(0, 200).filter((r) => /\p{L}{3,}/u.test(String((r || [])[c] ?? ''))).length;
        if (n > best) {
          best = n;
          col = c;
        }
      }
    }
    return { head, col, width };
  }
  // one Excel/CSV picker (file -> name column -> names), used for the shortage list (shx) and supplier files (xls)
  function excelPicker(p, statusId, onGo) {
    let xls = null;
    const names = () => {
      const c = +$(p + 'Col').value,
        title = xls.head >= 0 ? String(xls.m[xls.head][c] ?? '').trim() : '';
      return xls.m
        .slice(xls.head + 1)
        .map((r) => String((r || [])[c] ?? '').trim())
        .filter((v) => v.length >= 2 && /\p{L}/u.test(v) && v !== title);
    };
    const preview = () => {
      const n = names();
      $(p + 'Preview').textContent = `${n.length} اسم. أول أسماء: ${n.slice(0, 3).join(' / ')}`;
    };
    $(p + 'File').onchange = async () => {
      const f = $(p + 'File').files[0];
      $(p + 'Pick').classList.add('hidden');
      xls = null;
      if (!f) return;
      try {
        if (f.size > 10 * 1024 * 1024) throw Error('الملف أكبر من ١٠ ميجا');
        status(statusId, 'بيفتح الملف…');
        const X = await loadXlsx();
        const wb = X.read(await f.arrayBuffer(), { type: 'array' });
        const m = [];
        for (const n of wb.SheetNames)
          m.push(...X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false, blankrows: false }));
        if (!m.length) throw Error('الملف فاضي');
        const g = guessSheet(m);
        xls = { m, name: f.name, head: g.head };
        const title = (c) => (g.head >= 0 ? String(m[g.head][c] ?? '').trim() : '');
        $(p + 'Col').innerHTML = Array.from(
          { length: g.width },
          (_, c) =>
            `<option value="${c}"${c === g.col ? ' selected' : ''}>عمود ${c + 1}${title(c) ? ' — ' + esc(title(c)) : ''} · مثال: ${esc(String((m.find((r, i) => i > g.head && String((r || [])[c] ?? '').trim()) || [])[c] ?? '').slice(0, 40))}</option>`,
        ).join('');
        preview();
        $(p + 'Pick').classList.remove('hidden');
        status(statusId, 'اتأكد إن العمود المختار هو اسم الصنف، وبعدين اضغط الزرار.');
      } catch (e) {
        status(statusId, 'تعذّر فتح الملف: ' + e.message, 'bad');
      }
    };
    $(p + 'Col').onchange = preview;
    $(p + 'Btn').onclick = () => xls && onGo(names(), xls.name, $(p + 'Btn'));
  }
  excelPicker('xls', 'readStatus', (n, label, btn) => matchLines(n, label, btn));
  const sName = (id) => shortages.find((s) => s.id === id)?.product_name || '',
    aName = (id) => names.get(id)?.arabic_name || '';
  // the quantity in the message to the company: the owner's (order_qty), else the laptop's suggestion (suggested_qty)
  const sRow = (id) => shortages.find((s) => s.id === id),
    qtyNum = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v)),
    qtyOf = (id) => qtyNum(sRow(id)?.order_qty) ?? qtyNum(sRow(id)?.suggested_qty),
    fmtQty = (q) => (q === null ? '' : String(Math.round(q * 10) / 10));
  const isSure = (r) => r.match && (r.match.confidence === 'high' || r.match.confidence === 'confirmed');
  const options = (r) =>
    (r.candidates || []).filter(
      (c, i, a) =>
        c.numbersOk && c.formOk !== false && (c.score ?? 1) >= OFFER_MIN && a.findIndex((x) => x.id === c.id) === i,
    );
  function pickBox(i) {
    return `<details class="pick"><summary>اختار الصنف من النواقص</summary><input type="search" data-pick-q="${i}" placeholder="اكتب جزء من الاسم"><div data-pick-list="${i}"></div></details>`;
  }
  // «تصحيح»: fix the Arabic reading and look again, or pick the item from the shortage list; «مش مهم» hides a name for good.
  function editBox(i) {
    const r = results[i];
    return `<details class="pick" data-edit="${i}"><summary>تصحيح</summary><label>الاسم العربي الصح (لو القراءة غلط)</label><input type="text" dir="auto" data-fix-text="${i}" value="${esc(r.corrected || r.name)}"><button class="secondary" data-rematch="${i}">دوّر بالاسم ده</button> <button class="secondary" data-fix-save="${i}">احفظ التصحيح بس</button><div data-rematch-list="${i}"></div><label>أو اختار الصنف من النواقص</label><input type="search" data-pick-q="${i}" placeholder="اكتب جزء من الاسم"><div data-pick-list="${i}"></div></details>`;
  }
  const fixedLine = (r) =>
    r.corrected && r.corrected !== r.name
      ? `<div class="hint">اتصحح لـ: <span dir="auto">${esc(r.corrected)}</span></div>`
      : '';
  function drawResults() {
    const arrived = new Map(),
      review = [],
      unknown = [];
    let hidden = 0;
    results.forEach((r, i) => {
      if (isSure(r)) {
        const l = arrived.get(r.match.id) || [];
        l.push(i);
        arrived.set(r.match.id, l);
        return;
      }
      if (r.ignored) {
        hidden++;
        return;
      }
      if (r.done !== 'no-all' && options(r).length) return review.push(i);
      unknown.push(i);
    });
    const conf = { confirmed: 'أكدته قبل كده', high: 'مطابقة واضحة', near: 'شبه سطر أكدته قبل كده' };
    $('results').innerHTML =
      `<h3>وصل من النواقص: ${arrived.size}</h3>` +
      ([...arrived]
        .map(
          ([id, ix]) =>
            `<div class="item"><div class="en">${esc(sName(id))}</div><div class="hint">${esc(aName(id))}</div>${orderedFrom(id).length ? `<div><span class="pill good">اتطلب النهارده${esc(who(orderedFrom(id)))}</span> <button class="secondary small" data-unorder="${esc(id)}">لغي «اتطلب»</button></div>` : ''}${ix
              .map((i) => {
                const r = results[i];
                return `<div class="hint">في الصورة: <span dir="auto">${esc(r.name)}</span> · ${conf[r.match.via === 'alias' ? 'near' : r.match.confidence] || ''} <button class="secondary" data-no="${i}:${esc(id)}">مش ده</button></div>${fixedLine(r)}`;
              })
              .join('')}</div>`,
        )
        .join('') || '<p class="hint">مفيش.</p>') +
      `<h3>محتاج تأكيدك: ${review.length}</h3>` +
      (review
        .map((i) => {
          const r = results[i];
          return `<div class="item"><strong dir="auto">${esc(r.name)}</strong>${r.unclear ? ' <span class="pill warn">قراءة مش واضحة</span>' : ''}${fixedLine(r)}<div class="hint">${esc(r.file)}</div>${options(
            r,
          )
            .map(
              (c) =>
                `<div><span class="en">${esc(sName(c.id))}</span> <span class="hint">${esc(aName(c.id))}</span> <button data-yes="${i}:${esc(c.id)}">أيوه، ده هو</button></div>`,
            )
            .join('')}<button class="secondary" data-noall="${i}">مش واحد منهم</button>${editBox(i)}</div>`;
        })
        .join('') || '<p class="hint">مفيش.</p>') +
      `<details><summary>مش من النواقص أو مااتعرفتش: ${unknown.length}</summary><p class="hint">لو فيه صنف من النواقص اختاره من «تصحيح». ولو اسم مش مهم اضغط «مش مهم» ومش هيظهر تاني.</p>${unknown.map((i) => `<div class="item"><span dir="auto">${esc(results[i].name)}</span>${fixedLine(results[i])} <button class="secondary" data-ignore="${i}">مش مهم</button>${editBox(i)}</div>`).join('')}${hidden ? `<p class="hint">واتخبّى ${hidden} اسم قلت قبل كده إنهم مش مهمين.</p>` : ''}</details>`;
    wire();
    drawMessage();
  }
  async function decide(i, id, decision) {
    const r = results[i],
      k = nk(sName(id));
    const row = { alias_key: r.key, read_text: r.name.slice(0, 250), name_key: k, decision };
    let removed = [];
    if (decision === 'yes') {
      const { data } = await client
        .from('ar_answers')
        .select('id,alias_key,read_text,name_key,decision')
        .eq('alias_key', r.key)
        .eq('decision', 'yes');
      removed = (data || []).filter((x) => x.name_key !== k);
      if (removed.length)
        await client
          .from('ar_answers')
          .delete()
          .in(
            'id',
            removed.map((x) => x.id),
          );
    }
    const { data, error } = await client
      .from('ar_answers')
      .upsert(row, { onConflict: 'alias_key,name_key' })
      .select('id');
    if (error) throw Error(error.message);
    return { ids: (data || []).map((x) => x.id), removed };
  }
  function setUndo(label, u, before, i) {
    undo = { u, before, i };
    $('undoBar').innerHTML = `${esc(label)} <button class="secondary" id="undoBtn">تراجع</button>`;
    $('undoBar').classList.remove('hidden');
    $('undoBtn').onclick = async () => {
      const x = undo;
      if (!x) return;
      undo = null;
      $('undoBar').classList.add('hidden');
      for (const u of x.u) {
        if (u.ids?.length) await client.from('ar_answers').delete().in('id', u.ids);
        if (u.removed?.length) await client.from('ar_answers').insert(u.removed.map(({ id, ...y }) => y));
        if (u.ignoreKey) await client.from('ar_ignored').delete().eq('alias_key', u.ignoreKey);
        if (u.fixKey) {
          if (u.fixBefore) await client.from('ar_fixes').upsert(u.fixBefore, { onConflict: 'read_key' });
          else await client.from('ar_fixes').delete().eq('read_key', u.fixKey);
        }
      }
      Object.assign(results[x.i], x.before);
      drawResults();
      status('readStatus', 'اتلغى.');
    };
  }
  function wire() {
    const box = $('results');
    // «لغي «اتطلب»»: the item is not ordered after all; it goes back into the message
    box.querySelectorAll('[data-unorder]').forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            await unmarkOrdered(b.dataset.unorder);
          } catch (e) {
            return status('readStatus', 'مااتلغاش: ' + e.message, 'bad');
          }
          msgEdited = false;
          drawResults();
        }),
    );
    box.querySelectorAll('[data-ignore]').forEach(
      (b) =>
        (b.onclick = async () => {
          const i = b.dataset.ignore,
            r = results[i];
          b.disabled = true;
          const { error } = await client
            .from('ar_ignored')
            .upsert({ alias_key: r.key, read_text: r.name.slice(0, 250) }, { onConflict: 'alias_key' });
          if (error) {
            status('readStatus', 'ماتحفظش: ' + error.message, 'bad');
            b.disabled = false;
            return;
          }
          r.ignored = true;
          drawResults();
          setUndo(`«${r.name}» مش هيظهر تاني.`, [{ ignoreKey: r.key }], { ignored: false }, i);
        }),
    );
    const fixText = (i) => box.querySelector(`[data-fix-text="${i}"]`).value.replace(/\s+/g, ' ').trim();
    async function saveFix(i, text) {
      const r = results[i];
      const { data: old } = await client
        .from('ar_fixes')
        .select('read_key,read_text,corrected_text')
        .eq('read_key', r.key);
      const { error } = await client
        .from('ar_fixes')
        .upsert({ read_key: r.key, read_text: r.name.slice(0, 250), corrected_text: text }, { onConflict: 'read_key' });
      if (error) throw Error(error.message);
      return { fixKey: r.key, fixBefore: old?.[0] || null };
    }
    box.querySelectorAll('[data-fix-save]').forEach(
      (b) =>
        (b.onclick = async () => {
          const i = b.dataset.fixSave,
            r = results[i],
            t = fixText(i);
          if (t.length < 2 || t === r.name) {
            status('readStatus', 'اكتب الاسم الصح الأول.', 'bad');
            return;
          }
          b.disabled = true;
          try {
            const u = await saveFix(i, t);
            const before = { corrected: r.corrected, match: r.match, candidates: r.candidates };
            const d = await invoke({ action: 'match', name: t, english: r.english || '', read: r.name });
            r.corrected = t;
            if (d?.row) {
              r.match = d.row.match;
              r.candidates = d.row.candidates;
            }
            drawResults();
            setUndo(`اتحفظ التصحيح: «${r.name}» ← «${t}». المرة الجاية هيتقري صح لوحده.`, [u], before, i);
          } catch (e) {
            status('readStatus', 'ماتحفظش: ' + e.message, 'bad');
            b.disabled = false;
          }
        }),
    );
    box.querySelectorAll('[data-rematch]').forEach(
      (b) =>
        (b.onclick = async () => {
          const i = b.dataset.rematch,
            r = results[i],
            t = fixText(i),
            out = box.querySelector(`[data-rematch-list="${i}"]`);
          if (t.length < 2) return;
          b.disabled = true;
          out.innerHTML = '<p class="hint">بيدوّر…</p>';
          try {
            const d = await invoke({ action: 'match', name: t, english: '', read: r.name });
            const opts = (d?.row?.candidates || []).filter((c) => (c.score ?? 1) >= 0.3);
            out.innerHTML =
              opts
                .map(
                  (c) =>
                    `<div><span class="en">${esc(sName(c.id))}</span> <span class="hint">${esc(aName(c.id))}${c.numbersOk === false ? ' · التركيز مختلف' : ''}${c.formOk === false ? ' · الشكل مختلف' : ''}</span> <button data-fixpick="${i}:${esc(c.id)}">اختار ده</button></div>`,
                )
                .join('') || '<p class="hint">مالقيتش صنف قريب في النواقص.</p>';
            out.querySelectorAll('[data-fixpick]').forEach(
              (p) =>
                (p.onclick = async () => {
                  const [i2, id] = p.dataset.fixpick.split(':');
                  const r2 = results[i2],
                    t2 = fixText(i2),
                    before = { match: r2.match, done: r2.done, corrected: r2.corrected };
                  p.disabled = true;
                  try {
                    const us = [];
                    if (t2 !== r2.name) us.push(await saveFix(i2, t2));
                    us.push(await decide(i2, id, 'yes'));
                    r2.corrected = t2 !== r2.name ? t2 : r2.corrected;
                    r2.match = { id, confidence: 'confirmed', score: 1 };
                    r2.done = null;
                    drawResults();
                    setUndo(`اتحفظ: «${r2.name}» = ${sName(id)}`, us, before, i2);
                  } catch (e) {
                    status('readStatus', 'ماتحفظش: ' + e.message, 'bad');
                    p.disabled = false;
                  }
                }),
            );
          } catch (e) {
            out.innerHTML = '<p class="status bad">تعذّر البحث: ' + esc(e.message) + '</p>';
          }
          b.disabled = false;
        }),
    );
    box.querySelectorAll('[data-yes]').forEach(
      (b) =>
        (b.onclick = async () => {
          const [i, id] = b.dataset.yes.split(':');
          const r = results[i],
            before = { match: r.match, done: r.done };
          b.disabled = true;
          try {
            const u = await decide(i, id, 'yes');
            r.match = { id, confidence: 'confirmed', score: 1 };
            drawResults();
            setUndo(`اتحفظ: «${r.name}» = ${sName(id)}`, [u], before, i);
          } catch (e) {
            status('readStatus', 'ماتحفظش: ' + e.message, 'bad');
            b.disabled = false;
          }
        }),
    );
    box.querySelectorAll('[data-no]').forEach(
      (b) =>
        (b.onclick = async () => {
          const [i, id] = b.dataset.no.split(':');
          const r = results[i],
            before = { match: r.match, candidates: r.candidates, done: r.done };
          b.disabled = true;
          try {
            const u = await decide(i, id, 'no');
            r.match = null;
            r.candidates = (r.candidates || []).filter((c) => c.id !== id);
            drawResults();
            setUndo(`اتسجّل إن «${r.name}» مش ${sName(id)}`, [u], before, i);
          } catch (e) {
            status('readStatus', 'ماتحفظش: ' + e.message, 'bad');
            b.disabled = false;
          }
        }),
    );
    box.querySelectorAll('[data-noall]').forEach(
      (b) =>
        (b.onclick = async () => {
          const i = b.dataset.noall,
            r = results[i],
            before = { match: r.match, candidates: r.candidates, done: r.done };
          b.disabled = true;
          try {
            const us = [];
            for (const c of options(r)) us.push(await decide(i, c.id, 'no'));
            // and the line itself: «none of the shortages», so it is not offered other items next time
            const { data, error } = await client
              .from('ar_answers')
              .upsert(
                { alias_key: r.key, read_text: r.name.slice(0, 250), name_key: NOT_LISTED, decision: 'no' },
                { onConflict: 'alias_key,name_key' },
              )
              .select('id');
            if (error) throw Error(error.message);
            us.push({ ids: (data || []).map((x) => x.id), removed: [] });
            r.done = 'no-all';
            drawResults();
            setUndo(`اتسجّل إن «${r.name}» مش واحد منهم`, us, before, i);
          } catch (e) {
            status('readStatus', 'ماتحفظش: ' + e.message, 'bad');
            b.disabled = false;
          }
        }),
    );
    box.querySelectorAll('[data-pick-q]').forEach(
      (inp) =>
        (inp.oninput = () => {
          const i = inp.dataset.pickQ,
            f = key(inp.value),
            out = box.querySelector(`[data-pick-list="${i}"]`);
          if (f.length < 2) {
            out.innerHTML = '';
            return;
          }
          out.innerHTML =
            shortages
              .filter((s) => key(s.product_name + ' ' + aName(s.id)).includes(f))
              .slice(0, 10)
              .map(
                (s) =>
                  `<div><span class="en">${esc(s.product_name)}</span> <button data-yes="${i}:${esc(s.id)}">اختار ده</button></div>`,
              )
              .join('') || '<p class="hint">مفيش في النواقص.</p>';
          out.querySelectorAll('[data-yes]').forEach(
            (b) =>
              (b.onclick = async () => {
                const [i2, id] = b.dataset.yes.split(':');
                const r = results[i2],
                  before = { match: r.match, done: r.done };
                b.disabled = true;
                try {
                  const u = await decide(i2, id, 'yes');
                  r.match = { id, confidence: 'confirmed', score: 1 };
                  r.done = null;
                  drawResults();
                  setUndo(`اتحفظ: «${r.name}» = ${sName(id)}`, [u], before, i2);
                } catch (e) {
                  status('readStatus', 'ماتحفظش: ' + e.message, 'bad');
                  b.disabled = false;
                }
              }),
          );
        }),
    );
  }

  // ---------- WhatsApp: companies, ready message, share target ----------
  let suppliers = [],
    msgEdited = false;
  const digitsOnly = (s) =>
    String(s || '')
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/\D/g, '');
  // Egyptian mobile written 01xxxxxxxxx -> 201xxxxxxxxx (WhatsApp needs the country code)
  const waPhone = (s) => {
    let d = digitsOnly(s);
    if (/^01\d{9}$/.test(d)) d = '2' + d;
    else if (/^00\d+/.test(d)) d = d.slice(2);
    return /^\d{8,15}$/.test(d) ? d : '';
  };
  // the saved companies, or null when they could not be read
  async function fetchSuppliers() {
    try {
      const { data, error } = await client.from('ar_suppliers').select('name,phone').order('name');
      return error ? null : data || [];
    } catch (e) {
      return null;
    }
  }
  function applySuppliers(list) {
    suppliers = list;
    $('supplierList').innerHTML = suppliers.map((x) => `<option value="${esc(x.name)}">`).join('');
    drawSupplierRows();
    drawSupplierPick();
  }
  async function loadSuppliers() {
    applySuppliers((await fetchSuppliers()) ?? []);
    saveCache();
  }
  // «غيّر الشركة (المندوب)»: every saved company, whatever is written in the box now (the list under the box only
  // shows names like the one already written). Picking one writes its name and its number (or empties the number).
  function drawSupplierPick() {
    $('supplierPick').innerHTML =
      suppliers
        .map((x) => `<button class="secondary small" data-pick-supplier="${esc(x.name)}">${esc(x.name)}</button>`)
        .join(' ') || '<p class="hint">مفيش شركات محفوظة لسه.</p>';
    $('supplierPick')
      .querySelectorAll('[data-pick-supplier]')
      .forEach(
        (b) =>
          (b.onclick = () => {
            const x = suppliers.find((s) => s.name === b.dataset.pickSupplier);
            if (!x) return;
            $('supplier').value = x.name;
            $('supplierPhone').value = x.phone || '';
            $('supplierPickBox').open = false;
            status('msgStatus', `الرسالة هتتبعت لـ ${x.name}.`, 'good');
          }),
      );
  }
  // ---------- automatic incoming: companies, phone key, inbox ----------
  function drawSupplierRows() {
    $('supplierRows').innerHTML =
      suppliers
        .map(
          (x) =>
            `<div class="item"><strong dir="auto">${esc(x.name)}</strong> <span class="hint" dir="ltr">${esc(x.phone || '')}</span> <button class="secondary small" data-del-supplier="${esc(x.name)}">شيل</button></div>`,
        )
        .join('') || '<p class="hint">مفيش شركات لسه.</p>';
    $('supplierRows')
      .querySelectorAll('[data-del-supplier]')
      .forEach(
        (b) =>
          (b.onclick = async () => {
            const { error } = await client.from('ar_suppliers').delete().eq('name', b.dataset.delSupplier);
            if (error) return status('supplierStatus', 'ماتشالتش: ' + error.message, 'bad');
            status('supplierStatus', 'اتشالت: ' + b.dataset.delSupplier, 'good');
            await loadSuppliers();
          }),
      );
  }
  $('addSupplier').onclick = async () => {
    const name = $('newSupplier').value.replace(/\s+/g, ' ').trim().slice(0, 80),
      phone = waPhone($('newSupplierPhone').value) || null;
    if (name.length < 2) return status('supplierStatus', 'اكتب اسم الشركة.', 'bad');
    const { error } = await client
      .from('ar_suppliers')
      .upsert({ name, phone, updated_at: new Date().toISOString() }, { onConflict: 'name' });
    if (error) return status('supplierStatus', 'ماتحفظتش: ' + error.message, 'bad');
    $('newSupplier').value = $('newSupplierPhone').value = '';
    status('supplierStatus', 'اتضافت: ' + name, 'good');
    await loadSuppliers();
  };
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  $('newKey').onclick = async () => {
    const key = hex(crypto.getRandomValues(new Uint8Array(32)));
    const key_hash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
    const del = await client.from('ar_inbox_keys').delete().neq('key_hash', '');
    const { error } = del.error ? del : await client.from('ar_inbox_keys').insert({ key_hash });
    if (error) return status('keyStatus', 'ماتعملش: ' + error.message, 'bad');
    $('keyText').value = key;
    $('inboxUrl').value = `${SUPABASE_URL}/functions/v1/${FN}`;
    $('keyBox').classList.remove('hidden');
    status('keyStatus', 'اتعمل مفتاح جديد. انسخه في Tasker دلوقتي، مش هيظهر تاني.', 'good');
  };
  const copy = async (id, label) => {
    try {
      await navigator.clipboard.writeText($(id).value);
      status('keyStatus', `اتنسخ ${label}.`, 'good');
    } catch (e) {
      $(id).select();
    }
  };
  $('copyKey').onclick = () => copy('keyText', 'المفتاح');
  $('copyUrl').onclick = () => copy('inboxUrl', 'العنوان');
  // ---------- items ordered today («اتطلب») ----------
  // Items ordered today: they are left out of the next company's message, shown as «اتطلب», and the phone does not say
  // them again. Opening WhatsApp only makes them «جاهز للطلب»; they become «اتطلب» when the owner says the message was
  // sent («أيوه اتبعت»). The owner can undo a mark («لغي»).
  let orders = [];
  const dayStart = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };
  async function fetchOrders() {
    try {
      const { data, error } = await client
        .from('ar_orders')
        .select('id,name_key,product_name,supplier,ordered_at')
        .gte('ordered_at', dayStart())
        .order('ordered_at', { ascending: true })
        .limit(2000);
      if (error) throw Error(error.message);
      return data || [];
    } catch (e) {
      return [];
    }
  }
  async function loadOrders() {
    orders = await fetchOrders();
    drawShort();
  }
  // the companies an item was ordered from today ('' when marked without a company)
  const orderedFrom = (id) => {
    const k = nk(sName(id));
    return orders.filter((o) => o.name_key === k).map((o) => o.supplier || '');
  };
  const who = (from) => {
    const n = [...new Set(from.filter(Boolean))];
    return n.length ? ' من ' + n.join(' و') : '';
  };
  // marks items ordered today (from this company, or none); an item already marked for that company is not added again
  async function markOrdered(ids, supplier) {
    const co = supplier || null,
      rows = [...new Set(ids)]
        .filter((id) => sName(id) && !orders.some((o) => o.name_key === nk(sName(id)) && (o.supplier || null) === co))
        .map((id) => ({ name_key: nk(sName(id)), product_name: sName(id), supplier: co, ordered_at: new Date().toISOString() }));
    if (!rows.length) return 0;
    const { error } = await client.from('ar_orders').insert(rows);
    if (error) throw Error(error.message);
    await loadOrders();
    drawToday();
    return rows.length;
  }
  // «جاهز للطلب»: kept on this phone (also after the browser is closed) until the owner answers, one entry per company,
  // today only. Until then nothing is «اتطلب»: other companies' messages and the phone still include these items.
  const PENDING = 'ar-pending-orders';
  const readPending = () => {
    try {
      const l = JSON.parse(localStorage.getItem(PENDING) || '[]');
      return Array.isArray(l) ? l.filter((p) => p && Array.isArray(p.ids) && p.ids.length && String(p.at) >= dayStart()) : [];
    } catch (e) {
      return [];
    }
  };
  const writePending = (l) => {
    try {
      if (l.length) localStorage.setItem(PENDING, JSON.stringify(l));
      else localStorage.removeItem(PENDING);
    } catch (e) {}
  };
  function drawPending() {
    const p = readPending()[0];
    $('pendingOrder').classList.toggle('hidden', !p);
    if (p) $('pendingText').textContent = `جاهز للطلب: ${p.ids.length} صنف لـ${p.supplier || 'الشركة'}. الرسالة اتبعتت في الواتس؟`;
  }
  $('pendingYes').onclick = async () => {
    const l = readPending(), p = l[0];
    if (!p) return drawPending();
    try {
      const n = await markOrdered(p.ids, p.supplier);
      writePending(l.slice(1));
      drawPending();
      status('msgStatus', n ? `اتعلّم ${n} صنف «اتطلب» النهارده، فمش هيدخلوا في رسالة شركة تانية.` : 'الأصناف دي متعلّمة «اتطلب» من قبل.', 'good');
      if (n) {
        // the message stays as it was sent; the items show «اتطلب»
        msgEdited = true;
        drawResults();
      }
    } catch (e) {
      status('msgStatus', 'ماتسجلش «اتطلب»، دوس «أيوه اتبعت» تاني: ' + e.message, 'bad');
    }
  };
  $('pendingNo').onclick = () => {
    const l = readPending();
    writePending(l.slice(1));
    drawPending();
    status('msgStatus', 'تمام، مفيش صنف اتعلّم «اتطلب».');
  };
  async function unmarkOrdered(id) {
    const { error } = await client.from('ar_orders').delete().eq('name_key', nk(sName(id))).gte('ordered_at', dayStart());
    if (error) throw Error(error.message);
    await loadOrders();
    drawToday();
  }
  let inbox = [];
  const localDay = (t) => new Date(t - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const daysAgo = (d) => {
    const n = Math.round((Date.parse(localDay(Date.now())) - Date.parse(d)) / 864e5);
    return n <= 0 ? 'النهارده' : n === 1 ? 'امبارح' : `من ${n} أيام`;
  };
  const KIND = { text: 'رسالة', image: 'صورة', pdf: 'PDF', sheet: 'Excel' };
  // one group per company per day: everything it sent today opens together, with one message
  function inboxGroups() {
    const g = new Map();
    for (const x of inbox) {
      const day = localDay(Date.parse(x.received_at)),
        maybe = x.maybe && x.maybe.length > 1 ? x.maybe : null,
        k = (maybe ? '?' + maybe.join('|') : x.supplier || x.sender) + '|' + day;
      // photos that came while two companies sent photos: grouped apart until the owner picks each one's company
      if (!g.has(k)) g.set(k, { supplier: maybe ? 'صور مش معروف صاحبها' : x.supplier || x.sender, maybe, day, items: [] });
      g.get(k).items.push(x);
    }
    return [...g.values()];
  }
  async function fetchInbox() {
    try {
      const since = new Date(Date.now() - 3 * 864e5).toISOString();
      const { data, error } = await client
        .from('ar_inbox')
        .select('id,received_at,sender,supplier,kind,file_path,status,error,rows,sure,review,maybe')
        // photos still waiting for their company and messages not read stay listed until handled, however old
        .or(`received_at.gte."${since}",maybe.not.is.null,status.eq.error`)
        .is('hidden_at', null)
        .order('received_at', { ascending: false })
        .limit(200);
      if (error) throw Error(error.message);
      // hidden messages are kept (never deleted): they are the original record and stop WhatsApp's repeats being read again
      return data || [];
    } catch (e) {
      return [];
    }
  }
  async function loadInbox() {
    inbox = await fetchInbox();
    drawInbox();
  }
  function drawInbox() {
    const groups = inboxGroups();
    // the number on the «النهارده» tab: companies with something new, and photos still waiting for their company
    const fresh = groups.filter((g) => g.maybe || g.items.some((x) => x.status === 'new')).length;
    $('subBadge').textContent = fresh;
    $('subBadge').classList.toggle('hidden', !fresh);
    const time = (t) => new Date(t).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
    $('inboxList').innerHTML =
      groups
        .map((g, gi) => {
          const fresh = g.items.some((x) => x.status === 'new'),
            sure = g.items.reduce((a, x) => a + (x.sure || 0), 0),
            review = g.items.reduce((a, x) => a + (x.review || 0), 0),
            errors = g.items.filter((x) => x.status === 'error').length;
          if (g.maybe)
            return `<div class="item inbox-item fresh unsure"><div><strong>⚠️ صور من ${esc(g.maybe.join(' أو '))}</strong> <span class="hint">${esc(daysAgo(g.day))} · ${esc(time(g.items[g.items.length - 1].received_at))}</span></div><div class="hint">وصلوا في نفس الوقت، فمش معروف كل صورة من مين. اختار صاحب كل صورة:</div>${g.items
              .map(
                (x) =>
                  `<div class="unsure-photo"><a data-photo="${esc(x.file_path || '')}" target="_blank" rel="noopener"><img data-photo="${esc(x.file_path || '')}" alt="الصورة" /></a><div class="hint">وصل ${x.sure || 0}${x.review ? ` · محتاج تأكيدك ${x.review}` : ''}${x.status === 'error' ? ` · ماتقراش <button class="secondary small" data-reread="${esc(x.id)}">اقرا تاني</button>` : ''}</div><div>${g.maybe.map((n) => `<button class="secondary small" data-assign="${esc(x.id)}" data-to="${esc(n)}">${esc(n)}</button>`).join(' ')}</div></div>`,
              )
              .join('')}<button class="secondary small" data-inbox-del="${gi}">امسح</button></div>`;
          return `<div class="item inbox-item${fresh ? ' fresh' : ''}"><div><strong dir="auto">${esc(g.supplier)}</strong> <span class="hint">${esc(daysAgo(g.day))} · ${esc(time(g.items[g.items.length - 1].received_at))}</span>${fresh ? ' <span class="pill bad">جديد</span>' : ''}</div><div class="hint">${g.items.map((x) => KIND[x.kind] || x.kind).join('، ')} · وصل ${sure}${review ? ` · محتاج تأكيدك ${review}` : ''}${errors ? ` · ${errors} ماتقراش` : ''}</div>${errors ? `<button class="secondary small" data-reread="${esc(g.items.filter((x) => x.status === 'error').map((x) => x.id).join(','))}">اقرا تاني</button> ` : ''}<button data-inbox-open="${gi}">افتح</button> <button class="secondary small" data-inbox-del="${gi}">امسح</button></div>`;
        })
        .join('') || '<p class="hint">مفيش وارد وصل لوحده لسه.</p>';
    $('inboxList')
      .querySelectorAll('[data-inbox-open]')
      .forEach((b) => (b.onclick = () => openInbox(groups[+b.dataset.inboxOpen])));
    $('inboxList')
      .querySelectorAll('[data-inbox-del]')
      .forEach((b) => (b.onclick = () => deleteInbox(groups[+b.dataset.inboxDel])));
    $('inboxList')
      .querySelectorAll('[data-reread]')
      .forEach((b) => (b.onclick = () => rereadInbox(b.dataset.reread.split(','), b)));
    $('inboxList')
      .querySelectorAll('[data-assign]')
      .forEach((b) => (b.onclick = () => assignInbox(b.dataset.assign, b.dataset.to)));
    showPhotos();
    drawToday();
  }
  // ---------- «متاح النهارده»: each shortage that came today in the automatic inbox, and from which companies ----------
  // Photos still waiting for their company and messages that were not read are left out. Items ordered today go last.
  function todayItems() {
    const today = localDay(Date.now()),
      by = new Map();
    for (const x of inbox) {
      if (localDay(Date.parse(x.received_at)) !== today || (x.maybe && x.maybe.length > 1) || x.status === 'error') continue;
      const co = x.supplier || x.sender;
      for (const r of x.rows || []) {
        if (!isSure(r) || !sName(r.match.id)) continue;
        const it = by.get(r.match.id) || { id: r.match.id, cos: [] };
        if (!it.cos.includes(co)) it.cos.push(co);
        by.set(r.match.id, it);
      }
    }
    return [...by.values()];
  }
  function drawToday() {
    const items = todayItems().map((x) => ({ ...x, from: orderedFrom(x.id), label: aName(x.id) || sName(x.id) }));
    items.sort(
      (a, b) =>
        (a.from.length ? 1 : 0) - (b.from.length ? 1 : 0) ||
        b.cos.length - a.cos.length ||
        a.label.localeCompare(b.label, 'ar'),
    );
    const done = items.filter((x) => x.from.length).length;
    $('todaySum').textContent = `متاح النهارده: ${items.length} صنف` + (done ? ` · اتطلب ${done}` : '');
    $('todayList').innerHTML =
      items
        .map(
          (x) =>
            `<div class="item${x.from.length ? ' ordered' : ''}"><strong dir="auto">${esc(x.label)}</strong>${x.label !== sName(x.id) ? `<div class="en hint">${esc(sName(x.id))}</div>` : ''}<div class="chips"><span class="hint">عند:</span> ${x.cos.map((c) => `<button class="secondary small" data-today-co="${esc(c)}">${esc(c)}</button>`).join('')}</div><div>${x.from.length ? `<span class="pill good">اتطلب${esc(who(x.from))}</span> <button class="secondary small" data-today-unorder="${esc(x.id)}">لغي «اتطلب»</button>` : `<button class="secondary small" data-today-order="${esc(x.id)}">علّم «اتطلب»</button>`}</div></div>`,
        )
        .join('') || '<p class="hint">لسه ماوصلش حاجة من النواقص النهارده.</p>';
    const box = $('todayList');
    // a company's name opens what it sent today, with its message
    box.querySelectorAll('[data-today-co]').forEach(
      (b) =>
        (b.onclick = () => {
          const g = inboxGroups().find(
            (g) => !g.maybe && g.supplier === b.dataset.todayCo && g.day === localDay(Date.now()),
          );
          if (g) openInbox(g);
        }),
    );
    // marked by hand: from the company when only one has it, else without a company
    box.querySelectorAll('[data-today-order]').forEach(
      (b) =>
        (b.onclick = async () => {
          const x = items.find((i) => i.id === b.dataset.todayOrder);
          b.disabled = true;
          try {
            await markOrdered([x.id], x.cos.length === 1 ? x.cos[0] : '');
          } catch (e) {
            b.disabled = false;
            return alert('ماتعلّمش: ' + e.message);
          }
          if (results.length) drawResults();
        }),
    );
    box.querySelectorAll('[data-today-unorder]').forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            await unmarkOrdered(b.dataset.todayUnorder);
          } catch (e) {
            b.disabled = false;
            return alert('مااتلغاش: ' + e.message);
          }
          if (results.length) {
            msgEdited = false;
            drawResults();
          }
        }),
    );
  }
  // the photos waiting for their company are shown (private bucket: short signed links, owner only)
  async function showPhotos() {
    const els = [...$('inboxList').querySelectorAll('[data-photo]')].filter((e) => e.dataset.photo);
    if (!els.length) return;
    try {
      const paths = [...new Set(els.map((e) => e.dataset.photo))];
      const { data, error } = await client.storage.from('ar-inbox').createSignedUrls(paths, 3600);
      if (error) throw Error(error.message);
      const url = new Map((data || []).map((d) => [d.path, d.signedUrl]));
      for (const e of els) {
        const u = url.get(e.dataset.photo);
        if (u) e.tagName === 'IMG' ? (e.src = u) : (e.href = u);
      }
    } catch (e) {
      for (const e2 of els) if (e2.tagName === 'IMG') e2.alt = 'الصورة مش ظاهرة';
    }
  }
  // the owner picks the company of a photo that came while two companies sent photos
  async function assignInbox(id, supplier) {
    const { error } = await client.from('ar_inbox').update({ supplier, maybe: null }).eq('id', id);
    if (error) return alert('ماتحفظش: ' + error.message);
    await loadInbox();
  }
  // «اقرا تاني»: a photo/PDF that was not read (Google busy or too slow) is read again from its saved copy on the server;
  // its row is filled in only if it is still not read, so nothing is saved twice and the phone says nothing again
  async function rereadInbox(ids, btn) {
    btn.disabled = true;
    btn.textContent = 'بيقرا… (لحد دقيقتين)';
    let done = 0,
      fail = '';
    for (const id of ids) {
      try {
        await invoke({ action: 'reread', id });
        done++;
      } catch (e) {
        fail = e.message;
      }
    }
    await loadInbox();
    if (fail) alert((done ? `اتقرا ${done}، و` : '') + 'ماتقراش: ' + fail);
  }
  // the owner removes incoming messages from the list (the phone's WhatsApp is not touched); asked first. They are
  // hidden, not deleted, so the same message shown again by WhatsApp is still known and not read again
  async function deleteInbox(g) {
    if (!confirm(`تمسح وارد ${g.supplier} (${g.items.length})؟`)) return;
    const { error } = await client.from('ar_inbox').update({ hidden_at: new Date().toISOString() }).in('id', g.items.map((x) => x.id));
    if (error) return alert('ماتمسحش: ' + error.message);
    await loadInbox();
  }
  $('inboxClear').onclick = async () => {
    if (!inbox.length || !confirm('تمسح كل الوارد؟ الصور اللي لسه مش معروف صاحبها واللي ماتقريتش هتفضل لحد ما تخلصها.')) return;
    // photos waiting for their company and messages not read are not cleared with the rest (each card can still remove them)
    const { error } = await client.from('ar_inbox').update({ hidden_at: new Date().toISOString() }).is('hidden_at', null).is('maybe', null).neq('status', 'error');
    if (error) return alert('ماتمسحش: ' + error.message);
    await loadInbox();
  };
  async function openInbox(g) {
    showSub('today');
    newRun();
    results = [];
    for (const x of [...g.items].reverse())
      results.push(...(x.rows || []).map((r) => ({ ...r, file: `${KIND[x.kind] || x.kind} من الواتس` })));
    $('supplier').value = g.supplier;
    const s = suppliers.find((x) => x.name === g.supplier);
    $('supplierPhone').value = s?.phone || '';
    const errs = g.items.filter((x) => x.status === 'error');
    showDone();
    if (errs.length)
      status(
        'readStatus',
        `${errs.length} من الوارد ماتقراش (${errs[0].error || ''}). افتح الواتس وشاركه يدوي.`,
        'bad',
      );
    const ids = g.items.filter((x) => x.status === 'new').map((x) => x.id);
    if (ids.length) {
      await client.from('ar_inbox').update({ status: 'seen' }).in('id', ids);
      g.items.forEach((x) => x.status === 'new' && (x.status = 'seen'));
      drawInbox();
    }
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('inboxRefresh').onclick = loadInbox;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !$('app').classList.contains('hidden')) {
      loadDataAge();
      drawPending();
      loadOrders().then(loadInbox);
    }
  });
  $('supplier').addEventListener('input', () => {
    const x = suppliers.find((s) => s.name === $('supplier').value.trim());
    if (x && x.phone) $('supplierPhone').value = x.phone;
    if (!msgEdited) drawMessage();
  });
  // Gemini may read the company name off the list: use it only when the owner has not chosen one, preferring a saved company
  function guessSupplier(name) {
    if ($('supplier').value.trim()) return;
    const k = nk(name);
    const x = suppliers.find((s) => nk(s.name) === k || k.includes(nk(s.name)) || nk(s.name).includes(k));
    $('supplier').value = x ? x.name : name.slice(0, 80);
    if (x && x.phone) $('supplierPhone').value = x.phone;
  }
  async function saveSupplier() {
    const name = $('supplier').value.replace(/\s+/g, ' ').trim().slice(0, 80),
      phone = waPhone($('supplierPhone').value) || null;
    if (name.length < 2) return;
    const old = suppliers.find((s) => s.name === name);
    if (old && (old.phone || null) === phone) return;
    const { error } = await client
      .from('ar_suppliers')
      .upsert(
        { name, phone: phone || old?.phone || null, updated_at: new Date().toISOString() },
        { onConflict: 'name' },
      );
    if (!error) await loadSuppliers();
  }
  function newRun() {
    msgEdited = false;
    $('msgBox').classList.add('hidden');
  }
  // the message: every shortage found in this company's list, written the way the company wrote it, except the items
  // already ordered today (from any company), which are listed under it
  function msgItems() {
    const seen = new Set(),
      out = [];
    for (const r of results) {
      if (!isSure(r) || seen.has(r.match.id)) continue;
      seen.add(r.match.id);
      out.push({ id: r.match.id, line: r.corrected || r.name, from: orderedFrom(r.match.id) });
    }
    return out;
  }
  function buildMessage() {
    const items = msgItems().filter((x) => !x.from.length);
    if (!items.length) return '';
    return [
      'السلام عليكم،',
      'محتاجين من المتاح عندكم:',
      ...items.map((x, i) => `${i + 1}- ${x.line}` + (qtyOf(x.id) === null ? '' : ` — ${fmtQty(qtyOf(x.id))}`)),
      '',
      'صيدلية عسكر',
    ].join('\n');
  }
  // a quantity box for each item in the message: the suggestion is filled in, the owner changes it before sending
  function drawQty() {
    const items = msgItems().filter((x) => !x.from.length);
    $('msgQty').innerHTML = items.length
      ? '<p class="hint">الكمية (مقترحة من البرنامج، غيّرها لو حابب، ولو مسحتها يرجع للمقترح):</p>' +
        items
          .map((x) => {
            const sug = fmtQty(qtyNum(sRow(x.id)?.suggested_qty));
            return `<label class="qty"><span dir="auto">${esc(x.line)}</span><input type="number" min="0" step="1" inputmode="decimal" data-qty="${esc(x.id)}" value="${esc(fmtQty(qtyOf(x.id)))}" placeholder="${esc(sug)}"></label>${sug ? `<p class="hint qty-hint">مقترح: ${esc(sug)}</p>` : ''}`;
          })
          .join('')
      : '';
  }
  $('msgQty').addEventListener('change', async (e) => {
    const id = e.target?.dataset?.qty,
      s = id && sRow(id);
    if (!s) return;
    const raw = String(e.target.value).trim(),
      v = raw === '' ? null : Math.round(Number(raw) * 10) / 10;
    if (v !== null && !(v > 0)) {
      status('msgStatus', 'الكمية لازم تكون رقم أكبر من صفر، أو سيبها فاضية عشان ترجع للمقترح.', 'bad');
      e.target.value = fmtQty(qtyOf(id));
      return;
    }
    const before = s.order_qty;
    s.order_qty = v;
    if (!msgEdited) $('msgText').value = buildMessage();
    const { error } = await client.from('ar_shortages').update({ order_qty: v }).eq('id', id);
    if (error) {
      s.order_qty = before;
      e.target.value = fmtQty(qtyOf(id));
      if (!msgEdited) $('msgText').value = buildMessage();
      status('msgStatus', 'ماتحفظتش الكمية: ' + error.message, 'bad');
      return;
    }
    status(
      'msgStatus',
      (v === null ? 'رجعت للكمية المقترحة.' : 'اتحفظت الكمية.') +
        (msgEdited ? ' الرسالة اتعدّلت بإيدك، فغيّر الرقم فيها بنفسك.' : ''),
      'good',
    );
  });
  // who the message goes to, shown on the message itself (the company box is on the «قراية بإيدك» tab)
  function drawMsgTo() {
    const co = $('supplier').value.trim(),
      ph = $('supplierPhone').value.trim();
    $('msgTo').textContent = co ? `الرسالة لـ ${co}${ph ? ' · ' + ph : ''}` : 'اختار الشركة الأول (من «غيّر الشركة»)';
  }
  $('msgChange').onclick = () => {
    showSub('manual');
    $('supplier').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('supplier').focus();
  };
  $('supplierPhone').addEventListener('input', drawMsgTo);
  function drawMessage() {
    drawQty();
    drawMsgTo();
    if (msgEdited) return;
    const t = buildMessage(),
      skipped = msgItems().filter((x) => x.from.length);
    $('msgText').value = t;
    $('msgSkip').textContent = skipped.length
      ? `مش في الرسالة لأنهم اتطلبوا النهارده: ${skipped.map((x) => x.line + who(x.from)).join('، ')}. لو عاوز تطلبهم تاني دوس «لغي «اتطلب»» عند الصنف فوق.`
      : '';
    $('msgBox').classList.toggle('hidden', !t);
  }
  $('msgText').addEventListener('input', () => {
    msgEdited = true;
  });
  const isAndroid = () => /Android/i.test(navigator.userAgent);
  const openUrl = (u) => (window.__openUrl ? window.__openUrl(u) : (location.href = u));
  function waIntent(phone, text, fallback) {
    const q = (phone ? `phone=${phone}&` : '') + `text=${encodeURIComponent(text)}`;
    return `intent://send/?${q}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
  }
  // «واتساب بيزنس» choice, remembered on this phone (on by default)
  try {
    $('waBiz').checked = localStorage.getItem('ar-wa-biz') !== '0';
  } catch (e) {}
  $('waBiz').onchange = () => {
    try {
      localStorage.setItem('ar-wa-biz', $('waBiz').checked ? '1' : '0');
    } catch (e) {}
  };
  // shared with ar/order-drafts.js («الطلبيات»): open WhatsApp (Business when chosen) on a supplier's chat (its saved number;
  // no number = the owner picks the chat) with a ready message; an empty text opens the chat bare (the message was too long
  // for a link and is on the clipboard)
  window.AskerApp.openWhatsApp = (text, phone) => {
    const t = text || '',
      ph = waPhone(phone || ''),
      web = `https://wa.me/${ph}${t ? '?text=' + encodeURIComponent(t) : ''}`;
    if (isAndroid() && $('waBiz').checked) openUrl(waIntent(ph, t, web));
    else window.open(web, '_blank');
  };
  $('waBtn').onclick = async () => {
    const t = $('msgText').value.trim();
    if (!t) return;
    await saveSupplier();
    // the items in the message (as it is now, after the owner's edits) are «جاهز للطلب» from this company, not «اتطلب»
    const co = $('supplier').value.replace(/\s+/g, ' ').trim().slice(0, 80);
    const ids = [...new Set(msgItems().filter((x) => t.includes(x.line)).map((x) => x.id))];
    if (ids.length) {
      writePending([...readPending().filter((p) => p.supplier !== co), { supplier: co, ids, at: new Date().toISOString() }]);
      drawPending();
    }
    const ph = waPhone($('supplierPhone').value);
    const web = `https://wa.me/${ph}?text=${encodeURIComponent(t)}`;
    // On Android, open WhatsApp Business (com.whatsapp.w4b) directly when chosen, instead of whichever WhatsApp
    // Android picks for wa.me links; if it is not installed, Chrome falls back to the wa.me link.
    if (isAndroid() && $('waBiz').checked) openUrl(waIntent(ph, t, web));
    else window.open(web, '_blank');
    status(
      'msgStatus',
      (ph
        ? 'اتفتحت محادثة الشركة في الواتس، اضغط إرسال هناك.'
        : 'اختار محادثة الشركة في الواتس واضغط إرسال. (لو كتبت رقم الشركة فوق، المرة الجاية هتتفتح محادثتها على طول.)') +
        (ids.length ? ' بعد ما تبعت ارجع هنا ودوس «أيوه اتبعت»، ولحد كده الأصناف مش هتتعلّم «اتطلب».' : ''),
      'good',
    );
  };
  $('copyBtn').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('msgText').value);
      status('msgStatus', 'اتنسخت.', 'good');
    } catch (e) {
      $('msgText').select();
      status('msgStatus', 'حدّد الرسالة وانسخها.');
    }
  };
  // notification when a shared list finishes while the bot is in the background
  let swReg = null;
  if ('serviceWorker' in navigator)
    navigator.serviceWorker
      .register('ar/sw.js', { scope: 'ar/' })
      .then((r) => {
        swReg = r;
      })
      .catch(() => {});
  function drawNotify() {
    $('notifyBtn').classList.toggle('hidden', !('Notification' in window) || Notification.permission !== 'default');
  }
  $('notifyBtn').onclick = async () => {
    try {
      await Notification.requestPermission();
    } catch (e) {}
    drawNotify();
  };
  drawNotify();
  function notifyDone(co, n) {
    try {
      if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted' || !swReg) return;
      swReg.showNotification('نواقص عربي', {
        body: `${co || 'الشركة'}: وصل ${n} صنف من النواقص. الرسالة جاهزة.`,
        icon: 'icons/arabic-192.png',
        tag: 'ar-read',
      });
    } catch (e) {}
  }
  // shared from WhatsApp: ?share=<id> -> files and text the service worker kept in the cache
  let pendingShare = new URLSearchParams(location.search).get('share');
  async function takeShare() {
    const id = pendingShare;
    if (!id) return;
    pendingShare = null;
    history.replaceState(null, '', location.pathname);
    document.querySelector('[data-tab="read"]').click();
    showSub('manual');
    if (id === 'error' || !('caches' in window)) {
      status('readStatus', 'الملفات اللي اتشاركت ماوصلتش؛ شاركها تاني أو اختارها من هنا.', 'bad');
      return;
    }
    const c = await caches.open('ar-share'),
      base = new URL('ar-share/' + id + '/', location.href).href,
      metaRes = await c.match(base + 'meta');
    if (!metaRes) {
      status('readStatus', 'الملفات اللي اتشاركت ماوصلتش؛ شاركها تاني.', 'bad');
      return;
    }
    const meta = await metaRes.json(),
      files = [];
    for (const f of meta.files) {
      const r = await c.match(new URL(f.key, location.href).href);
      if (r) files.push(new File([await r.blob()], f.name, { type: f.type || r.headers.get('content-type') || '' }));
    }
    for (const k of await c.keys()) if (k.url.startsWith(base)) await c.delete(k);
    $('supplier').value = '';
    $('supplierPhone').value = '';
    const sheets = files.filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name) || /sheet|excel|csv/i.test(f.type)),
      docs = files.filter((f) => !sheets.includes(f) && (/^image\//.test(f.type) || isPdf(f)));
    const pick = (src) => document.querySelector(`[data-src="${src}"]`).click();
    if (docs.length) {
      pick('img');
      status('readStatus', `وصل من الواتس ${docs.length} ملف — بيقرا…`);
      await readFiles(docs);
      return;
    }
    if (sheets.length) {
      pick('excel');
      const dt = new DataTransfer();
      dt.items.add(sheets[0]);
      $('xlsFile').files = dt.files;
      $('xlsFile').onchange();
      return;
    }
    if (meta.text) {
      pick('text');
      $('pasteText').value = meta.text;
      await runText('من الواتس', $('textBtn'));
      return;
    }
    status('readStatus', 'اللي اتشارك مافيهوش صور ولا ملف ولا كلام.', 'bad');
  }
  client.auth.onAuthStateChange(() => setTimeout(refresh, 0));
  refresh();
})();
