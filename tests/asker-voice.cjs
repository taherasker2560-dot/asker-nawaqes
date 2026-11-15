// Function asker-voice (owner 2026-11-15, «صوت طبيعي»): text -> a WAV by Gemini's speech model, only for Adam's own device keys.
// Fake Supabase and Gemini; nothing real is called. Made-up words only.
const assert = require('node:assert/strict'), path = require('node:path'), { pathToFileURL } = require('node:url');
(async () => {
  const F = await import(pathToFileURL(path.join(__dirname, '..', 'supabase', 'functions', 'asker-voice', 'index.ts')).href);
  const KEY = 'a'.repeat(64), LAPTOP = 'b'.repeat(64), NOBODY = 'c'.repeat(64);
  const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', GEMINI_API_KEY: 'g' };
  const pcm = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);   // 4 samples
  const asked_models = [];
  function fake({ gemini = 'ok' } = {}) {
    const calls = [];
    const f = async (url, o = {}) => {
      calls.push({ url, o });
      const u = new URL(url);
      if (u.pathname === '/rest/v1/rpc/ar_adam_role') {
        const k = JSON.parse(o.body).p_key;
        assert.equal(o.headers.Authorization, 'Bearer service', 'the role is asked with the service key');
        return new Response(JSON.stringify(k === KEY ? 'phone' : k === LAPTOP ? 'laptop' : null));
      }
      if (u.pathname === '/v1beta/models') return new Response(JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash' }, { name: 'models/gemini-2.5-flash-preview-tts' }, { name: 'models/gemini-2.5-pro-preview-tts' }] }));
      if (u.hostname === 'generativelanguage.googleapis.com' && u.pathname.endsWith(':streamGenerateContent')) {
        assert.equal(u.searchParams.get('alt'), 'sse');
        if (gemini === 'busy') return new Response('{"error":{"message":"quota"}}', { status: 429 });
        // two audio events (4 + 4 bytes), a line that is not audio, and CRLF line ends, as Gemini sends them
        const ev = (b) => 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: b.toString('base64') } }] } }] }) + '\r\n\r\n';
        const enc = new TextEncoder();
        return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(ev(pcm.subarray(0, 4)))); c.enqueue(enc.encode('data: {"usageMetadata":{}}\r\n\r\n' + ev(pcm.subarray(4)).slice(0, 20))); c.enqueue(enc.encode(ev(pcm.subarray(4)).slice(20))); c.close(); } }));
      }
      if (u.hostname === 'generativelanguage.googleapis.com' && u.pathname.endsWith(':generateContent')) {
        const asked = /models\/([^:]+):/.exec(u.pathname)[1];
        asked_models.push(asked);
        if (gemini === 'busy') return new Response('{"error":{"message":"quota per minute"}}', { status: 429 });
        // the asked-for model and the first fallback are out of quota, the next one answers
        if (gemini === 'two-out' && (asked === 'gemini-2.5-flash-preview-tts' || asked === 'gemini-3.8-flash-lite-tts')) return new Response('{"error":{"message":"daily"}}', { status: 429 });
        if (gemini === 'server-error' && asked === 'gemini-2.5-flash-preview-tts') return new Response('oops', { status: 503 });
        if (gemini === 'empty') return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'no audio' }] } }] }));
        if (gemini === 'down') throw new Error('network');
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } }] } }] }));
      }
      throw Error('unexpected ' + url);
    };
    f.calls = calls;
    return f;
  }
  const req = (body, key = KEY, method = 'POST') => new Request('https://p.supabase.co/functions/v1/asker-voice', { method, headers: { 'content-type': 'application/json', ...(key ? { 'x-adam-key': key } : {}) }, body: method === 'POST' ? JSON.stringify(body) : undefined });
  const gem = (f) => f.calls.filter((c) => c.url.includes('generateContent'));

  // the phone asks: a WAV comes back, the request to Gemini carries the voice, the style and the words
  let f = fake();
  let r = await F.handle(req({ text: 'بنادول إكسترا 48: 116 جنيه، 64 علبة.' }), env, f);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'audio/wav');
  const w = Buffer.from(await r.arrayBuffer());
  assert.equal(w.toString('ascii', 0, 4), 'RIFF'); assert.equal(w.toString('ascii', 8, 12), 'WAVE'); assert.equal(w.toString('ascii', 36, 40), 'data');
  assert.equal(w.readUInt32LE(24), 24000, 'sample rate'); assert.equal(w.readUInt16LE(22), 1, 'mono'); assert.equal(w.readUInt16LE(34), 16, '16 bit');
  assert.equal(w.readUInt32LE(40), pcm.length); assert.equal(w.readUInt32LE(4), 36 + pcm.length);
  assert.deepEqual([...w.subarray(44)], [...pcm]);
  const gb = JSON.parse(gem(f)[0].o.body);
  assert.equal(gb.generationConfig.responseModalities[0], 'AUDIO');
  assert.equal(gb.generationConfig.temperature, 0.4, 'low freedom: the same voice every sentence');
  assert.equal(gb.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Charon');
  // no English instruction in front of the words (the owner heard it spoken): the text goes to the voice as it is
  assert.equal(F.DEFAULT_STYLE, '');
  assert.equal(gb.contents[0].parts[0].text, 'بنادول إكسترا 48: 116 جنيه، 64 علبة.');
  assert.equal(gem(f)[0].o.headers['x-goog-api-key'], 'g');
  assert.match(gem(f)[0].url, /models\/gemini-2\.5-flash-preview-tts:generateContent/);

  // the laptop too; another voice, another model, no style
  f = fake();
  r = await F.handle(req({ text: 'تمام', voice: 'Orus', model: 'gemini-2.5-pro-preview-tts', style: '' }, LAPTOP), env, f);
  assert.equal(r.status, 200);
  assert.match(gem(f)[0].url, /gemini-2\.5-pro-preview-tts:generateContent/);
  const g2 = JSON.parse(gem(f)[0].o.body);
  assert.equal(g2.contents[0].parts[0].text, 'تمام'); assert.equal(g2.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Orus');
  assert.equal(r.headers.get('x-voice-voice'), 'Orus');

  // nobody without Adam's key gets a voice, and Gemini is never called for them
  for (const [key, status] of [[null, 401], ['short', 401], [NOBODY, 401]]) {
    f = fake();
    r = await F.handle(req({ text: 'x' }, key), env, f);
    assert.equal(r.status, status, String(key));
    assert.equal(gem(f).length, 0, 'no Gemini call for ' + key);
  }
  assert.equal((await F.handle(req(null, KEY, 'GET'), env, fake())).status, 405);
  assert.equal((await F.handle(req({ text: 'x' }), { ...env, GEMINI_API_KEY: '' }, fake())).status, 503);

  // odd input is refused
  const bad = [[{ text: '' }, 400], [{ text: 123 }, 400], [{}, 400], [{ text: 'x'.repeat(F.MAX_TEXT + 1) }, 413], [{ text: 'x', voice: 'Cha ron' }, 400], [{ text: 'x', voice: '../x' }, 400],
    [{ text: 'x', model: 'gemini-2.5-flash' }, 400], [{ text: 'x', model: 'evil/../tts' }, 400]];
  for (const [b, status] of bad) { f = fake(); r = await F.handle(req(b), env, f); assert.equal(r.status, status, JSON.stringify(b).slice(0, 60)); assert.equal(gem(f).length, 0); }
  // control characters are cleaned, not sent
  f = fake();
  await F.handle(req({ text: 'سطر\u0000 أول\nسطر تاني', style: 'a\u0007b' }), env, f);
  assert.equal(JSON.parse(gem(f)[0].o.body).contents[0].parts[0].text, 'a b' + 'سطر أول سطر تاني');

  // Gemini's answers
  for (const [mode, status] of [['busy', 429], ['empty', 502], ['down', 504]]) { r = await F.handle(req({ text: 'x' }), env, fake({ gemini: mode })); assert.equal(r.status, status, mode); }
  r = await F.handle(req({ text: 'x' }), env, fake({ gemini: 'busy' }));
  assert.match((await r.json()).detail, /quota per minute/, 'the 429 says why');

  // a model out of quota (429) or down (5xx): the next one answers, the header says which; all out: the 429 with its message
  asked_models.length = 0;
  r = await F.handle(req({ text: 'x' }), env, fake({ gemini: 'two-out' }));
  assert.equal(r.status, 200); assert.equal(r.headers.get('x-voice-model'), 'gemini-3.8-flash-tts');
  assert.deepEqual(asked_models, ['gemini-2.5-flash-preview-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts']);
  asked_models.length = 0;
  r = await F.handle(req({ text: 'x' }), env, fake({ gemini: 'server-error' }));
  assert.equal(r.status, 200); assert.equal(r.headers.get('x-voice-model'), 'gemini-3.8-flash-lite-tts');
  asked_models.length = 0;
  r = await F.handle(req({ text: 'x', model: 'gemini-3.8-flash-lite-tts' }), env, fake({ gemini: 'busy' }));
  assert.equal(r.status, 429);
  assert.deepEqual(asked_models, ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview'], 'the asked-for model is not tried twice');

  // stream:true: the raw PCM as it is made (the audio events joined, the other lines ignored), the rate in a header
  f = fake();
  r = await F.handle(req({ text: 'تمام', stream: true }), env, f);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-voice-rate'), '24000');
  assert.deepEqual([...Buffer.from(await r.arrayBuffer())], [...pcm]);
  assert.match(f.calls.find((c) => c.url.includes('streamGenerateContent')).url, /gemini-2\.5-flash-preview-tts:streamGenerateContent\?alt=sse/);
  r = await F.handle(req({ text: 'تمام', stream: true }), env, fake({ gemini: 'busy' }));
  assert.equal(r.status, 429);

  // the speech models of the key
  r = await F.handle(req({ action: 'models' }), env, fake());
  assert.deepEqual((await r.json()).models, ['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts']);

  // a key may not ask more than 40 times a minute
  f = fake();
  const K2 = 'b'.repeat(64);
  let last = 0; const t = 1_800_000_000_000;
  for (let i = 0; i < 42; i++) { last = (await F.handle(req({ text: 'x' }, K2), env, f, t + i)).status; }
  assert.equal(last, 429, 'the 42nd call in a minute is refused');
  assert.equal((await F.handle(req({ text: 'x' }, K2), env, f, t + 61000)).status, 200, 'a minute later it works again');
  console.log('PASS: asker-voice: a WAV for Adam\'s keys only; odd input, busy Gemini and the rate limit handled');
})().catch((e) => { console.error(e); process.exit(1); });
