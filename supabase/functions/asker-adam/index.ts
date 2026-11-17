// Function asker-adam: Adam's FAST brain on the server (owner 2026-11-17: «يلا بينا نظبط آدم عشان نستغله»; earlier «مش صنم … ياخد ويدي
// معايا» and «كلود بيقعد يفكر … مش مسعف في الشغل»). Design: Hub\adam\ADAM_V2_DESIGN.md.
//   POST {text, history?: [{who: 'me'|'adam', text}], ctx?}   header x-adam-key: Adam's 64-hex device key (phone or laptop)
//   -> {speak, show, do_now?, open?, walk?, ctx?, end?, handoff?, ms, tool?}
//   POST {action: 'models'}   -> the text models this Gemini key can use
//   POST {action: 'hear', audio: base64, mime, mode: 'idle'|'convo', vp?}   («آدم 3», 2026-11-17) -> {text, to, rest, verb}: what he said
//        (Gemini listens to the sound); in 'idle' also whether it is meant for Adam: his name first (to 'name') or a «… لي» command
//        (to 'command', «بيع لي / افتح لي / ادفع لي»); anything else (him talking to customers and staff) is to null = ignored.
//   {text, idle: true}: a «لي» command heard without the name: only a real answer is given; small talk, «not found» and handovers
//        that do not record anything come back {ignore: true} (he was not talking to Adam).
//   The ONE thing written: the «لي» words he adds by voice («زوّد أمر اطبع لي»), in storage asker-private/adam/commands.json.
// One HTTP call, no queue: a fast Gemini text model picks ONE tool, this code reads the bot's own tables (synced from PharmaFly every
// ~10 minutes) and writes the Egyptian answer itself. Questions it cannot answer with its tools, and EVERYTHING that records or sends
// (payments, sales, transfers, messages, calls, purchase orders) come back as {handoff: true}: the phone then asks the laptop through
// the old queue, where the spoken-«أيوه» gate lives. This function only READS; it never writes anything.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY (same as asker-voice), GEMINI_TEXT_MODEL (optional).
// Deploy with --no-verify-jwt (the phone has no sign-in); the device key is checked with ar_adam_role.
type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;
type Turn = { who?: unknown; text?: unknown };

// the fast «lite» text model this key has (2026-11-17: there is no 3.8 lite text model; the env GEMINI_TEXT_MODEL can change it)
export const TEXT_MODEL = 'gemini-3.5-flash-lite';
// the warehouses' codes in ar_item_buys, said by their names (only the sure ones; any other code is said as it is)
export const SUPPLIERS: Record<string, string> = {
  ELFATH: 'الفتح', FATH: 'الفتح', IBNSINA: 'ابن سينا', SINA: 'سينا', NEWCITY: 'نيو سيتي', AMG: 'إيه إم جي', REDA: 'رضا',
  PHARMA: 'فارما', PMM: 'فارما مول', DOC: 'الدكتور',
};
// warehouses whose PharmaFly name is English: the spoken (normalized) Arabic name → a piece of the English one
export const VENDOR_ALIASES: Record<string, string> = {
  'ابن سينا': 'IBN SINA', 'ابن سيناء': 'IBN SINA', 'فارما': 'pharmaoverseas', 'فارما اوفرسيز': 'pharmaoverseas',
  'ايه ام جي': 'A M group', 'اي ام جي': 'A M group', 'ايه ام جروب': 'A M group', 'نيو سيتي': 'new city',
};
// «افتح X»: the bot's pages by the words he uses (the same lists as the laptop's AdamFast.ps1), so it opens at once without Gemini
const PAGE_WORDS: [string, string][] = ([
  ['drafts', ['الطلبيات', 'طلبيات', 'الطلبيه', 'مسودات الطلبيات', 'طلبيات المخازن', 'الطلبات']],
  ['storeorders', ['طلبات الموقع', 'طلبات المتجر', 'طلبات الاونلاين']],
  ['short', ['النواقص', 'نواقص', 'النواقص العامه', 'قايمه النواقص', 'قائمه النواقص']],
  ['bags', ['الحقائب', 'حقائب', 'الشنط', 'الحقايب']],
  ['read', ['الوارد', 'وارد', 'رسايل المخازن']],
  ['docs', ['الفواتير', 'فواتير', 'فواتير المشتريات']],
  ['suppliers', ['قوايم المخازن', 'قوائم المخازن', 'لستات المخازن']],
  ['stock', ['المخزون', 'مخزون', 'الاستوك', 'الستوك']],
  ['count', ['الجرد', 'جرد']],
  ['expiry', ['الصلاحيات', 'صلاحيات', 'الاكسباير']],
  ['customers', ['العملاء', 'عملاء', 'الزباين', 'حسابات العملاء']],
  ['vendors', ['الموردين', 'موردين', 'حسابات الموردين', 'حسابات المخازن']],
  ['ops', ['العمليات', 'عمليات']],
  ['sales', ['المبيعات', 'مبيعات', 'حركه البيع']],
  ['tempsale', ['البيع المؤقت', 'بيع مؤقت']],
  ['care', ['خدمه العملاء', 'الرسايل']],
  ['home', ['الرئيسيه', 'الصفحه الرئيسيه', 'البوت']],
] as [string, string[]][]).flatMap(([tab, ws]) => ws.map((w) => [w, tab] as [string, string]));
/** «افتح الطلبيات» → «drafts»; null when the sentence is more than «افتح + a page». */
export function pageOf(text: string): string | null {
  const n = norm(text).replace(/^(افتحلي|افتح لي|افتح|افتحي|وريني|روح علي|روح ل|روح|ادخل علي|ادخل|اعرض)\s+/, '')
    .replace(/^(صفحه|قسم|تاب)\s+/, '').trim();
  if (n === norm(text)) return null;
  for (const [w, tab] of PAGE_WORDS) if (n === w) return tab;
  return null;
}
export const MAX_TEXT = 400;
// the sound of one sentence (base64): 20 s of AAC is ~110 000 characters, of 16 kHz WAV ~860 000
export const MAX_AUDIO = 1_400_000;
const AUDIO_TYPES = new Set(['audio/aac', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/mp3', 'audio/mpeg']);
const KEY_RE = /^[0-9a-f]{64}$/;
const MODEL_RE = /^gemini-[a-z0-9.\-]{1,60}$/;
// «آدم 3»: every sentence HE says goes through «hear» (others' voices are stopped on the phone by his voiceprint), so more calls a minute
const TIMEOUT_MS = 10000, GEMINI_TIMEOUT_MS = 12000, PER_MINUTE = 120, BAGS_TTL_MS = 5 * 60 * 1000;

// ---------- «آدم 3»: is this sentence meant for Adam? ----------
// Owner 2026-11-17: «كلمة بيع لي، كلمة افتح لي، كلمة ادفع لي … ممكن اقول بيع للشباب اللي عندي … فإما يبقى مربوط بـ«لي»، أو اقول له
// آدم يرد عليا ينتبه لكلامي». A «… لي» command (an order to HIM: «بيع لي»، «افتحلي»، «بيعهولي») is for Adam; «بيع للشباب» is not.
export const COMMAND_VERBS = ['بيع', 'افتح', 'ادفع', 'اقرا', 'قول', 'شوف', 'دور', 'سجل', 'اكتب', 'ابعت', 'اطلب', 'حول', 'احسب', 'طلع',
  'اعرض', 'هات', 'جيب', 'اعمل', 'نزل', 'ضيف', 'زود', 'شيل', 'كلم', 'رن', 'اتصل', 'حضر', 'جهز', 'راجع', 'عد', 'اجرد', 'دخل', 'حط', 'ذكر', 'اطبع'];
// the ones that record or send: such a command goes to the laptop (where the spoken «أيوه» gate is) even when no fast tool fits
export const WRITE_VERBS = new Set(['بيع', 'ادفع', 'سجل', 'اكتب', 'ابعت', 'اطلب', 'حول', 'نزل', 'ضيف', 'زود', 'شيل', 'كلم', 'رن', 'اتصل', 'عد', 'اجرد', 'دخل', 'حط', 'ذكر', 'اعمل', 'اطبع']);
const SPECIAL_COMMANDS = new Map([['وريني', 'وري'], ['اديني', 'ادي'], ['قوليلي', 'قول'], ['ذكرني', 'ذكر'], ['فكرني', 'ذكر']]);
/** The command verb of a «… لي» order in the sentence («بيع لي»، «بيعلي»، «بيعهولي»، «قولي»), or null. [extra] = the words he added. */
export function commandVerb(text: string, extra: string[] = []): string | null {
  const toks = norm(text).split(' ').filter(Boolean);
  const verbs = [...COMMAND_VERBS, ...extra.map((v) => norm(v))].filter((v) => v.length >= 2);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (SPECIAL_COMMANDS.has(t)) return SPECIAL_COMMANDS.get(t) as string;
    for (const v of verbs) {
      if (t === v && (toks[i + 1] === 'لي' || toks[i + 1] === 'ليا')) return v;
      if (t.length <= v.length || !t.startsWith(v)) continue;
      const rest = t.slice(v.length);
      if (/^(ه|ها|هو|هم)?(لي|ليا)$/.test(rest)) return v;
      if (v.endsWith('ل') && /^(ي|يا)$/.test(rest)) return v;   // «قولي» = قول + لي، «سجلي»
      // «بيعي علبة» (11-17: Gemini wrote «بيع لي» so): an order to Adam, unless it is to someone («بيعي للشباب»، «افتحي لمحمد»)
      if (rest === 'ي' && toks[i + 1] && !/^ل/.test(toks[i + 1])) return v;
    }
  }
  return null;
}
const isName = (w?: string) => !!w && /^(ادم|adam|ادام|يادم)$/.test(w);
/** He called Adam: what he asked after the name («آدم، بانادول بكام» → «بانادول بكام»; «آدم» / «بقولك يا آدم» → ''), or null. */
export function nameCall(text: string): string | null {
  const ws = String(text || '').trim().split(/\s+/).filter(Boolean);
  const n = ws.map((w) => norm(w));
  // «عدم» first = «آدم» misheard (11-17: «عدم الفازل بكام؟»); only as the first word
  const k = n[0] === 'يا' && isName(n[1]) ? 2 : (isName(n[0]) || (n[0] === 'عدم' && ws.length > 1)) ? 1 : 0;
  if (k) return ws.slice(k).join(' ').replace(/^[،,.\s]+/, '').trim();
  if (ws.length <= 3 && isName(n[n.length - 1])) return '';
  return null;
}
/** Who the sentence is for: Adam by name, Adam by a «لي» command, or nobody (null: he was talking to someone else). */
export function addressed(text: string, extra: string[] = []): { to: 'name' | 'command' | null; text: string; verb?: string } {
  const nc = nameCall(text);
  if (nc !== null) return { to: 'name', text: nc };
  const v = commandVerb(text, extra);
  return v ? { to: 'command', text, verb: v } : { to: null, text };
}

// the «لي» words he adds by voice: one small file in storage (read every 5 minutes)
const CMD_PATH = '/storage/v1/object/asker-private/adam/commands.json';
let cmdCache: { at: number; verbs: string[] } | null = null;
export function _resetCommands() { cmdCache = null; }
async function extraVerbs(c: Ctx, now: number): Promise<string[]> {
  if (cmdCache && now - cmdCache.at < 5 * 60 * 1000) return cmdCache.verbs;
  const r = await c.fetch(c.base + CMD_PATH, { headers: serviceHeaders(c.key), signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) as { verbs?: unknown } | null : null;
  const verbs = j && Array.isArray(j.verbs) ? j.verbs.map((v) => norm(String(v))).filter((v) => v.length >= 2).slice(0, 100) : [];
  cmdCache = { at: now, verbs };
  return verbs;
}
async function addVerb(c: Ctx, verb: string, now: number): Promise<boolean> {
  const list = [...await extraVerbs(c, now)];
  if (list.includes(verb) || COMMAND_VERBS.includes(verb)) return true;
  list.push(verb);
  const r = await c.fetch(c.base + CMD_PATH, {
    method: 'POST', headers: { ...serviceHeaders(c.key), 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body: JSON.stringify({ verbs: list, updated_at: new Date(now).toISOString() }), signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!r || !r.ok) return false;
  cmdCache = { at: now, verbs: list };
  return true;
}
// «زوّد أمر اطبع لي» / «ضيف كلمة اطبعلي»
const ADD_COMMAND = /^(?:يا ادم )?(?:زود|ضيف|زودلي|ضيفلي)\s+(?:امر|الامر|كلمه|الكلمه)\s+(\S+)/;

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const serviceHeaders = (k: string): Record<string, string> => k.startsWith('sb_') ? { apikey: k } : { Authorization: 'Bearer ' + k, apikey: k };

// ---------- Arabic text helpers ----------
/** Letters that are written several ways become one («أحمد» = «احمد», «يوميه» = «يومية», «مستشفى» = «مستشفي»). */
export function norm(s: string): string {
  return String(s || '').toLowerCase()
    .replace(/[ً-ْـ]/g, '')          // harakat and tatweel
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\p{L}\p{Nd}% .]/gu, ' ').replace(/\s+/g, ' ').trim();
}
const STOP = new Set(['سعر', 'بكام', 'كام', 'عندنا', 'موجود', 'الموجود', 'صنف', 'الصنف', 'رصيد', 'حساب', 'دوا', 'دواء', 'عن', 'في', 'من', 'يا', 'ال']);
/** The words of a spoken name, each as a PostgREST ilike pattern where every letter written several ways matches any of them. */
const nameWords = (q: string) => norm(q).split(' ').filter((w) => w.length >= 2 && !STOP.has(w) && !/^[\d.%]+$/.test(w)).slice(0, 4);
export function words(q: string): string[] {
  // numbers are left out of the search (the names keep Arabic-Indic digits, «٤٠»); they only rank the matches (rankByNumber).
  // A vowel letter at the start or the end may be missing or extra («وبيديا» = «بيديا»: the «و» of «and»), inside it is any one letter.
  return nameWords(q).map((w) => w.replace(/^[اوي]+/, '*').replace(/[اويه]+$/, '*').replace(/[اوي]/g, '_').replace(/^\*|\*$/g, '*'))
    .map((w) => w.replace(/\*+/g, '*')).filter((w) => w.replace(/[*_]/g, '').length >= 2);
}
/** Looser: only the word's consonants, in order, anything between them («بنادول» finds «بانادول»). Used when [words] finds nothing. */
export function skeleton(q: string): string[] {
  return nameWords(q).map((w) => w.replace(/[اويهء]/g, '')).filter((w) => w.length >= 2).map((w) => w.split('').join('*'));
}
const toIndic = (s: string) => s.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
/** The numbers he said («زوركال 40»), in both digit forms, to put the right strength first. */
function rankByNumber(q: string, name: string): number {
  const nums = norm(q).split(' ').filter((w) => /^\d+(\.\d+)?$/.test(w));
  return nums.filter((n) => name.includes(n) || name.includes(toIndic(n))).length;
}
const ilikeAll = (col: string, ws: string[]) => 'and=(' + ws.map((w) => col + '.ilike.*' + w + '*').join(',') + ')';
/** «9.5» → «9.5», «3» → «3»: the phone turns the digits into Egyptian words. */
const num = (x: number) => (Math.round(x * 10) / 10).toString();
const money = (x: number) => Math.round(x).toLocaleString('en-US').replace(/,/g, ' ');

// ---------- the bot's data (service role, read only) ----------
type Ctx = { base: string; key: string; fetch: typeof fetch };
async function rest(c: Ctx, path: string, count = false): Promise<{ rows: Json[]; total: number }> {
  const r = await c.fetch(c.base + '/rest/v1/' + path, {
    headers: { ...serviceHeaders(c.key), ...(count ? { Prefer: 'count=exact' } : {}) }, signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!r || !r.ok) return { rows: [], total: 0 };
  const rows = await r.json().catch(() => []) as Json[];
  const cr = r.headers.get('content-range') || '';
  const total = count ? Number(/\/(\d+)$/.exec(cr)?.[1] || rows.length) : rows.length;
  return { rows: Array.isArray(rows) ? rows : [], total };
}

let bagsCache: { at: number; data: Json | null } = { at: 0, data: null };
/** The bags file the laptop uploads (asker-private/alerts/alerts.json), kept 5 minutes in this copy of the function. */
async function bags(c: Ctx, now: number): Promise<Json | null> {
  if (bagsCache.data && now - bagsCache.at < BAGS_TTL_MS) return bagsCache.data;
  const r = await c.fetch(c.base + '/storage/v1/object/asker-private/alerts/alerts.json', {
    headers: serviceHeaders(c.key), signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) as Json | null : null;
  if (j) bagsCache = { at: now, data: j };
  return j || bagsCache.data;
}
export function _resetCache() { bagsCache = { at: 0, data: null }; }

type BagItem = { id: number; name: string; have: number; sold30: number; need: number };
type Bag = { id: string; name: string; items: BagItem[] };
function bagList(j: Json | null): Bag[] {
  const list = ((j?.bags as Json | undefined)?.list || []) as Json[];
  return list.map((b) => ({
    id: String(b.id), name: String(b.name || ''),
    items: ((b.items || []) as Json[]).map((x) => ({ id: Number(x.id), name: String(x.name || ''), have: Number(x.have || 0), sold30: Number(x.sold30 || 0), need: Number(x.need || 0) })),
  }));
}
/** Which bag a spoken name means: the daily one by its usual words, else the one whose name holds all the words. */
export function findBag(all: Bag[], said: string): Bag | null {
  const n = norm(said);
  if (/يومي|يوميه|سبيد|speed/.test(n) || !n) return all.find((b) => b.id === '2428') || null;
  if (/كل الشركات|الشركات/.test(n)) return all.find((b) => b.id === 'pv') || null;
  const ws = n.split(' ').filter((w) => w.length >= 2 && !['حقيبه', 'شنطه', 'نواقص', 'بتاعه', 'بتاع'].includes(w));
  if (!ws.length) return null;
  const hits = all.filter((b) => ws.every((w) => norm(b.name).includes(w)));
  return hits.length === 1 ? hits[0] : null;
}
/** Arabic names for item ids (ar_stock / ar_store_items), for the voice. */
async function arabicNames(c: Ctx, ids: number[]): Promise<Map<number, string>> {
  const m = new Map<number, string>();
  if (!ids.length) return m;
  const q = 'in.(' + ids.slice(0, 60).join(',') + ')';
  for (const r of (await rest(c, 'ar_stock?select=item_id,arabic_name&item_id=' + q)).rows) if (r.arabic_name) m.set(Number(r.item_id), String(r.arabic_name));
  const left = ids.filter((i) => !m.has(i));
  if (left.length) for (const r of (await rest(c, 'ar_store_items?select=id,arabic_name&id=in.(' + left.slice(0, 60).join(',') + ')')).rows) if (r.arabic_name) m.set(Number(r.id), String(r.arabic_name));
  return m;
}
/** A spoken name: the Arabic one without the pack size («زوركال ٤٠ مجم ١٤ قرص» → «زوركال ٤٠ مجم»), else the English one. */
function spoken(ar: string | undefined, en: string): string {
  const a = String(ar || '').replace(/\s*[٠-٩\d]+\s*(قرص|اقراص|أقراص|كبسول|كبسوله|امبول|أمبول|فيال|لبوس|كيس|اكياس|أكياس)\s*$/u, '').trim();
  return a || String(en || '').trim();
}

// ---------- the tools ----------
type Answer = { speak: string; show?: string; do_now?: Json[]; open?: Json; walk?: Json; ctx?: Json; end?: boolean; handoff?: boolean };
const PAGES: Record<string, string> = {
  home: 'الرئيسية', short: 'النواقص', read: 'الوارد', drafts: 'الطلبيات', docs: 'الفواتير', suppliers: 'قوايم المخازن', stock: 'المخزون',
  count: 'الجرد', expiry: 'الصلاحيات', customers: 'العملاء', vendors: 'الموردين', ops: 'العمليات', storeorders: 'طلبات الموقع',
  sales: 'المبيعات', tempsale: 'البيع المؤقت', care: 'خدمة العملاء', bags: 'الحقائب',
};

// ---------- finding a product by a SPOKEN name (owner 2026-11-17: «جيست رنين» was heard for «جاست ريج» and a wrong product was said
// with confidence) ----------
// All the product names (in stock + the store list) are kept in this copy of the function for 20 minutes and scored against what was
// heard, letter by letter and by consonants only. Sure → the answer; close → «تقصد X؟» (his «أيوه» answers it); else «مش لاقي».
type Cat = { id: number; name: string; ar: string; toks: string[]; pop: number; inStock: boolean };
let catCache: { at: number; items: Cat[] } = { at: 0, items: [] };
const CAT_TTL_MS = 20 * 60 * 1000;
const tok = (s: string) => norm(s).replace(/[\d.%]+/g, ' ').split(' ').filter((w) => w.length >= 2).map((w) => w.replace(/^(وال|ال|و)(?=\S{3})/, ''));
const skel = (w: string) => w.replace(/[اويهءة]/g, '');
function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/** How alike two spoken/written words are, 0..1: the letters, or the consonants only (vowels are often dropped or misheard). */
export function wordSim(q: string, n: string): number {
  if (!q || !n) return 0;
  if (q === n) return 1;
  if (q.length >= 3 && (n.startsWith(q) || q.startsWith(n) && n.length >= 3)) return 0.92;
  const s1 = 1 - lev(q, n) / Math.max(q.length, n.length);
  const a = skel(q), b = skel(n);
  const s2 = a && b ? (1 - lev(a, b) / Math.max(a.length, b.length)) * 0.95 : 0;
  return Math.max(s1, s2);
}
/** A name's score for what was heard: each heard word matched to its best word in the name, averaged. */
export function nameScore(heard: string[], toks: string[]): number {
  if (!heard.length || !toks.length) return 0;
  let s = 0;
  for (const h of heard) { let best = 0; for (const t of toks) { const v = wordSim(h, t); if (v > best) best = v; } s += best; }
  return s / heard.length;
}
async function pages(c: Ctx, path: string, n: number): Promise<Json[]> {
  const all = await Promise.all(Array.from({ length: n }, (_, i) => rest(c, path + '&offset=' + i * 1000 + '&limit=1000')));
  return all.flatMap((r) => r.rows);
}
async function catalog(c: Ctx, now: number): Promise<Cat[]> {
  if (catCache.items.length && now - catCache.at < CAT_TTL_MS) return catCache.items;
  const [stock, store] = await Promise.all([
    pages(c, 'ar_stock?select=item_id,name,arabic_name&order=item_id', 7),
    pages(c, 'ar_store_items?select=id,name,arabic_name,popular_rank&arabic_name=not.is.null&order=id', 10),
  ]);
  const pop = new Map<number, number>(), byId = new Map<number, Cat>();
  for (const r of store) if (r.popular_rank != null) pop.set(Number(r.id), Number(r.popular_rank));
  for (const r of stock) { const id = Number(r.item_id), ar = String(r.arabic_name || ''); byId.set(id, { id, name: String(r.name || ''), ar, toks: tok(ar || String(r.name || '')), pop: pop.get(id) ?? 1e9, inStock: true }); }
  for (const r of store) { const id = Number(r.id); if (!byId.has(id)) byId.set(id, { id, name: String(r.name || ''), ar: String(r.arabic_name || ''), toks: tok(String(r.arabic_name || '')), pop: pop.get(id) ?? 1e9, inStock: false }); }
  const items = [...byId.values()].filter((x) => x.toks.length);
  if (items.length) catCache = { at: now, items };
  return items;
}
export function _setCatalog(items: Cat[], at: number) { catCache = { at, items }; }
export function _cat(id: number, name: string, ar: string, pop: number, inStock: boolean): Cat { return { id, name, ar, toks: tok(ar || name), pop, inStock }; }
export const SURE = 0.82, CLOSE = 0.6;
/** The best products for a spoken name: [{item, score}], the strength he said and the best sellers first among equal scores. */
export function findItems(cat: Cat[], heard: string): { it: Cat; score: number }[] {
  const hw = tok(heard).filter((w) => !STOP.has(w));
  if (!hw.length) return [];
  const scored: { it: Cat; score: number }[] = [];
  for (const it of cat) { const s = nameScore(hw, it.toks); if (s >= CLOSE) scored.push({ it, score: s }); }
  const bucket = (s: number) => Math.floor(s / 0.04);   // scores this close count as equal
  scored.sort((a, b) => (bucket(b.score) - bucket(a.score))
    || (rankByNumber(heard, b.it.ar || b.it.name) - rankByNumber(heard, a.it.ar || a.it.name))
    || (a.it.pop - b.it.pop) || (b.score - a.score) || ((a.it.ar || a.it.name).length - (b.it.ar || b.it.name).length));
  return scored.slice(0, 6);
}

// What may be SAID about a product (owner 2026-11-17: «لما اساله على الصنف قدام الزباين … يقول لي الصنف والسعر الجمهور بس … ما ينفعش يقول لي
// بتشتري منين ولا الخصم … قدام الناس ما ينفعش»): by default ONLY the name and the public price. The stock, the expiry and the last
// purchase (supplier, date, discount) only when he asks for that very thing.
type Want = 'price' | 'stock' | 'last_buy' | 'expiry' | 'all';
const WANTS = ['price', 'stock', 'last_buy', 'expiry', 'all'];
/** What is said about one product: the name and the public price, and only what he asked for on top. */
async function itemAnswer(c: Ctx, id: number, want: Want, now: number, others: Cat[] = []): Promise<Answer> {
  const st = (await rest(c, 'ar_stock?select=item_id,name,arabic_name,price,packs,units,parts,exp_near&item_id=eq.' + id)).rows[0];
  const si = st ? null : (await rest(c, 'ar_store_items?select=id,name,arabic_name,price&id=eq.' + id)).rows[0];
  const it = st || si;
  if (!it) return { speak: 'مش لاقي الصنف ده' };
  const nm = spoken(it.arabic_name as string, it.name as string);
  const parts = Number(it.parts || 1) >= 1 ? Number(it.parts || 1) : 1;
  const have = st ? Number(st.packs || 0) + Number(st.units || 0) / parts : 0;
  const bits: string[] = [];
  bits.push(nm + (Number(it.price) > 0 ? ': ' + num(Number(it.price)) + ' جنيه' : '، سعره مش متسجل'));
  if (want === 'stock' || want === 'all') bits.push(have >= 0.05 ? 'عندنا ' + num(have) : 'مش موجود عندنا دلوقتي');
  if (want === 'expiry' || want === 'all') {
    // exp_near = the nearest expiry DATE of what is in stock
    const exp = Date.parse(String(st?.exp_near || ''));
    if (!isNaN(exp)) { const d = new Date(exp); bits.push((exp <= now ? 'وفيه منه صلاحيته خلصت، ' : 'أقرب صلاحية ') + 'شهر ' + (d.getUTCMonth() + 1) + ' سنة ' + d.getUTCFullYear()); }
    else bits.push('صلاحيته مش متسجلة');
  }
  if (want === 'all') {
    const j = await bags(c, now);
    for (const b of bagList(j)) { const x = b.items.find((y) => y.id === id); if (x) { bits.push('وهو ناقص في ' + (b.id === 'pv' ? 'نواقص كل الشركات' : 'حقيبة ' + b.name) + '، بيتباع ' + num(x.sold30) + ' في الشهر'); break; } }
    const gs = ((j?.bags as Json | undefined)?.gs || []) as unknown[];
    if (gs.map(Number).includes(id)) bits.push('وهو في النواقص العامة');
  }
  if (want === 'last_buy' || want === 'all') {
    const buys = (await rest(c, 'ar_item_buys?select=supplier,last_date,discount_pct&item_id=eq.' + id + '&order=last_date.desc&limit=1')).rows;
    if (buys.length) {
      const b = buys[0], d = String(b.last_date || '').slice(0, 10).split('-');
      bits.push('آخر شرا من ' + (SUPPLIERS[String(b.supplier).toUpperCase()] || String(b.supplier)) + (d.length === 3 ? ' يوم ' + Number(d[2]) + '/' + Number(d[1]) : '') + (Number(b.discount_pct) > 0 ? ' بخصم ' + num(Number(b.discount_pct)) + '٪' : ''));
    } else bits.push('ومفيش شرا متسجل له');
  }
  return {
    speak: bits.join('، ') + '.',
    show: [String(it.arabic_name || it.name) + (Number(it.price) > 0 ? ' — ' + num(Number(it.price)) + ' ج' : ''), ...others.map((o) => o.ar || o.name)].join('\n'),
    open: { q: String(it.name || nm) }, ctx: { item: { id, name: nm } },
  };
}

async function itemInfo(c: Ctx, name: string, want: Want, now: number, ctxItem: Json | null): Promise<Answer> {
  // «وآخر شرا كان منين» / «صلاحيته» about the product we were talking about: Gemini may pass its name again, or nothing
  if (ctxItem && (!name.trim() || norm(name) === norm(String(ctxItem.name || '')))) return itemAnswer(c, Number(ctxItem.id), want, now);
  const cat = await catalog(c, now);
  const hits = findItems(cat, name);
  if (!hits.length) return { speak: 'مش لاقي صنف بالاسم ده. قوله تاني', open: { q: name } };
  const top = hits[0];
  if (top.score < SURE) {
    // not sure: ask, never say a wrong product with confidence
    const n1 = spoken(top.it.ar, top.it.name), n2 = hits[1] && hits[1].score >= CLOSE ? spoken(hits[1].it.ar, hits[1].it.name) : '';
    return { speak: 'تقصد ' + n1 + (n2 && n2 !== n1 ? ' ولا ' + n2 : '') + '؟', ctx: { suggest: { id: top.it.id, name: n1, want }, ...(n2 && n2 !== n1 ? { suggest2: { id: hits[1].it.id, name: n2, want } } : {}) } };
  }
  return itemAnswer(c, top.it.id, want, now, hits.slice(1, 5).filter((h) => h.score >= SURE).map((h) => h.it));
}

async function shortages(c: Ctx, which: string, bagName: string, readAloud: boolean, now: number, ctxBag = ''): Promise<Answer> {
  if (which !== 'bag') {
    const { rows, total } = await rest(c, 'ar_shortages?select=product_name,name_key,suggested_qty&is_active=eq.true&order=suggested_qty.desc.nullslast,product_name&limit=' + (readAloud ? 30 : 5), true);
    const keys = rows.map((r) => String(r.name_key)).filter(Boolean);
    const ar = new Map<string, string>();
    if (keys.length) for (const n of (await rest(c, 'ar_names?select=name_key,arabic_name,spoken_name&name_key=in.(' + keys.map((k) => '"' + k.replace(/"/g, '') + '"').join(',') + ')')).rows) ar.set(String(n.name_key), String(n.spoken_name || n.arabic_name || ''));
    const nameOf = (r: Json) => spoken(ar.get(String(r.name_key)), String(r.product_name));
    const intro = 'النواقص العامة فيها ' + total + ' صنف';
    if (readAloud && rows.length) return { speak: intro, walk: { mode: 'read', intro: intro + '. هقرا أكتر المطلوب. بعد كل 3 قول أيوه أكمّل أو لا أقف', items: rows.map((r, i) => ({ id: i + 1, say: nameOf(r) + '، مطلوب ' + num(Number(r.suggested_qty || 1)) })), end_say: 'خلصت. الباقي على البوت' }, do_now: [{ type: 'open_tab', tab: 'short' }] };
    return { speak: intro + (rows.length ? '. أكتر المطلوب: ' + rows.slice(0, 3).map(nameOf).join('، ') + '. أقرالك الباقي؟' : '.'), show: rows.map((r) => nameOf(r) + ' — ' + num(Number(r.suggested_qty || 1))).join('\n'), do_now: [{ type: 'open_tab', tab: 'short' }], ctx: { list: 'general' } };
  }
  const all = bagList(await bags(c, now));
  // «اقرالي أهمهم» right after a bag: the bag we were talking about
  const fromCtx = ctxBag ? all.find((x) => x.id === ctxBag) || null : null;
  const b = (bagName.trim() ? findBag(all, bagName) : null) || fromCtx || findBag(all, bagName);
  if (!b) return { speak: 'مش عارف أنهي حقيبة. عندنا: ' + all.map((x) => x.id === 'pv' ? 'نواقص كل الشركات' : x.name).join('، ') };
  const items = [...b.items].sort((x, y) => y.sold30 - x.sold30);
  const names = await arabicNames(c, items.slice(0, readAloud ? 30 : 3).map((x) => x.id));
  const nameOf = (x: BagItem) => spoken(names.get(x.id), x.name);
  const title = b.id === 'pv' ? 'نواقص كل الشركات' : 'حقيبة ' + b.name;
  const intro = title + ' فيها ' + items.length + ' صنف';
  if (readAloud && items.length) return { speak: intro, walk: { mode: 'read', intro: intro + '. هقرا الأهم بالمتوسط. بعد كل 3 قول أيوه أكمّل أو لا أقف', items: items.slice(0, 30).map((x) => ({ id: x.id, say: nameOf(x) + '، عندنا ' + num(x.have) + '، والمتوسط ' + num(x.sold30) })), end_say: 'خلصت الحقيبة' }, do_now: [{ type: 'open_tab', tab: 'bags' }] };
  return { speak: intro + (items.length ? '. أهمهم: ' + items.slice(0, 3).map(nameOf).join('، ') + '. أقرالك الباقي؟' : '.'), show: items.slice(0, 20).map((x) => x.name + ' — عندنا ' + num(x.have) + ' — متوسط ' + num(x.sold30)).join('\n'), do_now: [{ type: 'open_tab', tab: 'bags' }], ctx: { list: 'bag', bag: b.id } };
}

async function balance(c: Ctx, party: string, name: string): Promise<Answer> {
  const ws = words(name);
  if (!ws.length) return { speak: 'قول الاسم تاني' };
  if (party === 'vendor') {
    const SEL = 'ar_vendors?select=id,name,short,balance,invoices,last_invoice_at,last_payment_at,last_payment&order=invoices.desc.nullslast&';
    let rows = (await rest(c, SEL + ilikeAll('name', ws) + '&limit=6')).rows;
    // warehouses written in English in PharmaFly («IBN SINA 1»): their spoken Arabic name
    const alias = VENDOR_ALIASES[norm(name).replace(/^(مخزن|شركه|شركة)\s+/, '').replace(/^و(?=\S{3})/, '')];
    if (!rows.length && alias) rows = (await rest(c, SEL + 'name=ilike.*' + alias + '*&limit=6')).rows;
    if (!rows.length) rows = (await rest(c, SEL + ilikeAll('short', ws) + '&limit=6')).rows;
    if (!rows.length) return { speak: 'مش لاقي مورد بالاسم ده', do_now: [{ type: 'open_tab', tab: 'vendors' }] };
    const say1 = (v: Json) => {
      const bal = Number(v.balance || 0);
      return String(v.name) + ': ' + (Math.abs(bal) < 0.5 ? 'حسابه خالص' : bal > 0 ? 'علينا له ' + money(bal) + ' جنيه' : 'لينا عنده ' + money(-bal) + ' جنيه');
    };
    // the one he deals with most wins when it is clearly the main one («الفتح» = the medicines warehouse, not the accessories one)
    if (rows.length > 1 && Number(rows[0].invoices || 0) >= 3 * Math.max(1, Number(rows[1].invoices || 0))) rows = [rows[0]];
    // the same warehouse with two accounts («ابن سينا 1 / 2»): both balances
    if (rows.length > 1 && alias && rows.length <= 3) return { speak: rows.map(say1).join('. ') + '.', do_now: [{ type: 'open_tab', tab: 'vendors' }] };
    if (rows.length > 1) return { speak: 'فيه ' + rows.length + ' موردين بالاسم ده: ' + rows.slice(0, 4).map((r) => String(r.name)).join('، ') + '. تقصد مين؟', ctx: { choose: 'vendor' } };
    const v = rows[0];
    const d = String(v.last_payment_at || '').slice(0, 10).split('-');
    const pay = Number(v.last_payment) > 0 && d.length === 3 ? '، وآخر دفعة ' + money(Number(v.last_payment)) + ' يوم ' + Number(d[2]) + '/' + Number(d[1]) : '';
    return { speak: say1(v) + pay + '. أفتحلك حسابه؟', open: { vendor: Number(v.id) }, ctx: { vendor: { id: Number(v.id), name: String(v.name) } } };
  }
  const rows = (await rest(c, 'ar_customers?select=id,name,balance,credit_limit,last_at&' + ilikeAll('name', ws) + '&order=last_at.desc.nullslast&limit=6')).rows;
  if (!rows.length) return { speak: 'مش لاقي عميل بالاسم ده', do_now: [{ type: 'open_tab', tab: 'customers' }] };
  if (rows.length > 1) return { speak: 'فيه ' + rows.length + ' عملاء بالاسم ده: ' + rows.slice(0, 4).map((r) => String(r.name)).join('، ') + '. تقصد مين؟', ctx: { choose: 'customer' } };
  const u = rows[0], bal = Number(u.balance || 0);
  const s = Math.abs(bal) < 0.5 ? 'حسابه خالص' : bal > 0 ? 'عليه ' + money(bal) + ' جنيه' : 'ليه عندنا ' + money(-bal) + ' جنيه';
  const lim = Number(u.credit_limit || 0) > 0 && bal > Number(u.credit_limit) ? '، وعدّى الحد بتاعه' : '';
  return { speak: String(u.name) + ': ' + s + lim + '. أفتحلك حسابه؟', open: { customer: Number(u.id) }, ctx: { customer: { id: Number(u.id), name: String(u.name) } } };
}

/** Cairo midnight [daysBack] days ago, as an ISO time. */
export function cairoMidnight(now: number, daysBack = 0): string {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date(now)).map((x) => [x.type, x.value])) as Record<string, string>;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  const offset = asUtc - Math.floor(now / 1000) * 1000;
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day - daysBack) - offset).toISOString();
}

async function sales(c: Ctx, period: string, now: number): Promise<Answer> {
  const back = period === 'yesterday' ? 1 : period === 'week' ? 6 : period === 'month' ? 29 : 0;
  const from = cairoMidnight(now, back), to = period === 'yesterday' ? cairoMidnight(now, 0) : new Date(now + 60000).toISOString();
  const { rows } = await rest(c, 'ar_sales?select=kind,total&at=gte.' + encodeURIComponent(from) + '&at=lt.' + encodeURIComponent(to) + '&limit=20000');
  const sum: Record<string, number> = {}; let n = 0;
  for (const r of rows) { const k = String(r.kind || 'other'); sum[k] = (sum[k] || 0) + Number(r.total || 0); n++; }
  const label = period === 'yesterday' ? 'امبارح' : period === 'week' ? 'آخر 7 أيام' : period === 'month' ? 'آخر 30 يوم' : 'النهارده';
  if (!n) return { speak: 'مفيش مبيعات ' + label + ' لسه', do_now: [{ type: 'open_tab', tab: 'sales' }] };
  // ar_sales.kind: «sale» / «return» (2026-11-17)
  const ret = Object.entries(sum).filter(([k]) => /return/.test(k)).reduce((a, [, v]) => a + Math.abs(v), 0);
  const gross = Object.entries(sum).filter(([k]) => !/return/.test(k)).reduce((a, [, v]) => a + v, 0);
  return { speak: 'مبيعات ' + label + ': ' + money(gross - ret) + ' جنيه في ' + n + ' فاتورة' + (ret >= 1 ? '، والمرتجع ' + money(ret) : '') + '.', do_now: [{ type: 'open_tab', tab: 'sales' }] };
}

// ---------- Gemini: understand the sentence, pick one tool ----------
const SYSTEM = [
  'You are Adam («آدم»), the voice assistant of an Egyptian pharmacy. The owner talks to you while working, by voice.',
  'Answer in short spoken EGYPTIAN Arabic (one or two sentences). Never use his name or titles; «يا فندم» and «حضرتك» are fine.',
  'When the question needs the pharmacy\'s data or a page, call exactly ONE tool. Use the conversation context: «هو / ده / اعمله / اللي قلتلك عليه» mean the item or person talked about last.',
  'Call `laptop` for anything you cannot answer with the tools, and ALWAYS for anything that records, changes or sends: a sale, a payment, a transfer between bags, a purchase order, a stock count, a WhatsApp message, a call, cancelling something, or questions about profit, reasons or analysis.',
  'Call `end` when he ends the conversation («خلاص»، «شكرا»، «كده تمام»، «مع السلامة»).',
  'For small talk answer yourself in a few words, no tool.',
  'Never open a page instead of answering a question: open_page only when he asks to open or see a page. If he asks for data no tool has (for example how many people visited the store site), call `laptop`.',
  'Never say purchase prices, discounts or suppliers unless he asks for them: customers may be listening.',
].join('\n');
const TOOLS = [{
  functionDeclarations: [
    { name: 'item_info', description: 'ONE medicine or product: by default only its name and public price (he often asks in front of customers). More only when he asks for it.', parameters: { type: 'OBJECT', properties: {
      name: { type: 'STRING', description: 'The product name as he said it (Arabic or English), without words like سعر/عندنا/كام/رصيد. Empty when he means the product talked about last.' },
      want: { type: 'STRING', enum: WANTS, description: 'price = just the name and the public price (the default: «سعر X»، «X بكام»، or only the name); stock = how many we have («عندنا كام»، «موجود؟»، «رصيد X»); last_buy = from which warehouse / when / discount («اشترينا منين»، «آخر شرا»، «خصمه»); expiry = its expiry («صلاحيته»); all = everything («كل حاجة عن»).' },
    }, required: ['name'] } },
    { name: 'shortages', description: 'The shortage lists: «النواقص العامة» (general) or a bag («حقيبة النواقص اليومية»، «حقيبة سرحان»، «نواقص كل الشركات»).', parameters: { type: 'OBJECT', properties: { which: { type: 'STRING', enum: ['general', 'bag'] }, bag: { type: 'STRING', description: 'The bag as he named it, when which=bag.' }, read_aloud: { type: 'BOOLEAN', description: 'true when he wants the items read one by one («اقرالي»، «قولي اللي فيها»).' } }, required: ['which'] } },
    { name: 'balance', description: 'The account balance of a customer («عميل») or a supplier / warehouse («مورد»، «مخزن»، e.g. الفتح، ابن سينا، فارما).', parameters: { type: 'OBJECT', properties: { party: { type: 'STRING', enum: ['customer', 'vendor'] }, name: { type: 'STRING' } }, required: ['party', 'name'] } },
    { name: 'sales', description: 'Sales totals for a period.', parameters: { type: 'OBJECT', properties: { period: { type: 'STRING', enum: ['today', 'yesterday', 'week', 'month'] } }, required: ['period'] } },
    { name: 'open_page', description: 'Open a page of the bot app. Pages: ' + Object.entries(PAGES).map(([k, v]) => k + '=«' + v + '»').join('، ') + '. «الطلبيات» is drafts (orders to the warehouses); «طلبات الموقع» is storeorders.', parameters: { type: 'OBJECT', properties: { page: { type: 'STRING', enum: Object.keys(PAGES) } }, required: ['page'] } },
    { name: 'laptop', description: 'Hand the request to the laptop assistant (anything that records/changes/sends, or that the other tools cannot answer).' },
    { name: 'end', description: 'He ended the conversation.' },
  ],
}];

type Pick = { tool: string; args: Json } | { text: string } | null;
async function understand(env: Env, f: typeof fetch, model: string, text: string, history: { who: string; text: string }[], ctx: Json | null): Promise<{ pick: Pick; why: string }> {
  const contents = history.map((h) => ({ role: h.who === 'adam' ? 'model' : 'user', parts: [{ text: h.text }] }));
  const note = ctx && Object.keys(ctx).length ? '\n[context: ' + JSON.stringify(ctx) + ']' : '';
  contents.push({ role: 'user', parts: [{ text: text + note }] });
  const body = (thinking: boolean) => JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] }, contents, tools: TOOLS,
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { temperature: 0.1, maxOutputTokens: 200, ...(thinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
  });
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': String(env.GEMINI_API_KEY) };
  let g = await f(url, { method: 'POST', headers, body: body(true), signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) }).catch(() => null);
  if (g && g.status === 400) g = await f(url, { method: 'POST', headers, body: body(false), signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) }).catch(() => null);   // a model without the «no thinking» switch
  if (!g || !g.ok) return { pick: null, why: 'gemini ' + (g ? g.status : 'down') };
  const j = await g.json().catch(() => null) as { candidates?: { content?: { parts?: { text?: string; functionCall?: { name?: string; args?: Json } }[] } }[] } | null;
  const parts = j?.candidates?.[0]?.content?.parts || [];
  const fc = parts.find((p) => p.functionCall)?.functionCall;
  if (fc?.name) return { pick: { tool: String(fc.name), args: (fc.args || {}) as Json }, why: '' };
  const t = parts.map((p) => p.text || '').join(' ').trim();
  return t ? { pick: { text: t }, why: '' } : { pick: null, why: 'empty' };
}

// ---------- «آدم 3»: Gemini listens to the sentence (the phone sends only HIS sentences: his voiceprint is checked there) ----------
const HEAR = [
  'Write down, word for word, what is said in this recording.',
  'A pharmacist in Egypt is talking: Egyptian Arabic, often with medicine names in English. Write the Arabic in Arabic letters exactly as said (Egyptian, not formal Arabic); write medicine and product names as they sound, in Arabic or Latin letters.',
  'He may be talking to his voice assistant, called «آدم» (Adam): a sentence often starts with «آدم» or «يا آدم»; write the name as «آدم».',
  'He gives the assistant orders ending in «لي» («بيع لي»، «افتح لي»، «ادفع لي»، «قول لي»، «اقرا لي»): keep the «لي» as he says it (for example «بيع لي علبة», never «بيعي علبة»).',
  'Output ONLY the words said: no quotes, no translation, no notes, nothing of these instructions. If there is no clear speech, output nothing.',
].join('\n');
export async function transcribe(env: Env, f: typeof fetch, model: string, data: string, mime: string): Promise<{ text: string | null; why: string }> {
  const body = (thinking: boolean) => JSON.stringify({
    systemInstruction: { parts: [{ text: HEAR }] },
    // the sound only: a text part here was written down with the words (11-17: «افتح لي الطلبات اكتب الكلام ده»)
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data } }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 300, ...(thinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
  });
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': String(env.GEMINI_API_KEY) };
  let g = await f(url, { method: 'POST', headers, body: body(true), signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) }).catch(() => null);
  if (g && g.status === 400) g = await f(url, { method: 'POST', headers, body: body(false), signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) }).catch(() => null);
  if (!g || !g.ok) return { text: null, why: 'gemini ' + (g ? g.status : 'down') };
  const j = await g.json().catch(() => null) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  const parts = j?.candidates?.[0]?.content?.parts || [];
  const t = parts.map((p) => p.text || '').join(' ').replace(/["«»“”]/g, ' ').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { text: t.slice(0, MAX_TEXT), why: '' };
}

// best effort, per running copy of the function
const seen = new Map<string, number[]>();
function tooMany(key: string, now: number): boolean {
  const list = (seen.get(key) || []).filter((t) => now - t < 60000);
  list.push(now); seen.set(key, list);
  if (seen.size > 50) for (const k of seen.keys()) { if (k !== key) seen.delete(k); }
  return list.length > PER_MINUTE;
}

const ENDS = /^(خلاص|شكرا|شكرًا|متشكر|كده تمام|تمام كده|مع السلامه|سلام|لا خلاص|خلاص كده|خلاص شكرا)[ .!]*$/;
// answers to «تقصد X؟» (normalized text)
const YES = /^(ايوه|ايوا|اه|ايوه هو|هو ده|هو|صح|بالظبط|نعم|ايوه بالظبط|ايوه ده|ايوه هو ده|تمام|ايوه صح)$/;
const NO = /^(لا|لا مش ده|مش ده|لا خالص|لا مش هو|مش هو)$/;

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch, now = Date.now()): Promise<Response> {
  const t0 = Date.now();
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  const key = String(req.headers.get('x-adam-key') || '');
  if (!KEY_RE.test(key)) return reply(401, { error: 'key' });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.GEMINI_API_KEY) return reply(503, { error: 'not-configured' });
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const rr = await fetchImpl(base + '/rest/v1/rpc/ar_adam_role', {
    method: 'POST', headers: { ...serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: key }), signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  const role = rr && rr.ok ? await rr.json().catch(() => null) : null;
  if (role !== 'phone' && role !== 'laptop') return reply(401, { error: 'key' });
  if (tooMany(key, now)) return reply(429, { error: 'rate' });
  let body: { action?: unknown; text?: unknown; history?: unknown; ctx?: unknown; audio?: unknown; mime?: unknown; mode?: unknown; vp?: unknown; idle?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: 'body' }); }
  const c: Ctx = { base, key: env.SUPABASE_SERVICE_ROLE_KEY, fetch: fetchImpl };
  const model = (env.GEMINI_TEXT_MODEL || TEXT_MODEL).trim();
  if (!MODEL_RE.test(model)) return reply(500, { error: 'model' });

  if (body.action === 'hear') {
    const audio = typeof body.audio === 'string' ? body.audio.replace(/\s+/g, '') : '';
    const mime = String(body.mime || 'audio/aac');
    if (!audio || !/^[A-Za-z0-9+/]+=*$/.test(audio)) return reply(400, { error: 'audio' });
    if (audio.length > MAX_AUDIO) return reply(413, { error: 'long', max: MAX_AUDIO });
    if (!AUDIO_TYPES.has(mime)) return reply(400, { error: 'mime' });
    const h = await transcribe(env, fetchImpl, model, audio, mime);
    if (h.text === null) return reply(502, { error: 'gemini', why: h.why });
    const mode = body.mode === 'idle' ? 'idle' : 'convo';
    const vp = Number(body.vp);
    // for tuning his voiceprint from the logs: never the words themselves
    console.log(JSON.stringify({ hear: mode, vp: Number.isFinite(vp) ? Math.round(vp * 100) / 100 : null, chars: h.text.length, ms: Date.now() - t0 }));
    if (mode !== 'idle') return reply(200, { ok: true, text: h.text, to: 'convo', ms: Date.now() - t0 });
    const a = h.text ? addressed(h.text, await extraVerbs(c, now)) : { to: null, text: '' };
    return reply(200, { ok: true, text: h.text, to: a.to, rest: a.text, verb: (a as { verb?: string }).verb || null, ms: Date.now() - t0 });
  }

  if (body.action === 'models') {
    const m = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': env.GEMINI_API_KEY }, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
    const j = m && m.ok ? await m.json().catch(() => null) as { models?: { name?: string }[] } | null : null;
    if (!j) return reply(502, { error: 'gemini', status: m ? m.status : 0 });
    return reply(200, { ok: true, models: (j.models || []).map((x) => String(x.name || '').replace(/^models\//, '')).filter((n) => /^gemini/.test(n) && !/tts|embedding|image|audio|live/i.test(n)) });
  }

  const text = typeof body.text === 'string' ? body.text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!text) return reply(400, { error: 'text' });
  if (text.length > MAX_TEXT) return reply(413, { error: 'long', max: MAX_TEXT });
  const history = (Array.isArray(body.history) ? body.history as Turn[] : []).slice(-8)
    .map((h) => ({ who: h?.who === 'adam' ? 'adam' : 'me', text: String(h?.text || '').slice(0, MAX_TEXT) })).filter((h) => h.text);
  const ctx = body.ctx && typeof body.ctx === 'object' && !Array.isArray(body.ctx) ? body.ctx as Json : null;
  // a «لي» command heard without his name: answered only when there is a real answer (or it records something: the laptop and its
  // «أيوه»); small talk, «not found» and handovers that record nothing mean he was talking to someone else: Adam stays quiet
  const idle = body.idle === true;
  const idleVerb = idle ? commandVerb(text, await extraVerbs(c, now)) : null;
  const done = (a: Answer, tool: string) => {
    if (idle) {
      const records = !!a.handoff && !!idleVerb && WRITE_VERBS.has(idleVerb);
      const empty = tool === 'chat' || tool === 'end' || /^مش لاقي/.test(a.speak || '') || (!!a.handoff && !records) || !idleVerb;
      if (empty) return reply(200, { ok: true, ignore: true, tool, ms: Date.now() - t0 });
    }
    return reply(200, { ok: true, ...a, show: a.show || a.speak, tool, ms: Date.now() - t0 });
  };

  if (ENDS.test(norm(text))) return done({ speak: 'تمام', end: true }, 'end');
  // «زوّد أمر اطبع لي»: a new «لي» word (written in storage; the only thing this function writes)
  const add = ADD_COMMAND.exec(norm(text));
  if (add) {
    const v = add[1].replace(/(لي|ليا)$/, '');
    if (v.length < 2) return done({ speak: 'قول الكلمة تاني' }, 'add_command');
    const ok = await addVerb(c, v, now);
    return done({ speak: ok ? 'تمام، من دلوقتي «' + v + ' لي» أمر ليا، من غير ما تقول آدم.' : 'مقدرتش أحفظها دلوقتي، جرّب تاني' }, 'add_command');
  }
  const page = pageOf(text);
  if (page) return done({ speak: 'فتحتلك ' + PAGES[page], do_now: [{ type: 'open_tab', tab: page }] }, 'open_page');
  // «تقصد X؟» → his «أيوه» / «التاني» / «لا» is answered at once, without Gemini
  const sug = ctx && ctx.suggest && typeof ctx.suggest === 'object' ? ctx.suggest as Json : null;
  if (sug) {
    const n = norm(text), s2 = ctx && ctx.suggest2 && typeof ctx.suggest2 === 'object' ? ctx.suggest2 as Json : null;
    const wantOf = (s: Json) => (WANTS.includes(String(s.want)) ? String(s.want) : 'price') as Want;
    if (YES.test(n)) return done(await itemAnswer(c, Number(sug.id), wantOf(sug), now), 'item_info');
    if (s2 && (/التاني|الثاني|التانيه|التانى/.test(n) || norm(String(s2.name)).split(' ').some((w) => w.length > 2 && n.includes(w)))) return done(await itemAnswer(c, Number(s2.id), wantOf(s2), now), 'item_info');
    if (NO.test(n)) return done({ speak: 'طيب، قول اسم الصنف تاني' }, 'item_info');
  }
  const { pick, why } = await understand(env, fetchImpl, model, text, history, ctx);
  // Gemini not there: the laptop still answers (the old way)
  if (!pick) return done({ speak: '', handoff: true }, 'handoff:' + why);
  if ('text' in pick) return done({ speak: pick.text.slice(0, 300) }, 'chat');
  const a = pick.args;
  try {
    switch (pick.tool) {
      case 'item_info': {
        const want = (WANTS.includes(String(a.want)) ? String(a.want) : 'price') as Want;
        return done(await itemInfo(c, String(a.name || ''), want, now, ctx && ctx.item && typeof ctx.item === 'object' ? ctx.item as Json : null), 'item_info');
      }
      case 'shortages': {
        const ctxBag = ctx && ctx.list === 'bag' ? String(ctx.bag || '') : '';
        // «اقرالي الباقي» right after a bag means that bag, not the general list (unless he says «العامة»)
        const which = ctxBag && !a.bag && !/عام/.test(norm(text)) ? 'bag' : String(a.which || 'general');
        return done(await shortages(c, which, String(a.bag || ''), a.read_aloud === true, now, ctxBag), 'shortages');
      }
      case 'balance': return done(await balance(c, String(a.party || 'customer'), String(a.name || '')), 'balance');
      case 'sales': return done(await sales(c, String(a.period || 'today'), now), 'sales');
      case 'open_page': {
        const p = String(a.page || '');
        if (!PAGES[p]) return done({ speak: 'مش عارف الصفحة دي' }, 'open_page');
        return done({ speak: 'فتحتلك ' + PAGES[p], do_now: [{ type: 'open_tab', tab: p }] }, 'open_page');
      }
      case 'end': return done({ speak: 'تمام', end: true }, 'end');
      default: return done({ speak: '', handoff: true }, 'laptop');
    }
  } catch (e) {
    return done({ speak: '', handoff: true }, 'handoff:error ' + String((e as Error)?.message || e).slice(0, 80));
  }
}

const deno = (globalThis as unknown as { Deno?: { serve: (h: (req: Request) => Promise<Response>) => void; env: { toObject: () => Env } } }).Deno;
if (deno) deno.serve((req) => handle(req, deno.env.toObject(), fetch));
