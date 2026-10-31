// RED regression tests for unsafe attribution of photos from WhatsApp Business's shared media folder.
// These deliberately fail against the 31 Oct 2026 implementation until provenance is verified.
// Synthetic fixtures only: no actual phone, WhatsApp, Gemini, Storage, or production Supabase calls.
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');

(async () => {
  const F = await import(path.join(__dirname, '..', 'supabase', 'functions', 'arabic-shortages', 'index.ts'));
  const ENV = {
    SUPABASE_URL: 'https://test.invalid', SUPABASE_ANON_KEY: 'anon-fixture',
    SUPABASE_SERVICE_ROLE_KEY: 'service-fixture', GEMINI_API_KEY: 'gemini-fixture',
    INBOX_CLAIM_WAIT_MS: '1',
  };
  const KEY = 'a'.repeat(64);
  const KEY_HASH = crypto.createHash('sha256').update(KEY).digest('hex');
  const COMPANY_A = 'مورد الاختبار الأول', COMPANY_B = 'مورد الاختبار الثاني';
  const SHORTAGE = { id: 's1', product_name: 'BRUFEN 400MG 30TAB' };
  const AR_NAME = { name_key: SHORTAGE.product_name, arabic_name: 'بروفين ٤٠٠ مجم ٣٠ قرص', status: 'approved' };
  const FIXTURE_READ = { supplier: '', rows: [{ name: 'بروفين ٤٠٠ مجم ٣٠ قرص', english: 'BRUFEN 400MG 30TAB', unclear: false }] };

  function fakeServices() {
    const media = [], inbox = [], calls = [];
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
    // restAll() paginates via offset=0; later pages are empty.
    const page = (url, data) => json(/(?:[?&])offset=0(?:&|$)/.test(url) ? data : []);
    const eq = (url, field) => decodeURIComponent((url.match(new RegExp(field + '=eq\\.([^&]+)')) || [])[1] || '');
    async function fetchFake(url, options = {}) {
      calls.push({ url, method: options.method || 'GET' });
      if (url.includes('/rest/v1/ar_inbox_keys')) return page(url, url.includes(KEY_HASH) ? [{ key_hash: KEY_HASH }] : []);
      if (url.includes('/rest/v1/ar_suppliers')) return page(url, [
        { name: COMPANY_A, phone: null }, { name: COMPANY_B, phone: null },
      ]);
      if (url.includes('/rest/v1/ar_inbox_media')) {
        if (options.method === 'POST') {
          media.push({ ...JSON.parse(options.body), at: new Date().toISOString(), done: false });
          return json([], 201);
        }
        if (options.method === 'DELETE') return json([], 200);
        if (options.method === 'PATCH') {
          const found = media.filter(m => m.supplier === eq(url, 'supplier') && !m.done &&
            (!url.includes('fresh=is.true') || m.fresh === true));
          found.forEach(m => { m.done = true; });
          return json(found);
        }
        if (url.includes('select=note')) return json(media.filter(m =>
          m.supplier === eq(url, 'supplier') && m.chat === eq(url, 'chat')).slice(-1).map(m => ({ note: m.note })));
        if (url.includes('select=at&')) return json(media.filter(m =>
          m.supplier === eq(url, 'supplier') && m.chat === eq(url, 'chat') && m.fresh).slice(-1).map(m => ({ at: m.at })));
        return page(url, media.map(m => ({ supplier: m.supplier, fresh: m.fresh })));
      }
      if (url.includes('/rest/v1/ar_inbox?select=id,received_at&file_path=like.')) return page(url, []);
      if (url.includes('/rest/v1/ar_inbox?select=rows,review')) return page(url,
        inbox.filter(x => !x.maybe && x.status !== 'error').map(x => ({ rows: x.rows, review: x.review })));
      if (url.includes('/rest/v1/ar_inbox') && options.method === 'POST') {
        const row = JSON.parse(options.body);
        inbox.push(row);
        return json([{ id: 'i' + inbox.length, received_at: new Date().toISOString() }], 201);
      }
      if (url.includes('/rest/v1/ar_shortages')) return page(url, [SHORTAGE]);
      if (url.includes('/rest/v1/ar_names')) return page(url, [AR_NAME]);
      if (url.includes('/rest/v1/ar_orders') || url.includes('/rest/v1/ar_answers') ||
          url.includes('/rest/v1/ar_fixes') || url.includes('/rest/v1/ar_ignored')) return page(url, []);
      if (url.includes('/storage/v1/object/ar-inbox/')) return json({});
      if (url.startsWith('https://generativelanguage.googleapis.com/')) return json({
        candidates: [{ content: { parts: [{ text: JSON.stringify(FIXTURE_READ) }] } }],
      });
      throw Error('Unexpected mocked request: ' + url.split('?')[0]);
    }
    return { media, inbox, calls, fetchFake };
  }
  function post(from, body, contentType) {
    return new Request('https://test.invalid/functions/v1/arabic-shortages?from=' + encodeURIComponent(from), {
      method: 'POST', headers: { 'x-inbox-key': KEY, 'content-type': contentType }, body,
    });
  }
  const photo = (lastByte) => new Uint8Array([0xff, 0xd8, 0xff, lastByte]);
  async function notify(mock, company) {
    const req = post(company + ' ~w' + Date.now(), '📷 صورة', 'text/plain');
    const res = await F.handle(req, ENV, mock.fetchFake);
    assert.equal(res.status, 202, 'new supplier media notification should request photo scan');
  }
  async function upload(mock, company, marker) {
    const res = await F.handle(post(company, photo(marker), 'image/jpeg'), ENV, mock.fetchFake);
    assert.equal(res.status, 200);
    assert.equal(mock.inbox.length, 1, 'the image should be retained for review');
    assert.equal(mock.inbox[0].sure, 1, 'the content happens to contain a shortage match');
    return mock.inbox[0];
  }
  function verifiedFor(row, company) {
    // The present bot counts a named supplier's photo as verified whenever maybe is null.
    return row.supplier === company && row.maybe == null;
  }

  const failures = [];
  async function check(label, test) {
    try { await test(); console.log('PASS: ' + label); }
    catch (e) { failures.push(label); console.error('FAIL: ' + label + '\n' + (e.stack || e)); }
  }

  await check('CONTROL: competing fresh supplier notifications keep attribution ambiguous', async () => {
    const mock = fakeServices();
    await notify(mock, COMPANY_A);
    await notify(mock, COMPANY_B);
    const row = await upload(mock, COMPANY_A, 21);
    assert.deepEqual(row.maybe, [COMPANY_A, COMPANY_B].sort());
    assert.equal(verifiedFor(row, COMPANY_A), false);
  });

  await check('RED: customer photo in shared folder must not be verified as the sole notifying supplier', async () => {
    const mock = fakeServices();
    await notify(mock, COMPANY_A);
    // Tasker scans the shared WhatsApp Business Images folder. The actual sender is a CUSTOMER,
    // but the request has the supplier's "from" because that notification triggered the scan.
    // The upload contains NO trustworthy chat ID identifying the image's original sender.
    const row = await upload(mock, COMPANY_A, 22);
    assert.equal(verifiedFor(row, COMPANY_A), false,
      'Unsafe: a shared-folder customer photo was counted as a verified supplier photo');
  });

  await check('RED: image without a source notification must remain unverified', async () => {
    const mock = fakeServices();
    // A delayed/replayed folder scan uploads a photo; no supplier media notification exists.
    const row = await upload(mock, COMPANY_A, 23);
    assert.equal(verifiedFor(row, COMPANY_A), false,
      'Unsafe: the "from" query string alone was treated as proof of photo ownership');
  });

  if (failures.length) {
    console.error('\n' + failures.length + ' expected safety regression(s) found. No production data or code changed.');
    process.exitCode = 1;
  } else console.log('PASS: no unsafe automatic attribution found in these fixtures');
})().catch(e => { console.error(e); process.exitCode = 1; });
