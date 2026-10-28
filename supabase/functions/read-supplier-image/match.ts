// ASKER V10 — maps a supplier's name (Arabic as read from the image + Gemini's Latin guess) to the
// pharmacy's own item list (ASKER_ITEMS export). The catalogue is a reference for reading only; the target
// list (shortages) is compared in the page. Strength numbers read from the image must all appear in the item.

export type CatalogItem = [id: string, name: string, alts?: string[]];
export type Candidate = { id: string; name: string; score: number; numbersOk: boolean; formOk?: boolean; brandOk?: boolean };
// Below this score an item is never offered to the owner as "this one?" (the editor still lists it).
export const OFFER_MIN = 0.45;
export type Match = { id: string; name: string; score: number; confidence: 'confirmed' | 'high' | 'review'; via?: 'alias' };

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

// Words that describe form, unit or status rather than the product: they must not drive the match.
const STOP = new Set([
  'مجم', 'ملجم', 'مج', 'ملغ', 'جم', 'جرام', 'مل', 'ملي', 'قرص', 'اقراص', 'تاب', 'كبسول', 'كبسوله', 'كبسولات', 'شراب',
  'امبول', 'امبولات', 'فيال', 'حقن', 'كريم', 'جل', 'جيل', 'مرهم', 'نقط', 'نقطه', 'قطره', 'بخاخ', 'لبوس', 'كيس', 'اكياس',
  'غسول', 'لوسيون', 'لوشن', 'سبراي', 'اسبراي', 'برطمان', 'شريط', 'عادي', 'جديد', 'قديم', 'انتبه', 'بديل', 'فوار',
  'صغير', 'كبير', 'وحده', 'وحدة', 'محلول', 'معلق', 'فم', 'للفم', 'عضل', 'وريدي',
  'MG', 'MCG', 'ML', 'G', 'GM', 'GR', 'TAB', 'TABS', 'TABLET', 'TABLETS', 'CAP', 'CAPS', 'CAPSULE', 'CAPSULES', 'SYP', 'SYRUP',
  'SUSP', 'SUSPENSION', 'AMP', 'AMPS', 'AMPOULE', 'VIAL', 'VIALS', 'INJ', 'CREAM', 'CR', 'GEL', 'OINT', 'OINTMENT', 'DROPS',
  'DROP', 'DRP', 'SPRAY', 'SUPP', 'SUPPOSITORIES', 'SACH', 'SACHET', 'SACHETS', 'LOTION', 'WASH', 'SOL', 'SOLUTION',
  'EFF', 'EFFERVESCENT', 'FC', 'IU', 'CC', 'NEW', 'OLD', 'SR', 'XR', 'ER', 'MR', 'PLUS',
]);

export function normalize(s: string): string {
  return String(s || '')
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[گک]/g, 'ك').replace(/ی/g, 'ي').replace(/پ/g, 'ب').replace(/ڤ/g, 'ف').replace(/چ/g, 'ج').replace(/ژ/g, 'ز').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/[ً-ْـ]/g, '')
    .toUpperCase()
    .replace(/(\d)[,٫](\d)/g, '$1.$2')
    .replace(/(\d)(?=[^\d.\/\s])/g, '$1 ').replace(/([^\d.\/\s])(?=\d)/g, '$1 ')
    .replace(/[^\p{L}\p{N}.\/]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

// Key used for confirmed names: the normalized supplier name.
export function aliasKey(s: string): string { return normalize(s).slice(0, 250); }

export function numbers(s: string): string[] {
  return [...new Set((normalize(s).match(/\d+(?:\.\d+)?/g) || []).map((n) => String(parseFloat(n))))];
}

// A number followed by a pack word (قرص، كيس، TAB…) after an earlier number is a pack count (٢٨ قرص);
// every other number is treated as strength (١٠٠ مجم، ٢٠٠ اقراص، 5/500). Strength must match; counts only lower the score.
const COUNT_UNITS = new Set(['قرص', 'اقراص', 'كيس', 'اكياس', 'كبسول', 'كبسوله', 'كبسولات', 'امبول', 'امبولات', 'فيال', 'شريط', 'لبوس', 'فيلم',
  'TAB', 'TABS', 'T', 'CAP', 'CAPS', 'C', 'SACH', 'SACHET', 'SACHETS', 'AMP', 'AMPS', 'A', 'VIAL', 'VIALS', 'SUPP', 'FILM', 'FILMS', 'STRIP']);
export function strengthAndCount(s: string): { strength: string[]; count: string[] } {
  const tokens = normalize(s).split(' ');
  const strength: string[] = [], count: string[] = [];
  let seenNumber = false;
  tokens.forEach((t, i) => {
    for (const n of t.match(/\d+(?:\.\d+)?/g) || []) {
      const v = String(parseFloat(n));
      if (seenNumber && /^\d+(?:\.\d+)?$/.test(t) && COUNT_UNITS.has(tokens[i + 1] || '')) count.push(v); else strength.push(v);
      seenNumber = true;
    }
  });
  return { strength: [...new Set(strength)], count: [...new Set(count)] };
}

// Dosage form groups, from the owner's list of abbreviations (28 Oct 2026). A suppository must not match an
// ampoule: when both names state a form and none agree, the item gets formOk=false, a lower score, and is never
// a clear match or a shortage suggestion. فوار is listed by the owner under sachets and granules; an
// effervescent tablet still matches because the item name also says TAB.
const FORMS: Record<string, string[]> = {
  tablet: ['قرص', 'اقراص', 'حبوب', 'حبه', 'تاب', 'TAB', 'TABS', 'TABLET', 'TABLETS'],
  capsule: ['كبسول', 'كبسوله', 'كبسولات', 'CAP', 'CAPS', 'CAPSULE', 'CAPSULES'],
  liquid: ['شراب', 'معلق', 'SYP', 'SYR', 'SYRUP', 'SUSP', 'SUSPENSION'],
  drops: ['نقط', 'نقطه', 'قطره', 'DROPS', 'DROP', 'DRP'],
  powder: ['بودره', 'POWDER', 'PWD'],
  spray: ['سبراي', 'اسبراي', 'بخاخ', 'SPRAY'],
  supp: ['لبوس', 'اقماع', 'SUP', 'SUPP', 'SUPPOSITORY', 'SUPPOSITORIES', 'OVULE', 'OVULES', 'OVL'],
  pen: ['قلم', 'PEN', 'PENFILL', 'FLEXPEN', 'CARTRIDGE'],
  inhaler: ['بخاخه', 'INHALER', 'EVOHALER', 'ACCUHALER', 'DISKUS', 'TURBUHALER'],
  mouthwash: ['مضمضه', 'MW', 'M.W'],
  vdouche: ['دوش', 'VG', 'DOUCHE', 'DOUCH'],
  amp: ['امبول', 'امبولات', 'AMP', 'AMPS', 'AMPOULE', 'AMPOULES', 'OMPOULES'],
  vial: ['فيال', 'VIAL', 'VIALS', 'VL'],
  cream: ['كريم', 'CREAM'],
  gel: ['جل', 'جيل', 'GEL', 'EMULGEL', 'ايمولجيل'],
  ointment: ['مرهم', 'OINT', 'OINTMENT'],
  shampoo: ['شامبو', 'SHAMPOO'],
  oil: ['زيت', 'OIL'],
  lotion: ['لوشن', 'لوسيون', 'LOTION'],
  soap: ['صابون', 'صابونه', 'SOAP'],
  cleanser: ['غسول', 'CLEANSER', 'WASH'],
  sachet: ['كيس', 'اكياس', 'فوار', 'فواره', 'حبيبات', 'SACH', 'SACHET', 'SACHETS', 'SACHESTS', 'GRANULES', 'EFF', 'EFFERVESCENT'],
};
// Words that make a form more specific: لبوس مهبلي, سبراي للفم, لوشن للشعر, mouth wash.
const VAGINAL = new Set(['مهبلي', 'مهبليه', 'VAGINAL', 'VAG', 'OVULE', 'OVULES', 'OVL']);
const MOUTH = new Set(['فم', 'للفم', 'الفم', 'MOUTH', 'ORAL']);
const HAIR = new Set(['شعر', 'للشعر', 'الشعر', 'HAIR']);
// A specific form also agrees with its general form (a mouth spray is still a spray) but not with a sibling.
const PARENT: Record<string, string> = { inhaler: 'spray', vsupp: 'supp', mouthspray: 'spray', hairspray: 'spray', hairlotion: 'lotion', vdouche: 'cleanser', mouthwash: 'cleanser' };
// Supplier lists often write اقراص/حبوب for capsules and the other way round.
const CLOSE = new Set(['tablet|capsule', 'capsule|tablet']);
// "حقن / INJ" can be an ampoule or a vial.
const EITHER: Record<string, string[]> = { حقن: ['amp', 'vial'], INJ: ['amp', 'vial'], INJECTION: ['amp', 'vial'] };
const FORM_OF = new Map<string, string>();
for (const [g, ws] of Object.entries(FORMS)) for (const w of ws) FORM_OF.set(w, g);
// One-letter packs used by the item list right after a count (30T, 6A, 20C); never on their own (VITAMIN A).
const SHORT_FORM: Record<string, string> = { T: 'tablet', C: 'capsule', A: 'amp' };
// Words with inner dots (VAG.OVULES, I.V., M.W) are kept whole and also split into their parts.
function splitDots(s: string): string[] {
  const out: string[] = [];
  for (const raw of normalize(s).split(' ')) {
    const t = raw.replace(/^\.+|\.+$/g, '');
    if (!t) continue;
    out.push(t);
    if (t.includes('.')) for (const p of t.split('.')) if (p.length > 1) out.push(p);
  }
  return out;
}
export function forms(s: string): Set<string> {
  const out = new Set<string>();
  const tokens = splitDots(s);
  const vag = tokens.some((t) => VAGINAL.has(t)), mouth = tokens.some((t) => MOUTH.has(t)), hair = tokens.some((t) => HAIR.has(t));
  tokens.forEach((t, i) => {
    for (const e of EITHER[t] || []) out.add(e);
    let g = FORM_OF.get(t) || (SHORT_FORM[t] && /^\d/.test(tokens[i - 1] || '') ? SHORT_FORM[t] : undefined);
    if (!g) return;
    if (g === 'supp' && vag) g = 'vsupp';
    else if (g === 'cleanser' && vag) g = 'vdouche';
    else if (g === 'cleanser' && mouth) g = 'mouthwash';
    else if (g === 'spray' && mouth) g = 'mouthspray';
    else if (g === 'spray' && hair) g = 'hairspray';
    else if (g === 'lotion' && hair) g = 'hairlotion';
    out.add(g);
  });
  return out;
}
// Injection route: وريدي (I.V) is a different item from عضل (I.M).
const ROUTE: Record<string, string> = { وريد: 'iv', وريدي: 'iv', IV: 'iv', 'I.V': 'iv', عضل: 'im', عضلي: 'im', IM: 'im', 'I.M': 'im' };
function routes(s: string): Set<string> {
  const out = new Set<string>();
  for (const t of splitDots(s)) { const r = ROUTE[t]; if (r) out.add(r); }
  return out;
}
export function routesAgree(a: string, b: string): boolean {
  const x = routes(a), y = routes(b);
  return !x.size || !y.size || [...x].some((r) => y.has(r));
}
export function formsAgree(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return true;
  for (const x of a) for (const y of b) if (x === y || PARENT[x] === y || PARENT[y] === x || CLOSE.has(x + '|' + y)) return true;
  return false;
}

function words(s: string): string[] {
  return normalize(s).replace(/[\d.\/]+/g, ' ').split(' ').filter((w) => w.length >= 2 && !STOP.has(w));
}

// The suppliers' font makes ك look like ق, and a first ك like ج (ديقسافين, جويتابين): Arabic words also add the
// ك spelling, so either reading finds the item. Item names keep their own spelling as well.
function kafVariant(w: string): string {
  return /[\u0600-\u06FF]/.test(w) ? w.replace(/ق/g, 'ك').replace(/^ج/, 'ك') : w;
}
function wordGrams(w: string, out: Set<string>): void {
  const p = ` ${w} `; for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
}
// Item names: their own spelling only. Supplier text (query = true): also the ك spelling.
function grams(s: string, query = false): Set<string> {
  const out = new Set<string>();
  for (const w of words(s)) { wordGrams(w, out); const k = query ? kafVariant(w) : w; if (k !== w) wordGrams(k, out); }
  return out;
}
// The brand: first meaningful word. A suggestion whose brand is far from the supplier's brand is never trusted.
// Two forms: the first word, and the first two words written together (OJO ELIVATO = OJOALIVATO).
function brand(s: string, query = false): Set<string>[] {
  const ws = words(s).filter((w) => !/^\d/.test(w));
  const out: Set<string>[] = [];
  for (const w of [ws[0], ws.length > 1 ? ws[0] + ws[1] : '']) {
    if (!w) continue;
    // letter pairs: kinder than triples to Gemini's spellings of a brand (CANZARTAN = KANSARTAN)
    for (const v of new Set([w, query ? kafVariant(w) : w])) { const g = new Set<string>(); for (let i = 0; i + 2 <= v.length; i++) g.add(v.slice(i, i + 2)); out.push(g); }
  }
  return out;
}

// Text similarity 0..1 (same rules as the item search): used to recognise a name the owner confirmed before
// when the supplier writes it a little differently (جلوجان ٥٠٠/٥ اقراص = جلوجان ٥/٥٠٠ قرص).
export function similarity(a: string, b: string): number { return dice(grams(a, true), grams(b, true)); }
export function sameNumbers(a: string, b: string): boolean {
  const x = numbers(a).sort(), y = numbers(b).sort();
  return x.length === y.length && x.every((n, i) => n === y[i]);
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0; for (const g of a) if (b.has(g)) n++;
  return (2 * n) / (a.size + b.size);
}

type Entry = { id: string; name: string; nums: string[]; g: Set<string>[]; b: Set<string>[]; sc: { strength: string[]; count: string[] } };
export class Catalog {
  private entries: Entry[] = [];
  private index = new Map<string, number[]>();
  private byId = new Map<string, number>();
  private learned = new Set<string>();
  constructor(items: CatalogItem[]) {
    items.forEach((it, i) => {
      const forms = [it[1], ...(it[2] || [])];
      const g = forms.map((f) => grams(f));
      this.entries.push({ id: it[0], name: it[1], nums: numbers(it[1]), g, b: forms.flatMap((f) => brand(f)), sc: strengthAndCount(it[1]) });
      const seen = new Set<string>();
      for (const set of g) for (const t of set) if (!seen.has(t)) { seen.add(t); let l = this.index.get(t); if (!l) this.index.set(t, (l = [])); l.push(i); }
      this.byId.set(it[0], i);
    });
  }
  // A supplier name the owner confirmed for an item becomes one more name of that item (while the worker is warm),
  // so close spellings of it are found too.
  learn(id: string, text: string): void {
    const i = this.byId.get(id), k = id + '|' + text;
    if (i === undefined || this.learned.has(k) || !text) return;
    this.learned.add(k);
    const e = this.entries[i], g = grams(text);
    if (!g.size) return;
    e.g.push(g); e.b.push(...brand(text));
    for (const t of g) { let l = this.index.get(t); if (!l) this.index.set(t, (l = [])); if (l[l.length - 1] !== i) l.push(i); }
  }
  get size(): number { return this.entries.length; }
  byName(name: string): Entry | undefined { const k = normalize(name); return this.entries.find((e) => normalize(e.name) === k); }

  // Owner search box: item code, or name text in Arabic/English. No number rule here: the owner decides.
  search(q: string, limit = 10): { id: string; name: string }[] {
    const t = String(q || '').trim();
    if (/^\d{1,10}$/.test(t)) { const e = this.entries.find((x) => x.id === t); if (e) return [{ id: e.id, name: e.name }]; }
    const exact = normalize(t);
    const scored = this.candidates(t, t, 60).map((c) => ({ ...c, score: c.score + (normalize(c.name).startsWith(exact) ? 0.5 : 0) }));
    return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(({ id, name }) => ({ id, name }));
  }

  // Best catalogue items for one supplier line. `arabic` is the name as read; `latin` is Gemini's guess.
  candidates(arabic: string, latin: string, limit = 3): Candidate[] {
    const queries = [grams(arabic, true), grams(latin, true)].filter((q) => q.size);
    if (!queries.length) return [];
    const hits = new Map<number, number>();
    for (const q of queries) for (const t of q) { const l = this.index.get(t); if (l && l.length < 6000) for (const i of l) hits.set(i, (hits.get(i) || 0) + 1); }
    const shortlist = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([i]) => i);
    const srcText = numbers(arabic).length ? arabic : latin;
    const src = strengthAndCount(srcText);
    // a single number written as a pack count (بانادول ٢٤ قرص) may be the item's pack count, not its strength
    const srcTokens = normalize(srcText).split(' '), srcNums = numbers(srcText);
    const loneCount = srcNums.length === 1 && COUNT_UNITS.has(srcTokens[srcTokens.findIndex((t) => /\d/.test(t)) + 1] || '');
    const brands = [...brand(arabic, true), ...brand(latin, true)];
    const arForms = forms(arabic), srcForms = arForms.size ? arForms : forms(latin);
    const routeSrc = /[\u0600-\u06FF]/.test(arabic) && routes(arabic).size ? arabic : latin;
    const scored = shortlist.map((i) => {
      const e = this.entries[i];
      let sim = 0; for (const q of queries) for (const g of e.g) sim = Math.max(sim, dice(q, g));
      // the supplier's strength must be the item's strength, not just any number in its name (٢٠ مجم ≠ 40MG 20TAB)
      const numbersOk = src.strength.every((n) => e.sc.strength.includes(n) || (loneCount && e.sc.count.includes(n)));
      const itemCount = e.sc.count;
      const countOff = src.count.length > 0 && itemCount.length > 0 && !src.count.some((n) => itemCount.includes(n));
      let brandSim = 0; for (const x of brands) for (const y of e.b) brandSim = Math.max(brandSim, dice(x, y));
      const brandOk = brandSim >= 0.45;
      const itemForms = srcForms.size ? forms(e.name) : new Set<string>();
      const formOk = formsAgree(srcForms, itemForms) && routesAgree(routeSrc, e.name);
      const factor = (!src.strength.length ? (e.nums.length ? 0.95 : 1) : numbersOk ? 1.05 : 0.5) * (countOff ? 0.85 : 1) * (formOk ? 1 : 0.6) * (brandOk ? 1 : 0.75);
      return { id: e.id, name: e.name, score: Math.min(1, Math.round(sim * factor * 1000) / 1000), numbersOk, formOk, brandOk };
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

// Confidence rule: clear name similarity, matching numbers and a margin over the next item; else the owner reviews.
export function decide(c: Candidate[]): Match | null {
  const top = c[0];
  if (!top || top.score < 0.35) return null;
  const next = c.find((x, i) => i > 0 && x.numbersOk && x.formOk !== false && x.name !== top.name);
  const clear = top.numbersOk && top.formOk !== false && top.brandOk !== false && top.score >= 0.6 && (!next || top.score - next.score >= 0.08);
  return { id: top.id, name: top.name, score: top.score, confidence: clear ? 'high' : 'review' };
}
