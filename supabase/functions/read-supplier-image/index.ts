// ASKER V10 — reads the product-name column of a supplier screenshot with Gemini.
// One self-contained file so it can be pasted into the Supabase dashboard editor.
// Secrets (Supabase > Edge Functions > Secrets): GEMINI_API_KEY (required), ALLOWED_EMAILS (required,
// comma separated), GEMINI_MODEL (optional), ALLOWED_ORIGINS (optional).
// The key never leaves this function; the browser only sends the image and the signed-in user's session.

const DEFAULT_MODEL = 'gemini-flash-latest';
const DEFAULT_ORIGINS = 'https://taherasker2560-dot.github.io';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 600;
const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const AUTH_TIMEOUT_MS = 15000;
const REJECTED = new Set<string>(); // model|variant pairs Google refused (kept while the worker is warm)
const GEMINI_TIMEOUT_MS = 55000; // the phone browser gave up after about a minute; Supabase's own limit is 150 s

// Timing log without any secret or image content, to see which step is slow.
function log(stage: string, started: number, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ stage, ms: Date.now() - started, ...extra }));
}

export const PROMPT = [
  'This image is a supplier list of pharmacy products, usually a table with a product-name column (الصنف) and a quantity or price column (الكمية / السعر).',
  'Return ONLY the product names, one entry per table row, from top to bottom.',
  'Copy each name exactly as written: keep Arabic or English, keep every strength, size and number exactly (Arabic-Indic digits such as ٠١٢٣٤٥٦٧٨٩ may be returned as they appear), keep words like اقراص / شراب / امبول.',
  'Do not translate, do not correct spelling, do not add or guess missing words.',
  'Do not include the header row, the quantity column or the price column.',
  'If any character of a name is hard to read, still return your best reading and set unclear to true.',
  'Never invent rows. If the image has no product table, return an empty list.',
].join('\n');

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    rows: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, unclear: { type: 'BOOLEAN' } }, required: ['name'] },
    },
  },
  required: ['rows'],
};

type Env = Record<string, string | undefined>;
type Row = { name: string; unclear: boolean };

function list(value: string | undefined): string[] {
  return String(value || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// Newer supabase-js versions send extra headers, so the preflight echoes the requested header names
// (only well-formed names, and only for the allowed page origin).
function cors(origin: string | null, env: Env, requested?: string | null): Record<string, string> {
  const allowed = list(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS);
  const base = 'authorization, x-client-info, apikey, content-type';
  const extra = String(requested || '').split(',').map((h) => h.trim().toLowerCase()).filter((h) => /^[a-z0-9-]{1,64}$/.test(h)).slice(0, 30);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': [...new Set([...base.split(', '), ...extra])].join(', '),
    'Access-Control-Max-Age': '600',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin.toLowerCase())) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function reply(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// The suppliers' Windows font draws Arabic kaf like Persian gaf, so Gemini sometimes returns Persian letters
// (گ ک ی). V10 matches names exactly, so they are mapped back to the Arabic letters the catalogue uses:
// gaf/keheh -> ك, Persian yeh -> ي inside a word and ى at its end (how the lists write سى / بى).
export function arabicLetters(s: string): string {
  return s.replace(/[گک]/g, 'ك').replace(/ی(?=\p{L})/gu, 'ي').replace(/ی/g, 'ى');
}

// Checks the Gemini answer: only names, sane lengths, no invented structure.
export function parseRows(text: string): Row[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('bad-json'); }
  const rows = (data as { rows?: unknown })?.rows;
  if (!Array.isArray(rows)) throw new Error('bad-json');
  if (rows.length > MAX_ROWS) throw new Error('too-many-rows');
  const out: Row[] = [];
  for (const r of rows) {
    const name = typeof (r as Row)?.name === 'string' ? arabicLetters((r as Row).name).replace(/[\r\n|]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
    if (name.length < 2 || name.length > 250) continue;
    out.push({ name, unclear: (r as Row).unclear === true });
  }
  return out;
}

export function decodeBase64Length(b64: string): number {
  const clean = b64.replace(/\s+/g, '');
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor(clean.length * 3 / 4) - pad;
}

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch): Promise<Response> {
  const headers = cors(req.headers.get('origin'), env, req.headers.get('access-control-request-headers'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply(405, { error: 'method' }, headers);
  if (!headers['Access-Control-Allow-Origin']) return reply(403, { error: 'origin', message: 'الطلب جاي من صفحة مش مسموح لها.' }, headers);

  const allowedEmails = list(env.ALLOWED_EMAILS);
  if (!env.GEMINI_API_KEY || !allowedEmails.length || !env.SUPABASE_URL) {
    return reply(503, { error: 'not-configured', message: 'قراءة Gemini لسه مش متفعلة: لازم إعداد GEMINI_API_KEY وALLOWED_EMAILS في Supabase.' }, headers);
  }

  // Who is asking? Ask Supabase Auth with the caller's own session token.
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/.test(auth)) return reply(401, { error: 'auth', message: 'سجّل الدخول الأول.' }, headers);
  const t0 = Date.now();
  let userRes: Response;
  try {
    userRes = await fetchImpl(env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user', {
      headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '' },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    log('auth-timeout', t0);
    return reply(504, { error: 'auth-timeout', message: 'التأكد من تسجيل الدخول اتأخر؛ جرّب تاني.' }, headers);
  }
  log('auth', t0, { status: userRes.status });
  if (!userRes.ok) return reply(401, { error: 'auth', message: 'الجلسة انتهت؛ سجّل الدخول تاني.' }, headers);
  const user = await userRes.json().catch(() => null) as { email?: string } | null;
  if (!user?.email || !allowedEmails.includes(user.email.toLowerCase())) {
    return reply(403, { error: 'forbidden', message: 'الحساب ده مش مسموح له يستخدم قراءة Gemini.' }, headers);
  }

  let body: { image?: unknown; mimeType?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: 'body', message: 'الطلب ناقص.' }, headers); }
  const image = typeof body.image === 'string' ? body.image : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
  if (!MIME_TYPES.includes(mimeType)) return reply(400, { error: 'type', message: 'الصور المدعومة JPG وPNG وWebP.' }, headers);
  if (!image || !/^[A-Za-z0-9+/=\s]+$/.test(image)) return reply(400, { error: 'image', message: 'الصورة مش واصلة صح.' }, headers);
  if (decodeBase64Length(image) > MAX_IMAGE_BYTES) return reply(413, { error: 'size', message: 'الصورة أكبر من ٨ ميجا.' }, headers);

  const model = (env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  if (!/^[a-z0-9.\-]+$/i.test(model)) return reply(503, { error: 'model', message: 'اسم الموديل في GEMINI_MODEL مش صالح.' }, headers);
  // Copying names off a table needs no "thinking"; it only makes newer Flash models slow. Some models reject
  // optional settings with a bare 400 "invalid argument", so on a 400 we step down: no thinking setting, then
  // no response schema (plain JSON). Each step is logged; the key and image are never logged.
  const variants = [
    { name: 'schema+no-thinking', config: { responseSchema: RESPONSE_SCHEMA, thinkingConfig: { thinkingBudget: 0 } } },
    { name: 'schema', config: { responseSchema: RESPONSE_SCHEMA } },
    { name: 'plain-json', config: {} },
  ];
  const call = (config: Record<string, unknown>) => fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY as string },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: image.replace(/\s+/g, '') } }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', ...config },
    }),
    signal: deadline,
  });
  const deadline = AbortSignal.timeout(GEMINI_TIMEOUT_MS);
  let gemini!: Response;
  const t1 = Date.now();
  try {
    for (const v of variants) {
      if (REJECTED.has(model + '|' + v.name)) continue;
      gemini = await call(v.config);
      if (gemini.status !== 400) break;
      const reason = String(((await gemini.clone().json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message || '').slice(0, 200);
      log('gemini-400', t1, { model, variant: v.name, reason });
      if (/api key|location/i.test(reason)) break; // a settings change will not fix these
      if (v.name !== 'plain-json') REJECTED.add(model + '|' + v.name);
    }
  } catch (e) {
    const timeout = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
    log(timeout ? 'gemini-timeout' : 'gemini-network', t1, { model, imageBytes: decodeBase64Length(image) });
    return timeout
      ? reply(504, { error: 'gemini-timeout', message: `Gemini اتأخر أكتر من ${GEMINI_TIMEOUT_MS / 1000} ثانية. جرّب تاني أو غيّر GEMINI_MODEL لموديل أسرع.` }, headers)
      : reply(502, { error: 'network', message: 'تعذّر الوصول لـ Gemini. جرّب تاني بعد شوية.' }, headers);
  }
  log('gemini', t1, { status: gemini.status, model, imageBytes: decodeBase64Length(image) });
  if (gemini.status === 429) return reply(429, { error: 'quota', message: 'خلصت حصة Gemini المجانية دلوقتي. جرّب بعدين أو استخدم القراءة المحلية.' }, headers);
  if (gemini.status === 404) return reply(502, { error: 'model', message: `الموديل ${model} مش موجود عند Google؛ غيّر GEMINI_MODEL.` }, headers);
  if (gemini.status === 400 || gemini.status === 403) {
    // Google's own reason (never contains the key), e.g. invalid key or unsupported location on the free tier.
    const reason = String(((await gemini.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message || '').slice(0, 200);
    const where = /location/i.test(reason) ? 'Google مش بيقبل الطلب من مكان سيرفر Supabase في الخطة المجانية.'
      : /api key|permission|forbidden/i.test(reason) || gemini.status === 403 ? 'Google رفض الطلب؛ راجع مفتاح GEMINI_API_KEY.'
      : `Google رفض إعدادات الطلب مع الموديل ${model}؛ جرّب موديل تاني في GEMINI_MODEL.`;
    return reply(502, { error: 'key', message: where + (reason ? ' (' + reason + ')' : '') }, headers);
  }
  if (!gemini.ok) return reply(502, { error: 'gemini', message: 'Gemini رجّع خطأ (' + gemini.status + ').' }, headers);

  const data = await gemini.json().catch(() => null) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] } | null;
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';
  let rows: Row[];
  try { rows = parseRows(text); } catch (e) {
    const msg = (e as Error).message === 'too-many-rows' ? 'Gemini رجّع سطور أكتر من المعقول؛ قسّم الصورة.' : 'رد Gemini مش مفهوم؛ جرّب تاني.';
    return reply(502, { error: 'parse', message: msg }, headers);
  }
  return reply(200, { rows, model, truncated: candidate?.finishReason === 'MAX_TOKENS' }, headers);
}

// Runs only inside Supabase (Deno); Node tests import handle() directly.
const deno = (globalThis as unknown as { Deno?: { serve: (h: (req: Request) => Promise<Response>) => void; env: { toObject: () => Env } } }).Deno;
if (deno) deno.serve((req) => handle(req, deno.env.toObject(), fetch));
