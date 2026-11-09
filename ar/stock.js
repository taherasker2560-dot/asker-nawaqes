/* «المخزون» (asker-nawaqes-arabic.html): the pharmacy's actual stock, to answer a customer quickly (owner's request
   2026-11-09 «رصيد الصيدلية الفعلي، عبوات ووحدات بس»; layout (أ): one search box and one card per item).
   Table ar_stock (migration 202611092230, owner only), filled by the laptop's hub every 2 hours from PharmaFly:
   packs/units = the main store; `other` = the same item in other stores (the «انتظار» stores), shown apart because the
   owner has not decided yet whether they count. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/stock.cjs) ----------
  const num = (x) => {
    const n = Number(x);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  };
  // Arabic counting with western digits: 1 علبة، 3 علب، 11 علبة
  const word = (n, one, few) => (n >= 3 && n <= 10 ? few : one);
  function qtyText(packs, units, parts) {
    const p = num(packs), u = num(units), split = Number(parts) > 1;
    const bits = [];
    if (p) bits.push(`${p} ${word(p, 'علبة', 'علب')}`);
    if (u && split) bits.push(`${u} ${word(u, 'وحدة', 'وحدات')}`);
    else if (u && !p) bits.push(`${u} ${word(u, 'علبة', 'علب')}`);
    return bits.length ? bits.join(' + ') : 'مفيش';
  }
  function expText(d) {
    const m = String(d || '').match(/^(\d{4})-(\d{2})-\d{2}/);
    return m ? `أقرب صلاحية ${m[2]}/${m[1]}` : 'من غير صلاحية متسجّلة';
  }
  // the same item in the other stores: «+ 2 علبة في مخزن انتظار ابن سينا»
  function otherText(other, parts) {
    if (!Array.isArray(other)) return [];
    return other
      .filter((o) => o && (num(o.packs) || num(o.units)))
      .map((o) => `+ ${qtyText(o.packs, o.units, parts)} في ${String(o.store || 'مخزن تاني').slice(0, 60)}`);
  }
  // "2026-11-09 20:00:00" -> «آخر رصيد: النهارده 8:00 م» (the time of the data, not of the upload)
  function ageText(dataAt, now) {
    const m = String(dataAt || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return '';
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]), n = now || new Date();
    const h = d.getHours() % 12 || 12, t = `${h}:${m[5]} ${d.getHours() < 12 ? 'ص' : 'م'}`;
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(n) - day(d)) / 864e5);
    return 'آخر رصيد: ' + (diff === 0 ? 'النهارده ' : diff === 1 ? 'امبارح ' : `${m[3]}/${m[2]} `) + t;
  }
  function search(q, rows, limit) {
    const F = root.AskerFuzzy;
    if (!F) return [];
    return F.rank(q, rows, (it) => [F.fold(it.arabic_name), F.fold(it.name)], limit || 30);
  }
  const api = { qtyText, expText, otherText, ageText, search };
  root.AskerStockLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the place ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const FRESH_MS = 10 * 60 * 1000;
  let rows = [], loadedAt = 0, loading = null;

  function say(text, kind) {
    const el = $('stStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  // all rows, 1000 at a time (the server's page size)
  async function load() {
    const out = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await db().from('ar_stock').select('item_id,name,arabic_name,price,packs,units,parts,exp_near,other,data_at').order('item_id').range(from, from + 999);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }
  function card(it) {
    const ar = String(it.arabic_name || '').trim();
    const others = otherText(it.other, it.parts).map((t) => `<div class="st-other">${esc(t)}</div>`).join('');
    return `<div class="st-item">
      <strong>${esc(ar || it.name)}</strong>
      ${ar ? `<div class="st-en" dir="ltr">${esc(it.name)}</div>` : ''}
      <div class="st-qty">${esc(qtyText(it.packs, it.units, it.parts))}</div>
      ${others}
      <div class="hint">${esc(expText(it.exp_near))}${num(it.price) ? ' · ' + esc(num(it.price)) + ' ج' : ''}</div>
    </div>`;
  }
  function draw() {
    const q = $('stQ').value.trim();
    if (!rows.length) { $('stItems').innerHTML = ''; return; }
    if (q.length < 2) {
      $('stItems').innerHTML = '';
      return say(`${rows.length} صنف عليهم رصيد. اكتب حرفين من اسم الصنف.`);
    }
    const hits = search(q, rows, 30);
    say(hits.length ? '' : 'مفيش صنف عليه رصيد بالاسم ده');
    $('stItems').innerHTML = hits.map(card).join('');
  }
  async function open(force) {
    if (!db() || !$('stockPanel')) return;
    if (!force && rows.length && Date.now() - loadedAt < FRESH_MS) return draw();
    if (loading) return loading;
    say('بيحمّل الرصيد…');
    loading = (async () => {
      try {
        rows = await load();
        loadedAt = Date.now();
        const newest = rows.reduce((a, r) => (String(r.data_at || '') > a ? String(r.data_at) : a), '');
        $('stAge').textContent = ageText(newest);
        draw();
      } catch (e) {
        rows = [];
        const missing = /ar_stock|relation|schema cache|does not exist/i.test(String(e && e.message));
        say(missing ? 'الرصيد لسه مش متاح: محتاج تفعيل على السيرفر الأول.' : 'مقدرتش أجيب الرصيد: ' + (e && e.message), 'bad');
      } finally { loading = null; }
    })();
    return loading;
  }
  $('stQ')?.addEventListener('input', draw);
  root.AskerStock = { open };
})(typeof window === 'undefined' ? globalThis : window);
