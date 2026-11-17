// asker-dose: the minute timer's push for «⏰ منبه الدوا» (owner 2026-11-17, stage 2: a notification at each dose time even when the browser is closed; migration 202611172300).
//   POST {action:'tick'}  (pg_cron, every minute): the phones that have a dose at this minute (Cairo time) get an EMPTY web push. It carries nothing: the phone's own worker
//                         (store/dose/sw.js) shows «ميعاد دواك» and a tap opens the page, which rings and says the medicine's name. The server knows only clock times and push
//                         addresses (table ar_dose_push): no medicine name, no customer. An address the push service no longer knows (404/410) is dropped.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (set by Supabase), VAPID_PRIVATE_JWK, VAPID_PUBLIC_KEY, VAPID_SUBJECT (the same as asker-chat's), ALLOWED_ORIGINS (optional).
// Deploy with --no-verify-jwt (pg_cron has no sign-in; calling it early only sends the nudges of this very minute once: ar_dose_due marks them).

type Env = Record<string, string | undefined>;
const DEFAULT_ORIGINS = 'https://taherasker2560-dot.github.io';
const DEFAULT_SUBJECT = 'https://taherasker2560-dot.github.io/asker-nawaqes/';
const TIMEOUT_MS = 15000, BATCH = 25, TTL = '600';   // a dose nudge older than 10 minutes is no use: the push service drops it

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
// the VAPID header of one push (RFC 8292): a JWT signed with the server's P-256 key, and its public key (the same as asker-chat's)
export async function vapidAuth(endpoint: string, env: Env, now = Date.now()): Promise<string> {
  const header = b64url(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || DEFAULT_SUBJECT })));
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK || '{}');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc(header + '.' + claims)));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}
// the minute in Cairo (the pharmacy's clock: summer time included) and its day, for «who is due now» and the once-a-minute mark
export function cairoMinute(now: Date): { hhmm: string; day: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return { hhmm: `${p.hour}:${p.minute}`, day: `${p.year}-${p.month}-${p.day}` };
}

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch, now: Date = new Date()): Promise<Response> {
  const headers = cors(req.headers.get('origin'), env, req.headers.get('access-control-request-headers'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply(405, { error: 'method' }, headers);
  if (!headers['Access-Control-Allow-Origin']) return reply(403, { error: 'origin' }, headers);
  const service = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!env.SUPABASE_URL || !service || !env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC_KEY) return reply(503, { error: 'not-configured' }, headers);
  let body: { action?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: 'body' }, headers); }
  if (body.action !== 'tick') return reply(400, { error: 'action' }, headers);
  const base = env.SUPABASE_URL.replace(/\/$/, ''), sh = serviceHeaders(service);
  const call = (path: string, init: RequestInit = {}) => fetchImpl(base + path, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const { hhmm, day } = cairoMinute(now);
  const r = await call('/rest/v1/rpc/ar_dose_due', { method: 'POST', headers: { ...sh, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_hhmm: hhmm, p_key: `${day} ${hhmm}` }) });
  if (!r.ok) { console.log('asker-dose due', r.status, (await r.text().catch(() => '')).slice(0, 300)); return reply(502, { error: 'due', minute: hhmm }, headers); }
  const x = await r.json().catch(() => []);
  const endpoints: string[] = Array.isArray(x) ? x.filter((e) => typeof e === 'string') : [];
  let sent = 0, gone = 0, failed = 0;
  async function one(ep: string) {
    const host = (() => { try { return new URL(ep).host; } catch { return '?'; } })();
    try {
      // the fetch sets the length itself (a hand-set Content-Length is not sent)
      const p = await fetchImpl(ep, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS), body: new Uint8Array(0), headers: { Authorization: await vapidAuth(ep, env), TTL, Urgency: 'high' } });
      if (p.status === 404 || p.status === 410) {
        gone++;
        await call('/rest/v1/ar_dose_push?endpoint=eq.' + encodeURIComponent(ep), { method: 'DELETE', headers: { ...sh, Prefer: 'return=minimal' } });
      } else if (p.ok) sent++;
      else { failed++; console.log('asker-dose push', host, p.status, (await p.text().catch(() => '')).slice(0, 300)); }
    } catch (e) {
      failed++; console.log('asker-dose push', host, 'error', String((e as Error)?.message || e).slice(0, 300));
    }
  }
  for (let i = 0; i < endpoints.length; i += BATCH) await Promise.all(endpoints.slice(i, i + BATCH).map(one));
  return reply(200, { ok: true, minute: hhmm, due: endpoints.length, sent, gone, failed }, headers);
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno;
if (deno) deno.serve((req: Request) => handle(req, deno.env.toObject(), fetch));
