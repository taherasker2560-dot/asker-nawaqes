/* «🔔 تنبيه حركة الحساب» on the credit customer's account (owner 2026-11-18: «نضيف عند العميل تنبيهات لحركة الحساب، مش بس إشعارات تنبيه بالصوت»; «أيوه، ابدأ»: «فيه حركة جديدة على حسابك» من غير مبالغ).
   One tile on the account's home: a tap turns on a phone notification for every NEW movement of the account (a sale or a payment; the pharmacy's system brings them about every 10 minutes).
   The server keeps this phone's push address and the customer it belongs to (migration 202611182330: ar_account_push_save), nothing else; the push is empty and the phone's own worker
   (store/acct/sw.js) says «فيه حركة جديدة على حسابك». Only the OWNER of the account has it (a person of his house is refused by the server too), not the pharmacy's own phone, not inside the
   Android app (a WebView has no web push: the site's installed page does). store/account.js draws the tile and tells this module the client and the link. */
(function (root) {
  'use strict';
  const KEY = 'asker_acct_push';   // '1' = this phone asked for it
  const VAPID = 'BEz67xiIZZubLNtifD1Ryqxc6p2j509IsWF6o-YUe5M1BvyWIlUm4NwaRKUP-potwMmyN9_qxqNC2qfn1s5ozwg';   // the public half of the web-push key (the same one the chat and the dose alarm use)
  const TEXTS = {
    tile: '🔔 تنبيه حركة الحساب',
    off: 'اضغط عشان يوصلك إشعار لما يحصل حركة جديدة على حسابك',
    on: '✓ شغّال: هيجيلك إشعار لما يحصل حركة جديدة على حسابك',
    busy: 'ثانية…',
    denied: 'الإشعارات مقفولة من إعدادات المتصفح. افتحها وجرّب تاني.',
    unsupported: 'الموبايل أو المتصفح ده مش بيدعم الإشعارات. على الآيفون ضيف الموقع للشاشة الرئيسية الأول.',
    fail: 'ما اتفعّلش. جرّب تاني بعد شوية.',
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const keyBytes = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4), raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
  const api = { TEXTS, KEY };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  const supported = () => !!(root.navigator && 'serviceWorker' in root.navigator && 'PushManager' in root && root.Notification);
  const inApp = () => { try { return !!(root.AskerAndroid && typeof root.AskerAndroid.setAlarms === 'function'); } catch (e) { return false; } };
  let client = null, token = '', owner = false, busy = false, note = '';
  const isOn = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const setOn = (v) => { try { if (v) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch (e) { /* private window */ } };

  function tileHtml() {
    if (!owner || inApp()) return '';
    const sub = busy ? TEXTS.busy : note || (isOn() ? TEXTS.on : TEXTS.off);
    return `<button type="button" class="ac-reg-btn ac-push-tile${isOn() ? ' on' : ''}" data-acpush><b>${esc(TEXTS.tile)}</b><small>${esc(sub)}</small></button>`;
  }
  const paint = () => { const t = document.querySelector('.ac-push-tile'); if (t) t.outerHTML = tileHtml(); };

  async function registration() {
    const reg = await root.navigator.serviceWorker.register('store/acct/sw.js', { scope: 'store/acct/' });
    if (reg.active) return reg;
    const w = reg.installing || reg.waiting;
    await new Promise((ok) => { if (!w) return ok(); w.addEventListener('statechange', () => { if (w.state === 'activated') ok(); }); setTimeout(ok, 10000); });
    return reg;
  }
  async function turnOn() {
    if (!supported()) { note = TEXTS.unsupported; return; }
    const perm = root.Notification.permission === 'granted' ? 'granted' : await root.Notification.requestPermission();
    if (perm !== 'granted') { note = TEXTS.denied; return; }
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) });
    const r = await client.rpc('ar_account_push_save', { p_token: token, p_endpoint: sub.endpoint, p_on: true });
    if (r.error || !r.data || !r.data.ok) { note = TEXTS.fail; return; }
    setOn(true); note = '';
  }
  async function turnOff() {
    try {
      const reg = await registration(), sub = await reg.pushManager.getSubscription();
      if (sub) { await client.rpc('ar_account_push_save', { p_token: token, p_endpoint: sub.endpoint, p_on: false }); if (sub.unsubscribe) await sub.unsubscribe(); }
    } catch (e) { /* the server drops a dead address by itself */ }
    setOn(false); note = '';
  }
  // every open: a phone that has it on tells the server its address again (the push service may have changed it)
  async function resync() {
    if (!owner || !isOn() || !client || !token || !supported() || root.Notification.permission !== 'granted') return;
    try {
      const reg = await registration(), sub = await reg.pushManager.getSubscription();
      if (sub) await client.rpc('ar_account_push_save', { p_token: token, p_endpoint: sub.endpoint, p_on: true });
    } catch (e) { /* the next open tries again */ }
  }

  document.addEventListener('click', async (e) => {
    if (!e.target.closest || !e.target.closest('[data-acpush]') || busy || !client || !token) return;
    busy = true; note = ''; paint();
    try { if (isOn()) await turnOff(); else await turnOn(); } catch (err) { note = TEXTS.fail; }
    busy = false; paint();
  });

  root.AskerStoreAcctPush = {
    attach(c, t, isOwner) { client = c; token = t || ''; owner = !!isOwner; resync(); },
    tileHtml,
    isOn,
  };
})(typeof window === 'undefined' ? globalThis : window);
