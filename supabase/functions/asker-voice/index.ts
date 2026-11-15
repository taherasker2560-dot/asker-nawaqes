// asker-voice: a natural Egyptian-Arabic voice for «آدم» and the bot (owner 2026-11-15: «عايز صوت يكون طبيعي زي ما انا بكلمك،
// سواء اللي بينطق من البوت او سواء ادم»). The phone's own voice is a small offline engine; this one is Gemini's speech model.
//   POST {text, voice?, style?, model?}   header x-adam-key: <Adam's 64-hex device key (phone or laptop)>
//        -> audio/wav (24 kHz, mono, 16 bit): the words spoken. `voice` is one of Gemini's voice names (default Charon, a man),
//           `style` the way of speaking (default: relaxed everyday Egyptian), `model` a speech model name (default below).
//   POST {action:'models'}                same key -> the speech models this Gemini key can use (to choose one).
// Nothing is stored: the text goes to Gemini, the audio comes back. Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (set by
// Supabase), GEMINI_API_KEY, GEMINI_TTS_MODEL (optional).
// Deploy with --no-verify-jwt (the phone has no sign-in): the device key is checked here, with ar_adam_role (service role only),
// so nobody without Adam's key can use the owner's Gemini quota.

type Env = Record<string, string | undefined>;
const DEFAULT_MODEL = 'gemini-2.5-flash-preview-tts';
const DEFAULT_VOICE = 'Charon';
export const DEFAULT_STYLE = 'Say this in natural, relaxed, everyday Egyptian Arabic, like a friendly man talking to a colleague: calm, brisk, no drama. ';
export const MAX_TEXT = 500;
const TIMEOUT_MS = 12000, GEMINI_TIMEOUT_MS = 40000, PER_MINUTE = 40;
const KEY_RE = /^[0-9a-f]{64}$/, VOICE_RE = /^[A-Za-z]{3,24}$/, MODEL_RE = /^gemini-[a-z0-9.\-]{0,60}tts[a-z0-9.\-]{0,30}$/;

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const serviceHeaders = (k: string): Record<string, string> => k.startsWith('sb_') ? { apikey: k } : { Authorization: 'Bearer ' + k, apikey: k };

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

// best effort, per running copy of the function: a key may ask at most PER_MINUTE times a minute
const seen = new Map<string, number[]>();
function tooMany(key: string, now: number): boolean {
  const list = (seen.get(key) || []).filter((t) => now - t < 60000);
  list.push(now);
  seen.set(key, list);
  if (seen.size > 50) for (const k of seen.keys()) { if (k !== key) seen.delete(k); }
  return list.length > PER_MINUTE;
}

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch, now = Date.now()): Promise<Response> {
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  const key = String(req.headers.get('x-adam-key') || '');
  if (!KEY_RE.test(key)) return reply(401, { error: 'key' });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.GEMINI_API_KEY) return reply(503, { error: 'not-configured' });
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  // who is this key? (the table of keys is closed to everybody but the service role)
  const rr = await fetchImpl(base + '/rest/v1/rpc/ar_adam_role', {
    method: 'POST', headers: { ...serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: key }), signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  const role = rr && rr.ok ? await rr.json().catch(() => null) : null;
  if (role !== 'phone' && role !== 'laptop') return reply(401, { error: 'key' });
  if (tooMany(key, now)) return reply(429, { error: 'rate' });
  let body: { action?: unknown; text?: unknown; voice?: unknown; style?: unknown; model?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: 'body' }); }

  if (body.action === 'models') {
    const m = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY }, signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => null);
    const j = m && m.ok ? await m.json().catch(() => null) as { models?: { name?: string }[] } | null : null;
    if (!j) return reply(502, { error: 'gemini', status: m ? m.status : 0 });
    return reply(200, { ok: true, models: (j.models || []).map((x) => String(x.name || '').replace(/^models\//, '')).filter((n) => /tts/i.test(n)) });
  }

  // anything not plain text is refused; control characters go; at most MAX_TEXT characters
  const text = typeof body.text === 'string' ? body.text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!text) return reply(400, { error: 'text' });
  if (text.length > MAX_TEXT) return reply(413, { error: 'long', max: MAX_TEXT });
  const voice = body.voice === undefined ? DEFAULT_VOICE : String(body.voice);
  if (!VOICE_RE.test(voice)) return reply(400, { error: 'voice' });
  const model = body.model === undefined ? (env.GEMINI_TTS_MODEL || DEFAULT_MODEL).trim() : String(body.model);
  if (!MODEL_RE.test(model)) return reply(400, { error: 'model' });
  const style = body.style === undefined ? DEFAULT_STYLE : String(body.style).replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, 300);

  const t0 = Date.now();
  const g = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    body: JSON.stringify({
      contents: [{ parts: [{ text: style + text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }),
  }).catch(() => null);
  if (!g) return reply(504, { error: 'gemini-timeout' });
  if (g.status === 429) return reply(429, { error: 'gemini-busy' });
  const out = g.ok ? await g.json().catch(() => null) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] } | null : null;
  const part = out?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) return reply(502, { error: 'gemini', status: g.status });
  // «audio/L16;codec=pcm;rate=24000»
  const rate = Number(/rate=(\d{4,6})/.exec(String(part.inlineData.mimeType || ''))?.[1] || 24000);
  const pcm = unb64(part.inlineData.data);
  if (!pcm.length) return reply(502, { error: 'empty' });
  return new Response(wav(pcm, rate), {
    status: 200,
    headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store', 'X-Voice-Model': model, 'X-Voice-Voice': voice, 'X-Voice-Ms': String(Date.now() - t0) },
  });
}

const deno = (globalThis as unknown as { Deno?: { serve: (h: (req: Request) => Promise<Response>) => void; env: { toObject: () => Env } } }).Deno;
if (deno) deno.serve((req) => handle(req, deno.env.toObject(), fetch));
