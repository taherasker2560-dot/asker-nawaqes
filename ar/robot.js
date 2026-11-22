/* «🤖 الروبوت محتاج رأيك» (owner 2026-11-22: «لو هو الروبوت بتاعنا لو واقف في حاجه يبعت لي رساله عليه علشان اقول له يعمل فيها ايه … يديني زي تقرير كده»;
   «والاشعار ان الريموت عايز مني حاجه، ده يبقى اشعار صوتي في الموبايل»; mockup robot_sales_tools_2026-11-22, his «نفس الخطة»).
   When the sales robot on the laptop stops on something (a credit bill over the limit with no approval of his, an item it cannot find, a message it does not know)
   it writes a report in ar_robot_reports (migration 202611220100) with the answers it understands. Here the owner sees them at the top of «البيع المؤقت»,
   taps one of the answers or writes his own words, and the robot reads it and goes on. ar/notify.js counts the open ones every minute: a red number, the
   «محتاج شغل» row on the home, its sound, a phone notification and the sentence said out loud. Owner only (the server shows the reports to nobody else). */
(function (root) {
  'use strict';
  // ---------- pure helpers (also used by tests) ----------
  // the answers of a report as buttons: only well formed ones ({key, label}), at most 6
  function options(r) {
    const list = r && Array.isArray(r.options) ? r.options : [];
    return list.filter((o) => o && typeof o.key === 'string' && o.key && typeof o.label === 'string' && o.label).slice(0, 6);
  }
  const ERR = { 'owner-only': 'الرد لصاحب الصيدلية بس.', empty: 'اختار رد أو اكتب له تعمل إيه.', missing: 'السؤال ده مش موجود.', state: 'السؤال ده اترد عليه قبل كده.', option: 'الرد ده الروبوت مش فاهمه.' };
  const errText = (code) => ERR[code] || 'ماتبعتش. جرّب تاني.';
  const api = { options, errText };
  root.AskerRobotLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the page ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const isStaff = () => !!(root.AskerStaff && root.AskerStaff.isStaff && root.AskerStaff.isStaff());
  let reports = [], busy = false, msg = '', bound = false;
  const clock = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' }); };

  // the box at the top of «البيع المؤقت» (made here, so the page's HTML stays as it is)
  function box() {
    let el = $('rbBox');
    const panel = $('tempSalePanel');
    if (!el && panel) {
      el = document.createElement('div');
      el.id = 'rbBox'; el.className = 'rb-box hidden';
      panel.insertBefore(el, panel.firstChild);
    }
    return el;
  }
  function draw() {
    const el = box();
    if (!el) return;
    el.classList.toggle('hidden', !reports.length && !msg);
    el.innerHTML = (reports.length ? `<h3 class="rb-h"><span>🤖 الروبوت محتاج رأيك</span> <span class="rb-n">${reports.length}</span></h3>` : '') +
      reports.map((r) => `<div class="rb-card" data-rb="${esc(r.id)}">
        <div class="rb-title notr">${esc(r.title)}</div>
        ${r.details ? `<div class="rb-details notr">${esc(r.details)}</div>` : ''}
        <div class="rb-when">${esc(clock(r.created_at))}</div>
        ${options(r).length ? `<div class="rb-opts">${options(r).map((o, i) => `<button type="button" class="${i === 0 ? 'rb-main' : 'secondary'}" data-rb-key="${esc(o.key)}"${busy ? ' disabled' : ''}><span class="notr">${esc(o.label)}</span></button>`).join('')}</div>` : ''}
        <div class="rb-own"><input type="text" maxlength="1000" autocomplete="off" placeholder="أو اكتب له تعمل إيه…" aria-label="اكتب للروبوت" data-rb-text /><button type="button" class="secondary" data-rb-send${busy ? ' disabled' : ''}>ابعت</button></div>
      </div>`).join('') +
      (msg ? `<p class="status rb-msg">${esc(msg)}</p>` : '');
  }
  async function load() {
    if (!db() || isStaff()) { reports = []; return draw(); }
    try {
      const { data, error } = await db().from('ar_robot_reports').select('id,created_at,job,ref_id,title,details,options,status').eq('status', 'open').order('created_at', { ascending: true }).limit(20);
      reports = error ? [] : data || [];   // the table is not on the server yet: nothing shows
    } catch (e) { reports = []; }
    draw();
  }
  async function answer(id, key, text) {
    if (busy || !db()) return;
    busy = true; msg = ''; draw();
    try {
      const { data, error } = await db().rpc('ar_robot_answer', { p_id: Number(id), p_key: key || null, p_text: text || null });
      if (error) throw error;
      if (!data || !data.ok) { msg = errText(data && data.error); }
      else { reports = reports.filter((r) => String(r.id) !== String(id)); msg = 'اتبعت للروبوت ✓'; }
    } catch (e) { msg = errText(); }
    busy = false; draw();
    if (root.AskerNotify && root.AskerNotify.tick) root.AskerNotify.tick();
  }
  function bind() {
    if (bound) return;
    const el = box();
    if (!el) return;
    bound = true;
    el.addEventListener('click', (e) => {
      const card = e.target.closest('[data-rb]');
      if (!card) return;
      const k = e.target.closest('[data-rb-key]');
      if (k) { answer(card.dataset.rb, k.dataset.rbKey, ''); return; }
      if (e.target.closest('[data-rb-send]')) {
        const inp = card.querySelector('[data-rb-text]'), t = inp ? inp.value.trim() : '';
        if (!t) { msg = errText('empty'); draw(); return; }
        answer(card.dataset.rb, '', t);
      }
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-rb-text]')) { e.preventDefault(); e.target.closest('[data-rb]')?.querySelector('[data-rb-send]')?.click(); } });
  }
  function open() { msg = ''; bind(); load(); }
  root.AskerRobot = { open, load, reports: () => reports };
})(typeof window === 'undefined' ? globalThis : window);
