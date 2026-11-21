// The airy look has NO big solid color block (owner 2026-11-19 night: «حاسس انه خنيق، مكلكح ومرزق» about solid blocks of color; «كل تفاصيل الشغل … أي عرض فيه يظهر بالمنظر ده»):
// every screen of the system (each section and tab, the customers' statement with data) and of the store (home, search, cart, orders, chat, the customer's account) is scanned for a
// big element that is not a button, a link or a field and has a solid medium/dark saturated background. Buttons, small badges and the night look are not part of the rule.
// Made-up customers and items only: the repository is public.
const { run, assert } = require('./harness.cjs');
const pad = (n) => String(n).padStart(2, '0');
const at = (d, h, m) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00`;
const today = new Date();
const CUSTOMERS = [{ id: 101, name: 'أحمد محمود', credit_limit: 5000, balance: 7174.5, last_at: at(today, 11, 0), last_kind: 'sale', moves: 2 }];
const MOVES = [
  { id: 11, customer_id: 101, at: at(today, 9, 0), kind: 'sale', total: 166.7, paid: 0, balance: 6966.7, items: [{ n: 'PANADOL EXTRA 24 TAB', p: 1, u: 0, k: 1, s: 66.7, d: 0 }] },
  { id: 13, customer_id: 101, at: at(today, 11, 0), kind: 'sale', total: 207.8, paid: 0, balance: 7174.5, items: [{ n: 'OMEZ 40 20 CAP', p: 1, u: 0, k: 1, s: 207.8, d: 0 }] },
];
const ITEMS = [
  { id: 1060, name: 'PANADOL EXTRA 24 TAB', arabic_name: 'بانادول إكسترا', status: 'available', price: 66.7, cat: 'pain_fever', needs_rx: false, is_listed: true, popular_rank: 1 },
  { id: 24564, name: 'HERO BABY 2 MILK', arabic_name: 'هيرو بيبي ٢ لبن', status: 'available', price: 284, cat: 'baby', needs_rx: false, is_listed: true, popular_rank: 2 },
];
const TOK = 'd'.repeat(64);
const SCAN = () => {
  const out = [];
  const px = (s) => { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d', { willReadFrequently: true }); x.clearRect(0, 0, 1, 1); x.fillStyle = '#000'; x.fillStyle = s; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
  const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
  for (const e of document.querySelectorAll('body *')) {
    if (/^(INPUT|SELECT|TEXTAREA|IMG|svg|path|I|B|SMALL)$/i.test(e.tagName)) continue;
    // the header and the bottom bar are colored on purpose (owner 2026-11-21: «الهيدر ونافيجيشن بار بلون التطبيق الأساسي»)
    if (e.closest('.appbar, .top, .bar, .sp-head, .tabbar, .bottomnav')) continue;
    const r = e.getBoundingClientRect(); if (r.width * r.height < 9000 || r.width < 60) continue;
    // a small button / link / label keeps its solid color (the color only in small touches); a BIG one (full width: 200 px or more) is soft like the home's tiles
    if (/^(BUTTON|A|LABEL|SPAN)$/i.test(e.tagName) && r.width < 200) continue;
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const layers = [cs.backgroundColor];
    for (const m of (cs.backgroundImage || '').matchAll(/(rgba?\([^)]*\)|color\([^)]*\))/g)) layers.push(m[1]);
    for (const l of layers) {
      const [R, G, B, A] = px(l); if (A < 200) continue;
      const [h, s, li] = hsl(R, G, B);
      if (s >= 0.3 && li <= 0.62 && li >= 0.12) { out.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).split(' ').slice(0, 2).join('.')} ${Math.round(r.width)}x${Math.round(r.height)} rgb(${R},${G},${B})`); break; }
    }
  }
  return [...new Set(out)].slice(0, 12);
};
run('airy look: no screen of the system or the store has a big solid color block', async ({ page, base }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.evaluate(([c, m, i, t]) => localStorage.setItem('__fakeTables', JSON.stringify({ ar_customers: c, ar_customer_moves: m, ar_customer_phones: [], ar_customer_links: [{ customer_id: 101, token: t }], ar_customer_stops: [], ar_store_orders: [], ar_store_items: i, ar_store_edits: [] })), [CUSTOMERS, MOVES, ITEMS, TOK]);
  await page.reload(); await page.waitForFunction(() => window.__tables && /\d/.test(document.getElementById('shStats')?.textContent || ''));
  await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
  const report = [];
  const groups = await page.$$eval('.bottomnav [data-group]', (b) => b.map((x) => x.dataset.group));
  for (const g of groups) {
    await page.click(`.bottomnav [data-group="${g}"]`); await page.waitForTimeout(250);
    const tabs = await page.$$eval(`.subbar[data-for="${g}"] [data-tab]`, (b) => b.map((x) => x.dataset.tab)).catch(() => []);
    const list = tabs.length ? tabs : [''];
    for (const t of list) {
      if (t) { await page.evaluate(([g, t]) => document.querySelector(`.subbar[data-for="${g}"] [data-tab="${t}"]`)?.click(), [g, t]); await page.waitForTimeout(350); }
      const f = await page.evaluate(SCAN); if (f.length) report.push(`SYSTEM ${g}/${t}: ${f.join(' | ')}`);
    }
  }
  // the customers' statement (data) + site users
  await page.click('.bottomnav [data-group="accounts"]'); await page.evaluate(() => document.querySelector('.subbar[data-for="accounts"] [data-tab="customers"]')?.click()); await page.waitForTimeout(400);
  const row = await page.$('#cuRows [data-cu="101"]'); if (row) { await row.click(); await page.waitForTimeout(500); const f = await page.evaluate(SCAN); report.push(`SYSTEM customer statement: ${f.join(' | ') || 'clean'}`); }
  // the store
  const views = ['', '#search', '#cart', '#orders', '#chat', '#me=' + TOK];
  for (const v of views) {
    await page.goto('about:blank'); await page.goto(base + 'store.html' + v); await page.waitForTimeout(1500);
    await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
    const f = await page.evaluate(SCAN); report.push(`STORE ${v || 'home'}: ${f.join(' | ') || 'clean'}`);
  }
  assert.deepEqual(report.filter((l) => !/clean$/.test(l)), [], 'big solid color blocks left:\n' + report.join('\n'));
}, { home: true });
