// ASKER V10 — maps a supplier's name (Arabic as read from the image + Gemini's Latin guess) to the
// pharmacy's own item list (ASKER_ITEMS export). The catalogue is a reference for reading only; the target
// list (shortages) is compared in the page. Strength numbers read from the image must all appear in the item.

export type CatalogItem = [id: string, name: string, alts?: string[]];
export type Candidate = { id: string; name: string; score: number; numbersOk: boolean };
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

  // Best catalogue items for one supplier line. `arabic` is the name as read; `latin` is Gemini's guess.
  candidates(arabic: string, latin: string, limit = 3): Candidate[] {
    const queries = [grams(arabic), grams(latin)].filter((q) => q.size);
    if (!queries.length) return [];
    const hits = new Map<number, number>();
    for (const q of queries) for (const t of q) { const l = this.index.get(t); if (l && l.length < 6000) for (const i of l) hits.set(i, (hits.get(i) || 0) + 1); }
    const shortlist = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([i]) => i);
    const src = strengthAndCount(numbers(arabic).length ? arabic : latin);
    const scored = shortlist.map((i) => {
      const e = this.entries[i];
      let sim = 0; for (const q of queries) for (const g of e.g) sim = Math.max(sim, dice(q, g));
      const numbersOk = src.strength.every((n) => e.nums.includes(n));
      const itemCount = strengthAndCount(e.name).count;
      const countOff = src.count.length > 0 && itemCount.length > 0 && !src.count.some((n) => itemCount.includes(n));
      const factor = (!src.strength.length ? (e.nums.length ? 0.95 : 1) : numbersOk ? 1.05 : 0.5) * (countOff ? 0.9 : 1);
      return { id: e.id, name: e.name, score: Math.min(1, Math.round(sim * factor * 1000) / 1000), numbersOk };
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

// Confidence rule: clear name similarity, matching numbers and a margin over the next item; else the owner reviews.
export function decide(c: Candidate[]): Match | null {
  const top = c[0];
  if (!top || top.score < 0.35) return null;
  const next = c.find((x, i) => i > 0 && x.numbersOk);
  const clear = top.numbersOk && top.score >= 0.6 && (!next || top.score - next.score >= 0.08);
  return { id: top.id, name: top.name, score: top.score, confidence: clear ? 'high' : 'review' };
}
