/* «كرّر دواك بالباركود» (owner 2026-11-17: «الزبون اللي بيكرر دواه … يعدي السكانر من كاميرا الموبايل زي ما أنا بعمل في البيع أو الجرد … عشان هما ما بيعرفوش يكتبوا»;
   his words for the screen: «لو عايز تكرر أصناف عدّي بس باركود الصيدلية الملزوق على الصنف عشان ينزل لك في الفاتورة … يا تكتب يا تعدي الباركود، يا تكتب الرقم الكود
   اللي على الباركود، يا اما تكتب الاسم، وتعمل له اوبشن للتلات حاجات دي»). For EVERYONE on the store site: a customer with his link, a person with a site account, a visitor.
   Three ways to put an item in the order, all into the same cart as the search: 📷 the camera reads the barcode on the pharmacy's own sticker (the same reading rules as the bot's
   «البيع المؤقت»: ar/tempsale.js), 🔢 the number printed above the barcode (6 digits, 1xxxxx = 100000 + the item's code) or the item's code, 🔎 the name (the store's search).
   An item the site does not sell (a prescription item, or no price) says so and points to the name box. Loaded before store/store.js, which hands this module the cart. */
(function (root) {
  'use strict';

  // ---------- pure helpers (copied from ar/tempsale.js; tests/store-scan.cjs keeps the two in step) ----------
  // The sticker's barcode (an ITF of 10 digits: 1 + the item code (5 digits) + the batch's expiry month (2) + year (2)); the number printed above it is the first 6 digits.
  // -> {code, exp: 'YYYY-MM'} (exp null for the 6 digits alone), null when it is neither.
  function stickerRead(raw) {
    const s = String(raw || '').trim();
    const m = s.match(/^1(\d{5})(0[1-9]|1[0-2])(\d{2})$/);
    const y = m ? 2000 + Number(m[3]) : 0, now = new Date().getFullYear();
    if (m) return Number(m[1]) && y >= now - 3 && y <= now + 15 ? { code: Number(m[1]), exp: `20${m[3]}-${m[2]}` } : null;
    if (/^1\d{5}$/.test(s)) return Number(s) - 100000 ? { code: Number(s) - 100000, exp: null } : null;
    return null;
  }
  // a typed code or sticker number -> the item's code (null: not a sticker / not a code). From the camera (scanned = true) only a whole sticker number counts.
  function stickerCode(raw, scanned) {
    const s = String(raw || '').replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).trim();
    if (scanned) { const r = stickerRead(s); return r ? r.code : null; }
    const d = s.replace(/\D/g, '');
    const r = stickerRead(d);
    if (r) return r.code;
    if (/^\d{1,5}$/.test(d)) return Number(d) || null;
    return null;
  }
  const mainBack = (list) => {
    const back = (list || []).filter((d) => /back|rear|environment|خلف/i.test(d.label || ''));
    return back.find((d) => /camera2?\s*0\b/i.test(d.label || '')) || back[0] || null;
  };
  // the part of the camera's picture shown in the thin strip (object-fit: cover, centred, width : height = a): the barcode is read only there
  function stripBox(vw, vh, a) {
    if (!vw || !vh) return null;
    if (vw / vh > a) { const sw = Math.round(vh * a); return { sx: Math.round((vw - sw) / 2), sy: 0, sw, sh: vh }; }
    const sh = Math.round(vw / a);
    return { sx: 0, sy: Math.round((vh - sh) / 2), sw: vw, sh };
  }
  // A reading counts only when the same value comes twice in a row (the sticker's own kind, ITF, has no check digit: 3 times); the same sticker still in front of the camera
  // counts once (it must leave the view for 2 s to add one more box). feed() returns the value to act on, or null; accept() is told when an item was really added.
  const NEED = { itf: 3 }, GONE_MS = 2000, STREAK_MS = 1200;
  function makeReader() {
    let lastRaw = '', lastAt = 0, seenRaw = '', seenAt = 0, streak = 0;
    return {
      feed(raw, format, now) {
        raw = String(raw || '').trim();
        if (!raw) return null;
        if (raw === lastRaw && now - lastAt < GONE_MS) { lastAt = now; return null; }
        if (raw === seenRaw && now - seenAt < STREAK_MS) streak++; else { seenRaw = raw; streak = 1; }
        seenAt = now;
        if (streak < (NEED[format] || 2)) return null;
        seenRaw = ''; streak = 0;
        return raw;
      },
      accept(raw, now) { lastRaw = raw; lastAt = now; },
    };
  }
  const TEXTS = {
    title: 'كرّر دواك بالباركود',
    camHint: 'وجّه الكاميرا على باركود الصيدلية، وثبّت الموبايل ثانية',
    switchCam: '🔄 كاميرا تانية',
    noCam: 'الموبايل ده مش بيقرا الباركود من الموقع. اكتب الرقم اللي فوق الباركود في «رقم الكود».',
    camFail: 'الكاميرا ما اتفتحتش. اسمح للموقع بالكاميرا، أو اكتب الرقم اللي فوق الباركود في «رقم الكود».',
    notSticker: 'الكاميرا قرت {0}: ده مش رقم ملصق الصيدلية. اكتب الرقم اللي فوق الباركود في «رقم الكود».',
    badCode: 'اكتب الرقم اللي فوق الباركود (6 أرقام) أو كود الصنف.',
    notOnSite: 'الصنف ده مش على الموقع. اكتب اسمه في «الاسم».',
    needsRx: '«{0}» بالروشتة: ابعت صورة الروشتة من السلة.',
    notOrderable: '«{0}» مش متاح للطلب من الموقع دلوقتي. اكتب اسمه في «الاسم» وشوف البديل.',
    added: 'اتضاف: {0}',
    addedNow: 'اتضاف دلوقتي',
    down: 'مقدرتش أجيب الصنف. اتأكد من النت وجرب تاني.',
    empty: 'لسه ما ضفتش حاجة. عدّي باركود، أو اكتب الكود أو الاسم.',
    noHits: 'مفيش حاجة بالاسم ده. جرب جزء من الاسم أو اكتبه إنجليزي.',
    add: 'ضيف',
    inCart: 'في السلة +',
    later: 'السعر يوم الطلب',
    each: '{0} ج للواحدة',
    goItems: 'كمّل الطلب · {0} صنف · {1} ج',
    goItemsNoPrice: 'كمّل الطلب · {0} صنف',
    more: 'ضيف',
    less: 'قلّل',
    plus: 'زوّد واحدة',
    minus: 'قلّل واحدة',
  };
  const api = { stickerRead, stickerCode, mainBack, stripBox, makeReader, NEED, GONE_MS, STREAK_MS, TEXTS };
  if (typeof module !== 'undefined') module.exports = api;
  root.AskerStoreScanLib = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fill = (t, ...v) => t.replace(/\{(\d)\}/g, (_, i) => v[Number(i)]);
  const MODE_KEY = 'asker_store_scan_mode', CAM_KEY = 'asker_store_scan_cam';
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } };
  let A = null; // what store.js hands over: client, COLS, cart(), add(it), setQty(id, qty), canAdd, searchTerms, termFilter, money, total()
  let mode = 'cam', stream = null, timer = null, detector = null, busy = false, cams = [], quiet = null, lastGood = 0;
  let reader = makeReader(), toldRaw = '', lastAdded = null, hits = new Map(), nameTimer = null, nameSeq = 0, opened = false;
  const canCam = () => !!(root.BarcodeDetector && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  function say(text, kind) { const m = $('scanMsg'); if (m) { m.textContent = text || ''; m.className = 'scan-msg' + (kind ? ' ' + kind : ''); } }
  // the scanner's beep (started inside a tap so the phone allows the sound) and a short buzz
  let actx = null;
  function unlockBeep() { try { actx = actx || new (root.AudioContext || root.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { actx = null; } }
  function beep(ok) {
    try {
      if (!actx) return;
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime, len = ok ? 0.12 : 0.28;
      o.type = 'square'; o.frequency.value = ok ? 2700 : 380;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.setValueAtTime(0.12, t + len - 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + len + 0.01);
    } catch (e) { /* no sound */ }
  }

  // ---------- the item ----------
  async function fetchItem(code) {
    try {
      const { data, error } = await A.client.from('ar_store_items').select(A.COLS).eq('id', code).maybeSingle();
      return error ? undefined : data || null; // undefined = trouble (no net), null = the site has no such item
    } catch (e) { return undefined; }
  }
  const nameOf = (it) => it.arabic_name || it.name;
  // put an item in the cart (or say why not); true when it went in
  function put(it) {
    if (!A.canAdd(it)) { beep(false); say(it.needs_rx ? fill(TEXTS.needsRx, nameOf(it)) : fill(TEXTS.notOrderable, nameOf(it)), 'bad'); return false; }
    A.add(it);
    lastAdded = it.id;
    beep(true);
    if (navigator.vibrate) navigator.vibrate(60);
    say(fill(TEXTS.added, nameOf(it)), 'ok');
    drawList();
    return true;
  }
  async function byCode(code, fromCamera, raw) {
    const it = await fetchItem(code);
    if (it === undefined) { say(TEXTS.down, 'bad'); return false; }
    if (!it) {
      if (fromCamera) { if (toldRaw === raw) return false; toldRaw = raw; }
      beep(false); say(TEXTS.notOnSite, 'bad'); return false;
    }
    return put(it);
  }

  // ---------- the list (the cart, as he builds it) ----------
  const countOf = (cart) => cart.length;
  function drawList() {
    const box = $('scanList'), go = $('scanGo');
    if (!box || !A) return;
    const cart = A.cart();
    box.innerHTML = cart.length ? cart.map((x) => `<article class="scan-line-row${x.id === lastAdded ? ' fresh' : ''}" data-scan-line="${esc(x.id)}">` +
      `<div class="scan-nm"><h3 dir="ltr" translate="no">${esc(x.name)}</h3><span class="hint-sm">${x.price == null ? esc(TEXTS.later) : esc(fill(TEXTS.each, A.money(x.price)))}${x.id === lastAdded ? ` <b class="scan-new">${esc(TEXTS.addedNow)}</b>` : ''}</span></div>` +
      `<div class="qty"><button type="button" data-scan-step="${esc(x.id)}" data-d="1" aria-label="${esc(TEXTS.plus)}">+</button><span>${x.qty}</span><button type="button" data-scan-step="${esc(x.id)}" data-d="-1" aria-label="${esc(TEXTS.minus)}">−</button></div></article>`).join('')
      : `<p class="empty">${esc(TEXTS.empty)}</p>`;
    if (go) {
      go.hidden = !cart.length;
      const priced = cart.filter((x) => x.price != null);
      go.textContent = priced.length === cart.length ? fill(TEXTS.goItems, countOf(cart), A.money(A.total())) : fill(TEXTS.goItemsNoPrice, countOf(cart));
    }
  }

  // ---------- the camera (the same reading rules as the bot's sale) ----------
  async function openCamera(deviceId) {
    const video = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    if (deviceId) video.deviceId = { exact: deviceId }; else video.facingMode = { ideal: 'environment' };
    const s = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    const track = s.getVideoTracks()[0];
    try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) { /* not on every phone */ }
    return s;
  }
  async function listCams() {
    try {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      const back = all.filter((d) => /back|rear|environment|خلف/i.test(d.label));
      cams = back.length ? [...back, ...all.filter((d) => !back.includes(d))] : all;
    } catch (e) { cams = []; }
  }
  const camNow = () => (stream && stream.getVideoTracks()[0] && stream.getVideoTracks()[0].getSettings ? stream.getVideoTracks()[0].getSettings().deviceId || '' : '');
  function showSwitch(on) { const b = $('scanSwitch'); if (b) b.hidden = !on || cams.length < 2; }
  async function startCam(deviceId) {
    unlockBeep();
    if (!canCam()) { setMode('code', false); return say(TEXTS.noCam, 'bad'); }
    $('scanCam').hidden = false;
    try {
      const all = await root.BarcodeDetector.getSupportedFormats();
      const formats = all.filter((f) => /^(code_128|code_39|code_93|codabar|ean_13|ean_8|itf|upc_a|upc_e)$/.test(f));
      detector = new root.BarcodeDetector(formats.length ? { formats } : undefined);
      stopCam(true);
      const saved = deviceId || lsGet(CAM_KEY, '');
      try { stream = await openCamera(saved); } catch (e) { if (!saved) throw e; stream = await openCamera(''); }
      await listCams();
      const main = !saved && mainBack(cams);
      if (main && main.deviceId !== camNow()) { try { const s2 = await openCamera(main.deviceId); stream.getTracks().forEach((t) => t.stop()); stream = s2; } catch (e) { /* the first one stays */ } }
      const v = $('scanVideo');
      v.srcObject = stream;
      await v.play();
      $('scanHint').textContent = TEXTS.camHint;
      clearInterval(timer); timer = setInterval(tick, 250);
      showSwitch(false); lastGood = Date.now();
      clearInterval(quiet); quiet = setInterval(() => { if (stream && Date.now() - lastGood > 10000) showSwitch(true); }, 1000);
    } catch (e) {
      stopCam();
      setMode('code', false);
      say(TEXTS.camFail, 'bad');
    }
  }
  function stopCam(keepBox) {
    clearInterval(timer); timer = null; clearInterval(quiet); quiet = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (!keepBox) { const c = $('scanCam'); if (c) c.hidden = true; }
  }
  let canvas = null;
  const STRIP = 7 / 2;
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
      const found = await detector.detect(stripOf($('scanVideo')));
      if (found && found.length) await onRead(String(found[0].rawValue || ''), found[0].format);
    } catch (e) { /* the next frame */ }
    busy = false;
  }
  async function onRead(raw, format) {
    const now = Date.now(), v = reader.feed(raw, format, now);
    if (!v) return;
    const sr = stickerRead(v);
    if (!sr) {
      // a misread of the sticker's own bars: keep looking; a steady barcode of another kind (a factory one on the box) is told once
      if (format === 'itf' || toldRaw === v) return;
      toldRaw = v; beep(false);
      return say(fill(TEXTS.notSticker, v), 'bad');
    }
    const ok = await byCode(sr.code, true, v);
    if (ok) {
      reader.accept(v, Date.now());
      if (stream && camNow()) lsSet(CAM_KEY, camNow());
      lastGood = Date.now(); showSwitch(false);
    }
  }
  async function nextCam() {
    if (cams.length < 2) return;
    const i = cams.findIndex((c) => c.deviceId === camNow()), next = cams[(i + 1) % cams.length];
    lsSet(CAM_KEY, next.deviceId);
    await startCam(next.deviceId);
  }

  // ---------- the name ----------
  async function searchName(q) {
    const my = ++nameSeq, terms = A.searchTerms(q), box = $('scanHits');
    if (!terms.length) { hits = new Map(); box.innerHTML = ''; return; }
    let req = A.client.from('ar_store_items').select(A.COLS);
    for (const w of terms) req = req.or(A.termFilter(w));
    const { data, error } = await req.order('status').order('name').limit(8);
    if (my !== nameSeq) return;
    if (error) { box.innerHTML = ''; return say(TEXTS.down, 'bad'); }
    hits = new Map((data || []).map((it) => [String(it.id), it]));
    box.innerHTML = (data || []).length ? data.map((it) => `<div class="scan-hit"><div class="scan-nm"><h3 dir="ltr" translate="no">${esc(it.name)}</h3>${it.arabic_name ? `<span class="ar">${esc(it.arabic_name)}</span>` : ''}` +
      `<span class="hint-sm">${A.canAdd(it) ? (it.status === 'on_order' ? esc(TEXTS.later) : esc(A.money(it.price)) + ' ج') : '—'}</span></div>` +
      (A.canAdd(it) ? `<button type="button" class="add sm" data-scan-add="${esc(it.id)}">${esc(TEXTS.add)}</button>` : '') + '</div>').join('')
      : `<p class="empty">${esc(TEXTS.noHits)}</p>`;
  }

  // ---------- the three ways ----------
  // remember = true only when HE picked the way (a tap); a fallback (no reader, the camera refused) is not kept, so the camera is tried again next time
  function setMode(m, remember) {
    if (m === 'cam' && !canCam()) { m = 'code'; remember = false; }
    mode = m; if (remember) lsSet(MODE_KEY, m);
    document.querySelectorAll('[data-scan-mode]').forEach((b) => { b.classList.toggle('on', b.dataset.scanMode === m); b.hidden = b.dataset.scanMode === 'cam' && !canCam(); });
    $('scanCodeForm').hidden = m !== 'code';
    $('scanNameBox').hidden = m !== 'name';
    if (m === 'cam') { startCam(); } else { stopCam(); }
    if (m === 'code') $('scanCode').focus({ preventScroll: true });
    if (m === 'name') $('scanName').focus({ preventScroll: true });
  }
  function open() {
    if (!A) return;
    opened = true; reader = makeReader(); toldRaw = ''; lastAdded = null;
    say('');
    drawList();
    const saved = lsGet(MODE_KEY, 'cam');
    setMode(saved === 'code' || saved === 'name' ? saved : 'cam', false);
  }
  function close() {
    if (!opened) return;
    opened = false; stopCam();
  }
  document.addEventListener('click', (e) => {
    if (!opened) return;
    unlockBeep();
    const m = e.target.closest('[data-scan-mode]');
    if (m) { setMode(m.dataset.scanMode, true); return; }
    if (e.target.closest('#scanSwitch')) { nextCam(); return; }
    const st = e.target.closest('[data-scan-step]');
    if (st && A) {
      const line = A.cart().find((x) => String(x.id) === st.dataset.scanStep);
      if (line) { A.setQty(line.id, line.qty + Number(st.dataset.d)); drawList(); }
      return;
    }
    const ad = e.target.closest('[data-scan-add]');
    if (ad) {
      const it = hits.get(ad.dataset.scanAdd);
      if (it && put(it)) { $('scanName').value = ''; $('scanHits').innerHTML = ''; hits = new Map(); }
    }
  });
  document.addEventListener('submit', async (e) => {
    if (!e.target || e.target.id !== 'scanCodeForm') return;
    e.preventDefault();
    const code = stickerCode($('scanCode').value, false);
    if (!code) return say(TEXTS.badCode, 'bad');
    if (await byCode(code, false, '')) $('scanCode').value = '';
  });
  document.addEventListener('input', (e) => {
    if (!e.target || e.target.id !== 'scanName') return;
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => searchName(e.target.value), 300);
  });
  // a phone that goes to the background or a page that is left: the camera is let go at once
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopCam(); else if (opened && mode === 'cam') startCam(); });
  root.addEventListener('pagehide', () => stopCam());

  root.AskerStoreScan = {
    attach(api) { A = api; },
    open, close, drawList,
    mode: () => mode,
  };
})(typeof window === 'undefined' ? globalThis : window);
