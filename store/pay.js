/* «الدفع بتحويل» on the store site (owner 2026-11-17: «أوبشن للدفع جوه الموقع وجوه الرابط بتاع العملاء … يدوس على زرار يبعت فودافون كاش …
   انستا باي»). Two ways to pay by transfer: Vodafone Cash and InstaPay. The site cannot move money: the button copies the pharmacy's
   number, opens the phone's dialer already holding the transfer (Android: *9*7*number*amount#, the customer confirms with his own PIN)
   or the pharmacy's InstaPay link, and a last button sends the transfer's picture to the pharmacy on WhatsApp. The pharmacy sees the
   transfer and records the payment itself (no connection to Vodafone / InstaPay).
   The owner types the two numbers in the bot (⚙ site settings, ar/store-settings.js); the site reads them from the one public function
   ar_store_pay_info (migration 202611170100): nothing else of the settings table is readable by visitors.
   Without a number the option does not show at all. Loaded before store/account.js (the checkout's payment box and «ادفع حسابك»). */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/store-pay.cjs) ----------
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const digits = (s) => String(s || '').replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
  // an Egyptian mobile number written any way (+20 / 0020 / spaces / Arabic digits) → 01xxxxxxxxx, '' when it is not one
  function cleanWallet(v) {
    let d = digits(v);
    if (/^0020\d{10}$/.test(d)) d = d.slice(3);
    else if (/^20\d{10}$/.test(d)) d = d.slice(2);
    if (/^1[0125]\d{8}$/.test(d)) d = '0' + d;
    return /^01[0125]\d{8}$/.test(d) ? d : '';
  }
  // the pharmacy's InstaPay: an address (name@instapay), a payment link (https://ipn.eg/…), or a mobile number (InstaPay accepts it as an address).
  // null = not valid; { kind, value }
  function cleanInstapay(v) {
    const s = String(v || '').trim();
    if (!s) return null;
    if (/^https:\/\/(www\.)?ipn\.eg\/[^\s]{3,180}$/i.test(s)) return { kind: 'link', value: s };
    if (/^[A-Za-z0-9._-]{2,40}@[A-Za-z]{2,20}$/.test(s)) return { kind: 'ipa', value: s.toLowerCase() };
    const w = cleanWallet(s);
    return w ? { kind: 'phone', value: w } : null;
  }
  // the answer of ar_store_pay_info → what the site shows. Junk or empty = no option.
  function parseInfo(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const wa = digits(r.whatsapp);
    return { vodafone: cleanWallet(r.vodafone), instapay: cleanInstapay(r.instapay), whatsapp: /^01\d{9}$/.test(wa) ? wa : '' };
  }
  const methodsOf = (info) => [info && info.vodafone ? 'vodafone' : '', info && info.instapay ? 'instapay' : ''].filter(Boolean);
  const isTransfer = (m) => m === 'vodafone' || m === 'instapay';
  // the amount to transfer: whole pounds (the dial code takes whole pounds; under half a pound is «settled» at the pharmacy anyway)
  const wholeAmount = (x) => { const v = Math.round(num(x)); return v >= 1 ? v : 0; };
  // Vodafone Cash from the phone's dialer: *9*7*number*amount# (the # must be %23 inside a tel: link); no valid amount = the number only
  function vodafoneDial(number, amount) {
    const n = cleanWallet(number), a = wholeAmount(amount);
    if (!n) return 'tel:*9*7%23';
    return a ? `tel:*9*7*${n}*${a}%23` : `tel:*9*7*${n}%23`;
  }
  const NAMES = { vodafone: 'فودافون كاش', instapay: 'إنستا باي' };
  // the WhatsApp message with the transfer's picture: who, how much, what for
  function proofText(method, amount, who) {
    const a = wholeAmount(amount);
    return `حوّلت ${a ? a + ' ج ' : ''}على ${NAMES[method] || 'التحويل'}` + (who ? ` (${who})` : '') + '. دي صورة التحويل.';
  }
  function proofHref(whatsapp, method, amount, who) {
    const w = digits(whatsapp);
    return /^01\d{9}$/.test(w) ? `https://wa.me/2${w}?text=${encodeURIComponent(proofText(method, amount, who))}` : '';
  }
  // the note that goes with the order (the server keeps notes up to 500 letters)
  const orderNote = (method) => (isTransfer(method) ? `الدفع: تحويل ${NAMES[method]}` : '');
  // the customer's own notes are cut first if the two together pass 500 letters: the payment note must stay whole
  function joinNotes(notes, method) {
    const extra = orderNote(method), base = String(notes || '').trim().slice(0, extra ? 500 - extra.length - 3 : 500);
    return [base, extra].filter(Boolean).join(' · ');
  }
  const TEXTS = {
    h: 'طريقة الدفع',
    cash: 'كاش في الصيدلية لما تستلم',
    vodafone: '📱 فودافون كاش',
    instapay: '🏦 إنستا باي',
    amountLine: 'حوّل {a} ج على {m}',
    amountNone: 'حوّل المبلغ على {m}',
    copy: '📋 انسخ الرقم',
    copyIpa: '📋 انسخ العنوان',
    copied: '✓ اتنسخ',
    dial: '📱 افتح التحويل',
    openLink: '🏦 افتح إنستا باي',
    proof: '💬 حوّلت؟ ابعت صورة التحويل على واتساب',
    pin: 'هتأكّد التحويل بنفسك. الصيدلية بتسجّل الدفعة بعد ما تشوف التحويل.',
    noDial: 'افتح تطبيق «أنا فودافون» وحوّل للرقم ده.',
    ipaSteps: 'افتح تطبيق إنستا باي، واختار «تحويل»، والصق العنوان.',
    copyAmount: '📋 انسخ المبلغ',
    ipaStepsAmount: 'افتح تطبيق إنستا باي، واختار «تحويل»، والصق العنوان والمبلغ.',
    ipaStepsLink: '١) دوس «انسخ المبلغ»  ٢) افتح إنستا باي  ٣) الصق المبلغ في خانة المبلغ',
    sheetTitle: 'ادفع حسابك',
    sheetAmount: 'المبلغ (تقدر تعدّله)',
    sheetClose: 'تمام',
    payBtn: '💳 ادفع حسابك',
    orderNote: 'الدفع بتحويل {m}. بعد التحويل ابعت صورته على واتساب.',
  };
  const api = { cleanWallet, cleanInstapay, parseInfo, methodsOf, isTransfer, wholeAmount, vodafoneDial, proofText, proofHref, orderNote, joinNotes, NAMES, TEXTS };
  if (typeof module !== 'undefined') module.exports = api;
  root.AskerStorePayLib = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const KEY = 'asker_store_payinfo';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const $ = (id) => document.getElementById(id);
  const money = (n) => num(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const android = () => /Android/i.test(navigator.userAgent || '');
  let info = { vodafone: '', instapay: null, whatsapp: '' };
  const listeners = [];
  const tell = () => listeners.forEach((f) => { try { f(); } catch (e) { /* a listener's trouble is its own */ } });
  const lsGet = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const lsSet = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private window */ } };
  const cached = lsGet();
  if (cached) info = parseInfo(cached);
  // the last numbers are drawn at once on the next visit, then refreshed from the server
  async function load(client) {
    try {
      const { data, error } = await client.rpc('ar_store_pay_info');
      if (error || !data) return;
      lsSet(data);
      info = parseInfo(data);
      tell();
    } catch (e) { /* no numbers = no option */ }
  }

  // the card under the chosen method: the number, copy, open, the WhatsApp proof. amount = whole pounds or 0 (unknown). who = a short «who» for the message.
  function detailsHtml(method, amount, who) {
    if (!isTransfer(method)) return '';
    const a = wholeAmount(amount), name = NAMES[method];
    const v = method === 'vodafone' ? info.vodafone : info.instapay;
    if (!v) return '';
    const shown = method === 'vodafone' ? v : v.kind === 'link' ? '' : v.value;
    const proof = proofHref(info.whatsapp, method, a, who);
    // the buttons (owner 2026-11-17: «التحويل بتاع انستا كده ما بقاش سهل»; InstaPay's link carries no amount, so «انسخ المبلغ» puts it on the clipboard to paste into the app):
    // Vodafone Cash: copy the number + the dialer (Android) or copy the amount (a phone that cannot dial);
    // InstaPay with his link: open the app's link + copy the amount; InstaPay with an address / mobile: copy it + copy the amount
    const btn = (value, label) => `<button type="button" class="pay-btn" data-pay-copy="${esc(value)}">${esc(label)}</button>`;
    const amountBtn = a ? btn(String(a), TEXTS.copyAmount) : '';
    let row, how = '';
    if (method === 'vodafone') {
      row = btn(shown, TEXTS.copy) + (android() ? `<a class="pay-btn pay-main" href="${esc(vodafoneDial(v, a))}" data-pay-open>${esc(TEXTS.dial)}</a>` : amountBtn);
      how = android() ? '' : TEXTS.noDial;
    } else if (v.kind === 'link') {
      row = `<a class="pay-btn pay-main" href="${esc(v.value)}" target="_blank" rel="noopener" data-pay-open>${esc(TEXTS.openLink)}</a>` + (a ? amountBtn : btn(v.value, TEXTS.copyIpa));
      how = a ? TEXTS.ipaStepsLink : '';
    } else {
      row = btn(shown, v.kind === 'phone' ? TEXTS.copy : TEXTS.copyIpa) + amountBtn;
      how = a ? TEXTS.ipaStepsAmount : TEXTS.ipaSteps;
    }
    return `<div class="pay-card" data-pay-card="${esc(method)}">` +
      `<div class="pay-amt">${esc((a ? TEXTS.amountLine : TEXTS.amountNone).replace('{a}', money(a)).replace('{m}', name))}</div>` +
      (shown ? `<div class="pay-num" dir="ltr" translate="no">${esc(shown)}</div>` : '') +
      `<div class="pay-row">${row}</div>` +
      (how ? `<p class="pay-how">${esc(how)}</p>` : '') +
      (proof ? `<a class="pay-proof" href="${esc(proof)}" target="_blank" rel="noopener" data-pay-proof>${esc(TEXTS.proof)}</a>` : '') +
      `<p class="pay-pin">${esc(TEXTS.pin)}</p></div>`;
  }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* older phone: the old way */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (e) { return false; }
  }
  document.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-pay-copy]');
    if (!c) return;
    const label = c.textContent;
    if (await copyText(c.getAttribute('data-pay-copy'))) {
      c.textContent = TEXTS.copied;
      setTimeout(() => { c.textContent = label; }, 1800);
    }
  });

  // «ادفع حسابك» (the customer's own account page): a sheet with the amount he owes (he may change it) and the two ways
  let sheet = null;
  function closeSheet() { if (sheet) { sheet.remove(); sheet = null; } }
  // ctx: { amount (what he owes), who: «أحمد محمود · كود 101» }
  function openSheet(ctx) {
    closeSheet();
    const methods = methodsOf(info);
    if (!methods.length) return;
    let method = methods[0], amount = wholeAmount(ctx && ctx.amount);
    const who = (ctx && ctx.who) || '';
    sheet = document.createElement('div');
    sheet.className = 'pay-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', TEXTS.sheetTitle);
    const draw = () => {
      const opt = (m) => `<label class="pay-opt${method === m ? ' on' : ''}"><input type="radio" name="paySheet" value="${m}"${method === m ? ' checked' : ''} /> ${esc(TEXTS[m])}</label>`;
      sheet.innerHTML = `<div class="pay-sheet-card"><div class="pay-grip"></div><h2>${esc(TEXTS.sheetTitle)}</h2>` +
        `<label class="pay-amount"><span>${esc(TEXTS.sheetAmount)}</span><span class="pay-amount-in"><input id="payAmount" type="number" inputmode="numeric" min="1" step="1" value="${amount || ''}" /> ج</span></label>` +
        methods.map(opt).join('') + `<div id="payDetails">${detailsHtml(method, amount, who)}</div>` +
        `<button type="button" class="pay-btn pay-close" data-pay-close>${esc(TEXTS.sheetClose)}</button></div>`;
    };
    draw();
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-pay-close]')) closeSheet(); });
    sheet.addEventListener('change', (e) => { if (e.target && e.target.name === 'paySheet') { method = e.target.value; draw(); } });
    sheet.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'payAmount') { amount = wholeAmount(e.target.value); const d = sheet.querySelector('#payDetails'); if (d) d.innerHTML = detailsHtml(method, amount, who); }
    });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  root.AskerStorePay = {
    load, openSheet, closeSheet, detailsHtml,
    info: () => info,
    methods: () => methodsOf(info),
    onChange: (f) => { listeners.push(f); },
    // store.js: the checkout's «done» page after a transfer order
    proofHref: (method, amount, who) => proofHref(info.whatsapp, method, amount, who),
    TEXTS,
  };
})(typeof window === 'undefined' ? globalThis : window);
