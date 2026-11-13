// Function asker-chat (owner 2026-11-13, «متصفح الرسائل»): the push after an answer (owner or staff with «خدمة العملاء»; a VAPID
// JWT the push service accepts; dead addresses dropped) and a voice note's words (the chat's secret; Gemini; written once).
// Fake Supabase, push service and Gemini; nothing real is called. Made-up people only.
const assert = require('node:assert/strict'), path = require('node:path'), crypto = require('node:crypto'), { pathToFileURL } = require('node:url');
(async () => {
  const F = await import(pathToFileURL(path.join(__dirname, '..', 'supabase', 'functions', 'asker-chat', 'index.ts')).href);
  const ORIGIN = 'https://taherasker2560-dot.github.io', OWNER = F.OWNER_ID, STAFF = '00000000-0000-4000-8000-0000000000c1';
  const CHAT = '11111111-2222-4333-8444-555555555555', SECRET = 'a'.repeat(64);
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pubJwk = publicKey.export({ format: 'jwk' });
  const pubRaw = Buffer.concat([Buffer.from([4]), Buffer.from(pubJwk.x, 'base64url'), Buffer.from(pubJwk.y, 'base64url')]).toString('base64url');
  const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', GEMINI_API_KEY: 'g',
    VAPID_PRIVATE_JWK: JSON.stringify(privateKey.export({ format: 'jwk' })), VAPID_PUBLIC_KEY: pubRaw, VAPID_SUBJECT: 'https://taherasker2560-dot.github.io/asker-nawaqes/' };
  function fake({ me = OWNER, staff = [], subs = [], msg = null } = {}) {
    const calls = [], deleted = [], patched = [], pushes = [];
    const f = async (url, o = {}) => {
      calls.push({ url, o });
      const u = new URL(url);
      if (u.hostname === 'push.example' || u.hostname === 'gone.example') {
        pushes.push({ url, headers: o.headers });
        return new Response('', { status: u.hostname === 'gone.example' ? 410 : 201 });
      }
      if (u.hostname === 'generativelanguage.googleapis.com') {
        const b = JSON.parse(o.body);
        assert.equal(b.contents[0].parts[1].inline_data.mime_type, 'audio/wav');
        assert.equal(Buffer.from(b.contents[0].parts[1].inline_data.data, 'base64').toString(), 'RIFFfake');
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: ' عايز بانادول كولد \n وفيتامين سي ' }] } }] }));
      }
      if (u.pathname === '/auth/v1/user') return new Response(JSON.stringify(me ? { id: me } : {}), { status: me ? 200 : 401 });
      if (u.pathname === '/rest/v1/ar_staff') return new Response(JSON.stringify(staff.filter((s) => 'eq.' + s.user_id === u.searchParams.get('user_id'))));
      if (u.pathname === '/rest/v1/ar_chat_push' && o.method === 'DELETE') { deleted.push(decodeURIComponent(u.searchParams.get('endpoint'))); return new Response(null, { status: 204 }); }
      if (u.pathname === '/rest/v1/ar_chat_push') return new Response(JSON.stringify(u.searchParams.get('chat_id') === 'eq.' + CHAT ? subs.map((e) => ({ endpoint: e })) : []));
      if (u.pathname === '/rest/v1/ar_chats') return new Response(JSON.stringify(u.searchParams.get('secret') === 'eq.' + SECRET ? [{ id: CHAT }] : []));
      if (u.pathname === '/rest/v1/ar_chat_messages' && o.method === 'PATCH') { patched.push({ q: u.search, body: JSON.parse(o.body) }); return new Response(null, { status: 204 }); }
      if (u.pathname === '/rest/v1/ar_chat_messages') return new Response(JSON.stringify(msg && u.searchParams.get('chat_id') === 'eq.' + CHAT && u.searchParams.get('id') === 'eq.' + msg.id ? [msg] : []));
      if (u.pathname === '/storage/v1/object/ar-chat/' + (msg && msg.media)) return new Response(Buffer.from('RIFFfake'));
      throw Error('unexpected ' + url);
    };
    Object.assign(f, { calls, deleted, patched, pushes });
    return f;
  }
  const req = (body, auth = 'Bearer jwt', origin = ORIGIN) => new Request('https://p.supabase.co/functions/v1/asker-chat', { method: 'POST', headers: { origin, 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) });

  // the owner answered: every phone of that chat gets a push with no payload; a dead address is dropped
  let f = fake({ subs: ['https://push.example/a1', 'https://gone.example/b2'] });
  let r = await F.handle(req({ action: 'push', chat_id: CHAT }), env, f), b = await r.json();
  assert.equal(r.status, 200); assert.deepEqual(b, { ok: true, sent: 1, gone: 1, failed: 0, codes: [201, 410] });
  assert.deepEqual(f.deleted, ['eq.https://gone.example/b2']);
  const h = f.pushes[0].headers;
  assert.equal(h.TTL, '86400'); assert.equal(h['Content-Length'], undefined, 'the fetch sets the length itself');
  assert.equal(f.calls.find((c) => c.url === 'https://push.example/a1').o.body.length, 0, 'nothing in the push');
  // the VAPID header: a JWT for that push service, signed with the server's key, and the public key
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h.Authorization);
  assert.ok(m, h.Authorization); assert.equal(m[4], pubRaw);
  const claims = JSON.parse(Buffer.from(m[2], 'base64url').toString());
  assert.equal(claims.aud, 'https://push.example'); assert.equal(claims.sub, env.VAPID_SUBJECT);
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
  assert.deepEqual(JSON.parse(Buffer.from(m[1], 'base64url').toString()), { typ: 'JWT', alg: 'ES256' });
  assert.ok(crypto.verify('sha256', Buffer.from(m[1] + '.' + m[2]), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url')), 'signature checks with the public key');

  // staff: only with «خدمة العملاء»; nobody signed in: refused
  r = await F.handle(req({ action: 'push', chat_id: CHAT }), env, fake({ me: STAFF, staff: [{ user_id: STAFF, active: true, perms: ['tempsale'] }], subs: ['https://push.example/a1'] }));
  assert.equal(r.status, 403);
  f = fake({ me: STAFF, staff: [{ user_id: STAFF, active: true, perms: ['care'] }], subs: ['https://push.example/a1'] });
  r = await F.handle(req({ action: 'push', chat_id: CHAT }), env, f);
  assert.equal(r.status, 200); assert.equal((await r.json()).sent, 1);
  r = await F.handle(req({ action: 'push', chat_id: CHAT }, null), env, fake());
  assert.equal(r.status, 401);
  r = await F.handle(req({ action: 'push', chat_id: 'x' }), env, fake());
  assert.equal(r.status, 400);
  // another site: refused before anything
  r = await F.handle(req({ action: 'push', chat_id: CHAT }, 'Bearer jwt', 'https://evil.example'), env, fake());
  assert.equal(r.status, 403);

  // a voice note's words: with the chat's secret, from Gemini, written once (only where none are written yet)
  const msg = { id: 77, kind: 'voice', media: 'c/2026-11-13/11111111-2222-4333-8444-555555555555.wav', body: null, at: new Date().toISOString() };
  f = fake({ msg });
  r = await F.handle(req({ action: 'voice', secret: SECRET, id: 77 }, null), env, f), b = await r.json();
  assert.equal(r.status, 200); assert.equal(b.text, 'عايز بانادول كولد وفيتامين سي');
  assert.deepEqual(f.patched, [{ q: '?id=eq.77&body=is.null', body: { body: 'عايز بانادول كولد وفيتامين سي' } }]);
  // already written: given back, Gemini not asked again
  f = fake({ msg: { ...msg, body: 'مكتوب' } });
  r = await F.handle(req({ action: 'voice', secret: SECRET, id: 77 }, null), env, f);
  assert.equal((await r.json()).text, 'مكتوب'); assert.ok(!f.calls.some((c) => c.url.includes('generativelanguage')));
  // a wrong secret, a text message, an old note: nothing
  assert.equal((await F.handle(req({ action: 'voice', secret: 'b'.repeat(64), id: 77 }, null), env, fake({ msg }))).status, 404);
  assert.equal((await F.handle(req({ action: 'voice', secret: SECRET, id: 77 }, null), env, fake({ msg: { ...msg, kind: 'text' } }))).status, 404);
  assert.equal((await F.handle(req({ action: 'voice', secret: SECRET, id: 77 }, null), env, fake({ msg: { ...msg, at: new Date(Date.now() - 2 * 3600e3).toISOString() } }))).status, 410);
  assert.equal((await F.handle(req({ action: 'voice', secret: 'short', id: 77 }, null), env, fake({ msg }))).status, 400);
  // a customer just wrote: the owner's phone and staff with «خدمة العملاء» (not staff without it), once a minute per chat
  const STAFF2 = '00000000-0000-4000-8000-0000000000c2';
  function fake2({ notified = null, lastAt = new Date().toISOString() } = {}) {
    const pushes = [], patched = [], deleted = [];
    const f = async (url, o = {}) => {
      const u = new URL(url);
      if (/\.example$/.test(u.hostname)) { pushes.push(u.hostname + u.pathname); return new Response('', { status: u.hostname === 'gone.example' ? 410 : 201 }); }
      if (u.pathname === '/rest/v1/ar_chats' && o.method === 'PATCH') { patched.push(JSON.parse(o.body)); return new Response(null, { status: 204 }); }
      if (u.pathname === '/rest/v1/ar_chats') return new Response(JSON.stringify(u.searchParams.get('secret') === 'eq.' + SECRET ? [{ id: CHAT, notified_at: notified }] : []));
      if (u.pathname === '/rest/v1/ar_chat_messages') { assert.equal(u.searchParams.get('sender'), 'eq.customer'); return new Response(JSON.stringify(lastAt ? [{ at: lastAt }] : [])); }
      if (u.pathname === '/rest/v1/ar_chat_staff_push' && o.method === 'DELETE') { deleted.push(decodeURIComponent(u.searchParams.get('endpoint'))); return new Response(null, { status: 204 }); }
      if (u.pathname === '/rest/v1/ar_chat_staff_push') return new Response(JSON.stringify([
        { endpoint: 'https://push.example/owner', user_id: OWNER }, { endpoint: 'https://push.example/staff-care', user_id: STAFF },
        { endpoint: 'https://push.example/staff-other', user_id: STAFF2 }, { endpoint: 'https://gone.example/old', user_id: OWNER }]));
      if (u.pathname === '/rest/v1/ar_staff') {
        assert.equal(u.searchParams.get('user_id'), `in.(${STAFF},${STAFF2})`);
        return new Response(JSON.stringify([{ user_id: STAFF, active: true, perms: ['care'] }, { user_id: STAFF2, active: true, perms: ['tempsale'] }]));
      }
      throw Error('unexpected ' + url);
    };
    Object.assign(f, { pushes, patched, deleted });
    return f;
  }
  f = fake2();
  r = await F.handle(req({ action: 'notify', secret: SECRET }, null), env, f), b = await r.json();
  assert.equal(r.status, 200); assert.equal(b.sent, 2); assert.equal(b.gone, 1);
  assert.deepEqual(f.pushes.sort(), ['gone.example/old', 'push.example/owner', 'push.example/staff-care']);
  assert.deepEqual(f.deleted, ['eq.https://gone.example/old']);
  assert.equal(f.patched.length, 1, 'notified_at kept');
  // within the minute: nobody pushed again; an old message (not just sent): nothing; a wrong secret: 404
  f = fake2({ notified: new Date(Date.now() - 20e3).toISOString() });
  b = await (await F.handle(req({ action: 'notify', secret: SECRET }, null), env, f)).json();
  assert.equal(b.skipped, 'recent'); assert.equal(f.pushes.length, 0);
  f = fake2({ lastAt: new Date(Date.now() - 10 * 60e3).toISOString() });
  b = await (await F.handle(req({ action: 'notify', secret: SECRET }, null), env, f)).json();
  assert.equal(b.skipped, 'old'); assert.equal(f.pushes.length, 0);
  assert.equal((await F.handle(req({ action: 'notify', secret: 'b'.repeat(64) }, null), env, fake2())).status, 404);
  console.log('PASS: asker-chat: push after an answer (VAPID, no payload, dead addresses dropped, staff with care only), voice words once, the pharmacy told when a customer writes');
})().catch((e) => { console.error(e); process.exit(1); });
