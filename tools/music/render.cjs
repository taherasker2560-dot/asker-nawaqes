// Renders the store's calm music to MP3 files, once, offline (owner 2026-11-17: the music cut out on phones because it was made live in the page; now the page plays these files).
//   node tools/music/render.cjs [pieces, e.g. 0,1,2 (default: all)] [--force]
// Needs: Playwright + Chrome installed (the same as the browser tests), and the `lamejs` MP3 encoder (a tool only, not part of the site): `npm i lamejs@1.2.1` in any scratch folder,
// then LAMEJS=<that folder>/node_modules/lamejs/lame.all.js (the browser bundle: the encoder runs inside the page that renders). Output: store/music/NN-<name>.mp3 (mono, 32 kHz, 80 kbps,
// about 2.4 MB each) and store/music/index.json (what store/music.js plays). A piece that already has its file is skipped (--force renders it again). Each piece takes minutes: the score
// and sounds are tools/music/score.js, the same code the tests check.
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const score = require('./score.js');
const LAME = process.env.LAMEJS;
if (!LAME || !fs.existsSync(LAME)) { console.error('Set LAMEJS to the path of lamejs/lame.all.js (npm i lamejs@1.2.1)'); process.exit(2); }
const OUT = path.resolve(__dirname, '..', '..', 'store', 'music');
const RATE = 32000, KBPS = 80, TAIL = 3, FADE = 1.5, SEED0 = 1000;
const args = process.argv.slice(2), force = args.includes('--force');
const wanted = (args.find((a) => /^\d/.test(a)) || score.STYLES.map((_, i) => i).join(',')).split(',').map(Number);
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
const fileOf = (p) => `${String(p + 1).padStart(2, '0')}-${slug(score.STYLES[p].name)}.mp3`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const indexFile = path.join(OUT, 'index.json');
  const index = {};   // by piece number
  if (fs.existsSync(indexFile)) for (const x of JSON.parse(fs.readFileSync(indexFile, 'utf8'))) index[x.piece] = x;
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ path: path.join(__dirname, 'score.js') });
  await page.addScriptTag({ path: LAME });
  for (const p of wanted) {
    const file = fileOf(p), full = path.join(OUT, file);
    if (!force && fs.existsSync(full) && index[p]) { console.log(`skip ${file} (exists)`); continue; }
    const secs = score.lengthOf(p), t0 = Date.now();
    const r = await page.evaluate(async ([p, secs, seed, rate, kbps, tail, fade]) => {
      const buf = await window.AskerMusicScore.renderBuffer(secs, seed, rate, { first: p, fromBar: 0, tail });
      const f = buf.getChannelData(0).slice(), n = f.length, fo = Math.floor(rate * fade);
      for (let i = 0; i < fo; i++) f[n - 1 - i] *= i / fo;   // the last seconds die away: the file ends clean
      let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(f[i]));
      const g = peak > 0.98 ? 0.98 / peak : 1;               // a hard ceiling so nothing clips
      const pcm = new Int16Array(n); let sum = 0, m = 0;
      for (let i = 0; i < n; i++) { const v = f[i] * g; pcm[i] = Math.max(-1, Math.min(1, v)) * 32767; if (i > rate * 6) { sum += v * v; m++; } }
      const enc = new window.lamejs.Mp3Encoder(1, rate, kbps), parts = []; let bytes = 0;
      for (let i = 0; i < n; i += 1152) { const b = enc.encodeBuffer(pcm.subarray(i, i + 1152)); if (b.length) { parts.push(b); bytes += b.length; } }
      const end = enc.flush(); if (end.length) { parts.push(end); bytes += end.length; }
      const all = new Uint8Array(bytes); let o = 0; for (const b of parts) { all.set(b, o); o += b.length; }
      let s = ''; for (let i = 0; i < all.length; i += 0x8000) s += String.fromCharCode.apply(null, all.subarray(i, i + 0x8000));
      return { b64: btoa(s), secs: n / rate, peakDb: 20 * Math.log10(peak * g), rmsDb: 10 * Math.log10(sum / m), gain: g };
    }, [p, secs, SEED0 + p, RATE, KBPS, TAIL, FADE]);
    const bytes = Buffer.from(r.b64, 'base64');
    fs.writeFileSync(full, bytes);
    index[p] = { piece: p, id: slug(score.STYLES[p].name), name: score.STYLES[p].name, file, secs: +r.secs.toFixed(1), intro: +score.introOf(p).toFixed(1), bytes: bytes.length, peakDb: +r.peakDb.toFixed(1), rmsDb: +r.rmsDb.toFixed(1) };
    fs.writeFileSync(indexFile, JSON.stringify(Object.keys(index).sort((a, b) => a - b).map((k) => index[k]), null, 1) + '\n');
    console.log(`done ${file}: ${index[p].secs}s, ${(bytes.length / 1048576).toFixed(2)} MB, peak ${index[p].peakDb} dBFS, rms ${index[p].rmsDb} dBFS (gain ${r.gain.toFixed(3)}) in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
