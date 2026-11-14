// «الرسايل», part 2 (owner 2026-11-14 «خليه يرد على كل حاجة … لو ما عجبتنيش الرسالة هعدلها او همسحها»): asker-chat «draft» writes
// the pharmacy's answer from our facts only (store items and stock, the account, the orders; a prescription photo is seen),
// keeps it for the pharmacy (ابعت / عدّل / سيبه), and sends it alone only for a kind the owner turned on. Fake Supabase and
// Gemini; made-up customers only.
const assert = require('node:assert/strict'), path = require('node:path'), { pathToFileURL } = require('node:url');
(async () => {
  const dir = path.join(__dirname, '..', 'supabase', 'functions', 'asker-chat');
  const D = await import(pathToFileURL(path.join(dir, 'draft.ts')).href), F = await import(pathToFileURL(path.join(dir, 'index.ts')).href);
  // the helpers
  assert.deepEqual(D.searchTerms('Panadol Cold & Flu 24 tab'), ['Panadol', 'Cold', 'Flu', '24', 'tab']);
  assert.deepEqual(D.searchTerms('بانادول إكسترا'), ['بانادول', 'اكسترا']);
  const p = decodeURIComponent(D.itemsPath(['Panadol', 'بانادول']));
  assert.match(p, /and=\(or\(name\.ilike\.\*Panadol\*,arabic_name\.ilike\.\*Panadol\*\),or\(name\.ilike\.\*ب_ن_دول\*,arabic_name\.ilike\.\*ب_ن_دول\*\)\)/, 'every ا may be أ or إ, like the store');
  assert.match(p, /hidden=is\.false/); assert.match(p, /order=status\.asc,popular_rank\.asc\.nullslast/);
  assert.equal(D.itemFact({ id: 1, name: 'PANADOL COLD & FLU', arabic_name: 'بانادول كولد', status: 'available', price: 59 }, { item_id: 1, packs: 12 }), 'PANADOL COLD & FLU (بانادول كولد): متوفر · 59 ج · 12 علبة');
  assert.equal(D.itemFact({ id: 2, name: 'X', status: 'unavailable', price: 10 }), 'X: مش متوفر', 'no price for what is not there');
  // a box sold in strips (owner 2026-11-14 «عاوز شريط بنادول اكسترا … بيقوله بالعلبه رغم ان الصنف متوفر وحدات»)
  assert.equal(D.itemFact({ id: 68432, name: 'PANADOL EXTRA 48 TAB', status: 'available', price: 116 }, { item_id: 68432, packs: 64, units: 1, parts: 4, price: 116 }),
    'PANADOL EXTRA 48 TAB: متوفر · العلبة 116 ج (فيها 4) · الشريط 29 ج · 64 علبة');
  assert.equal(D.partWord('AUGMENTIN 1GM 14 F.C.T'), 'الشريط');assert.equal(D.partWord('VOLTAREN 75MG 6 AMP'), 'الأمبول');
  assert.equal(D.partWord('SMECTA 30 SACHETS'), 'الكيس');assert.equal(D.partWord('BABY SHAMPOO'), 'الوحدة');
  assert.match(D.REPLY_PROMPT, /مش ناشف/);assert.match(D.REPLY_PROMPT, /سعر الشريط أو الوحدة من facts، مش سعر العلبة/);
  assert.equal(D.itemFact({ id: 3, name: 'Y', status: 'on_order', price: null }, { item_id: 3, price: 33 }), 'Y: بالطلب · 33 ج');
  assert.equal(D.accountFact(7174.5, false), 'حسابه: عليه 7,174.5 ج');
  assert.equal(D.accountFact(-200, true), 'حسابه: له 200 ج · الآجل موقوف');
  assert.equal(D.accountFact(0.2, false), 'حسابه: خالص');
  assert.equal(D.orderFact({ id: 77, status: 'confirmed', total: 150, created_at: '2026-11-14T10:00:00Z' }), 'طلب رقم 77: اتأكد · 150 ج · 2026-11-14');
  assert.equal(D.talkText([{ id: 1, sender: 'pharmacy', kind: 'text', body: 'أهلا' }, { id: 2, sender: 'customer', kind: 'voice', body: 'عايز بانادول' }, { id: 3, sender: 'customer', kind: 'photo' }], 2),
    'الصيدلية: أهلا\nالعميل (مستنية رد): [فويس] عايز بانادول\nالعميل (مستنية رد): [صورة]');

  // the action, end to end
  const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', GEMINI_API_KEY: 'g' };
  const SECRET = 'a'.repeat(64), CHAT = '11111111-2222-4333-8444-555555555555';
  function fake({ msgs, auto = [], have = false, customer = 101 }) {
    const gem = [], drafts = [], sent = [], patched = [];
    const f = async (url, o = {}) => {
      const u = new URL(url), q = decodeURIComponent(u.search);
      if (u.hostname === 'generativelanguage.googleapis.com') {
        const b = JSON.parse(o.body); gem.push(b);
        const prompt = b.contents[0].parts[0].text;
        const text = prompt.startsWith(D.EXTRACT_PROMPT) ? { kind: 'availability', summary: 'عايز بانادول كولد', items: [{ name: 'بانادول كولد', english: 'PANADOL COLD', qty: 1 }] } : { body: 'أيوه متوفر بـ 59 ج، تحب نجهزهولك؟' };
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(text) }] } }] }));
      }
      if (u.pathname === '/rest/v1/ar_chats' && !o.method) return new Response(JSON.stringify(q.includes('secret=eq.' + SECRET) ? [{ id: CHAT, customer_id: customer, name: 'أحمد', phone: '01012345678', supplier: null }] : []));
      if (u.pathname === '/rest/v1/ar_chat_messages' && !o.method) return new Response(JSON.stringify([...msgs].reverse()));
      if (u.pathname === '/rest/v1/ar_chat_messages' && o.method === 'POST') { sent.push(JSON.parse(o.body)); return new Response(null, { status: 201 }); }
      if (u.pathname === '/rest/v1/ar_chat_drafts' && !o.method) return new Response(JSON.stringify(have ? [{ id: 5 }] : []));
      if (u.pathname === '/rest/v1/ar_chat_drafts' && o.method === 'PATCH') { patched.push(q); return new Response(null, { status: 204 }); }
      if (u.pathname === '/rest/v1/ar_chat_drafts' && o.method === 'POST') { const r = JSON.parse(o.body); drafts.push(r); return new Response(JSON.stringify([{ id: 9 }]), { status: 201 }); }
      if (u.pathname === '/rest/v1/ar_store_items') { assert.match(q, /PANADOL/); return new Response(JSON.stringify([{ id: 1, name: 'PANADOL COLD & FLU', arabic_name: 'بانادول كولد', status: 'available', price: 59 }])); }
      if (u.pathname === '/rest/v1/ar_stock') return new Response(JSON.stringify([{ item_id: 1, packs: 12, price: 59 }]));
      if (u.pathname === '/rest/v1/ar_customers') return new Response(JSON.stringify([{ balance: 7174.5 }]));
      if (u.pathname === '/rest/v1/ar_customer_stops') return new Response('[]');
      if (u.pathname === '/rest/v1/ar_store_orders') { assert.match(q, customer ? /customer_id=eq\.101/ : /phone=eq\.01012345678/); return new Response(JSON.stringify([{ id: 77, status: 'new', total: 66.7, created_at: '2026-11-13T20:00:00Z' }])); }
      if (u.pathname === '/rest/v1/ar_chat_settings') return new Response(JSON.stringify([{ auto_kinds: auto }]));
      if (u.pathname === '/rest/v1/ar_chats' && o.method === 'PATCH') return new Response(null, { status: 204 });
      if (u.pathname === '/rest/v1/ar_chat_push') return new Response('[]');
      throw Error('unexpected ' + url);
    };
    Object.assign(f, { gem, drafts, sent, patched });
    return f;
  }
  const req = (body) => new Request('https://p.supabase.co/functions/v1/asker-chat', { method: 'POST', headers: { origin: 'https://taherasker2560-dot.github.io', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const now = new Date().toISOString();
  const msgs = [{ id: 10, at: now, sender: 'pharmacy', kind: 'text', body: 'أهلا بيك' }, { id: 11, at: now, sender: 'customer', kind: 'text', body: 'عندكم بانادول كولد؟' }];
  let f = fake({ msgs }), r = await F.handle(req({ action: 'draft', secret: SECRET }), env, f), b = await r.json();
  assert.deepEqual(b, { ok: true, id: 9, kind: 'availability', auto: false });
  assert.equal(f.drafts.length, 1);
  const d = f.drafts[0];
  assert.deepEqual([d.chat_id, d.for_msg, d.kind, d.body, d.status], [CHAT, 11, 'availability', 'أيوه متوفر بـ 59 ج، تحب نجهزهولك؟', 'ready']);
  assert.deepEqual(d.facts, ['PANADOL COLD & FLU (بانادول كولد): متوفر · 59 ج · 12 علبة', 'حسابه: عليه 7,174.5 ج', 'طلب رقم 77: وصل الصيدلية · 66.7 ج · 2026-11-13']);
  assert.equal(f.sent.length, 0, 'the trial: nothing goes alone');
  assert.match(f.patched[0], /chat_id=eq\..*status=eq\.ready/, 'the older waiting suggestion becomes old');
  // the second Gemini call is given the facts and the rules, the first one the talk with the waiting messages marked
  assert.match(f.gem[0].contents[0].parts[0].text, /العميل \(مستنية رد\): عندكم بانادول كولد؟/);
  assert.match(f.gem[1].contents[0].parts[0].text, /facts:\nPANADOL COLD & FLU/);
  assert.match(f.gem[1].contents[0].parts[0].text, /ما تألفش سعر/);
  // a kind the owner turned on goes at once as the pharmacy's answer
  f = fake({ msgs, auto: ['availability'] }); b = await (await F.handle(req({ action: 'draft', secret: SECRET }), env, f)).json();
  assert.equal(b.auto, true); assert.equal(f.drafts[0].status, 'auto');
  assert.deepEqual(f.sent, [{ chat_id: CHAT, sender: 'pharmacy', kind: 'text', body: 'أيوه متوفر بـ 59 ج، تحب نجهزهولك؟' }]);
  // nothing to answer: the pharmacy answered last; a voice note still without words; already written
  f = fake({ msgs: [...msgs, { id: 12, at: now, sender: 'pharmacy', kind: 'text', body: 'تمام' }] });
  assert.deepEqual(await (await F.handle(req({ action: 'draft', secret: SECRET }), env, f)).json(), { ok: true, skipped: 'answered' }); assert.equal(f.gem.length, 0);
  f = fake({ msgs: [...msgs, { id: 13, at: now, sender: 'customer', kind: 'voice', body: null }] });
  assert.equal((await (await F.handle(req({ action: 'draft', secret: SECRET }), env, f)).json()).skipped, 'words');
  f = fake({ msgs, have: true });
  assert.equal((await (await F.handle(req({ action: 'draft', secret: SECRET }), env, f)).json()).skipped, 'done');
  // a cash customer asking about his account: told he has none (no made-up balance)
  f = fake({ msgs, customer: null }); await F.handle(req({ action: 'draft', secret: SECRET }), env, f);
  assert.ok(!f.drafts[0].facts.some((x) => /حسابه/.test(x)));
  // a wrong secret
  assert.equal((await F.handle(req({ action: 'draft', secret: 'b'.repeat(64) }), env, fake({ msgs }))).status, 404);
  console.log('PASS: chat draft: the answer from our facts only (items + stock, account, orders), kept for ابعت/عدّل/سيبه, alone only for a kind turned on');
})().catch((e) => { console.error(e); process.exit(1); });
