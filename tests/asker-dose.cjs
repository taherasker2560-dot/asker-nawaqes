// Function asker-dose (owner 2026-11-17, «⏰ منبه الدوا» stage 2): every minute an EMPTY web push to the phones that have a dose at that minute (Cairo time), with a VAPID header the push
// service accepts; a dead address is dropped; nothing is sent twice in a minute (the table marks it); only the allowed origin can call it. Fake Supabase and push service: nothing real.
const assert = require('node:assert/strict'), path = require('node:path'), crypto = require('node:crypto'), { pathToFileURL } = require('node:url');
(async () => {
  const F = await import(pathToFileURL(path.join(__dirname, '..', 'supabase', 'functions', 'asker-dose', 'index.ts')).href);
  const ORIGIN = 'https://taherasker2560-dot.github.io';
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pubJwk = publicKey.export({ format: 'jwk' });
  const pubRaw = Buffer.concat([Buffer.from([4]), Buffer.from(pubJwk.x, 'base64url'), Buffer.from(pubJwk.y, 'base64url')]).toString('base64url');
  const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', VAPID_PRIVATE_JWK: JSON.stringify(privateKey.export({ format: 'jwk' })), VAPID_PUBLIC_KEY: pubRaw, VAPID_SUBJECT: 'https://taherasker2560-dot.github.io/asker-nawaqes/' };
  const req = (body, o = {}) => new Request('https://p.supabase.co/functions/v1/asker-dose', { method: o.method || 'POST', headers: { 'content-type': 'application/json', ...(o.origin === null ? {} : { origin: o.origin || ORIGIN }) }, body: o.method === 'GET' ? undefined : JSON.stringify(body) });
  function fake({ due = [], dueStatus = 200 } = {}) {
    const calls = [], deleted = [], pushes = [];
    const f = async (url, o = {}) => {
      calls.push({ url, o });
      const u = new URL(url);
      if (u.hostname === 'push.example' || u.hostname === 'gone.example' || u.hostname === 'bad.example') {
        pushes.push({ url, headers: o.headers, bodyLen: o.body ? o.body.length : 0 });
        return new Response(u.hostname === 'bad.example' ? 'nope' : '', { status: u.hostname === 'gone.example' ? 410 : u.hostname === 'bad.example' ? 500 : 201 });
      }
      if (u.pathname === '/rest/v1/rpc/ar_dose_due') return dueStatus === 200 ? new Response(JSON.stringify(due)) : new Response('boom', { status: dueStatus });
      if (u.pathname === '/rest/v1/ar_dose_push' && o.method === 'DELETE') { deleted.push(decodeURIComponent(u.searchParams.get('endpoint'))); return new Response(null, { status: 204 }); }
      throw Error('unexpected ' + url);
    };
    return Object.assign(f, { calls, deleted, pushes });
  }
  // Cairo's clock: winter (UTC+2) and summer (UTC+3, Egypt's DST), the day changes at Cairo midnight
  assert.deepEqual(F.cairoMinute(new Date('2026-11-17T06:00:30Z')), { hhmm: '08:00', day: '2026-11-17' });
  assert.deepEqual(F.cairoMinute(new Date('2026-07-17T05:00:00Z')), { hhmm: '08:00', day: '2026-07-17' }, 'summer time: UTC+3');
  assert.deepEqual(F.cairoMinute(new Date('2026-11-17T22:05:00Z')), { hhmm: '00:05', day: '2026-11-18' }, 'after Cairo midnight it is the next day');
  assert.deepEqual(F.cairoMinute(new Date('2026-11-17T18:00:00Z')), { hhmm: '20:00', day: '2026-11-17' });

  // a tick: the due addresses get an empty push with a VAPID header; the dead one is dropped; the failing one is counted
  const now = new Date('2026-11-17T06:00:20Z');   // 08:00 in Cairo
  let f = fake({ due: ['https://push.example/a', 'https://gone.example/b', 'https://bad.example/c'] });
  let r = await F.handle(req({ action: 'tick' }), env, f, now), b = await r.json();
  assert.equal(r.status, 200); assert.deepEqual(b, { ok: true, minute: '08:00', due: 3, sent: 1, gone: 1, failed: 1 });
  const due = f.calls.find((c) => c.url.endsWith('/rest/v1/rpc/ar_dose_due'));
  assert.deepEqual(JSON.parse(due.o.body), { p_hhmm: '08:00', p_key: '2026-11-17 08:00' }, 'asks for this minute, with the once-a-minute key');
  assert.equal(due.o.headers.apikey, 'service'); assert.equal(due.o.headers.Authorization, 'Bearer service');
  assert.deepEqual(f.deleted, ['eq.https://gone.example/b'], 'a dead address leaves the table (a PostgREST filter on the address)');
  assert.equal(f.pushes.length, 3);
  const first = f.pushes.find((p) => p.url.startsWith('https://push.example')), h = first.headers; assert.equal(first.bodyLen, 0, 'empty: nothing about the medicine travels through the push service');
  assert.equal(h.TTL, '600'); assert.equal(h.Urgency, 'high');
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h.Authorization); assert.ok(m, 'a VAPID header');
  const claims = JSON.parse(Buffer.from(m[2], 'base64url')); assert.equal(claims.aud, 'https://push.example'); assert.equal(claims.sub, env.VAPID_SUBJECT); assert.ok(claims.exp > now.getTime() / 1000);
  assert.equal(m[4], pubRaw);
  assert.ok(crypto.verify('sha256', Buffer.from(m[1] + '.' + m[2]), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url')), 'signed with the server key');
  // nobody due: no push at all
  f = fake({ due: [] }); r = await F.handle(req({ action: 'tick' }), env, f, now); b = await r.json();
  assert.deepEqual(b, { ok: true, minute: '08:00', due: 0, sent: 0, gone: 0, failed: 0 }); assert.equal(f.pushes.length, 0);
  // many addresses: all of them, in batches
  f = fake({ due: Array.from({ length: 60 }, (_, i) => 'https://push.example/' + i) }); r = await F.handle(req({ action: 'tick' }), env, f, now); b = await r.json();
  assert.equal(b.sent, 60); assert.equal(f.pushes.length, 60);
  // the database does not answer: 502, no push
  f = fake({ dueStatus: 500 }); r = await F.handle(req({ action: 'tick' }), env, f, now); assert.equal(r.status, 502); assert.equal(f.pushes.length, 0);
  // checks: only POST, only the allowed origin, only the tick, configured
  assert.equal((await F.handle(req({}, { method: 'GET' }), env, fake(), now)).status, 405);
  assert.equal((await F.handle(req({ action: 'tick' }, { origin: 'https://evil.example' }), env, fake(), now)).status, 403);
  assert.equal((await F.handle(req({ action: 'tick' }, { origin: null }), env, fake(), now)).status, 403);
  assert.equal((await F.handle(req({ action: 'save' }), env, fake(), now)).status, 400);
  assert.equal((await F.handle(req({ action: 'tick' }), { ...env, VAPID_PRIVATE_JWK: '' }, fake(), now)).status, 503);
  assert.equal((await F.handle(new Request('https://p.supabase.co/x', { method: 'OPTIONS', headers: { origin: ORIGIN } }), env, fake(), now)).status, 200);

  // ---- the voice of the alarm (2026-11-18): «ميعاد <الاسم> الآن، خدمة مقدمة من صيدلية عسكر» spoken by Gemini, made once per sentence, kept in a private bucket ----
  assert.equal(F.voiceSentence('فيموجيسال ق'), 'ميعاد فيموجيسال ق الآن، خدمة مقدمة من صيدلية عسكر');
  assert.equal(F.voiceSentence('  Panadol   500 mg '), 'ميعاد Panadol 500 mg الآن، خدمة مقدمة من صيدلية عسكر');
  assert.equal(F.voiceSentence('دوا<script>x</script>'), 'ميعاد دوا script x script الآن، خدمة مقدمة من صيدلية عسكر', 'no markup survives: only letters, digits and a few marks');
  for (const bad of ['', '   ', '123', '...', null, undefined, 5, {}, 'ا'.repeat(41)]) assert.equal(F.voiceSentence(bad), null, String(bad));
  assert.equal(F.voiceSentence('ا'.repeat(40)).length > 40, true, 'forty letters are allowed');
  const pcm = new Uint8Array(4000).map((_, i) => i % 251), w = F.wav(pcm, 24000);
  assert.equal(Buffer.from(w.subarray(0, 4)).toString(), 'RIFF'); assert.equal(Buffer.from(w.subarray(8, 12)).toString(), 'WAVE'); assert.equal(w.length, 44 + 4000);
  assert.equal(new DataView(w.buffer).getUint32(24, true), 24000, 'the rate is in the header');
  const vreq = (body, o = {}) => new Request('https://p.supabase.co/functions/v1/asker-dose', { method: 'POST', headers: { 'content-type': 'application/json', origin: o.origin || ORIGIN, 'cf-connecting-ip': o.ip || '10.0.0.1' }, body: JSON.stringify(body) });
  const venv = { ...env, GEMINI_API_KEY: 'g-key' };
  const geminiOk = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.from(new Uint8Array(6000).fill(7)).toString('base64') } }] } }] }));
  function vfake({ stored = null, listed = [], gemini = [geminiOk], bucketMissing = false } = {}) {
    const calls = [], puts = [], gem = [], made = { bucket: 0 };
    let queue = gemini.slice(), missing = bucketMissing;
    const f = async (url, o = {}) => {
      calls.push(url); const u = new URL(url);
      if (u.pathname.startsWith('/storage/v1/object/authenticated/')) return stored ? new Response(stored) : new Response('{}', { status: 404 });
      if (u.pathname.startsWith('/storage/v1/object/list/')) return new Response(JSON.stringify(listed));
      if (u.pathname === '/storage/v1/bucket') { made.bucket++; missing = false; return new Response('{}', { status: 200 }); }
      if (u.pathname.startsWith('/storage/v1/object/ar-dose-voice/')) { if (missing) return new Response('{"message":"Bucket not found"}', { status: 404 }); puts.push({ url, o }); return new Response('{}', { status: 200 }); }
      if (u.hostname === 'generativelanguage.googleapis.com') { gem.push({ url, o }); const n = queue.length > 1 ? queue.shift() : queue[0]; return n(); }
      throw Error('unexpected ' + url);
    };
    return Object.assign(f, { calls, puts, gem, made });
  }
  // a sentence made before: the same bytes for everybody, no Gemini
  let vf = vfake({ stored: new Uint8Array(w) });
  r = await F.handle(vreq({ action: 'voice', name: 'فيموجيسال ق' }, { ip: '10.0.1.1' }), venv, vf, now);
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/octet-stream', 'a Blob for supabase-js'); assert.equal(r.headers.get('x-voice'), 'cache');
  assert.equal(Buffer.from(await r.arrayBuffer()).length, 44 + 4000); assert.equal(vf.gem.length, 0);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  // a new one: Gemini says the whole sentence in the chosen voice, the file is kept, the answer is the WAV
  vf = vfake();
  r = await F.handle(vreq({ action: 'voice', name: 'فيموجيسال ق' }, { ip: '10.0.1.2' }), venv, vf, now);
  assert.equal(r.status, 200); assert.equal(r.headers.get('x-voice'), 'new');
  const got = Buffer.from(await r.arrayBuffer()); assert.equal(got.subarray(0, 4).toString(), 'RIFF'); assert.equal(got.length, 44 + 6000);
  assert.equal(vf.gem.length, 1); const gb = JSON.parse(vf.gem[0].o.body);
  assert.equal(gb.contents[0].parts[0].text, 'ميعاد فيموجيسال ق الآن، خدمة مقدمة من صيدلية عسكر'); assert.equal(gb.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Charon');
  assert.ok(vf.gem[0].url.includes('gemini-2.5-flash-preview-tts')); assert.equal(vf.gem[0].o.headers['x-goog-api-key'], 'g-key');
  assert.equal(vf.puts.length, 1); assert.equal(vf.puts[0].o.headers['x-upsert'], 'true'); assert.equal(vf.puts[0].o.headers['Content-Type'], 'audio/wav'); assert.match(vf.puts[0].url, /\/ar-dose-voice\/[0-9a-f]{40}\.wav$/);
  // the same sentence maps to the same file; another voice or another sentence to another
  const f1 = vf.puts[0].url; vf = vfake(); await F.handle(vreq({ action: 'voice', name: 'فيموجيسال ق' }, { ip: '10.0.1.3' }), venv, vf, now); assert.equal(vf.puts[0].url, f1);
  vf = vfake(); await F.handle(vreq({ action: 'voice', name: 'بنادول' }, { ip: '10.0.1.3' }), venv, vf, now); assert.notEqual(vf.puts[0].url, f1);
  vf = vfake(); await F.handle(vreq({ action: 'voice', name: 'فيموجيسال ق' }, { ip: '10.0.1.3' }), { ...venv, DOSE_VOICE: 'Kore' }, vf, now); assert.notEqual(vf.puts[0].url, f1); assert.equal(JSON.parse(vf.gem[0].o.body).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');
  // the bucket is made on first use
  vf = vfake({ bucketMissing: true }); r = await F.handle(vreq({ action: 'voice', name: 'اوميز' }, { ip: '10.0.1.4' }), venv, vf, now);
  assert.equal(r.status, 200); assert.equal(vf.made.bucket, 1); assert.equal(vf.puts.length, 1, 'kept after the bucket was made');
  // a failure to KEEP the file never loses the answer
  vf = vfake({ bucketMissing: true }); const keepFail = async (url, o) => (new URL(url).pathname.startsWith('/storage/v1/object/ar-dose-voice/') ? new Response('{}', { status: 500 }) : vf(url, o));
  r = await F.handle(vreq({ action: 'voice', name: 'اوميز' }, { ip: '10.0.1.5' }), venv, keepFail, now); assert.equal(r.status, 200);
  // the daily limit: 150 new sentences in 24 hours for everybody, none made past it (a cached one still answers)
  const recent = Array.from({ length: 150 }, (_, i) => ({ name: i + '.wav', created_at: new Date(now.getTime() - 3600000).toISOString() }));
  vf = vfake({ listed: recent }); r = await F.handle(vreq({ action: 'voice', name: 'جديد' }, { ip: '10.0.1.6' }), venv, vf, now);
  assert.equal(r.status, 429); assert.deepEqual(await r.json(), { error: 'busy' }); assert.equal(vf.gem.length, 0);
  const old = Array.from({ length: 150 }, (_, i) => ({ name: i + '.wav', created_at: new Date(now.getTime() - 2 * 86400000).toISOString() }));
  vf = vfake({ listed: old }); r = await F.handle(vreq({ action: 'voice', name: 'جديد' }, { ip: '10.0.1.7' }), venv, vf, now); assert.equal(r.status, 200, 'files older than a day do not count');
  vf = vfake({ listed: recent, stored: new Uint8Array(w) }); r = await F.handle(vreq({ action: 'voice', name: 'جديد' }, { ip: '10.0.1.8' }), venv, vf, now); assert.equal(r.status, 200, 'a kept sentence is free');
  // one address: 30 new sentences an hour
  let last; for (let i = 0; i < 31; i++) last = await F.handle(vreq({ action: 'voice', name: 'دوا' + 'ا'.repeat(i % 20) + String.fromCharCode(0x0621 + (i % 28)) }, { ip: '10.9.9.9' }), venv, vfake(), now);
  assert.equal(last.status, 429, 'the 31st new sentence from one address is refused'); assert.deepEqual(await last.json(), { error: 'rate' });
  // a speech model out of quota: the next one is tried; all of them out: 429 for the page, which then uses the phone's own voice
  vf = vfake({ gemini: [() => new Response('quota', { status: 429 }), geminiOk] }); r = await F.handle(vreq({ action: 'voice', name: 'اوميز' }, { ip: '10.0.2.1' }), venv, vf, now);
  assert.equal(r.status, 200); assert.equal(vf.gem.length, 2); assert.ok(vf.gem[1].url.includes('gemini-3.8-flash-lite-tts'));
  vf = vfake({ gemini: [() => new Response('quota', { status: 429 })] }); r = await F.handle(vreq({ action: 'voice', name: 'اوميز' }, { ip: '10.0.2.2' }), venv, vf, now);
  assert.equal(r.status, 429); assert.deepEqual(await r.json(), { error: 'gemini-busy' }); assert.equal(vf.puts.length, 0);
  vf = vfake({ gemini: [() => new Response('boom', { status: 500 })] }); r = await F.handle(vreq({ action: 'voice', name: 'اوميز' }, { ip: '10.0.2.3' }), venv, vf, now); assert.equal(r.status, 502);
  vf = vfake({ gemini: [() => new Response(JSON.stringify({ candidates: [] }))] }); r = await F.handle(vreq({ action: 'voice', name: 'اوميز' }, { ip: '10.0.2.4' }), venv, vf, now); assert.equal(r.status, 502, 'no audio in the answer');
  vf = vfake({ gemini: [() => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: Buffer.from(new Uint8Array(100)).toString('base64') } }] } }] }))] }); r = await F.handle(vreq({ action: 'voice', name: 'اوميز' }, { ip: '10.0.2.5' }), venv, vf, now); assert.equal(r.status, 502, 'a few bytes are not a sentence');
  // checks: the name, the origin, the key
  assert.equal((await F.handle(vreq({ action: 'voice', name: '' }, { ip: '10.0.3.1' }), venv, vfake(), now)).status, 400);
  assert.equal((await F.handle(vreq({ action: 'voice', name: 'x'.repeat(60) }, { ip: '10.0.3.1' }), venv, vfake(), now)).status, 400);
  assert.equal((await F.handle(vreq({ action: 'voice', name: 'اوميز' }, { origin: 'https://evil.example', ip: '10.0.3.2' }), venv, vfake(), now)).status, 403);
  assert.equal((await F.handle(vreq({ action: 'voice', name: 'اوميز' }, { ip: '10.0.3.3' }), env, vfake(), now)).status, 503, 'no Gemini key');
  // the promo voice: ONE fixed advert text written in the function (nobody sends words), a voice from a short list, made once and kept
  assert.ok(F.PROMO_TEXT.length > 150 && F.PROMO_TEXT.includes('صيدلية عسكر'), 'the advert text is in the function');
  assert.ok(!/بوت/.test(F.PROMO_TEXT), 'never «بوت» in a text a customer hears');
  assert.equal(F.promoVoice('puck', {}), 'Puck'); assert.equal(F.promoVoice('Evil', {}), 'Fenrir', 'a voice outside the list falls back'); assert.equal(F.promoVoice(undefined, { PROMO_VOICE: 'Orus' }), 'Orus'); assert.equal(F.promoVoice(5, {}), 'Fenrir');
  vf = vfake(); r = await F.handle(vreq({ action: 'promo', text: 'قول كلام تاني', name: 'مرتجع' }, { ip: '10.0.4.1' }), venv, vf, now);
  assert.equal(r.status, 200); assert.equal(r.headers.get('x-voice'), 'new'); assert.equal(r.headers.get('content-type'), 'application/octet-stream');
  const pb = JSON.parse(vf.gem[0].o.body); assert.ok(pb.contents[0].parts[0].text.endsWith(F.PROMO_TEXT), 'Gemini gets the fixed text (a style line first), never the caller\'s words');
  assert.ok(!pb.contents[0].parts[0].text.includes('قول كلام تاني') && !pb.contents[0].parts[0].text.includes('مرتجع')); assert.equal(pb.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Fenrir');
  assert.equal(vf.puts.length, 1, 'kept for everybody');
  const p1 = vf.puts[0].url; vf = vfake(); await F.handle(vreq({ action: 'promo', voice: 'Fenrir' }, { ip: '10.0.4.2' }), venv, vf, now); assert.equal(vf.puts[0].url, p1, 'the same text and voice = the same file');
  vf = vfake(); await F.handle(vreq({ action: 'promo', voice: 'Puck' }, { ip: '10.0.4.3' }), venv, vf, now); assert.notEqual(vf.puts[0].url, p1, 'another voice = another file');
  vf = vfake(); await F.handle(vreq({ action: 'voice', name: 'فيموجيسال ق' }, { ip: '10.0.4.4' }), venv, vf, now); assert.notEqual(vf.puts[0].url, p1);
  vf = vfake({ stored: new Uint8Array(w) }); r = await F.handle(vreq({ action: 'promo' }, { ip: '10.0.4.5' }), venv, vf, now); assert.equal(r.headers.get('x-voice'), 'cache'); assert.equal(vf.gem.length, 0, 'made before: no Gemini');
  assert.equal((await F.handle(vreq({ action: 'promo' }, { origin: 'https://evil.example', ip: '10.0.4.6' }), venv, vfake(), now)).status, 403);
  assert.equal((await F.handle(vreq({ action: 'promo' }, { ip: '10.0.4.7' }), env, vfake(), now)).status, 503, 'no Gemini key');
  // the push side does not need the speech key, and the voice does not need the push keys
  assert.equal((await F.handle(vreq({ action: 'voice', name: 'اوميز' }, { ip: '10.0.3.4' }), { ...venv, VAPID_PRIVATE_JWK: '', VAPID_PUBLIC_KEY: '' }, vfake(), now)).status, 200);
  console.log('asker-dose ok');
})().catch((e) => { console.error(e); process.exit(1); });
