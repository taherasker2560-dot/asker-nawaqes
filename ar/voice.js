/* «🎤» voice typing for the boxes where he writes to the system (owner 2026-11-22: «عايزك تعمل لي عند الحاجات اللي هي بقى انا بديلها اوامر بالكتابه دي زرار
   لمايك، بحيث ان انا اقول له على الحاجه بدل ما اكتبها وهو يكتبها، بس بنفس تعامله معاك كده زي ما انا ببعت لك» and «شوف ايه اللي محتاج الحاجات ديت واعمله منك لنفسك»).
   A button with data-voice="<css selector of its box>" sits next to an input or textarea. A tap = the phone listens (Chrome's own speech recognition, Egyptian Arabic, the
   words appear in the box while he speaks); a pause or a second tap = it stops. The words are ADDED to what is already in the box, like dictating on the keyboard; the box
   then gets its «input» and «change» events (screens that save when a box changes keep working); he still presses the box's own «ابعت» / save himself.
   The same single-sentence way as «ملاحظاتي» (ar/notes.js), which works on his phone; a screen drawn again while he speaks keeps the words (the box is found again by its selector).
   The system's music steps aside while he talks (ar/music.js). Nothing here sends anything anywhere. */
(function (root) {
  'use strict';
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  // the words so far: what was in the box before, then what he said (final and still being heard)
  const join = (base, fin, interim) => clean([base, fin, interim].filter(Boolean).join(' '));
  const api = { clean, join };
  root.AskerVoiceLib = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let rec = null, sel = '', base = '', fin = '', interim = '', toastTimer = 0;
  const box = () => { try { return sel ? document.querySelector(sel) : null; } catch (e) { return null; } };
  function toast(text) {
    let t = document.getElementById('voToast');
    if (!t) { t = document.createElement('div'); t.id = 'voToast'; t.className = 'vo-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 3500);
  }
  function mark() {
    document.querySelectorAll('[data-voice]').forEach((b) => {
      const on = !!rec && b.dataset.voice === sel;
      b.classList.toggle('rec', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function write() {
    const t = box();
    if (!t) return;
    const v = join(base, fin, interim), max = Number(t.maxLength) > 0 ? Number(t.maxLength) : 0;
    t.value = max ? v.slice(0, max) : v;
  }
  function fire() {
    const t = box();
    if (!t) return;
    t.dispatchEvent(new Event('input', { bubbles: true }));
    t.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const music = (on) => { try { if (root.AskerMusic) on ? root.AskerMusic.hold('rec') : root.AskerMusic.release('rec'); } catch (e) { /* no music */ } };
  function stop() { if (rec) { try { rec.stop(); } catch (e) { /* already stopped */ } } }
  function start(button) {
    const R = root.SpeechRecognition || root.webkitSpeechRecognition;
    if (!R) { toast('الميكروفون مش متاح على المتصفح ده. اكتب بإيدك.'); return; }
    if (rec) { const same = button.dataset.voice === sel; stop(); if (same) return; }
    let t = null; try { t = document.querySelector(button.dataset.voice); } catch (e) { t = null; }
    if (!t) return;
    sel = button.dataset.voice; base = clean(t.value); fin = ''; interim = '';
    const r = new R();
    r.lang = 'ar-EG'; r.continuous = false; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = (ev) => {
      let f = '', i = '';
      for (let k = 0; k < ev.results.length; k++) { const x = ev.results[k], s = clean(x && x[0] && x[0].transcript); if (!s) continue; if (x.isFinal) f = clean(f + ' ' + s); else i = clean(i + ' ' + s); }
      fin = f; interim = i; write();
    };
    r.onerror = (ev) => {
      const e = ev && ev.error;
      if (e === 'aborted') return;
      toast(e === 'not-allowed' || e === 'service-not-allowed' ? 'اسمح للمتصفح بالميكروفون الأول.' : e === 'no-speech' ? 'مسمعتش حاجة، دوس واتكلم تاني.' : 'مسمعتكش، قول تاني.');
    };
    r.onend = () => {
      interim = ''; write(); fire();
      const t2 = box();
      rec = null; sel = ''; mark(); music(false);
      if (t2) { try { t2.focus({ preventScroll: true }); const n = t2.value.length; if (t2.setSelectionRange) t2.setSelectionRange(n, n); } catch (e) { /* not focusable */ } }
    };
    rec = r; mark(); music(true);
    try { r.start(); } catch (e) { rec = null; sel = ''; mark(); music(false); toast('مسمعتكش، قول تاني.'); }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-voice]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    start(b);
  }, true);
  // a screen drawn again while he speaks makes a new button for the same box: it shows the listening state too
  new MutationObserver(() => { if (rec) mark(); }).observe(document.documentElement, { childList: true, subtree: true });
  root.AskerVoice = {
    // the button's html for a box (its css selector); screens put it right after the box
    button(selector, label) { return `<button type="button" class="vo-mic" data-voice="${esc(selector)}" aria-label="${esc(label || 'اتكلم بدل ما تكتب')}" title="${esc(label || 'اتكلم بدل ما تكتب')}">🎤</button>`; },
    stop,
    listening: () => !!rec,
  };
})(typeof window === 'undefined' ? globalThis : window);
