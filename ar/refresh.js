/* «حدّث النواقص دلوقتي» (النواقص العامة ← القايمة): the owner asks the laptop for a shortage update right now, e.g. after the
   purchases are entered in PharmaFly (owner's choice «ب», 2026-11-09). The tap adds one row to ar_refresh_requests (migration
   202611090600, owner only). The laptop looks for a waiting row every few minutes (Hub\REFRESH_WATCH.ps1), runs the hub (newest
   pharmacy backup, export, send the list: the phone then says «النواقص اتحدثت…» as for any update) and says how it ended.
   Until that migration is applied the table is not there: the box stays hidden. Nothing is sent or changed from this page. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/refresh-ui.cjs) ----------
  const POLL_MS = 20000; // while a request is open, look again every 20 seconds
  const pad = (n) => String(n).padStart(2, '0');
  // «النهارده 4:30 م» / «امبارح 11:05 ص» / «07/11 2:10 م»
  function when(iso, now = new Date()) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const day = (x) => x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const h = d.getHours(), t = (h % 12 || 12) + ':' + pad(d.getMinutes()) + (h < 12 ? ' ص' : ' م');
    if (day(d) === day(now)) return 'النهارده ' + t;
    if (day(d) === day(y)) return 'امبارح ' + t;
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + t;
  }
  const isOpen = (row) => !!row && (row.status === 'new' || row.status === 'running');
  // the line under the button for the newest request
  function describe(row, now = new Date()) {
    if (!row) return { text: '', kind: '', open: false };
    if (row.status === 'new') return { text: `اتطلب التحديث ${when(row.requested_at, now)}. اللاب بياخده خلال 5 دقايق.`, kind: '', open: true };
    if (row.status === 'running') return { text: `اللاب شغّال على التحديث من ${when(row.started_at || row.requested_at, now)}. بياخد حوالي 5 دقايق، والموبايل هيقول لما يخلص.`, kind: '', open: true };
    if (row.status === 'done') return { text: `آخر تحديث طلبته خلص ${when(row.finished_at || row.requested_at, now)}.`, kind: 'good', open: false };
    return { text: `آخر تحديث طلبته ما خلصش (${when(row.finished_at || row.requested_at, now)})${row.note ? ': ' + row.note : ''}. جرّب تاني.`, kind: 'bad', open: false };
  }
  const api = { POLL_MS, when, isOpen, describe };
  root.AskerRefreshLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the button ----------
  const $ = (id) => document.getElementById(id);
  const db = () => root.AskerApp && root.AskerApp.client;
  let timer = null, busy = false;

  function say(d) {
    const el = $('rfStatus');
    if (!el) return;
    el.textContent = d.text;
    el.className = 'status' + (d.kind ? ' ' + d.kind : '');
    $('rfBtn').disabled = busy || d.open;
  }
  async function open() {
    if (!db() || !$('rfBox')) return;
    clearTimeout(timer);
    try {
      const { data, error } = await db().from('ar_refresh_requests').select('id,requested_at,reason,status,started_at,finished_at,note').order('id', { ascending: false }).limit(1);
      if (error) throw error;
      $('rfBox').classList.remove('hidden');
      const d = describe((data || [])[0]);
      say(d);
      if (d.open) timer = setTimeout(open, POLL_MS);
    } catch (e) {
      $('rfBox').classList.add('hidden'); // the table is not there yet (migration not applied) or cannot be read
    }
  }
  async function ask() {
    if (busy) return;
    busy = true;
    $('rfBtn').disabled = true;
    try {
      const { error } = await db().from('ar_refresh_requests').insert({ reason: 'manual', status: 'new' });
      if (error && !/duplicate|unique/i.test(error.message || '')) throw error;
      busy = false;
      await open();
      if (error) $('rfStatus').textContent = 'فيه طلب تحديث مستني بالفعل. ' + $('rfStatus').textContent;
    } catch (e) {
      busy = false;
      say({ text: 'مقدرتش أطلب التحديث: ' + (e.message || e), kind: 'bad', open: false });
    }
  }
  $('rfBtn')?.addEventListener('click', ask);
  // first look once the owner is signed in (the page opens on this tab)
  let tries = 0;
  const boot = setInterval(() => {
    if (++tries > 120) return clearInterval(boot);
    if (db() && $('app') && !$('app').classList.contains('hidden')) {
      clearInterval(boot);
      open();
    }
  }, 500);
  root.AskerRefresh = { open };
})(typeof window === 'undefined' ? globalThis : window);
