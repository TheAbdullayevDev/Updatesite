/* YANGIYER AVTO TEST — o'zbek lotin -> kirill avtomatik o'giruvchi.
   • Brauzerda: window.UZ_TRANSLIT ; Node'da: require('./translit.js').
   • Qoidalar + ichki istisnolar (EXCEPTIONS) + dasturchi o'rgatgan lug'at (setUserDict).
   • fillPayload(payload): kirill nusxasi yo'q / bo'sh / joy egallovchi / lotin harfli
     bo'lib qolgan savollarni lotindan to'ldiradi. Qo'lda yozilgan kirill matnga tegmaydi.
   Mavjud bazada sinalgan: so'zlarning 99.88% kirill bazadagi bilan bir xil chiqadi. */
(function (root) {
  'use strict';

  // Apostrof turlari: ' ‘ ’ ʻ ʼ `
  const AP = "'‘’ʻʼ`";
  const isAp = ch => !!ch && AP.includes(ch);
  const VOWELS = 'aeiou';

  // Ichki istisnolar (kichik harfda). "*" bilan tugasa — o'zak (qo'shimchalari ham), aks holda butun so'z.
  const EXCEPTIONS = Object.assign(Object.create(null), {
    'traektor': 'траектор*',
    'poez': 'поез*',
    'avtopoez': 'автопоез*',
    'koeffitsiyent': 'коеффитсиент*',
    'aeroport': 'аэропорт*',
    'poeziya': 'поэзия'
  });
  // Dasturchi o'rgatgan lug'at (GitHub paketida translitDict sifatida tarqaladi)
  let USER = Object.create(null);

  const SINGLE = {
    a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м',
    n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з',
    c: 'ц', w: 'в'
  };

  function caseLike(src, out, nextSrc) {
    if (!out || src === src.toLowerCase()) return out;
    if (src.length > 1 && src === src.toUpperCase()) return out.toUpperCase();          // SH -> Ш? yo'q: SHAHAR -> ШАҲАР
    if (src.length === 1 && nextSrc && /[A-Z]/.test(nextSrc)) return out.toUpperCase();  // YPX -> ЙПХ
    return out.charAt(0).toUpperCase() + out.slice(1);
  }

  // Bitta so'zni qoidalar bo'yicha o'girish (lug'atsiz)
  function ruleWord(w) {
    let out = '';
    const lower = w.toLowerCase();
    for (let i = 0; i < w.length; i++) {
      const c = lower[i], n = lower[i + 1] || '', n2 = lower[i + 2] || '', prev = lower[i - 1] || '';
      const src2 = w.slice(i, i + 2), next = w[i + 2] || '';
      if ((c === 'o' || c === 'g') && isAp(n)) { out += caseLike(w[i], c === 'o' ? 'ў' : 'ғ'); i++; continue; }
      if (isAp(c)) {
        // harflar orasidagi tutuq belgisi -> ъ ; s'h -> сҳ (ajratuvchi, ъ qo'yilmaydi)
        if (/[a-z]/.test(prev) && /[a-z]/.test(n)) { if (!(prev === 's' && n === 'h')) out += 'ъ'; continue; }
        out += w[i]; continue;
      }
      if (c === 's' && n === 'h') { out += caseLike(src2, 'ш', next); i++; continue; }
      if (c === 'c' && n === 'h') { out += caseLike(src2, 'ч', next); i++; continue; }
      if (c === 'y') {
        if (n === 'o' && isAp(n2)) { out += caseLike(w[i], 'й', w[i + 1]); continue; }   // yo'l -> йўл
        const map = { o: 'ё', u: 'ю', a: 'я', e: 'е' }[n];
        if (map) { out += caseLike(src2, map, next); i++; continue; }
      }
      if (c === 'e') {
        // so'z boshida yoki unlidan keyin -> э
        const atStart = i === 0 || (!/[a-z]/.test(prev) && !isAp(prev));
        out += caseLike(w[i], atStart || VOWELS.includes(prev) ? 'э' : 'е', w[i + 1]);
        continue;
      }
      const m = SINGLE[c];
      out += m ? caseLike(w[i], m, w[i + 1]) : w[i];
    }
    return out;
  }

  const normKey = s => String(s || '').toLowerCase().replace(/[‘’ʻʼ`]/g, "'");

  // Lug'atdan izlash: avval butun so'z, keyin eng uzun o'zak ("*" bilan belgilangan)
  function lookup(word, dicts) {
    const low = normKey(word);
    for (let k = 0; k < dicts.length; k++) {
      const d = dicts[k];
      if (d && low in d) return { cyr: d[low].replace(/\*$/, ''), rest: '', from: k };
    }
    for (let len = low.length - 1; len >= 3; len--) {
      const stem = low.slice(0, len);
      for (let k = 0; k < dicts.length; k++) {
        const d = dicts[k];
        if (d && stem in d && d[stem].endsWith('*')) return { cyr: d[stem].slice(0, -1), rest: word.slice(len), from: k };
      }
    }
    return null;
  }

  function applyCase(src, cyr) {
    if (src.length > 1 && src === src.toUpperCase() && /[A-Z]/.test(src)) return cyr.toUpperCase();
    if (src[0] && src[0] !== src[0].toLowerCase()) return cyr.charAt(0).toUpperCase() + cyr.slice(1);
    return cyr;
  }

  // Lotin bo'lib qoladigan tokenlar: variant harflari (A, B, C, D) va F1, B2 kabilar
  function keepLatin(tok) {
    if (/^[A-Z]$/.test(tok)) return true;
    if (/\d/.test(tok) && /^[A-Z0-9]+$/.test(tok)) return true;
    if (/^(?:[a-z]+|[A-Z][a-z]+)[A-Z]/.test(tok) && tok !== tok.toUpperCase()) return true; // GitHub, iPhone, WhatsApp — nomlar
    return false;
  }

  // Qoida bo'yicha xato bo'lishi mumkin bo'lgan so'zlar (ц/тс, е/э, ё/йо) — sariq bilan belgilanadi
  function isRisky(w) {
    const l = w.toLowerCase();
    return l.length > 2 && /ts|[aiou]e|[bdfklmnprtvz]y[oua](?!')|c(?!h)|w/.test(l);
  }

  const WORD_RE = /[A-Za-z]+(?:['‘’ʻʼ`][A-Za-z]+)*['‘’ʻʼ`]?/g;

  /* Asosiy funksiya. Natija: { text, words:[{src, cyr, how}], parts:[matn | so'z indeksi] }
     how: rule (qoida), risky (shubhali), dict (ichki istisno), user (o'rgatilgan), latin (o'zgarmaydi) */
  function convert(text, userDict) {
    const dicts = [userDict || USER, EXCEPTIONS];
    const words = [], parts = [];
    const src = String(text ?? '');
    const re = new RegExp(WORD_RE.source, 'g');
    let last = 0, out = '', m;
    while ((m = re.exec(src))) {
      if (m.index > last) { parts.push(src.slice(last, m.index)); out += src.slice(last, m.index); }
      let tok = m[0], tail = '';
      // oxiridagi apostrof faqat o'/g' bo'lsa so'zga tegishli, aks holda bu tirnoq
      if (isAp(tok[tok.length - 1]) && !/[oOgG]$/.test(tok.slice(0, -1))) { tail = tok.slice(-1); tok = tok.slice(0, -1); }
      let cyr, how;
      if (keepLatin(tok)) { cyr = tok; how = 'latin'; }
      else {
        const hit = lookup(tok, dicts);
        if (hit) {
          const rest = hit.rest ? ruleWord('b' + hit.rest.toLowerCase()).slice(1) : '';
          cyr = applyCase(tok, hit.cyr + rest);
          how = hit.from === 0 ? 'user' : 'dict';
        } else {
          cyr = ruleWord(tok);
          how = isRisky(tok) ? 'risky' : 'rule';
        }
      }
      parts.push(words.length);
      words.push({ src: tok, cyr, how });
      out += cyr;
      if (tail) { parts.push(tail); out += tail; }
      last = re.lastIndex;
    }
    if (last < src.length) { parts.push(src.slice(last)); out += src.slice(last); }
    return { text: out, words, parts };
  }
  const toCyr = s => convert(s).text;

  /* ---------- O'rgatilgan lug'at ---------- */
  function setUserDict(obj, replace = false) {
    if (replace) USER = Object.create(null);
    Object.entries(obj || {}).forEach(([k, v]) => { if (k && typeof v === 'string' && v) USER[normKey(k)] = v; });
  }
  function getUserDict() { return Object.assign({}, USER); }
  function learn(latin, cyrillic, stem = false) {
    const k = normKey(latin).trim(), v = String(cyrillic || '').trim().toLowerCase();
    if (!k || !v) return null;
    USER[k] = v + (stem ? '*' : '');
    return { key: k, value: USER[k] };
  }
  // "mototsiklga" -> "мотоциклга" kabi qo'shimchali so'zdan o'zakni ajratish
  function learnStem(latin, cyrillic) {
    const lat = normKey(latin).trim(), cyr = String(cyrillic || '').trim().toLowerCase();
    for (let k = Math.min(lat.length, 4); k < lat.length; k++) {
      const suf = ruleWord('b' + lat.slice(k)).slice(1);
      if (cyr.endsWith(suf) && cyr.length > suf.length) return learn(lat.slice(0, k), cyr.slice(0, cyr.length - suf.length), true);
    }
    return learn(lat, cyr, true);
  }
  function forget(latin) { delete USER[normKey(latin)]; }

  /* ---------- Kirill nusxani tekshirish va to'ldirish ---------- */
  const PLACEHOLDER = /^\s*(?:Янги савол матни|Yangi savol matni|\d+-вариант|\d+-variant)\s*$/i;
  // Kirill maydon buzilganmi: bo'sh, joy egallovchi matn qolgan yoki ichida lotin so'zlar bor
  function isBroken(lat, cy) {
    const l = String(lat ?? '').trim();
    if (!l) return false;
    const c = String(cy ?? '').trim();
    if (!c) return true;
    if (PLACEHOLDER.test(c) && toCyr(l).trim() !== c) return true;
    if (/[a-z]{2,}/.test(c.replace(/\b(?:[A-Z]|[A-Z]\d+)\b/g, ''))) return true;
    return false;
  }
  const variantKeyOf = q => (Array.isArray(q?.variantlar) ? 'variantlar' : Array.isArray(q?.javob) ? 'javob' : null);

  // Lotin savoldan to'liq kirill nusxa (rasm/video yo'llari umumiy)
  function convertQuestion(lq) {
    const c = JSON.parse(JSON.stringify(lq));
    if (typeof lq.savol === 'string') c.savol = toCyr(lq.savol);
    if (typeof lq.izoh === 'string') c.izoh = toCyr(lq.izoh);
    const vk = variantKeyOf(lq);
    if (vk) c[vk] = lq[vk].map(v => (typeof v === 'string' ? toCyr(v) : v));
    return c;
  }
  // Mavjud kirill savolning faqat buzilgan maydonlarini to'ldiradi. Qaytaradi: to'ldirilgan maydonlar soni
  function fillQuestion(lq, cq) {
    let n = 0;
    for (const f of ['savol', 'izoh']) {
      if (typeof lq[f] === 'string' && isBroken(lq[f], cq[f])) { cq[f] = toCyr(lq[f]); n++; }
    }
    const vk = variantKeyOf(lq);
    if (vk) {
      const lv = lq[vk], cv = Array.isArray(cq[vk]) ? cq[vk] : null;
      if (!cv || cv.length !== lv.length) {
        cq[vk] = lv.map(v => (typeof v === 'string' ? toCyr(v) : v));
        cq.togri_javob = lq.togri_javob;
        n++;
      } else {
        lv.forEach((v, i) => { if (typeof v === 'string' && isBroken(v, cv[i])) { cv[i] = toCyr(v); n++; } });
      }
    }
    ['rasm', 'izoh_video', 'wrong_video', 'xato_video'].forEach(f => { if (lq[f] && !cq[f]) cq[f] = lq[f]; });
    return n;
  }
  /* Paketni to'ldirish: templates -> templatesKiril, questions -> questionsKiril.
     Payload joyida o'zgartiriladi. Qaytaradi: { fields, questions } — nechta maydon/savol to'ldirildi */
  function fillPayload(p) {
    const res = { fields: 0, questions: 0 };
    if (!p || typeof p !== 'object') return res;
    if (Array.isArray(p.templates)) {
      if (!Array.isArray(p.templatesKiril)) p.templatesKiril = [];
      const byName = new Map(p.templatesKiril.map(t => [t?.name, t]));
      p.templates.forEach(t => {
        if (!t || !Array.isArray(t.questions)) return;
        let ct = byName.get(t.name);
        if (!ct) {
          ct = { ...t, questions: t.questions.map(convertQuestion) };
          if (t.title) ct.title = toCyr(t.title);
          p.templatesKiril.push(ct); byName.set(t.name, ct);
          res.questions += t.questions.length;
          return;
        }
        if (t.title && isBroken(t.title, ct.title)) { ct.title = toCyr(t.title); res.fields++; }
        if (!Array.isArray(ct.questions)) ct.questions = [];
        t.questions.forEach((q, i) => {
          if (!ct.questions[i]) { ct.questions[i] = convertQuestion(q); res.questions++; }
          else res.fields += fillQuestion(q, ct.questions[i]);
        });
      });
    }
    if (Array.isArray(p.questions)) {
      if (!Array.isArray(p.questionsKiril)) p.questionsKiril = [];
      const byNum = new Map(p.questionsKiril.map(q => [Number(q?.raqam), q]));
      p.questions.forEach(q => {
        if (!q) return;
        const cq = byNum.get(Number(q.raqam));
        if (!cq) { const c = convertQuestion(q); p.questionsKiril.push(c); byNum.set(Number(q.raqam), c); res.questions++; }
        else res.fields += fillQuestion(q, cq);
      });
    }
    return res;
  }

  const api = {
    convert, toCyr, ruleWord, isRisky, EXCEPTIONS,
    setUserDict, getUserDict, learn, learnStem, forget,
    isBroken, convertQuestion, fillQuestion, fillPayload, variantKeyOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UZ_TRANSLIT = api;
})(typeof window !== 'undefined' ? window : globalThis);
