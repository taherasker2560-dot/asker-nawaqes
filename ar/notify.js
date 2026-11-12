/* «لما يكون قسم محتاج شغل يظهر إشعار ونخصصله صوت زي أصوات الواتس» (owner 2026-11-12).
   Every minute while the bot is open (and when it comes back to the front) it counts what needs work:
     الوارد (new messages from the warehouses), الفواتير (photos waiting), طلبات الموقع (new orders), الصلاحيات (today's
     mix-ups from sales, sold with no stock, sold expired: from the alerts file), العملاء (customers above their limit).
   Then: a red number on the section in the bottom bar and on its small tab, the «محتاج شغل» card on «الرئيسية», and when a
   number goes UP: a phone notification (tap = opens that section) and the section's own sound. The sounds are made here
   (no files): «واتس» (a soft pop), «دينج», «جرس», «نقرتين», «تنبيه», or none; chosen per section in ⚙️ and kept on the phone.
   Limits (Android/Chrome, not ours): with the bot closed nothing runs (the phone's Tasker voice still does), and the sound of
   the phone notification itself is the one set for the app in the phone's settings; our sound plays with the bot open. */
(function (root) {
  'use strict';
  // ---------- the sounds (pure data, also used by tests) ----------
  // each note: [frequency Hz, start s, length s, volume 0..1, wave]
  const SOUNDS = {
    pop: { name: 'واتس', notes: [[880, 0, 0.07, 0.5, 'sine'], [1320, 0.05, 0.09, 0.35, 'sine']] },
    ding: { name: 'دينج', notes: [[1046, 0, 0.5, 0.45, 'triangle']] },
    bell: { name: 'جرس', notes: [[784, 0, 0.6, 0.4, 'sine'], [1175, 0, 0.6, 0.2, 'sine'], [1568, 0.02, 0.45, 0.1, 'sine']] },
    double: { name: 'نقرتين', notes: [[988, 0, 0.09, 0.45, 'square'], [988, 0.16, 0.09, 0.45, 'square']] },
    alert: { name: 'تنبيه', notes: [[660, 0, 0.12, 0.45, 'sawtooth'], [880, 0.15, 0.12, 0.45, 'sawtooth'], [660, 0.3, 0.12, 0.45, 'sawtooth']] },
    none: { name: 'من غير صوت', notes: [] },
  };
  // the sections that can ask for work, their tab, the default sound, and the notification's words
  const KINDS = [
    { key: 'incoming', group: 'purchases', tab: 'read', sound: 'pop', title: 'وارد جديد من المخازن', body: (n) => `${n} جديد في الوارد` },
    { key: 'docs', group: 'purchases', tab: 'docs', sound: 'ding', title: 'فاتورة جديدة مستنية', body: (n) => `${n} صورة مستنية في الفواتير` },
    { key: 'expiry', group: 'purchases', tab: 'expiry', sound: 'double', title: 'صلاحيات محتاجة شغل', body: (n) => `${n} صنف النهارده: صلاحيات اتلخبطت من البيع أو بيع بالسالب` },
    { key: 'customers', group: 'accounts', tab: 'customers', sound: 'alert', title: 'عميل عدّى الحد', body: (n) => `${n} عميل عدّوا حدهم` },
    { key: 'store', group: 'sales', tab: 'storeorders', sound: 'bell', title: 'طلب جديد من الموقع', body: (n) => `${n} طلب جديد من الموقع` },
  ];
  // which numbers went up since the last time they were seen (the first time only remembers, it does not ring)
  function rises(prev, now) {
    const out = [];
    for (const k of Object.keys(now)) {
      const a = prev && prev[k], b = now[k];
      if (a == null) continue;
      if (b > a) out.push(k);
    }
    return out;
  }
  // per bottom-bar section: the sum of its kinds
  function groupCounts(counts) {
    const g = {};
    for (const k of KINDS) g[k.group] = (g[k.group] || 0) + (counts[k.key] || 0);
    return g;
  }
  const api = { SOUNDS, KINDS, rises, groupCounts };
  root.AskerNotifyLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const SEEN = 'asker-notify-seen', PICK = 'asker-notify-sounds', ON = 'asker-notify-on';
  const LABEL = { incoming: 'الوارد', docs: 'الفواتير', expiry: 'الصلاحيات', customers: 'العملاء', store: 'طلبات الموقع' };
  let counts = {}, timer = null, ctx = null, busy = false;

  const picks = () => { try { return JSON.parse(read(PICK, '{}')) || {}; } catch (e) { return {}; } };
  const soundOf = (key) => { const p = picks()[key]; return SOUNDS[p] ? p : (KINDS.find((k) => k.key === key) || {}).sound || 'pop'; };
  // the browser lets a page make sound only after a tap: the first tap anywhere opens the sound
  function audio() {
    try {
      if (!ctx) { const A = root.AudioContext || root.webkitAudioContext; if (!A) return null; ctx = new A(); }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }
  function play(id) {
    const s = SOUNDS[id];
    const c = s && s.notes.length ? audio() : null;
    if (!c) return false;
    const t0 = c.currentTime + 0.02;
    for (const [f, at, len, vol, wave] of s.notes) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = wave; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      o.connect(g); g.connect(c.destination);
      o.start(t0 + at); o.stop(t0 + at + len + 0.05);
    }
    return true;
  }
  async function count(q) {
    try { const { data, error } = await q.limit(500); return error ? null : (data || []).length; } catch (e) { return null; }
  }
  // the incoming: the number the bot itself already shows on «الوارد ← النهارده» (companies with something new); it is
  // read by ar/app.js when the bot opens (read once: tests/e2e/fast-load), and asked again here once a minute after that.
  // Empty = not loaded yet (unknown: it neither rings nor is remembered).
  const incomingNow = () => { const b = $('subBadge'); const t = b ? b.textContent.trim() : ''; return t === '' ? undefined : Number(t) || 0; };
  let ticks = 0;
  async function measure() {
    const c = db();
    if (!c) return null;
    if (ticks++ > 0 && $('inboxRefresh')) { $('inboxRefresh').click(); await new Promise((r) => setTimeout(r, 1200)); }
    const [docs, store] = await Promise.all([
      count(c.from('ar_documents').select('id').eq('status', 'new')),
      count(c.from('ar_store_orders').select('id').eq('status', 'new')),
    ]);
    const a = root.AskerAlerts && root.AskerAlerts.data();
    const today = (l) => (l || []).filter((x) => Number(x.today) > 0).length;
    const out = {};
    const inc = incomingNow();
    if (inc !== undefined) out.incoming = inc;
    if (docs != null) out.docs = docs;
    if (store != null) out.store = store;
    if (a) { out.expiry = today(a.mix) + today(a.negative) + today(a.expiredSold); out.customers = a.customers.over.length; }
    return out;
  }
  // the red numbers: bottom bar sections and their small tabs
  function drawBadges() {
    const g = groupCounts(counts);
    document.querySelectorAll('.bottomnav [data-group]').forEach((b) => {
      const n = g[b.dataset.group] || 0;
      if (n) b.dataset.badge = n > 99 ? '99+' : String(n); else delete b.dataset.badge;
    });
    for (const k of KINDS) {
      const chip = document.querySelector(`.subbar [data-tab="${k.tab}"]`);
      if (!chip) continue;
      const n = counts[k.key] || 0;
      if (n) chip.dataset.badge = n > 99 ? '99+' : String(n); else delete chip.dataset.badge;
    }
  }
  // «محتاج شغل» on «الرئيسية»
  function drawTodo() {
    const box = $('todoList');
    if (!box) return;
    const rows = [];
    if (counts.incoming) rows.push({ tab: 'read', n: counts.incoming, text: 'جديد في الوارد' });
    if (counts.docs) rows.push({ tab: 'docs', n: counts.docs, text: 'صورة مستنية في الفواتير' });
    if (counts.store) rows.push({ tab: 'storeorders', n: counts.store, text: 'طلب جديد من الموقع' });
    for (const t of (root.AskerAlerts && root.AskerAlerts.todo()) || []) rows.push(t);
    $('todoCard')?.classList.toggle('hidden', !rows.length);
    box.innerHTML = rows.map((r) => `<button type="button" class="todo-row" data-go="${esc(r.tab)}"${r.view ? ` data-view="${esc(r.view)}"` : ''}><b>${esc(r.n)}</b><span>${esc(r.text)}</span></button>`).join('');
  }
  async function notify(key) {
    const k = KINDS.find((x) => x.key === key);
    if (!k || read(ON, '1') !== '1') return;
    play(soundOf(key));
    try {
      if (!('Notification' in root) || Notification.permission !== 'granted' || !navigator.serviceWorker) return;
      const reg = (await navigator.serviceWorker.getRegistration('ar/')) || (await navigator.serviceWorker.register('ar/sw.js', { scope: 'ar/' }));
      await reg.showNotification(k.title, {
        body: k.body(counts[key]), icon: 'icons/arabic-192.png?v=logo2', badge: 'icons/arabic-192.png?v=logo2',
        tag: 'asker-' + key, renotify: true, data: { url: '../asker-nawaqes-arabic.html?tab=' + k.tab },
      });
    } catch (e) {}
  }
  async function tick() {
    if (busy || $('app')?.classList.contains('hidden')) return;
    busy = true;
    try {
      if (root.AskerAlerts) await root.AskerAlerts.load(false);
      const now = await measure();
      if (!now) return;
      counts = { ...counts, ...now };
      let seen = {};
      try { seen = JSON.parse(read(SEEN, '{}')) || {}; } catch (e) {}
      const up = rises(seen, now);
      write(SEEN, JSON.stringify({ ...seen, ...now })); // what is still unknown keeps its last seen number
      drawBadges(); drawTodo();
      for (const key of up) await notify(key);
    } finally { busy = false; }
  }
  // ---------- ⚙️: notifications on/off, the permission, a sound per section ----------
  function drawSettings() {
    const box = $('notifySounds');
    if (!box) return;
    const on = read(ON, '1') === '1';
    if ($('notifyOn')) $('notifyOn').checked = on;
    const perm = 'Notification' in root ? Notification.permission : 'unsupported';
    if ($('notifyPerm')) {
      $('notifyPerm').classList.toggle('hidden', perm !== 'default');
      $('notifyPermNote').textContent = perm === 'granted' ? 'إشعارات الموبايل شغالة.' : perm === 'denied' ? 'الموبايل قافل الإشعارات للبوت: افتحها من إعدادات الموبايل ← التطبيقات ← البوت ← الإشعارات.' : perm === 'unsupported' ? 'الموبايل ده مابيدعمش إشعارات البوت.' : '';
    }
    box.innerHTML = KINDS.map((k) => `<label class="ns-row"><span>${esc(LABEL[k.key])}</span><select data-sound="${esc(k.key)}">${Object.keys(SOUNDS).map((s) => `<option value="${s}"${s === soundOf(k.key) ? ' selected' : ''}>${esc(SOUNDS[s].name)}</option>`).join('')}</select><button type="button" class="small secondary" data-try="${esc(k.key)}" aria-label="جرّب الصوت">▶</button></label>`).join('');
  }
  function bind() {
    // the first tap opens the sound (a browser rule)
    document.addEventListener('pointerdown', () => audio(), { once: true, capture: true });
    $('notifySounds')?.addEventListener('change', (e) => {
      const s = e.target.closest('[data-sound]');
      if (!s) return;
      const p = picks(); p[s.dataset.sound] = s.value; write(PICK, JSON.stringify(p));
      play(s.value);
    });
    $('notifySounds')?.addEventListener('click', (e) => { const b = e.target.closest('[data-try]'); if (b) play(soundOf(b.dataset.try)); });
    $('notifyOn')?.addEventListener('change', (e) => write(ON, e.target.checked ? '1' : '0'));
    $('notifyPerm')?.addEventListener('click', async () => { try { await Notification.requestPermission(); } catch (e) {} drawSettings(); });
    $('settingsBtn')?.addEventListener('click', () => setTimeout(drawSettings, 0));
    // a home row opens its view of «الصلاحيات»
    document.addEventListener('click', (e) => { const r = e.target.closest('.todo-row[data-view]'); if (r) setTimeout(() => root.AskerAlerts?.show(r.dataset.view), 0); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    // the app shows after the sign-in: start then
    const app = $('app');
    if (app) new MutationObserver(() => { if (!app.classList.contains('hidden')) tick(); }).observe(app, { attributes: true, attributeFilter: ['class'] });
    timer = setInterval(tick, 60e3);
    // a tap on a notification while the bot is open: the worker says which section
    try { navigator.serviceWorker?.addEventListener('message', (e) => { const t = e.data && e.data.tab; if (t && /^[a-z]+$/.test(t)) root.AskerApp?.showTab?.(t); }); } catch (e) {}
    // opened from a notification: ?tab=…
    const tab = new URLSearchParams(location.search).get('tab');
    if (tab && /^[a-z]+$/.test(tab)) setTimeout(() => { root.AskerApp?.showTab?.(tab); history.replaceState(null, '', location.pathname); }, 600);
    drawSettings();
    tick();
  }
  root.AskerNotify = { tick, refresh: () => { drawBadges(); drawTodo(); }, play, counts: () => counts };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(typeof window === 'undefined' ? globalThis : window);
