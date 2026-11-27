// Function asker-store-img: the owner (or any active staff member) keeps a chosen photo on our storage; anyone else is refused; only
// real pictures from public https addresses. Fake Supabase and fake websites; nothing real is called.
const assert = require('node:assert/strict'), path = require('node:path'), { pathToFileURL } = require('node:url');
(async () => {
  const F = await import(pathToFileURL(path.join(__dirname, '..', 'supabase', 'functions', 'asker-store-img', 'index.ts')).href);
  const ORIGIN = 'https://taherasker2560-dot.github.io', OWNER = F.OWNER_ID, STAFF = '00000000-0000-4000-8000-0000000000c1';
  const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  const JPG = new Uint8Array(800).fill(7); JPG.set([0xff, 0xd8, 0xff, 0xe0]);
  const HTML = new TextEncoder().encode('<html>' + 'x'.repeat(900) + '</html>');
  function fake({ me = OWNER, staffOk = false, web = JPG, webStatus = 200, takenBy = null, readStatus = 200, submit = { ok: true, id: 5 } } = {}) {
    const calls = [], saved = [], waiting = [];
    const f = async (url, o = {}) => {
      calls.push({ url, o }); const u = new URL(url);
      if (u.hostname === 'p.supabase.co') {
        if (u.pathname === '/auth/v1/user') return new Response(JSON.stringify(me ? { id: me } : {}), { status: me ? 200 : 401 });
        if (u.pathname === '/rest/v1/rpc/ar_is_staff') return new Response(JSON.stringify(staffOk));
        if (u.pathname.startsWith('/storage/v1/object/ar-store-img/')) { assert.equal(o.headers.apikey, 'service'); return new Response('{}'); }
        if (u.pathname === '/rest/v1/ar_store_edits') { saved.push(JSON.parse(o.body)); return new Response(null, { status: 201 }); }
        if (u.pathname === '/rest/v1/rpc/ar_photo_submit') { assert.equal(o.headers.apikey, 'service'); waiting.push(JSON.parse(o.body)); return new Response(JSON.stringify(submit)); }
        if (u.pathname === '/rest/v1/ar_item_reads') { assert.equal(u.searchParams.get('id'), 'eq.77'); return new Response(JSON.stringify(takenBy ? [{ requested_by: takenBy }] : []), { status: readStatus }); }
        throw Error('unexpected ' + url);
      }
      return new Response(web, { status: webStatus });
    };
    f.calls = calls; f.saved = saved; f.waiting = waiting; return f;
  }
  const req = (body, auth = 'Bearer jwt') => new Request('https://p.supabase.co/functions/v1/asker-store-img', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) });
  // the owner picks one of the photos found: kept on our storage, the item points to it
  let f = fake(), r = await F.handle(req({ id: 1234, url: 'https://egyptdwa.com/dwa/x.jpg' }), env, f), b = await r.json();
  assert.equal(r.status, 200); assert.match(b.img, /^e\/1234-[0-9a-f]{12}\.jpg$/);
  assert.deepEqual([f.saved[0].item_id, f.saved[0].img, f.saved[0].img_off], [1234, b.img, false]);
  assert.ok(f.calls.some((c) => c.url === 'https://egyptdwa.com/dwa/x.jpg'), 'downloaded normally from the site');
  // a photo from his phone (base64)
  f = fake(); r = await F.handle(req({ id: 9, data: 'data:image/jpeg;base64,' + Buffer.from(JPG).toString('base64') }), env, f);
  assert.equal(r.status, 200); assert.match((await r.json()).img, /^e\/9-/);
  // an active staff member may (owner 2026-11-21: any of them, not only «storeorders»); a stranger (not staff) may not; no sign-in: refused.
  // Owner 2026-11-27: his photo is not shown, it waits for the owner's yes
  f = fake({ me: STAFF, staffOk: true }); r = await F.handle(req({ id: 9, url: 'https://a.com/x.jpg' }), env, f); b = await r.json();
  assert.equal(r.status, 200); assert.equal(b.pending, true); assert.equal(f.saved.length, 0, 'nothing is put on the item');
  assert.deepEqual(f.waiting, [{ p_item: 9, p_img: b.img, p_by: STAFF }]);
  const box = 'data:image/jpeg;base64,' + Buffer.from(JPG).toString('base64');
  // the new item's box photo goes from the owner's page: the one who TOOK it counts
  f = fake({ takenBy: STAFF }); r = await F.handle(req({ id: 9, data: box, read: 77 }), env, f); b = await r.json();
  assert.deepEqual([r.status, b.pending, f.saved.length, f.waiting[0].p_by], [200, true, 0, STAFF]);
  f = fake({ takenBy: OWNER }); r = await F.handle(req({ id: 9, data: box, read: 77 }), env, f); b = await r.json();
  assert.deepEqual([r.status, !!b.pending, f.saved.length, f.waiting.length], [200, false, 1, 0], 'his own box photo is shown at once');
  // who took it cannot be asked, or the waiting list refuses: nothing is shown on a guess
  f = fake({ takenBy: STAFF, readStatus: 500 }); r = await F.handle(req({ id: 9, data: box, read: 77 }), env, f);
  assert.deepEqual([r.status, f.saved.length, f.waiting.length], [502, 0, 0]);
  f = fake({ me: STAFF, staffOk: true, submit: { ok: false } }); r = await F.handle(req({ id: 9, data: box }), env, f);
  assert.deepEqual([r.status, f.saved.length], [502, 0]);
  f = fake({ me: STAFF, staffOk: false }); r = await F.handle(req({ id: 9, url: 'https://a.com/x.jpg' }), env, f);
  assert.equal(r.status, 403); assert.equal(f.saved.length, 0);
  assert.equal((await F.handle(req({ id: 9, url: 'https://a.com/x.jpg' }, null), env, fake())).status, 401);
  assert.equal((await F.handle(req({ id: 9, url: 'https://a.com/x.jpg' }), env, fake({ me: null }))).status, 401);
  // not a picture, a site that refuses, bad addresses, a bad item number: nothing saved
  for (const [body, opt, code] of [
    [{ id: 9, url: 'https://a.com/x.jpg' }, { web: HTML }, 400],
    [{ id: 9, url: 'https://a.com/x.jpg' }, { webStatus: 403 }, 502],
    [{ id: 9, url: 'http://a.com/x.jpg' }, {}, 400],
    [{ id: 9, url: 'https://127.0.0.1/x.jpg' }, {}, 400],
    [{ id: 9, url: 'https://localhost/x.jpg' }, {}, 400],
    [{ id: 9, url: 'https://qwrz.supabase.co/x.jpg' }, {}, 400],
    [{ id: 'x1', url: 'https://a.com/x.jpg' }, {}, 400],
  ]) { f = fake(opt); r = await F.handle(req(body), env, f); assert.equal(r.status, code, JSON.stringify(body)); assert.equal(f.saved.length, 0); }
  // another website's page cannot call it
  r = await F.handle(new Request('https://p.supabase.co/functions/v1/asker-store-img', { method: 'POST', headers: { origin: 'https://evil.example', authorization: 'Bearer jwt' }, body: '{}' }), env, fake());
  assert.equal(r.status, 403);
  assert.equal(F.kindOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0])), 'png');
  console.log('asker-store-img ok');
})().catch((e) => { console.error(e); process.exit(1); });
