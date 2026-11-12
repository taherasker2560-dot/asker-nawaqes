/* «رابط الموقع» inside the bot (المبيعات ← الموقع), owner 2026-11-12: «تحطلى رابط الموقع جوة البوت».
   Open the store, send its link on WhatsApp (the owner picks the chat and sends it himself), copy it, or make a QR card
   to print for the counter. Reads nothing from the database and sends nothing by itself. */
(function (root) {
  'use strict';
  const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  // the store page sits next to the bot page (same GitHub Pages folder)
  function storeUrl(href) {
    return new URL('store.html', String(href || '')).href.replace(/[?#].*$/, '');
  }
  function shareMessage(url) {
    return `اطلب من صيدلية عسكر أونلاين وهنوصّلك لحد البيت 🏠\nدوّر على الدوا، ضيفه للسلة، أو صوّر الروشتة وابعتها:\n${url}`;
  }
  const api = { storeUrl, shareMessage };
  root.AskerStoreLink = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  const $ = (id) => document.getElementById(id);
  if (!$('storeLink')) return;
  const url = storeUrl(location.href);
  $('slUrl').textContent = url.replace(/^https?:\/\//, '');
  const say = (t, cls) => { $('slStatus').textContent = t || ''; $('slStatus').className = 'status' + (cls ? ' ' + cls : ''); };

  // same tab, marked as coming from the bot: the store then shows «البوت» to come back here (store/from-bot.js)
  $('slOpen').addEventListener('click', () => { location.href = url + '?from=bot'; });
  $('slWa').addEventListener('click', () => window.open('https://wa.me/?text=' + encodeURIComponent(shareMessage(url)), '_blank', 'noopener'));
  $('slCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); say('اتنسخ ✓ الصقه في أي رسالة', 'good'); }
    catch (e) { say('مقدرتش أنسخ. دوس مطوّل على الرابط وانسخه', 'bad'); }
  });

  let libLoading = null;
  function loadLib() {
    if (root.qrcode) return Promise.resolve();
    if (!libLoading) libLoading = new Promise((ok, bad) => {
      const s = document.createElement('script');
      s.src = QR_LIB; s.onload = ok; s.onerror = () => { libLoading = null; bad(new Error('lib')); };
      document.head.append(s);
    });
    return libLoading;
  }
  function loadImg(src) {
    return new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
  }
  // a card to print: the code (high error correction, so the logo in the middle is fine), the name and a short line
  async function makeCard() {
    const q = root.qrcode(0, 'H');
    q.addData(url); q.make();
    const n = q.getModuleCount(), W = 720, pad = 60, cell = Math.floor((W - 2 * pad) / n), size = cell * n, x0 = (W - size) / 2, H = W + 150;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0a2f6b';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(x0 + k * cell, pad + r * cell, cell, cell);
    const logo = await loadImg('icons/arabic-192.png?v=logo2');
    if (logo) {
      const L = Math.round(size * 0.22), lx = W / 2, ly = pad + size / 2;
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(lx, ly, L / 2 + 8, 0, Math.PI * 2); g.fill();
      g.save(); g.beginPath(); g.arc(lx, ly, L / 2, 0, Math.PI * 2); g.clip(); g.drawImage(logo, lx - L / 2, ly - L / 2, L, L); g.restore();
    }
    g.textAlign = 'center'; g.direction = 'rtl';
    g.fillStyle = '#0a4aa6'; g.font = '700 46px "IBM Plex Sans Arabic", Tahoma, sans-serif';
    g.fillText('صيدلية عسكر', W / 2, pad + size + 70);
    g.fillStyle = '#374151'; g.font = '500 28px "IBM Plex Sans Arabic", Tahoma, sans-serif';
    g.fillText('صوّر الكود واطلب أونلاين · التوصيل لحد البيت', W / 2, pad + size + 118);
    return c.toDataURL('image/png');
  }
  $('slQr').addEventListener('click', async () => {
    if (!$('slQrBox').classList.contains('hidden')) { $('slQrBox').classList.add('hidden'); return; }
    say('بيعمل الكود…');
    try {
      await loadLib();
      const png = await makeCard();
      $('slQrImg').src = png;
      $('slQrSave').href = png;
      $('slQrBox').classList.remove('hidden');
      say('صوّر الكود بموبايل تاني وجرّبه، وبعدين حمّله واطبعه', 'good');
    } catch (e) {
      say('الكود ماتعملش. اتأكد من النت وجرب تاني', 'bad');
    }
  });
})(typeof window === 'undefined' ? globalThis : window);
