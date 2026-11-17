/* The dose alarm's push worker (owner 2026-11-17, «⏰ منبه الدوا» stage 2). The server's push (function asker-dose, every minute for the phones that have a dose at that minute) carries NOTHING:
   the notification always says «ميعاد دواك» and a tap opens the customer's page (store.html#account), which rings and says the medicine's name from the names kept on the phone itself.
   Registered by store/alarm.js with scope store/dose/ (store/push-sw.js keeps its own scope for the messages' notifications, so the two never get mixed up). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
const PAGE = () => new URL('../../store.html#account', self.registration.scope).href;
self.addEventListener('push', (e) => {
  e.waitUntil(self.registration.showNotification('⏰ ميعاد دواك', {
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
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || PAGE();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (/\/store\.html/.test(c.url)) { if (c.navigate) c.navigate(url).catch(() => null); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});