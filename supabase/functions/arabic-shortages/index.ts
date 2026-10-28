// ASKER trial bot (asker-nawaqes-arabic.html) — separate from V10 and its function read-supplier-image.
// Idea: translate the shortage list to Arabic once (the owner reviews it), then compare supplier lines
// Arabic-to-Arabic against ~2000 shortages only, instead of 31,000 English catalogue items.
// Actions (owner only, same secrets as V10: GEMINI_API_KEY, ALLOWED_EMAILS, GEMINI_MODEL, ALLOWED_ORIGINS):
//   translate {limit}       -> Gemini suggests Arabic names for shortages that have none yet (ar_shortage_names)
//   read {image, mimeType}  -> Gemini reads the supplier image; each line is matched to the shortages
// Tables are read and written with the caller's own session (owner-only RLS). V10 tables are only read.

import { Catalog, aliasKey, decide, type CatalogItem, type Candidate, type Match } from './match.ts';

export const VERSION = 'ar1';
const DEFAULT_MODEL = 'gemini-flash-latest';
const DEFAULT_ORIGINS = 'https://taherasker2560-dot.github.io';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TIMEOUT_MS = 15000, GEMINI_TIMEOUT_MS = 55000;

type Env = Record<string, string | undefined>;
type Shortage = { id: string; product_name: string };
type ArName = { shortage_item_id: string; arabic_name: string; status: string };
type Decision = { alias_key: string; read_text: string; shortage_item_id: string; decision: 'yes' | 'no' };
type Row = { name: string; english: string; unclear: boolean };

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

// All rows of a table through PostgREST, 1000 at a time, with the caller's session.
async function restAll<T>(env: Env, auth: string, fetchImpl: typeof fetch, path: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 50000; offset += 1000) {
    const r = await fetchImpl(`${env.SUPABASE_URL!.replace(/\/$/, '')}/rest/v1/${path}&limit=1000&offset=${offset}`, {
      headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '' }, signal: AbortSignal.timeout(TIMEOUT_MS),
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
  'This image is a supplier list of pharmacy products, usually a table with a product-name column (الصنف) and a quantity or price column.',
  'Return ONLY the product names, one entry per table row, from top to bottom, copied exactly as written (keep every number and word like اقراص / شراب / امبول).',
  'Do not translate, correct or guess. Skip the header, quantity and price columns. If a name is hard to read, give your best reading and set unclear to true.',
  'These lists use a font where the Arabic letter ك can look like ق, ج or گ: when a letter could be ك, prefer the spelling of the real medicine brand. Write only Arabic letters (no Persian letters).',
  'For each row also give "english": the product in Latin capitals as an Egyptian pharmacy system would list it (brand, strength, pack).',
  'Answer only JSON: {"rows":[{"name":"...","english":"...","unclear":false}]}',
].join('\n');
const READ_SCHEMA = { type: 'OBJECT', properties: { rows: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, english: { type: 'STRING' }, unclear: { type: 'BOOLEAN' } }, required: ['name'] } } }, required: ['rows'] };

// The shortage list as a small "catalogue": the English name, plus the Arabic name (owner-approved or suggested)
// and every supplier text the owner said yes to as extra names.
export function shortageCatalog(shortages: Shortage[], names: ArName[], decisions: Decision[]): Catalog {
  const ar = new Map(names.map((n) => [n.shortage_item_id, n.arabic_name]));
  const yes = new Map<string, string[]>();
  for (const d of decisions) if (d.decision === 'yes') { const l = yes.get(d.shortage_item_id) || []; l.push(d.read_text); yes.set(d.shortage_item_id, l); }
  const items: CatalogItem[] = shortages.map((s) => {
    // English (PharmaFly) name first: strength and pack are read from it; Arabic names only help find the item.
    const alts = [ar.get(s.id), ...(yes.get(s.id) || [])].filter((x): x is string => !!x);
    return alts.length ? [s.id, s.product_name, alts] : [s.id, s.product_name];
  });
  return new Catalog(items);
}

export function matchRows(rows: Row[], cat: Catalog, decisions: Decision[]) {
  const yes = new Map<string, string>(), no = new Map<string, Set<string>>();
  for (const d of decisions) {
    if (d.decision === 'yes') yes.set(d.alias_key, d.shortage_item_id);
    else { const s = no.get(d.alias_key) || new Set<string>(); s.add(d.shortage_item_id); no.set(d.alias_key, s); }
  }
  return rows.map((r) => {
    const key = aliasKey(r.name), rejected = no.get(key) || new Set<string>();
    const candidates: Candidate[] = cat.candidates(r.name, r.english, 3 + rejected.size).filter((c) => !rejected.has(c.id)).slice(0, 3);
    let match: Match | null = decide(candidates);
    const y = yes.get(key);
    if (y) match = { id: y, name: '', score: 1, confidence: 'confirmed' };
    return { ...r, key, match, candidates };
  });
}

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch): Promise<Response> {
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

  let body: { action?: unknown; limit?: unknown; image?: unknown; mimeType?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: 'body', message: 'الطلب ناقص.' }, headers); }
  const t0 = Date.now();
  try {
    if (body.action === 'translate') {
      const limit = Math.min(100, Math.max(1, Number(body.limit) || 60));
      const [shortages, names] = await Promise.all([
        restAll<Shortage>(env, auth, fetchImpl, 'shortage_items?select=id,product_name&is_active=eq.true&order=id'),
        restAll<ArName>(env, auth, fetchImpl, 'ar_shortage_names?select=shortage_item_id,arabic_name,status&order=shortage_item_id'),
      ]);
      const have = new Set(names.map((n) => n.shortage_item_id));
      const todo = shortages.filter((s) => !have.has(s.id)).slice(0, limit);
      if (!todo.length) return reply(200, { translated: 0, remaining: 0, total: shortages.length, version: VERSION }, headers);
      const text = await gemini(env, fetchImpl, [{ text: TRANSLATE_PROMPT + '\n\n' + JSON.stringify(todo.map((s, i) => ({ i, name: s.product_name }))) }], TRANSLATE_SCHEMA);
      let items: { i: number; ar: string }[] = [];
      try { items = (JSON.parse(text) as { items?: { i: number; ar: string }[] }).items || []; } catch { return reply(502, { error: 'parse', message: 'رد Gemini مش مفهوم؛ جرّب تاني.' }, headers); }
      const rows = items.map((x) => ({ s: todo[x.i], ar: clean(x.ar) })).filter((x) => x.s && x.ar.length >= 2 && x.ar.length <= 250)
        .map((x) => ({ shortage_item_id: x.s.id, arabic_name: x.ar, status: 'suggested' }));
      if (rows.length) {
        const w = await fetchImpl(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/ar_shortage_names`, {
          method: 'POST', body: JSON.stringify(rows), signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '', 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
        });
        if (!w.ok) return reply(502, { error: 'save', message: 'ماتحفظتش الترجمة (' + w.status + ').' }, headers);
      }
      log('translate', t0, { asked: todo.length, saved: rows.length });
      return reply(200, { translated: rows.length, remaining: shortages.length - have.size - rows.length, total: shortages.length, version: VERSION }, headers);
    }

    if (body.action === 'read') {
      const image = typeof body.image === 'string' ? body.image.replace(/\s+/g, '') : '', mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
      if (!MIME_TYPES.includes(mimeType) || !image || !/^[A-Za-z0-9+/=]+$/.test(image)) return reply(400, { error: 'image', message: 'الصورة مش واصلة صح (JPG أو PNG أو WebP).' }, headers);
      if (Math.floor(image.length * 3 / 4) > MAX_IMAGE_BYTES) return reply(413, { error: 'size', message: 'الصورة أكبر من ٨ ميجا.' }, headers);
      const [text, shortages, names, decisions] = await Promise.all([
        gemini(env, fetchImpl, [{ text: READ_PROMPT }, { inline_data: { mime_type: mimeType, data: image } }], READ_SCHEMA),
        restAll<Shortage>(env, auth, fetchImpl, 'shortage_items?select=id,product_name&is_active=eq.true&order=id'),
        restAll<ArName>(env, auth, fetchImpl, 'ar_shortage_names?select=shortage_item_id,arabic_name,status&order=shortage_item_id'),
        restAll<Decision>(env, auth, fetchImpl, 'ar_decisions?select=alias_key,read_text,shortage_item_id,decision&order=id'),
      ]);
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { return reply(502, { error: 'parse', message: 'رد Gemini مش مفهوم؛ جرّب تاني.' }, headers); }
      const rows: Row[] = (((parsed as { rows?: unknown[] })?.rows) || []).slice(0, 600)
        .map((r) => ({ name: clean((r as Row)?.name), english: clean((r as Row)?.english).slice(0, 250), unclear: (r as Row)?.unclear === true }))
        .filter((r) => r.name.length >= 2 && r.name.length <= 250);
      const cat = shortageCatalog(shortages, names, decisions);
      const out = matchRows(rows, cat, decisions);
      log('read', t0, { rows: out.length, shortages: shortages.length, arabic: names.length, sure: out.filter((r) => r.match?.confidence === 'high' || r.match?.confidence === 'confirmed').length });
      return reply(200, { rows: out, shortages: shortages.length, arabic: names.length, version: VERSION }, headers);
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
