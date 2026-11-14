// asker-chat: our own messages page (owner 2026-11-13, «متصفح الرسائل»: store.html#chat, store/chat.js; the bot's
// «خدمة العملاء ← الرسايل», ar/chat.js; tables of migration 202611132330).
//   POST {action:'push', chat_id}      (the owner, or staff with «خدمة العملاء»): a web push to the customer's phone(s) after
//                                      an answer. It carries nothing: the phone shows «ردينا عليك» (store/push-sw.js). An
//                                      address the push service no longer knows (404/410) is dropped.
//   POST {action:'voice', secret, id}  (the customer's page, with its chat's secret): the words of his voice note, written by
//                                      Gemini, saved once in ar_chat_messages.body.
//   POST {action:'notify', secret}     (the customer's page, right after he sends): a push to the phones of the owner and of
//                                      staff with «خدمة العملاء» (ar_chat_staff_push), at most once a minute per chat; a
//                                      warehouse's chat (its list from the link): owner and staff with «الوارد».
//   POST {action:'what', endpoint}     (the bot's worker ar/sw.js, with its own saved push address): what the push was about.
//   POST {action:'cleanup'}            (pg_cron at night): what is past its time is deleted (messages 7 days, inbox photos 30).
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (set by Supabase), GEMINI_API_KEY, GEMINI_MODEL
// (optional), VAPID_PRIVATE_JWK, VAPID_PUBLIC_KEY, VAPID_SUBJECT, ALLOWED_ORIGINS (optional).
// Deploy with --no-verify-jwt (the customer's page has no sign-in; the owner's and staff's calls are checked here).

type Env = Record<string, string | undefined>;
export const OWNER_ID = 'ff6c33dc-9dc5-4e2f-95bb-5d449e231f1c';
const DEFAULT_ORIGINS = 'https://taherasker2560-dot.github.io';
const DEFAULT_SUBJECT = 'https://taherasker2560-dot.github.io/asker-nawaqes/';
const DEFAULT_MODEL = 'gemini-flash-latest';
const TIMEOUT_MS = 15000, GEMINI_TIMEOUT_MS = 45000, MAX_AUDIO = 8 * 1024 * 1024;
// how long things are kept (the nightly clean-up): messages 7 days (owner 2026-11-14 «ب: 7 أيام»), the inbox's photos 30 days
export const CHAT_KEEP_MS = 7 * 864e5, INBOX_KEEP_MS = 30 * 864e5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const VOICE_PROMPT = 'ده فويس من عميل لصيدلية في مصر. اكتب الكلام اللي اتقال بالظبط بالعامية المصرية زي ما اتقال، ' +
  'وأسامي الأدوية زي ما اتنطقت، من غير أي زيادة أو شرح أو علامات تنصيص. لو مفيش كلام مفهوم اكتب: (مش واضح)';

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
const enc = (s: string) => new TextEncoder().encode(s);
export function b64url(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

// the VAPID header of one push (RFC 8292): a JWT signed with the server's P-256 key, and its public key
export async function vapidAuth(endpoint: string, env: Env, now = Date.now()): Promise<string> {
  const header = b64url(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || DEFAULT_SUBJECT })));
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK || '{}');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc(header + '.' + claims)));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch): Promise<Response> {
  const headers = cors(req.headers.get('origin'), env, req.headers.get('access-control-request-headers'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply(405, { error: 'method' }, headers);
  if (!headers['Access-Control-Allow-Origin']) return reply(403, { error: 'origin', message: 'الطلب جاي من صفحة مش مسموح لها.' }, headers);
  const service = env.SUPABASE_SERVICE_ROLE_KEY || '', anon = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!env.SUPABASE_URL || !service || !anon) return reply(503, { error: 'not-configured', message: 'الإعدادات ناقصة على Supabase.' }, headers);
  const base = env.SUPABASE_URL.replace(/\/$/, ''), sh = serviceHeaders(service), json = { 'Content-Type': 'application/json' };
  let body: { action?: unknown; chat_id?: unknown; secret?: unknown; id?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: 'body', message: 'الطلب ناقص.' }, headers); }
  const call = (path: string, init: RequestInit = {}, ms = TIMEOUT_MS) => fetchImpl(base + path, { ...init, signal: AbortSignal.timeout(ms) });
  const rows = async (path: string) => { const r = await call(path, { headers: sh }); const x = r.ok ? await r.json().catch(() => []) : []; return Array.isArray(x) ? x : []; };
  // an empty push (no payload) to each address; an address the push service no longer knows (404/410) leaves its table;
  // anything else that fails is written to the logs («asker-chat push host status body»)
  async function pushAll(endpoints: string[], table: string) {
    let sent = 0, gone = 0, failed = 0;
    const codes: (number | string)[] = [];
    for (const ep of endpoints) {
      const host = (() => { try { return new URL(ep).host; } catch { return '?'; } })();
      try {
        // the fetch sets the length itself (a hand-set Content-Length is not sent)
        const r = await fetchImpl(ep, {
          method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS), body: new Uint8Array(0),
          headers: { Authorization: await vapidAuth(ep, env), TTL: '86400', Urgency: 'high' },
        });
        codes.push(r.status);
        if (r.status === 404 || r.status === 410) {
          gone++;
          await call(`/rest/v1/${table}?endpoint=eq.` + encodeURIComponent(ep), { method: 'DELETE', headers: { ...sh, Prefer: 'return=minimal' } });
        } else if (r.ok) sent++;
        else { failed++; console.log('asker-chat push', host, r.status, (await r.text().catch(() => '')).slice(0, 300)); }
      } catch (e) {
        failed++; codes.push('error');
        console.log('asker-chat push', host, 'error', String((e as Error)?.message || e).slice(0, 300));
      }
    }
    return { sent, gone, failed, codes };
  }

  // ---------- the customer's voice note: its words ----------
  if (body.action === 'voice') {
    const secret = String(body.secret || ''), id = Number(body.id);
    if (!/^[0-9a-f]{64}$/.test(secret) || !Number.isSafeInteger(id) || id <= 0) return reply(400, { error: 'bad', message: 'الطلب ناقص.' }, headers);
    if (!env.GEMINI_API_KEY) return reply(503, { error: 'not-configured', message: 'مفتاح Gemini مش موجود.' }, headers);
    const chat = (await rows('/rest/v1/ar_chats?select=id&secret=eq.' + secret + '&limit=1'))[0] as { id?: string } | undefined;
    if (!chat?.id) return reply(404, { error: 'chat' }, headers);
    const msg = (await rows(`/rest/v1/ar_chat_messages?select=id,kind,media,body,at&id=eq.${id}&chat_id=eq.${chat.id}&limit=1`))[0] as { kind?: string; media?: string; body?: string | null; at?: string } | undefined;
    if (!msg || msg.kind !== 'voice' || !msg.media) return reply(404, { error: 'message' }, headers);
    if (msg.body) return reply(200, { ok: true, text: msg.body }, headers);
    if (Date.now() - new Date(String(msg.at)).getTime() > 3600e3) return reply(410, { error: 'old' }, headers);
    const a = await call('/storage/v1/object/ar-chat/' + msg.media, { headers: sh });
    const audio = a.ok ? new Uint8Array(await a.arrayBuffer()) : null;
    if (!audio || !audio.length || audio.length > MAX_AUDIO) return reply(502, { error: 'audio' }, headers);
    const model = (env.GEMINI_MODEL || DEFAULT_MODEL).trim();
    const g = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { ...json, 'x-goog-api-key': env.GEMINI_API_KEY }, signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      body: JSON.stringify({ contents: [{ parts: [{ text: VOICE_PROMPT }, { inline_data: { mime_type: 'audio/wav', data: b64(audio) } }] }], generationConfig: { temperature: 0 } }),
    }).catch(() => null);
    const out = g && g.ok ? await g.json().catch(() => null) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null : null;
    const text = String(out?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
    if (!text) return reply(502, { error: 'gemini', status: g ? g.status : 0 }, headers);
    // written once: a second call never overwrites
    await call(`/rest/v1/ar_chat_messages?id=eq.${id}&body=is.null`, { method: 'PATCH', headers: { ...sh, ...json, Prefer: 'return=minimal' }, body: JSON.stringify({ body: text }) });
    return reply(200, { ok: true, text }, headers);
  }

  // ---------- the nightly clean-up (owner 2026-11-14 «في حاجات كتيرة المفروض بتتمسح», his choice «ب: 7 أيام») ----------
  // pg_cron calls it at 04:00 Cairo (migration 202611141600). Only what is past its time goes, so a call at any other moment
  // changes nothing early: messages with their photos / voice notes / files after 7 days; a warehouse's files an hour after
  // they went to «الوارد» (their copy stays there); the inbox's photos after 30 days. The invoices (ar-inbox docs/, kept on
  // the laptop in «المشتريات») and the customers' statements are never touched. At most 500 of each a call.
  if (body.action === 'cleanup') {
    const ago = (ms: number) => encodeURIComponent(new Date(Date.now() - ms).toISOString());
    const removeFiles = async (bucket: string, paths: string[]) => {
      if (!paths.length) return true;
      const r = await call(`/storage/v1/object/${bucket}`, { method: 'DELETE', headers: { ...sh, ...json }, body: JSON.stringify({ prefixes: paths }) });
      return r.ok;
    };
    const ids = (xs: { id: unknown }[]) => xs.map((x) => String(x.id)).join(',');
    const out = { messages: 0, files: 0, warehouseFiles: 0, inboxFiles: 0 };
    // 1) messages older than 7 days (customers' and warehouses'), their files first
    const old = await rows(`/rest/v1/ar_chat_messages?select=id,media&at=lt.${ago(CHAT_KEEP_MS)}&order=id&limit=500`) as { id: number; media: string | null }[];
    if (old.length) {
      const files = old.map((m) => m.media).filter((p): p is string => !!p);
      if (await removeFiles('ar-chat', files)) {
        const d = await call(`/rest/v1/ar_chat_messages?id=in.(${ids(old)})`, { method: 'DELETE', headers: { ...sh, Prefer: 'return=minimal' } });
        if (d.ok) { out.messages = old.length; out.files = files.length; }
      }
    }
    // 2) a warehouse's files already in «الوارد» (arabic-shortages also removes them when it reads them)
    const read = await rows(`/rest/v1/ar_chat_messages?select=id,media&inbox_at=lt.${ago(3600e3)}&media=not.is.null&order=id&limit=500`) as { id: number; media: string }[];
    if (read.length && await removeFiles('ar-chat', read.map((m) => m.media))) {
      const p = await call(`/rest/v1/ar_chat_messages?id=in.(${ids(read)})`, { method: 'PATCH', headers: { ...sh, ...json, Prefer: 'return=minimal' }, body: JSON.stringify({ media: null }) });
      if (p.ok) out.warehouseFiles = read.length;
    }
    // 3) the inbox's photos / files after 30 days (the row and what was read from it stay)
    const inbox = (await rows(`/rest/v1/ar_inbox?select=id,file_path&received_at=lt.${ago(INBOX_KEEP_MS)}&file_path=not.is.null&order=received_at&limit=500`) as { id: string; file_path: string }[])
      .filter((x) => !x.file_path.startsWith('docs/'));
    if (inbox.length && await removeFiles('ar-inbox', inbox.map((x) => x.file_path))) {
      const p = await call(`/rest/v1/ar_inbox?id=in.(${inbox.map((x) => x.id).join(',')})`, { method: 'PATCH', headers: { ...sh, ...json, Prefer: 'return=minimal' }, body: JSON.stringify({ file_path: null }) });
      if (p.ok) out.inboxFiles = inbox.length;
    }
    console.log('asker-chat cleanup', JSON.stringify(out));
    return reply(200, { ok: true, ...out }, headers);
  }

  // ---------- what a push was about (owner 2026-11-14 «وصلت البوت … بس مفيش صوت اشعار»): pushes carry nothing, so the
  // bot's worker (ar/sw.js) asks with its own push address, which must be one the pharmacy saved (ar_chat_staff_push).
  // The newest of the last 15 minutes: a warehouse that sent from its link, or a customer waiting for an answer.
  if (body.action === 'what') {
    const ep = String((body as { endpoint?: unknown }).endpoint || '');
    if (!/^https:\/\//.test(ep) || ep.length > 1000) return reply(400, { error: 'bad' }, headers);
    const known = (await rows('/rest/v1/ar_chat_staff_push?select=user_id&endpoint=eq.' + encodeURIComponent(ep) + '&limit=1'))[0];
    if (!known) return reply(404, { error: 'endpoint' }, headers);
    const since = encodeURIComponent(new Date(Date.now() - 15 * 60e3).toISOString());
    const w = (await rows(`/rest/v1/ar_chats?select=supplier,last_at&supplier=not.is.null&last_from=eq.customer&last_at=gte.${since}&order=last_at.desc&limit=1`))[0] as { supplier?: string; last_at?: string } | undefined;
    const c = (await rows(`/rest/v1/ar_chats?select=name,last_at&supplier=is.null&waiting=gt.0&last_at=gte.${since}&order=last_at.desc&limit=1`))[0] as { name?: string; last_at?: string } | undefined;
    if (w && (!c || String(w.last_at) >= String(c.last_at))) return reply(200, { title: 'وارد جديد من مخزن', body: `${w.supplier} بعت من الرابط، شوف «الوارد»`, tab: 'read' }, headers);
    if (c) return reply(200, { title: 'رسالة جديدة من عميل', body: `${c.name} كتبلك في «خدمة العملاء ← الرسايل»`, tab: 'care' }, headers);
    return reply(200, { title: 'صيدلية عسكر', body: 'فيه جديد في البوت', tab: '' }, headers);
  }

  // ---------- a customer just wrote: the pharmacy's phones (owner 2026-11-14, «بعت رسالة … وما جاليش إشعارات») ----------
  // A warehouse's chat (its list from the link) tells the owner and staff with «الوارد» (perm 'read') instead.
  if (body.action === 'notify') {
    const secret = String(body.secret || '');
    if (!/^[0-9a-f]{64}$/.test(secret)) return reply(400, { error: 'bad', message: 'الطلب ناقص.' }, headers);
    if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC_KEY) return reply(503, { error: 'not-configured' }, headers);
    const chat = (await rows('/rest/v1/ar_chats?select=id,notified_at,supplier&secret=eq.' + secret + '&limit=1'))[0] as { id?: string; notified_at?: string | null; supplier?: string | null } | undefined;
    if (!chat?.id) return reply(404, { error: 'chat' }, headers);
    // only for a message the customer really just sent, and at most once a minute for one chat
    const last = (await rows(`/rest/v1/ar_chat_messages?select=at&chat_id=eq.${chat.id}&sender=eq.customer&order=id.desc&limit=1`))[0] as { at?: string } | undefined;
    const now = Date.now();
    if (!last?.at || now - new Date(last.at).getTime() > 120e3) return reply(200, { ok: true, skipped: 'old' }, headers);
    if (chat.notified_at && now - new Date(chat.notified_at).getTime() < 60e3) return reply(200, { ok: true, skipped: 'recent' }, headers);
    await call('/rest/v1/ar_chats?id=eq.' + chat.id, { method: 'PATCH', headers: { ...sh, ...json, Prefer: 'return=minimal' }, body: JSON.stringify({ notified_at: new Date(now).toISOString() }) });
    // the owner's phones, and those of staff who still have «خدمة العملاء»
    const subs = await rows('/rest/v1/ar_chat_staff_push?select=endpoint,user_id') as { endpoint: string; user_id: string }[];
    const others = [...new Set(subs.map((s) => s.user_id).filter((u) => u !== (env.OWNER_ID || OWNER_ID) && UUID.test(u)))];
    const staff = others.length ? await rows('/rest/v1/ar_staff?select=user_id,active,perms&user_id=in.(' + others.join(',') + ')') as { user_id: string; active?: boolean; perms?: string[] }[] : [];
    const perm = chat.supplier ? 'read' : 'care';
    const ok = new Set(staff.filter((s) => s.active && (s.perms || []).includes(perm)).map((s) => s.user_id));
    const targets = subs.filter((s) => s.user_id === (env.OWNER_ID || OWNER_ID) || ok.has(s.user_id));
    const r = await pushAll(targets.map((s) => s.endpoint), 'ar_chat_staff_push');
    return reply(200, { ok: true, ...r }, headers);
  }

  // ---------- the owner's and staff's actions ----------
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/.test(auth)) return reply(401, { error: 'auth', message: 'سجّل الدخول الأول.' }, headers);
  const me = await call('/auth/v1/user', { headers: { Authorization: auth, apikey: anon } });
  const user = me.ok ? await me.json().catch(() => null) as { id?: string } | null : null;
  if (!user?.id) return reply(401, { error: 'auth', message: 'سجّل الدخول الأول.' }, headers);
  if (user.id !== (env.OWNER_ID || OWNER_ID)) {
    const s = (await rows('/rest/v1/ar_staff?select=perms,active&user_id=eq.' + user.id + '&limit=1'))[0] as { perms?: string[]; active?: boolean } | undefined;
    if (!s || !s.active || !(s.perms || []).includes('care')) return reply(403, { error: 'forbidden', message: 'القسم ده مش مفتوحلك.' }, headers);
  }
  if (body.action === 'push') {
    const chatId = String(body.chat_id || '');
    if (!UUID.test(chatId)) return reply(400, { error: 'id', message: 'المحادثة مش معروفة.' }, headers);
    if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC_KEY) return reply(503, { error: 'not-configured', message: 'مفاتيح الإشعارات مش موجودة.' }, headers);
    const subs = await rows('/rest/v1/ar_chat_push?select=endpoint&chat_id=eq.' + chatId) as { endpoint: string }[];
    const r = await pushAll(subs.map((s) => s.endpoint), 'ar_chat_push');
    return reply(200, { ok: true, ...r }, headers);
  }
  return reply(400, { error: 'action', message: 'طلب مش معروف.' }, headers);
}

const deno = (globalThis as unknown as { Deno?: { serve: (h: (req: Request) => Promise<Response>) => void; env: { toObject: () => Env } } }).Deno;
if (deno) deno.serve((req) => handle(req, deno.env.toObject(), fetch));
