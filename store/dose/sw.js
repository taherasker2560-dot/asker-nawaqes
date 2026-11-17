/* The dose alarm's push worker (owner 2026-11-17, «⏰ منبه الدوا» stage 2). The server's push (function asker-dose, every minute for the phones that have a dose at that minute) carries NOTHING:
   the notification always says «ميعاد دواك» and a tap opens the customer's page (store.html#account), which rings and says the medicine's name from the names kept on the phone itself.
   Registered by store/alarm.js with scope store/dose/ (store/push-sw.js keeps its own scope for the messages' notifications, so the two never get mixed up). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
const PAGE = () => new URL('../../store.html#account', self.registration.scope).href;
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
  await self.registration.showNotification('⏰ ميعاد دواك', {
    body: 'دوس عشان تسمع اسم الدوا وتاخده',
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