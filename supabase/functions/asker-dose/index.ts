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

// ---- the voice of the alarm (owner 2026-11-18: «زرار جرب الصوت من عند العميل ما بيشتغلش»; the phone's own text-to-speech did not speak on his customer's phone) ----
//   POST {action:'voice', name}  -> the WAV of «ميعاد <name> الآن، خدمة مقدمة من صيدلية عسكر» (the sentence is built HERE from the name: this is not a general text-to-speech door),
//   spoken by Gemini's speech model (the one asker-voice uses for «آدم»). Every sentence is made once: the file is kept in the private bucket ar-dose-voice (made on first use) under the hash of
//   the sentence, so the same medicine costs one call for everybody and answers at once afterwards. Limits: a name of at most 40 letters; 150 NEW sentences a day for everyone; 30 an hour for one address.
//   The answer is `application/octet-stream` so supabase-js hands the page a Blob. The phone keeps it in its own cache, ready for the alarm.
export const BUCKET = 'ar-dose-voice', MAX_NAME = 40, VOICE_DAILY = 150, VOICE_HOURLY_PER_IP = 30, DEFAULT_VOICE = 'Charon', TEMPERATURE = 0.4;
// ---- the promo voice (owner 2026-11-18: «صوت ترويجي بأسلوب مذيع حماسي يسوّق للصيدلية، والموسيقى تحته وصوته أعلى منها حاجة بسيطة») ----
//   POST {action:'promo', voice?}  -> the WAV of ONE fixed advert text written HERE (PROMO_TEXT): not a text-to-speech door, nobody sends words. `voice` only picks one of PROMO_VOICES
//   (so at most six files ever exist); the file is made once and kept in the same private bucket. It is a warm narrator of his own: never an imitation of a real person's voice.
export const PROMO_TEXT = [
  'صحتك مش بتستنّى... وصيدلية عسكر مش هتخلّيك تستنّى.',
  'من موبايلك، اطلب دواك في ثواني... ابعت الروشتة بصورة... وكرّر علاجك المعتاد بلمسة واحدة.',
  'وعلشان ماتفوتش جرعة، منبّه الدوا بيفكّرك بميعاد كل دوا باسمه.',
  'تتابع حسابك... وتدفع من مكانك... وأهل بيتك كلّهم في مكان واحد.',
  'صيدلية عسكر... أمان في الدوا، وراحة في البال.',
  'افتح التطبيق دلوقتي... وسيب الباقي علينا.',
].join(' ');
export const PROMO_STYLE = 'Say this in Egyptian Arabic like a warm, deep, confident radio announcer selling something people love: engaging and exciting but never shouting, a clear steady rhythm, a short pause at every "...", and a smile on the last line:';
export const PROMO_VOICES = ['Fenrir', 'Charon', 'Orus', 'Puck', 'Algenib', 'Kore'], PROMO_DEFAULT_VOICE = 'Fenrir', PROMO_TEMPERATURE = 0.7;
export function promoVoice(v: unknown, env: Env): string {
  const pick = typeof v === 'string' ? PROMO_VOICES.find((x) => x.toLowerCase() === v.trim().toLowerCase()) : undefined;
  return pick || PROMO_VOICES.find((x) => x === String(env.PROMO_VOICE || '').trim()) || PROMO_DEFAULT_VOICE;
}
const DEFAULT_MODEL = 'gemini-2.5-flash-preview-tts';
export const FALLBACK_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview'];
const GEMINI_TIMEOUT_MS = 40000;
export function voiceSentence(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const n = name.replace(/[^؀-ۿa-zA-Z0-9\s.+\-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (n.length < 1 || n.length > MAX_NAME || !/[؀-ۿa-zA-Z]/.test(n)) return null;
  return `ميعاد ${n} الآن، خدمة مقدمة من صيدلية عسكر`;
}
// raw 16-bit mono PCM -> a WAV file the phone's player opens
export function wav(pcm: Uint8Array, rate = 24000): Uint8Array {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) h.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE'); w(12, 'fmt ');
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true); h.setUint32(24, rate, true);
  h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(h.buffer), 0); out.set(pcm, 44);
  return out;
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const sha256hex = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc(s)))).map((x) => x.toString(16).padStart(2, '0')).join('');
// best effort, per running copy of the function: one address may start at most VOICE_HOURLY_PER_IP new sentences an hour
const seenIp = new Map<string, number[]>();
function tooManyFromIp(ip: string, now: number): boolean {
  const list = (seenIp.get(ip) || []).filter((t) => now - t < 3600000);
  list.push(now);
  seenIp.set(ip, list);
  if (seenIp.size > 200) for (const k of seenIp.keys()) { if (k !== ip) seenIp.delete(k); }
  return list.length > VOICE_HOURLY_PER_IP;
}
async function voice(body: { name?: unknown; voice?: unknown }, headers: Record<string, string>, req: Request, env: Env, fetchImpl: typeof fetch, now: Date, promo = false): Promise<Response> {
  if (!env.GEMINI_API_KEY) return reply(503, { error: 'not-configured' }, headers);
  const sentence = promo ? PROMO_TEXT : voiceSentence(body.name);
  if (!sentence) return reply(400, { error: 'name' }, headers);
  const base = String(env.SUPABASE_URL).replace(/\/$/, ''), sh = serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY || '');
  const voiceName = promo ? promoVoice(body.voice, env) : (env.DOSE_VOICE || DEFAULT_VOICE).trim(), model = (env.GEMINI_TTS_MODEL || DEFAULT_MODEL).trim();
  const spoken = promo ? `${PROMO_STYLE} ${sentence}` : sentence;   // the file name follows what is said (the style line too): another text or style = another file
  const file = `${(await sha256hex(spoken + '|' + voiceName)).slice(0, 40)}.wav`;
  const out = (bytes: ArrayBuffer | Uint8Array, how: string) => new Response(bytes, { status: 200, headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=86400', 'X-Voice': how } });
  // 1) made before: the same bytes for everybody
  const hit = await fetchImpl(`${base}/storage/v1/object/authenticated/${BUCKET}/${file}`, { headers: sh, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  if (hit && hit.ok) { const bytes = await hit.arrayBuffer(); if (bytes.byteLength > 44) return out(bytes, 'cache'); }
  // 2) a new one: the limits (this is what the Gemini quota pays for)
  const ip = String(req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (tooManyFromIp(ip, now.getTime())) return reply(429, { error: 'rate' }, headers);
  const ls = await fetchImpl(`${base}/storage/v1/object/list/${BUCKET}`, { method: 'POST', headers: { ...sh, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 1000, sortBy: { column: 'created_at', order: 'desc' } }), signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  const listed = ls && ls.ok ? await ls.json().catch(() => []) : [];
  const today = Array.isArray(listed) ? listed.filter((o: { created_at?: string }) => o && o.created_at && now.getTime() - Date.parse(o.created_at) < 86400000).length : 0;
  if (today >= VOICE_DAILY) return reply(429, { error: 'busy' }, headers);
  // 3) Gemini (every speech model has its own daily quota: the next one is tried when one is out of quota or down)
  let g: Response | null = null, why = '';
  for (const m of [model, ...FALLBACK_MODELS.filter((x) => x !== model)]) {
    g = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, signal: AbortSignal.timeout(promo ? GEMINI_TIMEOUT_MS + 25000 : GEMINI_TIMEOUT_MS),
      body: JSON.stringify({ contents: [{ parts: [{ text: spoken }] }], generationConfig: { responseModalities: ['AUDIO'], temperature: promo ? PROMO_TEMPERATURE : TEMPERATURE, speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } } }),
    }).catch(() => null);
    if (g && g.status !== 429 && g.status < 500) break;
    if (g) why = (await g.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
  }
  if (!g) return reply(504, { error: 'gemini-timeout' }, headers);
  if (g.status === 429) return reply(429, { error: 'gemini-busy' }, headers);
  if (g.status >= 500) { console.log('asker-dose voice gemini', g.status, why); return reply(502, { error: 'gemini', status: g.status }, headers); }
  const j = g.ok ? await g.json().catch(() => null) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] } | null : null;
  const part = j?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) { console.log('asker-dose voice gemini no audio', g.status); return reply(502, { error: 'gemini', status: g.status }, headers); }
  const rate = Number(/rate=(\d{4,6})/.exec(String(part.inlineData.mimeType || ''))?.[1] || 24000);
  const pcm = unb64(part.inlineData.data);
  if (pcm.length < 2000) return reply(502, { error: 'empty' }, headers);
  const bytes = wav(pcm, rate);
  // 4) kept for everybody (the bucket is made on first use); a failure to keep it never loses this answer
  const put = () => fetchImpl(`${base}/storage/v1/object/${BUCKET}/${file}`, { method: 'POST', headers: { ...sh, 'Content-Type': 'audio/wav', 'x-upsert': 'true' }, body: bytes, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  let up = await put();
  if (up && !up.ok && (up.status === 404 || up.status === 400)) {
    await fetchImpl(`${base}/storage/v1/bucket`, { method: 'POST', headers: { ...sh, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }), signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
    up = await put();
  }
  if (!up || !up.ok) console.log('asker-dose voice keep', up ? up.status : 'none');
  return out(bytes, 'new');
}

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch, now: Date = new Date()): Promise<Response> {
  const headers = cors(req.headers.get('origin'), env, req.headers.get('access-control-request-headers'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply(405, { error: 'method' }, headers);
  if (!headers['Access-Control-Allow-Origin']) return reply(403, { error: 'origin' }, headers);
  const service = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!env.SUPABASE_URL || !service) return reply(503, { error: 'not-configured' }, headers);
  let body: { action?: unknown; name?: unknown; voice?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: 'body' }, headers); }
  if (body.action === 'voice') return voice(body, headers, req, env, fetchImpl, now);
  if (body.action === 'promo') return voice(body, headers, req, env, fetchImpl, now, true);
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC_KEY) return reply(503, { error: 'not-configured' }, headers);
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
