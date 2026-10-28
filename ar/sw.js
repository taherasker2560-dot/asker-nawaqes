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
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = all.find((c) => c.url.includes('asker-nawaqes-arabic.html'));
    if (w) return w.focus();
    return self.clients.openWindow(new URL('../asker-nawaqes-arabic.html', self.registration.scope).href);
  })());
});
