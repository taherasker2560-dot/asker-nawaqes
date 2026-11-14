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

import { Catalog, OFFER_MIN, aliasKey, decide, facts, factsSimilarity, type CatalogItem, type Candidate, type Facts, type Match } from './match.ts';

export const VERSION = 'ar12';
const DEFAULT_MODEL = 'gemini-flash-latest';
const DEFAULT_ORIGINS = 'https://taherasker2560-dot.github.io';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_LINES = 600;
const TIMEOUT_MS = 15000, GEMINI_TIMEOUT_MS = 55000;
// «اقرا تاني» from the page is its own request, so a long list (50 rows took up to 56 s) gets more time
const REREAD_TIMEOUT_MS = 120000;

type Env = Record<string, string | undefined>;
type Shortage = { id: string; product_name: string };
// spoken_name: how the owner wants the phone to say the item (optional, set in the page; migration 202611050027)
type ArName = { name_key: string; arabic_name: string; status: string; spoken_name?: string | null };
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

// «كوته 2» / «كوتة ٣» on a supplier's line is the company's quota (how many boxes it will give), not a strength: it is
// dropped with its number, the same way a quantity after | is dropped. Only the whole word counts (كوتيستاد is a product).
const QUOTA = /(?<![\p{L}])كوت[ةه](?![\p{L}])\s*[:：=\-–]?\s*[0-9٠-٩۰-۹]+(?:[.,٫][0-9٠-٩۰-۹]+)?/gu;
export const dropQuota = (s: string) => s.replace(QUOTA, ' ').replace(/\s+/g, ' ').trim();

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

// Google busy (5xx) on the main model: the same request goes at once to these free models (they are busy less often).
// GEMINI_FALLBACK_MODELS (comma separated) replaces the list; empty turns it off. A backup Google does not know (404)
// is skipped.
const FALLBACK_MODELS = 'gemini-flash-lite-latest';
export function geminiModels(env: Env): string[] {
  const main = (env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  const more = (env.GEMINI_FALLBACK_MODELS ?? FALLBACK_MODELS).split(',').map((m) => m.trim()).filter((m) => m && m !== main && /^[a-z0-9.\-]+$/i.test(m));
  return [main, ...new Set(more)];
}

async function gemini(env: Env, fetchImpl: typeof fetch, parts: unknown[], schema: unknown, timeoutMs = GEMINI_TIMEOUT_MS): Promise<string> {
  const models = geminiModels(env);
  const deadline = AbortSignal.timeout(timeoutMs);
  let res: Response | null = null, firstStatus = 0;
  for (const [i, model] of models.entries()) {
    for (const config of [{ responseSchema: schema, thinkingConfig: { thinkingBudget: 0 } }, { responseSchema: schema }, {}]) {
      res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY as string },
        body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json', ...config } }), signal: deadline,
      });
      if (res.status !== 400) break;
    }
    if (i === 0) firstStatus = res?.status || 0;
    // the main model answered (or refused for a reason a backup would share): no backup
    if (!res || !(res.status >= 500 || (i > 0 && (res.status === 404 || res.status === 429)))) break;
  }
  // a backup Google does not know or has no quota left: the main model's «busy» is the answer
  if (res && (res.status === 404 || res.status === 429) && firstStatus >= 500) throw new Error('gemini ' + firstStatus);
  if (res && res.ok && models.length > 1 && firstStatus >= 500) log('gemini-backup', Date.now(), { main: firstStatus });
  if (!res || res.status === 429) throw new Error('quota');
  if (!res.ok) throw new Error('gemini ' + res.status);
  const data = await res.json().catch(() => null) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
}

// The page's «اقرا وقارن»: Google busy (5xx) is tried again twice (after 2 s, then 5 s) before the owner sees an error.
async function geminiRetry(env: Env, fetchImpl: typeof fetch, parts: unknown[], schema: unknown): Promise<string> {
  const waits = env.GEMINI_RETRY_WAIT_MS ? [1, 1].map(() => Number(env.GEMINI_RETRY_WAIT_MS)) : [2000, 5000];
  for (let i = 0; ; i++) {
    try { return await gemini(env, fetchImpl, parts, schema); } catch (e) {
      if (i >= waits.length || !/^gemini 5\d\d$/.test((e as Error).message || '')) throw e;
      await new Promise((r) => setTimeout(r, waits[i]));
    }
  }
}

async function knowledge(env: Env, auth: Auth, fetchImpl: typeof fetch): Promise<Knowledge> {
  const soft = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
  const [names, answers, fixes, ignored] = await Promise.all([
    // spoken_name is read when the database has it; without it (older database) the names load as before
    restAll<ArName>(env, auth, fetchImpl, 'ar_names?select=name_key,arabic_name,status,spoken_name&order=name_key')
      .catch(() => restAll<ArName>(env, auth, fetchImpl, 'ar_names?select=name_key,arabic_name,status&order=name_key')),
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
  // each answer's numbers, form and letters are worked out once, and a line is only compared with the answers that
  // have its same numbers (a 108-line paste against ~900 answers ran out of server time, 7 Nov 2026)
  const byNumbers = (list: Decision[]) => {
    const m = new Map<string, { d: Decision; f: Facts }[]>();
    for (const d of list) { const f = facts(d.read_text); const l = m.get(f.nums); if (l) l.push({ d, f }); else m.set(f.nums, [{ d, f }]); }
    return m;
  };
  const yesTexts = byNumbers(k.answers.filter((d) => d.decision === 'yes' && idOf.has(d.name_key)));
  const noTexts = byNumbers(k.answers.filter((d) => d.decision === 'no'));
  return rows.map((r) => {
    const key = aliasKey(r.name);
    const corrected = readKey ? null : fixOf.get(key) || null;
    const text = corrected || r.name, textKey = aliasKey(text);
    const rejected = new Set([...(no.get(key) || []), ...(no.get(textKey) || []), ...(readKey ? no.get(readKey) || [] : [])]);
    // «مش ده» / «مش واحد منهم» also hold when the same line is read a little differently next time
    // (same numbers, same form, very close text), like confirmed lines do.
    const tf = facts(text);
    for (const { d, f } of noTexts.get(tf.nums) || []) {
      if (!rejected.has(d.name_key) && factsSimilarity(tf, f) >= 0.85) rejected.add(d.name_key);
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
      for (const { d, f } of yesTexts.get(tf.nums) || []) {
        if (!rejected.has(d.name_key) && factsSimilarity(tf, f) >= 0.85) near.add(d.name_key);
      }
      if (near.size === 1 && !notListed) match = { id: idOf.get([...near][0])!, name: '', score: 0.95, confidence: 'high', via: 'alias' };
    }
    // a line Gemini could not read clearly is never a sure match by guess: the owner confirms it (an exact «أيوه» before
    // for this same text stays confirmed)
    if (r.unclear && match?.confidence === 'high') match = { ...match, confidence: 'review' };
    return { ...r, key, corrected, match, candidates, ignored: k.ignored.has(key) };
  });
}

// One typed line (or Excel cell) -> a row. Anything after | or a tab is the quantity/price and is dropped.
// A line with no Arabic letters is an English name, so it is also given as the "english" reading.
export function lineRow(v: unknown): Row | null {
  const name = dropQuota(clean(String(v ?? '').split(/[|\t]/)[0])).replace(/^[\s\-–•*\d٠-٩]{0,4}[.)\-–]\s+/, '').trim();
  if (name.length < 2 || name.length > 250 || !/[\p{L}]/u.test(name)) return null;
  return { name, english: /[\u0600-\u06FF]/.test(name) ? '' : name.slice(0, 250), unclear: false };
}

// Gemini's reading of a supplier image/PDF -> rows (+ the company name if written on the list); null if not JSON.
export function parseRead(text: string): { rows: Row[]; supplier: string } | null {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }
  const rows: Row[] = (((parsed as { rows?: unknown[] })?.rows) || []).slice(0, 600)
    .map((r) => ({ name: dropQuota(clean((r as Row)?.name)), english: clean((r as Row)?.english).slice(0, 250), unclear: (r as Row)?.unclear === true }))
    .filter((r) => r.name.length >= 2 && r.name.length <= 250);
  return { rows, supplier: clean((parsed as { supplier?: unknown })?.supplier).slice(0, 80) };
}

// A supplier photo/PDF -> rows (Gemini). Used by the inbox, its background retry and the page's «اقرا تاني».
async function readFileRows(env: Env, fetchImpl: typeof fetch, bytes: Uint8Array, kind: string, name: string, ct: string, timeoutMs = GEMINI_TIMEOUT_MS): Promise<Row[]> {
  const t = ct.split(';')[0].trim().toLowerCase(), magic = sniffMime(bytes);
  const mime = kind === 'pdf' ? 'application/pdf' : magic || (/\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : t.startsWith('image/') ? t : 'image/jpeg');
  const read = parseRead(await gemini(env, fetchImpl, [{ text: READ_PROMPT }, { inline_data: { mime_type: MIME_TYPES.includes(mime) ? mime : 'image/jpeg', data: b64(bytes) } }], READ_SCHEMA, timeoutMs));
  if (!read) throw new Error('رد Gemini مش مفهوم');
  return read.rows;
}
// Rows matched to the shortages, with the counts kept in ar_inbox (sure, review).
async function scoreInboxRows(env: Env, auth: Auth, fetchImpl: typeof fetch, rs: Row[]) {
  let list: ReturnType<typeof matchRows> = [];
  // each shortage's Arabic name in the bot (said when 1 to 3 items came), and the owner's spoken form when set
  const arOf = new Map<string, string>(), sayOf = new Map<string, string>(), keyOf = new Map<string, string>();
  if (rs.length) {
    const [shortages, k] = await Promise.all([restAll<Shortage>(env, auth, fetchImpl, 'ar_shortages?select=id,product_name&is_active=eq.true&order=id'), knowledge(env, auth, fetchImpl)]);
    list = matchRows(rs, shortageCatalog(shortages, k.names, k.answers), k, shortages);
    const ar = new Map(k.names.map((n) => [n.name_key, n]));
    for (const s of shortages) {
      const n = ar.get(nameKey(s.product_name));
      if (n?.arabic_name) arOf.set(s.id, n.arabic_name);
      if (n?.spoken_name && n.spoken_name.trim()) sayOf.set(s.id, n.spoken_name.trim());
      keyOf.set(s.id, nameKey(s.product_name));
    }
  }
  const sureIds = new Set(list.filter((r) => r.match?.confidence === 'high' || r.match?.confidence === 'confirmed').map((r) => r.match!.id));
  const review = list.filter((r) => !(r.match?.confidence === 'high' || r.match?.confidence === 'confirmed') && !r.ignored &&
    r.candidates.some((c) => c.numbersOk && c.formOk !== false && (c.score ?? 1) >= OFFER_MIN)).length;
  return { list, sureIds, review, arOf, sayOf, keyOf };
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
// a photo not downloaded this long after its notification: WhatsApp's repeats stop making the phone check the folder
// (it checked every minute and a half for over an hour once); the owner shares it by hand
const STOP_LOOKING_MS = 15 * 60 * 1000;
// whose photo, by time (live 2026-11-09/10): a real photo was saved on the phone 10 s before to 13 s after its
// message's time, while other chats' photos that the 3-minute window took as the group's were 64 to 115 s after the
// group's one photo. So a message of one photo («📷 تم إرسال صورة», a photo with its caption) keeps only the photos saved
// this close to it. An album («📷 تم إرسال ١٥ صور») downloads over a minute or two, so it keeps the wide window.
const ONE_PHOTO_BEFORE_MS = 30 * 1000, ONE_PHOTO_AFTER_MS = 40 * 1000;
// another chat's photo message this much nearer to the photo's time than this chat's message decides against it
const NEARER_MS = 8 * 1000;
// the photo messages looked at around a photo (its time is at most ~16 minutes old when the phone sends it)
const PHOTO_TIMES_MS = 20 * 60 * 1000;
// a chat that is neither a company nor the documents group: only its photo messages' times are kept (ar_inbox_media),
// never its name or text, so a photo saved at that time is not taken as a company's list or a document
export const OTHER_CHAT = '~other';
// shown under a document kept although another chat's photo came at about the same second (Claude looks at it)
const UNSURE_DOC = 'مش متأكد إنها من الجروب: جت صورة من شات تاني في نفس الثواني';
// a photo notification's run waits 20 s and checks the folder twice (about a minute): WhatsApp's repeats in that time
// start no run of their own (they piled up in Tasker's queue and new messages were dropped)
const LOOKING_MS = 90 * 1000;
// a text notification is the same message as a saved one when that one was saved after the notification's time minus this
const REPEAT_SKEW_MS = 2 * 60 * 1000;
// Gemini busy (5xx): the photo is saved as not read and the phone is told; it is read again in the background
// (after 15 s, then 30 s) and its row filled in. The phone is not told again (it already has its answer).
const RETRY_WAITS_MS = [15000, 30000];
// Gemini too slow (no answer within GEMINI_TIMEOUT_MS, «Signal timed out.») is retried like busy, but once only:
// the first try already used most of the function's time
export const geminiBusy = (m: string) => /^gemini 5\d\d$/.test(m) || /timed out|timeout/i.test(m);
// some suppliers send a list as one message per item: after the first text, the next ones from the same company within
// this time are spoken only when they bring something from the shortages (then with today's totals)
const TEXT_BURST_MS = 3 * 60 * 1000;
// WhatsApp's notification text for a photo or file (no list in it): the phone then checks its folder
const MEDIA_NOTE = /^[\s\u200e\u200f]*(\u{1F4F7}|\u{1F4C4}|\u{1F5BC}|\u{1F4CE})/u;
// a voice note, music or video: no list, nothing saved in the photo folder; ignored (not kept, nothing said)
const AV_NOTE = /^[\s\u200e\u200f]*(\u{1F3A4}|\u{1F3B5}|\u{1F3A5}|\u{1F4F9})/u;
// a reaction («تفاعل بالرمز 👍 على "…"»): its text quotes the message reacted to (often the owner's own request, with
// shortage names), so it is ignored, never read as a list
const REACTION = /^[\s\u200e\u200f]*(تفاعل(ت)?\s+بالرمز|reacted\s)/iu;
// a call notification («مكالمة صوتية واردة», «مكالمة فيديو فائتة», «Missed voice call»): no list, ignored
const CALL = /^[\s\u200e\u200f]*(مكالم[ةه]\s+(صوتي[ةه]|فيديو|جماعي[ةه])|(incoming|missed|ongoing)\s+(voice|video|group)\s+call)/iu;
// a short chat line («حاضر يادكتور», «يلا») with nothing from the shortages is kept but not spoken
const QUIET_LINES = 2;
// a message bringing 1 to 3 shortage items says their names («رضا عطيه: وصل سيلفربيرن كريم»), not a count
const SAY_NAMES = 3;
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
// A company name as the phone says it: «شركه» → «شركة», «(المندوب)» → «، المندوب». Only the spoken words change;
// the names saved in the bot stay as they are.
export function sayCompany(name: string): string {
  return name.replace(/(^|[\s(])شركه(?=$|[\s(),،])/gu, '$1شركة')
    .replace(/\s*\(\s*([^()]*?)\s*\)\s*/gu, (_m, x: string) => (x ? '، ' + x + ' ' : ' '))
    .replace(/\s+/g, ' ').replace(/\s+،/g, '،').replace(/،\s*$/u, '').trim();
}
// the saved company names in a spoken line, said as sayCompany (longest first, so one name inside another is safe)
export function sayCompanies(text: string, names: string[]): string {
  for (const n of [...new Set(names)].sort((a, b) => b.length - a.length)) { const s = sayCompany(n); if (n && s !== n) text = text.split(n).join(s); }
  return text;
}
// 1 to 3 items: said by name, so the owner knows what came without opening the bot
export function namesSay(company: string, names: string[], review: number): string {
  return `${company}: وصل ${[...new Set(names)].join(' و')}` + (review ? `، و${review} محتاجين تأكيدك` : '');
}
// The name said for an item: the owner's spoken form (said exactly), else its Arabic name in the bot, else the supplier's
// line without notes after «//» or symbols; units are said as words (sayUnits).
export function spokenName(arabic: string | undefined, line: string, spoken?: string): string {
  if (spoken && spoken.trim()) return spoken.trim();
  if (arabic && arabic.trim()) return sayUnits(arabic.trim());
  return sayUnits(line.split('//')[0].replace(/[^\p{L}\p{N}\s.%\/-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60));
}
// Units as the phone should say them: «١٠٠٠مجم» → «١٠٠٠ مللي جرام», «١٢٠مل» → «١٢٠ مللي», «١٥جم» → «١٥ جرام»,
// «٢٪» → «٢ في المية». A number stuck to a word is split first. Only whole words change («مجموعة» stays).
const UNIT = (w: string) => new RegExp(`(?<![\\p{L}])(?:${w})(?![\\p{L}])`, 'giu');
export function sayUnits(s: string): string {
  return s
    .replace(/([0-9٠-٩])(?=\p{L})/gu, '$1 ')
    .replace(/(\p{L})(?=[0-9٠-٩])/gu, '$1 ')
    .replace(UNIT('مجم|ملجم|مج|ملغ|mg'), 'مللي جرام')
    .replace(UNIT('مكجم|ميكروجم|mcg'), 'ميكرو جرام')
    .replace(UNIT('مل|ml'), 'مللي')
    .replace(UNIT('جم|gm'), 'جرام')
    .replace(/\s*[%٪]/g, ' في المية')
    .replace(/\s+/g, ' ')
    .trim();
}
// Start of today in Cairo (the pharmacy's day), as an ISO time.
// Midnight of Cairo's date, found from the clock in Cairo (right also on the day the clock moves for summer time).
export function cairoDayStart(now = new Date()): string {
  const wall = (t: number) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(t)).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  const asUtc = (p: Record<string, number>) => Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  const d = wall(now.getTime()), midnight = Date.UTC(d.year, d.month - 1, d.day);
  let t = midnight - 2 * 3600e3;
  for (let i = 0; i < 3; i++) t += midnight - asUtc(wall(t));
  return new Date(t).toISOString();
}
// A list of 10+ pages comes as many photos: after the first one, the phone says the company's total for today.
type Saved = { rows: { match?: { id: string; confidence: string } | null }[] | null; review: number | null };
// skip: items not counted (ordered today, «اتطلب»)
export function dayTotals(today: Saved[], skip: (id: string) => boolean = () => false): string {
  const ids = new Set<string>();
  for (const r of today) for (const x of r.rows || []) if (x.match && (x.match.confidence === 'high' || x.match.confidence === 'confirmed') && !skip(x.match.id)) ids.add(x.match.id);
  const review = today.reduce((n, r) => n + (r.review || 0), 0);
  return `النهارده لحد دلوقتي ${ids.size} صنف من النواقص` + (review ? ` و${review} محتاجين تأكيدك` : '');
}
export function daySay(company: string, today: Saved[], skip?: (id: string) => boolean): string { return `${company}: ${dayTotals(today, skip)}`; }
// A photo/file that was read before: said with today's totals (when something came today).
export function seenSay(company: string, what: string, today: Saved[] | null): string {
  return `${company}: ${what} قبل كده` + (today && today.length ? `، و${dayTotals(today)}` : '');
}
// seen=1: the phone got a photo notification but found no new photo. Either WhatsApp has not downloaded it yet
// (Android held WhatsApp back to save battery, or the chat's photos wait to be opened) or it is a photo WhatsApp already
// has (it does not save the same photo twice). Several photos («تم إرسال ٤ صور») are almost never all old ones.
export function missingSay(company: string, notes: string[]): string {
  const many = notes.some((n) => /(^|\s)صور(\s|$)|[0-9٠-٩]+\s*(photos|images)/iu.test(n));
  return many
    ? `${company}: بعت صور ولسه ما اتحملتش على الموبايل، افتح الشات بتاعه`
    : `${company}: بعت صورة مالقيتهاش على الموبايل، لو جديدة افتح الشات بتاعه`;
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

// ---------- documents chats (owner 2026-11-08) ----------
// The pharmacy's own WhatsApp group (ar_doc_chats) carries purchase invoices, credit notes, collection receipts and
// water/electricity bills. Its photos/PDFs are kept for the owner (ar_documents, files in ar-inbox/docs/): never read
// by Gemini, never spoken. Claude reads them later on the laptop. Anything else from the group is ignored.
type DocCtx = {
  base: string; sh: Record<string, string>; from: string; fromParam: string; whenMs: number; fileName: string; chat: string; say: boolean;
  out: (status: number, body: Record<string, unknown>, say: boolean) => Response;
};
// keeps one photo/PDF as a document (its name is its content hash, so the phone's re-sends are kept once).
// notCompanys: the phone sends the newest photos of its shared folder, so a group's run also sends photos a company
// sent minutes ago; a photo already kept as a company's message (ar_inbox) is that company's, not a document.
async function saveDocument(fetchImpl: typeof fetch, base: string, sh: Record<string, string>, bytes: Uint8Array, kind: 'image' | 'pdf', chat: string, notCompanys = false, handledNote = ''): Promise<'saved' | 'duplicate' | 'company' | 'error'> {
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  const filePath = `docs/${new Date().toISOString().slice(0, 10)}/${hash}.${kind === 'pdf' ? 'pdf' : 'jpg'}`;
  if (notCompanys) {
    const theirs = await fetchImpl(`${base}/rest/v1/ar_inbox?select=id&file_path=like.*${hash}*&limit=1`, { headers: sh, signal: AbortSignal.timeout(TIMEOUT_MS) })
      .then((r) => r.ok ? r.json() : []).catch(() => []) as { id: string }[];
    if (Array.isArray(theirs) && theirs.length) return 'company';
  }
  const known = await fetchImpl(`${base}/rest/v1/ar_documents?select=id&file_path=like.*${hash}*&limit=1`, { headers: sh, signal: AbortSignal.timeout(TIMEOUT_MS) })
    .then((r) => r.ok ? r.json() : []).catch(() => []) as { id: string }[];
  if (Array.isArray(known) && known.length) return 'duplicate';
  const up = await fetchImpl(`${base}/storage/v1/object/ar-inbox/${filePath}`, { method: 'POST', body: bytes, headers: { ...sh, 'Content-Type': kind === 'pdf' ? 'application/pdf' : 'image/jpeg' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  // stored a moment ago by another run of the same photo: that run saves the row
  if (!up.ok && !/duplicate|exists/i.test(await up.text().catch(() => ''))) return 'error';
  const row: Record<string, string> = { source: 'whatsapp', chat, file_path: filePath, kind };
  if (handledNote) row.handled_note = handledNote;
  const ins = await fetchImpl(`${base}/rest/v1/ar_documents`, { method: 'POST', body: JSON.stringify(row), headers: { ...sh, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (ins.status === 409) return 'duplicate';
  return ins.ok ? 'saved' : 'error';
}
// a photo belongs to the message when it was saved on the phone from a minute before (clocks differ) to 3 minutes after
// (slow download) the message's time. Without both times (an older phone setup) every photo is taken, as before.
export function nearMessage(modParam: string | null, whenMs: number): boolean {
  const mod = Number(modParam);
  if (!modParam || !Number.isFinite(mod) || mod <= 0 || !whenMs) return true;
  const modMs = mod < 1e12 ? mod * 1000 : mod;
  return modMs >= whenMs - 60 * 1000 && modMs <= whenMs + 180 * 1000;
}
// how many photos/files one notification announces: «📷 تم إرسال صورة» or a photo with its caption = 1, «تم إرسال صورتين»
// = 2, «تم إرسال ١٥ صور» = 15; no photo sign (a text, an unknown wording) = 0 (not known)
export function photoCount(text: string): number {
  const m = String(text || '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').match(/(\u{1F4F7}|\u{1F4C4}|\u{1F5BC}|\u{1F4CE})\s*(.*)$/su);
  if (!m) return 0;
  if (/صورتين|مستندين|ملفين/u.test(m[2])) return 2;
  const n = m[2].match(/^(?:تم\s*[إا]رسال\s*)?([0-9٠-٩]+)\s*(?:صور|صورة|مستند|مستندات|ملف|ملفات|photos?|files?|documents?)/iu);
  return n ? Number(n[1].replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))) : 1;
}
// the message time a notification note carries («… ~w<ms> …»), in ms; 0 when it has none
export function noteWhen(note: string | null | undefined): number {
  const m = String(note || '').match(/~w(\d{9,14})/);
  if (!m) return 0;
  const n = Number(m[1]);
  return n < 1e12 ? n * 1000 : n;
}
// whose photo, by its own time (&mod=) and the photo messages around it: 'own' this chat's; 'unsure' another chat's
// photo message is about as near; 'other' another chat's is clearly nearer and this message is not close; 'far'
// outside this message's time; 'unknown' without the times (an older phone setup: taken as before). single: this
// message announced one photo (short window), else an album or not known (wide window, as before).
export function fileOwner(modParam: string | null, whenMs: number, single: boolean, others: number[]): 'own' | 'unsure' | 'other' | 'far' | 'unknown' {
  const mod = Number(modParam);
  if (!modParam || !Number.isFinite(mod) || mod <= 0 || !whenMs) return 'unknown';
  const modMs = mod < 1e12 ? mod * 1000 : mod;
  const close = (w: number) => modMs >= w - ONE_PHOTO_BEFORE_MS && modMs <= w + ONE_PHOTO_AFTER_MS;
  if (single ? !close(whenMs) : !nearMessage(modParam, whenMs)) return 'far';
  const own = Math.abs(modMs - whenMs);
  const near = others.filter((w) => w > 0 && close(w)).map((w) => Math.abs(modMs - w));
  if (!near.length) return 'own';
  const best = Math.min(...near);
  if (best + NEARER_MS <= own) return close(whenMs) ? 'unsure' : 'other';
  return own + NEARER_MS <= best ? 'own' : 'unsure';
}
// of these photo messages, the one nearest to a photo's time (&mod=) within the short window; null when none
export function nearestPhoto<T extends { when: number }>(modParam: string | null, times: T[]): T | null {
  const mod = Number(modParam);
  if (!modParam || !Number.isFinite(mod) || mod <= 0) return null;
  const modMs = mod < 1e12 ? mod * 1000 : mod;
  let best: T | null = null, gap = Infinity;
  for (const t of times) {
    const g = Math.abs(modMs - t.when);
    if (t.when > 0 && modMs >= t.when - ONE_PHOTO_BEFORE_MS && modMs <= t.when + ONE_PHOTO_AFTER_MS && g < gap) { best = t; gap = g; }
  }
  return best;
}
// the photo/file notifications of the last minutes (all chats: companies, the documents group, other chats' times)
async function photoTimes(fetchImpl: typeof fetch, base: string, sh: Record<string, string>): Promise<{ supplier: string; when: number; count: number }[]> {
  const since = encodeURIComponent(new Date(Date.now() - PHOTO_TIMES_MS).toISOString());
  const got = await fetchImpl(`${base}/rest/v1/ar_inbox_media?select=supplier,note&at=gte.${since}&order=at.desc&limit=500`, { headers: sh, signal: AbortSignal.timeout(TIMEOUT_MS) })
    .then((r) => r.ok ? r.json() : []).catch(() => []) as { supplier: string; note: string | null }[];
  return (Array.isArray(got) ? got : []).map((n) => ({ supplier: n.supplier, when: noteWhen(n.note), count: photoCount(n.note || '') })).filter((n) => n.when > 0);
}
// this chat's message at whenMs announced exactly one photo (every note of it says so)
function onePhoto(times: { supplier: string; when: number; count: number }[], chat: string, whenMs: number): boolean {
  const mine = times.filter((t) => t.supplier === chat && t.when === whenMs);
  return mine.length > 0 && mine.every((t) => t.count === 1);
}
async function handleDocs(req: Request, url: URL, fetchImpl: typeof fetch, c: DocCtx): Promise<Response> {
  const { base, sh, out, say } = c;
  const since = (ms: number) => encodeURIComponent(new Date(Date.now() - ms).toISOString());
  // «seen» (the phone found no new photo): nothing is said for documents
  if (url.searchParams.get('seen') === '1') return out(200, { ok: true, seen: true, docs: true, say: '' }, say);
  let ct = req.headers.get('content-type') || '', name = c.fileName, bytes: Uint8Array;
  if (/^multipart\//i.test(ct)) {
    const part = filePart(new Uint8Array(await req.arrayBuffer()), (ct.match(/boundary="?([^";]+)"?/i) || [])[1] || '');
    bytes = part.bytes; ct = part.type; name = name || part.name;
  } else bytes = new Uint8Array(await req.arrayBuffer());
  const kind = sniffKind(bytes) || inboxKind(ct, name);
  if (kind === 'text') {
    const head = new TextDecoder().decode(bytes.subarray(0, 64));
    // only a photo/file notification matters (the phone then sends the file); any other text in the group is ignored
    if (!MEDIA_NOTE.test(head)) return out(200, { ok: false, ignored: true, docs: true, say: '' }, say);
    // remembered like a company's photo notification: the phone's photo folder is shared, so a photo that comes while
    // only this chat announced photos is this chat's document (see the company path), and WhatsApp's repeats stay quiet
    const note = (c.fromParam + (c.whenMs ? ' ~w' + c.whenMs : '') + ' ' + new TextDecoder().decode(bytes.subarray(0, 600))).replace(/\s+/g, ' ').trim().slice(0, 300);
    const last = await fetchImpl(`${base}/rest/v1/ar_inbox_media?select=note,at&supplier=eq.${encodeURIComponent(c.chat)}&at=gte.${since(REPEAT_MS)}&order=at.desc&limit=1`, { headers: sh, signal: AbortSignal.timeout(TIMEOUT_MS) })
      .then((r) => r.ok ? r.json() : []).catch(() => []) as { note: string | null; at?: string }[];
    const stale = !!c.whenMs && c.whenMs < Date.now() - STOP_LOOKING_MS;
    const fresh = !stale && (!Array.isArray(last) || last[0]?.note !== note);
    await fetchImpl(`${base}/rest/v1/ar_inbox_media`, { method: 'POST', body: JSON.stringify({ supplier: c.chat, chat: c.from, note, fresh }), headers: { ...sh, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
    if (stale) return out(200, { ok: false, media: true, docs: true, late: true, say: '' }, say);
    // WhatsApp shows the group's notification again every few minutes (24 times in half an hour, live 2026-11-08). Only
    // the first one makes the phone look at its folder: a repeat would send whatever other chats just sent (a
    // customer's prescription was kept that way).
    if (!fresh) return out(200, { ok: false, media: true, docs: true, repeat: true, say: '' }, say);
    return out(202, { ok: false, media: true, docs: true, fresh, say: '' }, say);
  }
  // Excel/CSV, voice notes and the like: not documents
  if (kind !== 'image' && kind !== 'pdf') return out(200, { ok: false, ignored: true, docs: true, say: '' }, say);
  if (!bytes.length) return out(400, { error: 'empty', message: 'الرسالة فاضية' }, say);
  if (bytes.length > MAX_IMAGE_BYTES) return out(413, { error: 'size', message: 'الملف أكبر من ٨ ميجا' }, say);
  // the phone sends every new photo of its folder, from any chat. With the photo's own time (&mod=, seconds, from
  // Tasker's Test File) only a photo saved around the group message's time (~w) is the group's: close to it for a
  // message of one photo, and not when another chat's photo message is clearly nearer (live 2026-11-10: a customer's
  // prescription and another chat's photo were kept as the group's). About as near: kept, marked for a look.
  const times = await photoTimes(fetchImpl, base, sh);
  const who = fileOwner(url.searchParams.get('mod'), c.whenMs, onePhoto(times, c.chat, c.whenMs), times.filter((t) => t.supplier !== c.chat).map((t) => t.when));
  if (who === 'other' || who === 'far') { log('inbox-doc', Date.now(), { kind, result: 'not-group', owner: who }); return out(200, { ok: false, docs: true, other: true, far: who === 'far', say: '' }, say); }
  const r = await saveDocument(fetchImpl, base, sh, bytes, kind, c.chat, true, who === 'unsure' ? UNSURE_DOC : '');
  log('inbox-doc', Date.now(), { kind, result: r, owner: who });
  if (r === 'error') return out(502, { error: 'save', docs: true, message: 'الصورة ماتحفظتش' }, say);
  if (r === 'company') return out(200, { ok: false, docs: true, company: true, say: '' }, say);
  return out(200, { ok: true, docs: true, duplicate: r === 'duplicate', say: '' }, say);
}
// ---------- the laptop's reader (Claude Code on the owner's own account) ----------
// POST <function>?reader=list[&since=<ISO time>]   -> the photos/PDFs received since then (at most 3 days back, 50)
// POST <function>?reader=file&id=<id>              -> that row's stored copy
// POST <function>?reader=fill&id=<id>[&replace=1]  body {"rows":[{name,english,unclear}],"supplier":"","model":""}
//   -> the rows are matched here like a phone's photo and saved: a row Google could not read is filled in (status new);
//      a read row is replaced only with replace=1 (its status, company and «seen» stay). Nothing is said on the phone.
// Same header as the phone (x-inbox-key).
const READER_DAYS = 3;
async function handleReader(what: string, url: URL, req: Request, env: Env, fetchImpl: typeof fetch, base: string, sh: Record<string, string>): Promise<Response> {
  const t0 = Date.now(), id = url.searchParams.get('id') || '';
  if (what === 'list') {
    const floor = Date.now() - READER_DAYS * 864e5, asked = Date.parse(url.searchParams.get('since') || '');
    const since = new Date(Number.isFinite(asked) ? Math.max(asked, floor) : Date.now() - 2 * 3600e3).toISOString();
    const items = await restAll<Record<string, unknown>>(env, sh, fetchImpl, 'ar_inbox?select=id,received_at,kind,file_path,status,supplier,sure,review&kind=in.(image,pdf)&file_path=not.is.null&received_at=gte.' + encodeURIComponent(since) + '&order=received_at.desc');
    return reply(200, { items: items.slice(0, 50) }, {});
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return reply(400, { error: 'id' }, {});
  const [row] = await restAll<{ id: string; kind: string; file_path: string | null; status: string }>(env, sh, fetchImpl, 'ar_inbox?select=id,kind,file_path,status&id=eq.' + id);
  if (!row || !row.file_path || !(row.kind === 'image' || row.kind === 'pdf')) return reply(404, { error: 'id' }, {});
  if (what === 'file') {
    const f = await fetchImpl(`${base}/storage/v1/object/ar-inbox/${row.file_path}`, { headers: sh, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!f.ok) return reply(502, { error: 'file', status: f.status }, {});
    return new Response(new Uint8Array(await f.arrayBuffer()), { status: 200, headers: { 'Content-Type': row.kind === 'pdf' ? 'application/pdf' : 'image/jpeg' } });
  }
  if (what === 'fill') {
    const replace = url.searchParams.get('replace') === '1';
    if (row.status !== 'error' && !replace) return reply(200, { ok: true, skipped: true }, {});
    const read = parseRead(await req.text().catch(() => ''));
    if (!read) return reply(400, { error: 'rows' }, {});
    const s = await scoreInboxRows(env, sh, fetchImpl, read.rows);
    const patch: Record<string, unknown> = { rows: s.list, sure: s.sureIds.size, review: s.review };
    if (row.status === 'error') Object.assign(patch, { status: 'new', error: null });
    // the row is written only while it is as it was read here (Google's background retry may fill it meanwhile)
    const w = await fetchImpl(`${base}/rest/v1/ar_inbox?id=eq.${id}&status=eq.${encodeURIComponent(row.status)}`, {
      method: 'PATCH', body: JSON.stringify(patch), headers: { ...sh, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!w.ok) return reply(502, { error: 'save', status: w.status }, {});
    log('reader-fill', t0, { kind: row.kind, was: row.status, rows: s.list.length, sure: s.sureIds.size, review: s.review });
    return reply(200, { ok: true, rows: s.list.length, sure: s.sureIds.size, review: s.review }, {});
  }
  return reply(400, { error: 'reader' }, {});
}

export async function handleInbox(req: Request, env: Env, fetchImpl: typeof fetch): Promise<Response> {
  const companies: string[] = [];
  const out = (status: number, body: Record<string, unknown>, say: boolean) => say
    ? new Response(sayCompanies(String(body.say || body.message || ''), companies), { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
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
  const reader = url.searchParams.get('reader');
  if (reader) return handleReader(reader, url, req, env, fetchImpl, base, sh);
  // AutoNotification gives only the chat's name (no «(2 رسائل)»), so the phone adds the notification's time: «… ~w<ms>».
  // It changes with every new message and stays the same when WhatsApp shows the notification again.
  const rawFrom = String(url.searchParams.get('from') || ''), wm = rawFrom.match(/\s*~w(\S*)\s*$/);
  const fromParam = wm ? rawFrom.slice(0, wm.index) : rawFrom;
  const whenNum = wm && /^\d{9,14}$/.test(wm[1]) ? Number(wm[1]) : 0, whenMs = whenNum && whenNum < 1e12 ? whenNum * 1000 : whenNum;
  // another chat announced a photo (the phone sends this for chats that are not saved companies nor the documents
  // group, with only «~w<time>», no name, no text): its time is kept (once) so a photo saved then is not taken as a
  // company's list or a document
  if (url.searchParams.get('other') === '1') {
    if (whenMs) {
      const note = '~w' + whenMs, signal = AbortSignal.timeout(TIMEOUT_MS);
      const seen = await fetchImpl(`${base}/rest/v1/ar_inbox_media?select=note&supplier=eq.${encodeURIComponent(OTHER_CHAT)}&note=eq.${encodeURIComponent(note)}&limit=1`, { headers: sh, signal })
        .then((r) => r.ok ? r.json() : []).catch(() => []) as { note: string }[];
      if (!Array.isArray(seen) || !seen.length) await fetchImpl(`${base}/rest/v1/ar_inbox_media`, { method: 'POST', body: JSON.stringify({ supplier: OTHER_CHAT, chat: OTHER_CHAT, note, fresh: false }), headers: { ...sh, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, signal }).catch(() => null);
    }
    return out(200, { ok: true, other: true, say: '' }, say);
  }
  const from = inboxSender(fromParam), fileName = (url.searchParams.get('name') || '').split(/[\\/]/).pop()!.slice(-120);
  const suppliers = await restAll<{ name: string; phone: string | null }>(env, auth, fetchImpl, 'ar_suppliers?select=name,phone&order=name');
  // the pharmacy's own documents group: checked first (a group title also holds the sender's name); its photos are
  // kept as documents, never read as a list (handleDocs)
  const docChats = await restAll<{ name: string }>(env, auth, fetchImpl, 'ar_doc_chats?select=name').catch(() => [] as { name: string }[]);
  const docNames = new Set(docChats.map((x) => x.name));
  const docChat = docChats.find((x) => sameCompany(x.name, from));
  if (docChat) return handleDocs(req, url, fetchImpl, { base, sh, from, fromParam, whenMs, fileName, chat: docChat.name, say, out });
  const company = suppliers.find((x) => sameCompany(x.name, from));
  companies.push(...suppliers.map((x) => x.name));
  // not one of the saved companies: ignored before anything is read or stored
  if (!company) return out(200, { ok: false, ignored: true, say: '' }, say);
  const since = (ms: number) => encodeURIComponent(new Date(Date.now() - ms).toISOString());
  // today's totals count only this company's sure rows (a photo still waiting for the owner to pick its company is not)
  const today = (name = company.name) => restAll<Saved>(env, auth, fetchImpl, 'ar_inbox?select=rows,review&status=neq.error&maybe=is.null&hidden_at=is.null&supplier=eq.' + encodeURIComponent(name) + '&received_at=gte.' + encodeURIComponent(cairoDayStart())).catch(() => null);
  // marks a company's recent photo notifications as handled (its photo was read, or «seen» was said); freshOnly: only
  // new ones, not WhatsApp's repeats. The count tells whether this run marked any (two runs at once: one wins).
  const handled = async (name: string, freshOnly: boolean): Promise<{ note?: string | null }[]> => {
    const r = await fetchImpl(`${base}/rest/v1/ar_inbox_media?supplier=eq.${encodeURIComponent(name)}${freshOnly ? '&fresh=is.true' : ''}&done=is.false&at=gte.${since(SEEN_NOTE_MS)}`, {
      method: 'PATCH', body: JSON.stringify({ done: true }), headers: { ...sh, 'Content-Type': 'application/json', Prefer: 'return=representation' }, signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => null);
    const got = r?.ok ? await r.json().catch(() => []) : [];
    return Array.isArray(got) ? got : [];
  };
  // seen=1: the phone got a photo notification but found no new photo (not downloaded yet, or a photo WhatsApp already
  // has): nothing is read or stored, only told (missingSay).
  if (url.searchParams.get('seen') === '1') {
    const justRead = await restAll<{ id: string }>(env, auth, fetchImpl, 'ar_inbox?select=id&kind=neq.text&supplier=eq.' + encodeURIComponent(company.name) + '&received_at=gte.' + since(SEEN_QUIET_MS)).catch(() => []);
    const unsure = await restAll<{ maybe: string[] | null }>(env, auth, fetchImpl, 'ar_inbox?select=maybe&maybe=not.is.null&received_at=gte.' + since(SEEN_QUIET_MS)).catch(() => []);
    if (justRead.length || unsure.some((r) => (r.maybe || []).includes(company.name))) return out(200, { ok: true, seen: true, say: '' }, say);
    // told once for a new photo notification: WhatsApp's repeats of an old one stay silent (no loop of the same sentence)
    const notes = await handled(company.name, true);
    if (!notes.length) return out(200, { ok: true, seen: true, say: '' }, say);
    return out(200, { ok: true, seen: true, say: missingSay(company.name, notes.map((n) => n.note || '')) }, say);
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
  const head = kind === 'text' ? new TextDecoder().decode(bytes.subarray(0, 64)) : '';
  if (kind === 'text' && (AV_NOTE.test(head) || REACTION.test(head) || CALL.test(head))) return out(200, { ok: false, ignored: true, say: '' }, say);
  if (kind === 'text' && MEDIA_NOTE.test(head)) {
    // remembered for MEDIA_WINDOW_MS (older notes are cleared now and then): see `maybe` below. The same title and text
    // as this chat's last note is WhatsApp showing it again (REPEAT_MS); the phone still checks the folder.
    const raw = fromParam + (whenMs ? ' ~w' + whenMs : ''), note = (raw + ' ' + new TextDecoder().decode(bytes.subarray(0, 600))).replace(/\s+/g, ' ').trim().slice(0, 300);
    const w = { ...sh, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, signal = AbortSignal.timeout(TIMEOUT_MS);
    const last = await fetchImpl(`${base}/rest/v1/ar_inbox_media?select=note&supplier=eq.${encodeURIComponent(company.name)}&chat=eq.${encodeURIComponent(from)}&at=gte.${since(REPEAT_MS)}&order=at.desc&limit=1`, { headers: sh, signal })
      .then((r) => r.ok ? r.json() : []).catch(() => []) as { note: string | null }[];
    // with the notification's time: a message older than STOP_LOOKING_MS is WhatsApp showing an old one again (never fresh)
    const stale = !!whenMs && whenMs < Date.now() - STOP_LOOKING_MS;
    const fresh = !stale && (!Array.isArray(last) || last[0]?.note !== note);
    await fetchImpl(`${base}/rest/v1/ar_inbox_media`, { method: 'POST', body: JSON.stringify({ supplier: company.name, chat: from, note, fresh }), headers: w, signal }).catch(() => null);
    await fetchImpl(`${base}/rest/v1/ar_inbox_media?at=lt.${since(864e5)}`, { method: 'DELETE', headers: w, signal }).catch(() => null);
    // an old notification shown again: the phone does not check the folder (a customer's new photo there is not this company's)
    if (stale) return out(200, { ok: false, media: true, fresh, late: true, say: '' }, say);
    // WhatsApp showing it again after this company's photo/file already came: the phone need not check the folder
    // (200). Not come yet (not downloaded when it was announced): 202, so a late download is still sent.
    if (!fresh) {
      const first = await fetchImpl(`${base}/rest/v1/ar_inbox_media?select=at&supplier=eq.${encodeURIComponent(company.name)}&chat=eq.${encodeURIComponent(from)}&fresh=is.true&at=gte.${since(REPEAT_MS)}&order=at.desc&limit=1`, { headers: sh, signal })
        .then((r) => r.ok ? r.json() : []).catch(() => []) as { at: string }[];
      const at = (Array.isArray(first) && first[0]?.at) || (whenMs ? new Date(whenMs).toISOString() : '');
      if (at && Date.parse(at) < Date.now() - STOP_LOOKING_MS) return out(200, { ok: false, media: true, fresh, late: true, say: '' }, say);
      // the run of that notification is still looking (it waits 20 s and checks the folder twice): no second run now
      if (at && Date.parse(at) > Date.now() - LOOKING_MS) return out(200, { ok: false, media: true, fresh, looking: true, say: '' }, say);
      const got = at ? await restAll<{ id: string }>(env, auth, fetchImpl, 'ar_inbox?select=id&kind=neq.text&or=' + encodeURIComponent(`(supplier.eq."${company.name}",maybe.cs.{"${company.name}"})`) + '&received_at=gte.' + encodeURIComponent(at)).catch(() => []) : [];
      if (got.length) return out(200, { ok: false, media: true, fresh, came: true, say: '' }, say);
    }
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
  // whose photo by time (the phone's folder is shared by every chat): when this company's message is not close to the
  // photo's time and another chat's photo message is, the photo is that chat's: the documents group's is kept as its
  // document, a customer's (or another company's, which its own run reads) is not read here. Not close to anyone's
  // (a late download): decided as before.
  if ((kind === 'image' || kind === 'pdf') && whenMs) {
    const times = await photoTimes(fetchImpl, base, sh), rivals = times.filter((t) => t.supplier !== company.name), mod = url.searchParams.get('mod');
    const who = fileOwner(mod, whenMs, onePhoto(times, company.name, whenMs), rivals.map((t) => t.when));
    const theirs = who === 'other' || who === 'far' ? nearestPhoto(mod, rivals) : null;
    if (theirs && docNames.has(theirs.supplier)) {
      const r = await saveDocument(fetchImpl, base, sh, bytes, kind, theirs.supplier);
      log('inbox-doc', Date.now(), { kind, result: r, via: 'time' });
      return out(200, { ok: r !== 'error', docs: true, duplicate: r === 'duplicate', say: '' }, say);
    }
    if (theirs) {
      log('inbox-other', Date.now(), { kind, owner: who, theirs: theirs.supplier === OTHER_CHAT ? 'other-chat' : 'company' });
      return out(200, { ok: false, other: true, say: '' }, say);
    }
  }
  // the phone's photo folder is shared with the documents group: a photo that comes while only that group announced
  // photos just now (no fresh notification from any company) is the group's document, not this company's list
  if ((kind === 'image' || kind === 'pdf') && docNames.size) {
    const notes = (await restAll<{ supplier: string; fresh: boolean | null }>(env, auth, fetchImpl, 'ar_inbox_media?select=supplier,fresh&at=gte.' + since(MEDIA_WINDOW_MS)).catch(() => [])).filter((n) => n.supplier !== OTHER_CHAT);
    const freshDoc = notes.find((n) => n.fresh !== false && docNames.has(n.supplier));
    if (freshDoc && !notes.some((n) => n.fresh !== false && !docNames.has(n.supplier))) {
      const r = await saveDocument(fetchImpl, base, sh, bytes, kind, freshDoc.supplier);
      log('inbox-doc', Date.now(), { kind, result: r, via: 'company' });
      return out(200, { ok: r !== 'error', docs: true, duplicate: r === 'duplicate', say: '' }, say);
    }
  }
  // the same notification can fire again (twice at once, or WhatsApp shows unread chats again later, also after midnight).
  // With the notification's time (~w): it is a repeat when the same text from the same company was saved after that
  // time (a little earlier allowed for the phone's clock), so a message sent again later, even with the same words,
  // is new. Without it: the same text is kept once a Cairo day.
  if (kind === 'text') {
    const since = whenMs ? new Date(Math.min(whenMs, Date.now()) - REPEAT_SKEW_MS).toISOString() : cairoDayStart(), body = new TextDecoder().decode(bytes).slice(0, 20000);
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
  const readImage = (): Promise<Row[]> => readFileRows(env, fetchImpl, bytes, kind, name, ct);
  const scoreRows = (rs: Row[]) => scoreInboxRows(env, auth, fetchImpl, rs);
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
    // the documents group's notifications never make a photo a company's (nor add the group to «maybe»)
    const notes = (await restAll<{ supplier: string; fresh: boolean | null }>(env, auth, fetchImpl, 'ar_inbox_media?select=supplier,fresh&at=gte.' + since(MEDIA_WINDOW_MS)).catch(() => []))
      .filter((n) => !docNames.has(n.supplier) && n.supplier !== OTHER_CHAT);
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
  if (error && geminiBusy(error) && saved?.id && (kind === 'image' || kind === 'pdf')) {
    // Gemini busy: read again in the background; the row is filled in when it works
    const all = env.INBOX_RETRY_WAIT_MS ? RETRY_WAITS_MS.map(() => Number(env.INBOX_RETRY_WAIT_MS)) : RETRY_WAITS_MS;
    const id = saved.id, waits = /^gemini 5/.test(error) ? all : all.slice(0, 1);
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
          if (!geminiBusy(m)) return;
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
  // a photo/file with no product lines (a photo from another chat in the phone's folder, a logo, a chat screenshot):
  // kept for the page, but nothing is said for it
  if (kind !== 'text' && !out2.length) return out(200, { ok: true, id: saved?.id, supplier, sure: 0, review: 0, empty: true, say: '' }, say);
  // items the owner ordered today («اتطلب», ar_orders) are not news: not said and not counted again
  const ordered = sureIds.size ? new Set((await restAll<{ name_key: string }>(env, auth, fetchImpl, 'ar_orders?select=name_key&ordered_at=gte.' + encodeURIComponent(cairoDayStart())).catch(() => [])).map((o) => o.name_key)) : new Set<string>();
  const wasOrdered = (id: string) => ordered.has(scored.keyOf.get(id) || '');
  const news = new Set([...sureIds].filter((id) => !wasOrdered(id)));
  // a short chat line is silent even when a word in it looks like a shortage («كام وكام»): kept for the page
  if (kind === 'text' && !news.size && out2.length <= QUIET_LINES) return out(200, { ok: true, id: saved?.id, supplier, sure: sureIds.size, review, quiet: true, say: '' }, say);
  if (kind === 'text' && !news.size && !review && saved?.received_at) {
    const before = await restAll<{ id: string }>(env, auth, fetchImpl, 'ar_inbox?select=id&kind=eq.text&supplier=eq.' + encodeURIComponent(supplier) + '&received_at=lt.' + encodeURIComponent(saved.received_at) + '&received_at=gte.' + since(TEXT_BURST_MS)).catch(() => []);
    if (before.length) return out(200, { ok: true, id: saved.id, supplier, sure: sureIds.size, review: 0, quiet: true, say: '' }, say);
  }
  if (news.size >= 1 && news.size <= SAY_NAMES) {
    const said = [...news].map((id) => { const r = out2.find((x) => x.match?.id === id); return spokenName(scored.arOf.get(id), r ? r.corrected || r.name : '', scored.sayOf.get(id)); });
    return out(200, { ok: true, id: saved?.id, supplier, sure: sureIds.size, review, say: namesSay(supplier, said, review) }, say);
  }
  if (!news.size && sureIds.size) return out(200, { ok: true, id: saved?.id, supplier, sure: sureIds.size, review, say: `${supplier}: اللي وصل من النواقص اتطلب النهارده` + (review ? `، و${review} محتاجين تأكيدك` : '') }, say);
  let spoken = inboxSay(supplier, news.size, review);
  // the message is saved; if today's rows cannot be read only the spoken total is skipped
  const rowsToday = await today(supplier);
  if (rowsToday && rowsToday.length > 1) spoken = daySay(supplier, rowsToday, wasOrdered);
  return out(200, { ok: true, id: saved?.id, supplier, sure: sureIds.size, review, say: spoken }, say);
}

// ---------- a warehouse's link on our messages page (owner 2026-11-14 «رابط للمخزن زيه زي العملاء») ----------
// POST <function>?chat=1 body {secret}: sent by the messages page (store.html#chat) of a warehouse after each message, and by
// the bot after «🏬 ده مندوب مخزن». A warehouse's chat is the one opened with a number saved in «الوارد ← الشركات»
// (migration 202611141400). What it sent in the last CHAT_DAYS days and is not in the inbox yet is read and matched like
// the phone's WhatsApp inbox and kept in ar_inbox under the warehouse's name (via 'link'); the phone's voice says it
// (ar_sync_news block 3c), and the laptop's reader fills a photo Google could not read, as for WhatsApp's.
// No login: the chat's secret is the key, and only a warehouse's chat is read. Each message is taken once (inbox_at).
const CHAT_DAYS = 3, CHAT_BATCH = 4, CHAT_BUDGET_MS = 90 * 1000;
type ChatMsg = { id: number; kind: string; body: string | null; media: string | null };
export async function handleChatInbox(req: Request, env: Env, fetchImpl: typeof fetch, headers: Record<string, string>): Promise<Response> {
  const service = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!service || !env.SUPABASE_URL || !env.GEMINI_API_KEY) return reply(503, { error: 'not-configured' }, headers);
  let body: { secret?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: 'body' }, headers); }
  const secret = String(body?.secret || '');
  if (!/^[0-9a-f]{64}$/.test(secret)) return reply(400, { error: 'chat' }, headers);
  const base = env.SUPABASE_URL.replace(/\/$/, ''), sh = serviceHeaders(service), t0 = Date.now();
  const [chat] = await restAll<{ id: string; supplier: string | null }>(env, sh, fetchImpl, 'ar_chats?select=id,supplier&secret=eq.' + secret);
  if (!chat) return reply(404, { error: 'chat' }, headers);
  if (!chat.supplier) return reply(200, { ok: false, error: 'not-supplier' }, headers);
  const since = new Date(Date.now() - CHAT_DAYS * 864e5).toISOString();
  // a voice note waits for its words (asker-chat writes them a moment after it is sent)
  const todo = (await restAll<ChatMsg>(env, sh, fetchImpl, `ar_chat_messages?select=id,kind,body,media&chat_id=eq.${chat.id}&sender=eq.customer&inbox_at=is.null&at=gte.${encodeURIComponent(since)}&order=id`))
    .filter((m) => m.kind !== 'voice' || !!m.body);
  const done: Record<string, string> = {};
  const patch = (id: number, v: string | null, only: string) => fetchImpl(`${base}/rest/v1/ar_chat_messages?id=eq.${id}${only}`, {
    method: 'PATCH', body: JSON.stringify({ inbox_at: v }), headers: { ...sh, 'Content-Type': 'application/json', Prefer: 'return=representation' }, signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  for (const m of todo) {
    if (Object.keys(done).length >= CHAT_BATCH || Date.now() - t0 > CHAT_BUDGET_MS) break;
    // taken by this call only (the page and the bot may call at the same moment)
    const claim = await patch(m.id, new Date().toISOString(), '&inbox_at=is.null');
    const got = claim?.ok ? await claim.json().catch(() => []) : [];
    if (!Array.isArray(got) || !got.length) continue;
    let r = 'error';
    try { r = await linkItem(env, fetchImpl, base, sh, chat.supplier, m); } catch (e) { log('chat-inbox-error', t0, { m: String((e as Error).message || e).slice(0, 80) }); }
    // not kept (the file could not be fetched, the save failed): given back, so the next call tries it again
    if (r === 'file' || r === 'save' || r === 'error') await patch(m.id, null, '');
    done[m.id] = r;
  }
  log('chat-inbox', t0, { waiting: todo.length, done });
  return reply(200, { ok: true, done, left: todo.length - Object.keys(done).length }, headers);
}
// one message of a warehouse's chat -> one ar_inbox row (the same reading and matching as the phone's WhatsApp inbox)
async function linkItem(env: Env, fetchImpl: typeof fetch, base: string, sh: Record<string, string>, supplier: string, m: ChatMsg): Promise<string> {
  let kind: 'text' | 'image' | 'pdf' | 'sheet' | '' = 'text', bytes = new Uint8Array(0), name = '', ct = '', text: string | null = null;
  if (m.kind === 'text' || m.kind === 'voice') {
    text = String(m.body || '').slice(0, 20000);
    if (!text.trim()) return 'empty';
  } else {
    if (!m.media) return 'empty';
    const f = await fetchImpl(`${base}/storage/v1/object/ar-chat/${m.media}`, { headers: sh, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!f.ok) return 'file';
    bytes = new Uint8Array(await f.arrayBuffer()); ct = f.headers.get('content-type') || '';
    name = m.kind === 'file' && m.body ? m.body : m.media;
    kind = sniffKind(bytes) || inboxKind(ct, m.media);
    if (!kind || kind === 'text') return 'type';
    if (bytes.length > MAX_IMAGE_BYTES) return 'size';
  }
  let filePath: string | null = null;
  if (kind !== 'text') {
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    // the same photo/file already in the inbox (sent twice, or from WhatsApp too): read once. Sent again from the link after
    // a while (the same list again; owner 2026-11-14 «بعت … ما وصلوش حاجة أصلا»): that row comes back as today's, under this
    // warehouse, from the link, and is said again. The same one again within minutes is only a repeat.
    const dup = await restAll<{ id: string; received_at: string; supplier: string | null; status: string }>(env, sh, fetchImpl, 'ar_inbox?select=id,received_at,supplier,status&file_path=like.*' + hash + '*');
    if (dup.length) {
      const d = dup[0];
      if (d.supplier === supplier && Date.parse(d.received_at) > Date.now() - DUP_SILENT_MS) return 'duplicate';
      const back = { received_at: new Date().toISOString(), hidden_at: null, sender: 'رابط المخزن', supplier, maybe: null, via: 'link', chat_msg: m.id, announced_at: null, status: d.status === 'seen' ? 'new' : d.status };
      const w = await fetchImpl(`${base}/rest/v1/ar_inbox?id=eq.${encodeURIComponent(d.id)}`, { method: 'PATCH', body: JSON.stringify(back), headers: { ...sh, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      return w.ok ? 'again' : 'save';
    }
    const ext = kind === 'pdf' ? 'pdf' : kind === 'sheet' ? ((m.media || '').match(SHEET)?.[1] || (bytes[0] === 0xd0 ? 'xls' : 'xlsx')).toLowerCase() : 'jpg';
    filePath = `${new Date().toISOString().slice(0, 10)}/${hash}.${ext}`;
    const type = kind === 'pdf' ? 'application/pdf' : kind === 'image' ? 'image/jpeg' : 'application/octet-stream';
    const up = await fetchImpl(`${base}/storage/v1/object/ar-inbox/${filePath}`, { method: 'POST', body: bytes, headers: { ...sh, 'Content-Type': type }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!up.ok && !/duplicate|exists/i.test(await up.text().catch(() => ''))) filePath = null;
  }
  let rows: Row[] = [], error: string | null = null;
  try {
    if (kind === 'text') rows = text!.split(/\r?\n/).slice(0, MAX_LINES).map(lineRow).filter((r): r is Row => !!r);
    else if (kind === 'sheet') {
      const XLSX = await import('npm:xlsx@0.18.5');
      const wb = XLSX.read(bytes, { type: 'array' });
      const all: unknown[][] = [];
      for (const n of wb.SheetNames) all.push(...XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false, blankrows: false }) as unknown[][]);
      rows = sheetNames(all).slice(0, MAX_LINES).map(lineRow).filter((r): r is Row => !!r);
    } else rows = await readFileRows(env, fetchImpl, bytes, kind, name, ct);
  } catch (e) { error = (e as Error).message === 'quota' ? 'خلصت حصة Gemini المجانية' : String((e as Error).message || e).slice(0, 200); }
  const s = await scoreInboxRows(env, sh, fetchImpl, error ? [] : rows);
  const row = { sender: 'رابط المخزن', supplier, kind, body_text: text, file_path: filePath, status: error ? 'error' : 'new', error, rows: s.list, sure: s.sureIds.size, review: s.review, via: 'link', chat_msg: m.id };
  const ins = await fetchImpl(`${base}/rest/v1/ar_inbox`, { method: 'POST', body: JSON.stringify(row), headers: { ...sh, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (ins.status === 409) return 'duplicate';
  return ins.ok ? (error ? 'unread' : 'ok') : 'save';
}

// which section a page action belongs to, for a staff member (ar_staff.perms)
const STAFF_PERM: Record<string, string> = { read: 'read', lines: 'read', match: 'read', reread: 'read', translate: 'translate' };
async function staffMay(env: Env, fetchImpl: typeof fetch, id: string | undefined, perm: string | undefined): Promise<boolean> {
  const service = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!id || !perm || !service || !/^[0-9a-f-]{36}$/i.test(id)) return false;
  try {
    const r = await fetchImpl(`${env.SUPABASE_URL!.replace(/\/$/, '')}/rest/v1/ar_staff?select=perms&active=is.true&user_id=eq.${id}&limit=1`, { headers: serviceHeaders(service), signal: AbortSignal.timeout(TIMEOUT_MS) });
    const rows = r.ok ? await r.json() as { perms?: string[] }[] : [];
    return Array.isArray(rows) && !!rows[0] && Array.isArray(rows[0].perms) && rows[0].perms.includes(perm);
  } catch { return false; }
}

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch): Promise<Response> {
  if (req.headers.get('x-inbox-key') !== null) return handleInbox(req, env, fetchImpl);
  const headers = cors(req.headers.get('origin'), env, req.headers.get('access-control-request-headers'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply(405, { error: 'method' }, headers);
  if (!headers['Access-Control-Allow-Origin']) return reply(403, { error: 'origin', message: 'الطلب جاي من صفحة مش مسموح لها.' }, headers);
  // a warehouse's messages page (no login: the chat's secret is the key)
  if (new URL(req.url).searchParams.get('chat') === '1') return handleChatInbox(req, env, fetchImpl, headers);
  const allowedEmails = list(env.ALLOWED_EMAILS);
  if (!env.GEMINI_API_KEY || !allowedEmails.length || !env.SUPABASE_URL) return reply(503, { error: 'not-configured', message: 'الإعدادات ناقصة على Supabase.' }, headers);
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/.test(auth)) return reply(401, { error: 'auth', message: 'سجّل الدخول الأول.' }, headers);
  let user: { id?: string; email?: string } | null = null;
  try {
    const r = await fetchImpl(env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user', { headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return reply(401, { error: 'auth', message: 'الجلسة انتهت؛ سجّل الدخول تاني.' }, headers);
    user = await r.json().catch(() => null);
  } catch { return reply(504, { error: 'auth-timeout', message: 'التأكد من تسجيل الدخول اتأخر؛ جرّب تاني.' }, headers); }

  let body: { action?: unknown; lines?: unknown; limit?: unknown; image?: unknown; mimeType?: unknown; name?: unknown; english?: unknown; read?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: 'body', message: 'الطلب ناقص.' }, headers); }
  // the owner, or a staff member the owner opened that section for (owner 2026-11-13, migration 202611130200): «الوارد»
  // reads and matches, «الترجمة» translates. The tables are then read with the person's own session (the staff policies).
  const owner = !!user?.email && allowedEmails.includes(user.email.toLowerCase());
  if (!owner && !(await staffMay(env, fetchImpl, user?.id, STAFF_PERM[String(body.action)]))) return reply(403, { error: 'forbidden', message: 'الحساب ده مش مسموح له.' }, headers);
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
        geminiRetry(env, fetchImpl, [{ text: READ_PROMPT }, { inline_data: { mime_type: mimeType, data: image } }], READ_SCHEMA),
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

    if (body.action === 'reread') {
      // «اقرا تاني»: an incoming photo/PDF that was not read is read again from its stored copy, in this request
      // (not in the background, which the server can stop), and its row filled in only if it is still not read.
      const id = String((body as { id?: unknown }).id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return reply(400, { error: 'id', message: 'الوارد مش معروف.' }, headers);
      const base = env.SUPABASE_URL.replace(/\/$/, ''), uh = { Authorization: auth, apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '' };
      const [row] = await restAll<{ id: string; kind: string; file_path: string | null; status: string }>(env, auth, fetchImpl, 'ar_inbox?select=id,kind,file_path,status&id=eq.' + id);
      if (!row) return reply(404, { error: 'id', message: 'الوارد ده مش موجود.' }, headers);
      if (row.status !== 'error') return reply(200, { ok: true, already: true, version: VERSION }, headers);
      if (!row.file_path || !(row.kind === 'image' || row.kind === 'pdf')) return reply(400, { error: 'file', message: 'مفيش نسخة محفوظة من الصورة دي؛ شاركها يدوي من الواتس.' }, headers);
      const f = await fetchImpl(`${base}/storage/v1/object/authenticated/ar-inbox/${row.file_path}`, { headers: uh, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!f.ok) return reply(502, { error: 'file', message: 'الصورة المحفوظة ماتفتحتش (' + f.status + ').' }, headers);
      const bytes = new Uint8Array(await f.arrayBuffer());
      const s2 = await scoreInboxRows(env, auth, fetchImpl, await readFileRows(env, fetchImpl, bytes, row.kind, row.file_path, '', REREAD_TIMEOUT_MS));
      const w = await fetchImpl(`${base}/rest/v1/ar_inbox?id=eq.${id}&status=eq.error`, {
        method: 'PATCH', body: JSON.stringify({ status: 'new', error: null, rows: s2.list, sure: s2.sureIds.size, review: s2.review }),
        headers: { ...uh, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!w.ok) return reply(502, { error: 'save', message: 'اتقرت بس ماتحفظتش (' + w.status + ').' }, headers);
      log('reread', t0, { rows: s2.list.length, sure: s2.sureIds.size, review: s2.review });
      return reply(200, { ok: true, rows: s2.list.length, sure: s2.sureIds.size, review: s2.review, version: VERSION }, headers);
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
