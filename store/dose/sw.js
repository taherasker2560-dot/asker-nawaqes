/* The dose alarm's push worker (owner 2026-11-17, «⏰ منبه الدوا» stage 2). The server's push (function asker-dose, every minute for the phones that have a dose at that minute) carries NOTHING:
   the notification always says «ميعاد دواك» and a tap opens the customer's page (store.html#account), which rings and says the medicine's name from the names kept on the phone itself.
   Registered by store/alarm.js with scope store/dose/ (store/push-sw.js keeps its own scope for the messages' notifications, so the two never get mixed up). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
const PAGE = () => new URL('../../store.html#account', self.registration.scope).href;
// ---- the medicine's name in the notification (owner 2026-11-18: «من غير ما يكون الابليكيشن مفتوح»; then «أمشي عليه» to the way that needs no second program) ----
// The server's push is still EMPTY. The page keeps the enabled alarms (the name as it is said, and the times on THIS phone's clock) in IndexedDB; at the push the worker reads them, finds the ones whose time is now
// (the push comes at the minute; up to 3 minutes late is still the same dose) and writes the name on the notification: «⏰ ميعاد فيموجيسال الآن». The names never leave the phone. Nothing found = the plain «ميعاد دواك».
const IDB = 'asker-dose', STORE = 'kv', KEY = 'alarms', LATE = 3;
function readAlarms() {
  return new Promise((ok) => {
    try {
      const r = self.indexedDB.open(IDB, 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore(STORE); } catch (err) { /* made already */ } };
      r.onerror = () => ok([]);
      r.onsuccess = () => {
        try {
          const g = r.result.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
          g.onsuccess = () => { try { r.result.close(); } catch (err) { /* closed */ } ok(g.result && Array.isArray(g.result.items) ? g.result.items : []); };
          g.onerror = () => ok([]);
        } catch (err) { ok([]); }
      };
    } catch (err) { ok([]); }
  });
}
const minutesOf = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
async function dueNames(now) {
  const list = await readAlarms(), nowMin = now.getHours() * 60 + now.getMinutes(), out = [];
  for (const a of list) {
    if (!a || !a.spoken || !Array.isArray(a.times)) continue;
    if (a.times.some((t) => { const m = minutesOf(t); return m != null && nowMin - m >= 0 && nowMin - m <= LATE; })) out.push(String(a.spoken).replace(/\s+/g, ' ').trim().slice(0, 60));
  }
  return [...new Set(out.filter(Boolean))].slice(0, 4);
}
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
  const names = await dueNames(new Date());
  await self.registration.showNotification(names.length ? `⏰ ميعاد ${names.join('، و')} الآن` : '⏰ ميعاد دواك', {
    body: names.length ? 'خدمة مقدمة من صيدلية عسكر. دوس عشان تسمع الاسم وتاخده' : 'دوس عشان تسمع اسم الدوا وتاخده',
    icon: '../../icons/arabic-192.png?v=logo2',
    badge: '../../icons/arabic-192.png?v=logo2',
    tag: 'asker-dose',
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 150, 300, 150, 300],
    lang: 'ar',
    dir: 'rtl',
    data: { url: PAGE() },
  });
  // the app is alive in the background: tell it, so it rings and speaks at once without waiting for a tap on the notification
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of list) { try { c.postMessage({ type: 'dose-due' }); } catch (err) { /* a closed window */ } }
  })());
});
// a tap on the notification: the page is told it was opened FROM a dose notification, so it rings and asks for the first tap (a page nobody touched may not speak; a hidden page never «used up» the alarm).
// An open page gets a message (no reload: a reload threw its ring away); a new window gets ?dose=1 (?dose=test for the «جرّب الإشعار» one, which rings a made-up «تجربة المنبه»).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = e.notification.data || {}, kind = d.kind === 'test' ? 'test' : 'dose';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (/\/store\.html/.test(c.url)) { try { c.postMessage({ type: 'dose-open', kind }); } catch (err) { /* a closed window */ } return c.focus(); }
    }
    const u = new URL(d.url || PAGE());
    u.searchParams.set('dose', kind === 'test' ? 'test' : '1');
    return self.clients.openWindow(u.href);
  }));
});