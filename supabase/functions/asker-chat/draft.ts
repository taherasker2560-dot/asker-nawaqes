// «الرسايل», part 2: the bot writes the answer to a customer (owner 2026-11-13 «أسبوع تجربة»; 2026-11-14 «خليه يرد على كل
// حاجة، حتى الروشتة والجرعة والفلوس والشكوى … لو ما عجبتنيش الرسالة هعدلها او همسحها»).
// The customer's messages that wait for an answer (and the talk before them, a prescription or box photo too) go to Gemini
// twice: (1) what he wants (its kind) and which items he names; (2) the answer, written only from our facts: the store's items
// and the stock (متوفر / بالطلب / مش متوفر, price, boxes), his account (a credit customer), his orders. The facts are kept with
// the suggestion and shown under it in the bot, so the pharmacy sees what it was written from.

type Env = Record<string, string | undefined>;
export const KINDS = ['availability', 'account', 'order', 'rx', 'dose', 'money', 'complaint', 'other'] as const;
export type Kind = typeof KINDS[number];
export const STATUS_AR: Record<string, string> = { available: 'متوفر', on_order: 'بالطلب', unavailable: 'مش متوفر' };
export const ORDER_AR: Record<string, string> = { new: 'وصل الصيدلية', confirmed: 'اتأكد', done: 'اتسلّم', cancelled: 'اتلغى' };
const DEFAULT_MODEL = 'gemini-flash-latest', GEMINI_TIMEOUT_MS = 45000, MAX_PHOTOS = 3, MAX_ITEMS = 6;

export const EXTRACT_PROMPT = [
  'دي محادثة عميل مع صيدلية عسكر في مصر. الرسايل اللي عليها (مستنية رد) هي اللي لسه ما اترد عليهاش.',
  'حدد العميل عايز إيه في الرسايل المستنية رد:',
  'kind واحدة بس: availability (بيسأل عن صنف موجود ولا بكام، أو عايز يطلب أصناف)، account (حسابه أو اللي عليه)، order (طلبه وصل فين)،',
  'rx (بعت روشتة أو صورة روشتة)، dose (جرعة أو طريقة استخدام دوا)، money (دفع أو فلوس أو فاتورة)، complaint (شكوى أو زعل)، other (سلام أو أي حاجة تانية).',
  'items: كل دوا أو منتج اتذكر في الرسايل المستنية رد أو اتقرا من صورة روشتة أو علبة: name زي ما اتكتب أو اتقرا، english اسمه التجاري بالإنجليزي',
  'لو تعرفه (مع التركيز والشكل لو باينين، زي PANADOL COLD & FLU أو AUGMENTIN 1G TAB، والتركيز اللي قاله زي ٥٠٠ أو ٣٠٠ لازم يبقى فيه)،',
  'ومن غير كلمات الكمية زي علبة وشريط وحباية في name ولا في english. qty العدد (لو ما قالش: 1؛ شريطين = 2)،',
  'unit: strip لو طلب شريط أو أمبول أو كيس، piece لو طلب حباية أو قرص أو كبسولة، box لو طلب علبة أو ما حددش.',
  'summary: سطر واحد بالعربي: هو عايز إيه.',
].join('\n');
export const EXTRACT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: [...KINDS] },
    summary: { type: 'STRING' },
    items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, english: { type: 'STRING' }, qty: { type: 'INTEGER' }, unit: { type: 'STRING', enum: ['box', 'strip', 'piece'] } }, required: ['name'] } },
  },
  required: ['kind', 'items'],
};
export const REPLY_PROMPT = [
  'إنت صيدلي في صيدلية عسكر بترد على عميل في صفحة الرسايل بتاعتنا، بالعامية المصرية، ومن غير ما تقول إنك بوت.',
  'الأسلوب: لطيف ومحترم، مش ناشف ولا رسمي، ومن غير مجاملات زيادة.',
  '- لو «أول رد في المحادثة: أيوه»: ابدأ بتحية قصيرة دافية (أهلًا بيك، أو أهلًا يا فندم، أو باسمه لو معروف).',
  '- لو «أول رد في المحادثة: لأ»: ادخل في الموضوع على طول، من غير تحية ومن غير «يا فندم» في كل جملة ومن غير اعتذار من غير سبب.',
  '- اختم بسؤال قصير لو محتاج رد منه (زي: تحب نجهزهم؟).',
  'الطول: سطر لـ 4 سطور، وأطول بس لو فيه حساب أصناف.',
  'القواعد:',
  '- استخدم المعلومات اللي في facts بس. ما تألفش سعر ولا وجود صنف ولا رصيد ولا حالة طلب.',
  '- صنف متوفر: اسمه وسعره بالجنيه (مثلا 59 ج)، واسأله تحب نجهزهولك أو نبعتهولك.',
  '- لو طلب شريط أو أمبول أو وحدة (مش علبة)، قوله سعر الشريط أو الوحدة من facts، مش سعر العلبة.',
  '- لو في facts «الحساب»: اكتبه زي ما هو بالظبط، صنف في سطر (الاسم، الكمية، السعر)، وبعدين الإجمالي. ما تحسبش إنت حاجة ولا تغيّر رقم.',
  '  ولو فيه أصناف في «محتاج يحدد» اسأله يقصد أنهي واحد منهم (بأسعارهم)، ولو فيه «مش متوفر» قوله.',
  '- صنف بالطلب: قول إنه بالطلب ونقدر نجيبهوله، واسأله يحب نطلبه.',
  '- صنف مش متوفر أو مش لاقيينه في facts: قول إنه مش متوفر دلوقتي، واسأله: تحب نشوفلك بديل؟',
  '- لو في facts إن الصنف «بيتباع بالقرص» أو «بالشريط» غير اللي طلبه: قوله إزاي بيتباع وبكام، واسأله عايز كام.',
  '- لو في facts أكتر من صنف قريب من اللي طلبه ومش واضح أنهي: اسأله يقصد أنهي.',
  '- حسابه: المبلغ اللي عليه بالظبط من facts. ولو حسابه موقوف ما تقولش موقوف، قول إننا هنكلمه بخصوص الحساب.',
  '- طلبه: حالته ورقمه من facts.',
  '- روشتة: اذكر الأصناف اللي اتقرت وحالة كل واحد وسعره، وقول إن الصيدلي هيراجع الروشتة.',
  '- صورة صنف أو علبة: لو الصنف اللي في الصورة نفسه في facts قول حالته وسعره، ولو مش هو بالظبط قول إنه مش عندنا واعرض أقرب الأصناف اللي في facts بأسعارها.',
  '- جرعة أو استخدام: اكتب الاستخدام المعتاد بشكل عام ومختصر، وقول إن الصيدلي يقدر يأكدله حسب السن والوزن.',
  '- فلوس أو شكوى: اعتذر بلطف وقول إننا هنراجع ونرد عليه في أقرب وقت.',
  '- سلام أو أي حاجة تانية: رد مناسب وقصير.',
  'اكتب الرد بس في body.',
].join('\n');
export const REPLY_SCHEMA = { type: 'OBJECT', properties: { body: { type: 'STRING' } }, required: ['body'] };

const ascii = (s: string) => String(s || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
// the store's own search words (store/store.js searchTerms): letters and digits, 2+ letters, at most 5 words
export function searchTerms(q: string): string[] {
  const words = String(q || '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/[^0-9A-Za-zء-ي٠-٩ ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
  return [...new Set(words)].slice(0, 5);
}
// words that say how much, not which item («علبة ابيمول ٥٠٠» was not found: «علبة» is in no name)
const AMOUNT_WORDS = new Set(['علبة', 'علبه', 'علبتين', 'علب', 'شريط', 'شريطين', 'شرايط', 'حباية', 'حبايه', 'حبايتين', 'حبايات', 'قرص', 'اقراص', 'كبسولة', 'كبسوله',
  'امبول', 'امبولة', 'كيس', 'اكياس', 'عاوز', 'عايز', 'محتاج', 'عندكم', 'عندكو', 'بكام', 'سعر', 'كام', 'BOX', 'STRIP', 'STRIPS']);
export const itemTerms = (q: string) => searchTerms(q).filter((w) => !AMOUNT_WORDS.has(w) && !AMOUNT_WORDS.has(w.toUpperCase()));
// PostgREST: every word in the name or the Arabic name (ا may be أ or إ there; a number is written 500 in the name and ٥٠٠ in
// the Arabic name); available first, the popular first
export function itemsPath(terms: string[]): string {
  const or = (w: string) => {
    if (/^[0-9٠-٩.]+$/.test(w)) { const a = ascii(w), ar = a.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]); return `or(name.ilike.*${a}*,arabic_name.ilike.*${ar}*)`; }
    const v = /[ء-ي]/.test(w) ? w.replace(/ا/g, '_') : w; return `or(name.ilike.*${v}*,arabic_name.ilike.*${v}*)`;
  };
  return 'ar_store_items?select=id,name,arabic_name,status,price&hidden=is.false&and=(' + encodeURIComponent(terms.map(or).join(',')) + ')&order=status.asc,popular_rank.asc.nullslast&limit=4';
}
const money = (n: unknown) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} ج`;
type Item = { id: number; name: string; arabic_name?: string | null; status: string; price?: number | null };
type Stock = { item_id: number; packs?: number | null; units?: number | null; parts?: number | null; price?: number | null };
// what one part of a box is called (owner 2026-11-14: «عاوز شريط بنادول اكسترا» was answered with the box). PharmaFly's
// parts are the box's units: a 48-tablet box in 4 parts = strips, a 30-tablet box in 30 parts = single tablets.
export function partWord(name: string, parts = 0): string {
  const n = String(name || '').toUpperCase();
  const m = /(\d+)\s*(F\.?C\.?T|TABS?|TABLETS?|CAPS?|CAPSULES?|T|C)\b/.exec(n);
  if (m || /\b(TABS?|CAPS?|CAPSULES?|TABLETS?|F\.?C\.?T|EFF)\b|قرص|كبسول/.test(n)) {
    if (m && parts > 1 && Number(m[1]) === parts) return /^C/.test(m[2]) ? 'الكبسولة' : 'القرص';
    return 'الشريط';
  }
  if (/\bAMPS?\b|\d\s*AMP|AMPOULE|أمبول|امبول/.test(n)) return 'الأمبول';
  if (/SACHETS?|كيس/.test(n)) return 'الكيس';
  if (/\bVIALS?\b|فيال/.test(n)) return 'الفيال';
  return 'الوحدة';
}
export function itemFact(it: Item, st?: Stock): string {
  const price = it.price ?? st?.price, parts = Number(st?.parts) || 1, there = it.status !== 'unavailable';
  // a box sold in parts (strips, ampoules…): the box's price and the part's, so a customer asking for one strip is told its price
  const priceText = price == null || !there ? ''
    : parts > 1 ? ` · العلبة ${money(price)} (فيها ${parts}) · ${partWord(it.name, parts)} ${money(Math.round((Number(price) / parts) * 100) / 100)}`
    : ` · ${money(price)}`;
  return `${it.name}${it.arabic_name ? ` (${it.arabic_name})` : ''}: ${STATUS_AR[it.status] || it.status}${priceText}` + (st?.packs ? ` · ${Number(st.packs)} علبة` : '');
}
// which store item he means (owner 2026-11-14 «لما العميل يطلب كذا صنف مرة واحدة يجهزله حسابهم كام»): every number he said
// (500, 300) must be in the name, then the most of his words; one best (or one in stock among the best) is chosen, else
// he is asked which (choices)
export function pickItem(asked: { name?: string; english?: string }, hits: Item[]): { item: Item | null; choices: Item[] } {
  if (!hits.length) return { item: null, choices: [] };
  const words = itemTerms(ascii(`${asked.english || ''} ${asked.name || ''}`)).map((w) => w.toUpperCase());
  const nums = [...new Set(words.filter((w) => /^\d+(\.\d+)?$/.test(w)))], names = words.filter((w) => !/^\d/.test(w));
  const text = (it: Item) => ascii(`${it.name} ${it.arabic_name || ''}`).toUpperCase();
  let left = hits.filter((it) => nums.every((n) => new RegExp(`(^|[^0-9.])${n.replace('.', '\\.')}([^0-9]|$)`).test(text(it))));
  if (!left.length) return { item: null, choices: hits.slice(0, 4) };
  const score = (it: Item) => names.filter((w) => text(it).includes(w)).length;
  const best = Math.max(...left.map(score));
  left = left.filter((it) => score(it) === best);
  if (left.length === 1) return { item: left[0], choices: [] };
  const inStock = left.filter((it) => it.status === 'available');
  if (inStock.length === 1) return { item: inStock[0], choices: [] };
  return { item: null, choices: (inStock.length ? inStock : left).slice(0, 4) };
}
type Asked = { name?: string; english?: string; qty?: number; unit?: string };
// the bill, worked out here (never by Gemini): each chosen item in stock × what he asked (a strip / a box), and the total
export function billFacts(lines: { asked: Asked; item: Item | null; choices: Item[] }[], stock: Stock[]): string[] {
  const out: string[] = [], bill: string[] = [];
  let total = 0;
  for (const { asked, item, choices } of lines) {
    const label = asked.name || asked.english || '';
    if (!item) { if (choices.length) out.push(`محتاج يحدد «${label}»: ` + choices.map((c) => `${c.name}${c.price != null && c.status !== 'unavailable' ? ` ${money(c.price)}` : ''} (${STATUS_AR[c.status] || c.status})`).join('، ')); continue; }
    if (item.status !== 'available' || item.price == null) { out.push(`${item.status === 'on_order' ? 'بالطلب' : 'مش متوفر'}: ${item.name}`); continue; }
    const st = stock.find((s) => s.item_id === item.id), parts = Number(st?.parts) || 1, qty = Math.max(1, Math.min(100, Math.round(Number(asked.qty) || 1)));
    const pw = partWord(item.name, parts), single = pw === 'القرص' || pw === 'الكبسولة', eachPart = Math.round((Number(item.price) / parts) * 100) / 100;
    // a strip asked of a box sold by the tablet (or one tablet of a box sold in strips): not guessed, he is told how it is sold
    const wantStrip = asked.unit === 'strip' || asked.unit === 'part', wantPiece = asked.unit === 'piece';
    if (parts > 1 && ((wantStrip && single) || (wantPiece && !single))) {
      out.push(`${item.name}: بيتباع ب${single ? 'القرص' : 'الشريط'} مش ب${single ? 'الشريط' : 'القرص'}: ${pw} ${money(eachPart)}، والعلبة (فيها ${parts}) ${money(item.price)}. اسأله عايز كام`);
      continue;
    }
    const part = (wantStrip || wantPiece) && parts > 1, each = part ? eachPart : Number(item.price);
    const unitWord = part ? pw.replace(/^ال/, '') : 'علبة', sum = Math.round(each * qty * 100) / 100;
    total += sum;
    bill.push(`${item.name}${item.arabic_name ? ` (${item.arabic_name})` : ''} · ${qty} ${unitWord} × ${money(each)} = ${money(sum)}`);
  }
  if (bill.length) out.unshift('الحساب:\n' + bill.join('\n') + `\nالإجمالي: ${money(Math.round(total * 100) / 100)}`);
  return out;
}
// the bill's total is always in the answer (the live test 2026-11-14 wrote the lines and left the total out): added before a
// closing question when the answer does not say it
export function withTotal(body: string, facts: string[]): string {
  const bill = facts.find((f) => f.startsWith('الحساب:'));
  const total = bill && (bill.match(/الإجمالي: (.+)$/) || [])[1];
  if (!body || !total || body.includes(total)) return body;
  const lines = body.split('\n'), last = lines[lines.length - 1];
  if (lines.length > 1 && /[؟?]\s*$/.test(last)) { lines.splice(lines.length - 1, 0, `الإجمالي: ${total}`); return lines.join('\n'); }
  return `${body}\nالإجمالي: ${total}`;
}
// the credit customer whose saved number this is (ar_customer_phones keeps 201xxxxxxxxx)
export const PHONE_ACCOUNT_FACT = 'رقمه متسجل على حساب آجل عندنا، بس مش متأكدين إنه هو صاحب الرقم: ما تقولش أي مبلغ ولا اسم الحساب، وقوله إننا لقينا حسابه وهنبعتله رابط حسابه على الواتس على نفس الرقم يشوف فيه رصيده وكشفه';
async function phoneAccount(rows: (p: string) => Promise<unknown[]>, phone: string): Promise<{ id: number; name: string; balance: number; stopped: boolean } | null> {
  if (!/^01\d{9}$/.test(phone)) return null;
  const p = (await rows(`/rest/v1/ar_customer_phones?select=customer_id&phone=eq.2${phone}&limit=1`))[0] as { customer_id?: number } | undefined;
  if (!p?.customer_id) return null;
  const c = (await rows(`/rest/v1/ar_customers?select=id,name,balance&id=eq.${p.customer_id}&limit=1`))[0] as { id: number; name: string; balance: number } | undefined;
  if (!c) return null;
  const stopped = (await rows(`/rest/v1/ar_customer_stops?select=customer_id&customer_id=eq.${c.id}&limit=1`)).length > 0;
  return { id: c.id, name: c.name, balance: Number(c.balance) || 0, stopped };
}
export function accountFact(balance: number, stopped: boolean): string {
  const b = Number(balance) || 0;
  return (b > 0.5 ? `حسابه: عليه ${money(b)}` : b < -0.5 ? `حسابه: له ${money(-b)}` : 'حسابه: خالص') + (stopped ? ' · الآجل موقوف' : '');
}
export function orderFact(o: { id: number; status: string; total?: number | null; created_at: string }): string {
  return `طلب رقم ${o.id}: ${ORDER_AR[o.status] || o.status}${o.total != null ? ` · ${money(o.total)}` : ''} · ${String(o.created_at).slice(0, 10)}`;
}
type Msg = { id: number; at: string; sender: string; kind: string; body: string | null; media: string | null };
// the talk as Gemini reads it: the messages still waiting for an answer are marked
export function talkText(history: Msg[], waitingFrom: number): string {
  return history.map((m) => {
    const who = m.sender === 'pharmacy' ? 'الصيدلية' : 'العميل', wait = m.sender === 'customer' && m.id >= waitingFrom ? ' (مستنية رد)' : '';
    const what = m.kind === 'photo' ? '[صورة]' : m.kind === 'voice' ? `[فويس] ${m.body || '(لسه ما اتكتبش)'}` : m.kind === 'file' ? `[ملف] ${m.body || ''}` : String(m.body || '');
    return `${who}${wait}: ${what}`;
  }).join('\n');
}

function b64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
async function gem(env: Env, fetchImpl: typeof fetch, parts: unknown[], schema: unknown): Promise<Record<string, unknown>> {
  const model = (env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  for (const config of [{ responseSchema: schema }, {}]) {
    const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY as string }, signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json', ...config } }),
    });
    if (r.status === 400 && 'responseSchema' in config) continue;
    if (!r.ok) throw new Error('gemini ' + r.status);
    const out = await r.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = String(out?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '').trim();
    try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw new Error('gemini answer'); }
  }
  throw new Error('gemini schema');
}

export type Ctx = { env: Env; fetchImpl: typeof fetch; base: string; sh: Record<string, string>; rows: (path: string) => Promise<unknown[]> };
export type Chat = { id: string; customer_id: number | null; name: string; phone: string | null };
export type Draft = { for_msg: number; kind: Kind; body: string; facts: string[] };
// the suggestion for a chat, or why there is none (answered already, a voice note whose words are not written yet, done before)
export async function makeDraft(ctx: Ctx, chat: Chat): Promise<{ skipped?: string; draft?: Draft }> {
  const { env, fetchImpl, base, sh, rows } = ctx;
  const recent = (await rows(`/rest/v1/ar_chat_messages?select=id,at,sender,kind,body,media&chat_id=eq.${chat.id}&order=id.desc&limit=30`) as Msg[]).reverse();
  let from = recent.length;
  while (from > 0 && recent[from - 1].sender === 'customer') from--;
  const waiting = recent.slice(from);
  if (!waiting.length) return { skipped: 'answered' };
  const last = waiting[waiting.length - 1];
  if (last.kind === 'voice' && !last.body) return { skipped: 'words' };
  if ((await rows(`/rest/v1/ar_chat_drafts?select=id&chat_id=eq.${chat.id}&for_msg=eq.${last.id}&limit=1`)).length) return { skipped: 'done' };
  const history = recent.slice(Math.max(0, from - 8));
  // the photos waiting for an answer (a prescription, a box): Gemini sees them
  const photos: unknown[] = [];
  for (const m of waiting.filter((x) => x.kind === 'photo' && x.media).slice(-MAX_PHOTOS)) {
    const f = await fetchImpl(`${base}/storage/v1/object/ar-chat/${m.media}`, { headers: sh, signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!f || !f.ok) continue;
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (bytes.length && bytes.length <= 6 * 1024 * 1024) photos.push({ inline_data: { mime_type: /\.png$/.test(String(m.media)) ? 'image/png' : /\.webp$/.test(String(m.media)) ? 'image/webp' : 'image/jpeg', data: b64(bytes) } });
  }
  const talk = talkText(history, waiting[0].id);
  const ask = await gem(env, fetchImpl, [{ text: EXTRACT_PROMPT + '\n\nالمحادثة:\n' + talk }, ...photos], EXTRACT_SCHEMA);
  const kind: Kind = (KINDS as readonly string[]).includes(String(ask.kind)) ? ask.kind as Kind : 'other';
  const named = (Array.isArray(ask.items) ? ask.items : []).slice(0, MAX_ITEMS) as Asked[];
  // the facts: each named item in the store (with its boxes in stock), the bill, his account, his orders
  const facts: string[] = [];
  const found: Item[] = [], asked: { asked: Asked; hits: Item[] }[] = [];
  for (const n of named) {
    let terms = itemTerms(n.english || n.name || '').slice(0, 3), hits: Item[] = [];
    if (terms.length) hits = await rows('/rest/v1/' + itemsPath(terms)) as Item[];
    if (!hits.length && terms.length > 1) hits = await rows('/rest/v1/' + itemsPath(terms.slice(0, 1))) as Item[];
    if (!hits.length && n.english && n.name) {
      terms = itemTerms(n.name).slice(0, 2);
      if (terms.length) hits = await rows('/rest/v1/' + itemsPath(terms)) as Item[];
      if (!hits.length && terms.length > 1) hits = await rows('/rest/v1/' + itemsPath(terms.slice(0, 1))) as Item[];
    }
    if (!hits.length) facts.push(`${n.name}: مش لاقيينه في أصنافنا`);
    found.push(...hits); asked.push({ asked: n, hits });
  }
  const ids = [...new Set(found.map((x) => x.id))];
  const stock = ids.length ? await rows(`/rest/v1/ar_stock?select=item_id,packs,units,parts,price&item_id=in.(${ids.join(',')})`) as Stock[] : [];
  const seen = new Set<number>();
  for (const it of found) { if (seen.has(it.id)) continue; seen.add(it.id); facts.push(itemFact(it, stock.find((s) => s.item_id === it.id))); }
  facts.unshift(...billFacts(asked.filter((a) => a.hits.length).map((a) => ({ asked: a.asked, ...pickItem(a.asked, a.hits) })), stock));
  // shown to the pharmacy under the answer, never given to Gemini (an amount for a number nobody checked)
  const ownerFacts: string[] = [];
  if (chat.customer_id) {
    const c = (await rows(`/rest/v1/ar_customers?select=balance&id=eq.${chat.customer_id}&limit=1`))[0] as { balance?: number } | undefined;
    const stopped = (await rows(`/rest/v1/ar_customer_stops?select=customer_id&customer_id=eq.${chat.customer_id}&limit=1`)).length > 0;
    if (c) facts.push(accountFact(Number(c.balance), stopped));
  } else {
    // a number typed on the page that is a credit customer's (owner 2026-11-14, his choice «أ»): he is told we found his
    // account and that its link comes on WhatsApp to that number; the amount only for the pharmacy
    const acct = chat.phone ? await phoneAccount(rows, chat.phone) : null;
    if (acct) {
      facts.push(PHONE_ACCOUNT_FACT);
      ownerFacts.push(`📇 الرقم ده متسجل على حساب آجل: ${acct.name} · كود ${acct.id} · ${accountFact(acct.balance, acct.stopped).replace(/^حسابه: /, '')}`);
    } else if (kind === 'account') facts.push('العميل ده كاش، مالوش حساب آجل عندنا');
  }
  const orFilter = chat.customer_id ? `customer_id=eq.${chat.customer_id}` : chat.phone ? `phone=eq.${chat.phone}` : '';
  if (orFilter) for (const o of await rows(`/rest/v1/ar_store_orders?select=id,status,total,created_at&${orFilter}&order=id.desc&limit=3`) as { id: number; status: string; total: number; created_at: string }[]) facts.push(orderFact(o));
  // the greeting only once (owner 2026-11-14: «الكلام دافى بس فى اول المحادثه»): the pharmacy answered him before = not first
  const first = !history.some((m) => m.sender === 'pharmacy');
  const out = await gem(env, fetchImpl, [{ text: REPLY_PROMPT + '\n\nاسم العميل: ' + (chat.name || 'مش معروف') + '\nأول رد في المحادثة: ' + (first ? 'أيوه' : 'لأ') + '\n\nالمحادثة:\n' + talk + '\n\nهو عايز: ' + String(ask.summary || '') + '\n\nfacts:\n' + (facts.join('\n') || '(مفيش)') }, ...photos], REPLY_SCHEMA);
  const body = withTotal(String(out.body || '').replace(/\s+\n/g, '\n').trim(), facts).slice(0, 2000);
  if (!body) throw new Error('empty answer');
  return { draft: { for_msg: last.id, kind, body, facts: [...ownerFacts, ...facts].slice(0, 24) } };
}
