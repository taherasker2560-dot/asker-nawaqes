/* «الرسايل» on the store site: our own messages page (owner 2026-11-13, IDEAS: «متصفح رسائل خاص بينا … العميل يدوس عليه
   يوصل ويتواصل معانا من طريق المتصفح الرسائل بتاعنا … نقدر نستخدمه بعد كده في شغلنا الاوتوماتيكي»). His answers: the link
   comes from WhatsApp Business's own «رسالة الترحيب» (store.html#chat); text, photos and voice notes; a notification on the
   customer's phone when we answer. A credit customer is known from his account link; anyone else writes a name and a number
   once. The chat's secret stays on the phone. The server (migration 202611132330) gives back only this chat; photos and voice
   notes go to the private bucket ar-chat and are never read back by the page (the customer sees what he sent this time).
   Voice notes are recorded as WAV 16 kHz mono (every browser, and Gemini reads them): the function asker-chat writes the words.
   A warehouse (owner 2026-11-14 «رابط للمخزن … الربط بتاعهم بالرقم»): the same link; the page asks the number first, and a
   number saved for a warehouse in the bot opens the warehouse's page (no name): big «📷 صوّر القايمة» / «📄 ابعت ملف» (PDF or
   Excel), «✓ وصلت» under each message, and what it sends goes to «الوارد» (arabic-shortages ?chat=1 reads it). */
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
  // a warehouse's file: PDF or Excel only (by its name, else by its type)
  const FILE_TYPES = { pdf: 'application/pdf', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  function fileExt(f) {
    const m = /\.(pdf|xlsx|xls)$/i.exec(String((f && f.name) || ''));
    if (m) return m[1].toLowerCase();
    const t = String((f && f.type) || '');
    return t === 'application/pdf' ? 'pdf' : /spreadsheetml/.test(t) ? 'xlsx' : /ms-excel/.test(t) ? 'xls' : '';
  }
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
    formH: 'قبل أول رسالة: رقم موبايلك',
    name: 'الاسم',
    supHint: '🏬 مندوب مخزن؟ لازم تكتب رقمك اللي الصيدلية مسجلاه عندها، عشان اللي تبعته يروح المشتريات على طول.',
    supWho: 'المشتريات',
    supOk: '✅ إنت متسجل كمخزن: اللي تبعته بيروح المشتريات على طول',
    supPhoto: '📷 صوّر القايمة',
    supFile: '📄 ابعت ملف',
    supFileSub: 'PDF أو إكسل',
    got: '✓ وصلت',
    file: '📄 ملف',
    // someone else's name on this phone (owner 2026-11-14: his test went under a customer's account kept on his phone)
    asWho: 'بتكلمنا باسم',
    notMe: 'مش إنت؟',
    notMeAsk: 'الموبايل هينسى الاسم ده والمحادثة دي، وتكتب رقمك من الأول. تمام؟',
    phone: 'رقم الموبايل',
    start: 'ابدأ',
    type: 'اكتب رسالتك…',
    photo: '📷 صورة',
    voice: '🎤 فويس',
    recording: 'بيسجّل… دوس ➤ عشان يتبعت',
    micAsk: 'بيفتح المايك… لو الموبايل سألك اسمح',
    cancel: 'لغي',
    sending: 'بيبعت…',
    notifyAsk: '🔔 دوس هنا عشان يجيلك إشعار لما نرد عليك',
    notifyOn: 'هيجيلك إشعار لما نرد عليك',
    notifyTest: 'الإشعارات اشتغلت ✅ هيجيلك إشعار زي ده لما نرد عليك',
    notifyNo: 'الموبايل ده مش بيسمح بالإشعارات. افتح الصفحة تاني عشان تشوف الرد.',
    us: 'صيدلية عسكر',
    voiceWords: 'اتكتب:',
    errors: {
      bad_name: 'اكتب اسمك',
      need_name: 'اكتب اسمك كمان، أول مرة بس',
      bad_phone: 'رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01',
      bad_kind: 'الملف ده مش مدعوم. ابعت صورة أو PDF أو إكسل',
      big: 'الملف أكبر من ٨ ميجا',
      // never blaming the customer (owner 2026-11-14: «هنقول للعملاء رسائل كتير ما تبعتوش؟»)
      too_many: 'استنى دقيقة وكمّل رسايلك',
      busy: 'جرب تاني بعد شوية',
      bad_media: 'الملف ما اتبعتش. جرب تاني',
      bad_text: 'الرسالة فاضية أو طويلة أوي',
      chat: 'المحادثة دي مش موجودة. اكتب اسمك ورقمك تاني',
      link: 'الرابط ده مبقاش شغال. اكتب اسمك ورقمك',
      mic: 'الموبايل ما سمحش بالمايك. اسمح للصفحة بالمايك من إعدادات المتصفح',
      noVoice: 'الفويس ما اتسجلش. دوس 🎤 واتكلم، وبعدين دوس ➤',
      net: 'مفيش نت أو حصلت مشكلة. جرب تاني',
    },
  };
  const api = { normPhone, cleanName, downsample, encodeWav, clock, mmss, keyBytes, fileExt, FILE_TYPES, TEXTS, KEY, VAPID, MAX_SECONDS, RATE };
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
  let rec = null, recStarting = false, notify = '';
  // a warehouse's chat (its name in the bot), and whether the name box is asked (a number that is not a warehouse's)
  let supplier = '', askName = false, forwarded = false;
  const whoText = () => (supplier ? `${TEXTS.supWho} · ${supplier}` : secret && name ? `${TEXTS.sub} · ${name}` : TEXTS.sub);
  // what a warehouse sent goes to «الوارد»: the function reads what this chat sent and is not there yet, a few at a time
  // (each photo is read), so the page asks again while some are left (owner 2026-11-14: 6 photos, 2 waited)
  let forwarding = false, forwardAgain = false;
  async function forward() {
    if (!client || !client.functions || !secret) return;
    if (forwarding) { forwardAgain = true; return; }
    forwarding = true;
    try {
      for (let i = 0; i < 10; i++) {
        forwardAgain = false;
        let left = 0;
        try { const r = await client.functions.invoke('arabic-shortages?chat=1', { body: { secret } }); left = (r && r.data && r.data.left) || 0; } catch (e) { break; }
        if (!left && !forwardAgain) break;
      }
    } finally { forwarding = false; }
  }
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
  // the number first: a warehouse's number opens its page at once; anyone else is asked his name once (a name kept on this
  // phone from before is sent with the number)
  async function start(e) {
    e.preventDefault();
    let me = {};
    try { me = JSON.parse(localStorage.getItem('asker_store_me') || 'null') || {}; } catch (x) { /* none */ }
    const p = normPhone($('chatPhone').value), n = cleanName(askName && $('chatName') ? $('chatName').value : me.name || '');
    if (!p) return say(TEXTS.errors.bad_phone);
    if (askName && n.length < 2) return say(TEXTS.errors.bad_name);
    try {
      const d = await rpc('ar_chat_open', { p_name: n || null, p_phone: p });
      if (!d.ok) {
        if (d.error === 'need_name' || (d.error === 'bad_name' && !askName)) {
          askName = true; error = TEXTS.errors.need_name; draw();
          const box = $('chatName'); if (box) box.focus();
          return;
        }
        return say(TEXTS.errors[d.error] || TEXTS.errors.net);
      }
      secret = d.secret; name = d.name || n; supplier = d.supplier || ''; keep.set(secret); say('');
      // a customer's name and number are kept for his orders; a warehouse's are not
      if (!supplier) { try { localStorage.setItem('asker_store_me', JSON.stringify({ ...me, name: n, phone: p })); } catch (x) { /* private window */ } }
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
          // a warehouse's chat (also one the owner marked later from the bot): its page, and its leftovers to «الوارد»
          if ((d.supplier || '') !== supplier) { supplier = d.supplier || ''; draw(); }
          if (supplier && !forwarded) { forwarded = true; forward(); }
          if ($('chatWho')) $('chatWho').textContent = whoText();
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
        } else if (d.error === 'chat') { keep.set(null); secret = null; supplier = ''; forwarded = false; msgs = []; lastId = 0; draw(); say(TEXTS.errors.chat); return; }
      } catch (e) { /* next time */ }
    }
    if (shown()) timer = setTimeout(() => poll(false), POLL_MS);
  }

  function bubble(m) {
    const mine = m.sender === 'customer', url = local.get(m.id);
    let inner = '';
    if (m.kind === 'photo') inner = url ? `<img class="ch-photo" src="${esc(url)}" alt="">` : `<span class="ch-file">${esc(TEXTS.photo)}</span>`;
    else if (m.kind === 'file') inner = `<span class="ch-file ch-doc"><b>📄</b><span dir="auto">${esc(m.body || TEXTS.file)}</span></span>`;
    else if (m.kind === 'voice') {
      inner = url ? `<audio class="ch-audio" controls preload="none" src="${esc(url)}"></audio>` : `<span class="ch-file">${esc(TEXTS.voice)} ${esc(mmss(m.seconds || 0))}</span>`;
      if (m.body) inner += `<span class="ch-words">${esc(TEXTS.voiceWords)} «${esc(m.body)}»</span>`;
    } else inner = `<span class="ch-text">${esc(m.body)}</span>`;
    // a warehouse sees «✓ وصلت» under what it sent (stored: it goes to «الوارد»)
    const time = clock(m.at) + (mine && supplier ? ` · ${TEXTS.got}` : '');
    return `<div class="ch-b ${mine ? 'me' : 'us'}">${mine ? '' : `<span class="ch-who">${esc(TEXTS.us)}</span>`}${inner}<small>${esc(time)}</small></div>`;
  }
  function drawMsgs() {
    const list = $('chatList');
    if (!list) return;
    const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    const who = supplier || name;
    list.innerHTML = (supplier ? `<p class="ch-ok">${esc(TEXTS.supOk)}</p>` : `<p class="ch-hello">${esc(TEXTS.hello)}</p>`) +
      (who && !pharmacyPhone ? `<p class="ch-me"><span>${esc(TEXTS.asWho)}</span> <b class="notr">${esc(who)}</b> · <button type="button" class="linklike" data-ch-notme>${esc(TEXTS.notMe)}</button></p>` : '') +
      msgs.map(bubble).join('');
    if (atEnd || !list.dataset.seen) { list.scrollTop = list.scrollHeight; list.dataset.seen = '1'; window.scrollTo(0, document.body.scrollHeight); }
  }
  function draw() {
    const v = $('chatBox');
    if (!v) return;
    $('chatWho').textContent = whoText();
    // on the pharmacy's phone the page may open inside the installed bot: always a way back (as on «حسابي»)
    const back = $('chatBack');
    if (back) back.hidden = !pharmacyPhone;
    if (!secret) {
      let me = {};
      try { me = JSON.parse(localStorage.getItem('asker_store_me') || 'null') || {}; } catch (e) { /* none */ }
      const typed = $('chatPhone') ? $('chatPhone').value : me.phone || '';
      v.innerHTML = `<form id="chatForm" class="panel ch-form" novalidate><h2>${esc(TEXTS.formH)}</h2>` +
        `<label for="chatPhone">${esc(TEXTS.phone)}</label><input id="chatPhone" type="tel" dir="ltr" inputmode="tel" maxlength="16" placeholder="01xxxxxxxxx" value="${esc(typed)}">` +
        (askName ? `<label for="chatName">${esc(TEXTS.name)}</label><input id="chatName" type="text" maxlength="60" autocomplete="name" value="${esc(me.name || '')}">` : '') +
        `<p class="ch-sup-hint">${esc(TEXTS.supHint)}</p>` +
        `<p id="chatMsg" class="form-msg ${askName && error === TEXTS.errors.need_name ? 'ask' : 'bad'}"${error ? '' : ' hidden'}>${esc(error)}</p><button type="submit" class="ch-start">${esc(TEXTS.start)}</button></form>`;
      $('chatForm').addEventListener('submit', start);
      return;
    }
    // a warehouse: two big buttons first (its list's photo, or its PDF / Excel file)
    const fileAccept = '.pdf,.xls,.xlsx,' + Object.values(FILE_TYPES).join(',');
    v.innerHTML = (supplier
      ? `<div class="ch-big"><label class="ch-bigb p1">${esc(TEXTS.supPhoto)}<input id="chatPhoto2" type="file" multiple accept="image/*" hidden></label>` +
        `<label class="ch-bigb p2">${esc(TEXTS.supFile)}<small>${esc(TEXTS.supFileSub)}</small><input id="chatFile" type="file" multiple accept="${esc(fileAccept)}" hidden></label></div>`
      : '') +
      `<div id="chatList" class="ch-list"></div>` +
      `<p id="chatNotify" class="ch-notify"${notify ? '' : ' hidden'}>${esc(notify)}</p>` +
      `<p id="chatMsg" class="form-msg bad ch-err"${error ? '' : ' hidden'}>${esc(error)}</p>` +
      `<div class="ch-bar">` +
      // the mic answers the tap at once (owner 2026-11-14: «لما أدوس عليه أحس إن هو اتفعل»): red, and the seconds running
      (recStarting
        ? `<button type="button" class="ch-ic" data-ch-cancel aria-label="${esc(TEXTS.cancel)}">✕</button><span class="ch-rec wait"><i class="ch-dot"></i>${esc(TEXTS.micAsk)}</span><button type="button" class="ch-ic ch-mic on" disabled aria-label="${esc(TEXTS.voice)}">🎤</button>`
        : rec
        ? `<button type="button" class="ch-ic" data-ch-cancel aria-label="${esc(TEXTS.cancel)}">✕</button><span class="ch-rec"><i class="ch-dot"></i><b id="chatRecT">0:00</b> ${esc(TEXTS.recording)}</span><button type="button" class="ch-ic ch-mic on" data-ch-recsend aria-label="${esc(TEXTS.voice)}">➤</button>`
        // (a warehouse's file is the big «📄 ابعت ملف» above: one more icon here pushed the mic off the screen, owner 2026-11-14)
        : `<label class="ch-ic ch-cam" aria-label="${esc(TEXTS.photo)}">📷<input id="chatPhoto" type="file" multiple accept="image/*" hidden></label>` +
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
  // a warehouse's list keeps more detail (small print): 2400 px instead of 1600
  async function shrink(file, max = 1600, quality = 0.85) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 1.5 * 1024 * 1024 && file.type === 'image/jpeg') return file;
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
      return blob || file;
    } catch (e) { return file; }
  }
  // one photo; `label` = part of a batch («بيبعت… 3/10»): the batch says «sent» once at its end. true = sent.
  async function sendPhoto(file, label) {
    if (!file || busy) return false;
    busy = true; say(label || TEXTS.sending);
    try {
      const img = supplier ? await shrink(file, 2400, 0.9) : await shrink(file);
      const type = img.type === 'image/png' || img.type === 'image/webp' ? img.type : 'image/jpeg';
      const path = await upload(img, type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg', type);
      const d = await rpc('ar_chat_send', { p_secret: secret, p_kind: 'photo', p_media: path });
      if (!d.ok) { say(TEXTS.errors[d.error] || TEXTS.errors.net); return false; }
      local.set(d.id, URL.createObjectURL(img));
      if (!label) { say(''); afterSend(); }
      return true;
    } catch (e) { say(TEXTS.errors.bad_media); return false; } finally { busy = false; }
  }
  // a warehouse's PDF or Excel list (8 MB at most, like the photos)
  async function sendFile(file, label) {
    if (!file || busy) return false;
    const ext = fileExt(file);
    if (!ext) { say(TEXTS.errors.bad_kind); return false; }
    if (file.size > 8 * 1024 * 1024) { say(TEXTS.errors.big); return false; }
    busy = true; say(label || TEXTS.sending);
    try {
      const path = await upload(file, ext, FILE_TYPES[ext]);
      const d = await rpc('ar_chat_send', { p_secret: secret, p_kind: 'file', p_media: path, p_body: cleanName(file.name).slice(0, 120) || null });
      if (!d.ok) { say(TEXTS.errors[d.error] || TEXTS.errors.net); return false; }
      if (!label) { say(''); afterSend(); }
      return true;
    } catch (e) { say(TEXTS.errors.bad_media); return false; } finally { busy = false; }
  }
  // several at once (owner 2026-11-14 «ممكن واحد يبعت لي 10 صور عادي»): one after the other, «بيبعت… 3/10», up to 20;
  // a failure stops there and says why; what went is told once («✓ وصلت», the pharmacy, «الوارد»)
  async function sendMany(files, one) {
    const list = files.slice(0, 20);
    if (!list.length || busy) return;
    if (list.length === 1) { await one(list[0]); return; }
    let sent = 0;
    for (let i = 0; i < list.length; i++) {
      if (!(await one(list[i], `${TEXTS.sending} ${i + 1}/${list.length}`))) break;
      sent++;
    }
    if (sent === list.length) say('');
    if (sent) afterSend();
  }
  // the voice note: tap 🎤 to start, ➤ to send, ✕ to drop; it stops by itself at 2 minutes
  const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no motor */ } };
  async function startRec() {
    if (rec || recStarting || busy) return;
    // the sound engine is made inside the tap itself: made after the microphone question it can stay asleep and record
    // nothing (owner's test 2026-11-14: a voice note that never came)
    const A = root.AudioContext || root.webkitAudioContext;
    let ctx = null;
    try { ctx = new A(); ctx.resume && ctx.resume(); } catch (e) { say(TEXTS.errors.mic); return; }
    // at once: the bar turns red and says the phone may ask about the microphone
    recStarting = true; say(''); buzz(30); draw();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); } catch (e) { recStarting = false; try { ctx.close(); } catch (x) { /* gone */ } draw(); say(TEXTS.errors.mic); return; }
    if (!recStarting) { stream.getTracks().forEach((t) => t.stop()); try { ctx.close(); } catch (x) { /* gone */ } return; } // ✕ meanwhile
    recStarting = false;
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* tried */ } }
    buzz(60);
    const src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(4096, 1, 1), chunks = [];
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
    if (recStarting && !send) { recStarting = false; draw(); return; } // ✕ while the phone was still asking
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
    // nothing heard (under half a second): said, never dropped silently
    if (down.length < RATE / 2) { say(TEXTS.errors.noVoice); return; }
    const blob = new Blob([encodeWav(down, RATE)], { type: 'audio/wav' });
    busy = true; say(TEXTS.sending);
    try {
      const path = await upload(blob, 'wav', 'audio/wav');
      const d = await rpc('ar_chat_send', { p_secret: secret, p_kind: 'voice', p_media: path, p_seconds: seconds });
      if (!d.ok) { say(TEXTS.errors[d.error] || TEXTS.errors.net); return; }
      local.set(d.id, URL.createObjectURL(blob)); say('');
      // the words of the voice note (the function asker-chat asks Gemini); the next reads show them. A warehouse's voice
      // note goes to «الوارد» once its words are there.
      const words = client.functions.invoke('asker-chat', { body: { action: 'voice', secret, id: d.id } }).catch(() => null);
      afterSend(true);
      words.then(() => (supplier ? forward() : askDraft()));
    } catch (e) { say(TEXTS.errors.bad_media); } finally { busy = false; }
  }
  // the bot writes the pharmacy's answer (part 2, asker-chat «draft»); the pharmacy sends, edits or skips it in the bot
  function askDraft() {
    if (client && client.functions && secret && !supplier) client.functions.invoke('asker-chat', { body: { action: 'draft', secret } }).catch(() => null);
  }
  // `later`: a voice note, whose words come a moment after (the draft and «الوارد» wait for them)
  function afterSend(later) {
    // a warehouse: to «الوارد»; the pharmacy can answer it too, so «🔔» is offered to everyone (owner 2026-11-14)
    if (!later) { if (supplier) forward(); else askDraft(); }
    offerNotify(); poll(true);
    // the pharmacy's phones: «رسالة جديدة من عميل», or «وارد جديد من مخزن» for a warehouse, even with the bot closed
    // (asker-chat; at most once a minute a chat)
    if (client && client.functions) client.functions.invoke('asker-chat', { body: { action: 'notify', secret } }).catch(() => null);
  }
  function toggleSend() {
    const t = $('chatText'), has = !!(t && t.value.trim());
    const s = document.querySelector('[data-ch-send]'), m = document.querySelector('[data-ch-mic]');
    if (s) s.hidden = !has;
    if (m) m.hidden = has;
  }

  // ---------- the notification when we answer ----------
  const canPush = () => 'serviceWorker' in navigator && 'PushManager' in root && 'Notification' in root;
  async function activeRegistration() {
    const reg = await navigator.serviceWorker.register('store/push-sw.js', { scope: 'store/' });
    if (reg.active) return reg;
    const w = reg.installing || reg.waiting;
    await new Promise((ok) => {
      if (!w) return ok();
      w.addEventListener('statechange', () => { if (w.state === 'activated') ok(); });
      setTimeout(ok, 10000);
    });
    return reg;
  }
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
      // the worker of store/ never controls this page (store.html is outside its scope), so «ready» would wait forever
      // (owner's test 2026-11-14 in Chrome: nothing saved): wait for this registration's own worker instead
      const reg = await activeRegistration();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) });
      const d = await rpc('ar_chat_push_save', { p_secret: secret, p_endpoint: sub.endpoint });
      notify = d.ok && asked ? TEXTS.notifyOn : '';
      // a first notification right away: the customer sees on his own phone that they show
      if (d.ok && asked) reg.showNotification('صيدلية عسكر', { body: TEXTS.notifyTest, icon: 'icons/arabic-192.png?v=logo2', tag: 'asker-chat-test', lang: 'ar', dir: 'rtl' }).catch(() => null);
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
    if (e.target.closest('[data-ch-notme]')) {
      if (!root.confirm(TEXTS.notMeAsk)) return;
      if (root.AskerStoreAccount && root.AskerStoreAccount.forget) root.AskerStoreAccount.forget();
      forgetChat(); return;
    }
    if (e.target.closest('#chatNotify.ask')) { subscribe(true); }
  });
  document.addEventListener('input', (e) => { if (e.target && e.target.id === 'chatText') toggleSend(); });
  document.addEventListener('change', (e) => {
    const id = e.target && e.target.id;
    const picked = () => { const f = [...((e.target && e.target.files) || [])]; e.target.value = ''; return f; };
    if (id === 'chatPhoto' || id === 'chatPhoto2') sendMany(picked(), sendPhoto);
    if (id === 'chatFile' || id === 'chatFile2') sendMany(picked(), sendFile);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'chatText' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && shown()) poll(true); });

  // this phone forgets the chat (and the name and number typed for it): the number is asked again
  function forgetChat() {
    keep.set(null); secret = null; supplier = ''; name = ''; msgs = []; lastId = 0; forwarded = false; askName = false; error = ''; notify = '';
    local.clear(); clearTimeout(timer);
    try { localStorage.removeItem('asker_store_me'); } catch (e) { /* private window */ }
    draw();
  }
  root.AskerStoreChat = {
    forget: forgetChat,
    attach(c) { client = c; },
    // store.js view('chat')
    // the messages page takes the whole screen like WhatsApp: the store's bottom tabs hide (owner 2026-11-14: the bar was
    // half under them and could not send); the header's arrow goes back
    open() { document.body.classList.add('ch-open'); open(); },
    close() { document.body.classList.remove('ch-open'); clearTimeout(timer); if (rec || recStarting) stopRec(false); },
  };
})(typeof window === 'undefined' ? globalThis : window);
