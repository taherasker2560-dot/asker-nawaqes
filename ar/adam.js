/* «آدم» opens the bot for the owner (owner 2026-11-14: «ابعت لحد حسابه … او اغير لون البوت او اعمل اي حاجه يعملها، يتحكم بدالي»).
   The Android app (adam-android/) opens this page with its commands in the address (one ?adam=… each), after Adam has answered by voice:
     ?adam=go:sales              a section (the same keys as ?tab=: short, read, drafts, stock, customers, vendors, sales, tempsale ...)
     ?adam=cust:123              a customer's statement
     ?adam=find:بانادول          the search on top with that word
     ?adam=theme:green[:n|:d]    the color (a ready color's id, or hex-1d6f48 for any color); :n night look, :d day look
     ?adam=undo                  back to the color / look before Adam's last change («رجّعه»)
   It works through the buttons' own code (AskerApp.showTab, AskerCustomers.statement, the search box, AskerSettings) with the
   owner's own sign-in on the phone. It writes nothing to the server: sending and account changes never come through here. */
(function (root) {
  'use strict';
  const TABS = ['home', 'short', 'read', 'translate', 'drafts', 'docs', 'suppliers', 'stock', 'count', 'expiry', 'customers', 'vendors', 'storeorders', 'sales', 'tempsale', 'care'];
  const KEY = 'asker-accent', NIGHT = 'asker-night', UNDO = 'asker-adam-undo';

  // the one command in the address: {verb, arg} or null (anything unknown or oddly shaped is ignored)
  function parse(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s || s.length > 120 || /[\u0000-\u001f]/.test(s)) return null;
    if (s === 'undo') return { verb: 'undo', arg: '' };
    const i = s.indexOf(':');
    if (i < 1) return null;
    const verb = s.slice(0, i), arg = s.slice(i + 1);
    if (verb === 'go') return TABS.includes(arg) ? { verb, arg } : null;
    if (verb === 'cust') return /^\d{1,12}$/.test(arg) ? { verb, arg } : null;
    if (verb === 'find') { const q = arg.trim(); return q && q.length <= 80 ? { verb, arg: q } : null; }
    if (verb === 'theme') {
      const m = /^([a-z]{3,12}|hex-[0-9a-f]{6})(?::([nd]))?$/i.exec(arg);
      return m ? { verb, arg: m[1].toLowerCase(), night: m[2] ? m[2].toLowerCase() : '' } : null;
    }
    return null;
  }
  const api = { parse, TABS };
  root.AskerAdamLib = api;
  if (typeof document === 'undefined') return;

  const $ = (id) => document.getElementById(id);
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };

  // a small line at the bottom that says what Adam did; «رجّعه» for the color
  let toastTimer = 0;
  function toast(text, undo) {
    let el = $('adamToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'adamToast';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:84px;z-index:9999;background:#1d2433;color:#fff;border-radius:16px;padding:10px 14px;font-size:15px;display:flex;gap:12px;align-items:center;justify-content:space-between;box-shadow:0 6px 24px rgba(0,0,0,.3)';
      document.body.appendChild(el);
    }
    el.innerHTML = '';
    const t = document.createElement('span');
    t.textContent = text;
    el.appendChild(t);
    if (undo) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'رجّعه';
      b.style.cssText = 'background:#fff;color:#1d2433;border:0;border-radius:12px;padding:6px 14px;font-weight:700;font-size:14px';
      b.addEventListener('click', () => { run({ verb: 'undo', arg: '' }); });
      el.appendChild(b);
    }
    el.style.display = 'flex';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = 'none'; }, 12000);
  }

  function setLook(accent, night) {
    put(KEY, accent);
    put(NIGHT, night ? '1' : '');
    root.AskerSettings?.apply?.();
  }
  function theme(cmd) {
    const presets = root.AskerSettings?.PRESETS || [];
    let accent = null;
    if (/^hex-/.test(cmd.arg)) accent = 'c:#' + cmd.arg.slice(4);
    else if (presets.some((p) => p.id === cmd.arg)) accent = cmd.arg;
    if (!accent) return toast('مش لاقي اللون ده');
    // what it was, to give it back («رجّعه»)
    put(UNDO, JSON.stringify({ a: get(KEY) || 'asker', n: get(NIGHT) === '1' }));
    const night = cmd.night === 'n' ? true : cmd.night === 'd' ? false : get(NIGHT) === '1';
    setLook(accent, night);
    toast('آدم غيّر اللون', true);
  }
  function undo() {
    let u = null;
    try { u = JSON.parse(get(UNDO) || 'null'); } catch (e) {}
    if (!u || typeof u.a !== 'string') return toast('مفيش حاجة أرجّعها');
    const now = { a: get(KEY) || 'asker', n: get(NIGHT) === '1' };
    setLook(u.a, !!u.n);
    put(UNDO, JSON.stringify(now)); // «رجّعه» twice goes forward again
    toast('رجّعت اللون');
  }
  async function customer(id) {
    root.AskerApp?.showTab?.('customers');
    // the statement opens once the list is loaded
    for (let i = 0; i < 40; i++) {
      if ((root.AskerCustomers?.list?.() || []).some((c) => String(c.id) === String(id))) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    root.AskerCustomers?.statement?.(Number(id));
  }
  function find(q) {
    root.AskerApp?.showTab?.('home');
    const box = $('hsQ');
    if (!box) return;
    box.value = q;
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.focus();
  }
  function run(cmd) {
    if (!cmd) return;
    if (cmd.verb === 'go') root.AskerApp?.showTab?.(cmd.arg);
    else if (cmd.verb === 'cust') customer(cmd.arg);
    else if (cmd.verb === 'find') find(cmd.arg);
    else if (cmd.verb === 'theme') theme(cmd);
    else if (cmd.verb === 'undo') undo();
  }
  api.run = run;

  // the commands (one ?adam=… each, at most 4) are taken once the app is on screen (after the sign-in), then removed from the address
  let pending = [];
  function take() {
    const raws = new URLSearchParams(location.search).getAll('adam');
    const h = /^#adam=(.+)$/.exec(location.hash);
    if (h) { try { raws.push(decodeURIComponent(h[1])); } catch (e) { raws.push(h[1]); } }
    if (!raws.length) return;
    pending = raws.slice(0, 4).map(parse).filter(Boolean);
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    flush();
  }
  function flush() {
    const app = $('app');
    if (!pending.length || !app || app.classList.contains('hidden')) return;
    const list = pending;
    pending = [];
    list.forEach((c, i) => setTimeout(() => run(c), 500 + i * 400));
  }
  function bind() {
    take();
    const app = $('app');
    if (app) new MutationObserver(flush).observe(app, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('hashchange', take);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(typeof window === 'undefined' ? globalThis : window);
