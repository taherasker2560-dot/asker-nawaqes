// Function asker-account-push (owner 2026-11-18, «🔔 تنبيه حركة الحساب»): every 5 minutes an EMPTY web push to the phones whose customer has a new movement (the table decides who is due and marks them),
// with a VAPID header the push service accepts; a dead address is dropped; only the allowed origin can call it. Fake Supabase and push service: nothing real.
const assert = require('node:assert/strict'), path = require('node:path'), crypto = require('node:crypto'), { pathToFileURL } = require('node:url');
(async () => {
  const F = await import(pathToFileURL(path.join(__dirname, '..', 'supabase', 'functions', 'asker-account-push', 'index.ts')).href);
  const ORIGIN = 'https://taherasker2560-dot.github.io';
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pubJwk = publicKey.export({ format: 'jwk' });
  const pubRaw = Buffer.concat([Buffer.from([4]), Buffer.from(pubJwk.x, 'base64url'), Buffer.from(pubJwk.y, 'base64url')]).toString('base64url');
  const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', VAPID_PRIVATE_JWK: JSON.stringify(privateKey.export({ format: 'jwk' })), VAPID_PUBLIC_KEY: pubRaw, VAPID_SUBJECT: 'https://taherasker2560-dot.github.io/asker-nawaqes/' };
  const req = (body, o = {}) => new Request('https://p.supabase.co/functions/v1/asker-account-push', { method: o.method || 'POST', headers: { 'content-type': 'application/json', ...(o.origin === null ? {} : { origin: o.origin || ORIGIN }) }, body: o.method === 'GET' ? undefined : JSON.stringify(body) });
  function fake({ due = [], dueStatus = 200 } = {}) {
    const calls = [], deleted = [], pushes = [];
    const f = async (url, o = {}) => {
      calls.push({ url, o });
      const u = new URL(url);
      if (u.hostname === 'push.example' || u.hostname === 'gone.example' || u.hostname === 'bad.example') {
        pushes.push({ url, headers: o.headers, bodyLen: o.body ? o.body.length : 0 });
        return new Response(u.hostname === 'bad.example' ? 'nope' : '', { status: u.hostname === 'gone.example' ? 410 : u.hostname === 'bad.example' ? 500 : 201 });
      }
      if (u.pathname === '/rest/v1/rpc/ar_account_push_due') return dueStatus === 200 ? new Response(JSON.stringify(due)) : new Response('boom', { status: dueStatus });
      if (u.pathname === '/rest/v1/ar_account_push' && o.method === 'DELETE') { deleted.push(decodeURIComponent(u.searchParams.get('endpoint'))); return new Response(null, { status: 204 }); }
      throw Error('unexpected ' + url);
    };
    return Object.assign(f, { calls, deleted, pushes });
  }

  // a tick: the due addresses get an empty push with a VAPID header; the dead one is dropped; the failing one is counted
  let f = fake({ due: ['https://push.example/a', 'https://gone.example/b', 'https://bad.example/c'] });
  let r = await F.handle(req({ action: 'tick' }), env, f), b = await r.json();
  assert.equal(r.status, 200); assert.deepEqual(b, { ok: true, due: 3, sent: 1, gone: 1, failed: 1 });
  const due = f.calls.find((c) => c.url.endsWith('/rest/v1/rpc/ar_account_push_due'));
  assert.deepEqual(JSON.parse(due.o.body), {}, 'the table decides who is due: nothing to send it');
  assert.equal(due.o.headers.apikey, 'service'); assert.equal(due.o.headers.Authorization, 'Bearer service');
  assert.deepEqual(f.deleted, ['eq.https://gone.example/b'], 'a dead address leaves the table (a PostgREST filter on the address)');
  assert.equal(f.pushes.length, 3);
  for (const p of f.pushes) {
    assert.equal(p.bodyLen, 0, 'the push carries nothing: no amount, no name');
    const [, t, k] = /^vapid t=([^,]+), k=(.+)$/.exec(p.headers.Authorization);
    assert.equal(k, pubRaw);
    const [h, c, s] = t.split('.'), claims = JSON.parse(Buffer.from(c, 'base64url')), header = JSON.parse(Buffer.from(h, 'base64url'));
    assert.deepEqual(header, { typ: 'JWT', alg: 'ES256' });
    assert.equal(claims.aud, new URL(p.url).origin); assert.equal(claims.sub, env.VAPID_SUBJECT);
    assert.ok(crypto.verify('sha256', Buffer.from(h + '.' + c), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), 'the signature is the server\'s key');
    assert.equal(p.headers.TTL, '10800'); assert.equal(p.headers.Urgency, 'normal');
  }

  // nobody due: nothing is sent
  f = fake({ due: [] });
  r = await F.handle(req({ action: 'tick' }), env, f); b = await r.json();
  assert.equal(r.status, 200); assert.deepEqual(b, { ok: true, due: 0, sent: 0, gone: 0, failed: 0 }); assert.equal(f.pushes.length, 0);

  // the table's function fails: a 502, nothing sent
  f = fake({ dueStatus: 500 });
  r = await F.handle(req({ action: 'tick' }), env, f); assert.equal(r.status, 502); assert.equal(f.pushes.length, 0);

  // the guards: origin, method, action, body, secrets, the preflight
  r = await F.handle(req({ action: 'tick' }, { origin: 'https://evil.example' }), env, fake()); assert.equal(r.status, 403);
  r = await F.handle(req({ action: 'tick' }, { origin: null }), env, fake()); assert.equal(r.status, 403);
  r = await F.handle(req({}, { method: 'GET' }), env, fake()); assert.equal(r.status, 405);
  r = await F.handle(req({ action: 'send' }), env, fake()); assert.equal(r.status, 400);
  r = await F.handle(new Request('https://p.supabase.co/x', { method: 'POST', headers: { origin: ORIGIN }, body: 'not json' }), env, fake()); assert.equal(r.status, 400);
  r = await F.handle(req({ action: 'tick' }), { ...env, VAPID_PRIVATE_JWK: '' }, fake()); assert.equal(r.status, 503);
  r = await F.handle(req({ action: 'tick' }), { ...env, SUPABASE_SERVICE_ROLE_KEY: '' }, fake()); assert.equal(r.status, 503);
  r = await F.handle(new Request('https://p.supabase.co/x', { method: 'OPTIONS', headers: { origin: ORIGIN } }), env, fake()); assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  console.log('asker-account-push ok');
})().catch((e) => { console.error(e); process.exit(1); });
