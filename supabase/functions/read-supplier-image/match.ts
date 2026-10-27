// ASKER V10 — maps a supplier's name (Arabic as read from the image + Gemini's Latin guess) to the
// pharmacy's own item list (ASKER_ITEMS export). The catalogue is a reference for reading only; the target
// list (shortages) is compared in the page. Strength numbers read from the image must all appear in the item.

export type CatalogItem = [id: string, name: string, alts?: string[]];
export type Candidate = { id: string; name: string; score: number; numbersOk: boolean; formOk?: boolean };
export type Match = { id: string; name: string; score: number; confidence: 'confirmed' | 'high' | 'review' };

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
    .replace(/[گک]/g, 'ك').replace(/ی/g, 'ي').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
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

function grams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of words(s)) { const p = ` ${w} `; for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3)); }
  return out;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0; for (const g of a) if (b.has(g)) n++;
  return (2 * n) / (a.size + b.size);
}

type Entry = { id: string; name: string; nums: string[]; g: Set<string>[] };
export class Catalog {
  private entries: Entry[] = [];
  private index = new Map<string, number[]>();
  constructor(items: CatalogItem[]) {
    items.forEach((it, i) => {
      const forms = [it[1], ...(it[2] || [])];
      const g = forms.map(grams);
      this.entries.push({ id: it[0], name: it[1], nums: numbers(it[1]), g });
      const seen = new Set<string>();
      for (const set of g) for (const t of set) if (!seen.has(t)) { seen.add(t); let l = this.index.get(t); if (!l) this.index.set(t, (l = [])); l.push(i); }
    });
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
    const queries = [grams(arabic), grams(latin)].filter((q) => q.size);
    if (!queries.length) return [];
    const hits = new Map<number, number>();
    for (const q of queries) for (const t of q) { const l = this.index.get(t); if (l && l.length < 6000) for (const i of l) hits.set(i, (hits.get(i) || 0) + 1); }
    const shortlist = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([i]) => i);
    const src = strengthAndCount(numbers(arabic).length ? arabic : latin);
    const arForms = forms(arabic), srcForms = arForms.size ? arForms : forms(latin);
    const routeSrc = /[\u0600-\u06FF]/.test(arabic) && routes(arabic).size ? arabic : latin;
    const scored = shortlist.map((i) => {
      const e = this.entries[i];
      let sim = 0; for (const q of queries) for (const g of e.g) sim = Math.max(sim, dice(q, g));
      const numbersOk = src.strength.every((n) => e.nums.includes(n));
      const itemCount = strengthAndCount(e.name).count;
      const countOff = src.count.length > 0 && itemCount.length > 0 && !src.count.some((n) => itemCount.includes(n));
      const itemForms = srcForms.size ? forms(e.name) : new Set<string>();
      const formOk = formsAgree(srcForms, itemForms) && routesAgree(routeSrc, e.name);
      const factor = (!src.strength.length ? (e.nums.length ? 0.95 : 1) : numbersOk ? 1.05 : 0.5) * (countOff ? 0.9 : 1) * (formOk ? 1 : 0.6);
      return { id: e.id, name: e.name, score: Math.min(1, Math.round(sim * factor * 1000) / 1000), numbersOk, formOk };
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

// Confidence rule: clear name similarity, matching numbers and a margin over the next item; else the owner reviews.
export function decide(c: Candidate[]): Match | null {
  const top = c[0];
  if (!top || top.score < 0.35) return null;
  const next = c.find((x, i) => i > 0 && x.numbersOk && x.formOk !== false);
  const clear = top.numbersOk && top.formOk !== false && top.score >= 0.6 && (!next || top.score - next.score >= 0.08);
  return { id: top.id, name: top.name, score: top.score, confidence: clear ? 'high' : 'review' };
}
