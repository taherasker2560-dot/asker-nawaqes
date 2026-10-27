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

function cors(origin: string | null, env: Env): Record<string, string> {
  const allowed = list(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin.toLowerCase())) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function reply(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
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
    const name = typeof (r as Row)?.name === 'string' ? (r as Row).name.replace(/[\r\n|]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
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
  const headers = cors(req.headers.get('origin'), env);
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
  const userRes = await fetchImpl(env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user', {
    headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '' },
  });
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
  let gemini: Response;
  try {
    gemini = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: image.replace(/\s+/g, '') } }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      }),
    });
  } catch {
    return reply(502, { error: 'network', message: 'تعذّر الوصول لـ Gemini. جرّب تاني بعد شوية.' }, headers);
  }
  if (gemini.status === 429) return reply(429, { error: 'quota', message: 'خلصت حصة Gemini المجانية دلوقتي. جرّب بعدين أو استخدم القراءة المحلية.' }, headers);
  if (gemini.status === 404) return reply(502, { error: 'model', message: `الموديل ${model} مش موجود عند Google؛ غيّر GEMINI_MODEL.` }, headers);
  if (gemini.status === 400 || gemini.status === 403) return reply(502, { error: 'key', message: 'Google رفض الطلب؛ راجع مفتاح GEMINI_API_KEY.' }, headers);
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
