/* «قبل الموسم» (owner 2026-11-16, idea 6 of the three he picked): the items that sold much more than their normal month in the SAME coming
   30 days last year (and the year before), whose stock now is below what that season usually takes: ask for them before the season, not in it.
   Data: asker-private/seasonal/seasonal.json from the laptop (Hub\seasonal\BUILD_SEASONAL.ps1, read only on PharmaFly's copy, rebuilt at most every
   12 hours; owner only). A card at the top of «النواقص» and a row on the home (the ones that repeated in both years). Nothing is written from here. */
(function (root) {
  'use strict';
  const PATH = 'seasonal/seasonal.json';
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

  // ---------- pure helpers (also used by tests/season.cjs) ----------
  // the file must look like what the laptop writes; anything else is «no seasonal data»
  function parse(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.items)) return null;
    const items = o.items.filter((x) => x && x.i != null && x.n).map((x) => ({
      i: num(x.i), n: String(x.n), ex: num(x.ex), y1: num(x.y1), y2: num(x.y2), avg: num(x.avg), have: num(x.have), strong: !!x.strong,
    }));
    return { from: String(o.from || ''), to: String(o.to || ''), days: num(o.days) || 30, dataAt: String(o.data_at || ''), generatedAt: String(o.generated_at || ''), items };
  }
  // the items that repeated in both years (the home row counts these only)
  const strongCount = (d) => (d ? d.items.filter((x) => x.strong).length : 0);
  // «26» / «11.5»: one decimal at most, no trailing «.0»
  const fmt = (n) => { const v = Math.round(num(n) * 10) / 10; return String(v).replace(/\.0$/, ''); };
  // «2026-11-16» -> «16/11»
  const dm = (s) => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}` : ''; };
  // how many times its normal month the season takes (the expected over the normal month); 0 when it has no normal month
  const times = (x) => (x.avg > 0 ? Math.round((x.ex / x.avg) * 10) / 10 : 0);
  const api = { PATH, parse, strongCount, fmt, dm, times };
  root.AskerSeasonLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let data = null, loading = null, loadedAt = 0, arName = new Map();

  async function load(force) {
    if (!db()) return data;
    if (loading) return loading;
    if (data && !force && Date.now() - loadedAt < 30 * 60e3) return data;
    loading = (async () => {
      try {
        const { data: blob, error } = await db().storage.from('asker-private').download(PATH);
        if (error || !blob) { data = null; return data; }
        data = parse(JSON.parse(await blob.text()));
        loadedAt = Date.now();
        try {
          const rows = root.AskerStock ? await root.AskerStock.ensure() : [];
          arName = new Map((rows || []).filter((r) => String(r.arabic_name || '').trim()).map((r) => [Number(r.item_id), String(r.arabic_name).trim()]));
        } catch (e) { /* the English names stay */ }
      } catch (e) {
        data = null;
      } finally {
        loading = null;
        draw();
      }
      return data;
    })();
    return loading;
  }
  function row(x) {
    const ar = arName.get(x.i);
    const t = times(x);
    return `<div class="ni-row"><div class="ni-main"><b class="notr" dir="auto">${esc(ar || x.n)}</b>${ar ? `<small class="ni-meta notr" dir="ltr">${esc(x.n)}</small>` : ''}` +
      `<small class="ni-meta"><span>${esc(`السنة اللي فاتت بعت ${fmt(x.y1)} في الفترة دي (المعتاد في الشهر ${fmt(x.avg)})`)}</span>` +
      (x.y2 > 0 ? ` <span>${esc(`وقبلها بسنة بعت ${fmt(x.y2)}`)}</span>` : '') + '</small>' +
      `<small class="ni-meta"><b>${esc(`ورصيدك دلوقتي ${fmt(x.have)}`)}</b>${x.strong ? ' <span class="pill good">اتكرر سنتين</span>' : ''}${t >= 1.8 ? ` <span class="pill">${esc(`${fmt(t)}× المعتاد`)}</span>` : ''}</small></div></div>`;
  }
  function draw() {
    const box = $('seasonBox');
    if (!box) return;
    const d = data;
    box.classList.toggle('hidden', !d);
    if (!d) return;
    $('seasonCount').textContent = d.items.length ? String(d.items.length) : '';
    $('seasonWin').textContent = d.from && d.to ? `الفترة: ${dm(d.from)} ← ${dm(d.to)}` : '';
    $('seasonList').innerHTML = d.items.length ? d.items.map(row).join('') : '<p class="hint">مفيش أصناف موسمية رصيدها قليل دلوقتي ✅</p>';
  }
  // «محتاج شغل» on the home: its «قبل الموسم» row opens the card
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.todo-row[data-view="season"]');
    if (b && $('seasonBox')) $('seasonBox').open = true;
  }, true);
  root.AskerSeason = { load, data: () => data, count: () => strongCount(data), draw };
})(typeof window === 'undefined' ? globalThis : window);
