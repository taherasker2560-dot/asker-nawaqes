// Function asker-adam: Adam's FAST brain on the server (owner 2026-11-17: «يلا بينا نظبط آدم عشان نستغله»; earlier «مش صنم … ياخد ويدي
// معايا» and «كلود بيقعد يفكر … مش مسعف في الشغل»). Design: Hub\adam\ADAM_V2_DESIGN.md.
//   POST {text, history?: [{who: 'me'|'adam', text}], ctx?}   header x-adam-key: Adam's 64-hex device key (phone or laptop)
//   -> {speak, show, do_now?, open?, walk?, ctx?, end?, handoff?, ms, tool?}
//   POST {action: 'models'}   -> the text models this Gemini key can use
// One HTTP call, no queue: a fast Gemini text model picks ONE tool, this code reads the bot's own tables (synced from PharmaFly every
// ~10 minutes) and writes the Egyptian answer itself. Questions it cannot answer with its tools, and EVERYTHING that records or sends
// (payments, sales, transfers, messages, calls, purchase orders) come back as {handoff: true}: the phone then asks the laptop through
// the old queue, where the spoken-«أيوه» gate lives. This function only READS; it never writes anything.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY (same as asker-voice), GEMINI_TEXT_MODEL (optional).
// Deploy with --no-verify-jwt (the phone has no sign-in); the device key is checked with ar_adam_role.
type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;
type Turn = { who?: unknown; text?: unknown };

export const TEXT_MODEL = 'gemini-3.8-flash-lite';
export const MAX_TEXT = 400;
const KEY_RE = /^[0-9a-f]{64}$/;
const MODEL_RE = /^gemini-[a-z0-9.\-]{1,60}$/;
const TIMEOUT_MS = 10000, GEMINI_TIMEOUT_MS = 12000, PER_MINUTE = 40, BAGS_TTL_MS = 5 * 60 * 1000;

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const serviceHeaders = (k: string): Record<string, string> => k.startsWith('sb_') ? { apikey: k } : { Authorization: 'Bearer ' + k, apikey: k };

// ---------- Arabic text helpers ----------
/** Letters that are written several ways become one («أحمد» = «احمد», «يوميه» = «يومية», «مستشفى» = «مستشفي»). */
export function norm(s: string): string {
  return String(s || '').toLowerCase()
    .replace(/[ً-ْـ]/g, '')          // harakat and tatweel
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\p{L}\p{Nd}% .]/gu, ' ').replace(/\s+/g, ' ').trim();
}
const STOP = new Set(['سعر', 'بكام', 'كام', 'عندنا', 'موجود', 'الموجود', 'صنف', 'الصنف', 'رصيد', 'حساب', 'دوا', 'دواء', 'عن', 'في', 'من', 'يا', 'ال']);
/** The words of a spoken name, each as a PostgREST ilike pattern where every letter written several ways matches any of them. */
export function words(q: string): string[] {
  // numbers are left out of the search (the names keep Arabic-Indic digits, «٤٠»); they only rank the matches (rankByNumber)
  return norm(q).split(' ').filter((w) => w.length >= 2 && !STOP.has(w) && !/^[\d.%]+$/.test(w)).slice(0, 4)
    .map((w) => w.replace(/[اوي]/g, '_').replace(/ه$/, '_'));
}
const toIndic = (s: string) => s.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
/** The numbers he said («زوركال 40»), in both digit forms, to put the right strength first. */
function rankByNumber(q: string, name: string): number {
  const nums = norm(q).split(' ').filter((w) => /^\d+(\.\d+)?$/.test(w));
  return nums.filter((n) => name.includes(n) || name.includes(toIndic(n))).length;
}
const ilikeAll = (col: string, ws: string[]) => 'and=(' + ws.map((w) => col + '.ilike.*' + w + '*').join(',') + ')';
/** «9.5» → «9.5», «3» → «3»: the phone turns the digits into Egyptian words. */
const num = (x: number) => (Math.round(x * 10) / 10).toString();
const money = (x: number) => Math.round(x).toLocaleString('en-US').replace(/,/g, ' ');

// ---------- the bot's data (service role, read only) ----------
type Ctx = { base: string; key: string; fetch: typeof fetch };
async function rest(c: Ctx, path: string, count = false): Promise<{ rows: Json[]; total: number }> {
  const r = await c.fetch(c.base + '/rest/v1/' + path, {
    headers: { ...serviceHeaders(c.key), ...(count ? { Prefer: 'count=exact' } : {}) }, signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!r || !r.ok) return { rows: [], total: 0 };
  const rows = await r.json().catch(() => []) as Json[];
  const cr = r.headers.get('content-range') || '';
  const total = count ? Number(/\/(\d+)$/.exec(cr)?.[1] || rows.length) : rows.length;
  return { rows: Array.isArray(rows) ? rows : [], total };
}

let bagsCache: { at: number; data: Json | null } = { at: 0, data: null };
/** The bags file the laptop uploads (asker-private/alerts/alerts.json), kept 5 minutes in this copy of the function. */
async function bags(c: Ctx, now: number): Promise<Json | null> {
  if (bagsCache.data && now - bagsCache.at < BAGS_TTL_MS) return bagsCache.data;
  const r = await c.fetch(c.base + '/storage/v1/object/asker-private/alerts/alerts.json', {
    headers: serviceHeaders(c.key), signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) as Json | null : null;
  if (j) bagsCache = { at: now, data: j };
  return j || bagsCache.data;
}
export function _resetCache() { bagsCache = { at: 0, data: null }; }

type BagItem = { id: number; name: string; have: number; sold30: number; need: number };
type Bag = { id: string; name: string; items: BagItem[] };
function bagList(j: Json | null): Bag[] {
  const list = ((j?.bags as Json | undefined)?.list || []) as Json[];
  return list.map((b) => ({
    id: String(b.id), name: String(b.name || ''),
    items: ((b.items || []) as Json[]).map((x) => ({ id: Number(x.id), name: String(x.name || ''), have: Number(x.have || 0), sold30: Number(x.sold30 || 0), need: Number(x.need || 0) })),
  }));
}
/** Which bag a spoken name means: the daily one by its usual words, else the one whose name holds all the words. */
export function findBag(all: Bag[], said: string): Bag | null {
  const n = norm(said);
  if (/يومي|يوميه|سبيد|speed/.test(n) || !n) return all.find((b) => b.id === '2428') || null;
  if (/كل الشركات|الشركات/.test(n)) return all.find((b) => b.id === 'pv') || null;
  const ws = n.split(' ').filter((w) => w.length >= 2 && !['حقيبه', 'شنطه', 'نواقص', 'بتاعه', 'بتاع'].includes(w));
  if (!ws.length) return null;
  const hits = all.filter((b) => ws.every((w) => norm(b.name).includes(w)));
  return hits.length === 1 ? hits[0] : null;
}
/** Arabic names for item ids (ar_stock / ar_store_items), for the voice. */
async function arabicNames(c: Ctx, ids: number[]): Promise<Map<number, string>> {
  const m = new Map<number, string>();
  if (!ids.length) return m;
  const q = 'in.(' + ids.slice(0, 60).join(',') + ')';
  for (const r of (await rest(c, 'ar_stock?select=item_id,arabic_name&item_id=' + q)).rows) if (r.arabic_name) m.set(Number(r.item_id), String(r.arabic_name));
  const left = ids.filter((i) => !m.has(i));
  if (left.length) for (const r of (await rest(c, 'ar_store_items?select=id,arabic_name&id=in.(' + left.slice(0, 60).join(',') + ')')).rows) if (r.arabic_name) m.set(Number(r.id), String(r.arabic_name));
  return m;
}
/** A spoken name: the Arabic one without the pack size («زوركال ٤٠ مجم ١٤ قرص» → «زوركال ٤٠ مجم»), else the English one. */
function spoken(ar: string | undefined, en: string): string {
  const a = String(ar || '').replace(/\s*[٠-٩\d]+\s*(قرص|اقراص|أقراص|كبسول|كبسوله|امبول|أمبول|فيال|لبوس|كيس|اكياس|أكياس)\s*$/u, '').trim();
  return a || String(en || '').trim();
}

// ---------- the tools ----------
type Answer = { speak: string; show?: string; do_now?: Json[]; open?: Json; walk?: Json; ctx?: Json; end?: boolean; handoff?: boolean };
const PAGES: Record<string, string> = {
  home: 'الرئيسية', short: 'النواقص', read: 'الوارد', drafts: 'الطلبيات', docs: 'الفواتير', suppliers: 'قوايم المخازن', stock: 'المخزون',
  count: 'الجرد', expiry: 'الصلاحيات', customers: 'العملاء', vendors: 'الموردين', ops: 'العمليات', storeorders: 'طلبات الموقع',
  sales: 'المبيعات', tempsale: 'البيع المؤقت', care: 'خدمة العملاء', bags: 'الحقائب',
};

async function itemInfo(c: Ctx, name: string, now: number): Promise<Answer> {
  const ws = words(name);
  if (!ws.length) return { speak: 'قول اسم الصنف تاني' };
  let rows = (await rest(c, 'ar_stock?select=item_id,name,arabic_name,price,packs,units,parts,exp_near&' + ilikeAll('arabic_name', ws) + '&limit=8')).rows;
  let inStock = true;
  if (!rows.length && /[a-z]/i.test(name)) rows = (await rest(c, 'ar_stock?select=item_id,name,arabic_name,price,packs,units,parts,exp_near&' + ilikeAll('name', ws) + '&limit=8')).rows;
  if (!rows.length) {
    inStock = false;
    rows = (await rest(c, 'ar_store_items?select=id,name,arabic_name,price&' + ilikeAll('arabic_name', ws) + '&limit=8')).rows.map((r) => ({ ...r, item_id: r.id }));
  }
  if (!rows.length) return { speak: 'مش لاقي صنف بالاسم ده', open: { q: name } };
  // the strength he said first («زوركال 40»), then the shortest name (the plain product before its variants)
  rows.sort((a, b) => (rankByNumber(name, String(b.arabic_name || b.name)) - rankByNumber(name, String(a.arabic_name || a.name)))
    || (String(a.arabic_name || a.name).length - String(b.arabic_name || b.name).length));
  const it = rows[0];
  const id = Number(it.item_id);
  const nm = spoken(it.arabic_name as string, it.name as string);
  const parts = Number(it.parts || 1) >= 1 ? Number(it.parts || 1) : 1;
  const have = inStock ? Number(it.packs || 0) + Number(it.units || 0) / parts : 0;
  const bits: string[] = [];
  bits.push(nm + (Number(it.price) > 0 ? ': ' + num(Number(it.price)) + ' جنيه' : ''));
  bits.push(have >= 0.05 ? 'عندنا ' + num(have) : 'مش موجود عندنا دلوقتي');
  if (inStock && it.exp_near) bits.push('وفيه منه صلاحيته قربت');
  // its bag / the general shortages, from the bags file
  const j = await bags(c, now);
  for (const b of bagList(j)) {
    const x = b.items.find((y) => y.id === id);
    if (x) { bits.push('وهو ناقص في ' + (b.id === 'pv' ? 'نواقص كل الشركات' : 'حقيبة ' + b.name) + '، بيتباع ' + num(x.sold30) + ' في الشهر'); break; }
  }
  const gs = ((j?.bags as Json | undefined)?.gs || []) as unknown[];
  if (gs.map(Number).includes(id)) bits.push('وهو في النواقص العامة');
  const buys = (await rest(c, 'ar_item_buys?select=supplier,last_date,discount_pct&item_id=eq.' + id + '&order=last_date.desc&limit=2')).rows;
  if (buys.length) {
    const b = buys[0];
    const d = String(b.last_date || '').slice(0, 10).split('-');
    bits.push('آخر شرا من ' + String(b.supplier) + (d.length === 3 ? ' يوم ' + Number(d[2]) + '/' + Number(d[1]) : '') + (Number(b.discount_pct) > 0 ? ' بخصم ' + num(Number(b.discount_pct)) + '٪' : ''));
  }
  const more = rows.length > 1 ? 'وفيه ' + (rows.length - 1) + ' أصناف تانية قريبة من الاسم على الشاشة' : '';
  return {
    speak: bits.join('، ') + '.' + (more ? ' ' + more + '.' : ''),
    show: rows.slice(0, 6).map((r) => String(r.arabic_name || r.name) + (Number(r.price) > 0 ? ' — ' + num(Number(r.price)) + ' ج' : '')).join('\n'),
    open: { q: String(it.name || nm) }, ctx: { item: { id, name: nm } },
  };
}

async function shortages(c: Ctx, which: string, bagName: string, readAloud: boolean, now: number): Promise<Answer> {
  if (which !== 'bag') {
    const { rows, total } = await rest(c, 'ar_shortages?select=product_name,name_key,suggested_qty&is_active=eq.true&order=suggested_qty.desc.nullslast,product_name&limit=' + (readAloud ? 30 : 5), true);
    const keys = rows.map((r) => String(r.name_key)).filter(Boolean);
    const ar = new Map<string, string>();
    if (keys.length) for (const n of (await rest(c, 'ar_names?select=name_key,arabic_name,spoken_name&name_key=in.(' + keys.map((k) => '"' + k.replace(/"/g, '') + '"').join(',') + ')')).rows) ar.set(String(n.name_key), String(n.spoken_name || n.arabic_name || ''));
    const nameOf = (r: Json) => spoken(ar.get(String(r.name_key)), String(r.product_name));
    const intro = 'النواقص العامة فيها ' + total + ' صنف';
    if (readAloud && rows.length) return { speak: intro, walk: { mode: 'read', intro: intro + '. هقرا أكتر المطلوب. بعد كل 3 قول أيوه أكمّل أو لا أقف', items: rows.map((r, i) => ({ id: i + 1, say: nameOf(r) + '، مطلوب ' + num(Number(r.suggested_qty || 1)) })), end_say: 'خلصت. الباقي على البوت' }, do_now: [{ type: 'open_tab', tab: 'short' }] };
    return { speak: intro + (rows.length ? '. أكتر المطلوب: ' + rows.slice(0, 3).map(nameOf).join('، ') + '. أقرالك الباقي؟' : '.'), show: rows.map((r) => nameOf(r) + ' — ' + num(Number(r.suggested_qty || 1))).join('\n'), do_now: [{ type: 'open_tab', tab: 'short' }], ctx: { list: 'general' } };
  }
  const all = bagList(await bags(c, now));
  const b = findBag(all, bagName);
  if (!b) return { speak: 'مش عارف أنهي حقيبة. عندنا: ' + all.map((x) => x.id === 'pv' ? 'نواقص كل الشركات' : x.name).join('، ') };
  const items = [...b.items].sort((x, y) => y.sold30 - x.sold30);
  const names = await arabicNames(c, items.slice(0, readAloud ? 30 : 3).map((x) => x.id));
  const nameOf = (x: BagItem) => spoken(names.get(x.id), x.name);
  const title = b.id === 'pv' ? 'نواقص كل الشركات' : 'حقيبة ' + b.name;
  const intro = title + ' فيها ' + items.length + ' صنف';
  if (readAloud && items.length) return { speak: intro, walk: { mode: 'read', intro: intro + '. هقرا الأهم بالمتوسط. بعد كل 3 قول أيوه أكمّل أو لا أقف', items: items.slice(0, 30).map((x) => ({ id: x.id, say: nameOf(x) + '، عندنا ' + num(x.have) + '، والمتوسط ' + num(x.sold30) })), end_say: 'خلصت الحقيبة' }, do_now: [{ type: 'open_tab', tab: 'bags' }] };
  return { speak: intro + (items.length ? '. أهمهم: ' + items.slice(0, 3).map(nameOf).join('، ') + '. أقرالك الباقي؟' : '.'), show: items.slice(0, 20).map((x) => x.name + ' — عندنا ' + num(x.have) + ' — متوسط ' + num(x.sold30)).join('\n'), do_now: [{ type: 'open_tab', tab: 'bags' }], ctx: { list: 'bag', bag: b.id } };
}

async function balance(c: Ctx, party: string, name: string): Promise<Answer> {
  const ws = words(name);
  if (!ws.length) return { speak: 'قول الاسم تاني' };
  if (party === 'vendor') {
    let rows = (await rest(c, 'ar_vendors?select=id,name,short,balance,last_invoice_at,last_payment_at,last_payment&' + ilikeAll('name', ws) + '&limit=6')).rows;
    if (!rows.length) rows = (await rest(c, 'ar_vendors?select=id,name,short,balance,last_invoice_at,last_payment_at,last_payment&' + ilikeAll('short', ws) + '&limit=6')).rows;
    if (!rows.length) return { speak: 'مش لاقي مورد بالاسم ده', do_now: [{ type: 'open_tab', tab: 'vendors' }] };
    if (rows.length > 1) return { speak: 'فيه ' + rows.length + ' موردين بالاسم ده: ' + rows.slice(0, 4).map((r) => String(r.name)).join('، ') + '. تقصد مين؟', ctx: { choose: 'vendor' } };
    const v = rows[0], bal = Number(v.balance || 0);
    const s = Math.abs(bal) < 0.5 ? 'حسابه خالص' : bal > 0 ? 'علينا له ' + money(bal) + ' جنيه' : 'لينا عنده ' + money(-bal) + ' جنيه';
    const d = String(v.last_payment_at || '').slice(0, 10).split('-');
    const pay = Number(v.last_payment) > 0 && d.length === 3 ? '، وآخر دفعة ' + money(Number(v.last_payment)) + ' يوم ' + Number(d[2]) + '/' + Number(d[1]) : '';
    return { speak: String(v.name) + ': ' + s + pay + '. أفتحلك حسابه؟', open: { vendor: Number(v.id) }, ctx: { vendor: { id: Number(v.id), name: String(v.name) } } };
  }
  const rows = (await rest(c, 'ar_customers?select=id,name,balance,credit_limit,last_at&' + ilikeAll('name', ws) + '&order=last_at.desc.nullslast&limit=6')).rows;
  if (!rows.length) return { speak: 'مش لاقي عميل بالاسم ده', do_now: [{ type: 'open_tab', tab: 'customers' }] };
  if (rows.length > 1) return { speak: 'فيه ' + rows.length + ' عملاء بالاسم ده: ' + rows.slice(0, 4).map((r) => String(r.name)).join('، ') + '. تقصد مين؟', ctx: { choose: 'customer' } };
  const u = rows[0], bal = Number(u.balance || 0);
  const s = Math.abs(bal) < 0.5 ? 'حسابه خالص' : bal > 0 ? 'عليه ' + money(bal) + ' جنيه' : 'ليه عندنا ' + money(-bal) + ' جنيه';
  const lim = Number(u.credit_limit || 0) > 0 && bal > Number(u.credit_limit) ? '، وعدّى الحد بتاعه' : '';
  return { speak: String(u.name) + ': ' + s + lim + '. أفتحلك حسابه؟', open: { customer: Number(u.id) }, ctx: { customer: { id: Number(u.id), name: String(u.name) } } };
}

/** Cairo midnight [daysBack] days ago, as an ISO time. */
export function cairoMidnight(now: number, daysBack = 0): string {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date(now)).map((x) => [x.type, x.value])) as Record<string, string>;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  const offset = asUtc - Math.floor(now / 1000) * 1000;
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day - daysBack) - offset).toISOString();
}

async function sales(c: Ctx, period: string, now: number): Promise<Answer> {
  const back = period === 'yesterday' ? 1 : period === 'week' ? 6 : period === 'month' ? 29 : 0;
  const from = cairoMidnight(now, back), to = period === 'yesterday' ? cairoMidnight(now, 0) : new Date(now + 60000).toISOString();
  const { rows } = await rest(c, 'ar_sales?select=kind,total&at=gte.' + encodeURIComponent(from) + '&at=lt.' + encodeURIComponent(to) + '&limit=20000');
  const sum: Record<string, number> = {}; let n = 0;
  for (const r of rows) { const k = String(r.kind || 'other'); sum[k] = (sum[k] || 0) + Number(r.total || 0); n++; }
  const label = period === 'yesterday' ? 'امبارح' : period === 'week' ? 'آخر 7 أيام' : period === 'month' ? 'آخر 30 يوم' : 'النهارده';
  if (!n) return { speak: 'مفيش مبيعات ' + label + ' لسه', do_now: [{ type: 'open_tab', tab: 'sales' }] };
  const names: Record<string, string> = { cash: 'كاش', credit: 'آجل', return: 'مرتجع', returns: 'مرتجع' };
  const net = Object.entries(sum).reduce((a, [k, v]) => a + (/return/.test(k) ? -Math.abs(v) : v), 0);
  const parts = Object.entries(sum).map(([k, v]) => (names[k] || k) + ' ' + money(Math.abs(v)));
  return { speak: 'مبيعات ' + label + ': ' + money(net) + ' جنيه في ' + n + ' فاتورة. ' + parts.join('، ') + '.', do_now: [{ type: 'open_tab', tab: 'sales' }] };
}

// ---------- Gemini: understand the sentence, pick one tool ----------
const SYSTEM = [
  'You are Adam («آدم»), the voice assistant of an Egyptian pharmacy. The owner talks to you while working, by voice.',
  'Answer in short spoken EGYPTIAN Arabic (one or two sentences). Never use his name or titles; «يا فندم» and «حضرتك» are fine.',
  'When the question needs the pharmacy\'s data or a page, call exactly ONE tool. Use the conversation context: «هو / ده / اعمله / اللي قلتلك عليه» mean the item or person talked about last.',
  'Call `laptop` for anything you cannot answer with the tools, and ALWAYS for anything that records, changes or sends: a sale, a payment, a transfer between bags, a purchase order, a stock count, a WhatsApp message, a call, cancelling something, or questions about profit, reasons or analysis.',
  'Call `end` when he ends the conversation («خلاص»، «شكرا»، «كده تمام»، «مع السلامة»).',
  'For small talk answer yourself in a few words, no tool.',
].join('\n');
const TOOLS = [{
  functionDeclarations: [
    { name: 'item_info', description: 'Price, stock, expiry, its bag / shortage and the last purchase of ONE medicine or product.', parameters: { type: 'OBJECT', properties: { name: { type: 'STRING', description: 'The product name as he said it (Arabic or English), without words like سعر/عندنا/كام.' } }, required: ['name'] } },
    { name: 'shortages', description: 'The shortage lists: «النواقص العامة» (general) or a bag («حقيبة النواقص اليومية»، «حقيبة سرحان»، «نواقص كل الشركات»).', parameters: { type: 'OBJECT', properties: { which: { type: 'STRING', enum: ['general', 'bag'] }, bag: { type: 'STRING', description: 'The bag as he named it, when which=bag.' }, read_aloud: { type: 'BOOLEAN', description: 'true when he wants the items read one by one («اقرالي»، «قولي اللي فيها»).' } }, required: ['which'] } },
    { name: 'balance', description: 'The account balance of a customer («عميل») or a supplier / warehouse («مورد»، «مخزن»، e.g. الفتح، ابن سينا، فارما).', parameters: { type: 'OBJECT', properties: { party: { type: 'STRING', enum: ['customer', 'vendor'] }, name: { type: 'STRING' } }, required: ['party', 'name'] } },
    { name: 'sales', description: 'Sales totals for a period.', parameters: { type: 'OBJECT', properties: { period: { type: 'STRING', enum: ['today', 'yesterday', 'week', 'month'] } }, required: ['period'] } },
    { name: 'open_page', description: 'Open a page of the bot app.', parameters: { type: 'OBJECT', properties: { page: { type: 'STRING', enum: Object.keys(PAGES) } }, required: ['page'] } },
    { name: 'laptop', description: 'Hand the request to the laptop assistant (anything that records/changes/sends, or that the other tools cannot answer).' },
    { name: 'end', description: 'He ended the conversation.' },
  ],
}];

type Pick = { tool: string; args: Json } | { text: string } | null;
async function understand(env: Env, f: typeof fetch, model: string, text: string, history: { who: string; text: string }[], ctx: Json | null): Promise<{ pick: Pick; why: string }> {
  const contents = history.map((h) => ({ role: h.who === 'adam' ? 'model' : 'user', parts: [{ text: h.text }] }));
  const note = ctx && Object.keys(ctx).length ? '\n[context: ' + JSON.stringify(ctx) + ']' : '';
  contents.push({ role: 'user', parts: [{ text: text + note }] });
  const body = (thinking: boolean) => JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] }, contents, tools: TOOLS,
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { temperature: 0.1, maxOutputTokens: 200, ...(thinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
  });
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': String(env.GEMINI_API_KEY) };
  let g = await f(url, { method: 'POST', headers, body: body(true), signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) }).catch(() => null);
  if (g && g.status === 400) g = await f(url, { method: 'POST', headers, body: body(false), signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) }).catch(() => null);   // a model without the «no thinking» switch
  if (!g || !g.ok) return { pick: null, why: 'gemini ' + (g ? g.status : 'down') };
  const j = await g.json().catch(() => null) as { candidates?: { content?: { parts?: { text?: string; functionCall?: { name?: string; args?: Json } }[] } }[] } | null;
  const parts = j?.candidates?.[0]?.content?.parts || [];
  const fc = parts.find((p) => p.functionCall)?.functionCall;
  if (fc?.name) return { pick: { tool: String(fc.name), args: (fc.args || {}) as Json }, why: '' };
  const t = parts.map((p) => p.text || '').join(' ').trim();
  return t ? { pick: { text: t }, why: '' } : { pick: null, why: 'empty' };
}

// best effort, per running copy of the function
const seen = new Map<string, number[]>();
function tooMany(key: string, now: number): boolean {
  const list = (seen.get(key) || []).filter((t) => now - t < 60000);
  list.push(now); seen.set(key, list);
  if (seen.size > 50) for (const k of seen.keys()) { if (k !== key) seen.delete(k); }
  return list.length > PER_MINUTE;
}

const ENDS = /^(خلاص|شكرا|شكرًا|متشكر|كده تمام|تمام كده|مع السلامه|سلام|لا خلاص|خلاص كده|خلاص شكرا)[ .!]*$/;

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch, now = Date.now()): Promise<Response> {
  const t0 = Date.now();
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  const key = String(req.headers.get('x-adam-key') || '');
  if (!KEY_RE.test(key)) return reply(401, { error: 'key' });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.GEMINI_API_KEY) return reply(503, { error: 'not-configured' });
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const rr = await fetchImpl(base + '/rest/v1/rpc/ar_adam_role', {
    method: 'POST', headers: { ...serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: key }), signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  const role = rr && rr.ok ? await rr.json().catch(() => null) : null;
  if (role !== 'phone' && role !== 'laptop') return reply(401, { error: 'key' });
  if (tooMany(key, now)) return reply(429, { error: 'rate' });
  let body: { action?: unknown; text?: unknown; history?: unknown; ctx?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: 'body' }); }

  if (body.action === 'models') {
    const m = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': env.GEMINI_API_KEY }, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
    const j = m && m.ok ? await m.json().catch(() => null) as { models?: { name?: string }[] } | null : null;
    if (!j) return reply(502, { error: 'gemini', status: m ? m.status : 0 });
    return reply(200, { ok: true, models: (j.models || []).map((x) => String(x.name || '').replace(/^models\//, '')).filter((n) => /^gemini/.test(n) && !/tts|embedding|image|audio|live/i.test(n)) });
  }

  const text = typeof body.text === 'string' ? body.text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!text) return reply(400, { error: 'text' });
  if (text.length > MAX_TEXT) return reply(413, { error: 'long', max: MAX_TEXT });
  const history = (Array.isArray(body.history) ? body.history as Turn[] : []).slice(-8)
    .map((h) => ({ who: h?.who === 'adam' ? 'adam' : 'me', text: String(h?.text || '').slice(0, MAX_TEXT) })).filter((h) => h.text);
  const ctx = body.ctx && typeof body.ctx === 'object' && !Array.isArray(body.ctx) ? body.ctx as Json : null;
  const done = (a: Answer, tool: string) => reply(200, { ok: true, ...a, show: a.show || a.speak, tool, ms: Date.now() - t0 });

  if (ENDS.test(norm(text))) return done({ speak: 'تمام', end: true }, 'end');
  const model = (env.GEMINI_TEXT_MODEL || TEXT_MODEL).trim();
  if (!MODEL_RE.test(model)) return reply(500, { error: 'model' });
  const { pick, why } = await understand(env, fetchImpl, model, text, history, ctx);
  // Gemini not there: the laptop still answers (the old way)
  if (!pick) return done({ speak: '', handoff: true }, 'handoff:' + why);
  if ('text' in pick) return done({ speak: pick.text.slice(0, 300) }, 'chat');
  const c: Ctx = { base, key: env.SUPABASE_SERVICE_ROLE_KEY, fetch: fetchImpl };
  const a = pick.args;
  try {
    switch (pick.tool) {
      case 'item_info': return done(await itemInfo(c, String(a.name || ''), now), 'item_info');
      case 'shortages': return done(await shortages(c, String(a.which || 'general'), String(a.bag || ''), a.read_aloud === true, now), 'shortages');
      case 'balance': return done(await balance(c, String(a.party || 'customer'), String(a.name || '')), 'balance');
      case 'sales': return done(await sales(c, String(a.period || 'today'), now), 'sales');
      case 'open_page': {
        const p = String(a.page || '');
        if (!PAGES[p]) return done({ speak: 'مش عارف الصفحة دي' }, 'open_page');
        return done({ speak: 'فتحتلك ' + PAGES[p], do_now: [{ type: 'open_tab', tab: p }] }, 'open_page');
      }
      case 'end': return done({ speak: 'تمام', end: true }, 'end');
      default: return done({ speak: '', handoff: true }, 'laptop');
    }
  } catch (e) {
    return done({ speak: '', handoff: true }, 'handoff:error ' + String((e as Error)?.message || e).slice(0, 80));
  }
}

const deno = (globalThis as unknown as { Deno?: { serve: (h: (req: Request) => Promise<Response>) => void; env: { toObject: () => Env } } }).Deno;
if (deno) deno.serve((req) => handle(req, deno.env.toObject(), fetch));
