// ASKER trial bot (نواقص عربي) — Android share target only. Scope: /ar/ (V10 pages are never controlled).
// WhatsApp → «مشاركة» → «نواقص عربي»: Android POSTs the shared images/PDF/Excel/text to ar/share. This worker keeps
// them in a private cache on the phone and opens asker-nawaqes-arabic.html?share=<id>, which reads and matches them.
const CACHE = 'ar-share';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'POST' || !u.pathname.endsWith('/ar/share')) return;
  e.respondWith((async () => {
    const page = new URL('../asker-nawaqes-arabic.html', u);
    try {
      const form = await e.request.formData();
      const id = Date.now().toString(36);
      const files = form.getAll('files').filter((f) => f && typeof f === 'object' && f.size > 0).slice(0, 20);
      const text = ['title', 'text', 'url'].map((k) => form.get(k)).filter((v) => typeof v === 'string' && v.trim()).join('\n');
      const meta = { text, files: files.map((f, i) => ({ key: `ar-share/${id}/${i}`, name: f.name || `file-${i + 1}`, type: f.type || '' })) };
      const c = await caches.open(CACHE);
      for (let i = 0; i < files.length; i++) await c.put(new URL(meta.files[i].key, page).href, new Response(files[i], { headers: { 'content-type': files[i].type || 'application/octet-stream' } }));
      await c.put(new URL(`ar-share/${id}/meta`, page).href, new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }));
      page.searchParams.set('share', id);
    } catch (err) { page.searchParams.set('share', 'error'); }
    return Response.redirect(page.href, 303);
  })());
});
// «رسالة جديدة من عميل» (owner 2026-11-14: a notification when a customer writes on our messages page, even with the bot
// closed) and «وارد جديد من مخزن» (a warehouse sent its list from the link): the function asker-chat sends an empty push to
// the phones of the owner and staff; this worker asks it what the push was about (with its own push address) and says so.
const CHAT_FN = 'https://qwrzdjdgvanmhaicncuk.supabase.co/functions/v1/asker-chat';
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let n = { title: 'رسالة جديدة من عميل', body: 'عميل كتبلك في «خدمة العملاء ← الرسايل»', tab: 'care' };
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        const r = await fetch(CHAT_FN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'what', endpoint: sub.endpoint }), signal: AbortSignal.timeout(8000) });
        const d = r.ok ? await r.json() : null;
        if (d && d.title) n = d;
      }
    } catch (err) { /* the words above */ }
    return self.registration.showNotification(n.title, {
      body: n.body,
      icon: '../icons/arabic-192.png?v=logo2',
      badge: '../icons/arabic-192.png?v=logo2',
      tag: 'asker-' + (n.tab || 'news'), renotify: true, lang: 'ar', dir: 'rtl', vibrate: [200, 100, 200],
      data: { url: '../asker-nawaqes-arabic.html' + (n.tab ? '?tab=' + n.tab : '') },
    });
  })());
});
// a tap on a notification opens the bot; one from ar/notify.js (2026-11-12) carries the section to open (?tab=…)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const want = e.notification.data && e.notification.data.url ? new URL(e.notification.data.url, self.registration.scope) : null;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = all.find((c) => c.url.includes('asker-nawaqes-arabic.html'));
    // the page is not controlled by this worker (its scope is ar/), so it is told which section to open by a message
    if (w && want) { try { w.postMessage({ tab: want.searchParams.get('tab') || '' }); } catch (err) {} return w.focus(); }
    if (w) return w.focus();
    return self.clients.openWindow((want || new URL('../asker-nawaqes-arabic.html', self.registration.scope)).href);
  })());
});
