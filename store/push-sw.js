/* The store's push worker (owner 2026-11-13: «إشعار على موبايله» when the pharmacy answers in «الرسايل», store/chat.js).
   The push carries nothing (no customer text leaves our server through the push service): the notification always says
   «ردينا عليك» and a tap opens the messages page. Registered by store/chat.js with scope store/. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  e.waitUntil(self.registration.showNotification('صيدلية عسكر', {
    body: 'ردينا عليك، دوس عشان تشوف الرد',
    icon: '../icons/arabic-192.png?v=logo2',
    badge: '../icons/arabic-192.png?v=logo2',
    tag: 'asker-chat',
    renotify: true,
    lang: 'ar',
    dir: 'rtl',
    data: { url: new URL('../store.html#chat', self.registration.scope).href },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || new URL('../store.html#chat', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (/\/store\.html/.test(c.url)) { if (c.navigate) c.navigate(url).catch(() => null); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
