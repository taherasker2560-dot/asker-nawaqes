// WhatsApp Cloud API webhook («الباب الرسمي»), step 1: SHADOW MODE ONLY.
// With Coexistence the pharmacy number stays in the WhatsApp Business app on the phone, and Meta also sends every 1:1
// message it receives to this webhook, with the sender's number and the photo/file itself (no guessing by time).
// Shadow mode: a message from a saved supplier's phone (ar_suppliers.phone) is only logged in ar_wa_log (who, when,
// what kind, the text, the photo's hash). Nothing is read by Gemini, spoken, or added to ar_inbox, so the phone path
// keeps working exactly as before. Messages from any other number (customers) are dropped without being saved.
// The log is compared with ar_inbox (same photo hash = same photo) to measure what the phone path missed or gave to
// the wrong company, before the official path replaces it (live mode: a later, separate change).
// Group chats never come this way (Meta: groups are not synced in Coexistence).
// Secrets, set by the owner in Supabase (never in the repo or the chat):
//   WA_VERIFY_TOKEN  any long random text, also typed in Meta's webhook settings (Meta's GET check)
//   WA_APP_SECRET    the Meta app's secret: every POST must carry Meta's signature made with it
//   WA_TOKEN         access token allowed to download the photos/files (optional: without it only the text is logged)
//   WA_GRAPH_VERSION optional, e.g. v23.0

type Env = Record<string, string | undefined>;
type Log = (stage: string, started: number, extra?: Record<string, unknown>) => void;
export const WA_GRAPH_DEFAULT = 'v23.0';
const TIMEOUT_MS = 15000, MAX_MEDIA_BYTES = 8 * 1024 * 1024;
// the log is only for comparing the two paths: older rows are cleared now and then
const KEEP_DAYS = 30;
// Meta's media links: the access token is only ever sent to these hosts
const MEDIA_HOST = /(^|\.)(fbsbx\.com|facebook\.com|fbcdn\.net|whatsapp\.net)$/i;

export type WaKind = 'text' | 'image' | 'pdf' | 'sheet' | 'file';
export type WaMessage = { id: string; from: string; at: string; kind: WaKind; text: string; mediaId: string; mime: string; fileName: string; caption: string; profile: string };

// Meta's calls: the GET check (hub.mode=subscribe…) and POSTs signed in X-Hub-Signature-256
export function isWaRequest(req: Request): boolean {
  if (req.headers.get('x-hub-signature-256') !== null) return true;
  return req.method === 'GET' && new URL(req.url).searchParams.has('hub.mode');
}

// a phone as digits with the country code: 0100… (Egypt, local) = 20100…, +20 / 0020 the same
export function phoneKey(s: unknown): string {
  let d = String(s ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (/^01\d{9}$/.test(d)) d = '2' + d;
  return d;
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
// same name as the phone path's stored files (index.ts: SHA-256 of the bytes, first 32 hex), so both can be compared
export async function mediaHash(bytes: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).slice(0, 32);
}

// X-Hub-Signature-256: «sha256=<hex HMAC of the raw body with the app secret>», compared in constant time
export async function validSignature(raw: Uint8Array, header: string | null, secret: string): Promise<boolean> {
  const m = String(header || '').trim().match(/^sha256=([0-9a-f]{64})$/i);
  if (!m || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const got = hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, raw))), want = m[1].toLowerCase();
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

function docKind(mime: string, fileName: string): WaKind {
  if (/pdf/i.test(mime) || /\.pdf$/i.test(fileName)) return 'pdf';
  if (/sheet|excel|csv/i.test(mime) || /\.(xlsx|xls|csv)$/i.test(fileName)) return 'sheet';
  return 'file';
}

// the incoming messages of one webhook call. Kept: text, photo, document. Voice notes, videos, stickers, reactions,
// locations and the like are dropped, as the phone path drops them. Delivery statuses and echoes (messages the
// pharmacy itself sent from the app) are not incoming messages.
export function waMessages(payload: unknown): WaMessage[] {
  const out: WaMessage[] = [];
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    const changes = (e as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const ch of changes) {
      const c = ch as { field?: string; value?: { contacts?: unknown; messages?: unknown } };
      if (c?.field !== 'messages' || !Array.isArray(c.value?.messages)) continue;
      const names = new Map<string, string>();
      for (const x of (Array.isArray(c.value?.contacts) ? c.value!.contacts : []) as { wa_id?: string; profile?: { name?: string } }[]) {
        if (x?.wa_id) names.set(phoneKey(x.wa_id), String(x.profile?.name || '').slice(0, 80));
      }
      for (const raw of c.value!.messages as Record<string, unknown>[]) {
        const id = String(raw?.id || ''), from = phoneKey(raw?.from), type = String(raw?.type || '');
        if (!id || !from) continue;
        const secs = Number(raw?.timestamp);
        const at = new Date(Number.isFinite(secs) && secs > 0 ? secs * 1000 : Date.now()).toISOString();
        const media = (raw?.[type] || {}) as { id?: string; mime_type?: string; filename?: string; caption?: string; body?: string };
        let kind: WaKind;
        if (type === 'text') kind = 'text';
        else if (type === 'image') kind = 'image';
        else if (type === 'document') kind = docKind(String(media.mime_type || ''), String(media.filename || ''));
        else continue;
        out.push({
          id, from, at, kind,
          text: kind === 'text' ? String(media.body || '').slice(0, 20000) : '',
          mediaId: kind === 'text' ? '' : String(media.id || ''),
          mime: String(media.mime_type || '').slice(0, 100), fileName: String(media.filename || '').slice(-120),
          caption: String(media.caption || '').slice(0, 2000), profile: names.get(from) || '',
        });
      }
    }
  }
  return out;
}

// a photo/file of a message: Meta gives a short-lived link for its media id, downloaded with the same token
export async function downloadMedia(env: Env, fetchImpl: typeof fetch, mediaId: string): Promise<{ bytes: Uint8Array; mime: string }> {
  if (!env.WA_TOKEN) throw new Error('no-token');
  const auth = { Authorization: 'Bearer ' + env.WA_TOKEN };
  const ver = /^v\d+\.\d+$/.test(env.WA_GRAPH_VERSION || '') ? env.WA_GRAPH_VERSION : WA_GRAPH_DEFAULT;
  const meta = await fetchImpl(`https://graph.facebook.com/${ver}/${encodeURIComponent(mediaId)}`, { headers: auth, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!meta.ok) throw new Error('media ' + meta.status);
  const info = await meta.json() as { url?: string; mime_type?: string; file_size?: number };
  let host = '';
  try { host = new URL(String(info.url || '')).hostname; } catch { /* checked below */ }
  if (!/^https:\/\//.test(String(info.url || '')) || !MEDIA_HOST.test(host)) throw new Error('media url');
  if (Number(info.file_size) > MAX_MEDIA_BYTES) throw new Error('media size');
  const f = await fetchImpl(String(info.url), { headers: auth, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!f.ok) throw new Error('media file ' + f.status);
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (bytes.length > MAX_MEDIA_BYTES) throw new Error('media size');
  return { bytes, mime: String(info.mime_type || '') };
}

const serviceHeaders = (service: string): Record<string, string> =>
  service.startsWith('sb_') ? { apikey: service } : { Authorization: 'Bearer ' + service, apikey: service };

// shadow mode: log the saved suppliers' messages, drop everything else
async function shadowLog(msgs: WaMessage[], env: Env, fetchImpl: typeof fetch, log: Log): Promise<void> {
  const t0 = Date.now();
  try {
    const base = env.SUPABASE_URL!.replace(/\/$/, ''), sh = serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY || '');
    const r = await fetchImpl(`${base}/rest/v1/ar_suppliers?select=name,phone&limit=1000`, { headers: sh, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) throw new Error('suppliers ' + r.status);
    // one phone can be saved under two names (a rep's own chat and his company's group): both are kept
    const byPhone = new Map<string, string[]>();
    for (const s of await r.json() as { name: string; phone: string | null }[]) {
      const k = phoneKey(s.phone);
      if (k.length >= 10) byPhone.set(k, [...(byPhone.get(k) || []), s.name].sort());
    }
    let kept = 0, dropped = 0, failed = 0;
    for (const m of msgs) {
      const suppliers = byPhone.get(m.from) || [];
      if (!suppliers.length) { dropped++; continue; }
      let hash: string | null = null, size: number | null = null, mime = m.mime, error: string | null = null;
      if (m.mediaId) {
        try {
          const f = await downloadMedia(env, fetchImpl, m.mediaId);
          hash = await mediaHash(f.bytes); size = f.bytes.length; mime = f.mime || mime;
        } catch (e) { error = String((e as Error).message || e).slice(0, 120); }
      }
      const row = {
        wa_id: m.id, at: m.at, phone: m.from, suppliers, kind: m.kind, body_text: m.text || null, caption: m.caption || null,
        file_name: m.fileName || null, media_hash: hash, mime: mime || null, size, profile: m.profile || null, error,
      };
      const ins = await fetchImpl(`${base}/rest/v1/ar_wa_log`, {
        method: 'POST', body: JSON.stringify(row), headers: { ...sh, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, signal: AbortSignal.timeout(TIMEOUT_MS),
      }).catch(() => null);
      // 409: Meta sent the same message again (same wa_id): already logged
      if (ins && (ins.ok || ins.status === 409)) kept++; else failed++;
    }
    if (kept) {
      const old = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString();
      await fetchImpl(`${base}/rest/v1/ar_wa_log?received_at=lt.${encodeURIComponent(old)}`, { method: 'DELETE', headers: { ...sh, Prefer: 'return=minimal' }, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
    }
    log('wa', t0, { mode: 'shadow', messages: msgs.length, kept, dropped, failed });
  } catch (e) {
    log('wa', t0, { mode: 'shadow', messages: msgs.length, error: String((e as Error).message || e).slice(0, 120) });
  }
}

export async function handleWa(req: Request, env: Env, fetchImpl: typeof fetch, log: Log): Promise<Response> {
  const url = new URL(req.url);
  const text = (status: number, body: string) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (req.method === 'GET') {
    // Meta's check when the webhook is saved: the same token typed there must be in WA_VERIFY_TOKEN
    const token = env.WA_VERIFY_TOKEN || '';
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && token.length >= 16 && url.searchParams.get('hub.verify_token') === token;
    return ok ? text(200, url.searchParams.get('hub.challenge') || '') : text(403, 'forbidden');
  }
  if (req.method !== 'POST') return text(405, 'method');
  if (!env.WA_APP_SECRET || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) return text(503, 'not-configured');
  const raw = new Uint8Array(await req.arrayBuffer());
  if (!await validSignature(raw, req.headers.get('x-hub-signature-256'), env.WA_APP_SECRET)) {
    log('wa', Date.now(), { refused: 'signature' });
    return text(401, 'signature');
  }
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(raw)); } catch { return text(400, 'body'); }
  const msgs = waMessages(payload);
  if (!msgs.length) return text(200, 'ok');
  // Meta wants a quick 200 (it sends again otherwise): the photos are downloaded after answering when the
  // runtime allows it
  const work = shadowLog(msgs, env, fetchImpl, log);
  const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(work); else await work;
  return text(200, 'ok');
}
