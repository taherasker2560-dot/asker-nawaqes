/* «↩️ المرتجعات» (owner 2026-11-16, about the gap with a warehouse: «الفرق ده مرتجعات عندى لسه ما راحتش الشركه … نظام كشف مرتجعات بارقام الفواتير لكل شركه من يوم
   متجيله صورة اشعار المرتجعات الملون المكتوب بالايد»): the returns booked in PharmaFly, per company and per invoice number, and whether the company's colored return notice
   (the photo that arrives in the documents group) has come for each one. «لسه ما راحتش» = booked, no notice yet; «راحت» = the notice names the same invoice number and amount.
   Returns older than the company's first notice photo (minus 3 days) are only counted: nobody can say about them.
   Data: asker-private/returns/returns.json from the laptop (Hub\returns\BUILD_RETURNS.ps1, read only; owner only), drawn at the top of «الحسابات ← الموردين» (#rtBox) and as a
   home row. «انسخ الكشف» copies a statement of the pending ones to send to the company by hand. Nothing is written or sent from here. */
(function (root) {
  'use strict';
  const PATH = 'returns/returns.json';
  const OLD_HOURS = 72;
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

  // ---------- pure helpers (also used by tests/returns.cjs) ----------
  const bucket = (b) => ({ n: num(b && b.n), amount: num(b && b.amount) });
  // the file must look like what the laptop writes; anything else is «no data»
  function parse(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.vendors)) return null;
    const vendors = o.vendors.filter((v) => v && v.id != null && v.name && Array.isArray(v.returns)).map((v) => ({
      id: num(v.id), name: String(v.name), trackedFrom: v.tracked_from ? String(v.tracked_from) : '', notices: num(v.notices),
      pending: bucket(v.pending), handed: bucket(v.handed), untracked: bucket(v.untracked),
      returns: v.returns.filter((r) => r && r.status).map((r) => ({
        id: num(r.id), at: String(r.at || ''), no: String(r.no || ''), amount: num(r.amount), status: String(r.status),
        notice: r.notice ? { no: String(r.notice.no || ''), at: String(r.notice.at || ''), total: num(r.notice.total) } : null,
        items: Array.isArray(r.items) ? r.items.map((i) => ({ n: String(i.n || ''), ar: String(i.ar || ''), p: num(i.p), u: num(i.u) })) : [],
      })),
    }));
    return { generatedAt: String(o.generated_at || ''), vendors };
  }
  // the companies that have something to say: a return waiting, or one that went (the rest is only counted)
  const shown = (d) => (d ? d.vendors.filter((v) => v.pending.n > 0 || v.handed.n > 0) : []);
  // all the returns still waiting: how many, how much, in how many companies
  function totals(d) {
    let n = 0, amount = 0, companies = 0;
    for (const v of d ? d.vendors : []) if (v.pending.n > 0) { n += v.pending.n; amount += v.pending.amount; companies++; }
    return { n, amount: Math.round(amount * 100) / 100, companies };
  }
  function isOld(generatedAt, now) {
    const t = new Date(generatedAt).getTime();
    return !Number.isFinite(t) || (now || new Date()).getTime() - t > OLD_HOURS * 3600e3;
  }
  // «1234.5» -> «1,234.50», «1234» -> «1,234»
  function money(n) {
    const v = Math.abs(num(n)) < 0.005 ? 0 : num(n);
    return v.toLocaleString('en-US', { minimumFractionDigits: Math.abs(v % 1) > 0.005 ? 2 : 0, maximumFractionDigits: 2 });
  }
  // «2026-11-15T16:54:08» -> «15/11»
  function dm(s) { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}` : ''; }
  // what was returned: «2 علبة» / «3 وحدة» (packs, else units)
  const qtyOf = (i) => (i.p > 0 ? { k: 'p', n: i.p } : { k: 'u', n: i.u || 1 });
  const pct = (n) => String(Math.round(num(n) * 100) / 100).replace(/\.0+$/, '');
  // the statement he sends to the company by hand: the returns still waiting, by invoice number
  function statementText(v) {
    const rows = v.returns.filter((r) => r.status === 'pending').sort((a, b) => String(a.at).localeCompare(String(b.at)));
    if (!rows.length) return '';
    const lines = rows.map((r, i) => `${i + 1}) فاتورة ${r.no} (${dm(r.at)}): ${money(r.amount)} ج` + (r.items.length ? ' — ' + r.items.map((x) => `${x.ar || x.n} (${qtyOf(x).k === 'p' ? pct(qtyOf(x).n) + ' علبة' : pct(qtyOf(x).n) + ' وحدة'})`).join('، ') : ''));
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return ['كشف مرتجعات صيدلية عسكر', `لدى ${v.name}`, 'مرتجعات لسه ما اتسلّمتش، بأرقام الفواتير:', ...lines, `الإجمالي: ${money(total)} ج`].join('\n');
  }
  const api = { PATH, parse, shown, totals, isOld, money, dm, qtyOf, statementText };
  root.AskerReturnsLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let data = null, loading = null, loadedAt = 0;
  const note = (t) => { const el = $('rtNote'); if (!el) return; el.textContent = t || ''; el.classList.toggle('hidden', !t); };
  function retHtml(r) {
    const items = r.items.map((i) => { const q = qtyOf(i); return `<span class="notr" dir="auto">${esc(i.ar || i.n)}</span> <small>${esc(q.k === 'p' ? `${pct(q.n)} علبة` : `${pct(q.n)} وحدة`)}</small>`; }).join('<br>');
    const st = r.status === 'handed'
      ? `<span class="pill good">${esc(`إشعار ${r.notice ? r.notice.no : ''} وصل ${r.notice ? dm(r.notice.at) : ''}`)}</span>`
      : '<span class="pill bad">لسه عندك</span>';
    return `<div class="rt-ret ${r.status}"><div class="rt-top"><span>${esc(`فاتورة ${r.no}`)}</span> <small>${esc(dm(r.at))}</small><b>${esc(`${money(r.amount)} ج`)}</b></div>` +
      `<div class="rt-items">${items}</div><div>${st}</div></div>`;
  }
  function vendorHtml(v, open) {
    const rows = v.returns.filter((r) => r.status !== 'untracked');
    const old = v.untracked.n ? `<p class="hint">${esc(`قبل ما التتبع يبدأ (${v.trackedFrom ? dm(v.trackedFrom + 'T00:00:00') : ''}): ${v.untracked.n} مرتجع بـ ${money(v.untracked.amount)} ج`)}</p>` : '';
    return `<details class="rt-v" data-rt="${esc(v.id)}"${open ? ' open' : ''}><summary><b class="notr" dir="auto">${esc(v.name)}</b><span class="rt-sum">` +
      (v.pending.n ? `<span class="pill bad">${esc(`${v.pending.n} لسه ما راحتش`)}</span> <b>${esc(`${money(v.pending.amount)} ج`)}</b>` : '<span class="pill good">✓</span>') +
      (v.handed.n ? ` <span class="pill good">${esc(`${v.handed.n} راحت`)}</span>` : '') + '</span></summary>' +
      `<div class="rt-body">${rows.map(retHtml).join('')}${old}` +
      (v.pending.n ? `<button type="button" class="small" data-rt-copy="${esc(v.id)}">📋 انسخ كشف المرتجعات</button>` : '') + '</div></details>';
  }
  function draw() {
    const box = $('rtBox');
    if (!box) return;
    const list = shown(data), t = totals(data);
    box.classList.toggle('hidden', !list.length);
    if (!list.length) return;
    $('rtCount').textContent = t.n ? String(t.n) : '';
    $('rtOld').classList.toggle('hidden', !(data && isOld(data.generatedAt)));
    $('rtList').innerHTML = list.map((v, i) => vendorHtml(v, i === 0 && v.pending.n > 0)).join('');
  }
  async function load(force) {
    if (!db()) return data;
    if (loading) return loading;
    if (data && !force && Date.now() - loadedAt < 5 * 60e3) return data;
    loading = (async () => {
      try {
        const { data: blob, error } = await db().storage.from('asker-private').download(PATH);
        data = error || !blob ? null : parse(JSON.parse(await blob.text()));
        loadedAt = Date.now();
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
  // «انسخ كشف المرتجعات»: a statement of the pending ones for that company, copied (nothing is sent)
  function copy(id) {
    const v = data && data.vendors.find((x) => String(x.id) === String(id));
    const msg = v ? statementText(v) : '';
    if (!msg) return;
    const fail = () => note('مقدرتش أنسخ لوحدي: ' + msg.replace(/\n/g, ' | '));
    try { navigator.clipboard.writeText(msg).then(() => note('اتنسخ كشف المرتجعات: الزقه في محادثة الشركة.'), fail); } catch (e) { fail(); }
  }
  $('rtBox')?.addEventListener('click', (e) => { const c = e.target.closest('[data-rt-copy]'); if (c) copy(c.dataset.rtCopy); });
  root.AskerReturns = { open: () => load(true), load, count: () => totals(data), data: () => data };
})(typeof window === 'undefined' ? globalThis : window);
