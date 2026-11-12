/* The customer's statement as a PDF (owner 2026-11-12: «ابعت له كشف الحساب من آخر دفعة أو اللي قبلها … انا حر» + «تفصيلي
   بالأصناف» + «الحساب يبقى PDF» + «يتبعت مباشر»). Made on the phone: the pages are drawn on a canvas (so Arabic is shaped by
   the browser itself, with the bot's font), each page goes into the PDF as a picture. No library, nothing leaves the phone
   until the owner taps «جهّز» (then the PDF is uploaded to the private bucket ar-statements and the customer gets a link).
   Pure parts (rows from a payment, the payments to choose from, the PDF file, the message) are tested in tests/statement-pdf.cjs. */
(function (root) {
  'use strict';
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const pad = (n) => String(n).padStart(2, '0');
  function money(n) {
    const v = Math.abs(num(n)) < 0.005 ? 0 : num(n);
    const frac = Math.abs(v % 1) > 0.005;
    return v.toLocaleString('en-US', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
  }
  function parseAt(s) {
    const m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null;
  }
  const dateText = (t) => (t ? `${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()}` : '');
  const clock = (t) => { const h = t.getHours(); return `${h % 12 || 12}:${pad(t.getMinutes())} ${h < 12 ? 'ص' : 'م'}`; };
  const byTime = (a, b) => String(a.at).localeCompare(String(b.at)) || num(a.id) - num(b.id);
  const lineValue = (l) => num(l.s) * (num(l.p) + num(l.u) / (num(l.k) > 0 ? num(l.k) : 1)) - num(l.d);
  const itemsOf = (m) => ((m.kind === 'sale' || m.kind === 'return') && Array.isArray(m.items) ? m.items : []);
  function discountOf(m) {
    const it = itemsOf(m);
    if (!it.length) return 0;
    const d = Math.abs(it.reduce((s, l) => s + lineValue(l), 0)) - Math.abs(num(m.total));
    return d > 0.5 ? Math.round(d * 100) / 100 : 0;
  }

  // the payments the statement can start from, newest first, with how many invoices came after each
  function paymentChoices(moves) {
    const asc = [...moves].sort(byTime);
    const out = [];
    asc.forEach((m, i) => {
      if (m.kind !== 'payment') return;
      const after = asc.slice(i + 1);
      out.push({ id: m.id, at: m.at, paid: num(m.paid), sales: after.filter((x) => x.kind === 'sale').length, returns: after.filter((x) => x.kind === 'return').length });
    });
    return out.reverse();
  }
  // the statement from one movement (a payment, or the first one of a month) to the newest: the balance before it, every
  // movement after it (oldest first), what was bought (sales minus returns, as charged) and paid, and the balance now
  function statementFrom(moves, startId) {
    const asc = [...moves].sort(byTime);
    const i = asc.findIndex((m) => String(m.id) === String(startId));
    if (i < 0) return null;
    const rows = asc.slice(i);
    const first = rows[0];
    const opening = Math.round((num(first.balance) - (num(first.total) - num(first.paid))) * 100) / 100;
    let bought = 0, paid = 0;
    for (const m of rows) { if (m.kind === 'sale' || m.kind === 'return') bought += num(m.total); paid += num(m.paid); }
    return { opening, rows, bought: Math.round(bought * 100) / 100, paid: Math.round(paid * 100) / 100, closing: num(rows[rows.length - 1].balance), from: first.at, to: rows[rows.length - 1].at };
  }
  // the first movement of this month (for «من أول الشهر ده»)
  function monthStartId(moves, now) {
    const asc = [...moves].sort(byTime);
    const m = asc.find((x) => { const t = parseAt(x.at); return t && t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth(); });
    return m ? m.id : null;
  }
  // what the balance means for the customer
  function balanceWords(b) {
    const v = num(b);
    if (v > 0.5) return `عليك ${money(v)} ج`;
    if (v < -0.5) return `ليك عندنا ${money(-v)} ج`;
    return 'الحساب خالص';
  }
  // the WhatsApp message (the owner can still change it before sending)
  function messageText(o) {
    const t = parseAt(o.from);
    return [
      'أهلًا بحضرتك 🌿',
      `ده كشف حساب ${o.name} من صيدلية عسكر${t ? `، من ${dateText(t)} لحد النهارده` : ''}.`,
      `الرصيد دلوقتي: ${balanceWords(o.balance)}`,
      '',
      'الكشف بالتفصيل بالأصناف (PDF):',
      o.link,
    ].join('\n');
  }
  // where the PDF is kept: s/<year>-<month>/<random>.pdf (the bucket's rule)
  const fileKey = (now, rand) => `s/${now.getFullYear()}-${pad(now.getMonth() + 1)}/${rand}.pdf`;

  // ---------- the PDF file: one JPEG picture per A4 page ----------
  function buildPdf(pages) {
    const enc = new TextEncoder();
    const parts = [], offsets = [];
    let pos = 0;
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); pos += b.length; };
    const W = '595.28', H = '841.89';
    const n = pages.length, count = 2 + 3 * n;
    push('%PDF-1.4\n%âãÏÓ\n');
    const obj = (id, body) => { offsets[id] = pos; push(`${id} 0 obj\n`); body(); push('\nendobj\n'); };
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] /Count ${n} >>`));
    pages.forEach((p, i) => {
      const pg = 3 + 3 * i, im = pg + 1, ct = pg + 2, draw = `q ${W} 0 0 ${H} 0 0 cm /Im${i} Do Q`;
      obj(pg, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im${i} ${im} 0 R >> >> /Contents ${ct} 0 R >>`));
      obj(im, () => { push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`); push(p.jpeg); push('\nendstream'); });
      obj(ct, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
    });
    const xref = pos;
    let x = `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= count; id++) x += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    push(x + `trailer\n<< /Size ${count + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(pos);
    let o = 0;
    for (const b of parts) { out.set(b, o); o += b.length; }
    return out;
  }

  const api = { paymentChoices, statementFrom, monthStartId, balanceWords, messageText, fileKey, buildPdf, discountOf, lineValue, money, parseAt, dateText };
  root.AskerStatementLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- drawing the pages (A4 at 150 dpi) ----------
  const PW = 1240, PH = 1754, M = 70, FONT = '"IBM Plex Sans Arabic", system-ui, sans-serif';
  const BLUE = '#0a4aa6', NAVY = '#062e67', GREY = '#6b7280', LINE = '#e3e7ef', RED = '#c41a30', GREEN = '#1b7f3b', AMBER = '#a35d00';
  const AR = /[؀-ۿ]/;
  const L = M, R = PW - M;
  // columns, right to left: date | what | charged | paid | balance
  const COL = { date: [R - 200, R], what: [L + 480, R - 200], debit: [L + 330, L + 480], paid: [L + 175, L + 330], bal: [L, L + 175] };
  function loadImage(src) {
    return new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  }
  function fit(ctx, s, w) {
    s = String(s || '');
    if (ctx.measureText(s).width <= w) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1);
    return s + '…';
  }
  function text(ctx, s, x, y, o) {
    ctx.font = `${o.bold ? 700 : 400} ${o.size || 24}px ${FONT}`;
    ctx.fillStyle = o.color || '#14213d';
    const rtl = o.dir ? o.dir === 'rtl' : AR.test(s);
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = o.align || 'right';
    ctx.fillText(o.w ? fit(ctx, s, o.w) : s, x, y);
  }
  function qtyText(l) {
    const f = root.AskerStockLib && root.AskerStockLib.qtyText;
    return f ? f(l.p, l.u, l.k) : `${num(l.p)} علبة` + (num(l.u) ? ` و${num(l.u)} وحدة` : '');
  }
  // an item's line: «2 علبة × 50 = 100», a strip alone at its own price «1 وحدة × 32.67 = 32.67», both «1 علبة + 1 وحدة = 82»
  function lineText(l) {
    const p = num(l.p), u = num(l.u), k = num(l.k) > 0 ? num(l.k) : 1;
    const unit = !u ? num(l.s) : !p ? num(l.s) / k : null;
    return `${qtyText(l)}${unit != null ? ` × ${money(unit)}` : ''} = ${money(lineValue(l))}`;
  }
  // the blocks to lay out: one per movement (with its items), so an invoice stays on one page when it can
  function blocks(st) {
    const out = [{ h: 44, kind: 'opening' }];
    for (const m of st.rows) {
      const items = itemsOf(m);
      out.push({ h: 44 + items.length * 34 + (items.length ? 8 : 0), kind: 'move', m, items });
    }
    return out;
  }
  async function renderPages(st, o) {
    if (document.fonts && document.fonts.load) {
      try { await Promise.all([document.fonts.load(`400 24px ${FONT}`), document.fonts.load(`700 24px ${FONT}`)]); } catch (e) {}
    }
    const logo = await loadImage(o.logo || 'icons/arabic-192.png?v=logo2');
    const now = o.now || new Date();
    const all = blocks(st), pages = [];
    let i = 0;
    while (i < all.length || !pages.length) {
      const c = document.createElement('canvas');
      c.width = PW; c.height = PH;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PW, PH);
      let y;
      if (!pages.length) {
        if (logo) ctx.drawImage(logo, L, M - 10, 120, 120);
        text(ctx, 'صيدلية عسكر', R, M + 40, { bold: true, size: 46, color: NAVY });
        text(ctx, 'كشف حساب عميل · صحتك أولوية من 1981', R, M + 86, { size: 24, color: GREY });
        ctx.fillStyle = BLUE; ctx.fillRect(L, M + 128, R - L, 4);
        text(ctx, `${o.name} · كود ${o.id}`, R, M + 180, { bold: true, size: 30, w: 640 });
        text(ctx, `من ${dateText(parseAt(st.from))} لـ ${dateText(parseAt(st.to))}`, L, M + 180, { size: 24, color: GREY, align: 'left', dir: 'rtl' });
        text(ctx, `اتعمل يوم ${dateText(now)} ${clock(now)}`, L, M + 216, { size: 21, color: GREY, align: 'left', dir: 'rtl' });
        y = M + 250;
      } else {
        text(ctx, `كشف حساب ${o.name} · تابع`, R, M + 30, { bold: true, size: 26, color: NAVY, w: 900 });
        y = M + 60;
      }
      // the table's head
      ctx.fillStyle = '#eef3fb'; ctx.fillRect(L, y, R - L, 46);
      const head = (s, col) => text(ctx, s, col[1] - 10, y + 32, { bold: true, size: 22, color: NAVY });
      head('التاريخ', COL.date); head('البيان', COL.what); head('عليه', COL.debit); head('دفع', COL.paid); head('الرصيد', COL.bal);
      y += 56;
      const bottom = PH - 110;
      while (i < all.length) {
        const b = all[i];
        const last = i === all.length - 1;
        const need = b.h + (last ? 170 : 0);
        if (y + need > bottom && y > M + 330) break; // next page (a block taller than a page is drawn anyway)
        const num2 = (v, col, color) => text(ctx, money(v), col[1] - 10, y + 30, { size: 23, color, align: 'right', dir: 'ltr' });
        if (b.kind === 'opening') {
          text(ctx, '—', COL.date[1] - 10, y + 30, { size: 23, color: GREY });
          text(ctx, 'رصيد سابق', COL.what[1] - 10, y + 30, { bold: true, size: 23 });
          num2(st.opening, COL.bal);
        } else {
          const m = b.m, t = parseAt(m.at);
          const label = m.kind === 'payment' ? 'دفعة' : m.kind === 'refund' ? 'رجّعناله فلوس' : m.kind === 'return' ? 'مرتجع' : 'فاتورة';
          const d = discountOf(m);
          const color = m.kind === 'payment' ? GREEN : m.kind === 'return' ? AMBER : '#14213d';
          text(ctx, t ? `${pad(t.getDate())}/${pad(t.getMonth() + 1)} ${clock(t)}` : '', COL.date[1] - 10, y + 30, { size: 22, color: GREY });
          text(ctx, label + (d ? ` (خصم ${money(d)})` : ''), COL.what[1] - 10, y + 30, { bold: true, size: 23, color, w: COL.what[1] - COL.what[0] - 20 });
          if (m.kind === 'sale' || m.kind === 'return') num2(m.total, COL.debit, color);
          if (num(m.paid)) num2(m.paid, COL.paid, GREEN);
          num2(m.balance, COL.bal);
          let yy = y + 44;
          for (const l of b.items) {
            text(ctx, l.n, R - 30, yy + 24, { size: 20, color: '#3f4656', w: R - 30 - COL.what[0] + 40 });
            text(ctx, lineText(l), COL.debit[1] - 10, yy + 24, { size: 20, color: GREY, w: COL.debit[1] - L - 20 });
            yy += 34;
          }
        }
        ctx.fillStyle = LINE; ctx.fillRect(L, y + b.h - 2, R - L, 2);
        y += b.h;
        i++;
      }
      if (i >= all.length) {
        // the totals
        y += 14;
        ctx.fillStyle = BLUE; ctx.fillRect(L, y, R - L, 4);
        text(ctx, `اشترى: ${money(st.bought)} ج · دفع: ${money(st.paid)} ج`, R, y + 50, { bold: true, size: 26 });
        text(ctx, `الرصيد دلوقتي: ${st.closing > 0.5 ? `عليه ${money(st.closing)} ج` : st.closing < -0.5 ? `ليه عندنا ${money(-st.closing)} ج` : 'خالص'}`, L, y + 50, { bold: true, size: 30, color: st.closing > 0.5 ? RED : GREEN, align: 'left', dir: 'rtl' });
        text(ctx, 'الرصيد بالسالب = ليه عندنا', R, y + 95, { size: 20, color: GREY });
      }
      pages.push(c);
      if (pages.length > 60) break; // a statement that long: the owner picks a later payment
    }
    // page numbers
    pages.forEach((c, k) => {
      const ctx = c.getContext('2d');
      text(ctx, `صفحة ${k + 1} من ${pages.length} · صيدلية عسكر`, PW / 2, PH - 50, { size: 20, color: GREY, align: 'center', dir: 'rtl' });
    });
    return pages;
  }
  const toJpeg = (c) => new Promise((ok, no) => c.toBlob((b) => (b ? b.arrayBuffer().then((a) => ok(new Uint8Array(a)), no) : no(new Error('no image'))), 'image/jpeg', 0.86));
  async function makePdf(st, o) {
    const canvases = await renderPages(st, o);
    const pages = [];
    for (const c of canvases) pages.push({ jpeg: await toJpeg(c), w: c.width, h: c.height });
    return { blob: new Blob([buildPdf(pages)], { type: 'application/pdf' }), pages: canvases.length, canvases };
  }
  root.AskerStatement = { makePdf, renderPages };
})(typeof window === 'undefined' ? globalThis : window);
