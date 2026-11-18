/* The account-movement push worker (owner 2026-11-18, «🔔 تنبيه حركة الحساب»: «الإشعار يقول: فيه حركة جديدة على حسابك من غير مبالغ»). The server's push carries NOTHING (migration 202611182330, function
   asker-account-push): the notification always says «فيه حركة جديدة على حسابك», never an amount or a name, and a tap opens the customer's account page.
   Registered by store/acctpush.js with scope store/acct/ (the messages' and the dose alarm's workers keep their own scopes, so the three never get mixed up). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
const PAGE = () => new URL('../../store.html#account', self.registration.scope).href;
self.addEventListener('push', (e) => {
  e.waitUntil(self.registration.showNotification('صيدلية عسكر', {
    body: 'فيه حركة جديدة على حسابك، دوس عشان تشوفها',
    icon: '../../icons/arabic-192.png?v=logo2',
    badge: '../../icons/arabic-192.png?v=logo2',
    tag: 'asker-account',
    renotify: true,
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
