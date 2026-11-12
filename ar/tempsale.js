/* «البيع المؤقت» (owner 2026-11-12: «ماشي» on the screen). At rush hour a sale is recorded here in seconds, by the PharmaFly
   sticker's barcode (the camera), the item's name or its code; it is entered into PharmaFly later, when it is quiet.
   - A PharmaFly sticker's number is 100000 + the item's code (101060 = code 1060, AUGMENTIN 1G 14TAB; checked on 3 stickers).
   - Items come from the stock list (ar_stock, ar/stock.js), customers from ar_customers; both are kept on the phone too, so a
     sale can be recorded with no internet.
   - A sale is kept on the phone first (localStorage) and sent to ar_temp_sales (migration 202611122330) when the internet is
     there; the phone makes its id, so sending it twice keeps one sale.
   - Nothing here touches PharmaFly. «مستنية» = not entered yet; the owner marks «اتدخلت» (later: the laptop, by itself). */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/tempsale.cjs) ----------
  const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
  // a typed code or sticker number -> the PharmaFly item code (null: not a sticker / not a code).
  // From the camera (scanned = true) only a whole sticker number counts (6 digits, 1xxxxx): a shorter or longer reading is a
  // misread or another barcode, never taken as a code (the owner: «الباركود ينطق اصناف غلط», 2026-11-13).
  function stickerCode(raw, scanned) {
    const s = String(raw || '').replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).trim();
    if (scanned) return /^1\d{5}$/.test(s) ? Number(s) - 100000 || null : null;
    const d = s.replace(/\D/g, '');
    if (/^1\d{5}$/.test(d)) return Number(d) - 100000 || null;
    if (/^\d{1,5}$/.test(d)) return Number(d) || null;
    return null;
  }
  // one box, or one unit (strip / ampoule) when the box is split in PharmaFly (parts > 1)
  function priceOf(base, parts, unit) {
    const k = Number(parts) > 1 ? Number(parts) : 1;
    return unit === 'unit' && k > 1 ? r2(base / k) : r2(base);
  }
  const lineTotal = (l) => r2(l.q * l.p);
  const total = (lines) => r2((lines || []).reduce((s, l) => s + lineTotal(l), 0));
  // a tap on an item adds one box; the same item again = one more
  function addItem(lines, it) {
    const c = Number(it.item_id ?? it.id);
    const same = lines.find((l) => l.c === c);
    if (same) { same.q += 1; return same; }
    const base = Number(it.price) || 0, k = Number(it.parts) > 1 ? Number(it.parts) : 1;
    const line = { c, n: String(it.name || ''), ar: String(it.arabic_name || ''), q: 1, u: 'pack', k, base, p: priceOf(base, k, 'pack'),
      // the stock and the nearest expiry, shown on the line as in PharmaFly's sale (never sent to the server)
      sp: Number(it.packs) || 0, su: Number(it.units) || 0, exp: it.exp_near || null, nostock: !!it.nostock };
    lines.push(line);
    return line;
  }
  // the line's quantity in units against the stock in units (a box = parts units)
  const overStock = (l) => !l.nostock && (l.u === 'unit' ? l.q : l.q * l.k) > (l.sp * l.k + l.su) + 1e-9;
  // «صلاحية 03/2028» (nothing for an item with no expiry in PharmaFly); soon = within 3 months from now
  function expInfo(exp, now) {
    const m = String(exp || '').match(/^(\d{4})-(\d{2})/);
    if (!m) return null;
    const n = now || new Date(), months = (+m[1] - n.getFullYear()) * 12 + (+m[2] - 1 - n.getMonth());
    return { text: `صلاحية ${m[2]}/${m[1]}`, soon: months <= 3, gone: months <= 0 };
  }
  function setUnit(line, unit) {
    line.u = unit === 'unit' && line.k > 1 ? 'unit' : 'pack';
    line.p = priceOf(line.base, line.k, line.u);
  }
  // the customer's balance after this sale (paid part taken off) above the limit on his card
  function overLimit(cust, amount, paid) {
    if (!cust) return null;
    const lim = Number(cust.credit_limit) || 0, bal = Number(cust.balance) || 0, after = r2(bal + (Number(amount) || 0) - (Number(paid) || 0));
    return lim > 0 && after > lim ? { bal: r2(bal), lim: r2(lim), after } : null;
  }
  // the row kept on the phone and sent to ar_temp_sales
  // kind: 'sale' or 'return' (مرتجع: a bill of its own, as in PharmaFly; paid = what was given back)
  function record({ id, soldAt, lines, customer, paid, note, kind }) {
    const sum = total(lines);
    return {
      id, sold_at: soldAt, kind: kind === 'return' ? 'return' : 'sale',
      customer_id: customer ? Number(customer.id) : null,
      customer_name: customer ? String(customer.name || '').slice(0, 120) : null,
      items: lines.map((l) => ({ c: l.c, n: l.n, q: l.q, u: l.u, p: l.p })),
      total: sum,
      paid: (customer || kind === 'return') && Number(paid) > 0 ? r2(paid) : null,
      note: String(note || '').trim().slice(0, 300) || null,
      status: 'pending',
    };
  }
  // Arabic counting with western digits: 1 علبة، 3 علب، 11 علبة
  const word = (n, one, few) => (n >= 3 && n <= 10 ? few : one);
  const qtyText = (q, u) => `${q} ${u === 'unit' ? word(q, 'وحدة', 'وحدات') : word(q, 'علبة', 'علب')}`;
  const countText = (n) => (n === 1 ? 'صنف واحد' : n === 2 ? 'صنفين' : `${n} ${word(n, 'صنف', 'أصناف')}`);
  const money = (x) => {
    const v = r2(x);
    return (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' ج';
  };
  function clock(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const h = d.getHours() % 12 || 12, m = String(d.getMinutes()).padStart(2, '0');
    const today = new Date(), same = d.toDateString() === today.toDateString();
    return (same ? '' : `${d.getDate()}/${d.getMonth() + 1} `) + `${h}:${m} ${d.getHours() < 12 ? 'ص' : 'م'}`;
  }
  // the list: sales kept on the phone (not sent yet) first, then the server's; one row per id
  function merged(server, queued) {
    const out = (queued || []).map((q) => ({ ...q, queued: true }));
    for (const s of server || []) if (!out.some((q) => q.id === s.id)) out.push(s);
    return out.sort((a, b) => String(b.sold_at).localeCompare(String(a.sold_at)));
  }
  // the phone's main back camera among its cameras (Android: «camera2 0, facing back»; the others are wide / zoom lenses)
  function mainBack(list) {
    const back = (list || []).filter((d) => /back|rear|environment|خلف/i.test(d.label || ''));
    return back.find((d) => /camera2?\s*0\b/i.test(d.label || '')) || back[0] || null;
  }
  // the part of the camera's picture shown in the thin strip (object-fit: cover, centred, width : height = a): the barcode
  // is read only there, so what is read is what the owner sees (owner 2026-11-13: «7 في 2 … اخد بيها الباركود وخلاص»)
  function stripBox(vw, vh, a) {
    if (!vw || !vh) return null;
    if (vw / vh > a) { const sw = Math.round(vh * a); return { sx: Math.round((vw - sw) / 2), sy: 0, sw, sh: vh }; }
    const sh = Math.round(vw / a);
    return { sx: 0, sy: Math.round((vh - sh) / 2), sw: vw, sh };
  }
  const api = { overStock, expInfo, stripBox, mainBack, stickerCode, priceOf, lineTotal, total, addItem, setUnit, overLimit, record, qtyText, countText, money, merged };
  root.AskerTempSaleLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the place ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const QKEY = 'asker-ts-queue', IKEY = 'asker-ts-items', CKEY = 'asker-ts-cust';
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (e) { return d; } };
  const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  let items = [], byId = new Map(), customers = [], cart = [], cust = null, custOpen = false, way = 'name', kind = 'sale';
  let queue = load(QKEY, []), server = [], view = 'new', listKind = 'pending', openRow = '', flushing = false, ready = false;

  function say(id, text, kind) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  const nameOf = (x) => String(x.ar || x.arabic_name || '').trim() || String(x.n || x.name || '');

  // ---------- data: items and customers (also kept on the phone for no-internet use) ----------
  function useItems(rows) {
    items = rows;
    byId = new Map(rows.map((r) => [Number(r.item_id), r]));
  }
  async function loadItems() {
    try {
      const rows = root.AskerStock ? await root.AskerStock.ensure() : [];
      if (rows && rows.length) {
        useItems(rows);
        keep(IKEY, rows.map((r) => [r.item_id, r.name, r.arabic_name || '', r.price, r.parts, r.packs, r.units, r.exp_near || null]));
        return;
      }
    } catch (e) {}
    const saved = load(IKEY, []);
    useItems(saved.map((a) => ({ item_id: a[0], name: a[1], arabic_name: a[2], price: a[3], parts: a[4], packs: a[5], units: a[6], exp_near: a[7] || null })));
  }
  async function loadCustomers() {
    try {
      const out = [];
      for (let from = 0; from < 10000; from += 1000) {
        const { data, error } = await db().from('ar_customers').select('id,name,credit_limit,balance').order('id').range(from, from + 999);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      customers = out;
      keep(CKEY, out.map((c) => [c.id, c.name, c.credit_limit, c.balance]));
    } catch (e) {
      customers = load(CKEY, []).map((a) => ({ id: a[0], name: a[1], credit_limit: a[2], balance: a[3] }));
    }
  }
  // an item with no stock (not in the stock list) is looked up by its code on the server
  async function itemByCode(code) {
    if (byId.has(code)) return byId.get(code);
    if (!db()) return null;
    try {
      const { data } = await db().from('ar_store_items').select('id,name,arabic_name,price').eq('id', code).limit(1);
      const it = data && data[0];
      return it ? { item_id: it.id, name: it.name, arabic_name: it.arabic_name, price: it.price, parts: 1, packs: 0, units: 0, nostock: true } : null;
    } catch (e) { return null; }
  }

  // ---------- adding items ----------
  function add(it) {
    const line = addItem(cart, it);
    drawCart();
    return line;
  }
  function hitCard(it) {
    const stock = root.AskerStockLib ? root.AskerStockLib.qtyText(it.packs, it.units, it.parts) : '';
    const price = Number(it.price) ? ' · ' + money(it.price) : '';
    return `<button type="button" class="ts-hit" data-ts-add="${esc(it.item_id)}">
      <strong class="notr">${esc(nameOf(it))}</strong>
      <small>كود ${esc(it.item_id)}${esc(price)} · رصيد ${esc(it.nostock ? 'مفيش' : stock)}</small></button>`;
  }
  async function find() {
    const q = $('tsQ').value.trim();
    $('tsClear').classList.toggle('hidden', !q);
    if (way === 'code') {
      const code = stickerCode(q);
      if (!q) { $('tsHits').innerHTML = ''; return say('tsFind', ''); }
      if (!code) { $('tsHits').innerHTML = ''; return say('tsFind', 'اكتب كود الصنف أو الرقم اللي فوق الباركود', 'bad'); }
      const it = await itemByCode(code);
      if ($('tsQ').value.trim() !== q) return; // typed more meanwhile
      $('tsHits').innerHTML = it ? hitCard(it) : '';
      return say('tsFind', it ? '' : `مفيش صنف بالكود ${code}`, it ? '' : 'bad');
    }
    if (q.length < 2) { $('tsHits').innerHTML = ''; return say('tsFind', items.length ? '' : 'بيحمّل الأصناف…'); }
    const hits = root.AskerStockLib ? root.AskerStockLib.search(q, items, 8) : [];
    $('tsHits').innerHTML = hits.map(hitCard).join('');
    say('tsFind', hits.length ? '' : 'مفيش صنف عليه رصيد بالاسم ده');
  }
  function setWay(w) {
    way = w;
    document.querySelectorAll('[data-ts-way]').forEach((b) => b.classList.toggle('on', b.dataset.tsWay === w));
    const box = $('tsQ');
    box.value = '';
    box.inputMode = w === 'code' ? 'numeric' : 'text';
    box.placeholder = w === 'code' ? 'كود الصنف أو الرقم اللي فوق الباركود' : 'اكتب حرفين من اسم الصنف…';
    $('tsHits').innerHTML = '';
    say('tsFind', '');
    $('tsSearch').classList.toggle('hidden', w === 'scan');
    if (w === 'scan') startScan(); else stopScan();
  }

  // ---------- the camera (the PharmaFly sticker's barcode) ----------
  // a reading counts only when the same value comes twice in a row (one frame can misread a bar)
  let stream = null, timer = null, detector = null, busy = false, lastRaw = '', lastAt = 0, seenRaw = '', seenAt = 0;
  // The camera (owner 2026-11-13 «مبتقراش خالص … الكاميرا اللي انت مختارها»): every straight-line barcode kind is read
  // again (the sticker's kind is not known yet: leaving out ITF/codabar stopped every reading); safety comes from the same
  // value twice in a row and a whole sticker number only. The back camera is asked at a high resolution with continuous
  // focus; «🔄 كاميرا تانية» goes through the phone's cameras (the choice is kept on this phone).
  // The right camera stays by itself (owner 2026-11-13 «عاوز يثبت عالكاميرا الصح، معايا بهايم»): with no choice yet the
  // phone's main back camera is taken (Android names it «camera2 0, facing back»; the others are the wide / zoom lenses);
  // the camera that reads a sticker is kept on this phone (CAMKEY) and the switch hides; it shows again only after
  // QUIET_MS with nothing read.
  const CAMKEY = 'asker-ts-cam', QUIET_MS = 10000;
  let cams = [], lastGood = 0, quietTimer = null;
  const camNow = () => (stream && stream.getVideoTracks()[0] ? stream.getVideoTracks()[0].getSettings().deviceId || '' : '');
  function showSwitch(on) { const b = $('tsCam'); if (b) b.classList.toggle('hidden', !on || cams.length < 2); }
  async function openCamera(deviceId) {
    const video = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    if (deviceId) video.deviceId = { exact: deviceId }; else video.facingMode = { ideal: 'environment' };
    const s = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    const track = s.getVideoTracks()[0];
    try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) {}
    return s;
  }
  // the phone's cameras, back ones first (names are known only after the first permission)
  async function listCams() {
    try {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      const back = all.filter((d) => /back|rear|environment|خلف/i.test(d.label));
      cams = back.length ? [...back, ...all.filter((d) => !back.includes(d))] : all;
    } catch (e) { cams = []; }
  }
  // the usual scanner beep on a sticker read (a low buzz when the reading is not a sticker); started on the tap itself so
  // the phone allows the sound (owner 2026-11-13: «تطلع صوت زي اصوات الباركود المعتاده»)
  let actx = null;
  function unlockBeep() {
    try { actx = actx || new (root.AudioContext || root.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { actx = null; }
  }
  function beep(ok) {
    try {
      if (!actx) return;
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime, len = ok ? 0.12 : 0.28;
      o.type = 'square';
      o.frequency.value = ok ? 2700 : 380;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.setValueAtTime(0.12, t + len - 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + len + 0.01);
    } catch (e) {}
  }
  async function startScan(deviceId) {
    unlockBeep();
    $('tsScanBox').classList.remove('hidden');
    if (!('BarcodeDetector' in root) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('tsScanBox').classList.add('hidden');
      return say('tsFind', 'الموبايل ده مش بيقرا الباركود من البوت. اكتب الرقم اللي فوق الباركود في «الكود».', 'bad');
    }
    try {
      const all = await root.BarcodeDetector.getSupportedFormats();
      const formats = all.filter((f) => /^(code_128|code_39|code_93|codabar|ean_13|ean_8|itf|upc_a|upc_e)$/.test(f));
      detector = new root.BarcodeDetector(formats.length ? { formats } : undefined);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const saved = deviceId || load(CAMKEY, '');
      try { stream = await openCamera(saved); } catch (e) { if (!saved) throw e; stream = await openCamera(''); }
      await listCams();
      // no camera kept yet: the main back camera instead of whatever the phone gave
      const main = !saved && mainBack(cams);
      if (main && main.deviceId !== camNow()) {
        try { const s2 = await openCamera(main.deviceId); stream.getTracks().forEach((t) => t.stop()); stream = s2; } catch (e) {}
      }
      const v = $('tsVideo');
      v.srcObject = stream;
      await v.play();
      say('tsFind', 'وجّه الكاميرا على باركود الملصق، وثبّت الموبايل ثانية');
      clearInterval(timer);
      timer = setInterval(tick, 250);
      // the switch only when this camera reads nothing for a while
      showSwitch(false);
      lastGood = Date.now();
      clearInterval(quietTimer);
      quietTimer = setInterval(() => { if (stream && Date.now() - lastGood > QUIET_MS) showSwitch(true); }, 1000);
    } catch (e) {
      stopScan();
      say('tsFind', 'الكاميرا ما اتفتحتش: ' + (e && e.message ? e.message : e), 'bad');
    }
  }
  // the next camera on the phone
  async function nextCam() {
    if (cams.length < 2) return;
    const now = stream && stream.getVideoTracks()[0] ? stream.getVideoTracks()[0].getSettings().deviceId : '';
    const i = cams.findIndex((c) => c.deviceId === now), next = cams[(i + 1) % cams.length];
    keep(CAMKEY, next.deviceId);
    await startScan(next.deviceId);
  }
  const STRIP = 7 / 2;
  let canvas = null;
  // the strip's part of the picture, on a canvas (the whole picture when the camera has no size yet)
  function stripOf(v) {
    const b = stripBox(v.videoWidth, v.videoHeight, STRIP);
    if (!b) return v;
    canvas = canvas || document.createElement('canvas');
    if (canvas.width !== b.sw || canvas.height !== b.sh) { canvas.width = b.sw; canvas.height = b.sh; }
    canvas.getContext('2d').drawImage(v, b.sx, b.sy, b.sw, b.sh, 0, 0, b.sw, b.sh);
    return canvas;
  }
  async function tick() {
    if (busy || !detector || !stream) return;
    busy = true;
    try {
      const found = await detector.detect(stripOf($('tsVideo')));
      if (found && found.length) await scanned(String(found[0].rawValue || ''), false, found[0].format);
    } catch (e) {}
    busy = false;
  }
  // sure = the camera read the same value twice in a row (tests and a typed reading pass true)
  async function scanned(raw, sure, format) {
    raw = String(raw || '').trim();
    const now = Date.now();
    if (!raw) return;
    if (!sure && !(raw === seenRaw && now - seenAt < 1500)) { seenRaw = raw; seenAt = now; return; }
    seenRaw = '';
    if (raw === lastRaw && now - lastAt < 2500) return;
    lastRaw = raw; lastAt = now;
    // every reading is kept on this phone (the last 20), to learn the stickers' barcode; never sent anywhere
    const shown = raw + (format ? ` (${format})` : '');
    keep('asker-ts-raw', [shown, ...load('asker-ts-raw', []).filter((x) => x !== shown)].slice(0, 20));
    const code = stickerCode(raw, true), it = code ? await itemByCode(code) : null;
    if (!it) { beep(false); return say('tsFind', `الكاميرا قرت ${shown}: ده مش رقم ملصق فارمافلاي. اكتب الرقم اللي فوق الباركود في «الكود».`, 'bad'); }
    beep(true);
    add(it);
    // this camera reads the stickers: kept on this phone, the switch hides
    if (stream && camNow()) keep(CAMKEY, camNow());
    lastGood = Date.now();
    showSwitch(false);
    if (navigator.vibrate) navigator.vibrate(60);
    say('tsFind', `اتضاف: ${nameOf(it)} (الباركود ${raw})`, 'ok');
  }
  function stopScan() {
    clearInterval(timer); timer = null;
    clearInterval(quietTimer); quietTimer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    const box = $('tsScanBox');
    if (box) box.classList.add('hidden');
  }

  // ---------- the bill ----------
  // under the item's name, as in PharmaFly's sale: its stock and nearest expiry; red when the bill asks more than the stock
  function lineInfo(l) {
    const stock = l.nostock ? 'مفيش' : root.AskerStockLib ? root.AskerStockLib.qtyText(l.sp, l.su, l.k) : '';
    const e = expInfo(l.exp);
    const bits = [`<span>رصيد ${esc(stock)}</span>`];
    if (e) bits.push(`<span class="${e.soon ? 'ts-soon' : ''}">${esc(e.text)}</span>`);
    const short = kind !== 'return' && (overStock(l) || l.nostock);
    return `<div class="ts-info">${bits.join(' · ')}${short ? '<div class="ts-warn">⚠️ الكمية أكتر من الرصيد</div>' : ''}</div>`;
  }
  function drawCart() {
    const box = $('tsCart');
    if (!box) return;
    if (!cart.length) {
      box.innerHTML = '<p class="hint">لسه مفيش أصناف. دوّر على صنف ودوس عليه.</p>';
    } else {
      box.innerHTML = cart.map((l, i) => `<div class="ts-line" data-i="${i}">
        <div class="ts-l1"><strong class="notr">${esc(nameOf(l))}</strong><span class="ts-amt">${esc(money(lineTotal(l)))}</span></div>
        ${lineInfo(l)}
        <div class="ts-l2">
          <span class="ts-code">كود ${esc(l.c)}</span>
          <span class="ts-qty"><button type="button" data-ts-minus aria-label="أقل">−</button><b>${esc(l.q)}</b><button type="button" data-ts-plus aria-label="أكتر">+</button></span>
          ${l.k > 1 ? `<span class="ts-units"><button type="button" class="chip${l.u === 'pack' ? ' on' : ''}" data-ts-u="pack">علبة</button><button type="button" class="chip${l.u === 'unit' ? ' on' : ''}" data-ts-u="unit">وحدة</button></span>` : `<span class="ts-units">علبة</span>`}
          <button type="button" class="ts-del" data-ts-del aria-label="شيل الصنف">✕</button>
        </div></div>`).join('') +
        `<div class="ts-total"><span>الإجمالي (تقريبي)</span><b>${esc(money(total(cart)))}</b></div>`;
    }
    drawCust();
  }
  // a staff member (ar/staff.js): «مرتجع» and credit customers only when the owner opened them; the owner always
  const can = (p) => !root.AskerStaff || root.AskerStaff.can(p);
  const staffNow = () => !!(root.AskerStaff && root.AskerStaff.isStaff());
  function drawCust() {
    const box = $('tsCust');
    if (!box) return;
    if (!can('credit')) { cust = null; custOpen = false; }
    const paid = Number($('tsPaid').value) || 0, ret = kind === 'return', over = ret ? null : overLimit(cust, total(cart), paid);
    let html = `<div class="chips"><button type="button" class="chip${!cust && !custOpen ? ' on' : ''}" data-ts-cash>نقدي</button>${can('credit') ? `<button type="button" class="chip${cust || custOpen ? ' on' : ''}" data-ts-credit>عميل آجل</button>` : ''}</div>`;
    if (cust) {
      html += `<div class="ts-cust${over ? ' warn' : ''}"><strong class="notr">${esc(cust.name)}</strong> <small>كود ${esc(cust.id)}</small>
        <div class="hint">عليه ${esc(money(Math.max(0, Number(cust.balance) || 0)))}${Number(cust.credit_limit) ? ' · الحد ' + esc(money(cust.credit_limit)) : ''}</div>
        ${over ? `<div class="ts-warn">⚠️ هيبقى عليه ${esc(money(over.after))} والحد ${esc(money(over.lim))}: هيعدّي الحد بالبيعة دي</div>` : ''}
        ${ret && cart.length ? `<div class="hint">المرتجع هيقلّل حسابه ${esc(money(Math.max(0, total(cart) - paid)))}</div>` : ''}
        <button type="button" class="linklike" data-ts-change>غيّر العميل</button></div>`;
    } else if (custOpen) {
      html += `<div class="search"><input id="tsCQ" type="search" autocomplete="off" aria-label="العميل" placeholder="اسم العميل أو الكود…" /></div><div id="tsCHits"></div>`;
    }
    const q = $('tsCQ') ? $('tsCQ').value : '';
    box.innerHTML = html;
    // a credit customer: what he paid now; a return: what was given back to him (cash or credit)
    $('tsPaidRow').classList.toggle('hidden', !cust && !ret);
    $('tsPaidLbl').textContent = ret ? 'رجّعتله كام فلوس؟' : 'دفع كام؟';
    if ($('tsCQ')) { $('tsCQ').value = q; drawCustHits(); }
  }
  function drawCustHits() {
    const q = $('tsCQ').value.trim(), F = root.AskerFuzzy;
    let hits = [];
    if (/^\d+$/.test(q)) hits = customers.filter((c) => String(c.id) === q);
    else if (q.length >= 2 && F) hits = F.rank(q, customers, (c) => [F.fold(c.name)], 8);
    $('tsCHits').innerHTML = hits.map((c) => `<button type="button" class="ts-hit" data-ts-cust="${esc(c.id)}"><strong class="notr">${esc(c.name)}</strong><small>كود ${esc(c.id)} · عليه ${esc(money(Math.max(0, Number(c.balance) || 0)))}</small></button>`).join('') ||
      (q.length >= 2 ? '<p class="status">مفيش عميل بالاسم ده</p>' : '');
  }

  // ---------- saving: on the phone first, then to the server ----------
  const uuid = () => (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));
  async function save() {
    if (!cart.length) return say('tsStatus', 'ضيف صنف الأول', 'bad');
    const rec = record({ id: uuid(), soldAt: new Date().toISOString(), lines: cart, customer: cust, paid: $('tsPaid').value, note: $('tsNote').value, kind });
    queue.push(rec);
    keep(QKEY, queue);
    cart = []; cust = null; custOpen = false; setKind('sale');
    $('tsPaid').value = ''; $('tsNote').value = ''; $('tsQ').value = ''; $('tsHits').innerHTML = '';
    drawCart();
    drawBadge();
    say('tsStatus', 'اتحفظت على الموبايل…', 'ok');
    const left = await flush();
    say('tsStatus', left ? 'اتحفظت على الموبايل، وهتتبعت أول ما النت يرجع' : 'اتحفظت ✓', 'ok');
  }
  // «بيع» or «مرتجع» for the whole bill
  function setKind(k) {
    kind = k === 'return' ? 'return' : 'sale';
    document.querySelectorAll('[data-ts-type]').forEach((b) => b.classList.toggle('on', b.dataset.tsType === kind));
    $('tsNew').classList.toggle('ts-return', kind === 'return');
    $('tsSave').textContent = kind === 'return' ? 'احفظ المرتجع' : 'احفظ البيعة';
    drawCart();
  }
  // sends what is kept on the phone; returns how many are still waiting
  async function flush() {
    if (flushing || !db() || !queue.length) return queue.length;
    flushing = true;
    try {
      for (const rec of [...queue]) {
        const { error } = await db().from('ar_temp_sales').upsert(rec, { onConflict: 'id' });
        if (error) break;
        queue = queue.filter((x) => x.id !== rec.id);
        keep(QKEY, queue);
      }
    } catch (e) {}
    flushing = false;
    drawBadge();
    if (view === 'list') loadList();
    return queue.length;
  }

  // ---------- the list ----------
  async function loadList() {
    if (db()) {
      try {
        const since = new Date(Date.now() - 7 * 864e5).toISOString();
        const { data, error } = await db().from('ar_temp_sales').select('id,no,sold_at,kind,customer_id,customer_name,items,total,paid,note,status,entered_ticket,created_by')
          .gte('sold_at', since).order('sold_at', { ascending: false }).range(0, 299);
        if (!error) server = data || [];
      } catch (e) {}
    }
    drawList();
  }
  const isPending = (s) => s.queued || s.status === 'pending';
  function drawBadge() {
    const n = merged(server, queue).filter(isPending).length, b = $('tsPendN');
    if (!b) return;
    b.textContent = n ? String(n) : '';
    b.classList.toggle('hidden', !n);
  }
  function saleRow(s) {
    const its = Array.isArray(s.items) ? s.items : [];
    const who = s.customer_id ? `<span class="notr">${esc(s.customer_name || '')}</span> (آجل)` : 'نقدي';
    const tag = (s.kind === 'return' ? '<span class="ts-st r">مرتجع</span> ' : '') +
      (s.queued ? '<span class="ts-st q">لسه ما اتبعتتش</span>' : s.status === 'entered' ? '<span class="ts-st d">اتدخلت</span>' : '<span class="ts-st w">مستنية</span>');
    const open = openRow === s.id;
    // the owner sees who recorded it (a staff member's name; nothing for his own)
    const seller = !staffNow() && s.created_by && root.AskerStaff ? root.AskerStaff.nameOf(s.created_by) : '';
    return `<div class="ts-sale${open ? ' open' : ''}" data-ts-row="${esc(s.id)}">
      <button type="button" class="ts-sale-h" data-ts-open><span>${s.no ? '#' + esc(s.no) + ' · ' : ''}${who}${seller ? ` <span class="ts-seller">· باعها <span class="notr">${esc(seller)}</span></span>` : ''}</span>${tag}</button>
      <small>${esc(clock(s.sold_at))} · ${esc(countText(its.length))} · ${esc(money(s.total))}${s.paid ? (s.kind === 'return' ? ' · رجعله ' : ' · دفع ') + esc(money(s.paid)) : ''}</small>
      ${open ? `<ul class="ts-items">${its.map((x) => `<li><span class="notr">${esc(x.n)}</span> <small>كود ${esc(x.c)}</small><b>${esc(qtyText(x.q, x.u))}</b></li>`).join('')}</ul>
        ${s.note ? `<p class="hint notr">${esc(s.note)}</p>` : ''}
        ${!s.queued && s.status === 'pending' && !staffNow() ? `<div class="ts-acts"><button type="button" data-ts-done>اتدخلت في فارمافلاي</button><button type="button" class="secondary" data-ts-cancel>الغيها</button></div>` : ''}` : ''}
    </div>`;
  }
  function drawList() {
    const all = merged(server, queue).filter((s) => s.status !== 'cancelled');
    const pend = all.filter(isPending), done = all.filter((s) => !isPending(s));
    $('tsChips').innerHTML = `<button type="button" class="chip${listKind === 'pending' ? ' on' : ''}" data-ts-kind="pending">مستنية ${pend.length}</button><button type="button" class="chip${listKind === 'entered' ? ' on' : ''}" data-ts-kind="entered">اتدخلت ${done.length}</button>`;
    const rows = listKind === 'pending' ? pend : done;
    $('tsRows').innerHTML = rows.map(saleRow).join('') || `<p class="hint">${listKind === 'pending' ? 'مفيش بيعات مستنية' : 'مفيش بيعات اتدخلت آخر 7 أيام'}</p>`;
    drawBadge();
  }
  async function mark(id, status) {
    if (!db()) return;
    const now = new Date().toISOString();
    const patch = status === 'entered' ? { status, entered_at: now, updated_at: now } : { status, updated_at: now };
    const { error } = await db().from('ar_temp_sales').update(patch).eq('id', id);
    if (error) return say('tsListStatus', 'ماتحفظش: ' + error.message, 'bad');
    const s = server.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
    drawList();
  }
  function showView(v) {
    view = v;
    document.querySelectorAll('[data-ts-view]').forEach((b) => b.classList.toggle('secondary', b.dataset.tsView !== v));
    $('tsNew').classList.toggle('hidden', v !== 'new');
    $('tsList').classList.toggle('hidden', v !== 'list');
    if (v === 'list') { stopScan(); drawList(); loadList(); }
  }

  // ---------- events ----------
  function bind() {
    const panel = $('tempSalePanel');
    if (!panel || panel.dataset.bound) return;
    panel.dataset.bound = '1';
    $('tsQ').addEventListener('input', find);
    $('tsQ').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const first = $('tsHits').querySelector('[data-ts-add]');
      if (first) { e.preventDefault(); first.click(); }
    });
    $('tsClear').onclick = () => { $('tsQ').value = ''; find(); $('tsQ').focus(); };
    $('tsSave').onclick = save;
    $('tsPaid').addEventListener('input', drawCust);
    panel.addEventListener('input', (e) => { if (e.target.id === 'tsCQ') drawCustHits(); });
    panel.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t || !panel.contains(t)) return;
      if (t.dataset.tsView) return showView(t.dataset.tsView);
      if (t.dataset.tsWay) return setWay(t.dataset.tsWay);
      if (t.dataset.tsType) return setKind(t.dataset.tsType);
      if (t.id === 'tsCam') return nextCam();
      if (t.dataset.tsAdd) {
        const it = await itemByCode(Number(t.dataset.tsAdd));
        if (it) { add(it); say('tsFind', 'اتضاف: ' + nameOf(it), 'ok'); }
        if (way === 'code') { $('tsQ').value = ''; $('tsHits').innerHTML = ''; }
        return;
      }
      const line = t.closest('.ts-line'), l = line ? cart[Number(line.dataset.i)] : null;
      if (l && t.hasAttribute('data-ts-plus')) { l.q += 1; return drawCart(); }
      if (l && t.hasAttribute('data-ts-minus')) { if (l.q > 1) l.q -= 1; return drawCart(); }
      if (l && t.dataset.tsU) { setUnit(l, t.dataset.tsU); return drawCart(); }
      if (l && t.hasAttribute('data-ts-del')) { cart.splice(Number(line.dataset.i), 1); return drawCart(); }
      if (t.hasAttribute('data-ts-cash')) { cust = null; custOpen = false; return drawCust(); }
      if (t.hasAttribute('data-ts-credit') || t.hasAttribute('data-ts-change')) { cust = null; custOpen = true; drawCust(); if ($('tsCQ')) $('tsCQ').focus(); return; }
      if (t.dataset.tsCust) { cust = customers.find((c) => String(c.id) === t.dataset.tsCust) || null; custOpen = false; return drawCust(); }
      if (t.dataset.tsKind) { listKind = t.dataset.tsKind; return drawList(); }
      const row = t.closest('[data-ts-row]');
      if (row && t.hasAttribute('data-ts-open')) { openRow = openRow === row.dataset.tsRow ? '' : row.dataset.tsRow; return drawList(); }
      if (row && t.hasAttribute('data-ts-done')) return mark(row.dataset.tsRow, 'entered');
      if (row && t.hasAttribute('data-ts-cancel')) { if (root.confirm('تلغي البيعة دي؟ مش هتتدخل في فارمافلاي.')) mark(row.dataset.tsRow, 'cancelled'); }
    });
    root.addEventListener('online', flush);
  }
  async function open() {
    bind();
    if (!ready) {
      ready = true;
      drawCart();
      say('tsFind', 'بيحمّل الأصناف…');
      await Promise.all([loadItems(), db() && can('credit') ? loadCustomers() : Promise.resolve()]);
      if (!$('tsQ').value) say('tsFind', items.length ? '' : 'الأصناف لسه ما اتحمّلتش. جرّب تاني لما النت يرجع.', items.length ? '' : 'bad');
    }
    // «مرتجع» only when it is open for him
    const ret = document.querySelector('[data-ts-type="return"]');
    if (ret) ret.classList.toggle('hidden', !can('return'));
    if (!can('return') && kind === 'return') setKind('sale');
    drawBadge();
    flush();
  }
  // leaving the screen turns the camera off
  function close() { stopScan(); if (way === 'scan') setWay('name'); }
  root.AskerTempSale = { open, close, flush, scanned };
})(typeof window === 'undefined' ? globalThis : window);
