// Function asker-adam (owner 2026-11-17, «آدم 2»): Adam's fast brain. Gemini picks one tool, the code reads the bot's tables and
// writes the Egyptian answer; anything that records or sends goes to the laptop (handoff). Fake Supabase and Gemini; made-up data.
const assert = require('node:assert/strict'), path = require('node:path'), { pathToFileURL } = require('node:url');
(async () => {
  const F = await import(pathToFileURL(path.join(__dirname, '..', 'supabase', 'functions', 'asker-adam', 'index.ts')).href);
  const KEY = 'a'.repeat(64), NOBODY = 'c'.repeat(64);
  const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', GEMINI_API_KEY: 'g' };
  const BAGS = { bags: { gs: [900], list: [
    { id: '2428', name: 'نواقص يوميه', items: [{ id: 501, name: 'ALFAZOL 40MG 14 TAB', have: 1, sold30: 33, need: 16 }, { id: 502, name: 'BETA SYRUP', have: 9, sold30: 30, need: 6 }] },
    { id: '2434', name: 'محمد احمد سرحان', items: [{ id: 503, name: 'TISSUE 700', have: 0, sold30: 34, need: 17 }] },
    { id: 'pv', name: 'نواقص كل الشركات', items: [] },
  ] } };
  // what Gemini answers: a function call, plain text, an error
  function fake({ gemini = { call: null, text: null, status: 200 }, thinking400 = false, rows = {} } = {}) {
    const calls = [];
    const f = async (url, o = {}) => {
      calls.push({ url, o });
      const u = new URL(url);
      if (u.pathname === '/rest/v1/rpc/ar_adam_role') return new Response(JSON.stringify(JSON.parse(o.body).p_key === KEY ? 'phone' : null));
      if (u.pathname === '/storage/v1/object/asker-private/alerts/alerts.json') { assert.equal(o.headers.Authorization, 'Bearer service'); return new Response(JSON.stringify(BAGS)); }
      if (u.pathname.startsWith('/rest/v1/')) {
        assert.equal(o.headers.Authorization, 'Bearer service', 'the bot is read with the service key');
        const t = u.pathname.slice(9);
        const r = rows[t] ? rows[t](u) : [];
        const h = { 'content-type': 'application/json' };
        if (o.headers.Prefer === 'count=exact') h['content-range'] = '0-' + (r.length - 1) + '/' + (rows[t + ':total'] || r.length);
        return new Response(JSON.stringify(r), { headers: h });
      }
      if (u.hostname === 'generativelanguage.googleapis.com') {
        const b = JSON.parse(o.body);
        if (thinking400 && b.generationConfig.thinkingConfig) return new Response('{"error":{"message":"thinking not supported"}}', { status: 400 });
        if (gemini.status !== 200) return new Response('{}', { status: gemini.status });
        const parts = gemini.call ? [{ functionCall: gemini.call }] : [{ text: gemini.text }];
        return new Response(JSON.stringify({ candidates: [{ content: { parts } }] }));
      }
      throw Error('unexpected ' + url);
    };
    f.calls = calls;
    return f;
  }
  const req = (body, key = KEY) => new Request('https://p.supabase.co/functions/v1/asker-adam', { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-adam-key': key } : {}) }, body: JSON.stringify(body) });
  const NOW = Date.UTC(2026, 10, 17, 10, 0, 0);   // the tests' «today»
  const ask = async (body, opts) => { const f = fake(opts); const r = await F.handle(req(body), env, f, NOW); return { r, j: await r.json(), f }; };
  const gem = (f) => f.calls.filter((c) => c.url.includes('generateContent'));

  // keys: only Adam's own devices
  let x = await ask({ text: 'سعر الفازول' }); assert.equal(x.r.status, 200);
  let r = await F.handle(req({ text: 'x' }, NOBODY), env, fake()); assert.equal(r.status, 401);
  r = await F.handle(req({ text: 'x' }, ''), env, fake()); assert.equal(r.status, 401);
  r = await F.handle(req({ text: '' }), env, fake()); assert.equal(r.status, 400);
  r = await F.handle(req({ text: 'ا'.repeat(401) }), env, fake()); assert.equal(r.status, 413);

  // «خلاص» ends the conversation at once, without Gemini
  x = await ask({ text: 'خلاص شكرا' });
  assert.equal(x.j.end, true); assert.equal(x.j.speak, 'تمام'); assert.equal(gem(x.f).length, 0);

  // item_info: price, stock, its bag, the last purchase; the strength he said comes first; the context remembers the item
  const stock = () => [
    { item_id: 777, name: 'ALFAZOL 20MG 14 TAB', arabic_name: 'الفازول ٢٠ مجم ١٤ قرص', price: 60, packs: 3, units: 0, parts: 14, exp_near: '2028-03-28' },
    { item_id: 501, name: 'ALFAZOL 40MG 14 TAB', arabic_name: 'الفازول ٤٠ مجم ١٤ قرص', price: 95.5, packs: 1, units: 7, parts: 14, exp_near: '2026-12-28' },
  ];
  x = await ask({ text: 'الفازول 40 عندنا كام', history: [{ who: 'me', text: 'آدم' }, { who: 'adam', text: 'أيوه' }] },
    { gemini: { call: { name: 'item_info', args: { name: 'الفازول 40' } }, status: 200 }, rows: { ar_stock: stock, ar_item_buys: () => [{ supplier: 'المخزن الأول', last_date: '2026-11-10', discount_pct: 24 }] } });
  assert.equal(x.j.tool, 'item_info');
  assert.match(x.j.speak, /^الفازول ٤٠ مجم: 95\.5 جنيه، عندنا 1\.5، وفيه منه صلاحيته قربت، شهر 12، وهو ناقص في حقيبة نواقص يوميه، بيتباع 33 في الشهر، آخر شرا من المخزن الأول يوم 10\/11 بخصم 24٪\./);
  // an expiry far away is not said (exp_near is the nearest expiry DATE, not a flag)
  assert.doesNotMatch((await ask({ text: 'الفازول 20' }, { gemini: { call: { name: 'item_info', args: { name: 'الفازول 20' } }, status: 200 }, rows: { ar_stock: stock } })).j.speak, /صلاحيته/);
  assert.deepEqual(x.j.ctx, { item: { id: 501, name: 'الفازول ٤٠ مجم' } });
  assert.deepEqual(x.j.open, { q: 'ALFAZOL 40MG 14 TAB' });
  const g0 = JSON.parse(gem(x.f)[0].o.body);
  assert.equal(g0.contents.length, 3, 'the conversation goes to Gemini');
  assert.equal(g0.contents[1].role, 'model');
  assert.equal(g0.generationConfig.thinkingConfig.thinkingBudget, 0, 'no thinking: fast');
  assert.ok(g0.tools[0].functionDeclarations.some((d) => d.name === 'laptop'));
  // the search is by Arabic name, letters written several ways match each other, numbers are left out of it
  const q = decodeURIComponent(x.f.calls.find((c) => c.url.includes('/rest/v1/ar_stock')).url);
  assert.match(q, /and=\(arabic_name\.ilike\.\*\*لف_ز_ل\*\)/, 'a vowel at the start may be missing');
  // the name as he says it is shorter than the written one («بنادول» / «بانادول»): only the consonants, in order
  x = await ask({ text: 'سعر بنادول اكسترا' }, { gemini: { call: { name: 'item_info', args: { name: 'بنادول اكسترا' } }, status: 200 },
    rows: { ar_stock: (u) => decodeURIComponent(u.search).includes('ب*ن*د*ل') ? [{ item_id: 68432, name: 'PANADOL EXTRA 48 TAB', arabic_name: 'بانادول اكسترا ٤٨ قرص', price: 116, packs: 64, units: 0, parts: 4 }] : [] } });
  assert.match(x.j.speak, /^بانادول اكسترا: 116 جنيه، عندنا 64\./, 'the pack size is not said');
  assert.deepEqual(F.skeleton('بنادول اكسترا'), ['ب*ن*د*ل', 'ك*س*ت*ر']);
  assert.deepEqual(F.words('وبيديا شور'), ['*ب_د*', 'ش_ر'], 'the «و» of «and» in front of a name does not stop the search');
  // no strength said: the one that sells most comes first (the tablets, not the vial); the warehouse code is said by its name
  x = await ask({ text: 'زوركال عندنا كام' }, { gemini: { call: { name: 'item_info', args: { name: 'زوركال' } }, status: 200 },
    rows: { ar_stock: () => [{ item_id: 63228, name: 'ZURCAL VIAL', arabic_name: 'زوركال فيال', price: 84, packs: 20, units: 0, parts: 1 }, { item_id: 62386, name: 'ZURCAL 40MG 14 TAB', arabic_name: 'زوركال ٤٠ مجم ١٤ قرص', price: 120, packs: 1, units: 0, parts: 14 }],
      ar_store_items: () => [{ id: 62386, popular_rank: 12 }, { id: 63228, popular_rank: 51 }], ar_item_buys: () => [{ supplier: 'ELFATH', last_date: '2026-09-23', discount_pct: 0 }] } });
  assert.match(x.j.speak, /^زوركال ٤٠ مجم: 120 جنيه، عندنا 1، آخر شرا من الفتح يوم 23\/9\./);
  // not in stock: the store list says so
  x = await ask({ text: 'سعر الفازول' }, { gemini: { call: { name: 'item_info', args: { name: 'الفازول' } }, status: 200 }, rows: { ar_store_items: () => [{ id: 9, name: 'ALFAZOL SYRUP', arabic_name: 'الفازول شراب', price: 40 }] } });
  assert.match(x.j.speak, /^الفازول شراب: 40 جنيه، مش موجود عندنا دلوقتي\./);
  x = await ask({ text: 'سعر زفت' }, { gemini: { call: { name: 'item_info', args: { name: 'زفت' } }, status: 200 } });
  assert.equal(x.j.speak, 'مش لاقي صنف بالاسم ده');

  // shortages: the general list (count from the server) and a bag; «اقرالي» = a walk read item by item
  x = await ask({ text: 'النواقص العامة فيها كام' }, { gemini: { call: { name: 'shortages', args: { which: 'general' } }, status: 200 },
    rows: { ar_shortages: () => [{ product_name: 'AAA 20 TAB', name_key: 'aaa', suggested_qty: 8 }, { product_name: 'BBB CREAM', name_key: 'bbb', suggested_qty: 6 }], 'ar_shortages:total': 499, ar_names: () => [{ name_key: 'aaa', arabic_name: 'أأأ ٢٠ قرص' }] } });
  assert.equal(x.j.speak, 'النواقص العامة فيها 499 صنف. أكتر المطلوب: أأأ، BBB CREAM. أقرالك الباقي؟');
  assert.deepEqual(x.j.do_now, [{ type: 'open_tab', tab: 'short' }]);
  x = await ask({ text: 'اقرالي حقيبة النواقص اليومية' }, { gemini: { call: { name: 'shortages', args: { which: 'bag', bag: 'النواقص اليومية', read_aloud: true } }, status: 200 }, rows: { ar_stock: () => [{ item_id: 501, arabic_name: 'الفازول ٤٠ مجم ١٤ قرص' }] } });
  assert.equal(x.j.walk.mode, 'read');
  assert.equal(x.j.walk.items[0].say, 'الفازول ٤٠ مجم، عندنا 1، والمتوسط 33');
  assert.equal(x.j.walk.items[1].say, 'BETA SYRUP، عندنا 9، والمتوسط 30');
  x = await ask({ text: 'حقيبة سرحان' }, { gemini: { call: { name: 'shortages', args: { which: 'bag', bag: 'سرحان' } }, status: 200 } });
  assert.match(x.j.speak, /^حقيبة محمد احمد سرحان فيها 1 صنف/);
  assert.equal(F.findBag([{ id: '2428', name: 'نواقص يوميه', items: [] }], 'الحقيبة اليومية').id, '2428');

  // balances: one match, several matches, none
  const vend = (n) => () => n === 1 ? [{ id: 12, name: 'مخزن الأول', short: 'الاول', balance: 96422.75, last_payment: 5000, last_payment_at: '2026-11-12T10:00:00Z' }] : n === 2 ? [{ id: 1, name: 'أ' }, { id: 2, name: 'ب' }] : [];
  x = await ask({ text: 'رصيد الأول' }, { gemini: { call: { name: 'balance', args: { party: 'vendor', name: 'الأول' } }, status: 200 }, rows: { ar_vendors: vend(1) } });
  assert.equal(x.j.speak, 'مخزن الأول: علينا له 96 423 جنيه، وآخر دفعة 5 000 يوم 12/11. أفتحلك حسابه؟');
  assert.deepEqual(x.j.open, { vendor: 12 });
  x = await ask({ text: 'رصيد احمد' }, { gemini: { call: { name: 'balance', args: { party: 'customer', name: 'احمد' } }, status: 200 }, rows: { ar_customers: () => [{ id: 3, name: 'أحمد علي', balance: -20 }] } });
  assert.equal(x.j.speak, 'أحمد علي: ليه عندنا 20 جنيه. أفتحلك حسابه؟');
  x = await ask({ text: 'رصيد محمد' }, { gemini: { call: { name: 'balance', args: { party: 'vendor', name: 'محمد' } }, status: 200 }, rows: { ar_vendors: vend(2) } });
  assert.match(x.j.speak, /^فيه 2 موردين بالاسم ده: أ، ب\. تقصد مين؟$/);

  // sales: summed by kind, returns taken off
  x = await ask({ text: 'مبيعات النهارده' }, { gemini: { call: { name: 'sales', args: { period: 'today' } }, status: 200 }, rows: { ar_sales: () => [{ kind: 'sale', total: 1000 }, { kind: 'sale', total: 500 }, { kind: 'return', total: 100 }] } });
  assert.equal(x.j.speak, 'مبيعات النهارده: 1 400 جنيه في 3 فاتورة، والمرتجع 100.');
  // warehouses: the main one wins over a small one with the same word; an English-named one by its Arabic name, both accounts
  x = await ask({ text: 'رصيد الفتح' }, { gemini: { call: { name: 'balance', args: { party: 'vendor', name: 'الفتح' } }, status: 200 },
    rows: { ar_vendors: () => [{ id: 2540, name: 'مخزن الفتح للادوية', balance: 1000, invoices: 900 }, { id: 9, name: 'مخزن دار الفتح اكسسوار', balance: 5, invoices: 3 }] } });
  assert.equal(x.j.speak, 'مخزن الفتح للادوية: علينا له 1 000 جنيه. أفتحلك حسابه؟');
  x = await ask({ text: 'وابن سينا' }, { gemini: { call: { name: 'balance', args: { party: 'vendor', name: 'ابن سينا' } }, status: 200 },
    rows: { ar_vendors: (u) => decodeURIComponent(u.search).includes('IBN SINA') ? [{ id: 188, name: 'IBN SINA 2', balance: 200, invoices: 50 }, { id: 2495, name: 'IBN SINA 1', balance: 0, invoices: 40 }] : [] } });
  assert.equal(x.j.speak, 'IBN SINA 2: علينا له 200 جنيه. IBN SINA 1: حسابه خالص.');
  // «اقرالي أهمهم» right after a bag: that bag, even when Gemini did not name it
  x = await ask({ text: 'اقرالي أهمهم', ctx: { list: 'bag', bag: '2434' } }, { gemini: { call: { name: 'shortages', args: { which: 'general', read_aloud: true } }, status: 200 } });
  assert.equal(x.j.walk.items[0].say, 'TISSUE 700، عندنا 0، والمتوسط 34');
  // «افتح + a page» opens at once, without Gemini; anything longer is not taken for a page
  assert.equal(F.pageOf('افتح الطلبيات'), 'drafts'); assert.equal(F.pageOf('افتحلي طلبات الموقع'), 'storeorders');
  assert.equal(F.pageOf('افتح حقيبة النواقص اليومية'), null); assert.equal(F.pageOf('الطلبيات'), null);
  assert.equal(F.cairoMidnight(Date.UTC(2026, 10, 17, 1, 0, 0)), '2026-11-16T22:00:00.000Z', 'Cairo is UTC+2 in November');

  // pages, small talk, the laptop, Gemini down, a model without the «no thinking» switch
  x = await ask({ text: 'افتح الطلبيات' }, { gemini: { call: { name: 'open_page', args: { page: 'drafts' } }, status: 200 } });
  assert.deepEqual(x.j.do_now, [{ type: 'open_tab', tab: 'drafts' }]); assert.equal(x.j.speak, 'فتحتلك الطلبيات');
  assert.equal(gem(x.f).length, 0, '«افتح الطلبيات» needs no Gemini');
  x = await ask({ text: 'ازيك' }, { gemini: { text: 'تمام الحمد لله، أؤمرني' , status: 200 } });
  assert.equal(x.j.speak, 'تمام الحمد لله، أؤمرني'); assert.equal(x.j.tool, 'chat');
  x = await ask({ text: 'سجل دفعة 500 للفتح' }, { gemini: { call: { name: 'laptop', args: {} }, status: 200 } });
  assert.equal(x.j.handoff, true, 'anything that records goes to the laptop (the spoken-yes gate is there)');
  x = await ask({ text: 'سعر الفازول' }, { gemini: { status: 503 } });
  assert.equal(x.j.handoff, true, 'Gemini down: the laptop answers');
  x = await ask({ text: 'عايز اشوف الطلبيات' }, { gemini: { call: { name: 'open_page', args: { page: 'drafts' } }, status: 200 }, thinking400: true });
  assert.equal(x.j.tool, 'open_page'); assert.equal(gem(x.f).length, 2);

  // the Arabic helpers
  assert.equal(F.norm('أحمد  إبراهيم يوميّة مستشفى'), 'احمد ابراهيم يوميه مستشفي');
  assert.deepEqual(F.words('سعر زوركال 40'), ['ز_رك_ل']);
  console.log('PASS: asker-adam: the fast brain answers from the bot, ends on «خلاص», hands anything that records to the laptop');
})().catch((e) => { console.error(e); process.exit(1); });
