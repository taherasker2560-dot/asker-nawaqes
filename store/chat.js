/* «الرسايل» on the store site: our own messages page (owner 2026-11-13, IDEAS: «متصفح رسائل خاص بينا … العميل يدوس عليه
   يوصل ويتواصل معانا من طريق المتصفح الرسائل بتاعنا … نقدر نستخدمه بعد كده في شغلنا الاوتوماتيكي»). His answers: the link
   comes from WhatsApp Business's own «رسالة الترحيب» (store.html#chat); text, photos and voice notes; a notification on the
   customer's phone when we answer. A credit customer is known from his account link; anyone else writes a name and a number
   once. The chat's secret stays on the phone. The server (migration 202611132330) gives back only this chat; photos and voice
   notes go to the private bucket ar-chat and are never read back by the page (the customer sees what he sent this time).
   Voice notes are recorded as WAV 16 kHz mono (every browser, and Gemini reads them): the function asker-chat writes the words. */
(function (root) {
  'use strict';
  const KEY = 'asker_store_chat';
  // the web-push key (public half; the private half is a secret of the function asker-chat)
  const VAPID = 'BEz67xiIZZubLNtifD1Ryqxc6p2j509IsWF6o-YUe5M1BvyWIlUm4NwaRKUP-potwMmyN9_qxqNC2qfn1s5ozwg';
  const MAX_SECONDS = 120, RATE = 16000, POLL_MS = 6000;

  // ---------- pure helpers (also used by tests/store-chat.cjs) ----------
  function normPhone(p) {
    let d = String(p || '').replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
    if (/^201\d{9}$/.test(d)) d = d.slice(1);
    return /^01\d{9}$/.test(d) ? d : null;
  }
  const cleanName = (s) => String(s || '').replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim();
  // a recording made at the phone's own rate, brought down to 16 kHz (averaging each step)
  function downsample(samples, from, to) {
    if (!samples || !samples.length) return new Float32Array(0);
    if (from <= to) return Float32Array.from(samples);
    const ratio = from / to, n = Math.floor(samples.length / ratio), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * ratio), b = Math.min(samples.length, Math.floor((i + 1) * ratio));
      let s = 0;
      for (let j = a; j < b; j++) s += samples[j];
      out[i] = b > a ? s / (b - a) : samples[a];
    }
    return out;
  }
  // 16-bit PCM WAV, mono
  function encodeWav(samples, rate) {
    const n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Uint8Array(buf);
  }
  const clock = (iso) => {
    const t = new Date(iso);
    if (isNaN(t)) return '';
    const h = t.getHours();
    return `${h % 12 || 12}:${String(t.getMinutes()).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
  };
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  // the push key as the browser wants it
  function keyBytes(b64url) {
    const s = String(b64url).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(b64url).length + 3) % 4);
    const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  const TEXTS = {
    title: 'الرسايل',
    sub: 'بنرد عليك هنا',
    hello: 'اكتبلنا أي حاجة: صنف عايزه، روشتة، أو اسأل الصيدلي. وتقدر تبعت صورة أو فويس.',
    formH: 'قبل أول رسالة: اسمك ورقمك',
    name: 'الاسم',
    phone: 'رقم الموبايل',
    start: 'ابدأ',
    type: 'اكتب رسالتك…',
    photo: '📷 صورة',
    voice: '🎤 فويس',
    recording: 'بيسجّل… دوس ➤ عشان يتبعت',
    cancel: 'لغي',
    sending: 'بيبعت…',
    notifyAsk: '🔔 دوس هنا عشان يجيلك إشعار لما نرد عليك',
    notifyOn: 'هيجيلك إشعار لما نرد عليك',
    notifyNo: 'الموبايل ده مش بيسمح بالإشعارات. افتح الصفحة تاني عشان تشوف الرد.',
    us: 'صيدلية عسكر',
    voiceWords: 'اتكتب:',
    errors: {
      bad_name: 'اكتب اسمك',
      bad_phone: 'رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01',
      too_many: 'رسايل كتير في وقت قليل. استنى شوية وجرب تاني',
      bad_media: 'الملف ما اتبعتش. جرب تاني',
      bad_text: 'الرسالة فاضية أو طويلة أوي',
      chat: 'المحادثة دي مش موجودة. اكتب اسمك ورقمك تاني',
      link: 'الرابط ده مبقاش شغال. اكتب اسمك ورقمك',
      mic: 'الموبايل ما سمحش بالمايك. اسمح للصفحة بالمايك من إعدادات المتصفح',
      net: 'مفيش نت أو حصلت مشكلة. جرب تاني',
    },
  };
  const api = { normPhone, cleanName, downsample, encodeWav, clock, mmss, keyBytes, TEXTS, KEY, VAPID, MAX_SECONDS, RATE };
  if (typeof module !== 'undefined') module.exports = api;
  root.AskerStoreChatLib = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // on the pharmacy's own phone (the bot signed in here) nothing is kept beyond this tab (as for «حسابي»)
  const pharmacyPhone = (() => { try { return Object.keys(localStorage).some((k) => /^sb-[a-z0-9]+-auth-token$/.test(k)); } catch (e) { return false; } })();
  const box = () => (pharmacyPhone ? sessionStorage : localStorage);
  const keep = {
    get() { try { return box().getItem(KEY) || null; } catch (e) { return null; } },
    set(v) { try { if (v) box().setItem(KEY, v); else box().removeItem(KEY); } catch (e) { /* private window */ } },
  };
  let client = null, secret = keep.get(), name = '', msgs = [], lastId = 0, timer = null, busy = false, error = '', opening = false;
  let rec = null, notify = '';
  const local = new Map(); // message id -> blob URL of what was sent from this page (photo / voice)
  if (secret && !/^[0-9a-f]{64}$/.test(secret)) { keep.set(null); secret = null; }

  const shown = () => { const v = document.querySelector('[data-view="chat"]'); return !!v && !v.hidden; };
  function say(t) { error = t || ''; const el = $('chatMsg'); if (el) { el.textContent = error; el.hidden = !error; } }
  async function rpc(fn, args) {
    const { data, error: e } = await client.rpc(fn, args);
    if (e) throw e;
    return data || {};
  }

  async function open() {
    if (!client || opening) return;
    if (secret) { draw(); return poll(true); }
    const acct = root.AskerStoreAccount && root.AskerStoreAccount.active();
    if (!acct) { draw(); return; }
    opening = true;
    try {
      const d = await rpc('ar_chat_open', { p_token: acct.token });
      if (d.ok) { secret = d.secret; name = d.name || ''; keep.set(secret); }
    } catch (e) { say(TEXTS.errors.net); }
    opening = false;
    draw(); poll(true);
  }
  async function start(e) {
    e.preventDefault();
    const n = cleanName($('chatName').value), p = normPhone($('chatPhone').value);
    if (n.length < 2) return say(TEXTS.errors.bad_name);
    if (!p) return say(TEXTS.errors.bad_phone);
    try {
      const d = await rpc('ar_chat_open', { p_name: n, p_phone: p });
      if (!d.ok) return say(TEXTS.errors[d.error] || TEXTS.errors.net);
      secret = d.secret; name = d.name || n; keep.set(secret); say('');
      try { const me = JSON.parse(localStorage.getItem('asker_store_me') || 'null') || {}; localStorage.setItem('asker_store_me', JSON.stringify({ ...me, name: n, phone: p })); } catch (x) { /* private window */ }
      draw(); poll(true);
    } catch (x) { say(TEXTS.errors.net); }
  }
  async function poll(force) {
    if (!secret || !client) return;
    clearTimeout(timer);
    if (force || (shown() && document.visibilityState !== 'hidden')) {
      try {
        const d = await rpc('ar_chat_read', { p_secret: secret, p_after: lastId });
        if (d.ok) {
          name = d.name || name;
          let changed = false;
          for (const m of d.messages || []) {
            const i = msgs.findIndex((x) => x.id === m.id);
            if (i >= 0) { if (JSON.stringify(msgs[i]) !== JSON.stringify(m)) { msgs[i] = m; changed = true; } } else { msgs.push(m); changed = true; }
          }
          // a voice note's words come a moment later: read it again until they are there
          const waitingWords = msgs.find((m) => m.kind === 'voice' && m.sender === 'customer' && !m.body && Date.now() - new Date(m.at) < 120000);
          const top = msgs.length ? msgs[msgs.length - 1].id : 0;
          lastId = waitingWords ? Math.min(top, waitingWords.id - 1) : top;
          if (changed) drawMsgs();
        } else if (d.error === 'chat') { keep.set(null); secret = null; msgs = []; lastId = 0; draw(); say(TEXTS.errors.chat); return; }
      } catch (e) { /* next time */ }
    }
    if (shown()) timer = setTimeout(() => poll(false), POLL_MS);
  }

  function bubble(m) {
    const mine = m.sender === 'customer', url = local.get(m.id);
    let inner = '';
    if (m.kind === 'photo') inner = url ? `<img class="ch-photo" src="${esc(url)}" alt="">` : `<span class="ch-file">${esc(TEXTS.photo)}</span>`;
    else if (m.kind === 'voice') {
      inner = url ? `<audio class="ch-audio" controls preload="none" src="${esc(url)}"></audio>` : `<span class="ch-file">${esc(TEXTS.voice)} ${esc(mmss(m.seconds || 0))}</span>`;
      if (m.body) inner += `<span class="ch-words">${esc(TEXTS.voiceWords)} «${esc(m.body)}»</span>`;
    } else inner = `<span class="ch-text">${esc(m.body)}</span>`;
    return `<div class="ch-b ${mine ? 'me' : 'us'}">${mine ? '' : `<span class="ch-who">${esc(TEXTS.us)}</span>`}${inner}<small>${esc(clock(m.at))}</small></div>`;
  }
  function drawMsgs() {
    const list = $('chatList');
    if (!list) return;
    const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    list.innerHTML = `<p class="ch-hello">${esc(TEXTS.hello)}</p>` + msgs.map(bubble).join('');
    if (atEnd || !list.dataset.seen) { list.scrollTop = list.scrollHeight; list.dataset.seen = '1'; window.scrollTo(0, document.body.scrollHeight); }
  }
  function draw() {
    const v = $('chatBox');
    if (!v) return;
    $('chatWho').textContent = secret && name ? `${TEXTS.sub} · ${name}` : TEXTS.sub;
    if (!secret) {
      let me = {};
      try { me = JSON.parse(localStorage.getItem('asker_store_me') || 'null') || {}; } catch (e) { /* none */ }
      v.innerHTML = `<form id="chatForm" class="panel ch-form" novalidate><h2>${esc(TEXTS.formH)}</h2>` +
        `<label for="chatName">${esc(TEXTS.name)}</label><input id="chatName" type="text" maxlength="60" autocomplete="name" value="${esc(me.name || '')}">` +
        `<label for="chatPhone">${esc(TEXTS.phone)}</label><input id="chatPhone" type="tel" dir="ltr" inputmode="tel" maxlength="16" placeholder="01xxxxxxxxx" value="${esc(me.phone || '')}">` +
        `<p id="chatMsg" class="form-msg bad"${error ? '' : ' hidden'}>${esc(error)}</p><button type="submit" class="ch-start">${esc(TEXTS.start)}</button></form>`;
      $('chatForm').addEventListener('submit', start);
      return;
    }
    v.innerHTML = `<div id="chatList" class="ch-list"></div>` +
      `<p id="chatNotify" class="ch-notify"${notify ? '' : ' hidden'}>${esc(notify)}</p>` +
      `<p id="chatMsg" class="form-msg bad ch-err"${error ? '' : ' hidden'}>${esc(error)}</p>` +
      `<div class="ch-bar">` +
      (rec
        ? `<button type="button" class="ch-ic" data-ch-cancel aria-label="${esc(TEXTS.cancel)}">✕</button><span class="ch-rec">● <b id="chatRecT">0:00</b> ${esc(TEXTS.recording)}</span><button type="button" class="ch-ic ch-mic on" data-ch-recsend aria-label="${esc(TEXTS.voice)}">➤</button>`
        : `<label class="ch-ic ch-cam" aria-label="${esc(TEXTS.photo)}">📷<input id="chatPhoto" type="file" accept="image/*" hidden></label>` +
          `<textarea id="chatText" rows="1" maxlength="2000" placeholder="${esc(TEXTS.type)}"></textarea>` +
          `<button type="button" class="ch-ic ch-mic" data-ch-mic aria-label="${esc(TEXTS.voice)}">🎤</button><button type="button" class="ch-ic ch-send" data-ch-send aria-label="ابعت" hidden>➤</button>`) +
      `</div>`;
    drawMsgs();
    drawNotify();
  }

  // ---------- sending ----------
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
  }
  const day = () => new Date().toISOString().slice(0, 10);
  async function upload(blob, ext, type) {
    const path = `c/${day()}/${uuid()}.${ext}`;
    const up = await client.storage.from('ar-chat').upload(path, blob, { contentType: type, upsert: false });
    if (up.error) throw new Error('upload');
    return path;
  }
  async function sendText() {
    const t = $('chatText'), body = (t && t.value || '').trim();
    if (!body || busy) return;
    busy = true;
    try {
      const d = await rpc('ar_chat_send', { p_secret: secret, p_kind: 'text', p_body: body });
      if (!d.ok) { say(TEXTS.errors[d.error] || TEXTS.errors.net); return; }
      t.value = ''; toggleSend(); say('');
      afterSend();
    } catch (e) { say(TEXTS.errors.net); } finally { busy = false; }
  }
  async function shrink(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 1.5 * 1024 * 1024 && file.type === 'image/jpeg') return file;
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
      return blob || file;
    } catch (e) { return file; }
  }
  async function sendPhoto(file) {
    if (!file || busy) return;
    busy = true; say(TEXTS.sending);
    try {
      const img = await shrink(file);
      const type = img.type === 'image/png' || img.type === 'image/webp' ? img.type : 'image/jpeg';
      const path = await upload(img, type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg', type);
      const d = await rpc('ar_chat_send', { p_secret: secret, p_kind: 'photo', p_media: path });
      if (!d.ok) { say(TEXTS.errors[d.error] || TEXTS.errors.net); return; }
      local.set(d.id, URL.createObjectURL(img)); say('');
      afterSend();
    } catch (e) { say(TEXTS.errors.bad_media); } finally { busy = false; }
  }
  // the voice note: tap 🎤 to start, ➤ to send, ✕ to drop; it stops by itself at 2 minutes
  async function startRec() {
    if (rec || busy) return;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); } catch (e) { say(TEXTS.errors.mic); return; }
    const A = root.AudioContext || root.webkitAudioContext;
    const ctx = new A(), src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(4096, 1, 1), chunks = [];
    proc.onaudioprocess = (e) => { chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
    src.connect(proc); proc.connect(ctx.destination);
    rec = { stream, ctx, src, proc, chunks, t0: Date.now(), tick: null };
    say(''); draw();
    rec.tick = setInterval(() => {
      const s = (Date.now() - rec.t0) / 1000, el = $('chatRecT');
      if (el) el.textContent = mmss(s);
      if (s >= MAX_SECONDS) stopRec(true);
    }, 250);
  }
  async function stopRec(send) {
    const r = rec;
    if (!r) return;
    rec = null;
    clearInterval(r.tick);
    try { r.proc.disconnect(); r.src.disconnect(); } catch (e) { /* gone */ }
    r.stream.getTracks().forEach((t) => t.stop());
    const rate = r.ctx.sampleRate;
    try { r.ctx.close(); } catch (e) { /* gone */ }
    draw();
    if (!send) return;
    let n = 0;
    for (const c of r.chunks) n += c.length;
    const all = new Float32Array(n);
    let o = 0;
    for (const c of r.chunks) { all.set(c, o); o += c.length; }
    const down = downsample(all, rate, RATE), seconds = Math.max(1, Math.min(180, Math.round(down.length / RATE)));
    if (down.length < RATE / 2) return; // under half a second: a slip of the finger
    const blob = new Blob([encodeWav(down, RATE)], { type: 'audio/wav' });
    busy = true; say(TEXTS.sending);
    try {
      const path = await upload(blob, 'wav', 'audio/wav');
      const d = await rpc('ar_chat_send', { p_secret: secret, p_kind: 'voice', p_media: path, p_seconds: seconds });
      if (!d.ok) { say(TEXTS.errors[d.error] || TEXTS.errors.net); return; }
      local.set(d.id, URL.createObjectURL(blob)); say('');
      // the words of the voice note (the function asker-chat asks Gemini); the next reads show them
      client.functions.invoke('asker-chat', { body: { action: 'voice', secret, id: d.id } }).catch(() => null);
      afterSend();
    } catch (e) { say(TEXTS.errors.bad_media); } finally { busy = false; }
  }
  function afterSend() { poll(true); offerNotify(); }
  function toggleSend() {
    const t = $('chatText'), has = !!(t && t.value.trim());
    const s = document.querySelector('[data-ch-send]'), m = document.querySelector('[data-ch-mic]');
    if (s) s.hidden = !has;
    if (m) m.hidden = has;
  }

  // ---------- the notification when we answer ----------
  const canPush = () => 'serviceWorker' in navigator && 'PushManager' in root && 'Notification' in root;
  function drawNotify() {
    const el = $('chatNotify');
    if (!el) return;
    el.textContent = notify; el.hidden = !notify;
    el.classList.toggle('ask', notify === TEXTS.notifyAsk);
  }
  function offerNotify() {
    if (!canPush() || !secret) return;
    if (Notification.permission === 'granted') { subscribe(false); return; }
    if (Notification.permission === 'denied') return;
    notify = TEXTS.notifyAsk; drawNotify();
  }
  async function subscribe(asked) {
    try {
      if (asked && Notification.permission !== 'granted') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') { notify = TEXTS.notifyNo; drawNotify(); return; }
      }
      const reg = await navigator.serviceWorker.register('store/push-sw.js', { scope: 'store/' });
      await navigator.serviceWorker.ready.catch(() => null);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) });
      const d = await rpc('ar_chat_push_save', { p_secret: secret, p_endpoint: sub.endpoint });
      notify = d.ok && asked ? TEXTS.notifyOn : '';
    } catch (e) {
      notify = asked ? TEXTS.notifyNo : '';
    }
    drawNotify();
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#chatBox, #chatNotify')) return;
    if (e.target.closest('[data-ch-send]')) { sendText(); return; }
    if (e.target.closest('[data-ch-mic]')) { startRec(); return; }
    if (e.target.closest('[data-ch-recsend]')) { stopRec(true); return; }
    if (e.target.closest('[data-ch-cancel]')) { stopRec(false); return; }
    if (e.target.closest('#chatNotify.ask')) { subscribe(true); }
  });
  document.addEventListener('input', (e) => { if (e.target && e.target.id === 'chatText') toggleSend(); });
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'chatPhoto') { const f = e.target.files && e.target.files[0]; e.target.value = ''; sendPhoto(f); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'chatText' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && shown()) poll(true); });

  root.AskerStoreChat = {
    attach(c) { client = c; },
    // store.js view('chat')
    open() { open(); },
    close() { clearTimeout(timer); if (rec) stopRec(false); },
  };
})(typeof window === 'undefined' ? globalThis : window);
