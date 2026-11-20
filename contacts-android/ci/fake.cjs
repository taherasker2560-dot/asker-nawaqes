// The system's server as the emulator test needs it (no real Supabase is ever called): the four functions of migration 202611201900, in memory.
//   GET /__state  → what the app did.   POST /rest/v1/rpc/<fn> → ar_phone_pending | ar_phone_ack | ar_phone_push_rows | ar_phone_finish
'use strict';
const http = require('node:http');
const KEY = 'ab'.repeat(32), API = 'sb_publishable_af0XfsvB0Fwwo3HORqMN2g_iJNd9o0q';
const st = { calls: [], pending: [{ phone: '01000000001', name: 'Pending Person' }], acked: [], rows: {}, finished: null, badKey: 0, badApi: 0 };
http.createServer((req, res) => {
  if (req.url === '/__state') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(st)); }
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    const fn = String(req.url).split('/rpc/')[1];
    const a = body ? JSON.parse(body) : {};
    st.calls.push(fn);
    if (req.headers.apikey !== API) { st.badApi++; res.statusCode = 401; return res.end('{"message":"bad api key"}'); }
    if (a.p_key !== KEY) { st.badKey++; res.statusCode = 400; return res.end('{"message":"bad phone key"}'); }
    res.setHeader('content-type', 'application/json');
    if (fn === 'ar_phone_pending') return res.end(JSON.stringify(st.pending.filter((p) => !st.acked.includes(p.phone))));
    if (fn === 'ar_phone_ack') { st.acked.push(...a.p_phones); return res.end(String(a.p_phones.length)); }
    if (fn === 'ar_phone_push_rows') { for (const r of a.p_rows) st.rows[r.id] = r; return res.end(String(a.p_rows.length)); }
    if (fn === 'ar_phone_finish') { const got = Object.keys(st.rows).length; st.finished = { sync: a.p_sync, n: a.p_n, got }; return res.end(JSON.stringify({ ok: a.p_n === got, n: a.p_n })); }
    res.statusCode = 404; res.end('{}');
  });
}).listen(8787, '0.0.0.0');