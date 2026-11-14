// asker-store-img: the owner fixes an item's photo from the store site (owner 2026-11-14: «اوبشن تعديل لما الاقي مشكله
// فيها … اضيف صوره تانية او احذف الصوره الغلط»). The photo is kept on OUR storage (bucket ar-store-img), so the site never
// depends on another website.
//   POST {id, url}   one of the photos the night search found (a normal download, no tricks) -> {img}
//   POST {id, data}  a photo from his phone, already made small by the page (base64 JPEG)     -> {img}
// Only the owner or a staff member with «storeorders» (public.ar_staff_can). Writes public.ar_store_edits.img.
// Secrets used: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (set by Supabase), ALLOWED_ORIGINS (optional).
// Deploy with --no-verify-jwt (the caller is checked here).

type Env = Record<string, string | undefined>;
export const OWNER_ID = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c';
const DEFAULT_ORIGINS = 'https://taherasker2560-dot.github.io';
const TIMEOUT_MS = 15000;
export const MAX_BYTES = 3 * 1024 * 1024;

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
const serviceHeaders = (k: string): Record<string, string> => k.startsWith('sb_') ? { apikey: k } : { Authorization: 'Bearer ' + k, apikey: k };
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

// the kind of picture from its first bytes (never trust the name or the header)
export function kindOf(b: Uint8Array): 'jpg' | 'png' | 'webp' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}
// a public web address only: https, a name (not a bare IP), not this machine or the local network
export function safeUrl(s: unknown): URL | null {
  try {
    const u = new URL(String(s || ''));
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    const h = u.hostname.toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) || /^(localhost|.*\.local|.*\.internal|.*\.supabase\.co)$/.test(h)) return null;
    return u;
  } catch { return null; }
}

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch): Promise<Response> {
  const headers = cors(req.headers.get('origin'), env, req.headers.get('access-control-request-headers'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply(405, { error: 'method' }, headers);
  if (!headers['Access-Control-Allow-Origin']) return reply(403, { error: 'origin', message: 'الطلب جاي من صفحة مش مسموح لها.' }, headers);
  const service = env.SUPABASE_SERVICE_ROLE_KEY || '', anon = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!env.SUPABASE_URL || !service || !anon) return reply(503, { error: 'not-configured', message: 'الإعدادات ناقصة على Supabase.' }, headers);
  const base = env.SUPABASE_URL.replace(/\/$/, ''), sh = serviceHeaders(service);
  const call = (path: string, init: RequestInit = {}) => fetchImpl(base + path, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });

  // who is asking: the owner, or a staff member with «storeorders»
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer \S+$/.test(auth)) return reply(401, { error: 'auth', message: 'ادخل البوت الأول.' }, headers);
  const me = await call('/auth/v1/user', { headers: { Authorization: auth, apikey: anon } });
  const user = me.ok ? await me.json().catch(() => null) as { id?: string } | null : null;
  if (!user?.id) return reply(401, { error: 'auth', message: 'ادخل البوت الأول.' }, headers);
  if (user.id !== (env.OWNER_ID || OWNER_ID)) {
    const c = await call('/rest/v1/rpc/ar_staff_can', { method: 'POST', headers: { Authorization: auth, apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ ps: ['storeorders'] }) });
    if (!c.ok || (await c.json().catch(() => false)) !== true) return reply(403, { error: 'forbidden', message: 'التعديل ده لصاحب الصيدلية بس.' }, headers);
  }

  let body: { id?: unknown; url?: unknown; data?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: 'body', message: 'الطلب ناقص.' }, headers); }
  const id = String(body.id ?? '');
  if (!/^[0-9]{1,12}$/.test(id)) return reply(400, { error: 'id', message: 'رقم الصنف غلط.' }, headers);

  let bytes: Uint8Array;
  if (typeof body.data === 'string') {
    const b64 = body.data.replace(/^data:image\/[a-z]+;base64,/, '');
    if (b64.length > MAX_BYTES * 1.4) return reply(413, { error: 'big', message: 'الصورة كبيرة قوي.' }, headers);
    try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); } catch { return reply(400, { error: 'data', message: 'الصورة مش مقروءة.' }, headers); }
  } else {
    const u = safeUrl(body.url);
    if (!u) return reply(400, { error: 'url', message: 'عنوان الصورة غلط.' }, headers);
    let r: Response;
    try { r = await fetchImpl(u.href, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) }); } catch { r = new Response(null, { status: 599 }); }
    if (!r.ok) return reply(502, { error: 'fetch', message: 'الموقع اللي فيه الصورة مش راضي يديها. جرّب صورة تانية أو ارفعها من الموبايل.' }, headers);
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return reply(413, { error: 'big', message: 'الصورة كبيرة قوي.' }, headers);
    bytes = buf;
  }
  const kind = kindOf(bytes);
  if (!kind || bytes.length < 500) return reply(400, { error: 'kind', message: 'الملف ده مش صورة.' }, headers);

  const path = `e/${id}-${hex(crypto.getRandomValues(new Uint8Array(6)))}.${kind}`;
  const type = kind === 'jpg' ? 'image/jpeg' : 'image/' + kind;
  const up = await call('/storage/v1/object/ar-store-img/' + path, { method: 'POST', headers: { ...sh, 'Content-Type': type, 'Cache-Control': '31536000', 'x-upsert': 'true' }, body: bytes });
  if (!up.ok) return reply(502, { error: 'upload', message: 'الصورة ما اتحفظتش، جرّب تاني.' }, headers);
  const row = await call('/rest/v1/ar_store_edits?on_conflict=item_id', {
    method: 'POST', headers: { ...sh, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ item_id: Number(id), img: path, img_off: false, updated_at: new Date().toISOString(), updated_by: user.id }),
  });
  if (!row.ok) return reply(502, { error: 'save', message: 'الصورة اتحفظت بس الصنف ما اتعدلش، جرّب تاني.' }, headers);
  return reply(200, { img: path }, headers);
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno;
if (deno) deno.serve((req: Request) => handle(req, deno.env.toObject(), fetch));
