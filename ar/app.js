/* Trial bot (asker-nawaqes-arabic.html): login, shortage list, Arabic names, supplier input, WhatsApp. */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://qwrzdjdgvanmhaicncuk.supabase.co',
    SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_af0XfsvB0Fwwo3HORqMN2g_iJNd9o0q',
    FN = 'arabic-shortages',
    OFFER_MIN = 0.45;
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const $ = (id) => document.getElementById(id),
    esc = (s) =>
      String(s ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      );
  const key = (s) =>
    String(s || '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  // Arabic names and answers are kept per product (English name), so an item that leaves the shortage list and comes
  // back later keeps its approved translation. Same key as the function and the database.
  const nk = (s) => key(s).slice(0, 250);
  async function loadNames() {
    const byKey = new Map((await all('ar_names', 'name_key,arabic_name,status')).map((n) => [n.name_key, n]));
    names = new Map();
    shortages.forEach((x) => {
      const n = byKey.get(nk(x.product_name));
      if (n) names.set(x.id, n);
    });
  }
  const status = (id, m, cls = '') => {
    $(id).textContent = m;
    $(id).className = 'status ' + cls;
  };
  let shortages = [],
    names = new Map(),
    show = 'suggested',
    shown = 30,
    results = [],
    undo = null,
    stopAll = false;

  async function invoke(body) {
    const { data, error } = await client.functions.invoke(FN, { body });
    if (error) {
      let m = error.message;
      try {
        const j = await error.context?.json?.();
        if (j?.message) m = j.message;
      } catch (e) {}
      throw Error(m);
    }
    return data;
  }
  async function all(table, cols, q = (x) => x) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await q(client.from(table).select(cols))
        .order(table === 'ar_names' ? 'name_key' : 'id')
        .range(from, from + 999);
      if (error) throw Error(error.message);
      out.push(...(data || []));
      if (!data || data.length < 1000) return out;
    }
  }

  // ---------- login ----------
  async function refresh() {
    const { data } = await client.auth.getSession();
    const on = !!data.session;
    $('loginCard').classList.toggle('hidden', on);
    $('app').classList.toggle('hidden', !on);
    if (on) await loadAll();
  }
  $('loginBtn').onclick = async () => {
    status('loginStatus', 'بيدخل…');
    const { error } = await client.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('password').value,
    });
    if (error) {
      status('loginStatus', 'مادخلش: ' + error.message, 'bad');
      return;
    }
    status('loginStatus', '');
    refresh();
  };
  $('logoutBtn').onclick = async () => {
    await client.auth.signOut();
    refresh();
  };
  document.querySelectorAll('[data-tab]').forEach(
    (b) =>
      (b.onclick = () => {
        document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('secondary', x !== b));
        $('shortPanel').classList.toggle('hidden', b.dataset.tab !== 'short');
        $('translatePanel').classList.toggle('hidden', b.dataset.tab !== 'translate');
        $('readPanel').classList.toggle('hidden', b.dataset.tab !== 'read');
      }),
  );

  async function loadShortages() {
    shortages = (await all('ar_shortages', 'id,product_name', (q) => q.eq('is_active', true))).sort((a, b) =>
      a.product_name.localeCompare(b.product_name),
    );
  }
  async function loadAll() {
    try {
      await loadShortages();
      await loadNames();
      drawTranslate();
      drawShort();
      await loadSuppliers();
      await takeShare();
    } catch (e) {
      status('trStatus', 'تعذّر التحميل: ' + e.message, 'bad');
    }
  }

  // ---------- shortages (this bot's own list) ----------
  function drawShort() {
    $('shStats').innerHTML =
      `<div class="stat"><strong>${shortages.length}</strong>صنف في النواقص</div><div class="stat"><strong>${shortages.filter((s) => names.has(s.id)).length}</strong>ليهم اسم عربي</div><div class="stat"><strong>${[...names.values()].filter((n) => n.status === 'approved').length}</strong>اتأكدت منك</div>`;
  }
  const cleanNames = (list) => {
    const byKey = new Map();
    for (const v of list) {
      const n = String(v ?? '')
        .split(/[|\t]/)[0]
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 250);
      if (n.length >= 2 && /\p{L}/u.test(n) && !byKey.has(nk(n))) byKey.set(nk(n), n);
    }
    return byKey;
  };
  async function afterSave(msg) {
    await loadShortages();
    await loadNames();
    drawShort();
    drawTranslate();
    const noAr = shortages.filter((s) => !names.has(s.id)).length;
    status(
      'shStatus',
      msg +
        ` النواقص دلوقتي ${shortages.length} صنف، منهم ${shortages.length - noAr} ليهم ترجمة محفوظة.${noAr ? ` فيه ${noAr} صنف لسه ماليهمش اسم عربي: ترجمهم من «٢. ترجمة النواقص».` : ''}`,
      'good',
    );
  }
  async function upsertActive(byKey) {
    const rows = [...byKey].map(([name_key, product_name]) => ({ name_key, product_name, is_active: true }));
    for (let i = 0; i < rows.length; i += 500) {
      status('shStatus', `بيحفظ ${Math.min(i + 500, rows.length)} من ${rows.length}…`);
      const { error } = await client.from('ar_shortages').upsert(rows.slice(i, i + 500), { onConflict: 'name_key' });
      if (error) throw Error(error.message);
    }
  }
  // typed lines: added to the list, nothing taken out
  async function addShortages(list, btn) {
    const byKey = cleanNames(list);
    if (!byKey.size) {
      status('shStatus', 'مفيش أسماء أصناف.', 'bad');
      return;
    }
    const have = new Set(shortages.map((s) => nk(s.product_name))),
      fresh = [...byKey.keys()].filter((k) => !have.has(k)).length;
    btn.disabled = true;
    try {
      await upsertActive(byKey);
      await afterSave(`اتضاف ${fresh} صنف جديد، و${byKey.size - fresh} كانوا موجودين.`);
      $('shText').value = '';
    } catch (e) {
      status('shStatus', 'ماتحفظش: ' + e.message, 'bad');
    }
    btn.disabled = false;
  }
  // the shop's file replaces the list: names not in it leave the list (is_active=false, nothing deleted); Arabic names
  // (ar_names) and answers are kept per product name, so a name that comes back later finds its translation again
  function replaceShortages(list, btn) {
    const byKey = cleanNames(list);
    $('shConfirm').classList.add('hidden');
    if (!byKey.size) {
      status('shStatus', 'مفيش أسماء أصناف في العمود ده.', 'bad');
      return;
    }
    const have = new Map(shortages.map((s) => [nk(s.product_name), s.id])),
      add = [...byKey.keys()].filter((k) => !have.has(k)).length,
      out = [...have].filter(([k]) => !byKey.has(k)).map(([, id]) => id),
      stay = byKey.size - add;
    const few = shortages.length >= 50 && byKey.size < shortages.length * 0.3;
    status(
      'shStatus',
      `الملف فيه ${byKey.size} صنف: ${add} جديد، ${stay} موجودين وهيفضلوا، و${out.length} هيطلعوا من النواقص (ترجمتهم بتفضل محفوظة).`,
      few ? 'bad' : '',
    );
    $('shConfirm').innerHTML =
      `${few ? '<p class="status bad">الملف ده أصغر بكتير من القايمة الحالية. اتأكد إنه الملف الصح وإن العمود المختار هو اسم الصنف.</p>' : ''}<button id="shYes">أيوه، استبدل</button> <button id="shNo" class="secondary">إلغاء</button>`;
    $('shConfirm').classList.remove('hidden');
    $('shNo').onclick = () => {
      $('shConfirm').classList.add('hidden');
      status('shStatus', 'اتلغى، والقايمة زي ما هي.');
    };
    $('shYes').onclick = async () => {
      $('shConfirm').classList.add('hidden');
      btn.disabled = true;
      try {
        await upsertActive(byKey);
        for (let i = 0; i < out.length; i += 200) {
          const { error } = await client
            .from('ar_shortages')
            .update({ is_active: false })
            .in('id', out.slice(i, i + 200));
          if (error) throw Error('الأصناف الجديدة اتحفظت، بس القديمة ماطلعتش: ' + error.message);
        }
        await afterSave(`اتبدلت النواقص: ${add} جديد، ${stay} فضلوا، ${out.length} طلعوا.`);
      } catch (e) {
        status('shStatus', 'ماتحفظش: ' + e.message, 'bad');
      }
      btn.disabled = false;
    };
  }
  excelPicker('shx', 'shStatus', (n, label, btn) => replaceShortages(n, btn));
  $('shTextBtn').onclick = () => addShortages($('shText').value.split(/\r?\n/), $('shTextBtn'));

  // ---------- translate ----------
  function drawTranslate() {
    const appr = [...names.values()].filter((n) => n.status === 'approved').length,
      act = shortages.filter((s) => names.has(s.id)).length;
    $('trStats').innerHTML =
      `<div class="stat"><strong>${shortages.length}</strong>نواقص</div><div class="stat"><strong>${act}</strong>اتترجمت</div><div class="stat"><strong>${appr}</strong>اتأكدت منك</div>`;
    const f = key($('trFilter').value);
    const list = shortages.filter((s) => {
      const n = names.get(s.id);
      const st = n ? n.status : 'none';
      return st === show && (!f || key(s.product_name + ' ' + (n?.arabic_name || '')).includes(f));
    });
    $('trList').innerHTML =
      list
        .slice(0, shown)
        .map((s) => {
          const n = names.get(s.id);
          return `<div class="item" data-id="${esc(s.id)}"><div class="en">${esc(s.product_name)}</div>${n ? `<input type="text" dir="auto" value="${esc(n.arabic_name)}" data-ar><button data-ok>${n.status === 'approved' ? 'احفظ التعديل' : 'تمام'}</button>` : '<p class="hint">لسه ماتترجمش.</p>'}</div>`;
        })
        .join('') || '<p class="hint">مفيش.</p>';
    $('trMore').classList.toggle('hidden', list.length <= shown);
    $('trList')
      .querySelectorAll('[data-ok]')
      .forEach(
        (b) =>
          (b.onclick = async () => {
            const box = b.closest('[data-id]'),
              id = box.dataset.id,
              ar = box.querySelector('[data-ar]').value.replace(/\s+/g, ' ').trim();
            if (ar.length < 2) return;
            b.disabled = true;
            const en = shortages.find((x) => x.id === id)?.product_name || '';
            const { error } = await client
              .from('ar_names')
              .upsert(
                {
                  name_key: nk(en),
                  english_name: en,
                  arabic_name: ar,
                  status: 'approved',
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'name_key' },
              );
            if (error) {
              status('trStatus', 'ماتحفظش: ' + error.message, 'bad');
              b.disabled = false;
              return;
            }
            shortages
              .filter((x) => nk(x.product_name) === nk(en))
              .forEach((x) => names.set(x.id, { name_key: nk(en), arabic_name: ar, status: 'approved' }));
            status('trStatus', 'اتحفظ: ' + ar, 'good');
            drawTranslate();
          }),
      );
  }
  $('trFilter').oninput = () => {
    shown = 30;
    drawTranslate();
  };
  $('trMore').onclick = () => {
    shown += 30;
    drawTranslate();
  };
  document.querySelectorAll('[data-show]').forEach(
    (b) =>
      (b.onclick = () => {
        show = b.dataset.show;
        shown = 30;
        document.querySelectorAll('[data-show]').forEach((x) => x.classList.toggle('secondary', x !== b));
        drawTranslate();
      }),
  );
  async function translateOnce() {
    const r = await invoke({ action: 'translate', limit: 60 });
    await loadNames();
    drawTranslate();
    return r;
  }
  $('trOne').onclick = async () => {
    $('trOne').disabled = true;
    status('trStatus', 'بيترجم…');
    try {
      const r = await translateOnce();
      status('trStatus', `اتترجم ${r.translated} صنف. فاضل ${r.remaining}.`, 'good');
    } catch (e) {
      status('trStatus', 'تعذّر: ' + e.message, 'bad');
    }
    $('trOne').disabled = false;
  };
  // Google's free plan also limits requests per minute: wait between batches, and after a "quota" answer wait a
  // minute and try once more; a second refusal is most likely the daily limit (back at midnight Pacific = 10 AM Cairo).
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitStoppable(sec, label) {
    for (let i = sec; i > 0; i--) {
      if (stopAll) return;
      status('trStatus', `${label} (${i} ثانية)`);
      await sleep(1000);
    }
  }
  $('trAll').onclick = async () => {
    stopAll = false;
    $('trAll').disabled = $('trOne').disabled = true;
    $('trStop').classList.remove('hidden');
    let done = 0,
      retried = false;
    for (;;) {
      if (stopAll) {
        status('trStatus', `وقفت. اتترجم ${done} صنف.`);
        break;
      }
      status('trStatus', `بيترجم… (${done} لحد دلوقتي) — سيب الصفحة مفتوحة`);
      try {
        const r = await translateOnce();
        done += r.translated;
        retried = false;
        if (!r.remaining || !r.translated) {
          status('trStatus', `خلص: اتترجم ${done} صنف.`, 'good');
          break;
        }
        await waitStoppable(12, `استنى شوية عشان حد Google في الدقيقة — اتترجم ${done}`);
      } catch (e) {
        if (/حصة|quota/i.test(e.message) && !retried) {
          retried = true;
          await waitStoppable(65, `Google قال استنى — هيكمّل لوحده`);
          continue;
        }
        status(
          'trStatus',
          `وقف بعد ${done} صنف: ${e.message}${/حصة|quota/i.test(e.message) ? ' غالبًا ده الحد اليومي، وبيتجدد الساعة ١٠ الصبح بتوقيت مصر.' : ''}`,
          'bad',
        );
        break;
      }
    }
    $('trAll').disabled = $('trOne').disabled = false;
    $('trStop').classList.add('hidden');
  };
  $('trStop').onclick = () => {
    stopAll = true;
  };

  // ---------- read ----------
  const toBase64 = (f) =>
    new Promise((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(',')[1] || '');
      r.onerror = () => no(r.error);
      r.readAsDataURL(f);
    });
  $('images').onchange = () => {
    $('readBtn').disabled = !$('images').files.length;
  };
  document.querySelectorAll('[data-src]').forEach(
    (b) =>
      (b.onclick = () => {
        document.querySelectorAll('[data-src]').forEach((x) => x.classList.toggle('secondary', x !== b));
        document
          .querySelectorAll('[data-src-box]')
          .forEach((x) => x.classList.toggle('hidden', x.dataset.srcBox !== b.dataset.src));
      }),
  );
  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  $('readBtn').onclick = () => readFiles([...$('images').files]);
  async function readFiles(files) {
    files = files.slice(0, 20);
    if (!files.length) return;
    $('readBtn').disabled = true;
    results = [];
    $('results').innerHTML = '';
    newRun();
    try {
      for (let i = 0; i < files.length; i++) {
        if (files[i].size > 8 * 1024 * 1024) throw Error(`الملف ${i + 1} أكبر من ٨ ميجا`);
        status('readStatus', `بيقرا ${isPdf(files[i]) ? 'ملف PDF' : 'الصورة'} ${i + 1} من ${files.length}…`);
        const d = await invoke({
          action: 'read',
          image: await toBase64(files[i]),
          mimeType: isPdf(files[i]) ? 'application/pdf' : files[i].type || 'image/jpeg',
        });
        results.push(...(d.rows || []).map((r) => ({ ...r, file: files[i].name })));
        if (d.supplier) guessSupplier(d.supplier);
      }
      showDone();
    } catch (e) {
      status('readStatus', 'تعذّرت القراءة: ' + e.message, 'bad');
    }
    $('readBtn').disabled = false;
  }
  function showDone() {
    drawResults();
    const n = new Set(results.filter(isSure).map((r) => r.match.id)).size,
      co = $('supplier').value.trim();
    status(
      'readStatus',
      `${co ? co + ': ' : ''}اتقرا ${results.length} سطر. وصل من النواقص: ${n}.${co ? '' : ' اختار اسم الشركة فوق.'}`,
      'good',
    );
    notifyDone(co, n);
  }
  // typed lines and Excel names: matched on the server with the same tools, no Gemini (no quota used)
  async function matchLines(lines, label, btn) {
    lines = lines.map((x) => String(x ?? '').trim()).filter((x) => x.length >= 2);
    if (!lines.length) {
      status('readStatus', 'مفيش أسماء أصناف.', 'bad');
      return;
    }
    btn.disabled = true;
    results = [];
    $('results').innerHTML = '';
    newRun();
    try {
      for (let i = 0; i < lines.length; i += 500) {
        status('readStatus', `بيقارن ${Math.min(i + 500, lines.length)} من ${lines.length}…`);
        const d = await invoke({ action: 'lines', lines: lines.slice(i, i + 500) });
        results.push(...(d.rows || []).map((r) => ({ ...r, file: label })));
      }
      showDone();
    } catch (e) {
      status('readStatus', 'تعذّرت المقارنة: ' + e.message, 'bad');
    }
    btn.disabled = false;
  }
  // Text copied from WhatsApp (several messages) starts each message with "[28/10/2026, 1:15 م] Company name: ...":
  // drop that prefix from every line, and use the sender's name as the company when none is chosen.
  const WA_PREFIX = /^\s*\[[^\]]{4,40}\]\s*([^:\n]{1,60}):\s?/;
  function waLines(text) {
    let sender = '';
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((l) => {
        const m = l.match(WA_PREFIX);
        if (m) {
          if (!sender) sender = m[1].trim();
          return l.slice(m[0].length);
        }
        return l;
      });
    return { lines, sender };
  }
  function runText(label, btn) {
    const { lines, sender } = waLines($('pasteText').value);
    if (sender && !/^\+?[\d\s-]+$/.test(sender)) guessSupplier(sender);
    return matchLines(lines, label, btn);
  }
  // WhatsApp has no «مشاركة» for text messages, only «نسخ»: one tap pastes what was copied and compares it
  $('textBtn').onclick = () => runText('مكتوب', $('textBtn'));
  $('pasteBtn').onclick = async () => {
    let t = '';
    try {
      t = await navigator.clipboard.readText();
    } catch (e) {}
    if (!t.trim()) {
      status(
        'readStatus',
        'مالقيتش كلام منسوخ. انسخ الرسايل من الواتس الأول، أو الصقها في الخانة بإيدك (ضغطة طويلة ← لصق).',
        'bad',
      );
      $('pasteText').focus();
      return;
    }
    $('pasteText').value = t;
    await runText('من الواتس', $('pasteBtn'));
  };
  let xlsxLib = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return (
      xlsxLib ||
      (xlsxLib = new Promise((ok, no) => {
        const sc = document.createElement('script');
        sc.src = 'vendor/xlsx-0.20.3.full.min.js';
        sc.onload = () => (window.XLSX ? ok(window.XLSX) : no(Error('قارئ Excel مااشتغلش')));
        sc.onerror = () => {
          xlsxLib = null;
          no(Error('قارئ Excel ماتحمّلش؛ حدّث الصفحة'));
        };
        document.head.append(sc);
      }))
    );
  }
  const NAME_HEAD = /اسم|صنف|منتج|دواء|بيان|name|item|product|description|desc/i,
    NOT_NAME =
      /سعر|خصم|كمي|عدد|رصيد|قيم|اجمال|تاريخ|كود|باركود|price|qty|quantity|disc|total|amount|code|barcode|date|expiry/i;
  // header row = the first of the top 20 rows with a name-like title; name column = that title, or else the column with the most text
  function guessSheet(m) {
    let head = -1,
      col = -1;
    for (let r = 0; r < Math.min(20, m.length) && head < 0; r++) {
      const c = (m[r] || []).findIndex(
        (v) => NAME_HEAD.test(String(v ?? '')) && !NOT_NAME.test(String(v ?? '')) && String(v).length < 40,
      );
      if (c >= 0) {
        head = r;
        col = c;
      }
    }
    const width = Math.max(0, ...m.slice(0, 200).map((r) => (r || []).length));
    if (col < 0) {
      let best = -1;
      for (let c = 0; c < width; c++) {
        const n = m.slice(0, 200).filter((r) => /\p{L}{3,}/u.test(String((r || [])[c] ?? ''))).length;
        if (n > best) {
          best = n;
          col = c;
        }
      }
    }
    return { head, col, width };
  }
  // one Excel/CSV picker (file -> name column -> names), used for the shortage list (shx) and supplier files (xls)
  function excelPicker(p, statusId, onGo) {
    let xls = null;
    const names = () => {
      const c = +$(p + 'Col').value,
        title = xls.head >= 0 ? String(xls.m[xls.head][c] ?? '').trim() : '';
      return xls.m
        .slice(xls.head + 1)
        .map((r) => String((r || [])[c] ?? '').trim())
        .filter((v) => v.length >= 2 && /\p{L}/u.test(v) && v !== title);
    };
    const preview = () => {
      const n = names();
      $(p + 'Preview').textContent = `${n.length} اسم. أول أسماء: ${n.slice(0, 3).join(' / ')}`;
    };
    $(p + 'File').onchange = async () => {
      const f = $(p + 'File').files[0];
      $(p + 'Pick').classList.add('hidden');
      xls = null;
      if (!f) return;
      try {
        if (f.size > 10 * 1024 * 1024) throw Error('الملف أكبر من ١٠ ميجا');
        status(statusId, 'بيفتح الملف…');
        const X = await loadXlsx();
        const wb = X.read(await f.arrayBuffer(), { type: 'array' });
        const m = [];
        for (const n of wb.SheetNames)
          m.push(...X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false, blankrows: false }));
        if (!m.length) throw Error('الملف فاضي');
        const g = guessSheet(m);
        xls = { m, name: f.name, head: g.head };
        const title = (c) => (g.head >= 0 ? String(m[g.head][c] ?? '').trim() : '');
        $(p + 'Col').innerHTML = Array.from(
          { length: g.width },
          (_, c) =>
            `<option value="${c}"${c === g.col ? ' selected' : ''}>عمود ${c + 1}${title(c) ? ' — ' + esc(title(c)) : ''} · مثال: ${esc(String((m.find((r, i) => i > g.head && String((r || [])[c] ?? '').trim()) || [])[c] ?? '').slice(0, 40))}</option>`,
        ).join('');
        preview();
        $(p + 'Pick').classList.remove('hidden');
        status(statusId, 'اتأكد إن العمود المختار هو اسم الصنف، وبعدين اضغط الزرار.');
      } catch (e) {
        status(statusId, 'تعذّر فتح الملف: ' + e.message, 'bad');
      }
    };
    $(p + 'Col').onchange = preview;
    $(p + 'Btn').onclick = () => xls && onGo(names(), xls.name, $(p + 'Btn'));
  }
  excelPicker('xls', 'readStatus', (n, label, btn) => matchLines(n, label, btn));
  const sName = (id) => shortages.find((s) => s.id === id)?.product_name || '',
    aName = (id) => names.get(id)?.arabic_name || '';
  const isSure = (r) => r.match && (r.match.confidence === 'high' || r.match.confidence === 'confirmed');
  const options = (r) =>
    (r.candidates || []).filter(
      (c, i, a) =>
        c.numbersOk && c.formOk !== false && (c.score ?? 1) >= OFFER_MIN && a.findIndex((x) => x.id === c.id) === i,
    );
  function pickBox(i) {
    return `<details class="pick"><summary>اختار الصنف من النواقص</summary><input type="search" data-pick-q="${i}" placeholder="اكتب جزء من الاسم"><div data-pick-list="${i}"></div></details>`;
  }
  // «تصحيح»: fix the Arabic reading and look again, or pick the item from the shortage list; «مش مهم» hides a name for good.
  function editBox(i) {
    const r = results[i];
    return `<details class="pick" data-edit="${i}"><summary>تصحيح</summary><label>الاسم العربي الصح (لو القراءة غلط)</label><input type="text" dir="auto" data-fix-text="${i}" value="${esc(r.corrected || r.name)}"><button class="secondary" data-rematch="${i}">دوّر بالاسم ده</button> <button class="secondary" data-fix-save="${i}">احفظ التصحيح بس</button><div data-rematch-list="${i}"></div><label>أو اختار الصنف من النواقص</label><input type="search" data-pick-q="${i}" placeholder="اكتب جزء من الاسم"><div data-pick-list="${i}"></div></details>`;
  }
  const fixedLine = (r) =>
    r.corrected && r.corrected !== r.name
      ? `<div class="hint">اتصحح لـ: <span dir="auto">${esc(r.corrected)}</span></div>`
      : '';
  function drawResults() {
    const arrived = new Map(),
      review = [],
      unknown = [];
    let hidden = 0;
    results.forEach((r, i) => {
      if (isSure(r)) {
        const l = arrived.get(r.match.id) || [];
        l.push(i);
        arrived.set(r.match.id, l);
        return;
      }
      if (r.ignored) {
        hidden++;
        return;
      }
      if (r.done !== 'no-all' && options(r).length) return review.push(i);
      unknown.push(i);
    });
    const conf = { confirmed: 'أكدته قبل كده', high: 'مطابقة واضحة', near: 'شبه سطر أكدته قبل كده' };
    $('results').innerHTML =
      `<h3>وصل من النواقص: ${arrived.size}</h3>` +
      ([...arrived]
        .map(
          ([id, ix]) =>
            `<div class="item"><div class="en">${esc(sName(id))}</div><div class="hint">${esc(aName(id))}</div>${ix
              .map((i) => {
                const r = results[i];
                return `<div class="hint">في الصورة: <span dir="auto">${esc(r.name)}</span> · ${conf[r.match.via === 'alias' ? 'near' : r.match.confidence] || ''} <button class="secondary" data-no="${i}:${esc(id)}">مش ده</button></div>${fixedLine(r)}`;
              })
              .join('')}</div>`,
        )
        .join('') || '<p class="hint">مفيش.</p>') +
      `<h3>محتاج تأكيدك: ${review.length}</h3>` +
      (review
        .map((i) => {
          const r = results[i];
          return `<div class="item"><strong dir="auto">${esc(r.name)}</strong>${r.unclear ? ' <span class="pill warn">قراءة مش واضحة</span>' : ''}${fixedLine(r)}<div class="hint">${esc(r.file)}</div>${options(
            r,
          )
            .map(
              (c) =>
                `<div><span class="en">${esc(sName(c.id))}</span> <span class="hint">${esc(aName(c.id))}</span> <button data-yes="${i}:${esc(c.id)}">أيوه، ده هو</button></div>`,
            )
            .join('')}<button class="secondary" data-noall="${i}">مش واحد منهم</button>${editBox(i)}</div>`;
        })
        .join('') || '<p class="hint">مفيش.</p>') +
      `<details><summary>مش من النواقص أو مااتعرفتش: ${unknown.length}</summary><p class="hint">لو فيه صنف من النواقص اختاره من «تصحيح». ولو اسم مش مهم اضغط «مش مهم» ومش هيظهر تاني.</p>${unknown.map((i) => `<div class="item"><span dir="auto">${esc(results[i].name)}</span>${fixedLine(results[i])} <button class="secondary" data-ignore="${i}">مش مهم</button>${editBox(i)}</div>`).join('')}${hidden ? `<p class="hint">واتخبّى ${hidden} اسم قلت قبل كده إنهم مش مهمين.</p>` : ''}</details>`;
    wire();
    drawMessage();
  }
  async function decide(i, id, decision) {
    const r = results[i],
      k = nk(sName(id));
    const row = { alias_key: r.key, read_text: r.name.slice(0, 250), name_key: k, decision };
    let removed = [];
    if (decision === 'yes') {
      const { data } = await client
        .from('ar_answers')
        .select('id,alias_key,read_text,name_key,decision')
        .eq('alias_key', r.key)
        .eq('decision', 'yes');
      removed = (data || []).filter((x) => x.name_key !== k);
      if (removed.length)
        await client
          .from('ar_answers')
          .delete()
          .in(
            'id',
            removed.map((x) => x.id),
          );
    }
    const { data, error } = await client
      .from('ar_answers')
      .upsert(row, { onConflict: 'alias_key,name_key' })
      .select('id');
    if (error) throw Error(error.message);
    return { ids: (data || []).map((x) => x.id), removed };
  }
  function setUndo(label, u, before, i) {
    undo = { u, before, i };
    $('undoBar').innerHTML = `${esc(label)} <button class="secondary" id="undoBtn">تراجع</button>`;
    $('undoBar').classList.remove('hidden');
    $('undoBtn').onclick = async () => {
      const x = undo;
      if (!x) return;
      undo = null;
      $('undoBar').classList.add('hidden');
      for (const u of x.u) {
        if (u.ids?.length) await client.from('ar_answers').delete().in('id', u.ids);
        if (u.removed?.length) await client.from('ar_answers').insert(u.removed.map(({ id, ...y }) => y));
        if (u.ignoreKey) await client.from('ar_ignored').delete().eq('alias_key', u.ignoreKey);
        if (u.fixKey) {
          if (u.fixBefore) await client.from('ar_fixes').upsert(u.fixBefore, { onConflict: 'read_key' });
          else await client.from('ar_fixes').delete().eq('read_key', u.fixKey);
        }
      }
      Object.assign(results[x.i], x.before);
      drawResults();
      status('readStatus', 'اتلغى.');
    };
  }
  function wire() {
    const box = $('results');
    box.querySelectorAll('[data-ignore]').forEach(
      (b) =>
        (b.onclick = async () => {
          const i = b.dataset.ignore,
            r = results[i];
          b.disabled = true;
          const { error } = await client
            .from('ar_ignored')
            .upsert({ alias_key: r.key, read_text: r.name.slice(0, 250) }, { onConflict: 'alias_key' });
          if (error) {
            status('readStatus', 'ماتحفظش: ' + error.message, 'bad');
            b.disabled = false;
            return;
          }
          r.ignored = true;
          drawResults();
          setUndo(`«${r.name}» مش هيظهر تاني.`, [{ ignoreKey: r.key }], { ignored: false }, i);
        }),
    );
    const fixText = (i) => box.querySelector(`[data-fix-text="${i}"]`).value.replace(/\s+/g, ' ').trim();
    async function saveFix(i, text) {
      const r = results[i];
      const { data: old } = await client
        .from('ar_fixes')
        .select('read_key,read_text,corrected_text')
        .eq('read_key', r.key);
      const { error } = await client
        .from('ar_fixes')
        .upsert({ read_key: r.key, read_text: r.name.slice(0, 250), corrected_text: text }, { onConflict: 'read_key' });
      if (error) throw Error(error.message);
      return { fixKey: r.key, fixBefore: old?.[0] || null };
    }
    box.querySelectorAll('[data-fix-save]').forEach(
      (b) =>
        (b.onclick = async () => {
          const i = b.dataset.fixSave,
            r = results[i],
            t = fixText(i);
          if (t.length < 2 || t === r.name) {
            status('readStatus', 'اكتب الاسم الصح الأول.', 'bad');
            return;
          }
          b.disabled = true;
          try {
            const u = await saveFix(i, t);
            const before = { corrected: r.corrected, match: r.match, candidates: r.candidates };
            const d = await invoke({ action: 'match', name: t, english: r.english || '', read: r.name });
            r.corrected = t;
            if (d?.row) {
              r.match = d.row.match;
              r.candidates = d.row.candidates;
            }
            drawResults();
            setUndo(`اتحفظ التصحيح: «${r.name}» ← «${t}». المرة الجاية هيتقري صح لوحده.`, [u], before, i);
          } catch (e) {
            status('readStatus', 'ماتحفظش: ' + e.message, 'bad');
            b.disabled = false;
          }
        }),
    );
    box.querySelectorAll('[data-rematch]').forEach(
      (b) =>
        (b.onclick = async () => {
          const i = b.dataset.rematch,
            r = results[i],
            t = fixText(i),
            out = box.querySelector(`[data-rematch-list="${i}"]`);
          if (t.length < 2) return;
          b.disabled = true;
          out.innerHTML = '<p class="hint">بيدوّر…</p>';
          try {
            const d = await invoke({ action: 'match', name: t, english: '', read: r.name });
            const opts = (d?.row?.candidates || []).filter((c) => (c.score ?? 1) >= 0.3);
            out.innerHTML =
              opts
                .map(
                  (c) =>
                    `<div><span class="en">${esc(sName(c.id))}</span> <span class="hint">${esc(aName(c.id))}${c.numbersOk === false ? ' · التركيز مختلف' : ''}${c.formOk === false ? ' · الشكل مختلف' : ''}</span> <button data-fixpick="${i}:${esc(c.id)}">اختار ده</button></div>`,
                )
                .join('') || '<p class="hint">مالقيتش صنف قريب في النواقص.</p>';
            out.querySelectorAll('[data-fixpick]').forEach(
              (p) =>
                (p.onclick = async () => {
                  const [i2, id] = p.dataset.fixpick.split(':');
                  const r2 = results[i2],
                    t2 = fixText(i2),
                    before = { match: r2.match, done: r2.done, corrected: r2.corrected };
                  p.disabled = true;
                  try {
                    const us = [];
                    if (t2 !== r2.name) us.push(await saveFix(i2, t2));
                    us.push(await decide(i2, id, 'yes'));
                    r2.corrected = t2 !== r2.name ? t2 : r2.corrected;
                    r2.match = { id, confidence: 'confirmed', score: 1 };
                    r2.done = null;
                    drawResults();
                    setUndo(`اتحفظ: «${r2.name}» = ${sName(id)}`, us, before, i2);
                  } catch (e) {
                    status('readStatus', 'ماتحفظش: ' + e.message, 'bad');
                    p.disabled = false;
                  }
                }),
            );
          } catch (e) {
            out.innerHTML = '<p class="status bad">تعذّر البحث: ' + esc(e.message) + '</p>';
          }
          b.disabled = false;
        }),
    );
    box.querySelectorAll('[data-yes]').forEach(
      (b) =>
        (b.onclick = async () => {
          const [i, id] = b.dataset.yes.split(':');
          const r = results[i],
            before = { match: r.match, done: r.done };
          b.disabled = true;
          try {
            const u = await decide(i, id, 'yes');
            r.match = { id, confidence: 'confirmed', score: 1 };
            drawResults();
            setUndo(`اتحفظ: «${r.name}» = ${sName(id)}`, [u], before, i);
          } catch (e) {
            status('readStatus', 'ماتحفظش: ' + e.message, 'bad');
            b.disabled = false;
          }
        }),
    );
    box.querySelectorAll('[data-no]').forEach(
      (b) =>
        (b.onclick = async () => {
          const [i, id] = b.dataset.no.split(':');
          const r = results[i],
            before = { match: r.match, candidates: r.candidates, done: r.done };
          b.disabled = true;
          try {
            const u = await decide(i, id, 'no');
            r.match = null;
            r.candidates = (r.candidates || []).filter((c) => c.id !== id);
            drawResults();
            setUndo(`اتسجّل إن «${r.name}» مش ${sName(id)}`, [u], before, i);
          } catch (e) {
            status('readStatus', 'ماتحفظش: ' + e.message, 'bad');
            b.disabled = false;
          }
        }),
    );
    box.querySelectorAll('[data-noall]').forEach(
      (b) =>
        (b.onclick = async () => {
          const i = b.dataset.noall,
            r = results[i],
            before = { match: r.match, candidates: r.candidates, done: r.done };
          b.disabled = true;
          try {
            const us = [];
            for (const c of options(r)) us.push(await decide(i, c.id, 'no'));
            r.done = 'no-all';
            drawResults();
            setUndo(`اتسجّل إن «${r.name}» مش واحد منهم`, us, before, i);
          } catch (e) {
            status('readStatus', 'ماتحفظش: ' + e.message, 'bad');
            b.disabled = false;
          }
        }),
    );
    box.querySelectorAll('[data-pick-q]').forEach(
      (inp) =>
        (inp.oninput = () => {
          const i = inp.dataset.pickQ,
            f = key(inp.value),
            out = box.querySelector(`[data-pick-list="${i}"]`);
          if (f.length < 2) {
            out.innerHTML = '';
            return;
          }
          out.innerHTML =
            shortages
              .filter((s) => key(s.product_name + ' ' + aName(s.id)).includes(f))
              .slice(0, 10)
              .map(
                (s) =>
                  `<div><span class="en">${esc(s.product_name)}</span> <button data-yes="${i}:${esc(s.id)}">اختار ده</button></div>`,
              )
              .join('') || '<p class="hint">مفيش في النواقص.</p>';
          out.querySelectorAll('[data-yes]').forEach(
            (b) =>
              (b.onclick = async () => {
                const [i2, id] = b.dataset.yes.split(':');
                const r = results[i2],
                  before = { match: r.match, done: r.done };
                b.disabled = true;
                try {
                  const u = await decide(i2, id, 'yes');
                  r.match = { id, confidence: 'confirmed', score: 1 };
                  r.done = null;
                  drawResults();
                  setUndo(`اتحفظ: «${r.name}» = ${sName(id)}`, [u], before, i2);
                } catch (e) {
                  status('readStatus', 'ماتحفظش: ' + e.message, 'bad');
                  b.disabled = false;
                }
              }),
          );
        }),
    );
  }

  // ---------- WhatsApp: companies, ready message, share target ----------
  let suppliers = [],
    msgEdited = false;
  const digitsOnly = (s) =>
    String(s || '')
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/\D/g, '');
  // Egyptian mobile written 01xxxxxxxxx -> 201xxxxxxxxx (WhatsApp needs the country code)
  const waPhone = (s) => {
    let d = digitsOnly(s);
    if (/^01\d{9}$/.test(d)) d = '2' + d;
    else if (/^00\d+/.test(d)) d = d.slice(2);
    return /^\d{8,15}$/.test(d) ? d : '';
  };
  async function loadSuppliers() {
    try {
      const { data } = await client.from('ar_suppliers').select('name,phone').order('name');
      suppliers = data || [];
    } catch (e) {
      suppliers = [];
    }
    $('supplierList').innerHTML = suppliers.map((x) => `<option value="${esc(x.name)}">`).join('');
  }
  $('supplier').addEventListener('input', () => {
    const x = suppliers.find((s) => s.name === $('supplier').value.trim());
    if (x && x.phone) $('supplierPhone').value = x.phone;
    if (!msgEdited) drawMessage();
  });
  // Gemini may read the company name off the list: use it only when the owner has not chosen one, preferring a saved company
  function guessSupplier(name) {
    if ($('supplier').value.trim()) return;
    const k = nk(name);
    const x = suppliers.find((s) => nk(s.name) === k || k.includes(nk(s.name)) || nk(s.name).includes(k));
    $('supplier').value = x ? x.name : name.slice(0, 80);
    if (x && x.phone) $('supplierPhone').value = x.phone;
  }
  async function saveSupplier() {
    const name = $('supplier').value.replace(/\s+/g, ' ').trim().slice(0, 80),
      phone = waPhone($('supplierPhone').value) || null;
    if (name.length < 2) return;
    const old = suppliers.find((s) => s.name === name);
    if (old && (old.phone || null) === phone) return;
    const { error } = await client
      .from('ar_suppliers')
      .upsert(
        { name, phone: phone || old?.phone || null, updated_at: new Date().toISOString() },
        { onConflict: 'name' },
      );
    if (!error) await loadSuppliers();
  }
  function newRun() {
    msgEdited = false;
    $('msgBox').classList.add('hidden');
  }
  // the message: every shortage found in this company's list, written the way the company wrote it
  function buildMessage() {
    const seen = new Set(),
      lines = [];
    for (const r of results) {
      if (!isSure(r) || seen.has(r.match.id)) continue;
      seen.add(r.match.id);
      lines.push(r.corrected || r.name);
    }
    if (!lines.length) return '';
    return [
      'السلام عليكم،',
      'محتاجين من المتاح عندكم:',
      ...lines.map((l, i) => `${i + 1}- ${l}`),
      '',
      'صيدلية عسكر',
    ].join('\n');
  }
  function drawMessage() {
    if (msgEdited) return;
    const t = buildMessage();
    $('msgText').value = t;
    $('msgBox').classList.toggle('hidden', !t);
  }
  $('msgText').addEventListener('input', () => {
    msgEdited = true;
  });
  $('waBtn').onclick = async () => {
    const t = $('msgText').value.trim();
    if (!t) return;
    await saveSupplier();
    const ph = waPhone($('supplierPhone').value);
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(t)}`, '_blank');
    status(
      'msgStatus',
      ph
        ? 'اتفتحت محادثة الشركة في الواتس، اضغط إرسال هناك.'
        : 'اختار محادثة الشركة في الواتس واضغط إرسال. (لو كتبت رقم الشركة فوق، المرة الجاية هتتفتح محادثتها على طول.)',
      'good',
    );
  };
  $('copyBtn').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('msgText').value);
      status('msgStatus', 'اتنسخت.', 'good');
    } catch (e) {
      $('msgText').select();
      status('msgStatus', 'حدّد الرسالة وانسخها.');
    }
  };
  // notification when a shared list finishes while the bot is in the background
  let swReg = null;
  if ('serviceWorker' in navigator)
    navigator.serviceWorker
      .register('ar/sw.js', { scope: 'ar/' })
      .then((r) => {
        swReg = r;
      })
      .catch(() => {});
  function drawNotify() {
    $('notifyBtn').classList.toggle('hidden', !('Notification' in window) || Notification.permission !== 'default');
  }
  $('notifyBtn').onclick = async () => {
    try {
      await Notification.requestPermission();
    } catch (e) {}
    drawNotify();
  };
  drawNotify();
  function notifyDone(co, n) {
    try {
      if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted' || !swReg) return;
      swReg.showNotification('نواقص عربي', {
        body: `${co || 'الشركة'}: وصل ${n} صنف من النواقص. الرسالة جاهزة.`,
        icon: 'icons/arabic-192.png',
        tag: 'ar-read',
      });
    } catch (e) {}
  }
  // shared from WhatsApp: ?share=<id> -> files and text the service worker kept in the cache
  let pendingShare = new URLSearchParams(location.search).get('share');
  async function takeShare() {
    const id = pendingShare;
    if (!id) return;
    pendingShare = null;
    history.replaceState(null, '', location.pathname);
    document.querySelector('[data-tab="read"]').click();
    if (id === 'error' || !('caches' in window)) {
      status('readStatus', 'الملفات اللي اتشاركت ماوصلتش؛ شاركها تاني أو اختارها من هنا.', 'bad');
      return;
    }
    const c = await caches.open('ar-share'),
      base = new URL('ar-share/' + id + '/', location.href).href,
      metaRes = await c.match(base + 'meta');
    if (!metaRes) {
      status('readStatus', 'الملفات اللي اتشاركت ماوصلتش؛ شاركها تاني.', 'bad');
      return;
    }
    const meta = await metaRes.json(),
      files = [];
    for (const f of meta.files) {
      const r = await c.match(new URL(f.key, location.href).href);
      if (r) files.push(new File([await r.blob()], f.name, { type: f.type || r.headers.get('content-type') || '' }));
    }
    for (const k of await c.keys()) if (k.url.startsWith(base)) await c.delete(k);
    $('supplier').value = '';
    $('supplierPhone').value = '';
    const sheets = files.filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name) || /sheet|excel|csv/i.test(f.type)),
      docs = files.filter((f) => !sheets.includes(f) && (/^image\//.test(f.type) || isPdf(f)));
    const pick = (src) => document.querySelector(`[data-src="${src}"]`).click();
    if (docs.length) {
      pick('img');
      status('readStatus', `وصل من الواتس ${docs.length} ملف — بيقرا…`);
      await readFiles(docs);
      return;
    }
    if (sheets.length) {
      pick('excel');
      const dt = new DataTransfer();
      dt.items.add(sheets[0]);
      $('xlsFile').files = dt.files;
      $('xlsFile').onchange();
      return;
    }
    if (meta.text) {
      pick('text');
      $('pasteText').value = meta.text;
      await runText('من الواتس', $('textBtn'));
      return;
    }
    status('readStatus', 'اللي اتشارك مافيهوش صور ولا ملف ولا كلام.', 'bad');
  }
  client.auth.onAuthStateChange(() => setTimeout(refresh, 0));
  refresh();
})();
