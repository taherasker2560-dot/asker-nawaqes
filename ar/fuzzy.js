// Smart search shared by «النواقص» and «المخازن» (owner, 2026-11-08): type some letters of the name in order and skip
// the rest (the first letter, skip the second, then the third, the fourth, the last…). Letters that sound alike count as
// one (ط/ت، ص/س/ث، ض/د، ظ/ذ/ز، ق/ك، ة/ه، ى/ي، أ/إ/آ/ا), and in a word of 5+ letters one wrong letter is forgiven.
// Each word typed must be found; the closest names come first (word starts and letters side by side count more).
(function (root) {
  const FOLD = {
    'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ی': 'ي', 'ئ': 'ي', 'ؤ': 'و', 'ة': 'ه', 'ھ': 'ه', 'ۀ': 'ه',
    'ک': 'ك', 'ق': 'ك', 'گ': 'ك', 'ط': 'ت', 'ث': 'س', 'ص': 'س', 'ض': 'د', 'ظ': 'ز', 'ذ': 'ز', 'پ': 'ب', 'ڤ': 'ف', 'ء': '',
  };
  // one spelling for searching: western digits, no diacritics or tatweel, sound-alike letters merged, lower case
  function fold(s) {
    return String(s ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[؀-ۿ]/g, (c) => (c in FOLD ? FOLD[c] : c))
      .replace(/(\p{L})(\p{N})/gu, '$1 $2')
      .replace(/(\p{N})(\p{L})/gu, '$1 $2')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }
  // the words typed, folded; '' or only spaces = no search
  const words = (q) => fold(q).split(' ').filter(Boolean);

  const isSub = (t, h) => {
    let i = 0;
    for (let j = 0; j < h.length && i < t.length; j++) if (h[j] === t[i]) i++;
    return i === t.length;
  };
  // best way to place the letters of one word t, in order, inside the name h (folded, with spaces):
  // +1 a letter; the first letter +2 at the start of a word (+3 more at the very start of the name);
  // +1.5 right after the previous letter; -0.15 for every letter skipped in between, -1 for every space crossed
  // (a word typed is usually part of one word of the name). -Infinity = not there.
  const gap = (c) => (c === ' ' ? 1 : 0.15);
  // strict (the warehouses' lines that are not one of our items, owner 2026-11-13 «اصناف تانية غريبة ملهاش علاقة»):
  // a typed word stays inside one word of the name; only the space itself may be skipped («ابكير» finds «اب كير»),
  // so «ابيمول» no longer finds «اب كير امبول» (ا ب | ي | م و ل picked from three words)
  function place(t, h, strict) {
    const n = h.length, m = t.length;
    let prev = new Array(n).fill(-Infinity), cur = new Array(n).fill(-Infinity);
    for (let i = 0; i < m; i++) {
      let run = -Infinity; // best earlier placement of letter i-1 that leaves a gap, already charged for it
      for (let j = 0; j < n; j++) {
        if (i > 0 && j >= 2) {
          if (strict && h[j - 1] === ' ') run = -Infinity; // a gap never crosses a space
          else { const g = gap(h[j - 1]); run = Math.max(run - g, prev[j - 2] - g); }
        }
        if (h[j] !== t[i]) { cur[j] = -Infinity; continue; }
        const start = i === 0 && (j === 0 || h[j - 1] === ' ');
        const s = 1 + (start ? 2 : 0) + (i === 0 && j === 0 ? 3 : 0);
        if (i === 0) cur[j] = s - 0.01 * j;
        else {
          const side = j >= 1 && prev[j - 1] > -Infinity ? prev[j - 1] + 1.5 : -Infinity;
          const hop = strict && j >= 2 && h[j - 1] === ' ' && prev[j - 2] > -Infinity ? prev[j - 2] - 1 : -Infinity;
          const best = Math.max(side, run, hop);
          cur[j] = best > -Infinity ? s + best : -Infinity;
        }
      }
      [prev, cur] = [cur, prev];
    }
    let best = -Infinity;
    for (let j = 0; j < n; j++) if (prev[j] > best) best = prev[j];
    return best;
  }
  // one word against one name: in order with skips; else (5+ letters, not a number) the same word with one letter left out
  function wordScore(t, h, strict) {
    if (!h) return -Infinity;
    if (isSub(t, h)) return place(t, h, strict);
    // strict forgives no letter: «شامبو» found «امبروبيم» and «ابيمول» found «ابيرازول» (one letter left out)
    if (strict || t.length < 5 || /\d/.test(t)) return -Infinity;
    let best = -Infinity;
    for (let k = 0; k < t.length; k++) {
      const v = t.slice(0, k) + t.slice(k + 1);
      if (isSub(v, h)) best = Math.max(best, place(v, h, strict) - 2);
    }
    return best;
  }
  // a query (from words()) against one or more folded names: every word must be found in the same name; the best name wins.
  // A name can be [folded, minus] to count less (e.g. our PharmaFly name next to the warehouse's own Arabic name).
  // Shorter names win a tie. -Infinity = no match.
  function scoreOf(ws, names, strict) {
    let best = -Infinity;
    for (const x of names) {
      const [h, minus] = Array.isArray(x) ? x : [x, 0];
      if (!h) continue;
      let sum = 0;
      for (const t of ws) {
        const s = wordScore(t, h, strict);
        if (s === -Infinity) { sum = -Infinity; break; }
        sum += s;
      }
      if (sum > -Infinity) best = Math.max(best, sum - 0.005 * h.length - (minus || 0));
    }
    return best;
  }
  const score = (ws, ...names) => scoreOf(ws, names, false);
  // what the typed words would score written in full at the start of a word: the measure for opts.min
  const full = (ws) => ws.reduce((a, t) => a + 3 + 2.5 * (t.length - 1), 0);
  // the items that match, best first (ties keep the given order); foldedNames(item) = the item's folded names.
  // opts.strict: every typed word inside one word of the name; opts.min: keep only names scoring at least this share of
  // the full score (0.6 = the owner's way «ابرفستن» still passes at 0.8, letters picked far apart do not)
  function rank(q, items, foldedNames, limit, opts) {
    const ws = words(q);
    if (!ws.length) return items.slice(0, limit || items.length);
    const strict = !!(opts && opts.strict), floor = opts && opts.min ? opts.min * full(ws) : -Infinity;
    const hits = [];
    items.forEach((it, i) => {
      const s = scoreOf(ws, foldedNames(it), strict);
      if (s > -Infinity && s >= floor) hits.push([s, i, it]);
    });
    hits.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    return hits.slice(0, limit || hits.length).map((x) => x[2]);
  }
  const api = { fold, words, score, rank };
  if (typeof module !== 'undefined') module.exports = api;
  root.AskerFuzzy = api;
})(typeof window === 'undefined' ? globalThis : window);
