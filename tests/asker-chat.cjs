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
  function fake2({ notified = null, lastAt = new Date().toISOString(), supplier = null } = {}) {
    const pushes = [], patched = [], deleted = [];
    const f = async (url, o = {}) => {
      const u = new URL(url);
      if (/\.example$/.test(u.hostname)) { pushes.push(u.hostname + u.pathname); return new Response('', { status: u.hostname === 'gone.example' ? 410 : 201 }); }
      if (u.pathname === '/rest/v1/ar_chats' && o.method === 'PATCH') { patched.push(JSON.parse(o.body)); return new Response(null, { status: 204 }); }
      if (u.pathname === '/rest/v1/ar_chats') return new Response(JSON.stringify(u.searchParams.get('secret') === 'eq.' + SECRET ? [{ id: CHAT, notified_at: notified, supplier }] : []));
      if (u.pathname === '/rest/v1/ar_chat_messages') { assert.equal(u.searchParams.get('sender'), 'eq.customer'); return new Response(JSON.stringify(lastAt ? [{ at: lastAt }] : [])); }
      if (u.pathname === '/rest/v1/ar_chat_staff_push' && o.method === 'DELETE') { deleted.push(decodeURIComponent(u.searchParams.get('endpoint'))); return new Response(null, { status: 204 }); }
      if (u.pathname === '/rest/v1/ar_chat_staff_push') return new Response(JSON.stringify([
        { endpoint: 'https://push.example/owner', user_id: OWNER }, { endpoint: 'https://push.example/staff-care', user_id: STAFF },
        { endpoint: 'https://push.example/staff-other', user_id: STAFF2 }, { endpoint: 'https://gone.example/old', user_id: OWNER }]));
      if (u.pathname === '/rest/v1/ar_staff') {
        assert.equal(u.searchParams.get('user_id'), `in.(${STAFF},${STAFF2})`);
        return new Response(JSON.stringify([{ user_id: STAFF, active: true, perms: ['care'] }, { user_id: STAFF2, active: true, perms: ['tempsale', 'read'] }]));
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
  // a warehouse's chat (its list from the link, owner 2026-11-14): the owner and staff with «الوارد», not staff with care only
  f = fake2({ supplier: 'مخزن تجربة (حسن)' });
  b = await (await F.handle(req({ action: 'notify', secret: SECRET }, null), env, f)).json();
  assert.deepEqual(f.pushes.sort(), ['gone.example/old', 'push.example/owner', 'push.example/staff-other']);

  // «what»: the bot's worker asks what a push was about, with its own saved push address (owner 2026-11-14 «مفيش صوت اشعار»)
  function fake3({ known = true, warehouse = null, customer = null } = {}) {
    const f = async (url) => {
      const u = new URL(url);
      if (u.pathname === '/rest/v1/ar_chat_staff_push') { assert.equal(u.searchParams.get('endpoint'), 'eq.https://fcm.example/me'); return new Response(JSON.stringify(known ? [{ user_id: OWNER }] : [])); }
      if (u.pathname === '/rest/v1/ar_chats') {
        assert.ok(new Date(u.searchParams.get('last_at').slice(4)) > new Date(Date.now() - 16 * 60e3), 'the last 15 minutes');
        if (u.searchParams.get('supplier') === 'not.is.null') { assert.equal(u.searchParams.get('last_from'), 'eq.customer'); return new Response(JSON.stringify(warehouse ? [warehouse] : [])); }
        assert.equal(u.searchParams.get('supplier'), 'is.null'); assert.equal(u.searchParams.get('waiting'), 'gt.0');
        return new Response(JSON.stringify(customer ? [customer] : []));
      }
      throw Error('unexpected ' + url);
    };
    return f;
  }
  const what = (f) => F.handle(req({ action: 'what', endpoint: 'https://fcm.example/me' }, null), env, f);
  const t1 = new Date(Date.now() - 60e3).toISOString(), t2 = new Date().toISOString();
  b = await (await what(fake3({ warehouse: { supplier: 'طاهر تجربه', last_at: t2 }, customer: { name: 'سامية', last_at: t1 } }))).json();
  assert.deepEqual(b, { title: 'وارد جديد من مخزن', body: 'طاهر تجربه بعت من الرابط، شوف «الوارد»', tab: 'read' });
  b = await (await what(fake3({ warehouse: { supplier: 'طاهر تجربه', last_at: t1 }, customer: { name: 'سامية', last_at: t2 } }))).json();
  assert.deepEqual(b, { title: 'رسالة جديدة من عميل', body: 'سامية كتبلك في «خدمة العملاء ← الرسايل»', tab: 'care' });
  b = await (await what(fake3())).json();
  assert.deepEqual(b, { title: 'صيدلية عسكر', body: 'فيه جديد في البوت', tab: '' });
  // a push address the pharmacy never saved: nothing said
  assert.equal((await what(fake3({ known: false }))).status, 404);
  assert.equal((await F.handle(req({ action: 'what', endpoint: 'http://x' }, null), env, fake3())).status, 400);
  // the nightly clean-up (owner 2026-11-14, «ب: 7 أيام»): only what is past its time, files first, the invoices never
  {
    const now = Date.now(), calls = [];
    const f = async (url, o = {}) => {
      const u = new URL(url); calls.push({ path: u.pathname, q: decodeURIComponent(u.search), method: o.method || 'GET', body: o.body ? JSON.parse(o.body) : null });
      const since = (k) => Date.parse(decodeURIComponent((u.search.match(new RegExp(k + '=lt\\.([^&]+)')) || [])[1] || ''));
      if (u.pathname === '/rest/v1/ar_chat_messages' && !o.method) {
        if (u.searchParams.get('at')) { assert.ok(Math.abs(now - 7 * 864e5 - since('at')) < 5000, '7 days'); return new Response(JSON.stringify([{ id: 1, media: 'c/2026-11-01/a.jpg' }, { id: 2, media: null }])); }
        assert.ok(Math.abs(now - 3600e3 - since('inbox_at')) < 5000, 'an hour after «الوارد»'); assert.equal(u.searchParams.get('media'), 'not.is.null');
        return new Response(JSON.stringify([{ id: 9, media: 'c/2026-11-14/w.jpg' }]));
      }
      if (u.pathname === '/rest/v1/ar_inbox' && !o.method) {
        assert.ok(Math.abs(now - 30 * 864e5 - since('received_at')) < 5000, '30 days');
        return new Response(JSON.stringify([{ id: 'i1', file_path: '2026-10-01/aaa.jpg' }, { id: 'i2', file_path: 'docs/2026-10-01/inv.jpg' }]));
      }
      if (u.pathname.startsWith('/storage/v1/object/') && o.method === 'DELETE') return new Response('[]');
      if (o.method === 'DELETE' || o.method === 'PATCH') return new Response(null, { status: 204 });
      throw Error('unexpected ' + url);
    };
    const r = await F.handle(req({ action: 'cleanup' }, null), env, f), b = await r.json();
    assert.deepEqual(b, { ok: true, messages: 2, files: 1, warehouseFiles: 1, inboxFiles: 1 });
    const del = calls.filter((c) => c.method === 'DELETE');
    assert.deepEqual(del.map((c) => [c.path, c.body && c.body.prefixes, c.q]), [
      ['/storage/v1/object/ar-chat', ['c/2026-11-01/a.jpg'], ''], ['/rest/v1/ar_chat_messages', null, '?id=in.(1,2)'],
      ['/storage/v1/object/ar-chat', ['c/2026-11-14/w.jpg'], ''], ['/storage/v1/object/ar-inbox', ['2026-10-01/aaa.jpg'], ''],
      ['/rest/v1/ar_chat_drafts', null, del[4] && del[4].q]]);
    assert.ok(Math.abs(now - 30 * 864e5 - Date.parse(del[4].q.split('created_at=lt.')[1])) < 5000, 'the suggestions after 30 days');
    assert.deepEqual(calls.filter((c) => c.method === 'PATCH').map((c) => [c.path, c.q, c.body]), [
      ['/rest/v1/ar_chat_messages', '?id=in.(9)', { media: null }], ['/rest/v1/ar_inbox', '?id=in.(i1)', { file_path: null }]]);
    assert.ok(!JSON.stringify(calls).includes('docs/2026-10-01/inv.jpg"]'), 'the invoices are never deleted');
  }
  console.log('PASS: asker-chat: push after an answer (VAPID, no payload, dead addresses dropped, staff with care only), voice words once, the pharmacy told when a customer writes or a warehouse sends, «what» for the bot\'s worker, the nightly clean-up');
})().catch((e) => { console.error(e); process.exit(1); });
