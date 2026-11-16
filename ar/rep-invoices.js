/* «📄 فواتير المندوبين» (owner 2026-11-16: «الفاتورة بتتبعت على نفس واتس الوارد، المفروض انت تعرفها من الارقام والحسابات»): the picture of the invoice a
   warehouse's rep sends on WhatsApp when the order goes out. The laptop recognises it by its numbers and accounts (Hub\reader\CLAUDE_READER.ps1), reads it whole and checks it
   (Hub\repinv\REP_INVOICES.ps1, read only): the arithmetic of the paper, each line against PharmaFly (the same item, its price) and against the discount of the last purchase of
   that item from that warehouse, «was it ordered», and the warehouse's account against ours. File asker-private/repinv/invoices.json (owner only), shown at the top of «الطلبيات».
   Nothing is written from here. */
(function (root) {
  'use strict';
  const PATH = 'repinv/invoices.json';
  const SHOW_DAYS = 7;          // invoices older than this are not listed
  const FRESH_HOURS = 48;       // the home row counts the invoices of the last two days
  const OLD_HOURS = 72;         // a file the laptop stopped updating: its account lines may be old
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const WARN = new Set(['disc_low', 'price', 'not_ordered', 'bad_math']);

  // ---------- pure helpers (also used by tests/rep-invoices.cjs) ----------
  // the file must look like what the laptop writes; anything else is «no invoices»
  function parse(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.invoices)) return null;
    const invoices = o.invoices.filter((x) => x && x.inv_no && Array.isArray(x.lines)).map((x) => {
      const m = x.math || {}, t = x.totals || {}, a = x.account || null;
      return {
        id: String(x.id || ''), invNo: String(x.inv_no), date: String(x.date || ''), warehouse: String(x.warehouse || ''), receivedAt: String(x.received_at || ''),
        vendor: x.vendor && x.vendor.name ? String(x.vendor.name) : '', ordersKnown: !!x.orders_known, missing: Array.isArray(x.missing) ? x.missing.map(String) : [],
        totals: { retail: num(t.retail), previous: num(t.previous), net: num(t.net), total: num(t.total), paid: num(t.paid), balance: num(t.balance) },
        math: { linesBad: Array.isArray(m.lines_bad) ? m.lines_bad.map(Number) : [], sumOk: m.sum_ok !== false, chainOk: m.chain_ok !== false, balanceOk: m.balance_ok !== false },
        account: a ? { theirs: num(a.theirs), ours: num(a.ours), unentered: Array.isArray(a.unentered) ? a.unentered.map(String) : [], unenteredNet: num(a.unentered_net), unexplained: num(a.unexplained) } : null,
        lines: x.lines.map((l) => ({
          n: String(l.n || ''), qty: num(l.qty), price: num(l.price), disc: num(l.disc), total: num(l.total),
          item: l.item && l.item.name ? { id: num(l.item.id), name: String(l.item.name) } : null,
          usual: l.usual == null ? null : num(l.usual), pf: l.pf_price == null ? null : num(l.pf_price), flags: Array.isArray(l.flags) ? l.flags.map(String) : [],
        })),
      };
    });
    return { generatedAt: String(o.generated_at || ''), invoices };
  }
  // «1234.5» -> «1,234.50», «1234» -> «1,234»
  function money(n) {
    const v = Math.abs(num(n)) < 0.005 ? 0 : num(n);
    return v.toLocaleString('en-US', { minimumFractionDigits: Math.abs(v % 1) > 0.005 ? 2 : 0, maximumFractionDigits: 2 });
  }
  const pct = (n) => String(Math.round(num(n) * 10) / 10).replace(/\.0$/, '');
  // what a line says: [text, tone] (tone: bad = red, warn = orange, good = green, gray)
  function chips(l) {
    const out = [];
    for (const f of l.flags) {
      if (f === 'disc_low') out.push([`خصم أقل: ${pct(l.disc)}% وآخر مرة ${pct(l.usual)}%`, 'warn']);
      else if (f === 'disc_high') out.push([`خصم أعلى: ${pct(l.disc)}% وآخر مرة ${pct(l.usual)}%`, 'good']);
      else if (f === 'price') out.push([`السعر ${pct(l.price)} وفي فارمافلاي ${pct(l.pf)}`, 'warn']);
      else if (f === 'not_ordered') out.push(['ما كانش في طلبيتك', 'warn']);
      else if (f === 'new_here') out.push(['أول مرة من المخزن ده', 'gray']);
      else if (f === 'no_match') out.push(['مش في فارمافلاي: صنف جديد؟', 'gray']);
      else if (f === 'bad_math') out.push(['حساب السطر مش مظبوط', 'bad']);
    }
    return out;
  }
  // the lines that need a look
  const flaggedLines = (inv) => inv.lines.filter((l) => l.flags.some((f) => WARN.has(f))).length;
  // what is wrong with the arithmetic of the paper itself (empty = all right)
  function mathIssues(inv) {
    const out = [];
    if (inv.math.linesBad.length) out.push(`${inv.math.linesBad.length} سطر حسابه مش مظبوط`);
    if (!inv.math.sumOk) out.push('مجموع السطور مش بيساوي الصافي');
    if (!inv.math.chainOk) out.push('الحساب السابق + الصافي مش بيساوي الإجمالي');
    if (!inv.math.balanceOk) out.push('الرصيد الحالي مش بيساوي الإجمالي − المسدد');
    return out;
  }
  // the account lines of a warehouse's newest invoice: [text, tone]
  function accountLines(a) {
    if (!a) return [];
    const out = [[`الحساب: عندهم ${money(a.theirs)} وعندك ${money(a.ours)}`, 'gray']];
    if (a.unentered.length) out.push([`فواتير لسه ما اتدخلتش عندك: ${a.unentered.join(', ')} (${money(a.unenteredNet)})`, 'gray']);
    if (Math.abs(a.unexplained) <= 1) out.push(['✓ الحساب مطابق', 'good']);
    else out.push([a.unexplained > 0 ? `الفرق اللي مش مفسّر: عندهم أكتر منك بـ ${money(a.unexplained)}` : `الفرق اللي مش مفسّر: عندك أكتر منهم بـ ${money(-a.unexplained)}`, 'warn']);
    return out;
  }
  // an invoice needs a look: a flagged line, a wrong paper, or an account that does not close
  const needsLook = (inv) => flaggedLines(inv) > 0 || mathIssues(inv).length > 0 || !!(inv.account && Math.abs(inv.account.unexplained) > 1);
  // the invoices shown (the last 7 days, newest first) and how many of the last two days need a look
  function recent(d, now) {
    const t = (now || new Date()).getTime();
    const age = (x) => { const r = new Date(x.receivedAt).getTime(); return Number.isFinite(r) ? t - r : 0; };
    return (d ? d.invoices : []).filter((x) => age(x) <= SHOW_DAYS * 864e5).sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  }
  const freshLook = (d, now) => recent(d, now).filter((x) => { const r = new Date(x.receivedAt).getTime(); return Number.isFinite(r) && (now || new Date()).getTime() - r <= FRESH_HOURS * 3600e3 && needsLook(x); }).length;
  function isOld(generatedAt, now) {
    const t = new Date(generatedAt).getTime();
    return !Number.isFinite(t) || (now || new Date()).getTime() - t > OLD_HOURS * 3600e3;
  }
  // «16/11 01:20» in the phone's own time
  function when(iso) {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  const api = { PATH, parse, money, chips, flaggedLines, mathIssues, accountLines, needsLook, recent, freshLook, isOld, when };
  root.AskerRepInvoicesLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  let data = null, loading = null, loadedAt = 0;
  const chip = ([t, tone]) => `<span class="rep-chip ${tone}">${esc(t)}</span>`;
  function lineHtml(l) {
    const cs = chips(l);
    return `<div class="rep-line"><div class="rep-ln"><b class="notr" dir="auto">${esc(l.n)}</b>${l.item ? `<small class="notr" dir="ltr">${esc(l.item.name)}</small>` : ''}</div>` +
      `<div class="rep-nums"><span>${esc(`${pct(l.qty)} × ${pct(l.price)}`)}</span> <span>${esc(`${pct(l.disc)}%`)}</span> <b>${esc(money(l.total))}</b></div>` +
      (cs.length ? `<div class="rep-chips">${cs.map(chip).join('')}</div>` : '<div class="rep-chips"><span class="rep-chip good">✓</span></div>') + '</div>';
  }
  function invHtml(x, open) {
    const n = flaggedLines(x), mi = mathIssues(x), ac = accountLines(x.account);
    const title = x.vendor || x.warehouse;
    const head = `<summary><span class="rep-h"><b class="notr" dir="auto">${esc(title)}</b>` +
      `<small><span>${esc(`فاتورة ${x.invNo}`)}</span> <span>${esc(`وصلت ${when(x.receivedAt)}`)}</span> <span>${esc(`${x.lines.length} صنف`)}</span></small></span>` +
      `<span class="rep-t"><b>${esc(`${money(x.totals.net)} ج`)}</b>${n || mi.length ? `<span class="pill bad">${esc(`${n} تنبيه`)}</span>` : '<span class="pill good">✓</span>'}</span></summary>`;
    const mathLine = mi.length ? mi.map((t) => `<p class="rep-note bad">${esc(t)}</p>`).join('') : '<p class="rep-note good">✓ حساب الورقة مضبوط</p>';
    const miss = x.missing.length ? `<p class="rep-note warn">${esc(`اتطلب ومش في الفاتورة: ${x.missing.join(', ')}`)}</p>` : '';
    const acc = ac.map(([t, tone]) => `<p class="rep-note ${tone}">${esc(t)}</p>`).join('');
    return `<details class="rep-inv" data-rep="${esc(x.id)}"${open ? ' open' : ''}>${head}<div class="rep-body">${x.lines.map(lineHtml).join('')}${mathLine}${miss}${acc}</div></details>`;
  }
  function draw() {
    const box = $('repBox');
    if (!box) return;
    const list = recent(data);
    box.classList.toggle('hidden', !list.length);
    if (!list.length) return;
    $('repCount').textContent = String(list.length);
    $('repOld').classList.toggle('hidden', !(data && isOld(data.generatedAt)));
    $('repList').innerHTML = list.map((x, i) => invHtml(x, i === 0)).join('');
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
  root.AskerRepInvoices = { open: () => load(true), load, count: () => freshLook(data), data: () => data };
})(typeof window === 'undefined' ? globalThis : window);
