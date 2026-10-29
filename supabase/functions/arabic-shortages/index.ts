// ASKER trial bot (asker-nawaqes-arabic.html) — separate from V10 and its function read-supplier-image.
// Idea: translate the shortage list to Arabic once (the owner reviews it), then compare supplier lines
// Arabic-to-Arabic against ~2000 shortages only, instead of 31,000 English catalogue items.
// The shortage list is this bot's own (ar_shortages, filled from the page), separate from V10's shortage_items.
// Actions (owner only, same secrets as V10: GEMINI_API_KEY, ALLOWED_EMAILS, GEMINI_MODEL, ALLOWED_ORIGINS):
//   translate {limit}       -> Gemini suggests Arabic names for shortages that have none yet (ar_names)
// Arabic names and the owner's answers are kept per product (name_key = the English name, upper case, single
// spaces), not per shortage row: an item that leaves the shortage list and comes back later keeps them.
//   read {image, mimeType}  -> Gemini reads the supplier image; each line is matched to the shortages
//   lines {lines: string[]}  -> typed lines or an Excel name column, matched without Gemini
//   match {name, english, read} -> re-match one line after the owner corrects its Arabic text
// Inbox (no login; header x-inbox-key, see the section «automatic incoming» below): the owner's phone forwards a
//   supplier's WhatsApp text, image, PDF or Excel file; it is read, matched and kept in ar_inbox for the page.
// Smart matching uses the same tools as V10: strength/pack/form/brand rules (match.ts), the owner's reading
// corrections, «أيوه» / «مش ده» answers (exact and near: same numbers, same form, very close text), names marked
// «مش مهم». Fully independent of V10: it never reads V10 tables. What the owner had taught V10 was copied once into
// ar_answers / ar_fixes (migration 202610280013).
// Tables are read and written with the caller's own session (owner-only RLS).

import { Catalog, OFFER_MIN, aliasKey, decide, forms, formsAgree, sameNumbers, similarity, type CatalogItem, type Candidate, type Match } from './match.ts';

export const VERSION = 'ar9';
const DEFAULT_MODEL = 'gemini-flash-latest';
const DEFAULT_ORIGINS = 'https://taherasker2560-dot.github.io';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_LINES = 600;
const TIMEOUT_MS = 15000, GEMINI_TIMEOUT_MS = 55000;

type Env = Record<string, string | undefined>;
type Shortage = { id: string; product_name: string };
type ArName = { name_key: string; arabic_name: string; status: string };
type Decision = { alias_key: string; read_text: string; name_key: string; decision: 'yes' | 'no' };
// Same key in the page (asker-nawaqes-arabic.html) and in the database migration.
export const nameKey = (s: string) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 250);
type Row = { name: string; english: string; unclear: boolean };
type Fix = { read_key: string; corrected_text: string };
// Everything the owner taught this bot, loaded once per request.
export type Knowledge = { names: ArName[]; answers: Decision[]; fixes: Fix[]; ignored: Set<string> };

function log(stage: string, started: number, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ stage, ms: Date.now() - started, ...extra }));
}
const list = (v: string | undefined) => String(v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
function cors(origin: string | null, env: Env, requested?: string | null): Record<string, string> {
  const allowed = list(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS);
  const extra = String(requested || '').split(',').map((h) => h.trim().toLowerCase()).filter((h) => /^[a-z0-9-]{1,64}$/.test(h)).slice(0, 30);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': [...new Set(['authorization', 'x-client-info', 'apikey', 'content-type', ...extra])].join(', '),
    'Access-Control-Max-Age': '600', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin',
  };
  if (origin && allowed.includes(origin.toLowerCase())) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
const reply = (status: number, body: unknown, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export function arabicLetters(s: string): string {
  return s.replace(/[گک]/g, 'ك').replace(/ی(?=\p{L})/gu, 'ي').replace(/ی/g, 'ى').replace(/پ/g, 'ب').replace(/ڤ/g, 'ف').replace(/چ/g, 'ج').replace(/ژ/g, 'ز');
}
const clean = (s: unknown) => typeof s === 'string' ? arabicLetters(s).replace(/[\r\n|]+/g, ' ').replace(/\s+/g, ' ').trim() : '';

// All rows of a table through PostgREST, 1000 at a time, with the caller's session
// (auth = 'Bearer <user token>') or with ready headers (the inbox's service-role headers).
type Auth = string | Record<string, string>;
async function restAll<T>(env: Env, auth: Auth, fetchImpl: typeof fetch, path: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 50000; offset += 1000) {
    const r = await fetchImpl(`${env.SUPABASE_URL!.replace(/\/$/, '')}/rest/v1/${path}&limit=1000&offset=${offset}`, {
      headers: typeof auth === 'string' ? { Authorization: auth, apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '' } : auth, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) throw new Error('rest ' + path.split('?')[0] + ' ' + r.status);
    const page = await r.json() as T[];
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

async function gemini(env: Env, fetchImpl: typeof fetch, parts: unknown[], schema: unknown): Promise<string> {
  const model = (env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  const deadline = AbortSignal.timeout(GEMINI_TIMEOUT_MS);
  let res: Response | null = null;
  for (const config of [{ responseSchema: schema, thinkingConfig: { thinkingBudget: 0 } }, { responseSchema: schema }, {}]) {
    res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY as string },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json', ...config } }), signal: deadline,
    });
    if (res.status !== 400) break;
  }
  if (!res || res.status === 429) throw new Error('quota');
  if (!res.ok) throw new Error('gemini ' + res.status);
  const data = await res.json().catch(() => null) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
}

async function knowledge(env: Env, auth: Auth, fetchImpl: typeof fetch): Promise<Knowledge> {
  const soft = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
  const [names, answers, fixes, ignored] = await Promise.all([
    restAll<ArName>(env, auth, fetchImpl, 'ar_names?select=name_key,arabic_name,status&order=name_key'),
    restAll<Decision>(env, auth, fetchImpl, 'ar_answers?select=alias_key,read_text,name_key,decision&order=id'),
    soft(restAll<Fix>(env, auth, fetchImpl, 'ar_fixes?select=read_key,corrected_text&order=read_key')),
    soft(restAll<{ alias_key: string }>(env, auth, fetchImpl, 'ar_ignored?select=alias_key&order=alias_key')),
  ]);
  return { names, answers, fixes, ignored: new Set(ignored.map((x) => x.alias_key)) };
}

export const TRANSLATE_PROMPT = [
  'You get product names from an Egyptian pharmacy system (English, PharmaFly style, e.g. "BRUFEN 400MG 30TAB", "FLAGYL 125MG SYP").',
  'Write each one the way Egyptian medicine distributors write it in their Arabic availability lists:',
  'the brand in Arabic letters as it is pronounced in Egypt (بروفين، فلاجيل، جلوكوفاج), the strength with Arabic-Indic digits and مجم / مل / جم,',
  'and the form in Arabic: اقراص، كبسول، شراب، معلق، نقط، قطرة، امبول، فيال، كريم، جيل، مرهم، لبوس، لبوس مهبلي، اكياس، فوار، بخاخ، سبراي، غسول، شامبو، لوشن، بودرة.',
  'Keep the pack count only if it matters (٢٨ قرص). Never add words that are not in the name. Never replace a brand with another one.',
  'Answer only JSON: {"items":[{"i":0,"ar":"..."}]} with the same i as the input.',
].join('\n');
const TRANSLATE_SCHEMA = { type: 'OBJECT', properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { i: { type: 'INTEGER' }, ar: { type: 'STRING' } }, required: ['i', 'ar'] } } }, required: ['items'] };

export const READ_PROMPT = [
  'This image (or PDF) is a supplier list of pharmacy products, usually a table with a product-name column (الصنف) and a quantity or price column.',
  'Return ONLY the product names, one entry per table row, from top to bottom, copied exactly as written (keep every number and word like اقراص / شراب / امبول).',
  'Do not translate, correct or guess. Skip the header, quantity and price columns. If a name is hard to read, give your best reading and set unclear to true.',
  'These lists use a font where the Arabic letter ك can look like ق, ج or گ: when a letter could be ك, prefer the spelling of the real medicine brand. Write only Arabic letters (no Persian letters).',
  'For each row also give "english": the product in Latin capitals as an Egyptian pharmacy system would list it (brand, strength, pack).',
  'Also give "supplier": the company or distributor name if it is written on the list (title, logo, stamp), otherwise "".',
  'Answer only JSON: {"supplier":"...","rows":[{"name":"...","english":"...","unclear":false}]}',
].join('\n');
const READ_SCHEMA = { type: 'OBJECT', properties: { supplier: { type: 'STRING' }, rows: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, english: { type: 'STRING' }, unclear: { type: 'BOOLEAN' } }, required: ['name'] } } }, required: ['rows'] };

// The shortage list as a small "catalogue": the English name, plus the Arabic name (owner-approved or suggested)
// and every supplier text the owner said yes to as extra names.
export function shortageCatalog(shortages: Shortage[], names: ArName[], decisions: Decision[]): Catalog {
  const ar = new Map(names.map((n) => [n.name_key, n.arabic_name]));
  const yes = new Map<string, string[]>();
  for (const d of decisions) if (d.decision === 'yes') { const l = yes.get(d.name_key) || []; l.push(d.read_text); yes.set(d.name_key, l); }
  const items: CatalogItem[] = shortages.map((s) => {
    // English (PharmaFly) name first: strength and pack are read from it; Arabic names only help find the item.
    const k = nameKey(s.product_name);
    const alts = [ar.get(k), ...(yes.get(k) || [])].filter((x): x is string => !!x);
    return alts.length ? [s.id, s.product_name, alts] : [s.id, s.product_name];
  });
  return new Catalog(items);
}

// name_key stored with decision 'no' when the owner answers «مش واحد منهم» for a line.
export const NOT_LISTED = '*';
// readKey: the key of the text as first read, when `rows` hold the owner's correction (its «مش ده» still applies).
export function matchRows(rows: Row[], cat: Catalog, k: Knowledge, shortages: Shortage[], readKey = '') {
  const idOf = new Map<string, string>(), keyOf = new Map<string, string>();
  for (const s of shortages) { const n = nameKey(s.product_name); keyOf.set(s.id, n); if (!idOf.has(n)) idOf.set(n, s.id); }
  const yes = new Map<string, string>(), no = new Map<string, Set<string>>();
  for (const d of k.answers) {
    if (d.decision === 'yes') { if (!yes.has(d.alias_key)) yes.set(d.alias_key, d.name_key); }
    else { const s = no.get(d.alias_key) || new Set<string>(); s.add(d.name_key); no.set(d.alias_key, s); }
  }
  const fixOf = new Map(k.fixes.map((f) => [f.read_key, f.corrected_text]));
  const yesTexts = k.answers.filter((d) => d.decision === 'yes' && idOf.has(d.name_key));
  const noTexts = k.answers.filter((d) => d.decision === 'no');
  return rows.map((r) => {
    const key = aliasKey(r.name);
    const corrected = readKey ? null : fixOf.get(key) || null;
    const text = corrected || r.name, textKey = aliasKey(text);
    const rejected = new Set([...(no.get(key) || []), ...(no.get(textKey) || []), ...(readKey ? no.get(readKey) || [] : [])]);
    // «مش ده» / «مش واحد منهم» also hold when the same line is read a little differently next time
    // (same numbers, same form, very close text), like confirmed lines do.
    const textForms = forms(text);
    for (const d of noTexts) {
      if (rejected.has(d.name_key) || !sameNumbers(text, d.read_text) || !formsAgree(textForms, forms(d.read_text))) continue;
      if (similarity(text, d.read_text) >= 0.85) rejected.add(d.name_key);
    }
    // NOT_LISTED: the owner said this line is none of the shortages offered; it is not offered again (no new
    // suggestions after the first ones were refused) and shows with the unknown lines, where «تصحيح» can still pick.
    const notListed = rejected.has(NOT_LISTED);
    const candidates: Candidate[] = notListed ? [] : cat.candidates(text, r.english, 3 + rejected.size).filter((c) => !rejected.has(keyOf.get(c.id) || '')).slice(0, 3);
    let match: Match | null = decide(candidates);
    const y = yes.get(key) || yes.get(textKey), yid = y && !rejected.has(y) ? idOf.get(y) : undefined;
    if (yid) match = { id: yid, name: '', score: 1, confidence: 'confirmed' };
    else {
      // written a little differently from a line the owner confirmed: same numbers, same form, very close text
      const near = new Set<string>();
      for (const d of yesTexts) {
        if (rejected.has(d.name_key) || !sameNumbers(text, d.read_text) || !formsAgree(textForms, forms(d.read_text))) continue;
        if (similarity(text, d.read_text) >= 0.85) near.add(d.name_key);
      }
      if (near.size === 1 && !notListed) match = { id: idOf.get([...near][0])!, name: '', score: 0.95, confidence: 'high', via: 'alias' };
    }
    return { ...r, key, corrected, match, candidates, ignored: k.ignored.has(key) };
  });
}

// One typed line (or Excel cell) -> a row. Anything after | or a tab is the quantity/price and is dropped.
// A line with no Arabic letters is an English name, so it is also given as the "english" reading.
export function lineRow(v: unknown): Row | null {
  const name = clean(String(v ?? '').split(/[|\t]/)[0]).replace(/^[\s\-–•*\d٠-٩]{0,4}[.)\-–]\s+/, '').trim();
  if (name.length < 2 || name.length > 250 || !/[\p{L}]/u.test(name)) return null;
  return { name, english: /[\u0600-\u06FF]/.test(name) ? '' : name.slice(0, 250), unclear: false };
}

// Gemini's reading of a supplier image/PDF -> rows (+ the company name if written on the list); null if not JSON.
export function parseRead(text: string): { rows: Row[]; supplier: string } | null {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }
  const rows: Row[] = (((parsed as { rows?: unknown[] })?.rows) || []).slice(0, 600)
    .map((r) => ({ name: clean((r as Row)?.name), english: clean((r as Row)?.english).slice(0, 250), unclear: (r as Row)?.unclear === true }))
    .filter((r) => r.name.length >= 2 && r.name.length <= 250);
  return { rows, supplier: clean((parsed as { supplier?: unknown })?.supplier).slice(0, 80) };
}

// ---------- automatic incoming (the owner's phone forwards supplier messages) ----------
// POST <function>?from=<company name as saved in the bot>[&name=<file name>][&say=1][&seen=1], header x-inbox-key: <key>.
// Body: the message text (text/plain) or the file itself (image/*, application/pdf, Excel/CSV).
// The key is created in the page; only its sha256 is stored (ar_inbox_keys). Only companies saved in the bot
// (ar_suppliers) are accepted, so other chats are never read. Runs with the service role (no login on the phone).
const SHEET = /\.(xlsx|xls|csv)$/i;
// a photo/file the phone sent again within this time is a re-send of the newest ones (silent); older = really sent again
const DUP_SILENT_MS = 10 * 60 * 1000;
// several notifications can run at once: if this company's photo/file was read this recently, another run is
// already saying the totals, so «seen» stays silent
const SEEN_QUIET_MS = 2 * 60 * 1000;
// a second run that finds the same file already stored waits for the first run's row (checks every 2 s, 6 times)
const CLAIM_POLLS = 6;
// the phone sends the photos saved in the last 3 minutes: if two companies announced photos in that time, nobody
// can tell whose photo is whose (one folder on the phone), so the photo keeps both names until the owner picks one
const MEDIA_WINDOW_MS = 3 * 60 * 1000;
// WhatsApp shows a chat's notification again, unchanged, when another notification comes and after the phone speaks.
// A photo notification just like that chat's last one (same title and text) within this time is that repeat (not
// fresh): it does not count as the company sending photos now, and «seen» stays silent for it. A new message changes
// the notification (WhatsApp adds the count to the title: «(2 رسائل)»).
const REPEAT_MS = 30 * 60 * 1000;
// «seen» comes about a minute and a half after its notification (the phone checks the folder twice)
const SEEN_NOTE_MS = 5 * 60 * 1000;
// Gemini busy (5xx): the photo is saved as not read and the phone is told; it is read again in the background
// (after 15 s, then 30 s) and its row filled in. The phone is not told again (it already has its answer).
const RETRY_WAITS_MS = [15000, 30000];
// some suppliers send a list as one message per item: after the first text, the next ones from the same company within
// this time are spoken only when they bring something from the shortages (then with today's totals)
const TEXT_BURST_MS = 3 * 60 * 1000;
// WhatsApp's notification text for a photo, file, video or voice note (no list in it)
const MEDIA_NOTE = /^\s*(\u{1F4F7}|\u{1F4C4}|\u{1F3A5}|\u{1F3A4}|\u{1F3B5}|\u{1F5BC}|\u{1F4CE}|\u{1F4F9})/u;
const NAME_HEAD = /اسم|صنف|منتج|دواء|بيان|name|item|product|description|desc/i, NOT_NAME = /سعر|خصم|كمي|عدد|رصيد|قيم|اجمال|تاريخ|كود|باركود|price|qty|quantity|disc|total|amount|code|barcode|date|expiry/i;
// Same rule as the page: header row = first of the top 20 rows with a name-like title; else the column with most text.
export function sheetNames(m: unknown[][]): string[] {
  let head = -1, col = -1;
  for (let r = 0; r < Math.min(20, m.length) && head < 0; r++) {
    const c = (m[r] || []).findIndex((v) => NAME_HEAD.test(String(v ?? '')) && !NOT_NAME.test(String(v ?? '')) && String(v).length < 40);
    if (c >= 0) { head = r; col = c; }
  }
  if (col < 0) {
    const width = Math.max(0, ...m.slice(0, 200).map((r) => (r || []).length));
    let best = -1;
    for (let c = 0; c < width; c++) { const n = m.slice(0, 200).filter((r) => /\p{L}{3,}/u.test(String((r || [])[c] ?? ''))).length; if (n > best) { best = n; col = c; } }
  }
  const title = head >= 0 ? String(m[head][col] ?? '').trim() : '';
  return m.slice(head + 1).map((r) => String((r || [])[col] ?? '').trim()).filter((v) => v.length >= 2 && /\p{L}/u.test(v) && v !== title);
}
async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
// What a file is, from its first bytes (JPEG, PNG, WebP, PDF, xlsx = zip, old xls); '' when unknown.
export function sniffMime(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  return '';
}
function indexOfBytes(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
// The file inside a multipart body: the part that is a known file (by its first bytes), else the largest part.
export function filePart(body: Uint8Array, boundary: string): { bytes: Uint8Array; type: string; name: string } {
  const none = { bytes: new Uint8Array(), type: '', name: '' };
  if (!boundary) return none;
  const enc = new TextEncoder(), sep = enc.encode('--' + boundary), gap = enc.encode('\r\n\r\n');
  const parts: { bytes: Uint8Array; type: string; name: string }[] = [];
  let at = indexOfBytes(body, sep);
  while (at >= 0) {
    const start = at + sep.length, next = indexOfBytes(body, sep, start);
    if (next < 0 || body[start] === 0x2d) break; // "--" after the boundary: the end
    const headEnd = indexOfBytes(body, gap, start);
    if (headEnd > 0 && headEnd < next) {
      const head = new TextDecoder().decode(body.subarray(start, headEnd));
      let end = next; if (body[end - 2] === 0x0d && body[end - 1] === 0x0a) end -= 2;
      parts.push({ bytes: body.subarray(headEnd + 4, end), type: (head.match(/content-type:\s*([^\r\n;]+)/i) || [])[1] || '', name: ((head.match(/filename="?([^"\r\n;]+)/i) || [])[1] || '').split(/[\\/]/).pop()!.slice(-120) });
    }
    at = next;
  }
  return parts.find((x) => sniffKind(x.bytes)) || parts.sort((a, b) => b.bytes.length - a.bytes.length)[0] || none;
}
export function sniffKind(b: Uint8Array): 'image' | 'pdf' | 'sheet' | '' {
  const m = sniffMime(b);
  if (m === 'application/pdf') return 'pdf';
  if (m) return 'image';
  if ((b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) || (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0)) return 'sheet';
  return '';
}
export function inboxKind(contentType: string, fileName: string): 'text' | 'image' | 'pdf' | 'sheet' | '' {
  const t = contentType.toLowerCase();
  if (SHEET.test(fileName) || /spreadsheet|excel|csv/.test(t)) return 'sheet';
  if (/pdf/.test(t) || /\.pdf$/i.test(fileName)) return 'pdf';
  if (/^image\//.test(t) || /\.(jpe?g|png|webp)$/i.test(fileName)) return 'image';
  if (/^text\/|json|^$/.test(t)) return 'text';
  return '';
}
// what the phone says out loud
export function inboxSay(company: string, sure: number, review: number): string {
  if (!sure && !review) return `${company}: مفيش حاجة من النواقص`;
  return `${company}: وصل ${sure} صنف من النواقص` + (review ? ` و${review} محتاجين تأكيدك` : '');
}
// Start of today in Cairo (the pharmacy's day), as an ISO time.
export function cairoDayStart(now = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(now).map((x) => [x.type, Number(x.value)]));
  return new Date(now.getTime() - (((p.hour % 24) * 60 + p.minute) * 60 + p.second) * 1000 - now.getMilliseconds()).toISOString();
}
// A list of 10+ pages comes as many photos: after the first one, the phone says the company's total for today.
type Saved = { rows: { match?: { id: string; confidence: string } | null }[] | null; review: number | null };
export function dayTotals(today: Saved[]): string {
  const ids = new Set<string>();
  for (const r of today) for (const x of r.rows || []) if (x.match && (x.match.confidence === 'high' || x.match.confidence === 'confirmed')) ids.add(x.match.id);
  const review = today.reduce((n, r) => n + (r.review || 0), 0);
  return `النهارده لحد دلوقتي ${ids.size} صنف من النواقص` + (review ? ` و${review} محتاجين تأكيدك` : '');
}
export function daySay(company: string, today: Saved[]): string { return `${company}: ${dayTotals(today)}`; }
// A photo/file that was read before: said with today's totals (when something came today).
export function seenSay(company: string, what: string, today: Saved[] | null): string {
  return `${company}: ${what} قبل كده` + (today && today.length ? `، و${dayTotals(today)}` : '');
}
// WhatsApp adds a count to the title when several messages wait: "الفتح shreif (2 رسائل)" / "(3 messages)"
export function inboxSender(s: string): string {
  return clean(s).replace(/\s*\(\s*[0-9٠-٩]+\s*[^()]*\)\s*$/u, '').slice(0, 80);
}
// Saved name vs chat title: every word of the saved name is in the title, in any order. A mixed Arabic/English
// name («Shreif الفتح») shows reversed on the phone, and a group message's title also holds the group's name
// («وارد مخزن النور …: Shreif الفتح»).
const words = (s: string) => aliasKey(s).split(' ').filter(Boolean);
export function sameCompany(saved: string, title: string): boolean {
  const need = words(saved), have = new Set(words(title));
  return need.length > 0 && need.every((w) => have.has(w));
}
export function serviceHeaders(service: string): Record<string, string> {
  return service.startsWith('sb_') ? { apikey: service } : { Authorization: 'Bearer ' + service, apikey: service };
}
export async function handleInbox(req: Request, env: Env, fetchImpl: typeof fetch): Promise<Response> {
  const out = (status: number, body: Record<string, unknown>, say: boolean) => say
    ? new Response(String(body.say || body.message || ''), { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    : reply(status, body, {});
  const url = new URL(req.url), say = url.searchParams.get('say') === '1';
  const service = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!service || !env.SUPABASE_URL || !env.GEMINI_API_KEY) return out(503, { error: 'not-configured', message: 'البوت مش جاهز يستقبل' }, say);
  if (req.method !== 'POST') return out(405, { error: 'method' }, say);
  // the service key goes in apikey; a new-style key (sb_secret_…) is not a JWT, so it is not sent as Bearer
  const base = env.SUPABASE_URL.replace(/\/$/, ''), sh = serviceHeaders(service), auth = sh;
  const key = (req.headers.get('x-inbox-key') || '').trim();
  if (!/^[0-9a-f]{32,128}$/.test(key)) return out(401, { error: 'key', message: 'مفتاح الموبايل غلط' }, say);
  const keys = await restAll<{ key_hash: string }>(env, auth, fetchImpl, 'ar_inbox_keys?select=key_hash&key_hash=eq.' + await sha256Hex(key));
  if (!keys.length) return out(401, { error: 'key', message: 'مفتاح الموبايل غلط، اعمل مفتاح جديد من البوت' }, say);
  const from = inboxSender(url.searchParams.get('from') || ''), fileName = (url.searchParams.get('name') || '').split(/[\\/]/).pop()!.slice(-120);
  const suppliers = await restAll<{ name: string; phone: string | null }>(env, auth, fetchImpl, 'ar_suppliers?select=name,phone&order=name');
  const company = suppliers.find((x) => sameCompany(x.name, from));
  // not one of the saved companies: ignored before anything is read or stored
  if (!company) return out(200, { ok: false, ignored: true, say: '' }, say);
  const since = (ms: number) => encodeURIComponent(new Date(Date.now() - ms).toISOString());
  // today's totals count only this company's sure rows (a photo still waiting for the owner to pick its company is not)
  const today = (name = company.name) => restAll<Saved>(env, auth, fetchImpl, 'ar_inbox?select=rows,review&status=neq.error&maybe=is.null&hidden_at=is.null&supplier=eq.' + encodeURIComponent(name) + '&received_at=gte.' + encodeURIComponent(cairoDayStart())).catch(() => null);
  // marks a company's recent photo notifications as handled (its photo was read, or «seen» was said); freshOnly: only
  // new ones, not WhatsApp's repeats. The count tells whether this run marked any (two runs at once: one wins).
  const handled = async (name: string, freshOnly: boolean): Promise<number> => {
    const r = await fetchImpl(`${base}/rest/v1/ar_inbox_media?supplier=eq.${encodeURIComponent(name)}${freshOnly ? '&fresh=is.true' : ''}&done=is.false&at=gte.${since(SEEN_NOTE_MS)}`, {
      method: 'PATCH', body: JSON.stringify({ done: true }), headers: { ...sh, 'Content-Type': 'application/json', Prefer: 'return=representation' }, signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => null);
    return r?.ok ? ((await r.json().catch(() => [])) as unknown[]).length : 0;
  };
  // seen=1: the phone got a photo notification but found no new photo (WhatsApp keeps one copy of a photo it
  // already has, so a photo sent again is not saved again): nothing is read or stored, only told.
  if (url.searchParams.get('seen') === '1') {
    const justRead = await restAll<{ id: string }>(env, auth, fetchImpl, 'ar_inbox?select=id&kind=neq.text&supplier=eq.' + encodeURIComponent(company.name) + '&received_at=gte.' + since(SEEN_QUIET_MS)).catch(() => []);
    const unsure = await restAll<{ maybe: string[] | null }>(env, auth, fetchImpl, 'ar_inbox?select=maybe&maybe=not.is.null&received_at=gte.' + since(SEEN_QUIET_MS)).catch(() => []);
    if (justRead.length || unsure.some((r) => (r.maybe || []).includes(company.name))) return out(200, { ok: true, seen: true, say: '' }, say);
    // told once for a new photo notification: WhatsApp's repeats of an old one stay silent (no loop of the same sentence)
    if (!await handled(company.name, true)) return out(200, { ok: true, seen: true, say: '' }, say);
    return out(200, { ok: true, seen: true, say: seenSay(company.name, 'الصورة دي وصلت', await today()) }, say);
  }
  // Tasker sends a file with its own Content-Type (not the one in the headers), sometimes as a form:
  // the file's first bytes decide what it is.
  let ct = req.headers.get('content-type') || '', name = fileName, bytes: Uint8Array;
  if (/^multipart\//i.test(ct)) {
    // Tasker: multipart/related with the file as one part (sometimes after an empty text part)
    const part = filePart(new Uint8Array(await req.arrayBuffer()), (ct.match(/boundary="?([^";]+)"?/i) || [])[1] || '');
    bytes = part.bytes; ct = part.type; name = name || part.name;
  } else bytes = new Uint8Array(await req.arrayBuffer());
  const kind = sniffKind(bytes) || inboxKind(ct, name);
  if (!kind) { log('inbox-type', Date.now(), { ct: ct.slice(0, 60), name }); return out(415, { error: 'type', message: 'نوع الملف مش مدعوم' }, say); }
  if (bytes.length > MAX_IMAGE_BYTES) return out(413, { error: 'size', message: 'الملف أكبر من ٨ ميجا' }, say);
  if (!bytes.length) return out(400, { error: 'empty', message: 'الرسالة فاضية' }, say);
  // the notification of a photo/file («📷 صورة», «📄 list.pdf»): the file itself comes in its own request
  // 202 (not 200) tells the phone «this chat is a saved company: send its photos/files now»; other chats get 200,
  // so the phone never sends photos from chats that are not suppliers.
  if (kind === 'text' && MEDIA_NOTE.test(new TextDecoder().decode(bytes.subarray(0, 64)))) {
    // remembered for MEDIA_WINDOW_MS (older notes are cleared now and then): see `maybe` below. The same title and text
    // as this chat's last note is WhatsApp showing it again (REPEAT_MS); the phone still checks the folder.
    const raw = String(url.searchParams.get('from') || ''), note = (raw + ' ' + new TextDecoder().decode(bytes.subarray(0, 600))).replace(/\s+/g, ' ').trim().slice(0, 300);
    const w = { ...sh, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, signal = AbortSignal.timeout(TIMEOUT_MS);
    const last = await fetchImpl(`${base}/rest/v1/ar_inbox_media?select=note&supplier=eq.${encodeURIComponent(company.name)}&chat=eq.${encodeURIComponent(from)}&at=gte.${since(REPEAT_MS)}&order=at.desc&limit=1`, { headers: sh, signal })
      .then((r) => r.ok ? r.json() : []).catch(() => []) as { note: string | null }[];
    const fresh = !Array.isArray(last) || last[0]?.note !== note;
    await fetchImpl(`${base}/rest/v1/ar_inbox_media`, { method: 'POST', body: JSON.stringify({ supplier: company.name, chat: from, note, fresh }), headers: w, signal }).catch(() => null);
    await fetchImpl(`${base}/rest/v1/ar_inbox_media?at=lt.${since(864e5)}`, { method: 'DELETE', headers: w, signal }).catch(() => null);
    return out(202, { ok: false, media: true, fresh, say: '' }, say);
  }
  // the phone may send the same photo/file again (it sends the newest ones each time): kept once, by its hash
  const hash = kind === 'text' ? '' : [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  if (hash) {
    const dup = await restAll<{ id: string; received_at?: string }>(env, auth, fetchImpl, 'ar_inbox?select=id,received_at&file_path=like.*' + hash + '*');
    if (dup.length) {
      // the phone re-sends the newest photos on every notification: those (read minutes ago) stay silent;
      // an old photo sent again is told so the owner knows it was not lost
      const old = dup.every((d) => !d.received_at || Date.parse(d.received_at) < Date.now() - DUP_SILENT_MS);
      const what = kind === 'image' ? 'الصورة دي اتقرت' : 'الملف ده اتقرا';
      return out(200, { ok: false, duplicate: true, say: old ? seenSay(company.name, what, await today()) : '' }, say);
    }
  }
  // the same notification can fire again (twice at once, or WhatsApp shows unread chats again later):
  // the same text from the same company is kept once a day (Cairo day)
  if (kind === 'text') {
    const since = cairoDayStart(), body = new TextDecoder().decode(bytes).slice(0, 20000);
    const recent = await restAll<{ body_text: string | null }>(env, auth, fetchImpl, 'ar_inbox?select=body_text&kind=eq.text&supplier=eq.' + encodeURIComponent(company.name) + '&received_at=gte.' + encodeURIComponent(since));
    if (recent.some((r) => r.body_text === body)) return out(200, { ok: false, duplicate: true, say: '' }, say);
  }
  const t0 = Date.now();
  let rows: Row[] = [], text: string | null = null, supplier = company.name, error: string | null = null, filePath: string | null = null;
  // a photo/file is stored first (private bucket: the owner can look at it from the page). Its name is its content
  // hash, so storing it also claims the reading: a second run sending the same file at the same moment (several
  // notifications run together) finds it there and waits for the first run's row instead of reading it again.
  if (kind !== 'text') {
    const ext = kind === 'pdf' ? 'pdf' : kind === 'sheet' ? (name.match(SHEET)?.[1] || (bytes[0] === 0xd0 ? 'xls' : 'xlsx')).toLowerCase() : 'jpg';
    filePath = `${new Date().toISOString().slice(0, 10)}/${hash}.${ext}`;
    const type = kind === 'pdf' ? 'application/pdf' : kind === 'image' ? 'image/jpeg' : 'application/octet-stream';
    const up = await fetchImpl(`${base}/storage/v1/object/ar-inbox/${filePath}`, { method: 'POST', body: bytes, headers: { ...sh, 'Content-Type': type }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!up.ok) {
      if (/duplicate|exists/i.test(await up.text().catch(() => ''))) {
        const wait = Number(env.INBOX_CLAIM_WAIT_MS) || 2000;
        for (let i = 0; i < CLAIM_POLLS; i++) {
          await new Promise((r) => setTimeout(r, wait));
          const done = await restAll<{ id: string }>(env, auth, fetchImpl, 'ar_inbox?select=id,received_at&file_path=like.*' + hash + '*').catch(() => []);
          if (done.length) return out(200, { ok: false, duplicate: true, say: '' }, say);
        }
        // still no row. Stored minutes ago: the owner deleted it from the page while the phone still re-sends the
        // newest photos, so it stays deleted (silent). Older: an old copy (the list was cleared long ago), read now.
        const at = await fetchImpl(`${base}/rest/v1/rpc/ar_inbox_file_at`, { method: 'POST', body: JSON.stringify({ p: filePath }), headers: { ...sh, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
          .then((r) => r.ok ? r.json() : null).catch(() => null);
        if (typeof at === 'string' && Date.parse(at) > Date.now() - DUP_SILENT_MS) return out(200, { ok: false, duplicate: true, deleted: true, say: '' }, say);
      } else filePath = null;
    }
  }
  const readImage = async (): Promise<Row[]> => {
    const t = ct.split(';')[0].trim().toLowerCase(), magic = sniffMime(bytes);
    const mime = kind === 'pdf' ? 'application/pdf' : magic || (/\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : t.startsWith('image/') ? t : 'image/jpeg');
    const read = parseRead(await gemini(env, fetchImpl, [{ text: READ_PROMPT }, { inline_data: { mime_type: MIME_TYPES.includes(mime) ? mime : 'image/jpeg', data: b64(bytes) } }], READ_SCHEMA));
    if (!read) throw new Error('رد Gemini مش مفهوم');
    return read.rows;
  };
  const scoreRows = async (rs: Row[]) => {
    let list: ReturnType<typeof matchRows> = [];
    if (rs.length) {
      const [shortages, k] = await Promise.all([restAll<Shortage>(env, auth, fetchImpl, 'ar_shortages?select=id,product_name&is_active=eq.true&order=id'), knowledge(env, auth, fetchImpl)]);
      list = matchRows(rs, shortageCatalog(shortages, k.names, k.answers), k, shortages);
    }
    const sureIds = new Set(list.filter((r) => r.match?.confidence === 'high' || r.match?.confidence === 'confirmed').map((r) => r.match!.id));
    const review = list.filter((r) => !(r.match?.confidence === 'high' || r.match?.confidence === 'confirmed') && !r.ignored &&
      r.candidates.some((c) => c.numbersOk && c.formOk !== false && (c.score ?? 1) >= OFFER_MIN)).length;
    return { list, sureIds, review };
  };
  try {
    if (kind === 'text') {
      text = new TextDecoder().decode(bytes).slice(0, 20000);
      rows = text.split(/\r?\n/).slice(0, MAX_LINES).map(lineRow).filter((r): r is Row => !!r);
    } else if (kind === 'sheet') {
      const XLSX = await import('npm:xlsx@0.18.5');
      const wb = XLSX.read(bytes, { type: 'array' });
      const m: unknown[][] = [];
      for (const n of wb.SheetNames) m.push(...XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false, blankrows: false }) as unknown[][]);
      rows = sheetNames(m).slice(0, MAX_LINES).map(lineRow).filter((r): r is Row => !!r);
    } else rows = await readImage();
  } catch (e) { error = (e as Error).message === 'quota' ? 'خلصت حصة Gemini المجانية' : String((e as Error).message || e).slice(0, 200); }
  const scored = await scoreRows(error ? [] : rows), out2 = scored.list, sureIds = scored.sureIds, review = scored.review;
  // whose photo: the phone sends every new photo in the folder, whichever chat it came from, so the companies that
  // announced photos just now decide (WhatsApp's repeats of an old notification do not count). One company: the photo
  // is its own, even when another chat's run sent it. More: it keeps their names (maybe) until the owner picks one.
  // None new: any company with a notification in that time may be the one.
  let maybe: string[] | null = null;
  if (kind !== 'text') {
    const notes = await restAll<{ supplier: string; fresh: boolean | null }>(env, auth, fetchImpl, 'ar_inbox_media?select=supplier,fresh&at=gte.' + since(MEDIA_WINDOW_MS)).catch(() => []);
    const fresh = [...new Set(notes.filter((n) => n.fresh !== false).map((n) => n.supplier))];
    const names = fresh.length ? fresh : [...new Set([company.name, ...notes.map((n) => n.supplier)])];
    if (names.length > 1) maybe = names.sort(); else supplier = names[0];
  }
  const row = { sender: from, supplier, kind, body_text: text, file_path: filePath, status: error ? 'error' : 'new', error, rows: out2, sure: sureIds.size, review, maybe };
  const ins = await fetchImpl(`${base}/rest/v1/ar_inbox`, { method: 'POST', body: JSON.stringify(row), headers: { ...sh, 'Content-Type': 'application/json', Prefer: 'return=representation' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  // 409: another run saved the same photo/text a moment ago (unique indexes): a repeat, said once by that run
  if (ins.status === 409) return out(200, { ok: false, duplicate: true, say: '' }, say);
  if (!ins.ok) return out(502, { error: 'save', message: 'الوارد ماتحفظش' }, say);
  const [saved] = await ins.json() as { id: string; received_at?: string }[];
  log('inbox', t0, { kind, rows: out2.length, sure: sureIds.size, review, error: !!error, moved: supplier !== company.name, maybe: !!maybe });
  // the photo/file arrived: its company's notifications need no «seen» anymore
  if (kind !== 'text') for (const n of maybe || [supplier]) await handled(n, false);
  if (error && /^gemini 5\d\d$/.test(error) && saved?.id && (kind === 'image' || kind === 'pdf')) {
    // Gemini busy: read again in the background; the row is filled in when it works
    const id = saved.id, waits = env.INBOX_RETRY_WAIT_MS ? RETRY_WAITS_MS.map(() => Number(env.INBOX_RETRY_WAIT_MS)) : RETRY_WAITS_MS;
    const retry = (async () => {
      for (const ms of waits) {
        await new Promise((r) => setTimeout(r, ms));
        try {
          const s2 = await scoreRows(await readImage());
          const r = await fetchImpl(`${base}/rest/v1/ar_inbox?id=eq.${encodeURIComponent(id)}&status=eq.error`, {
            method: 'PATCH', body: JSON.stringify({ status: 'new', error: null, rows: s2.list, sure: s2.sureIds.size, review: s2.review }),
            headers: { ...sh, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          log('inbox-retry', t0, { ok: r.ok, rows: s2.list.length });
          return;
        } catch (e) {
          const m = String((e as Error).message || e);
          log('inbox-retry', t0, { ok: false, m: m.slice(0, 60) });
          if (!/^gemini 5\d\d$/.test(m)) return;
        }
      }
    })();
    const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(retry); else await retry;
    return out(200, { ok: false, id, retry: true, say: `${supplier}: الوارد وصل بس جوجل مشغول، البوت هيقراه تاني لوحده` }, say);
  }
  if (error) return out(200, { ok: false, id: saved?.id, say: `${supplier}: الوارد وصل بس ماتقراش، افتحه من البوت` }, say);
  if (maybe) {
    // said once for the photos of that moment: only the first unsure photo says it
    const earlier = saved?.received_at ? await restAll<{ id: string }>(env, auth, fetchImpl, 'ar_inbox?select=id&maybe=not.is.null&received_at=lt.' + encodeURIComponent(saved.received_at) + '&received_at=gte.' + since(SEEN_QUIET_MS)).catch(() => []) : [];
    return out(200, { ok: true, id: saved?.id, maybe, say: earlier.length ? '' : `وصلت صور من أكتر من مورد في نفس الوقت: ${maybe.join(' و')}. اختار كل صورة من مين من البوت` }, say);
  }
  if (kind === 'text' && !sureIds.size && !review && saved?.received_at) {
    const before = await restAll<{ id: string }>(env, auth, fetchImpl, 'ar_inbox?select=id&kind=eq.text&supplier=eq.' + encodeURIComponent(supplier) + '&received_at=lt.' + encodeURIComponent(saved.received_at) + '&received_at=gte.' + since(TEXT_BURST_MS)).catch(() => []);
    if (before.length) return out(200, { ok: true, id: saved.id, supplier, sure: 0, review: 0, quiet: true, say: '' }, say);
  }
  let spoken = inboxSay(supplier, sureIds.size, review);
  // the message is saved; if today's rows cannot be read only the spoken total is skipped
  const rowsToday = await today(supplier);
  if (rowsToday && rowsToday.length > 1) spoken = daySay(supplier, rowsToday);
  return out(200, { ok: true, id: saved?.id, supplier, sure: sureIds.size, review, say: spoken }, say);
}

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch): Promise<Response> {
  if (req.headers.get('x-inbox-key') !== null) return handleInbox(req, env, fetchImpl);
  const headers = cors(req.headers.get('origin'), env, req.headers.get('access-control-request-headers'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply(405, { error: 'method' }, headers);
  if (!headers['Access-Control-Allow-Origin']) return reply(403, { error: 'origin', message: 'الطلب جاي من صفحة مش مسموح لها.' }, headers);
  const allowedEmails = list(env.ALLOWED_EMAILS);
  if (!env.GEMINI_API_KEY || !allowedEmails.length || !env.SUPABASE_URL) return reply(503, { error: 'not-configured', message: 'الإعدادات ناقصة على Supabase.' }, headers);
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/.test(auth)) return reply(401, { error: 'auth', message: 'سجّل الدخول الأول.' }, headers);
  let user: { email?: string } | null = null;
  try {
    const r = await fetchImpl(env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user', { headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return reply(401, { error: 'auth', message: 'الجلسة انتهت؛ سجّل الدخول تاني.' }, headers);
    user = await r.json().catch(() => null);
  } catch { return reply(504, { error: 'auth-timeout', message: 'التأكد من تسجيل الدخول اتأخر؛ جرّب تاني.' }, headers); }
  if (!user?.email || !allowedEmails.includes(user.email.toLowerCase())) return reply(403, { error: 'forbidden', message: 'الحساب ده مش مسموح له.' }, headers);

  let body: { action?: unknown; lines?: unknown; limit?: unknown; image?: unknown; mimeType?: unknown; name?: unknown; english?: unknown; read?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: 'body', message: 'الطلب ناقص.' }, headers); }
  const t0 = Date.now();
  try {
    if (body.action === 'translate') {
      const limit = Math.min(100, Math.max(1, Number(body.limit) || 60));
      const [shortages, names] = await Promise.all([
        restAll<Shortage>(env, auth, fetchImpl, 'ar_shortages?select=id,product_name&is_active=eq.true&order=id'),
        restAll<ArName>(env, auth, fetchImpl, 'ar_names?select=name_key,arabic_name,status&order=name_key'),
      ]);
      const have = new Set(names.map((n) => n.name_key)), seen = new Set<string>();
      const missing = shortages.filter((s) => { const k = nameKey(s.product_name); if (have.has(k) || seen.has(k)) return false; seen.add(k); return true; });
      const todo = missing.slice(0, limit);
      if (!todo.length) return reply(200, { translated: 0, remaining: 0, total: shortages.length, version: VERSION }, headers);
      const text = await gemini(env, fetchImpl, [{ text: TRANSLATE_PROMPT + '\n\n' + JSON.stringify(todo.map((s, i) => ({ i, name: s.product_name }))) }], TRANSLATE_SCHEMA);
      let items: { i: number; ar: string }[] = [];
      try { items = (JSON.parse(text) as { items?: { i: number; ar: string }[] }).items || []; } catch { return reply(502, { error: 'parse', message: 'رد Gemini مش مفهوم؛ جرّب تاني.' }, headers); }
      const rows = items.map((x) => ({ s: todo[x.i], ar: clean(x.ar) })).filter((x) => x.s && x.ar.length >= 2 && x.ar.length <= 250)
        .map((x) => ({ name_key: nameKey(x.s.product_name), english_name: x.s.product_name, arabic_name: x.ar, status: 'suggested' }));
      if (rows.length) {
        const w = await fetchImpl(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/ar_names`, {
          method: 'POST', body: JSON.stringify(rows), signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '', 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
        });
        if (!w.ok) return reply(502, { error: 'save', message: 'ماتحفظتش الترجمة (' + w.status + ').' }, headers);
      }
      log('translate', t0, { asked: todo.length, saved: rows.length });
      return reply(200, { translated: rows.length, remaining: missing.length - rows.length, total: shortages.length, version: VERSION }, headers);
    }

    if (body.action === 'read') {
      const image = typeof body.image === 'string' ? body.image.replace(/\s+/g, '') : '', mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
      if (!MIME_TYPES.includes(mimeType) || !image || !/^[A-Za-z0-9+/=]+$/.test(image)) return reply(400, { error: 'image', message: 'الملف مش واصل صح (صورة JPG أو PNG أو WebP، أو PDF).' }, headers);
      if (Math.floor(image.length * 3 / 4) > MAX_IMAGE_BYTES) return reply(413, { error: 'size', message: 'الملف أكبر من ٨ ميجا.' }, headers);
      const [text, shortages, k] = await Promise.all([
        gemini(env, fetchImpl, [{ text: READ_PROMPT }, { inline_data: { mime_type: mimeType, data: image } }], READ_SCHEMA),
        restAll<Shortage>(env, auth, fetchImpl, 'ar_shortages?select=id,product_name&is_active=eq.true&order=id'),
        knowledge(env, auth, fetchImpl),
      ]);
      const read = parseRead(text);
      if (!read) return reply(502, { error: 'parse', message: 'رد Gemini مش مفهوم؛ جرّب تاني.' }, headers);
      const { rows } = read;
      const cat = shortageCatalog(shortages, k.names, k.answers);
      const out = matchRows(rows, cat, k, shortages);
      log('read', t0, { rows: out.length, shortages: shortages.length, arabic: k.names.length, answers: k.answers.length, sure: out.filter((r) => r.match?.confidence === 'high' || r.match?.confidence === 'confirmed').length });
      const supplier = read.supplier;
      return reply(200, { rows: out, supplier, shortages: shortages.length, arabic: k.names.length, version: VERSION }, headers);
    }

    if (body.action === 'lines') {
      const rows: Row[] = (Array.isArray(body.lines) ? body.lines : []).slice(0, MAX_LINES).map(lineRow).filter((r): r is Row => !!r);
      if (!rows.length) return reply(400, { error: 'lines', message: 'مفيش أسماء أصناف في اللي اتبعت.' }, headers);
      const [shortages, k] = await Promise.all([restAll<Shortage>(env, auth, fetchImpl, 'ar_shortages?select=id,product_name&is_active=eq.true&order=id'), knowledge(env, auth, fetchImpl)]);
      const out = matchRows(rows, shortageCatalog(shortages, k.names, k.answers), k, shortages);
      log('lines', t0, { rows: out.length, sure: out.filter((r) => r.match?.confidence === 'high' || r.match?.confidence === 'confirmed').length });
      return reply(200, { rows: out, shortages: shortages.length, arabic: k.names.length, version: VERSION }, headers);
    }

    if (body.action === 'match') {
      const name = clean(body.name), english = clean(body.english).slice(0, 250), read = clean(body.read);
      if (name.length < 2 || name.length > 250) return reply(400, { error: 'name', message: 'الاسم قصير أو طويل جدًا.' }, headers);
      const [shortages, k] = await Promise.all([restAll<Shortage>(env, auth, fetchImpl, 'ar_shortages?select=id,product_name&is_active=eq.true&order=id'), knowledge(env, auth, fetchImpl)]);
      const row = matchRows([{ name, english, unclear: false }], shortageCatalog(shortages, k.names, k.answers), k, shortages, read ? aliasKey(read) : '')[0];
      return reply(200, { row, version: VERSION }, headers);
    }
    return reply(400, { error: 'action', message: 'أمر مش معروف.' }, headers);
  } catch (e) {
    const m = (e as Error).message || '';
    log('error', t0, { m: m.slice(0, 120) });
    if (m === 'quota') return reply(429, { error: 'quota', message: 'خلصت حصة Gemini المجانية دلوقتي؛ جرّب بعدين.' }, headers);
    if ((e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError') return reply(504, { error: 'timeout', message: 'Gemini اتأخر؛ جرّب تاني.' }, headers);
    return reply(502, { error: 'failed', message: 'حصل خطأ: ' + m.slice(0, 120) }, headers);
  }
}

const deno = (globalThis as unknown as { Deno?: { serve: (h: (req: Request) => Promise<Response>) => void; env: { toObject: () => Env } } }).Deno;
if (deno) deno.serve((req) => handle(req, deno.env.toObject(), fetch));
