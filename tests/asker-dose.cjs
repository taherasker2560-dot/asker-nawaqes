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
  console.log('asker-dose ok');
})().catch((e) => { console.error(e); process.exit(1); });
