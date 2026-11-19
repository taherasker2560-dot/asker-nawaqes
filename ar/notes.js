/* «الرئيسية ← ملاحظاتي» (owner 2026-11-15: «مفكرة صوتية جوه السيستم … تفكرني بحاجة وانا في الصيدلية … اللاب هيخش على شبكة الصيدلية
   فتبتدي تنبهني التنبيهات ايه اللي انا محتاجها في الصيدلية، ويظهر لي زي بيان كده … اللي خلص ادوس عليه ان هو خلص»).
   - he writes a note or says it (the phone's own speech recognition, Egyptian Arabic) and taps «ضيف»;
   - a note «افتكرني في الصيدلية» waits; when the laptop says it is on the pharmacy network (ar_presence, written by the hub: it
     reaches the pharmacy server on the LAN) the card turns amber with «انت في الصيدلية: عندك N حاجة» and a bell plays ONCE per
     arrival; each note has «خلصت»;
   - the ones done today stay under «اتعملت» (with «رجّعها»).
   Tables ar_notes / ar_presence (migration 202611152000), the OWNER only. Nothing here writes to PharmaFly. */
(function (root) {
  'use strict';

  // ---------- pure helpers (also used by tests/notes.cjs) ----------
  const STALE_MIN = 25; // the laptop speaks every ~10 minutes; older than this = «I do not know where he is»
  const ms = (x) => { const t = Date.parse(x); return Number.isFinite(t) ? t : NaN; };
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/[.،]+$/, '').trim().slice(0, 500);
  // open notes oldest first (the oldest wait the longest); done notes newest first, only the last 36 hours
  function split(notes, now) {
    const t0 = (now == null ? Date.now() : now) - 36 * 36e5;
    const list = Array.isArray(notes) ? notes : [];
    const open = list.filter((n) => n.status === 'open').sort((a, b) => ms(a.created_at) - ms(b.created_at) || String(a.id).localeCompare(String(b.id)));
    const done = list.filter((n) => n.status === 'done' && !(ms(n.done_at) < t0)).sort((a, b) => ms(b.done_at) - ms(a.done_at));
    return { open, done };
  }
  // where the laptop says he is: in / out / unknown (no word, or an old one)
  function where(p, now) {
    if (!p || typeof p.at_pharmacy !== 'boolean') return 'unknown';
    const age = ((now == null ? Date.now() : now) - ms(p.checked_at)) / 6e4;
    if (!Number.isFinite(age) || age > STALE_MIN) return 'unknown';
    return p.at_pharmacy ? 'in' : 'out';
  }
  // the notes that wait for the pharmacy, when he is there
  const due = (notes, p, now) => (where(p, now) === 'in' ? split(notes, now).open.filter((n) => n.place === 'pharmacy') : []);
  // a bell once per arrival: «since» of the presence row names the arrival
  const shouldRing = (notes, p, seenSince, now) => due(notes, p, now).length > 0 && String(p.since) !== String(seenSince || '');
  function age(at, now) {
    const d = ((now == null ? Date.now() : now) - ms(at)) / 864e5;
    if (!Number.isFinite(d) || d < 0.8) return '';
    const n = Math.round(d);
    return n <= 1 ? 'من امبارح' : n === 2 ? 'من يومين' : `من ${n} أيام`;
  }
  const api = { STALE_MIN, clean, split, where, due, shouldRing, age };
  root.AskerNotesLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- the card ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const db = () => root.AskerApp && root.AskerApp.client;
  const SEEN = 'asker-notes-arrival';
  let notes = [], presence = null, loading = false, unavailable = false, listening = null;
  const seen = () => { try { return localStorage.getItem(SEEN) || ''; } catch (e) { return ''; } };
  const markSeen = (v) => { try { localStorage.setItem(SEEN, String(v)); } catch (e) {} };

  function draw() {
    const card = $('notesCard');
    if (!card) return;
    if (unavailable) { card.classList.add('hidden'); return; } // the tables are not on the server yet: no card
    card.classList.remove('hidden');
    const w = where(presence), s = split(notes), d = due(notes, presence);
    card.classList.toggle('nt-hot', d.length > 0);
    const pr = $('ntPresence');
    if (pr) {
      pr.className = 'nt-presence nt-' + w + (d.length ? ' hot' : '');
      pr.textContent = w === 'in' ? (d.length ? `انت في الصيدلية: عندك ${d.length} حاجة تعملها` : 'انت في الصيدلية') : w === 'out' ? 'انت برا الصيدلية' : 'مش عارف انت فين (اللاب ما بعتش من شوية)';
    }
    const li = $('ntList');
    if (li) {
      li.innerHTML = s.open.length ? s.open.map((n) => {
        const here = d.some((x) => x.id === n.id), a = age(n.created_at);
        return `<div class="nt-row${here ? ' due' : ''}" data-nt="${esc(n.id)}"><button type="button" class="nt-tick" data-nt-done="${esc(n.id)}" aria-label="خلصت">✓</button>` +
          `<span class="nt-t"><span class="nt-text notr" dir="auto">${esc(n.text)}</span><small>${n.place === 'pharmacy' ? 'في الصيدلية' : 'من غير تذكير'}${a ? ' · ' + esc(a) : ''}</small></span>` +
          `<button type="button" class="nt-x" data-nt-drop="${esc(n.id)}" aria-label="شيل">✕</button></div>`;
      }).join('') : '<p class="hint">مفيش حاجة مستنية. اكتب أو قول اللي عايز تفتكره.</p>';
    }
    const dn = $('ntDoneBox');
    if (dn) {
      dn.classList.toggle('hidden', !s.done.length);
      $('ntDoneCount').textContent = String(s.done.length);
      $('ntDone').innerHTML = s.done.map((n) => `<div class="nt-row done"><span class="nt-t"><span class="nt-text notr" dir="auto">${esc(n.text)}</span></span><button type="button" class="small secondary" data-nt-undo="${esc(n.id)}">رجّعها</button></div>`).join('');
    }
    const st = $('ntStatus');
    if (st && !st.dataset.keep) st.textContent = '';
    if (shouldRing(notes, presence, seen())) {
      markSeen(presence.since);
      try { root.AskerNotify && root.AskerNotify.play && root.AskerNotify.play('bell'); } catch (e) {}
    } else if (presence && where(presence) !== 'in') markSeen(presence.since); // leaving: the next arrival rings again
  }
  function say(msg, keep) {
    const st = $('ntStatus');
    if (!st) return;
    st.textContent = msg || '';
    if (keep) st.dataset.keep = '1'; else delete st.dataset.keep;
  }
  const missing = (e) => /schema cache|does not exist|Could not find|relation/i.test(String(e && (e.message || e)));
  async function load() {
    if (loading || !db()) return;
    loading = true;
    try {
      const [n, p] = await Promise.all([
        db().from('ar_notes').select('id,text,place,status,created_at,done_at').in('status', ['open', 'done']).order('created_at', { ascending: false }).limit(200),
        db().from('ar_presence').select('at_pharmacy,since,checked_at').eq('id', 1).maybeSingle(),
      ]);
      if (n.error) throw n.error;
      if (p.error) throw p.error;
      notes = n.data || []; presence = p.data || null; unavailable = false;
    } catch (e) {
      if (missing(e)) unavailable = true; else say('مقدرتش أجيب الملاحظات: ' + (e && e.message), true);
    } finally { loading = false; draw(); }
  }
  async function add() {
    const inp = $('ntText'), text = clean(inp && inp.value);
    if (!text || !db()) return;
    const place = $('ntPlace') && $('ntPlace').checked ? 'pharmacy' : 'any';
    const { error } = await db().from('ar_notes').insert({ text, place, status: 'open' });
    if (error) { say('مقدرتش أضيف: ' + error.message, true); return; }
    inp.value = '';
    say('', false);
    if (presence) markSeen(presence.since); // he is looking at the card: no bell for the note he just wrote
    await load();
  }
  async function change(id, patch) {
    const { error } = await db().from('ar_notes').update(patch).eq('id', isNaN(Number(id)) ? id : Number(id));
    if (error) { say('مقدرتش أعدّل: ' + error.message, true); return; }
    await load();
  }
  const done = (id) => change(id, { status: 'done', done_at: new Date().toISOString() });
  const undo = (id) => change(id, { status: 'open', done_at: null });
  const drop = (id) => change(id, { status: 'cancelled' });

  // the phone's own speech recognition (Chrome on Android), Egyptian Arabic; the words land in the box, he taps «ضيف»
  function mic() {
    const R = root.SpeechRecognition || root.webkitSpeechRecognition;
    const b = $('ntMic'), inp = $('ntText');
    if (!R || !inp) { say('الميكروفون مش متاح على المتصفح ده. اكتب الملاحظة.', true); return; }
    if (listening) { try { listening.stop(); } catch (e) {} return; }
    const r = new R();
    r.lang = 'ar-EG'; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (ev) => { const t = clean(ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript); if (t) inp.value = (inp.value ? inp.value + ' ' : '') + t; };
    r.onerror = (ev) => { say(ev && ev.error === 'not-allowed' ? 'اسمح للمتصفح بالميكروفون الأول.' : 'مسمعتكش، قول تاني.', true); };
    // the system's music steps aside while he dictates (ar/music.js, 2026-11-19): the phone's microphone would hear it
    const musicOff = (on) => { try { if (root.AskerMusic) on ? root.AskerMusic.hold('rec') : root.AskerMusic.release('rec'); } catch (e) { /* no music */ } };
    r.onend = () => { listening = null; b && b.classList.remove('rec'); musicOff(false); inp.focus(); };
    listening = r; b && b.classList.add('rec'); say('', false); musicOff(true);
    try { r.start(); } catch (e) { listening = null; b && b.classList.remove('rec'); musicOff(false); }
  }
  function bind() {
    const card = $('notesCard');
    if (!card) return;
    card.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('#ntAdd')) return add();
      if (t.closest('#ntMic')) return mic();
      const d = t.closest('[data-nt-done]'); if (d) return done(d.dataset.ntDone);
      const u = t.closest('[data-nt-undo]'); if (u) return undo(u.dataset.ntUndo);
      const x = t.closest('[data-nt-drop]'); if (x) return drop(x.dataset.ntDrop);
    });
    $('ntText')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    // a quick look every 30 seconds while «الرئيسية» is open and the bot is signed in; the first one as soon as it is
    const tick = () => { const h = $('homePanel'); if (h && !h.classList.contains('hidden') && db() && !$('app')?.classList.contains('hidden')) load(); };
    setInterval(tick, 30000);
    setTimeout(tick, 2500);
    setTimeout(tick, 7000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
  root.AskerNotes = { refresh: load, list: () => notes };
})(typeof window === 'undefined' ? globalThis : window);
