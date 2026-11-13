/* «حسب داتا الساعة …»: how old the shortage list's pharmacy data is, for the strip under the app bar.
   Source: the newest successful ar_sync_log row (the laptop sends the list there). data_at and the times are
   Cairo wall-clock text 'yyyy-MM-dd HH:mm:ss'. Green under 6 hours, yellow 6 to 12, red over 12. */
(function (root) {
  'use strict';
  const TZ = 'Africa/Cairo',
    HOUR = 3600e3,
    WARN_HOURS = 6,
    BAD_HOURS = 12;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  // the Cairo wall clock at an instant
  function cairoParts(ms) {
    const p = {};
    for (const x of fmt.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = +x.value;
    return p;
  }
  // 'yyyy-MM-dd HH:mm:ss' (or an ISO string with a zone) → epoch ms; NaN when unreadable
  function cairoEpoch(s) {
    const t = String(s || '').trim();
    // timestamptz from the database (ar_sync_log.at): '2026-11-06T10:01:13.046292+00:00'
    if (/[zZ]$|[+-]\d\d:?\d\d$/.test(t)) return Date.parse(t.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1'));
    const m = t.match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?/);
    if (!m) return NaN;
    const wall = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    let ms = wall - 2 * HOUR; // first guess: UTC+2
    for (let i = 0; i < 2; i++) {
      const p = cairoParts(ms);
      ms += wall - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    }
    return ms;
  }
  const dayNo = (p) => Date.UTC(p.year, p.month - 1, p.day) / 864e5;
  const two = (n) => String(n).padStart(2, '0');
  // «النهارده 4:30 م» / «امبارح 11:45 م» / «يوم 03-11 9:05 ص»
  function when(ms, now) {
    const p = cairoParts(ms),
      d = dayNo(cairoParts(now)) - dayNo(p);
    const day = d === 0 ? 'النهارده' : d === 1 ? 'امبارح' : `يوم ${two(p.day)}-${two(p.month)}`;
    const h = p.hour % 12 || 12;
    return `${day} ${h}:${two(p.minute)} ${p.hour < 12 ? 'ص' : 'م'}`;
  }
  // «من 20 دقيقة» / «من ساعتين» / «من 17 ساعة» / «من 3 أيام»
  function ago(ms) {
    const min = Math.max(0, Math.floor(ms / 60e3));
    const say = (n, one, twoW, few, many) =>
      n === 1 ? one : n === 2 ? twoW : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
    if (min < 1) return 'دلوقتي';
    if (min < 60) return 'من ' + say(min, 'دقيقة', 'دقيقتين', 'دقايق', 'دقيقة');
    const h = Math.floor(min / 60);
    if (h < 48) return 'من ' + say(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
    return 'من ' + say(Math.floor(h / 24), 'يوم', 'يومين', 'أيام', 'يوم');
  }
  // «5:00 م» when it is the same Cairo day as ref, else the full «امبارح 11:45 م»
  function whenAfter(ms, ref, now) {
    const p = cairoParts(ms);
    if (dayNo(p) !== dayNo(cairoParts(ref))) return when(ms, now);
    return `${p.hour % 12 || 12}:${two(p.minute)} ${p.hour < 12 ? 'ص' : 'م'}`;
  }
  // row: { at, data_at } of the newest send of any kind from ar_sync_log, or null. listRow (optional): the newest send of the
  // shortage list itself (null = none yet); the list goes twice a day only, so it is shown apart. Returns what the strip shows.
  // Owner 2026-11-13 («أيوه الوقتين»): the strip says when the bot was last updated AND when the last sale was
  // («آخر تحديث النهارده 5:16 م · آخر بيع 5:00 م»): with no sale for a while the old line looked like no update at all.
  // «من …» counts from the update; the colour still goes by the sale data (6 / 12 hours), as before.
  function describe(row, now = Date.now(), listRow = undefined) {
    const data = cairoEpoch(row && row.data_at),
      sent = cairoEpoch(row && row.at);
    if (!row || !isFinite(data)) return { level: 'none', text: 'لسه مفيش نواقص اتبعتت من اللاب', ago: '', details: [] };
    const age = now - data,
      level = age < WARN_HOURS * HOUR ? 'good' : age < BAD_HOURS * HOUR ? 'warn' : 'bad';
    const both = isFinite(sent) ? 'آخر تحديث ' + when(sent, now) + ' · آخر بيع ' + whenAfter(data, sent, now) : 'آخر بيع ' + when(data, now);
    const text = (level === 'bad' ? 'الداتا قديمة: ' : '') + both;
    const details = [];
    if (isFinite(sent)) details.push('آخر مرة اللاب بعت: ' + when(sent, now));
    if (listRow === undefined) details.push('النواقص محسوبة على نسخة الصيدلية: ' + when(data, now));
    else {
      details.push('داتا الصيدلية عند اللاب: ' + when(data, now));
      const ls = cairoEpoch(listRow && listRow.at),
        ld = cairoEpoch(listRow && listRow.data_at);
      // listRow === false: the list's own send is older than the newest sends that were read
      details.push(isFinite(ls) ? 'آخر تحديث للنواقص: ' + when(ls, now) + (isFinite(ld) ? ' (على نسخة ' + when(ld, now) + ')' : '') : listRow === false ? 'آخر تحديث للنواقص: من أكتر من 5 أيام' : 'النواقص لسه ما اتحدثتش');
    }
    return { level, text, ago: ago(isFinite(sent) ? now - sent : age), details };
  }
  const api = { cairoEpoch, describe, when, ago, WARN_HOURS, BAD_HOURS };
  if (typeof module !== 'undefined') module.exports = api;
  else root.AskerDataAge = api;
})(typeof window === 'undefined' ? globalThis : window);
