/* «خدمة العملاء ← الرسايل» (owner 2026-11-13, IDEAS «متصفح رسائل خاص بينا», part 1: the page and answering by hand).
   The customers write on our own messages page (store.html#chat, store/chat.js): text, photos, voice notes (their words
   written under them by the function asker-chat). Here the owner, and staff with «خدمة العملاء» (perm 'care'), see the chats
   (the ones waiting for an answer first), open one (his account when he is a credit customer), and answer; the customer gets
   a notification on his phone (asker-chat → web push). Part 2 adds the bot's suggested answer and the trial week.
   Data: ar_chats / ar_chat_messages (read), ar_chat_reply (answer), bucket ar-chat (photos, voice notes), migration
   202611132330. */
(function (root) {
  'use strict';
  const POLL_MS = 15000;

  // ---------- pure helpers (also used by tests/chat.cjs) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (t) => { const h = t.getHours(); return `${h % 12 || 12}:${pad(t.getMinutes())} ${h < 12 ? 'ص' : 'م'}`; };
  // «10:33 م» today, «امبارح 9:10 ص», else «08/11»
  function whenText(iso, now) {
    const t = new Date(iso);
    if (isNaN(t)) return '';
    const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()), d = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const diff = Math.round((d0 - d) / 864e5);
    if (diff === 0) return clock(t);
    if (diff === 1) return `امبارح ${clock(t)}`;
    return `${pad(t.getDate())}/${pad(t.getMonth() + 1)}`;
  }
  // the list: waiting for an answer = the customer wrote last; newest first. The warehouses' chats (their lists go to
  // «الوارد») have their own chip «🏬 المخازن» (owner 2026-11-14 «المورد يكلمني عادي على الرسائل وأكلمه وأرد عليه»).
  function pickChats(chats, filter) {
    const list = (chats || []).filter((c) => (filter === 'wh' ? !!c.supplier : !c.supplier) && (filter !== 'waiting' || Number(c.waiting) > 0));
    return list.sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)));
  }
  const waitingCount = (chats) => (chats || []).filter((c) => !c.supplier && Number(c.waiting) > 0).length;
  // «0101 234 5678»
  const showPhone = (p) => (/^01\d{9}$/.test(String(p || '')) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : String(p || ''));
  const mmss = (s) => `${Math.floor((s || 0) / 60)}:${pad(Math.floor((s || 0) % 60))}`;
  const api = { whenText, pickChats, waitingCount, showPhone, mmss };
  root.AskerChatLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let chats = null, filter = 'waiting', failed = '', loading = false, timer = null;
  // «رسالة جديدة من عميل» on this phone even with the bot closed (owner 2026-11-14): web push to the bot's own worker (ar/sw.js)
  const VAPID = 'BEz67xiIZZubLNtifD1Ryqxc6p2j509IsWF6o-YUe5M1BvyWIlUm4NwaRKUP-potwMmyN9_qxqNC2qfn1s5ozwg';
  let pushState = ''; // '' not checked, 'on', 'off', 'no' (this phone cannot), 'busy', 'bad' (refused)
  const canPush = () => 'serviceWorker' in navigator && 'PushManager' in root && 'Notification' in root;
  function keyBytes(b64url) {
    const s = String(b64url).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(b64url).length + 3) % 4);
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  }
  async function botReg() {
    const reg = (await navigator.serviceWorker.getRegistration('ar/')) || (await navigator.serviceWorker.register('ar/sw.js', { scope: 'ar/' }));
    if (reg.active) return reg;
    const w = reg.installing || reg.waiting;
    await new Promise((ok) => { if (!w) return ok(); w.addEventListener('statechange', () => { if (w.state === 'activated') ok(); }); setTimeout(ok, 10000); });
    return reg;
  }
  async function checkPush() {
    if (!canPush()) { pushState = 'no'; return; }
    try {
      const reg = await botReg(), sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === 'granted') {
        pushState = 'on';
        db().rpc('ar_chat_staff_push_save', { p_endpoint: sub.endpoint }).then(() => null, () => null); // keeps it fresh
      } else pushState = 'off';
    } catch (e) { pushState = 'off'; }
    if (!st) drawList();
  }
  async function turnPushOn() {
    pushState = 'busy'; drawList();
    try {
      if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') { pushState = 'bad'; drawList(); return; }
      const reg = await botReg();
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
      const { data, error } = await db().rpc('ar_chat_staff_push_save', { p_endpoint: sub.endpoint });
      if (error || !data || !data.ok) throw new Error((error && error.message) || 'save');
      pushState = 'on';
      reg.showNotification('بوت عسكر', { body: 'إشعار الرسايل اشتغل ✅ هيجيلك زي ده لما عميل يكتب', icon: 'icons/arabic-192.png?v=logo2', tag: 'asker-care-test', lang: 'ar', dir: 'rtl' }).catch(() => null);
    } catch (e) { pushState = 'bad'; }
    drawList();
  }
  function pushHtml() {
    if (pushState === 'off') return '<button type="button" class="secondary ch-push" data-chat-push>🔔 إشعار على موبايلك لما عميل يكتب (حتى والبوت مقفول)</button>';
    if (pushState === 'busy') return '<p class="status">بيفعّل الإشعار…</p>';
    if (pushState === 'on') return '<p class="hint ch-push-on">🔔 إشعار الرسايل شغال على الموبايل ده.</p>';
    if (pushState === 'bad') return '<p class="status bad">الموبايل ما سمحش بالإشعار. اسمح للبوت بالإشعارات من إعدادات المتصفح وجرّب تاني.</p><button type="button" class="secondary ch-push" data-chat-push>🔔 جرّب تاني</button>';
    return '';
  }
  // the open chat: { c, msgs, urls: {path: signedUrl}, busy, error, note, account }
  let st = null;

  async function loadChats() {
    if (!db() || loading) return;
    loading = true;
    try {
      // a warehouse's chat (migration 202611141400) is under «🏬 المخازن»: what it sends goes to «الوارد», and it can be answered
      const { data, error } = await db().from('ar_chats').select('id,customer_id,name,phone,last_at,last_from,waiting,last_text,supplier').order('last_at', { ascending: false }).range(0, 299);
      if (error) throw new Error(error.message || String(error));
      chats = data || []; failed = '';
      if (st) { const c = chats.find((x) => x.id === st.c.id); if (c) st.c = c; }
    } catch (e) {
      failed = (e && e.message) || String(e);
    } finally {
      loading = false;
      draw();
    }
  }
  async function loadMsgs() {
    const me = st;
    if (!me) return;
    try {
      const after = me.msgs.length ? me.msgs[me.msgs.length - 1].id : 0;
      // a voice note's words may come later: read again from the oldest one still without words (2 minutes at most)
      const noWords = me.msgs.find((m) => m.kind === 'voice' && !m.body && Date.now() - new Date(m.at) < 120000);
      const from = noWords ? noWords.id - 1 : after;
      const { data, error } = await db().from('ar_chat_messages').select('id,at,sender,kind,body,media,seconds,sent_by').eq('chat_id', me.c.id).gt('id', from).order('id').range(0, 499);
      if (error) throw new Error(error.message || String(error));
      for (const m of data || []) {
        const i = me.msgs.findIndex((x) => x.id === m.id);
        if (i >= 0) me.msgs[i] = m; else me.msgs.push(m);
      }
      const need = me.msgs.filter((m) => m.media && !me.urls[m.media]).map((m) => m.media);
      if (need.length) {
        const sg = await db().storage.from('ar-chat').createSignedUrls(need, 3600);
        for (const x of (sg && sg.data) || []) if (x && x.signedUrl) me.urls[x.path] = x.signedUrl;
      }
      me.error = '';
    } catch (e) {
      me.error = (e && e.message) || String(e);
    }
    if (st === me) drawChat();
  }
  async function loadAccount(me) {
    if (!me.c.customer_id) return;
    try {
      const { data } = await db().from('ar_customers').select('id,balance').eq('id', me.c.customer_id).maybeSingle();
      if (data) me.account = data;
    } catch (e) { /* staff without «العملاء» */ }
    if (st === me) drawChat();
  }

  function rowHtml(c, now) {
    const who = c.supplier || c.name || showPhone(c.phone);
    const tag = c.supplier ? '🏬 مخزن' : c.customer_id ? `آجل ${esc(c.customer_id)}` : c.phone ? `كاش` : '';
    return `<button type="button" class="ch-row${Number(c.waiting) > 0 ? ' wait' : ''}" data-chat="${esc(c.id)}">` +
      `<span class="ch-av">${esc((who || '؟').trim().charAt(0))}</span>` +
      `<span class="ch-main"><strong class="notr">${esc(who)}</strong>${tag ? ` <small>· ${tag}</small>` : ''}<span class="ch-last notr">${esc(c.last_from === 'pharmacy' ? 'إنت: ' : '')}${esc(c.last_text || '')}</span></span>` +
      `<span class="ch-side"><small>${esc(whenText(c.last_at, now))}</small>${Number(c.waiting) > 0 ? `<b class="ch-n">${esc(c.waiting)}</b>` : ''}</span></button>`;
  }
  function drawList() {
    const box = $('chatPanel');
    if (!box) return;
    if (chats == null) { box.innerHTML = failed ? `<p class="status bad">مقدرتش أجيب الرسايل: ${esc(failed)}</p>` : '<p class="status">بيجيب الرسايل…</p>'; return; }
    const n = waitingCount(chats), list = pickChats(chats, filter), now = new Date();
    const people = chats.filter((c) => !c.supplier).length, houses = chats.length - people;
    const chip = (f, label) => `<button type="button" class="chip${filter === f ? ' on' : ''}" data-chat-filter="${f}">${label}</button>`;
    box.innerHTML = '<h2>الرسايل</h2>' +
      `<p class="hint">العملاء بيكتبولك من صفحة الرسايل بتاعتنا (الرابط في رسالة الترحيب على الواتس، و«💬 كلّمنا» في حساب العميل). لما ترد بيجيلهم إشعار.</p>` +
      `<p class="hint">الرسايل بتتمسح لوحدها بعد 7 أيام.</p>` +
      pushHtml() +
      (listNote ? `<p class="status good">${esc(listNote)}</p>` : '') +
      `<div class="chips">${chip('waiting', `مستنية رد <b>${n}</b>`)}${chip('all', `الكل <b>${people}</b>`)}${houses ? chip('wh', `🏬 المخازن <b>${houses}</b>`) : ''}</div>` +
      (list.length ? list.map((c) => rowHtml(c, now)).join('') : `<p class="hint">${filter === 'waiting' ? 'مفيش حد مستني رد.' : 'لسه محدش كتب.'}</p>`) +
      (failed ? `<p class="status bad">مقدرتش أجيب الرسايل: ${esc(failed)}</p>` : '');
  }
  function msgHtml(m) {
    const mine = m.sender === 'pharmacy', url = m.media && st.urls[m.media];
    let inner = '';
    if (m.kind === 'photo') inner = url ? `<a href="${esc(url)}" target="_blank" rel="noopener"><img class="ch-photo" src="${esc(url)}" alt="صورة من العميل" loading="lazy"></a>` : '<span>📷 صورة</span>';
    else if (m.kind === 'file') inner = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">📄 <span class="notr">${esc(m.body || '')}</span></a>` : `<span>📄 <span class="notr">${esc(m.body || '')}</span></span>`;
    else if (m.kind === 'voice') {
      inner = url ? `<audio class="ch-audio" controls preload="none" src="${esc(url)}"></audio>` : `<span>🎤 فويس ${esc(mmss(m.seconds))}</span>`;
      inner += m.body ? `<span class="ch-words">اتكتب: «<span class="notr">${esc(m.body)}</span>»</span>` : '<span class="ch-words">بيتكتب…</span>';
    } else inner = `<span class="ch-text notr">${esc(m.body)}</span>`;
    const by = mine && m.sent_by && root.AskerStaff && root.AskerStaff.nameOf ? root.AskerStaff.nameOf(m.sent_by) : '';
    // one message deleted (the owner only; owner 2026-11-14 «عايز اوبشن ان انا اقدر امسح كمان رسائل العملاء»)
    const del = ownerHere() ? ` <button type="button" class="ch-x" data-chat-delmsg="${esc(m.id)}" aria-label="امسح الرسالة">🗑</button>` : '';
    return `<div class="ch-b ${mine ? 'us' : 'them'}">${mine ? `<span class="ch-who">${esc(by || 'الصيدلية')}</span>` : ''}${inner}<small>${esc(whenText(m.at, new Date()))}${del}</small></div>`;
  }
  function drawChat() {
    const box = $('chatPanel');
    if (!box || !st) return;
    const c = st.c, who = c.supplier || c.name || showPhone(c.phone);
    const draft = $('chatReply') ? $('chatReply').value : (st.draft || '');
    const wa = c.phone ? `https://wa.me/2${c.phone}` : '';
    const acct = c.supplier
      ? `<div class="ch-acct"><span>🏬 مخزن${c.phone ? ` · <b dir="ltr">${esc(showPhone(c.phone))}</b>` : ''}</span><span>قوايمه بتروح «الوارد»</span></div>`
      : c.customer_id
      ? `<div class="ch-acct"><span>آجل · كود ${esc(c.customer_id)}</span>${st.account ? `<span><b>${esc(Number(st.account.balance) > 0.5 ? `عليه ${Number(st.account.balance).toLocaleString('en-US', { maximumFractionDigits: 2 })} ج` : 'خالص')}</b> · <button type="button" class="linklike" data-chat-statement>الكشف</button></span>` : ''}</div>`
      : `<div class="ch-acct"><span>كاش${c.phone ? ` · <b dir="ltr">${esc(showPhone(c.phone))}</b>` : ''}</span>${wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener">📱 واتس</a>` : ''}</div>`;
    box.innerHTML = `<button type="button" class="secondary small cu-back" data-chat-back>→ رجوع للرسايل</button>` +
      `<h2 class="notr">${esc(who)}</h2>` + acct +
      `<div class="ch-thread" id="chatThread">${st.msgs.map(msgHtml).join('') || '<p class="hint">مفيش رسايل.</p>'}</div>` +
      (st.error ? `<p class="status bad">${esc(st.error)}</p>` : '') +
      `<div class="ch-reply"><textarea id="chatReply" rows="2" maxlength="2000" placeholder="اكتب الرد…"></textarea>` +
      `<button type="button" data-chat-send${st.busy ? ' disabled' : ''}>${st.busy ? 'بيبعت…' : 'ابعت'}</button></div>` +
      (st.note ? `<p class="status ${st.noteBad ? 'bad' : 'good'}">${esc(st.note)}</p>` : '') +
      supHtml() +
      // the owner only (owner 2026-11-14 «عايز اوبشن لحذف الرسائل»)
      (ownerHere() ? `<button type="button" class="secondary small ch-del" data-chat-del${st.busy ? ' disabled' : ''}>🗑 امسح المحادثة</button>` : '');
    const t = $('chatReply');
    if (t) t.value = draft;
    const th = $('chatThread');
    if (th) th.scrollTop = th.scrollHeight;
  }
  function draw() { if (st) drawChat(); else drawList(); }

  function openChat(id) {
    const c = (chats || []).find((x) => x.id === id);
    if (!c) return;
    st = { c, msgs: [], urls: {}, busy: false, error: '', note: '', account: null };
    try { history.pushState({ chatOpen: id }, ''); } catch (e) { /* no history */ }
    drawChat(); window.scrollTo?.(0, 0);
    loadMsgs(); loadAccount(st);
  }
  function closeChat() { st = null; drawList(); loadChats(); }
  async function send() {
    const me = st, t = $('chatReply'), body = (t && t.value || '').trim();
    if (!me || me.busy || !body) return;
    me.busy = true; me.draft = body; me.note = ''; drawChat();
    try {
      const { data, error } = await db().rpc('ar_chat_reply', { p_chat: me.c.id, p_body: body });
      if (error) throw new Error(error.message || String(error));
      if (!data || !data.ok) throw new Error((data && data.error) || 'ما اتبعتش');
      me.draft = ''; if ($('chatReply')) $('chatReply').value = '';
      // the customer's phone(s): a notification (nothing in it but «ردينا عليك»)
      let told = false, failedPush = 0;
      try {
        const r = await db().functions.invoke('asker-chat', { body: { action: 'push', chat_id: me.c.id } });
        told = !!(r && r.data && r.data.sent > 0);
        failedPush = (r && r.data && r.data.failed) || 0;
      } catch (e) { failedPush = 1; }
      const note = told ? 'اتبعت، ووصله إشعار على موبايله.'
        : failedPush ? 'اتبعت، بس الإشعار ما وصلش لموبايله. هيشوف الرد أول ما يفتح الصفحة.'
        : 'اتبعت. هيشوفه أول ما يفتح الصفحة (مفيش إشعار مفعّل عنده).';
      Object.assign(me, { note, noteBad: false });
      Object.assign(me.c, { waiting: 0, last_from: 'pharmacy', last_text: body.slice(0, 200), last_at: new Date().toISOString() });
    } catch (e) {
      Object.assign(me, { note: 'ما اتبعتش: ' + ((e && e.message) || e), noteBad: true });
    } finally {
      me.busy = false;
      if (st === me) { drawChat(); loadMsgs(); }
    }
  }
  const ownerHere = () => !(root.AskerStaff && root.AskerStaff.isStaff && root.AskerStaff.isStaff());
  const tr = (s) => (root.AskerI18n && root.AskerI18n.lang && root.AskerI18n.lang() === 'en' ? root.AskerI18n.translate(s) : s);
  let listNote = '';
  // the whole chat: its photos and voice notes from the bucket, then the chat itself (messages and push addresses go with it)
  async function removeChat() {
    const me = st;
    if (!me || me.busy) return;
    if (!root.confirm(tr('تمسح المحادثة دي كلها؟ الرسايل والصور والفويس هيتمسحوا ومش هيرجعوا.'))) return;
    me.busy = true; me.note = ''; drawChat();
    try {
      const { data: all, error: e1 } = await db().from('ar_chat_messages').select('media').eq('chat_id', me.c.id).range(0, 999);
      if (e1) throw new Error(e1.message || String(e1));
      const files = (all || []).map((m) => m.media).filter(Boolean);
      if (files.length) {
        const rm = await db().storage.from('ar-chat').remove(files);
        if (rm && rm.error) throw new Error(rm.error.message || String(rm.error));
      }
      const { data, error } = await db().rpc('ar_chat_delete', { p_chat: me.c.id });
      if (error) throw new Error(error.message || String(error));
      if (!data || !data.ok) throw new Error('ما اتمسحتش');
      chats = (chats || []).filter((c) => c.id !== me.c.id);
      listNote = 'اتمسحت المحادثة.';
      st = null;
      try { if (history.state && history.state.chatOpen) history.replaceState(null, ''); } catch (e) { /* no history */ }
      drawList();
    } catch (e) {
      Object.assign(me, { busy: false, note: 'ما اتمسحتش: ' + ((e && e.message) || e), noteBad: true });
      if (st === me) drawChat();
    }
  }
  // «🏬 ده مندوب مخزن؟» (owner 2026-11-14): a rep whose number is not saved wrote here as a customer. The owner picks his
  // warehouse (or a new one) once: the number is saved for it, every chat of that number becomes the warehouse's, and
  // its messages go to «الوارد» (arabic-shortages reads them); the chat leaves this list.
  function supHtml() {
    if (!ownerHere() || !st || st.c.customer_id || st.c.supplier || !st.c.phone) return '';
    if (!st.sup) return `<button type="button" class="secondary small ch-sup" data-chat-sup${st.busy ? ' disabled' : ''}>🏬 ده مندوب مخزن؟</button>`;
    const names = st.supNames;
    return `<div class="ch-mv"><h4>🏬 ده مندوب مخزن؟</h4><p class="hint">اختار مخزنه مرة واحدة: رقمه يتسجل، والقايمة دي واللي بعدها يروحوا «الوارد» ويتقروا.</p>` +
      (names == null ? '<p class="status">بيجيب المخازن…</p>'
        : `<div class="chips">${names.map((n) => `<button type="button" class="chip notr" data-chat-supname="${esc(n)}"${st.busy ? ' disabled' : ''}>${esc(n)}</button>`).join('')}` +
          `<button type="button" class="chip" data-chat-supnew${st.busy ? ' disabled' : ''}>＋ مخزن جديد</button></div>`) +
      `<button type="button" class="secondary small" data-chat-supno>لغي</button></div>`;
  }
  async function openSup() {
    const me = st;
    if (!me) return;
    me.sup = true; me.supNames = null; drawChat();
    try {
      const { data, error } = await db().from('ar_suppliers').select('name').order('name');
      if (error) throw new Error(error.message || String(error));
      me.supNames = (data || []).map((x) => x.name);
    } catch (e) {
      Object.assign(me, { sup: false, note: 'مقدرتش أجيب المخازن: ' + ((e && e.message) || e), noteBad: true });
    }
    if (st === me) drawChat();
  }
  async function makeSupplier(pick, fresh) {
    const me = st;
    if (!me || me.busy) return;
    me.busy = true; me.note = ''; drawChat();
    try {
      const { data, error } = await db().rpc('ar_chat_make_supplier', { p_chat: me.c.id, p_supplier: pick || null, p_new: fresh || null });
      if (error) throw new Error(error.message || String(error));
      if (!data || !data.ok) throw new Error(data && data.error === 'exists' ? tr('الاسم ده موجود، اختاره من القايمة') : (data && data.error) || 'ماتسجلش');
      // what he sent goes to «الوارد» now (read in the background)
      db().functions.invoke('arabic-shortages?chat=1', { body: { secret: data.secret } }).catch(() => null);
      // the chat moves under «🏬 المخازن» (still answerable there)
      for (const c of chats || []) if (!c.customer_id && c.phone === me.c.phone) Object.assign(c, { supplier: data.supplier, waiting: 0 });
      listNote = 'اتسجل كمندوب مخزن، ورسايله رايحة الوارد.';
      st = null;
      try { if (history.state && history.state.chatOpen) history.replaceState(null, ''); } catch (e) { /* no history */ }
      drawList();
    } catch (e) {
      Object.assign(me, { busy: false, note: 'ماتسجلش: ' + ((e && e.message) || e), noteBad: true });
      if (st === me) drawChat();
    }
  }
  // one message: its photo / voice note / file from the bucket first, then the message (ar_chat_delete_message, owner only)
  async function removeMessage(id) {
    const me = st;
    if (!me || me.busy) return;
    const m = me.msgs.find((x) => String(x.id) === String(id));
    if (!m || !root.confirm(tr('تمسح الرسالة دي؟ مش هترجع.'))) return;
    me.busy = true; me.note = ''; drawChat();
    try {
      if (m.media) {
        const rm = await db().storage.from('ar-chat').remove([m.media]);
        if (rm && rm.error) throw new Error(rm.error.message || String(rm.error));
      }
      const { data, error } = await db().rpc('ar_chat_delete_message', { p_id: m.id });
      if (error) throw new Error(error.message || String(error));
      if (!data || !data.ok) throw new Error('ما اتمسحتش');
      me.msgs = me.msgs.filter((x) => x !== m);
      Object.assign(me, { busy: false, note: 'اتمسحت الرسالة.', noteBad: false });
    } catch (e) {
      Object.assign(me, { busy: false, note: 'ما اتمسحتش: ' + ((e && e.message) || e), noteBad: true });
    }
    if (st === me) drawChat();
  }
  function tick() {
    const panel = $('carePanel');
    if (!panel || panel.classList.contains('hidden') || document.visibilityState === 'hidden') return;
    loadChats();
    if (st) loadMsgs();
  }

  function bind() {
    const panel = $('carePanel');
    if (!panel) return;
    panel.addEventListener('click', (e) => {
      const f = e.target.closest('[data-chat-filter]');
      if (f) { filter = f.dataset.chatFilter; drawList(); return; }
      const row = e.target.closest('[data-chat]');
      if (row) { openChat(row.dataset.chat); return; }
      if (e.target.closest('[data-chat-back]')) { if (history.state && history.state.chatOpen) history.back(); else closeChat(); return; }
      if (e.target.closest('[data-chat-send]')) { send(); return; }
      if (e.target.closest('[data-chat-push]')) { turnPushOn(); return; }
      if (e.target.closest('[data-chat-del]')) { removeChat(); return; }
      const dm = e.target.closest('[data-chat-delmsg]');
      if (dm) { removeMessage(dm.dataset.chatDelmsg); return; }
      if (e.target.closest('[data-chat-sup]')) { openSup(); return; }
      if (e.target.closest('[data-chat-supno]')) { if (st) { st.sup = false; drawChat(); } return; }
      const sn = e.target.closest('[data-chat-supname]');
      if (sn) { makeSupplier(sn.dataset.chatSupname, null); return; }
      if (e.target.closest('[data-chat-supnew]')) {
        const n = (root.prompt(tr('اسم المخزن الجديد (واسم المندوب بين قوسين لو حابب):')) || '').trim();
        if (n) makeSupplier(null, n);
        return;
      }
      if (e.target.closest('[data-chat-statement]') && st && st.c.customer_id) {
        const id = st.c.customer_id;
        if (root.AskerApp && root.AskerApp.showTab) root.AskerApp.showTab('customers');
        if (root.AskerCustomers) root.AskerCustomers.load().then(() => root.AskerCustomers.statement(id));
      }
    });
    window.addEventListener('popstate', () => { if (st) closeChat(); });
  }
  root.AskerChat = {
    open() { loadChats(); if (!pushState) checkPush(); clearInterval(timer); timer = setInterval(tick, POLL_MS); },
    close() { clearInterval(timer); timer = null; },
    list: () => chats,
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})(typeof window === 'undefined' ? globalThis : window);
