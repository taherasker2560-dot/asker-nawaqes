// asker-staff: the pharmacy's staff accounts (owner 2026-11-13: «رابط … للناس المستخدمين اللي معايا … افتح له كذا وكذا»).
// The owner adds a person by name in the bot (⚙️ ← الموظفين); this function makes the person's sign-in account (an e-mail no
// one reads, a password no one knows) and a personal link. Opening the link in the phone's browser signs the person in and
// he stays signed in (the bot can be installed with the same icon). What he may use is decided by the database itself
// (public.ar_staff.perms + the «Staff …» policies, migration 202611130200), never by this function or the page.
//   POST {action:'login', token}                 (no sign-in: the link's secret) -> {access_token, refresh_token, name}
//   POST {action:'create', name, perms}          (owner)                          -> {user_id, link}
//   POST {action:'link', user_id}                (owner: a new link; the old one stops working, the account is on again)
//   POST {action:'stop', user_id}                (owner: the account is stopped at once; the link stops working)
// Secrets used: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (set by Supabase), ALLOWED_ORIGINS (optional).
// Deploy with --no-verify-jwt (the link's sign-in has no session yet; the owner's calls are checked here).

type Env = Record<string, string | undefined>;
export const OWNER_ID = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c';
const DEFAULT_ORIGINS = 'https://taherasker2560-dot.github.io';
const DEFAULT_SITE = 'https://taherasker2560-dot.github.io/asker-nawaqes/asker-nawaqes-arabic.html';
const TIMEOUT_MS = 15000;
// the sections a person can be given (the bot's tabs) and the extras of «البيع المؤقت» and the search on top
export const PERMS = ['short', 'read', 'translate', 'drafts', 'docs', 'suppliers', 'stock', 'count', 'expiry', 'customers', 'storeorders', 'tempsale', 'search', 'return', 'credit'];
export const cleanPerms = (p: unknown): string[] => Array.isArray(p) ? [...new Set(p.filter((x): x is string => typeof x === 'string' && PERMS.includes(x)))] : [];

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
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const random = (bytes: number) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export async function sha256Hex(s: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}
// a new-style service key (sb_secret_…) is not a JWT: it goes in apikey only
const serviceHeaders = (k: string): Record<string, string> => k.startsWith('sb_') ? { apikey: k } : { Authorization: 'Bearer ' + k, apikey: k };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch): Promise<Response> {
  const headers = cors(req.headers.get('origin'), env, req.headers.get('access-control-request-headers'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply(405, { error: 'method' }, headers);
  if (!headers['Access-Control-Allow-Origin']) return reply(403, { error: 'origin', message: 'الطلب جاي من صفحة مش مسموح لها.' }, headers);
  const service = env.SUPABASE_SERVICE_ROLE_KEY || '', anon = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!env.SUPABASE_URL || !service || !anon) return reply(503, { error: 'not-configured', message: 'الإعدادات ناقصة على Supabase.' }, headers);
  const base = env.SUPABASE_URL.replace(/\/$/, ''), sh = serviceHeaders(service), json = { 'Content-Type': 'application/json' };
  const site = env.STAFF_SITE || DEFAULT_SITE;
  let body: { action?: unknown; token?: unknown; name?: unknown; perms?: unknown; user_id?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: 'body', message: 'الطلب ناقص.' }, headers); }
  const call = (path: string, init: RequestInit = {}) => fetchImpl(base + path, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const staffRow = async (filter: string) => {
    const r = await call('/rest/v1/ar_staff?select=user_id,name,email,active&' + filter + '&limit=1', { headers: sh });
    const rows = r.ok ? await r.json().catch(() => []) as { user_id: string; name: string; email: string; active: boolean }[] : [];
    return Array.isArray(rows) ? rows[0] || null : null;
  };
  const patchStaff = (id: string, patch: Record<string, unknown>) =>
    call('/rest/v1/ar_staff?user_id=eq.' + id, { method: 'PATCH', headers: { ...sh, ...json, Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
  const setUser = (id: string, patch: Record<string, unknown>) =>
    call('/auth/v1/admin/users/' + id, { method: 'PUT', headers: { ...sh, ...json }, body: JSON.stringify(patch) });
  const newLink = async () => { const token = random(32); return { token, hash: await sha256Hex(token), link: site + '#staff=' + token }; };

  // ---------- the person opens his link ----------
  if (body.action === 'login') {
    const token = String(body.token || '');
    if (!/^[0-9a-f]{64}$/.test(token)) return reply(400, { error: 'token', message: 'الرابط ناقص. افتحه تاني من رسالة الواتس كاملة.' }, headers);
    const row = await staffRow('link_hash=eq.' + await sha256Hex(token));
    if (!row || !row.active) return reply(401, { error: 'link', message: 'الرابط ده مبقاش شغال. اطلب رابط جديد من صاحب الصيدلية.' }, headers);
    // a fresh password each time (never shown to anyone), then a normal sign-in: the phone keeps the session
    const pw = random(24);
    const u = await setUser(row.user_id, { password: pw, ban_duration: 'none' });
    if (!u.ok) return reply(502, { error: 'auth', message: 'الدخول ما تمش، جرّب تاني.' }, headers);
    const s = await call('/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, ...json }, body: JSON.stringify({ email: row.email, password: pw }) });
    const session = s.ok ? await s.json().catch(() => null) as { access_token?: string; refresh_token?: string } | null : null;
    if (!session?.access_token || !session.refresh_token) return reply(502, { error: 'auth', message: 'الدخول ما تمش، جرّب تاني.' }, headers);
    await patchStaff(row.user_id, { last_seen_at: new Date().toISOString() }).catch(() => null);
    return reply(200, { access_token: session.access_token, refresh_token: session.refresh_token, name: row.name }, headers);
  }

  // ---------- the owner's actions ----------
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/.test(auth)) return reply(401, { error: 'auth', message: 'سجّل الدخول الأول.' }, headers);
  const me = await call('/auth/v1/user', { headers: { Authorization: auth, apikey: anon } });
  const user = me.ok ? await me.json().catch(() => null) as { id?: string } | null : null;
  if (!user?.id || user.id !== (env.OWNER_ID || OWNER_ID)) return reply(403, { error: 'forbidden', message: 'ده لصاحب الصيدلية بس.' }, headers);

  if (body.action === 'create') {
    const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!name) return reply(400, { error: 'name', message: 'اكتب اسم الموظف.' }, headers);
    const email = 'staff-' + random(6) + '@staff.asker-pharmacy.app';
    const c = await call('/auth/v1/admin/users', { method: 'POST', headers: { ...sh, ...json }, body: JSON.stringify({ email, password: random(24), email_confirm: true, user_metadata: { staff: true } }) });
    const made = c.ok ? await c.json().catch(() => null) as { id?: string } | null : null;
    if (!made?.id) return reply(502, { error: 'create', message: 'الحساب ما اتعملش (' + c.status + ').' }, headers);
    const l = await newLink();
    const w = await call('/rest/v1/ar_staff', { method: 'POST', headers: { ...sh, ...json, Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: made.id, name, email, perms: cleanPerms(body.perms), link_hash: l.hash }) });
    if (!w.ok) return reply(502, { error: 'save', message: 'الموظف ما اتحفظش (' + w.status + ').' }, headers);
    return reply(200, { user_id: made.id, link: l.link }, headers);
  }
  const id = String(body.user_id || '');
  if (!UUID.test(id)) return reply(400, { error: 'id', message: 'الموظف مش معروف.' }, headers);
  const row = await staffRow('user_id=eq.' + id);
  if (!row) return reply(404, { error: 'id', message: 'الموظف ده مش موجود.' }, headers);
  if (body.action === 'link') {
    const l = await newLink();
    const w = await patchStaff(id, { link_hash: l.hash, active: true });
    if (!w.ok) return reply(502, { error: 'save', message: 'الرابط ما اتعملش (' + w.status + ').' }, headers);
    await setUser(id, { ban_duration: 'none' }).catch(() => null);
    return reply(200, { link: l.link }, headers);
  }
  if (body.action === 'stop') {
    // the database refuses him at once (active = false); the ban stops his phone from renewing its session
    const w = await patchStaff(id, { active: false, link_hash: null });
    if (!w.ok) return reply(502, { error: 'save', message: 'ما اتوقفش (' + w.status + ').' }, headers);
    await setUser(id, { ban_duration: '876000h' }).catch(() => null);
    return reply(200, { ok: true }, headers);
  }
  return reply(400, { error: 'action', message: 'طلب مش معروف.' }, headers);
}

const deno = (globalThis as unknown as { Deno?: { serve: (h: (req: Request) => Promise<Response>) => void; env: { toObject: () => Env } } }).Deno;
if (deno) deno.serve((req) => handle(req, deno.env.toObject(), fetch));
