/* YANGIYER AVTO TEST — DASTURCHI REJIMI
   Admin panel o'rniga ishlaydi:
   • Shift + sichqoncha bosish — saytdagi istalgan matnni joyida tahrirlash;
   • savol / javob / to'g'ri javob / rasm / video / shablonni real vaqtda o'zgartirish;
   • "Saqlash" — o'zgarishlar shu kompyuterda saqlanadi va GitHub uchun fayllar tayyorlanadi.
   Mavjud rasm/videolar nusxalanmaydi va yo'llari o'zgarmaydi. Faqat yangi qo'shilgan
   media fayllar updates/media/ ichiga yoziladi. */
(function () {
  'use strict';
  if (window.__DEV_MODE_LOADED__) return;
  window.__DEV_MODE_LOADED__ = true;

  // SHA-256("login:parol"). Login va parol kodda ochiq matn ko'rinishida saqlanmaydi.
  const AUTH_HASH = 'd0797a7cafe3cd964594051d47e3553783f5cf1900574b96c5e7637976a7d3f6';
  const SESSION_KEY = 'yangiyer_dev_session_v1';
  const DRAWER_KEY = 'yangiyer_dev_drawer_v1';
  const IS_CYRL = document.documentElement.dataset.script === 'cyrl';
  const LANG = IS_CYRL ? 'cy' : 'uz';
  const OTHER = IS_CYRL ? 'uz' : 'cy';
  const OTHER_FILES = IS_CYRL ? ['bundled-data.js', 'allquest.js'] : ['bundled-data-kiril.js', 'allquest-kiril.js'];
  const NEW_Q_TEXT = { uz: 'Yangi savol matni', cy: 'Янги савол матни' };
  const NEW_VARIANTS = { uz: ['1-variant', '2-variant'], cy: ['1-вариант', '2-вариант'] };
  // Lotin -> kirill avtomatik o'girish (translit.js). Lotin sahifada qilingan tahrir kirill nusxaga o'zi o'tadi.
  const TR = window.UZ_TRANSLIT || null;
  const AUTO_CYR = !IS_CYRL && !!TR;
  const DICT_LS = 'yangiyer_translit_dict_v1';      // shu kompyuterda o'rgatilgan so'zlar
  const cyrOf = s => (TR ? TR.toCyr(String(s ?? '')) : String(s ?? ''));
  // Kirill maydon "avtomatik" holatdami: bo'sh / buzilgan / eski lotinning aynan avtomatik o'girmasi.
  // Aks holda u qo'lda tuzatilgan — lotin o'zgarsa ham ustidan yozilmaydi.
  const cyrIsAuto = (oldLat, cy) => !String(cy ?? '').trim() || !!(TR && TR.isBroken(oldLat, cy)) || String(cy).trim() === cyrOf(oldLat).trim();
  function loadLocalDict() {
    if (!TR) return;
    try { TR.setUserDict(JSON.parse(localStorage.getItem(DICT_LS) || '{}')); } catch (_) {}
  }
  const saveLocalDict = () => { if (TR) localStorage.setItem(DICT_LS, JSON.stringify(TR.getUserDict())); };
  loadLocalDict();
  // Dastur o'zi hisoblaydigan qiymatlar — ularni matn sifatida qotirib qo'yish xato bo'ladi.
  const DYNAMIC = [
    '#counter', '#score', '#quizTimer', '#numbers', '#progressBar', '#topExamTimer', '#examErrors',
    '#resultPercent', '#resultSummary', '#resultCorrect', '#resultWrong', '#resultEmpty', '#resultTotal',
    '#resultList', '#currentFile', '#status', '#fileCount', '#questionTotal', '#updateStatus',
    '#currentAppVersion', '#homeQuestionStat', '#homeTemplateStat', '#topicGrid', '#topicCountLabel',
    '#quizTemplateLabel', '[data-mistake-count]', '#mediaModal', '#welcomeIntro'
  ].join(',');

  const qs = (s, root = document) => root.querySelector(s);
  const qsa = (s, root = document) => [...root.querySelectorAll(s)];
  const clone = v => JSON.parse(JSON.stringify(v));
  const escHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const appFn = name => (typeof window[name] === 'function' ? window[name] : null);

  let devOn = false;
  let DS = null;                 // { data: { uz:{templates,questions}, cy:{...} }, videoPolicy }
  let dsPromise = null;
  let dirty = false;
  let savingSelf = false;
  let lastPayload = null;        // oxirgi qo'llangan yangilanish paketi
  const changeLog = new Map();   // kalit -> tavsif
  const mediaStore = new Map();  // updates/media/... -> Blob
  let uiText = { uz: {}, cy: {} };
  const TOKEN_LS = 'yangiyer_gh_token_enc_v1';     // shu kompyuterdagi shifrlangan token
  const TOKEN_SS = 'yangiyer_gh_token_session_v1'; // ochilgan token — faqat joriy oyna sessiyasida
  let ghToken = sessionStorage.getItem(TOKEN_SS) || null;
  let devSecret = null;                            // "login:parol" — faqat xotirada
  let ghTokenBad = false;                          // GitHub tokenni rad etdi (401)

  /* ============================================================
     YORDAMCHI: versiya, sha256, ZIP
     ============================================================ */
  function compareVersions(a, b) {
    const aa = String(a || '0').split(/[.-]/).map(x => Number(x) || 0);
    const bb = String(b || '0').split(/[.-]/).map(x => Number(x) || 0);
    for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
      const d = (aa[i] || 0) - (bb[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }
  function bumpVersion(v) {
    const p = String(v || '1.0.0').split('.').map(x => Number(x) || 0);
    return `${p[0] || 1}.${p[1] || 0}.${(p[2] || 0) + 1}`;
  }
  function localVersion() {
    return String(window.APP_UPDATER?.getVersion?.() || window.APP_CONTENT_VERSION || '1.0.0');
  }
  async function sha256(blob) {
    if (!crypto?.subtle) throw new Error('SHA-256 uchun Chrome yoki xavfsiz (HTTPS/file) muhit kerak.');
    const buf = blob instanceof Blob ? await blob.arrayBuffer() : new TextEncoder().encode(String(blob));
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function joinBytes(parts) { const size = parts.reduce((s, p) => s + p.length, 0); const out = new Uint8Array(size); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; }); return out; }
  function u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return b; }
  function u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; }
  // Store (siqilmagan) ZIP — update-client.js shu formatni o'qiydi.
  async function makeZip(entries) {
    const enc = new TextEncoder(); const local = [], central = []; let offset = 0;
    for (const entry of entries) {
      const name = enc.encode(entry.name.replaceAll('\\', '/'));
      const bytes = new Uint8Array(await entry.blob.arrayBuffer());
      const crc = crc32(bytes);
      const header = joinBytes([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(bytes.length), u32(bytes.length), u16(name.length), u16(0), name]);
      local.push(header, bytes);
      central.push(joinBytes([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(bytes.length), u32(bytes.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
      offset += header.length + bytes.length;
    }
    const cBytes = joinBytes(central), lBytes = joinBytes(local);
    const end = joinBytes([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(cBytes.length), u32(lBytes.length), u16(0)]);
    return new Blob([lBytes, cBytes, end], { type: 'application/zip' });
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name.split('/').pop();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  /* ============================================================
     UI: toast, popup, modal
     ============================================================ */
  let toastTimer = null;
  function toast(msg, type = 'info', ms = 3200) {
    let t = qs('#devToast');
    if (!t) { t = document.createElement('div'); t.id = 'devToast'; t.className = 'dev-ui dev-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.dataset.type = type; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // Kichik tahrir oynasi (tugma ichidagi yoki aralash matnlar uchun).
  let activePopup = null;
  function popupEdit({ anchor, value, title = 'Matnni tahrirlash', extra = null, onCommit }) {
    closePopup(false);
    const box = document.createElement('div');
    box.className = 'dev-ui dev-pop';
    box.innerHTML = `<div class="dev-pop-title">${escHtml(title)}</div>
      <textarea rows="2" spellcheck="false"></textarea>
      ${extra ? `<label class="dev-check"><input type="checkbox" ${extra.checked ? 'checked' : ''}> ${escHtml(extra.label)}</label>` : ''}
      <div class="dev-pop-actions"><small>Enter — saqlash · Esc — bekor</small>
      <button type="button" data-a="cancel">Bekor</button><button type="button" class="primary" data-a="ok">Saqlash</button></div>`;
    document.body.appendChild(box);
    const ta = qs('textarea', box);
    ta.value = value;
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(220, ta.scrollHeight + 2) + 'px'; };
    ta.addEventListener('input', fit);
    const r = anchor.getBoundingClientRect();
    const w = Math.min(460, Math.max(280, r.width));
    box.style.width = w + 'px';
    box.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
    const below = r.bottom + 8, h = 170;
    box.style.top = (below + h < window.innerHeight ? below : Math.max(8, r.top - h - 8)) + 'px';
    anchor.classList.add('dev-editing');
    const commit = () => {
      const cb = extra ? qs('input[type=checkbox]', box) : null;
      onCommit(ta.value.replace(/\r/g, ''), cb ? cb.checked : undefined);
    };
    activePopup = { box, anchor, commit };
    box.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'ok') closePopup(true);
      if (a === 'cancel') closePopup(false);
    });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closePopup(true); }
      if (e.key === 'Escape') { e.preventDefault(); closePopup(false); }
      e.stopPropagation();
    });
    fit(); ta.focus(); ta.select();
  }
  function closePopup(save) {
    if (!activePopup) return;
    const p = activePopup; activePopup = null;
    p.anchor.classList.remove('dev-editing');
    p.box.remove();
    if (save) p.commit();
  }
  document.addEventListener('mousedown', e => {
    if (activePopup && !e.target.closest('.dev-pop')) closePopup(true);
  }, true);

  // Faqat matndan iborat elementni joyining o'zida tahrirlash.
  function inPlaceEdit(target, onCommit) {
    const orig = target.textContent;
    target.classList.add('dev-editing');
    try { target.contentEditable = 'plaintext-only'; } catch (_) { target.contentEditable = 'true'; }
    if (target.contentEditable !== 'plaintext-only') target.contentEditable = 'true';
    target.focus();
    const range = document.createRange(); range.selectNodeContents(target);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    let done = false;
    const finish = save => {
      if (done) return; done = true;
      target.removeEventListener('keydown', onKey, true);
      target.removeEventListener('blur', onBlur);
      target.removeAttribute('contenteditable');
      target.classList.remove('dev-editing');
      const val = target.textContent;
      if (!save || val === orig) { target.textContent = orig; return; }
      target.textContent = orig; // haqiqiy qiymatni onCommit o'zi qo'yadi
      onCommit(val, orig);
    };
    const onKey = e => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); target.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); target.blur(); }
    };
    const onBlur = () => finish(true);
    target.addEventListener('keydown', onKey, true);
    target.addEventListener('blur', onBlur);
  }

  /* ============================================================
     MA'LUMOTLAR: ikkala yozuv (lotin + kirill)
     ============================================================ */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => { s.remove(); resolve(); };
      s.onerror = () => { s.remove(); reject(new Error(src + ' faylini yuklab bo‘lmadi')); };
      document.head.appendChild(s);
    });
  }
  async function loadOtherLanguage() {
    const keepT = window.BUNDLED_TEMPLATES, keepQ = window.ALL_QUESTIONS, keepM = window.BUNDLED_MEDIA;
    try {
      await loadScript(OTHER_FILES[0]);
      const templates = window.BUNDLED_TEMPLATES || [];
      await loadScript(OTHER_FILES[1]);
      const questions = window.ALL_QUESTIONS || [];
      return { templates, questions };
    } finally {
      window.BUNDLED_TEMPLATES = keepT; window.ALL_QUESTIONS = keepQ; window.BUNDLED_MEDIA = keepM;
    }
  }
  const startupPayload = (window.APP_UPDATE_READY || Promise.resolve(null)).catch(() => null);

  function ensureData() {
    if (DS) return Promise.resolve(DS);
    if (dsPromise) return dsPromise;
    dsPromise = (async () => {
      const stored = lastPayload || await startupPayload;
      // Test oynasida kutib qolgan yangilanish bo'lsa, avval uni qo'llaymiz.
      if (window.__PENDING_APP_CONTENT_UPDATE && appFn('refreshAfterContentUpdate')) {
        const p = window.__PENDING_APP_CONTENT_UPDATE; window.__PENDING_APP_CONTENT_UPDATE = null;
        window.refreshAfterContentUpdate(p);
      }
      const patch = window.APP_CONTENT_PATCH;
      const base = stored || (Array.isArray(patch?.templates) ? patch : null);
      const data = {};
      if (!Array.isArray(window.BUNDLED_TEMPLATES)) window.BUNDLED_TEMPLATES = [];
      if (!Array.isArray(window.ALL_QUESTIONS)) window.ALL_QUESTIONS = [];
      data[LANG] = { templates: window.BUNDLED_TEMPLATES, questions: window.ALL_QUESTIONS };
      const kT = OTHER === 'cy' ? 'templatesKiril' : 'templates';
      const kQ = OTHER === 'cy' ? 'questionsKiril' : 'questions';
      if (base && Array.isArray(base[kT]) && Array.isArray(base[kQ])) data[OTHER] = { templates: clone(base[kT]), questions: clone(base[kQ]) };
      else data[OTHER] = await loadOtherLanguage();
      Object.entries(window.APP_UPDATE_MEDIA || {}).forEach(([p, b]) => { if (!mediaStore.has(p)) mediaStore.set(p, b); });
      DS = {
        data,
        videoPolicy: { templates: true, topics: true, general: true, all: true, exam: false, ...(window.APP_VIDEO_POLICY || base?.videoPolicy || {}) }
      };
      return DS;
    })();
    dsPromise.catch(() => {}).finally(() => { dsPromise = null; });
    return dsPromise;
  }

  /* ============================================================
     HOLAT: o'zgarishlar
     ============================================================ */
  function markDirty(key, text) {
    dirty = true;
    changeLog.set(key, text);
    paintBar();
  }
  function resetCaches() {
    window.__TEMPLATE_MEDIA_LOOKUP = null;
    window.resetTopicsCache?.();
  }

  /* ============================================================
     SAVOL MANBASINI ANIQLASH (ko'rsatilayotgan nusxa -> asl obyekt)
     ============================================================ */
  const getImage = q => String(q?.rasm || q?.image || '');
  const getVideo = q => String(q?.wrong_video || q?.xato_video || q?.izoh_video || '');
  const variantKey = kind => (kind === 'all' ? 'javob' : 'variantlar');
  const variantsOf = (q, kind) => (Array.isArray(q?.[variantKey(kind)]) ? q[variantKey(kind)] : (q?.variantlar || q?.javob || []));
  const tplNumber = t => (String(t?.name || '').replace(/\.(?:py|js)$/i, '').match(/\d+/) || [''])[0];
  const tplLabel = t => t?.title || `${tplNumber(t)}-shablon`;
  const stripNum = s => String(s || '').replace(/^\s*\d+[.)-]?\s*/, '');
  const numPrefix = s => (String(s || '').match(/^\s*\d+[.)-]?\s*/) || [''])[0];
  const keyOf = s => (appFn('questionKey') ? window.questionKey(s) : stripNum(s).toLowerCase().trim());

  function inExam() { return typeof examMode !== 'undefined' && (examMode || current?.path === 'IMTIHON'); }
  function inSpecial() { return typeof specialTestMode !== 'undefined' && specialTestMode; }

  function resolveSource() {
    if (!DS || typeof current === 'undefined' || !current || !Array.isArray(current.questions) || !current.questions.length) return null;
    const disp = current.questions[qIndex];
    if (!disp) return null;
    const D = DS.data[LANG];
    let ref = null;
    if (inExam()) {
      for (const t of D.templates) {
        const i = (t.questions || []).indexOf(disp);
        if (i >= 0) { ref = { kind: 'template', exam: true, q: disp, tpl: t, index: i }; break; }
      }
    } else if (inSpecial()) {
      const src = D.questions.find(x => Number(x.raqam) === Number(disp.raqam));
      if (src) ref = { kind: 'all', q: src };
    } else if (currentFileIndex >= 0) {
      const f = templateFiles[currentFileIndex];
      const t = D.templates.find(x => x.questions === f?.__questions) || D.templates.find(x => x.name === f?.name);
      if (t && t.questions?.[qIndex]) ref = { kind: 'template', q: t.questions[qIndex], tpl: t, index: qIndex };
    }
    if (!ref) return null;
    ref.matches = findMatches(ref);
    ref.counterpart = counterpartOf(ref);
    return ref;
  }
  // Shu yozuvdagi aynan shu savol boshqa shablon/umumiy bazada ham bo'lsa, ularni ham yangilaymiz.
  function findMatches(ref) {
    const key = keyOf(ref.q.savol);
    if (!key) return [];
    const own = JSON.stringify(variantsOf(ref.q, ref.kind));
    const out = [];
    const D = DS.data[LANG];
    D.templates.forEach(t => (t.questions || []).forEach((q, index) => {
      if (q !== ref.q && keyOf(q.savol) === key) out.push({ q, kind: 'template', tpl: t, index, sameVariants: JSON.stringify(variantsOf(q, 'template')) === own });
    }));
    D.questions.forEach(q => {
      if (q !== ref.q && keyOf(q.savol) === key) out.push({ q, kind: 'all', sameVariants: JSON.stringify(variantsOf(q, 'all')) === own });
    });
    return out;
  }
  // Ikkinchi yozuvdagi (lotin <-> kirill) mos savol: media yo'llari umumiy bo'ladi.
  function counterpartOf(ref) {
    const O = DS.data[OTHER];
    if (ref.kind === 'template') {
      const t = O.templates.find(x => x.name === ref.tpl.name);
      return t?.questions?.[ref.index] || null;
    }
    return O.questions.find(x => Number(x.raqam) === Number(ref.q.raqam)) || null;
  }
  function setMedia(q, ch) {
    if ('image' in ch) q.rasm = ch.image;
    if ('video' in ch) {
      q.izoh_video = ch.video;
      q.wrong_video = ch.video;
      if ('xato_video' in q) q.xato_video = ch.video;
    }
  }
  function describe(ref) {
    return ref.kind === 'template' ? `${tplLabel(ref.tpl)}, ${ref.index + 1}-savol` : `Umumiy baza №${ref.q.raqam}`;
  }

  // Kirill nusxa yo'q bo'lsa (yangi savol/shablon), lotindan o'girib yaratadi.
  function ensureCounterpart(t) {
    const cp = counterpartOf(t);
    if (cp || !AUTO_CYR) return cp;
    const O = DS.data[OTHER];
    if (t.kind === 'template') {
      let ot = O.templates.find(x => x.name === t.tpl.name);
      if (!ot) {
        ot = { ...t.tpl, questions: [] };
        if (t.tpl.title) ot.title = cyrOf(t.tpl.title);
        O.templates.push(ot);
      }
      while (ot.questions.length <= t.index && ot.questions.length < t.tpl.questions.length) {
        ot.questions.push(TR.convertQuestion(t.tpl.questions[ot.questions.length]));
      }
      return ot.questions[t.index] || null;
    }
    const c = TR.convertQuestion(t.q);
    O.questions.push(c);
    return c;
  }
  // Lotindagi o'zgarishni kirill nusxaga o'tkazadi. Qo'lda tuzatilgan kirill maydonlar "skipped"ga yoziladi.
  function syncCounterpart(before, t, cp, ch, skipped) {
    if ('savol' in ch && before.savol !== String(t.q.savol ?? '')) {
      if (cyrIsAuto(before.savol, cp.savol)) cp.savol = cyrOf(t.q.savol); else skipped.add('savol');
    }
    if (t.main && 'izoh' in ch && before.izoh !== String(t.q.izoh ?? '')) {
      if (cyrIsAuto(before.izoh, cp.izoh)) cp.izoh = cyrOf(t.q.izoh); else skipped.add('izoh');
    }
    if (t.same && ('variants' in ch || 'correct' in ch)) {
      const vk = TR.variantKeyOf(cp) || variantKey(t.kind);
      const after = variantsOf(t.q, t.kind).map(String), cv = Array.isArray(cp[vk]) ? cp[vk] : [];
      if ('variants' in ch) {
        const sameLen = before.vars.length === after.length;
        cp[vk] = after.map((v, i) => {
          const j = before.vars.indexOf(v);                       // matni o'zgarmagan variant (o'rni o'zgargan bo'lishi mumkin)
          if (j >= 0 && cv[j] !== undefined && !TR.isBroken(v, cv[j])) return cv[j];
          if (sameLen && cv[i] !== undefined && !cyrIsAuto(before.vars[i], cv[i])) { skipped.add('variant'); return cv[i]; }
          return cyrOf(v);
        });
      }
      cp.togri_javob = t.q.togri_javob;
    }
  }

  // Asosiy tahrir funksiyasi. ch: {savol, variants, correct, image, video, izoh}
  let lastCyrSkipped = new Set();
  function editQuestion(ref, ch, what = 'savol') {
    const sync = qs('#devSyncSame') ? qs('#devSyncSame').checked : true;
    const targets = [{ q: ref.q, kind: ref.kind, tpl: ref.tpl, index: ref.index, main: true, same: true }]
      .concat(sync ? ref.matches.map(m => ({ q: m.q, kind: m.kind, tpl: m.tpl, index: m.index, main: false, same: m.sameVariants })) : []);
    const skipped = new Set();
    for (const t of targets) {
      const cp = AUTO_CYR ? ensureCounterpart(t) : null;
      const before = cp ? { savol: String(t.q.savol ?? ''), izoh: String(t.q.izoh ?? ''), vars: variantsOf(t.q, t.kind).map(String) } : null;
      if ('savol' in ch) t.q.savol = t.main ? ch.savol : numPrefix(t.q.savol) + stripNum(ch.savol);
      if (t.same && 'variants' in ch) t.q[variantKey(t.kind)] = ch.variants.slice();
      if (t.same && 'correct' in ch) t.q.togri_javob = ch.correct;
      if (t.main && 'izoh' in ch) t.q.izoh = ch.izoh;
      setMedia(t.q, ch);
      if (cp) {
        syncCounterpart(before, t, cp, ch, t.main ? skipped : new Set());
        setMedia(cp, ch);
      }
    }
    if (!AUTO_CYR && ref.counterpart && ('image' in ch || 'video' in ch)) setMedia(ref.counterpart, ch);
    if (AUTO_CYR) ref.counterpart = counterpartOf(ref);
    lastCyrSkipped = skipped;
    if (skipped.size && (!drawer || drawer.hidden)) {
      toast('Kirill nusxadagi bu matn qo‘lda tuzatilgan — avtomatik yangilanmadi. Savol muharriridagi Кирилл bo‘limida ↺ ni bosing.', 'warning', 7000);
    }
    markDirty(`q:${LANG}:${describe(ref)}:${what}`, `${describe(ref)} — ${what} o‘zgardi` + (AUTO_CYR ? ' (kirill ham)' : ''));
    refreshDisplay(ref);
  }

  let suppressEditorReload = false;
  function displayFromAll(src) {
    const d = appFn('toSpecialQuestion') ? window.toSpecialQuestion(src) : { ...src };
    d.variantlar = variantsOf(src, 'all').slice();
    d.togri_javob = Number(src.togri_javob) || 0;
    return d;
  }
  function refreshDisplay(ref) {
    resetCaches();
    if (ref.kind === 'template' && !ref.exam) {
      const f = templateFiles[currentFileIndex];
      if (f && typeof templateQuestionCache !== 'undefined') templateQuestionCache.delete(f);
      current.questions[qIndex] = appFn('normalizeTemplateCorrectIndex') ? window.normalizeTemplateCorrectIndex(ref.q) : ref.q;
    } else if (ref.kind === 'all') {
      current.questions[qIndex] = displayFromAll(ref.q);
    }
    suppressEditorReload = true;
    try { showQuestion(qIndex); } finally { suppressEditorReload = false; }
  }

  /* ============================================================
     MEDIA: nusxa yaratmasdan ulash
     ============================================================ */
  function toRef(path) {
    const m = String(path).match(/(?:^|\/)((?:rasmlar|videolar)\/[^/]+)$/i);
    return m ? m[1] : String(path);
  }
  function registerMedia(file, kind) {
    const lower = file.name.toLowerCase();
    const existing = (window.BUNDLED_MEDIA || []).find(p => typeof p === 'string' && !/^updates\//i.test(p) && p.split('/').pop().toLowerCase() === lower);
    if (existing && confirm(`"${file.name}" loyihada allaqachon bor:\n${existing}\n\nOK — mavjud fayl ishlatiladi (nusxa yaratilmaydi, yo‘li o‘zgarmaydi).\nBekor — yangi fayl sifatida qo‘shiladi.`)) {
      return toRef(existing);
    }
    for (const [p, b] of mediaStore) {
      if (p.split('/').pop().toLowerCase() === lower.replace(/[^\w.-]+/g, '_') && b.size === file.size) return p;
    }
    const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80) || (kind === 'image' ? 'rasm.jpg' : 'video.mp4');
    let path = 'updates/media/' + safe, k = 2;
    while (mediaStore.has(path)) {
      const dot = safe.lastIndexOf('.');
      path = 'updates/media/' + (dot > 0 ? safe.slice(0, dot) + '_' + k + safe.slice(dot) : safe + '_' + k);
      k++;
    }
    mediaStore.set(path, file);
    window.APP_UPDATE_MEDIA = window.APP_UPDATE_MEDIA || {};
    window.APP_UPDATE_MEDIA[path] = file;
    toast(`Yangi fayl qo‘shildi: ${path}`, 'success');
    return path;
  }
  function pickMedia(kind) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = kind === 'image' ? 'image/*' : 'video/*,.mov,.mp4,.webm';
      inp.onchange = () => { const f = inp.files?.[0]; resolve(f ? registerMedia(f, kind) : null); };
      inp.click();
    });
  }
  function mediaUrl(path) {
    if (!path) return null;
    try { return appFn('assetFor') ? window.assetFor(path) : path; } catch (_) { return null; }
  }

  /* ============================================================
     UI MATN O'ZGARTIRISHLARI (Shift + bosish)
     ============================================================ */
  function ownTextNodes(node) {
    return [...node.childNodes].filter(n => n.nodeType === 3 && n.nodeValue.trim());
  }
  function selectorFor(node) {
    const parts = [];
    while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement) {
      if (node.id) { parts.unshift('#' + CSS.escape(node.id)); return parts.join('>'); }
      const parent = node.parentElement;
      if (!parent) break;
      const tag = node.tagName.toLowerCase();
      const cls = [...node.classList].find(c => !c.startsWith('dev-'));
      if (cls && [...parent.children].filter(c => c.classList.contains(cls) && c.tagName === node.tagName).length === 1) {
        parts.unshift(`${tag}.${CSS.escape(cls)}`);
      } else {
        parts.unshift(`${tag}:nth-child(${[...parent.children].indexOf(node) + 1})`);
      }
      node = parent;
    }
    parts.unshift('body');
    return parts.join('>');
  }
  function loadUiText(payload) {
    const src = payload?.uiText;
    uiText = { uz: { ...(src?.uz || {}) }, cy: { ...(src?.cy || {}) } };
    scheduleOverrides();
  }
  function applyOverrides() {
    const map = uiText[LANG] || {};
    for (const k in map) {
      const o = map[k];
      let node = null;
      try { node = document.querySelector(o.s); } catch (_) { continue; }
      if (!node || node.classList.contains('dev-editing') || node.closest('.dev-ui')) continue;
      if (o.n < 0) {
        if (node.children.length === 0 && node.textContent !== o.t) node.textContent = o.t;
      } else {
        const tn = ownTextNodes(node)[o.n];
        if (tn && tn.nodeValue !== o.t) tn.nodeValue = o.t;
      }
    }
  }
  let overrideRaf = 0;
  function scheduleOverrides() {
    if (overrideRaf) return;
    overrideRaf = requestAnimationFrame(() => { overrideRaf = 0; applyOverrides(); decorateTemplates(); applyQuizLabel(); });
  }
  new MutationObserver(() => {
    if (Object.keys(uiText[LANG] || {}).length || devOn || hasTemplateTitles()) scheduleOverrides();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  function commitUiText(node, n, newText, origText) {
    const sel = selectorFor(node);
    const key = sel + '|' + n;
    const map = uiText[LANG] || (uiText[LANG] = {});
    const prev = map[key];
    const original = prev?.o ?? origText;
    const lead = (origText.match(/^\s*/) || [''])[0], trail = (origText.match(/\s*$/) || [''])[0];
    const clean = newText.trim();
    if (!clean || clean === original.trim()) {
      // Bo'sh qoldirilsa — asl matnga qaytadi.
      delete map[key];
      if (n < 0) node.textContent = original; else { const tn = ownTextNodes(node)[n]; if (tn) tn.nodeValue = original; }
      markDirty('ui:' + LANG + ':' + key, `Matn asl holiga qaytarildi: "${original.trim().slice(0, 40)}"`);
      return;
    }
    const value = n < 0 ? clean : lead + clean + trail;
    map[key] = { s: sel, n, t: value, o: original };
    if (n < 0) node.textContent = value; else { const tn = ownTextNodes(node)[n]; if (tn) tn.nodeValue = value; }
    markDirty('ui:' + LANG + ':' + key, `Matn: "${original.trim().slice(0, 30)}" → "${clean.slice(0, 40)}"`);
  }

  /* ============================================================
     SHIFT + BOSISH
     ============================================================ */
  function textNodeAt(x, y) {
    if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); return r?.startContainer?.nodeType === 3 ? r.startContainer : null; }
    if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p?.offsetNode?.nodeType === 3 ? p.offsetNode : null; }
    return null;
  }
  function editTarget(e) {
    const t = e.target instanceof Element ? e.target : e.target?.parentElement;
    if (!t || t.closest('.dev-ui') || t.closest('input,textarea,select,option')) return null;
    if (t.closest('#question')) return { type: 'qtext', node: qs('#question') };
    const ans = t.closest('#answers .answer');
    if (ans) return { type: 'answer', node: ans };
    const img = t.closest('#media img');
    if (img) return { type: 'qimage', node: img };
    const vid = t.closest('#media video, #media .video-frame');
    if (vid) return { type: 'qvideo', node: vid };
    const h3 = t.closest('#templateGrid .template-card h3');
    if (h3) return { type: 'tpltitle', node: h3 };
    if (t.closest('.dev-add-card, .dev-card-del')) return null;
    if (t.closest(DYNAMIC)) return { type: 'dynamic', node: t };
    let tn = textNodeAt(e.clientX, e.clientY);
    if (!tn || !t.contains(tn) || !tn.nodeValue.trim()) tn = ownTextNodes(t)[0] || null;
    if (!tn) return null;
    const parent = tn.parentElement;
    if (!parent || parent.closest('.dev-ui') || parent.closest(DYNAMIC)) return null;
    const pure = parent.children.length === 0;
    return { type: 'ui', node: parent, n: pure ? -1 : ownTextNodes(parent).indexOf(tn), tn };
  }

  async function handleShiftClick(e, target) {
    await ensureData();
    switch (target.type) {
      case 'dynamic':
        toast('Bu qiymatni dastur o‘zi hisoblaydi — uni qo‘lda o‘zgartirib bo‘lmaydi.', 'warning');
        return;
      case 'qtext': {
        const ref = resolveSource();
        if (!ref) return toast('Bu savolning manbasi topilmadi.', 'error');
        inPlaceEdit(target.node, val => {
          editQuestion(ref, { savol: val.trim() }, 'savol matni');
          reloadEditor();
        });
        return;
      }
      case 'answer': {
        const ref = resolveSource();
        if (!ref) return toast('Bu savolning manbasi topilmadi.', 'error');
        const buttons = qsa('#answers .answer');
        const i = buttons.indexOf(target.node);
        const disp = current.questions[qIndex];
        const dispVars = disp.variantlar || disp.answers || disp.options || [];
        const text = String(dispVars[i] ?? '');
        const src = variantsOf(ref.q, ref.kind);
        let srcIdx = src.findIndex(v => String(v) === text);
        if (srcIdx < 0) srcIdx = i;
        const correctNow = Number(ref.q.togri_javob) === srcIdx || (Number(ref.q.togri_javob) === src.length && srcIdx === src.length - 1);
        popupEdit({
          anchor: target.node, value: text, title: `${i + 1}-javob varianti (bo‘sh qoldirsangiz — o‘chiriladi)`,
          extra: { label: 'Shu variant — to‘g‘ri javob', checked: correctNow },
          onCommit: (val, isCorrect) => {
            const arr = src.slice();
            const ch = {};
            let c = Number(ref.q.togri_javob) || 0;
            if (!val.trim()) {
              if (arr.length <= 2) return toast('Kamida 2 ta variant qolishi kerak.', 'warning');
              arr.splice(srcIdx, 1);
              if (srcIdx < c) c--; else if (srcIdx === c) c = 0;
              ch.correct = Math.min(c, arr.length - 1);
            } else {
              arr[srcIdx] = val.trim();
              if (isCorrect) ch.correct = srcIdx;
            }
            ch.variants = arr;
            editQuestion(ref, ch, 'javob varianti');
            reloadEditor();
          }
        });
        return;
      }
      case 'qimage':
      case 'qvideo': {
        const ref = resolveSource();
        if (!ref) return toast('Bu savolning manbasi topilmadi.', 'error');
        const kind = target.type === 'qimage' ? 'image' : 'video';
        const path = await pickMedia(kind);
        if (!path) return;
        editQuestion(ref, kind === 'image' ? { image: path } : { video: path }, kind === 'image' ? 'rasm' : 'video');
        reloadEditor();
        return;
      }
      case 'tpltitle': {
        const card = target.node.closest('.template-card');
        const t = findTpl(card?.dataset.tplName);
        if (!t) return toast('Shablon topilmadi.', 'error');
        inPlaceEdit(target.node, val => {
          const v = val.trim();
          const oldTitle = String(t.title || ''), other = AUTO_CYR ? findTpl(t.name, OTHER) : null;
          if (!v || v === `${tplNumber(t)} shablon`) delete t.title; else t.title = v;
          if (other && cyrIsAuto(oldTitle, other.title)) { if (t.title) other.title = cyrOf(t.title); else delete other.title; }
          target.node.textContent = t.title || `${tplNumber(t)} shablon`;
          markDirty(`tpl:${LANG}:${t.name}:title`, `Shablon nomi: ${t.name} → "${t.title || 'standart'}"`);
          scheduleOverrides();
        });
        return;
      }
      case 'ui': {
        const node = target.node;
        const orig = target.n < 0 ? node.textContent : target.tn.nodeValue;
        const canInPlace = target.n < 0 && !node.closest('button,a,label,select,summary');
        if (canInPlace) inPlaceEdit(node, (val, o) => commitUiText(node, -1, val, o));
        else popupEdit({ anchor: node, value: orig.trim(), onCommit: val => commitUiText(node, target.n, val, orig) });
        return;
      }
    }
  }

  let hoverNode = null;
  function setHover(node) {
    if (hoverNode === node) return;
    hoverNode?.classList.remove('dev-hover');
    hoverNode = node;
    hoverNode?.classList.add('dev-hover');
  }
  document.addEventListener('mousemove', e => {
    if (!devOn || !e.shiftKey) return setHover(null);
    const t = editTarget(e);
    setHover(t && t.type !== 'dynamic' ? t.node : null);
  }, true);
  document.addEventListener('keyup', e => { if (e.key === 'Shift') setHover(null); });
  window.addEventListener('blur', () => setHover(null));
  document.addEventListener('mousedown', e => {
    if (devOn && e.shiftKey && e.button === 0 && editTarget(e)) e.preventDefault();
  }, true);
  document.addEventListener('click', e => {
    if (!devOn || !e.shiftKey || e.button !== 0) return;
    const target = editTarget(e);
    if (!target) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    setHover(null);
    handleShiftClick(e, target).catch(err => toast('Xatolik: ' + (err.message || err), 'error', 6000));
  }, true);

  /* ============================================================
     SHABLONLAR: qo'shish / o'chirish / nom
     ============================================================ */
  function findTpl(name, lang = LANG) {
    const list = DS ? DS.data[lang].templates : (lang === LANG ? window.BUNDLED_TEMPLATES || [] : []);
    return list.find(t => t.name === name) || null;
  }
  function hasTemplateTitles() {
    return (window.BUNDLED_TEMPLATES || []).some(t => t && t.title);
  }
  function decorateTemplates() {
    const grid = qs('#templateGrid');
    if (!grid) return;
    const files = typeof templateFiles !== 'undefined' ? templateFiles : [];
    grid.querySelectorAll('article.template-card:not(.dev-add-card)').forEach(card => {
      const h3 = qs('h3', card);
      if (!h3) return;
      if (!card.dataset.tplName) {
        const num = (h3.textContent.match(/\d+/) || [])[0];
        const f = files.find(x => (String(x.name).replace(/\.(?:py|js)$/i, '').match(/\d+/) || [])[0] === num);
        if (!f) return;
        card.dataset.tplName = f.name;
      }
      const t = findTpl(card.dataset.tplName);
      if (t?.title && h3.textContent !== t.title && !h3.classList.contains('dev-editing')) h3.textContent = t.title;
      const del = qs('.dev-card-del', card);
      if (devOn && !del) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'dev-ui dev-card-del'; b.title = 'Shablonni o‘chirish'; b.textContent = '✕';
        b.onclick = ev => { ev.stopPropagation(); deleteTemplate(card.dataset.tplName); };
        card.appendChild(b);
      } else if (!devOn && del) del.remove();
    });
    let add = qs('.dev-add-card', grid);
    if (devOn && !add) {
      add = document.createElement('article');
      add.className = 'dev-ui dev-add-card template-card panel';
      add.innerHTML = '<div class="dev-add-plus">＋</div><h3>Yangi shablon</h3><small>Dasturchi rejimi</small>';
      add.onclick = () => addTemplate();
      grid.appendChild(add);
    } else if (!devOn && add) add.remove();
    else if (add && add !== grid.lastElementChild) grid.appendChild(add);
  }
  function applyQuizLabel() {
    if (typeof currentFileIndex === 'undefined' || currentFileIndex < 0 || inSpecial() || inExam()) return;
    const f = templateFiles[currentFileIndex];
    const t = (window.BUNDLED_TEMPLATES || []).find(x => x.questions === f?.__questions);
    const label = qs('#quizTemplateLabel');
    if (t?.title && label && label.textContent !== t.title) label.textContent = t.title;
  }
  function placeholderQuestion(lang, kind, raqam) {
    const q = { savol: NEW_Q_TEXT[lang], togri_javob: 0, rasm: '' };
    if (kind === 'all') { q.raqam = raqam; q.javob = NEW_VARIANTS[lang].slice(); }
    else { q.variantlar = NEW_VARIANTS[lang].slice(); q.izoh = ''; q.izoh_video = ''; }
    return q;
  }
  function rebuildTemplates() {
    resetCaches();
    appFn('initBundledProject')?.();
    appFn('updateHomeCounts')?.();
  }
  async function addTemplate() {
    await ensureData();
    const all = [...DS.data.uz.templates, ...DS.data.cy.templates];
    const n = all.reduce((m, t) => Math.max(m, Number(tplNumber(t)) || 0), 0) + 1;
    const name = `shablon_${n}.js`;
    for (const L of ['uz', 'cy']) {
      DS.data[L].templates.push({ name, path: `assets/shablonlar/${name}`, questions: [placeholderQuestion(L, 'template')] });
    }
    rebuildTemplates();
    markDirty(`tpl:add:${name}`, `Yangi shablon qo‘shildi: ${n}-shablon`);
    const idx = templateFiles.findIndex(f => f.name === name);
    if (idx >= 0) {
      await openFile(idx);
      showView('quiz');
      openDrawer();
    }
    toast(`${n}-shablon yaratildi. Savolni o‘ng tomondagi muharrirda to‘ldiring.`, 'success', 5000);
  }
  async function deleteTemplate(name) {
    await ensureData();
    const t = findTpl(name);
    if (!t) return;
    if (!confirm(`"${tplLabel(t)}" (${(t.questions || []).length} ta savol) o‘chirilsinmi?\nLotin va kirill yozuvidan ham o‘chadi.`)) return;
    for (const L of ['uz', 'cy']) {
      const arr = DS.data[L].templates;
      const i = arr.findIndex(x => x.name === name);
      if (i >= 0) arr.splice(i, 1);
    }
    if (typeof currentFileIndex !== 'undefined') currentFileIndex = -1;
    rebuildTemplates();
    markDirty(`tpl:del:${name}`, `Shablon o‘chirildi: ${tplLabel(t)}`);
  }

  /* ============================================================
     SAVOL QO'SHISH / O'CHIRISH
     ============================================================ */
  async function addQuestion() {
    await ensureData();
    const ref = resolveSource();
    if (!ref) return toast('Avval shablon yoki test oching.', 'warning');
    if (ref.exam) return toast('Imtihon rejimida savol qo‘shib bo‘lmaydi — shablon ichida qo‘shing.', 'warning');
    if (ref.kind === 'template') {
      const at = ref.index + 1;
      ref.tpl.questions.splice(at, 0, placeholderQuestion(LANG, 'template'));
      const other = findTpl(ref.tpl.name, OTHER);
      if (other) other.questions.splice(Math.min(at, other.questions.length), 0, placeholderQuestion(OTHER, 'template'));
      markDirty(`q:add:${ref.tpl.name}:${Date.now()}`, `${tplLabel(ref.tpl)} — ${at + 1}-o‘ringa yangi savol qo‘shildi`);
      await reopenTemplate(at);
    } else {
      const all = [...DS.data.uz.questions, ...DS.data.cy.questions];
      const n = all.reduce((m, q) => Math.max(m, Number(q.raqam) || 0), 0) + 1;
      const q = placeholderQuestion(LANG, 'all', n);
      DS.data[LANG].questions.push(q);
      DS.data[OTHER].questions.push(placeholderQuestion(OTHER, 'all', n));
      current.questions.splice(qIndex + 1, 0, displayFromAll(q));
      answered.splice(qIndex + 1, 0, null);
      markDirty(`q:add:all:${n}`, `Umumiy bazaga yangi savol qo‘shildi: №${n}`);
      resetCaches();
      showQuestion(qIndex + 1);
    }
    toast('Yangi savol qo‘shildi — matnini muharrirda yozing.', 'success');
    openDrawer();
    setTimeout(() => { const ta = qs('#devQText'); ta?.focus(); ta?.select(); }, 50);
  }
  async function deleteQuestion() {
    await ensureData();
    const ref = resolveSource();
    if (!ref) return;
    if (ref.exam) return toast('Imtihon rejimida savol o‘chirib bo‘lmaydi — shablon ichida o‘chiring.', 'warning');
    if (!confirm(`${describe(ref)} o‘chirilsinmi?\nLotin va kirill yozuvidan ham o‘chadi.`)) return;
    if (ref.kind === 'template') {
      if (ref.tpl.questions.length <= 1) return toast('Shablonda kamida 1 ta savol qolishi kerak. Butun shablonni o‘chirish uchun Shablonlar bo‘limidagi ✕ ni bosing.', 'warning', 6000);
      ref.tpl.questions.splice(ref.index, 1);
      const other = findTpl(ref.tpl.name, OTHER);
      if (other && other.questions.length > ref.index) other.questions.splice(ref.index, 1);
      markDirty(`q:del:${ref.tpl.name}:${Date.now()}`, `${describe(ref)} o‘chirildi`);
      await reopenTemplate(Math.min(ref.index, ref.tpl.questions.length - 1));
    } else {
      for (const L of ['uz', 'cy']) {
        const arr = DS.data[L].questions;
        const i = arr.findIndex(x => Number(x.raqam) === Number(ref.q.raqam));
        if (i >= 0) arr.splice(i, 1);
      }
      current.questions.splice(qIndex, 1);
      answered.splice(qIndex, 1);
      markDirty(`q:del:all:${ref.q.raqam}`, `Umumiy baza №${ref.q.raqam} o‘chirildi`);
      resetCaches();
      if (!current.questions.length) { showView('home'); return; }
      showQuestion(Math.min(qIndex, current.questions.length - 1));
    }
  }
  async function reopenTemplate(index) {
    const i = currentFileIndex;
    rebuildTemplates();
    await openFile(i);
    showView('quiz');
    showQuestion(Math.max(0, index));
  }

  /* ============================================================
     SAVOL MUHARRIRI (o'ng panel)
     ============================================================ */
  let drawer = null, editorRef = null, editorCur = null, editorIdx = -1, applyTimer = null;
  function buildDrawer() {
    if (drawer) return drawer;
    drawer = document.createElement('aside');
    drawer.id = 'devDrawer';
    drawer.className = 'dev-ui dev-drawer';
    drawer.hidden = true;
    drawer.innerHTML = `
      <header class="dev-drawer-head">
        <div><b>Savol muharriri</b><small id="devQCtx">—</small></div>
        <button type="button" class="dev-icon-btn" data-a="close" title="Yopish">×</button>
      </header>
      <div class="dev-drawer-body">
        <p id="devQEmpty" class="dev-note" hidden></p>
        <div id="devQForm">
          <label class="dev-label">Savol matni<textarea id="devQText" rows="3" spellcheck="false"></textarea></label>
          <div class="dev-label">Javob variantlari <small>● — to‘g‘ri javob</small></div>
          <div id="devVariants" class="dev-variants"></div>
          <button type="button" class="dev-btn dev-btn-ghost" data-a="addVar">＋ Variant qo‘shish</button>
          <div class="dev-media-box">
            <div class="dev-label">Savol rasmi</div>
            <div class="dev-media-row"><input id="devImgPath" placeholder="rasmlar/1-1.jpg" spellcheck="false"><button type="button" class="dev-btn" data-a="pickImg">Fayl…</button><button type="button" class="dev-icon-btn" data-a="clearImg" title="Rasmni olib tashlash">✕</button></div>
            <div id="devImgPrev" class="dev-media-prev"></div>
          </div>
          <div class="dev-media-box">
            <div class="dev-label">Xato javobdagi video</div>
            <div class="dev-media-row"><input id="devVidPath" placeholder="videolar/1_1.mov" spellcheck="false"><button type="button" class="dev-btn" data-a="pickVid">Fayl…</button><button type="button" class="dev-icon-btn" data-a="clearVid" title="Videoni olib tashlash">✕</button></div>
            <div id="devVidPrev" class="dev-media-prev"></div>
          </div>
          <label class="dev-label" id="devIzohWrap">Izoh<textarea id="devQIzoh" rows="2" spellcheck="false"></textarea></label>
          <div id="devCyrBox" class="dev-cyr-box" hidden>
            <div class="dev-cyr-head"><b>Кирилл нусха</b><small>lotindan avtomatik · <span class="dev-w risky">sariq</span> so‘zni bosib lug‘atga o‘rgating</small></div>
            <div data-cyrf="savol"></div>
            <div id="devCyrVars"></div>
            <div data-cyrf="izoh"></div>
          </div>
          <label class="dev-check"><input type="checkbox" id="devSyncSame" checked> <span id="devSyncText">Bir xil savollarni ham yangilash</span></label>
          <div class="dev-drawer-actions">
            <button type="button" class="dev-btn" data-a="addQ">＋ Yangi savol</button>
            <button type="button" class="dev-btn dev-btn-danger" data-a="delQ">🗑 Savolni o‘chirish</button>
          </div>
          <p class="dev-note">O‘zgarishlar testda darhol ko‘rinadi. Mavjud fayl nomini yozsangiz (masalan <code>rasmlar/5-3.jpg</code>) nusxa yaratilmaydi. Doimiy saqlash uchun pastdagi <b>Saqlash</b>ni bosing.</p>
        </div>
      </div>`;
    document.body.appendChild(drawer);
    drawer.addEventListener('input', e => {
      if (e.target.dataset.cyr) { onCyrInput(e.target); return; }
      if (e.target.matches('#devQText,#devQIzoh,#devImgPath,#devVidPath,.dev-var input[type=text]')) scheduleApply();
      if (e.target.matches('#devImgPath')) paintPreview('image');
      if (e.target.matches('#devVidPath')) paintPreview('video');
    });
    drawer.addEventListener('change', e => { if (e.target.matches('.dev-var input[type=radio]')) applyEditor(); });
    drawer.addEventListener('keydown', e => e.stopPropagation());
    drawer.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      if (a === 'close') closeDrawer();
      if (a === 'addVar') { addVariantRow('', false); qsa('.dev-var input[type=text]', drawer).pop()?.focus(); }
      if (a === 'delVar') {
        const rows = qsa('.dev-var', drawer);
        if (rows.length <= 2) return toast('Kamida 2 ta variant bo‘lishi kerak.', 'warning');
        const row = e.target.closest('.dev-var');
        const wasChecked = qs('input[type=radio]', row).checked;
        row.remove();
        qsa('.dev-var-n', drawer).forEach((n, i) => { n.textContent = 'F' + (i + 1); });
        if (wasChecked) { const first = qs('.dev-var input[type=radio]', drawer); if (first) first.checked = true; }
        applyEditor();
      }
      if (a === 'pickImg' || a === 'pickVid') {
        const kind = a === 'pickImg' ? 'image' : 'video';
        const path = await pickMedia(kind);
        if (!path) return;
        qs(kind === 'image' ? '#devImgPath' : '#devVidPath').value = path;
        paintPreview(kind); applyEditor();
      }
      if (a === 'clearImg') { qs('#devImgPath').value = ''; paintPreview('image'); applyEditor(); }
      if (a === 'clearVid') { qs('#devVidPath').value = ''; paintPreview('video'); applyEditor(); }
      if (a === 'addQ') addQuestion();
      if (a === 'delQ') deleteQuestion();
      if (a === 'cyrReset') resetCyrField(e.target.closest('[data-a]').dataset.k);
      if (a === 'cyrWord') teachWord(e.target.closest('[data-a]'));
    });
    return drawer;
  }

  /* ---------- Kirill nusxa bo'limi (faqat lotin sahifada) ---------- */
  let cyrTimer = null;
  const cyrLat = key => {
    const ref = editorRef;
    if (!ref) return '';
    if (key === 'savol') return String(ref.q.savol ?? '');
    if (key === 'izoh') return String(ref.q.izoh ?? '');
    return String(variantsOf(ref.q, ref.kind)[Number(key.slice(2))] ?? '');
  };
  const cyrGet = (cp, key) => {
    if (!cp) return '';
    if (key === 'savol' || key === 'izoh') return String(cp[key] ?? '');
    const vk = TR.variantKeyOf(cp);
    return String((vk ? cp[vk] : [])[Number(key.slice(2))] ?? '');
  };
  function cyrSet(cp, key, value) {
    if (key === 'savol' || key === 'izoh') { cp[key] = value; return; }
    const vk = TR.variantKeyOf(cp) || variantKey(editorRef.kind);
    if (!Array.isArray(cp[vk])) cp[vk] = [];
    cp[vk][Number(key.slice(2))] = value;
  }
  function cyrHl(text) {
    const r = TR.convert(text);
    return r.parts.map(p => {
      if (typeof p === 'string') return escHtml(p);
      const w = r.words[p];
      if (w.how === 'latin') return escHtml(w.cyr);
      return `<span class="dev-w ${w.how}" data-a="cyrWord" data-src="${escHtml(w.src)}" data-cyr="${escHtml(w.cyr)}" title="${escHtml(w.src)} → ${escHtml(w.cyr)} · bosing — tuzatish">${escHtml(w.cyr)}</span>`;
    }).join('');
  }
  function cyrFieldHtml(key, label, multiline) {
    const k = escHtml(key);
    return `<div class="dev-cyr-label">${escHtml(label)}<span class="dev-cyr-state" data-st="${k}"></span><button type="button" class="dev-mini" data-a="cyrReset" data-k="${k}" hidden title="Lotindan qayta o‘girish">↺ avtomatik</button></div>
      ${multiline ? `<textarea data-cyr="${k}" rows="2" spellcheck="false"></textarea>` : `<input type="text" data-cyr="${k}" spellcheck="false">`}
      <div class="dev-cyr-hl" data-hl="${k}"></div>`;
  }
  function paintCyr() {
    const box = drawer && qs('#devCyrBox', drawer);
    if (!box) return;
    const ref = editorRef;
    box.hidden = !AUTO_CYR || !ref;
    if (box.hidden) return;
    const cp = ref.counterpart;
    const sf = qs('[data-cyrf=savol]', box), izf = qs('[data-cyrf=izoh]', box), vbox = qs('#devCyrVars', box);
    if (!sf.firstChild) sf.innerHTML = cyrFieldHtml('savol', 'Савол', true);
    if (!izf.firstChild) izf.innerHTML = cyrFieldHtml('izoh', 'Изоҳ', true);
    izf.hidden = ref.kind === 'all';
    const n = variantsOf(ref.q, ref.kind).length;
    if (vbox.childElementCount !== n) vbox.innerHTML = Array.from({ length: n }, (_, i) => `<div class="dev-cyr-var">${cyrFieldHtml('v:' + i, 'F' + (i + 1), false)}</div>`).join('');
    const keys = ['savol', ...(ref.kind === 'all' ? [] : ['izoh']), ...Array.from({ length: n }, (_, i) => 'v:' + i)];
    for (const key of keys) {
      const lat = cyrLat(key), cy = cyrGet(cp, key), auto = cyrOf(lat);
      const input = qs(`[data-cyr="${key}"]`, box);
      if (input && document.activeElement !== input && input.value !== cy) input.value = cy;
      const broken = !!lat.trim() && TR.isBroken(lat, cy);
      const manual = !broken && cy.trim() !== auto.trim();
      const st = qs(`[data-st="${key}"]`, box);
      st.textContent = broken ? 'BO‘SH' : manual ? 'QO‘LDA' : 'AVTO';
      st.className = 'dev-cyr-state ' + (broken ? 'bad' : manual ? 'manual' : 'auto');
      st.title = manual ? 'Qo‘lda tuzatilgan — lotin o‘zgarsa ham ustidan yozilmaydi' : '';
      qs(`[data-a=cyrReset][data-k="${key}"]`, box).hidden = !(manual || broken);
      const hl = qs(`[data-hl="${key}"]`, box);
      // avtomatik variant ko'rsatiladi (qo'lda bo'lsa — taqqoslash uchun)
      hl.innerHTML = lat.trim() ? (manual ? '<i>avtomatik:</i> ' : '') + cyrHl(lat) : '';
      hl.hidden = !lat.trim() || (!manual && !TR.convert(lat).words.some(w => w.how === 'risky' || w.how === 'user' || w.how === 'dict'));
    }
  }
  function onCyrInput(input) {
    clearTimeout(cyrTimer);
    cyrTimer = setTimeout(() => {
      const ref = editorRef;
      if (!ref || editorCur !== current || editorIdx !== qIndex) return;
      const cp = ref.counterpart || (ref.counterpart = ensureCounterpart(ref));
      if (!cp) return;
      const key = input.dataset.cyr, val = input.value.replace(/\r/g, '').trim();
      if (cyrGet(cp, key) === val) return;
      cyrSet(cp, key, val);
      markDirty(`cy:${describe(ref)}:${key}`, `${describe(ref)} — kirill matn qo‘lda tuzatildi`);
      paintCyr();
    }, 250);
  }
  function resetCyrField(key) {
    const ref = editorRef;
    if (!ref) return;
    const cp = ref.counterpart || (ref.counterpart = ensureCounterpart(ref));
    if (!cp) return;
    cyrSet(cp, key, cyrOf(cyrLat(key)));
    markDirty(`cy:${describe(ref)}:${key}`, `${describe(ref)} — kirill matn avtomatikka qaytarildi`);
    const input = drawer && qs(`[data-cyr="${key}"]`, drawer);
    if (input) input.value = cyrGet(cp, key);
    paintCyr();
  }
  // Sariq so'zni bosish: to'g'ri kirill yozilishini lug'atga o'rgatish
  function teachWord(span) {
    const src = span.dataset.src, cur = span.dataset.cyr;
    popupEdit({
      anchor: span, value: cur,
      title: `«${src}» kirillda qanday yoziladi? (lug‘atga o‘rgatiladi)`,
      extra: { label: 'Qo‘shimchali shakllariga ham (mototsikl → mototsiklga, mototsiklni…)', checked: true },
      onCommit: (val, stem) => {
        val = val.trim();
        if (!val || val.toLowerCase() === cur.toLowerCase()) return;
        const ref = editorRef, cp = ref?.counterpart;
        const keys = ['savol', 'izoh', ...variantsOf(ref?.q, ref?.kind).map((_, i) => 'v:' + i)];
        const oldAuto = Object.fromEntries(keys.map(k => [k, cyrOf(cyrLat(k))]));
        const r = stem ? TR.learnStem(src, val) : TR.learn(src, val, false);
        if (!r) return;
        saveLocalDict();
        // shu savoldagi avtomatik holatdagi kirill maydonlarni yangi lug'at bilan qayta o'giramiz
        if (cp) keys.forEach(k => { if (cyrGet(cp, k).trim() === oldAuto[k].trim() && cyrLat(k).trim()) cyrSet(cp, k, cyrOf(cyrLat(k))); });
        markDirty(`dict:${r.key}`, `Lug‘at: ${r.key} → ${r.value.replace(/\*$/, '')}`);
        qsa('[data-cyr]', drawer).forEach(i => { if (cp) i.value = cyrGet(cp, i.dataset.cyr); });
        paintCyr();
        toast(`O‘rgatildi: ${src} → ${val}. Boshqa savollardagi shu so‘zni “🔤 Kirill tekshiruvi” orqali yangilang.`, 'success', 6000);
      }
    });
  }
  let varGroup = 0;
  function addVariantRow(text, checked) {
    const box = qs('#devVariants');
    const row = document.createElement('div');
    row.className = 'dev-var';
    row.innerHTML = `<input type="radio" name="devCorrect${varGroup}" title="To‘g‘ri javob"><span class="dev-var-n"></span><input type="text" spellcheck="false"><button type="button" class="dev-icon-btn" data-a="delVar" title="Variantni o‘chirish">✕</button>`;
    qs('input[type=text]', row).value = text;
    qs('input[type=radio]', row).checked = checked;
    box.appendChild(row);
    qsa('.dev-var-n', box).forEach((n, i) => { n.textContent = 'F' + (i + 1); });
  }
  function paintPreview(kind) {
    const path = qs(kind === 'image' ? '#devImgPath' : '#devVidPath').value.trim();
    const box = qs(kind === 'image' ? '#devImgPrev' : '#devVidPrev');
    box.innerHTML = '';
    if (!path) { box.innerHTML = '<span class="dev-muted">Yo‘q</span>'; return; }
    const url = mediaUrl(path);
    if (!url) { box.innerHTML = '<span class="dev-warn">Fayl topilmadi — yo‘lni tekshiring.</span>'; return; }
    if (kind === 'image') {
      const img = new Image(); img.src = url; img.alt = '';
      img.onerror = () => { box.innerHTML = '<span class="dev-warn">Rasm ochilmadi.</span>'; };
      box.appendChild(img);
    } else {
      const v = document.createElement('video'); v.src = url; v.controls = true; v.preload = 'metadata'; v.muted = true;
      box.appendChild(v);
    }
    const tag = document.createElement('small');
    tag.className = /^updates\//i.test(path) ? 'dev-tag dev-tag-new' : 'dev-tag';
    tag.textContent = /^updates\//i.test(path) ? 'yangi fayl (GitHub’ga yuklanadi)' : 'loyihadagi mavjud fayl';
    box.appendChild(tag);
  }
  function openDrawer() {
    if (!devOn) return;
    buildDrawer();
    sessionStorage.setItem(DRAWER_KEY, '1');
    if (!document.body.classList.contains('view-quiz')) { toast('Savol muharriri test ichida ishlaydi. Avval shablon yoki testni oching.', 'warning'); return; }
    drawer.hidden = false;
    document.body.classList.add('dev-drawer-open');
    reloadEditor();
  }
  function closeDrawer(remember = true) {
    if (remember) sessionStorage.removeItem(DRAWER_KEY);
    if (!drawer) return;
    drawer.hidden = true;
    document.body.classList.remove('dev-drawer-open');
  }
  async function reloadEditor() {
    if (!drawer || drawer.hidden) return;
    await ensureData();
    const ref = resolveSource();
    editorRef = ref; editorCur = current; editorIdx = qIndex;
    qs('#devQEmpty').hidden = !!ref;
    qs('#devQForm').hidden = !ref;
    if (!ref) {
      qs('#devQCtx').textContent = '—';
      qs('#devQEmpty').textContent = 'Bu savolning manbasi topilmadi. Shablon yoki “Barcha savollar” bo‘limidan oching.';
      return;
    }
    qs('#devQCtx').textContent = describe(ref) + (ref.exam ? ' (imtihondan)' : '') + (LANG === 'cy' ? ' · Кирилл' : ' · Lotin');
    qs('#devQText').value = String(ref.q.savol || '');
    varGroup++;
    qs('#devVariants').innerHTML = '';
    const vars = variantsOf(ref.q, ref.kind);
    let c = Number(ref.q.togri_javob) || 0;
    if (c === vars.length && vars.length) c = vars.length - 1;
    vars.forEach((v, i) => addVariantRow(typeof v === 'object' ? (v.text || v.label || JSON.stringify(v)) : String(v), i === c));
    qs('#devImgPath').value = getImage(ref.q);
    qs('#devVidPath').value = getVideo(ref.q);
    let fallback = null;
    if (ref.kind === 'all' && (!getImage(ref.q) || !getVideo(ref.q))) fallback = ref.matches.find(m => m.kind === 'template')?.q;
    qs('#devImgPath').placeholder = fallback && getImage(fallback) ? `shablondan: ${getImage(fallback)}` : 'rasmlar/1-1.jpg';
    qs('#devVidPath').placeholder = fallback && getVideo(fallback) ? `shablondan: ${getVideo(fallback)}` : 'videolar/1_1.mov';
    qs('#devQIzoh').value = String(ref.q.izoh || '');
    qs('#devIzohWrap').hidden = ref.kind === 'all';
    qs('#devSyncText').textContent = ref.matches.length
      ? `Bir xil savollarni ham yangilash (yana ${ref.matches.length} joyda bor)`
      : 'Bir xil savollarni ham yangilash (boshqa joyda yo‘q)';
    paintPreview('image'); paintPreview('video');
    qsa('#devCyrVars', drawer).forEach(b => { b.innerHTML = ''; });
    paintCyr();
  }
  function scheduleApply() { clearTimeout(applyTimer); applyTimer = setTimeout(applyEditor, 220); }
  function applyEditor() {
    clearTimeout(applyTimer);
    const ref = editorRef;
    if (!ref || editorCur !== current || editorIdx !== qIndex) return;
    const rows = qsa('.dev-var', drawer).map(r => ({ text: qs('input[type=text]', r).value.trim(), on: qs('input[type=radio]', r).checked }));
    const kept = rows.filter(r => r.text);
    const variants = kept.map(r => r.text);
    const correct = Math.max(0, kept.findIndex(r => r.on));
    const values = {
      savol: qs('#devQText').value.trim(),
      variants, correct,
      image: qs('#devImgPath').value.trim(),
      video: qs('#devVidPath').value.trim(),
      izoh: qs('#devQIzoh').value
    };
    const ch = {};
    if (values.savol !== String(ref.q.savol || '')) ch.savol = values.savol;
    if (JSON.stringify(values.variants) !== JSON.stringify(variantsOf(ref.q, ref.kind))) ch.variants = values.variants;
    const curC = Number(ref.q.togri_javob) || 0;
    if (values.correct !== curC && !(curC === variants.length && values.correct === variants.length - 1)) ch.correct = values.correct;
    if (values.image !== getImage(ref.q)) ch.image = values.image;
    if (values.video !== getVideo(ref.q)) ch.video = values.video;
    if (ref.kind !== 'all' && values.izoh !== String(ref.q.izoh || '')) ch.izoh = values.izoh;
    if (!Object.keys(ch).length) return;
    const what = Object.keys(ch).map(k => ({ savol: 'matn', variants: 'variantlar', correct: 'to‘g‘ri javob', image: 'rasm', video: 'video', izoh: 'izoh' }[k])).join(', ');
    editQuestion(ref, ch, what);
    paintCyr();
  }

  /* ============================================================
     SAQLASH VA GITHUB FAYLLARI
     ============================================================ */
  async function collectUpdateMedia(payload) {
    const need = new Set();
    const scan = v => {
      if (Array.isArray(v)) return v.forEach(scan);
      if (v && typeof v === 'object') return Object.values(v).forEach(scan);
      if (typeof v === 'string' && /^updates\/media\//i.test(v)) need.add(v);
    };
    scan(payload.templates); scan(payload.questions); scan(payload.templatesKiril); scan(payload.questionsKiril);
    const items = [], missing = [];
    for (const path of need) {
      let blob = mediaStore.get(path) || window.APP_UPDATE_MEDIA?.[path];
      // EXE ichida GitHub'dan kelgan media shifrlangan vault ichida — o'sha yerdan o'qiladi.
      if (!blob && window.__VAULT_HOST__) {
        try {
          const r = await fetch(path.split('/').map(encodeURIComponent).join('/'), { cache: 'no-store' });
          if (r.ok) blob = await r.blob();
        } catch (_) { /* topilmadi */ }
      }
      if (blob) items.push({ path, blob, type: blob.type || 'application/octet-stream' });
      else missing.push(path);
    }
    if (missing.length) throw new Error('Media fayl topilmadi: ' + missing.slice(0, 5).join(', ') + '. Savoldagi yo‘lni tekshiring yoki faylni qayta tanlang.');
    return items;
  }
  function buildPayload(version, notes) {
    return {
      version,
      generatedAt: new Date().toISOString(),
      notes,
      templates: DS.data.uz.templates,
      questions: DS.data.uz.questions,
      templatesKiril: DS.data.cy.templates,
      questionsKiril: DS.data.cy.questions,
      videoPolicy: DS.videoPolicy,
      uiText,
      translitDict: TR ? TR.getUserDict() : {}
    };
  }
  // Saqlashdan oldin: kirill nusxasi yo'q / bo'sh qolgan savollarni lotindan to'ldirish
  function autoFillCyr() {
    if (!TR || !DS) return { fields: 0, questions: 0 };
    const r = TR.fillPayload({
      templates: DS.data.uz.templates, templatesKiril: DS.data.cy.templates,
      questions: DS.data.uz.questions, questionsKiril: DS.data.cy.questions
    });
    if (r.fields || r.questions) resetCaches();
    return r;
  }

  /* ============================================================
     KIRILL TEKSHIRUVI: buzilgan va farq qiladigan kirill matnlar
     ============================================================ */
  function scanCyr() {
    const out = [];
    const U = DS.data.uz, C = DS.data.cy;
    const add = (where, field, lat, get, set) => {
      if (!String(lat ?? '').trim()) return;
      const cy = get(), auto = cyrOf(lat);
      const broken = TR.isBroken(lat, cy);
      if (broken || String(cy ?? '').trim() !== auto.trim()) out.push({ where, field, lat: String(lat), cy: String(cy ?? ''), auto, broken, set });
    };
    const qFields = (q, cq, vk, where) => {
      add(where, 'Savol', q.savol, () => cq.savol, v => { cq.savol = v; });
      if (typeof q.izoh === 'string') add(where, 'Izoh', q.izoh, () => cq.izoh, v => { cq.izoh = v; });
      (Array.isArray(q[vk]) ? q[vk] : []).forEach((v, i) => add(where, `F${i + 1}`, v, () => (cq[vk] || [])[i], x => {
        if (!Array.isArray(cq[vk])) cq[vk] = [];
        cq[vk][i] = x;
      }));
    };
    U.templates.forEach(t => {
      const ct = C.templates.find(x => x.name === t.name), nm = tplLabel(t);
      if (!ct) { out.push({ where: nm, field: 'butun shablon', lat: `${(t.questions || []).length} ta savol`, cy: '', auto: '', broken: true, set: null }); return; }
      if (t.title) add(nm, 'Shablon nomi', t.title, () => ct.title, v => { ct.title = v; });
      (t.questions || []).forEach((q, i) => {
        const cq = ct.questions?.[i], where = `${nm}, ${i + 1}-savol`;
        if (!cq) out.push({ where, field: 'butun savol', lat: String(q.savol ?? ''), cy: '', auto: cyrOf(q.savol), broken: true, set: null });
        else qFields(q, cq, 'variantlar', where);
      });
    });
    const byR = new Map(C.questions.map(q => [Number(q.raqam), q]));
    U.questions.forEach(q => {
      const cq = byR.get(Number(q.raqam)), where = `Umumiy baza №${q.raqam}`;
      if (!cq) out.push({ where, field: 'butun savol', lat: String(q.savol ?? ''), cy: '', auto: cyrOf(q.savol), broken: true, set: null });
      else qFields(q, cq, 'javob', where);
    });
    return out;
  }
  function wordDiff(a, b) {
    const A = a.split(/(\s+)/), B = b.split(/(\s+)/);
    if (A.length !== B.length) return { cur: a ? `<del>${escHtml(a)}</del>` : '<i>bo‘sh</i>', auto: `<ins>${escHtml(b)}</ins>` };
    return {
      cur: A.map((x, i) => (x === B[i] ? escHtml(x) : `<del>${escHtml(x)}</del>`)).join(''),
      auto: B.map((x, i) => (x === A[i] ? escHtml(x) : `<ins>${escHtml(x)}</ins>`)).join('')
    };
  }
  async function openCyrCheck() {
    if (!TR) return toast('translit.js ulanmagan.', 'error');
    await ensureData();
    qs('#devCyrCheck')?.remove();
    const m = document.createElement('div');
    m.id = 'devCyrCheck';
    m.className = 'dev-ui dev-modal';
    document.body.appendChild(m);
    let items = [], shown = 150;
    const afterChange = () => {
      resetCaches();
      if (IS_CYRL) rebuildTemplates();
      if (drawer && !drawer.hidden) reloadEditor();
    };
    const paint = () => {
      items = scanCyr();
      const broken = items.filter(x => x.broken), diff = items.filter(x => !x.broken);
      const list = diff.slice(0, shown).map((x, i) => {
        const d = wordDiff(x.cy, x.auto);
        return `<li class="dev-cyr-item" data-i="${items.indexOf(x)}">
          <div class="dev-cyr-meta">${escHtml(x.where)} · ${escHtml(x.field)}</div>
          <div class="dev-cyr-lines"><span>Lotin</span><span>${escHtml(x.lat)}</span><span>Kirill</span><span>${d.cur}</span><span>Avtomatik</span><span>${d.auto}</span></div>
          <div class="dev-cyr-acts"><button type="button" class="dev-btn" data-fix>✓ Avtomatikni qabul qilish</button><button type="button" class="dev-btn dev-btn-ghost" data-skip>Hozirgisi to‘g‘ri</button></div>
        </li>`;
      }).join('');
      m.innerHTML = `
        <div class="dev-dialog dev-dialog-wide" role="dialog" aria-modal="true">
          <div class="dev-dialog-head">
            <div><div class="dev-kicker">LOTIN → KIRILL</div><h3>Kirill tekshiruvi</h3></div>
            <button type="button" class="dev-icon-btn" data-a="close">×</button>
          </div>
          <div class="dev-cyr-stats">
            <div class="${broken.length ? 'bad' : ''}"><b>${broken.length}</b><small>buzilgan (bo‘sh, “Янги савол матни”, lotin harfli yoki umuman yo‘q)</small></div>
            <div><b>${diff.length}</b><small>avtomatik o‘girmadan farq qiladi</small></div>
          </div>
          ${broken.length ? `<p><button type="button" class="dev-btn primary" data-a="fillAll">⚡ Buzilganlarning hammasini lotindan to‘ldirish (${broken.length})</button></p>
            <details class="dev-details"><summary>Buzilganlar ro‘yxati</summary><ul>${broken.slice(0, 200).map(x => `<li>${escHtml(x.where)} · ${escHtml(x.field)}: <i>${escHtml(x.cy || 'bo‘sh')}</i></li>`).join('')}</ul></details>`
            : '<p class="dev-ok">Buzilgan kirill matn yo‘q ✓</p>'}
          ${diff.length ? `<p class="dev-muted">Farqlar har doim ham xato emas: lotin matnda imlo xatosi bo‘lsa, kirill to‘g‘ri yozilgan bo‘lishi mumkin. Har birini ko‘rib qabul qiling. Saqlash uchun pastdagi <b>💾 Saqlash</b>ni bosing.</p>
            <ol class="dev-cyr-list">${list}</ol>${diff.length > shown ? `<p><button type="button" class="dev-btn" data-a="more">Yana ko‘rsatish (${diff.length - shown})</button></p>` : ''}` : ''}
        </div>`;
    };
    paint();
    m.addEventListener('click', e => {
      if (e.target === m) { m.remove(); return; }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'close') { m.remove(); return; }
      if (a === 'more') { shown += 150; paint(); return; }
      if (a === 'fillAll') {
        const r = autoFillCyr();
        markDirty(`cy:fill:${Date.now()}`, `Kirill: ${r.questions} ta savol va ${r.fields} ta maydon lotindan to‘ldirildi`);
        toast(`To‘ldirildi: ${r.questions} ta savol, ${r.fields} ta maydon.`, 'success');
        afterChange(); paint(); return;
      }
      const li = e.target.closest('.dev-cyr-item');
      if (!li) return;
      const x = items[Number(li.dataset.i)];
      if (e.target.closest('[data-fix]') && x?.set) {
        x.set(x.auto);
        markDirty(`cy:${x.where}:${x.field}`, `${x.where} — kirill ${x.field} avtomatikka almashtirildi`);
        afterChange();
        li.classList.add('done');
        li.querySelector('.dev-cyr-acts').innerHTML = '<span class="dev-ok">✓ Almashtirildi</span>';
      }
      if (e.target.closest('[data-skip]')) li.remove();
    });
  }
  function repoConfig() {
    const cfg = window.APP_UPDATER?.getConfig?.() || {};
    const ok = !!cfg.repo && !/USERNAME|REPOSITORY/i.test(cfg.repo);
    return { ok, repo: cfg.repo || '', branch: cfg.branch || 'main' };
  }
  async function fetchTimeout(url, opts = {}, ms = 6000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, { cache: 'no-store', ...opts, signal: ctl.signal }); }
    finally { clearTimeout(timer); }
  }
  // GitHub'dagi joriy versiya. Token bo'lsa API orqali (kesh yo'q), bo'lmasa raw orqali.
  async function remoteVersion() {
    const cfg = repoConfig();
    if (!cfg.ok) return null;
    const read = async r => (r.ok ? String(JSON.parse(await r.text()).version || '') || null : null);
    if (ghToken) {
      try {
        const v = await read(await fetchTimeout(`https://api.github.com/repos/${cfg.repo}/contents/version.json?ref=${encodeURIComponent(cfg.branch)}`,
          { headers: { Authorization: 'Bearer ' + ghToken, Accept: 'application/vnd.github.raw+json' } }));
        if (v) return v;
      } catch (_) { /* token ishlamasa oddiy usulga o'tamiz */ }
    }
    try {
      return await read(await fetchTimeout(`https://raw.githubusercontent.com/${cfg.repo}/${encodeURIComponent(cfg.branch)}/version.json?v=${Date.now()}`));
    } catch (_) { return null; }
  }

  /* ============================================================
     GITHUB'GA AVTOMATIK JOYLASH (token shifrlangan holda saqlanadi)
     ============================================================ */
  const b64e = bytes => {
    const a = new Uint8Array(bytes); let s = '';
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const b64d = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
  async function deriveKey(secret, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptToken(token, secret) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(secret, salt), new TextEncoder().encode(token));
    return { v: 1, salt: b64e(salt), iv: b64e(iv), data: b64e(data) };
  }
  async function decryptToken(enc, secret) {
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(enc.iv) }, await deriveKey(secret, b64d(enc.salt)), b64d(enc.data));
    return new TextDecoder().decode(out);
  }
  function encryptedTokenSource() {
    try { const ls = JSON.parse(localStorage.getItem(TOKEN_LS) || 'null'); if (ls?.data) return ls; } catch (_) { /* e'tiborsiz */ }
    return window.GITHUB_PUBLISH_TOKEN?.data ? window.GITHUB_PUBLISH_TOKEN : null;
  }
  async function unlockToken(secret) {
    const enc = encryptedTokenSource();
    if (!enc) return false;
    try {
      ghToken = await decryptToken(enc, secret);
      sessionStorage.setItem(TOKEN_SS, ghToken);
      return true;
    } catch (_) { ghToken = null; return false; }
  }
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = () => reject(fr.error || new Error('Faylni o‘qib bo‘lmadi'));
      fr.readAsDataURL(blob);
    });
  }
  // Git o'z fayllarini shu usulda belgilaydi: SHA-1("blob <hajm>\0" + mazmun).
  async function gitBlobSha(blob) {
    const header = new TextEncoder().encode(`blob ${blob.size}\0`);
    const buf = new Uint8Array(header.length + blob.size);
    buf.set(header);
    buf.set(new Uint8Array(await blob.arrayBuffer()), header.length);
    const h = await crypto.subtle.digest('SHA-1', buf);
    return [...new Uint8Array(h)].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  // Oldingi chala urinishda yuklangan fayl GitHub'da qolgan bo'lsa, uni qayta yubormaymiz.
  async function blobExists(token, repo, sha) {
    try {
      const r = await fetchTimeout(`https://api.github.com/repos/${repo}/git/blobs/${sha}`,
        { method: 'HEAD', headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' } }, 15000);
      return r.ok;
    } catch (_) { return false; }
  }
  // Katta fayl: XHR orqali — foiz ko'rinadi. 90 soniya hech narsa ketmasa, ulanish uzilgan deb qayta uriniladi.
  function uploadBlob(token, repo, base64, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', `https://api.github.com/repos/${repo}/git/blobs`);
      x.setRequestHeader('Authorization', 'Bearer ' + token);
      x.setRequestHeader('Accept', 'application/vnd.github+json');
      x.setRequestHeader('X-GitHub-Api-Version', '2022-11-28');
      x.setRequestHeader('Content-Type', 'application/json');
      const started = Date.now();
      let lastMove = Date.now(), lastLoaded = 0, sentAll = false, stalled = false;
      const watchdog = setInterval(() => {
        const limit = sentAll ? 5 * 60 * 1000 : 90 * 1000; // yuborib bo'lingach GitHub javobini ko'proq kutamiz
        if (Date.now() - lastMove > limit) { stalled = true; x.abort(); }
      }, 5000);
      x.upload.onprogress = e => {
        if (e.loaded > lastLoaded) { lastLoaded = e.loaded; lastMove = Date.now(); }
        if (e.total && e.loaded >= e.total && !sentAll) { sentAll = true; lastMove = Date.now(); }
        const secs = (Date.now() - started) / 1000;
        onProgress(e.loaded, e.total, secs > 1 ? Math.round(e.loaded * 0.75 / secs) : 0);
      };
      const done = () => clearInterval(watchdog);
      x.onload = () => {
        done();
        let data = null; try { data = JSON.parse(x.responseText); } catch (_) { /* bo'sh */ }
        if (x.status >= 200 && x.status < 300 && data?.sha) return resolve(data);
        const err = new Error(`GitHub ${x.status}: ${data?.message || 'fayl qabul qilinmadi'}`); err.status = x.status; reject(err);
      };
      x.onerror = () => { done(); reject(new Error('Internet ulanishi uzildi')); };
      x.onabort = () => { done(); reject(new Error(stalled ? 'Yuklash to‘xtab qoldi (ulanish javob bermadi)' : 'Bekor qilindi')); };
      x.send(JSON.stringify({ content: base64, encoding: 'base64' }));
    });
  }
  async function ghApi(token, method, path, body) {
    const r = await fetch('https://api.github.com' + path, {
      method, cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!r.ok) {
      let msg = ''; try { msg = (await r.json()).message || ''; } catch (_) { /* bo'sh */ }
      const hint = r.status === 401 ? ' (token noto‘g‘ri yoki muddati tugagan)' : r.status === 403 || r.status === 404 ? ' (tokenga shu repo uchun “Contents: Read and write” ruxsati berilmagan)' : '';
      const err = new Error(`GitHub ${r.status}: ${msg}${hint}`); err.status = r.status; throw err;
    }
    return r.status === 204 ? null : r.json();
  }
  // Hamma fayl bitta commit bo'lib tushadi: boshqa kompyuterlar hech qachon yarim yangilanishni ko'rmaydi.
  async function publishToGithub(pack, token, onProgress = () => {}) {
    const { ok, repo, branch } = repoConfig();
    if (!ok) throw new Error('update-client.js ichida GITHUB_REPO sozlanmagan.');
    const br = encodeURIComponent(branch);
    onProgress('GitHub tekshirilmoqda…');
    const vr = await fetch(`https://api.github.com/repos/${repo}/contents/version.json?ref=${br}`, { cache: 'no-store', headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github.raw+json' } });
    if (vr.ok) {
      const remote = String(JSON.parse(await vr.text()).version || '');
      if (remote && compareVersions(remote, pack.version) >= 0) {
        throw new Error(`GitHub’da allaqachon v${remote} bor (bu paket v${pack.version}). Boshqa kompyuterdan yangiroq o‘zgarish kiritilgan — avval GitHub’dan yangilang, keyin qayta tahrirlang.`);
      }
    }
    const ref = await ghApi(token, 'GET', `/repos/${repo}/git/ref/heads/${br}`);
    const head = await ghApi(token, 'GET', `/repos/${repo}/git/commits/${ref.object.sha}`);
    // GitHub'da allaqachon bor fayllar (yo'l -> git sha). Bir xil fayl qayta yuklanmaydi.
    let remoteFiles = new Map();
    try {
      const t = await ghApi(token, 'GET', `/repos/${repo}/git/trees/${head.tree.sha}?recursive=1`);
      remoteFiles = new Map((t.tree || []).filter(x => x.type === 'blob').map(x => [x.path, x.sha]));
    } catch (_) { /* ro'yxat olinmasa — hammasi yuklanadi */ }
    const tree = [];
    const n = pack.files.length;
    for (let i = 0; i < n; i++) {
      const f = pack.files[i];
      const label = `${i + 1}/${n}: ${f.name}`;
      onProgress(`Tekshirilmoqda ${label}`);
      const sha = await gitBlobSha(f.blob);
      if (remoteFiles.get(f.name) === sha) { onProgress(`✓ ${label} — GitHub’da bor, qayta yuklanmaydi`); continue; }
      if (await blobExists(token, repo, sha)) { tree.push({ path: f.name, mode: '100644', type: 'blob', sha }); continue; }
      const base64 = await blobToBase64(f.blob);
      let uploaded = null, lastErr = null;
      for (let attempt = 1; attempt <= 3 && !uploaded; attempt++) {
        try {
          uploaded = await uploadBlob(token, repo, base64, (sent, total, speed) => {
            const pct = total ? Math.floor(sent / total * 100) : 0;
            onProgress(`Yuklanmoqda ${label} — ${pct}% (${fmtSize(Math.round(sent * 0.75))} / ${fmtSize(f.blob.size)}${speed ? `, ${fmtSize(speed)}/s` : ''})${attempt > 1 ? ` · ${attempt}-urinish` : ''}`);
          });
        } catch (err) {
          lastErr = err;
          if (err.status && err.status < 500) break; // ruxsat/format xatosi — qayta urinish foyda bermaydi
          onProgress(`${label}: ulanish uzildi, ${attempt + 1}-urinish 5 soniyadan keyin…`);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
      if (!uploaded) throw lastErr || new Error('Fayl yuklanmadi: ' + f.name);
      tree.push({ path: f.name, mode: '100644', type: 'blob', sha: uploaded.sha });
    }
    onProgress('Commit yaratilmoqda…');
    const newTree = await ghApi(token, 'POST', `/repos/${repo}/git/trees`, { base_tree: head.tree.sha, tree });
    const commit = await ghApi(token, 'POST', `/repos/${repo}/git/commits`, { message: `Savollar yangilandi: v${pack.version}`, tree: newTree.sha, parents: [ref.object.sha] });
    try {
      await ghApi(token, 'PATCH', `/repos/${repo}/git/refs/heads/${br}`, { sha: commit.sha, force: false });
    } catch (err) {
      if (err.status === 422) throw new Error('Shu payt boshqa kompyuter ham GitHub’ga yozdi. Avval GitHub’dan yangilang, keyin qayta urinib ko‘ring.');
      throw err;
    }
    return { url: `https://github.com/${repo}/commit/${commit.sha}`, sha: commit.sha };
  }

  function openGithubDialog() {
    qs('#devGh')?.remove();
    const { ok, repo } = repoConfig();
    const hasEnc = !!encryptedTokenSource();
    const m = document.createElement('div');
    m.id = 'devGh';
    m.className = 'dev-ui dev-modal';
    m.innerHTML = `
      <form class="dev-dialog dev-dialog-wide" autocomplete="off">
        <div class="dev-dialog-head"><div><div class="dev-kicker">GITHUB ULANISHI</div><h3>Avtomatik joylash</h3></div><button type="button" class="dev-icon-btn" data-a="close">×</button></div>
        <p>Holat: ${ghToken ? `<b class="dev-ok">ulangan ✓</b> — saqlaganingizda savollar <b>${escHtml(repo)}</b> ga o‘zi joylanadi.` : hasEnc ? '<b>token bor, lekin ochilmadi</b> — pastda login va parolni kiriting.' : '<b>ulanmagan</b> — fayllar qo‘lda yuklanadi.'}</p>
        ${ok ? '' : '<p class="dev-warn">update-client.js ichida GITHUB_REPO sozlanmagan.</p>'}
        <details class="dev-details" ${ghToken ? '' : 'open'}><summary>Token qanday olinadi (bir marta)</summary>
          <ol class="dev-steps">
            <li>GitHub’da repo egasining akkauntiga kiring va <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Fine-grained token yaratish ↗</a> sahifasini oching.</li>
            <li><b>Repository access</b> → <b>Only select repositories</b> → faqat <code>${escHtml(repo.split('/')[1] || repo)}</code>.</li>
            <li><b>Permissions → Contents</b> → <b>Read and write</b>. Boshqa ruxsat bermang.</li>
            <li>Muddat (Expiration) tanlang, <b>Generate token</b> ni bosing va tokenni pastga qo‘ying.</li>
          </ol>
        </details>
        <label class="dev-label">GitHub token<input name="token" type="password" placeholder="github_pat_..." spellcheck="false"></label>
        ${devSecret ? '' : `<div class="dev-grid2"><label class="dev-label">Dasturchi logini<input name="u" spellcheck="false"></label><label class="dev-label">Parol<input name="p" type="password"></label></div>`}
        <p class="dev-err" role="alert"></p>
        <div id="devGhOut"></div>
        <div class="dev-actions">
          ${hasEnc ? '<button type="button" class="dev-btn dev-btn-danger" data-a="forget">Shu kompyuterdan o‘chirish</button>' : ''}
          ${!ghToken && hasEnc && !devSecret ? '<button type="button" class="dev-btn" data-a="unlock">Mavjud tokenni ochish</button>' : ''}
          <button type="submit" class="dev-btn primary">Tekshirish va saqlash</button>
        </div>
      </form>`;
    document.body.appendChild(m);
    const form = qs('form', m), err = qs('.dev-err', m);
    form.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') m.remove(); });
    const getSecret = async () => {
      if (devSecret) return devSecret;
      const s = form.u.value.trim() + ':' + form.p.value;
      if (await sha256(s) !== AUTH_HASH) throw new Error('Login yoki parol noto‘g‘ri.');
      devSecret = s;
      return s;
    };
    m.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'close' || e.target === m) m.remove();
      if (a === 'forget') {
        if (!confirm('GitHub token shu kompyuterdan o‘chirilsinmi?\n(Loyiha papkasidagi github-token.js faylida bo‘lsa, uni ham bo‘sh nusxasi bilan almashtiring.)')) return;
        localStorage.removeItem(TOKEN_LS); sessionStorage.removeItem(TOKEN_SS); ghToken = null;
        m.remove(); paintBar(); toast('GitHub ulanishi o‘chirildi.', 'success');
      }
      if (a === 'unlock') {
        try { err.textContent = ''; if (await unlockToken(await getSecret())) { m.remove(); paintBar(); toast('GitHub ulandi.', 'success'); } else err.textContent = 'Token ochilmadi — u boshqa parol bilan shifrlangan.'; }
        catch (ex) { err.textContent = ex.message; }
      }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      err.textContent = '';
      const token = form.token.value.trim();
      if (!token) { err.textContent = 'Tokenni kiriting.'; return; }
      const btn = qs('button[type=submit]', form);
      btn.disabled = true; btn.textContent = 'Tekshirilmoqda…';
      try {
        const secret = await getSecret();
        const info = await ghApi(token, 'GET', `/repos/${repo}`);
        if (info.permissions && info.permissions.push === false) throw new Error('Bu token repo’ga yoza olmaydi. “Contents: Read and write” ruxsatini bering.');
        const enc = await encryptToken(token, secret);
        localStorage.setItem(TOKEN_LS, JSON.stringify(enc));
        ghToken = token; ghTokenBad = false; sessionStorage.setItem(TOKEN_SS, token);
        paintBar();
        const file = new Blob([`/* GitHub'ga avtomatik joylash uchun SHIFRLANGAN token.\n   Dasturchi rejimida yaratilgan. Faqat dasturchi login/paroli bilan ochiladi. */\nwindow.GITHUB_PUBLISH_TOKEN = ${JSON.stringify(enc)};\n`], { type: 'text/javascript' });
        qs('#devGhOut', m).innerHTML = `<p class="dev-ok">✓ Token ishlaydi va shu kompyuterda shifrlangan holda saqlandi.</p>
          <p><b>Qolgan kompyuterlar uchun:</b> quyidagi <code>github-token.js</code> faylini loyiha papkasidagi shu nomli fayl o‘rniga qo‘ying, so‘ng loyihani kompyuterlarga ko‘chiring. Shunda istalgan kompyuterda dasturchi rejimiga kirib saqlasangiz, savollar GitHub’ga o‘zi joylanadi.</p>
          <button type="button" class="dev-btn primary" data-a="dlToken">⬇ github-token.js</button>`;
        qs('[data-a=dlToken]', m).onclick = () => download(file, 'github-token.js');
        form.token.value = '';
      } catch (ex) { err.textContent = ex.message || String(ex); }
      finally { btn.disabled = false; btn.textContent = 'Tekshirish va saqlash'; }
    });
    setTimeout(() => form.token.focus(), 30);
  }
  async function pullGithub() {
    if (dirty && !confirm('Saqlanmagan o‘zgarishlar bor — GitHub’dan yangilansa ular yo‘qoladi. Davom etilsinmi?')) return;
    if (document.body.classList.contains('view-quiz')) showView('home');
    const r = await window.APP_UPDATER?.checkGithub?.();
    toast(r?.message || 'Tekshirildi.', r?.ok ? 'success' : 'error', 6000);
  }
  async function buildGithubPack(payload, mediaItems) {
    const payloadBlob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const assets = [];
    for (const m of mediaItems) assets.push({ path: m.path, sha256: await sha256(m.blob), type: m.type });
    const manifest = {
      version: payload.version,
      generatedAt: payload.generatedAt,
      notes: payload.notes,
      payload: { path: 'content-update.json', sha256: await sha256(payloadBlob) },
      assets
    };
    const files = [
      ...mediaItems.map(m => ({ name: m.path, blob: m.blob, note: 'yangi media fayl' })),
      { name: 'content-update.json', blob: payloadBlob, note: 'barcha savollar, shablonlar va matnlar' },
      { name: 'version.json', blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }), note: 'ENG OXIRIDA yuklang' }
    ];
    const projectFile = {
      name: 'content-update.js',
      blob: new Blob([`/* Dasturchi rejimi eksporti: ${payload.version} */\nwindow.APP_CONTENT_PATCH = ${JSON.stringify(payload)};\n`], { type: 'text/javascript' })
    };
    return { version: payload.version, files, projectFile, changes: [...changeLog.values()] };
  }
  async function saveAll() {
    await ensureData();
    if (!dirty) { toast('Saqlanadigan o‘zgarish yo‘q.', 'info'); return; }
    if (!window.APP_UPDATER?.saveLocal) { toast('update-client.js topilmadi — saqlab bo‘lmaydi.', 'error'); return; }
    closePopup(true);
    applyEditor();
    const btn = qs('#devBar [data-a=save]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saqlanmoqda…'; }
    try {
      const remote = await remoteVersion();
      let version = bumpVersion(localVersion());
      if (remote && compareVersions(remote, localVersion()) > 0) {
        // Boshqa kompyuter yangiroq savollarni joylagan: ustidan yozsak, uning o'zgarishlari yo'qoladi.
        const overwrite = confirm(`GitHub’da yangiroq savollar bor: v${remote} (bu kompyuterda v${localVersion()}).\n\nSaqlasangiz, GitHub’dagi v${remote} bu kompyuterdagi savollar bilan ALMASHTIRILADI — boshqa kompyuterdan kiritilgan o‘zgarishlar yo‘qoladi.\n\nOK — baribir saqlash (masalan, GitHub’dagi versiya buzuq bo‘lsa)\nBekor — to‘xtatish, avval “↻ GitHub’dan yangilash” (tavsiya)`);
        if (!overwrite) {
          toast('Saqlash to‘xtatildi. “↻ GitHub’dan yangilash”ni bosing va tahrirni qayta qiling.', 'warning', 9000);
          return;
        }
        version = bumpVersion(remote);
      }
      const filled = autoFillCyr();
      if (filled.fields || filled.questions) changeLog.set('cy:autofill', `Kirill: ${filled.questions} ta savol va ${filled.fields} ta maydon lotindan avtomatik to‘ldirildi`);
      const notes = 'Dasturchi rejimi: ' + [...changeLog.values()].slice(0, 30).join('; ');
      const payload = buildPayload(version, notes);
      const mediaItems = await collectUpdateMedia(payload);
      payload.media = mediaItems.map(m => ({ path: m.path, type: m.type }));
      savingSelf = true;
      try { await window.APP_UPDATER.saveLocal(payload, mediaItems); }
      finally { savingSelf = false; }
      lastPayload = payload;
      const pack = await buildGithubPack(payload, mediaItems);
      dirty = false;
      changeLog.clear();
      const token = ghToken; // rejim yopilsa ham joylash shu token bilan tugallanadi
      setDevOn(false);
      showFilesModal(pack, true, token);
    } catch (err) {
      toast('Saqlanmadi: ' + (err.message || err), 'error', 8000);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Saqlash'; }
    }
  }
  async function openFilesFromCurrent() {
    await ensureData();
    if (dirty) {
      if (confirm('Saqlanmagan o‘zgarishlar bor. GitHub fayllari saqlangan holatdan tayyorlanadi.\n\nHozir saqlaymizmi? (versiya oshadi va dasturchi rejimi yopiladi)')) return saveAll();
      return;
    }
    try {
      const payload = buildPayload(localVersion(), 'Joriy saqlangan holat');
      const mediaItems = await collectUpdateMedia(payload);
      payload.media = mediaItems.map(m => ({ path: m.path, type: m.type }));
      showFilesModal(await buildGithubPack(payload, mediaItems), false, ghToken);
    } catch (err) { toast(err.message || String(err), 'error', 7000); }
  }
  function showFilesModal(pack, justSaved, token) {
    qs('#devFiles')?.remove();
    const cfg = window.APP_UPDATER?.getConfig?.() || {};
    const repo = cfg.repo || '—', branch = cfg.branch || 'main';
    const m = document.createElement('div');
    m.id = 'devFiles';
    m.className = 'dev-ui dev-modal';
    const rows = pack.files.map((f, i) => `
      <li class="${f.name === 'version.json' ? 'dev-last' : ''}">
        <span class="dev-step">${i + 1}</span>
        <div><code>${escHtml(f.name)}</code><small>${fmtSize(f.blob.size)} · ${escHtml(f.note)}</small></div>
        <button type="button" class="dev-btn" data-dl="${i}">⬇ Yuklab olish</button>
      </li>`).join('');
    const changes = pack.changes.length
      ? `<details class="dev-details"><summary>Bu saqlashda nimalar o‘zgardi (${pack.changes.length})</summary><ul>${pack.changes.map(c => `<li>${escHtml(c)}</li>`).join('')}</ul></details>` : '';
    m.innerHTML = `
      <div class="dev-dialog dev-dialog-wide" role="dialog" aria-modal="true">
        <div class="dev-dialog-head">
          <div><div class="dev-kicker">${justSaved ? 'SAQLANDI ✓' : 'JORIY HOLAT'}</div><h3>GitHub uchun fayllar — v${escHtml(pack.version)}</h3></div>
          <button type="button" class="dev-icon-btn" data-a="close">×</button>
        </div>
        ${justSaved ? '<p class="dev-ok">O‘zgarishlar shu kompyuterda saqlandi va dasturda qo‘llandi. Dasturchi rejimi yopildi.</p>' : ''}
        <div id="devPublish" class="dev-publish"></div>
        <details class="dev-details dev-manual" ${token ? '' : 'open'}><summary>Qo‘lda yuklash${token ? ' (zaxira usul)' : ''}</summary>
        <p>Repo: <b>${escHtml(repo)}</b> · branch <b>${escHtml(branch)}</b>. Fayllarni shu tartibda yuklang — <b>version.json eng oxirida</b>. Shundan keyin boshqa kompyuterlarda <b>Sozlamalar → GitHub’dan yangilash</b> bosiladi.</p>
        <ol class="dev-file-list">${rows}</ol>
        <div class="dev-actions dev-actions-left">
          <button type="button" class="dev-btn primary" data-a="zip">⬇ Hammasini ZIP qilib olish</button>
          ${window.showDirectoryPicker ? '<button type="button" class="dev-btn" data-a="folder">📁 Papkaga saqlash (GitHub repo papkasi)</button>' : ''}
          ${repo !== '—' ? `<a class="dev-btn" href="https://github.com/${escHtml(repo)}/upload/${escHtml(branch)}" target="_blank" rel="noopener">GitHub’da yuklash sahifasi ↗</a>` : ''}
        </div>
        <p class="dev-note">${pack.files.length > 2 ? '<b>updates</b> papkasini GitHub sahifasiga papka holida sudrab tashlang — ichidagi <code>updates/media/</code> yo‘li saqlanishi kerak. ' : 'Yangi media fayl yo‘q — faqat 2 ta fayl yuklanadi. '}Loyihadagi mavjud rasm/videolar qayta yuklanmaydi.</p>
        </details>
        ${changes}
        <details class="dev-details"><summary>Ixtiyoriy: loyiha papkasining o‘zi uchun</summary>
          <p>Bu <code>content-update.js</code> faylini loyiha papkasidagi shu nomli fayl o‘rniga qo‘ysangiz, o‘zgarishlar dasturning asosiy nusxasiga kiradi (yangi media bo‘lsa, <code>updates/media/</code> papkasini ham loyiha ichiga qo‘ying).</p>
          <button type="button" class="dev-btn" data-a="projectFile">⬇ content-update.js (${fmtSize(pack.projectFile.blob.size)})</button>
        </details>
        <div class="dev-actions"><button type="button" class="dev-btn" data-a="close">Yopish</button></div>
      </div>`;
    document.body.appendChild(m);
    const pub = qs('#devPublish', m);
    let publishing = false;
    const paintPublish = (state, text = '', url = '') => {
      if (state === 'none') {
        pub.innerHTML = `<p class="dev-pub-line"><b>GitHub ulanmagan.</b> Fayllarni pastdan qo‘lda yuklang. Avtomatik joylash uchun dasturchi rejimidagi <b>🔑 GitHub</b> tugmasi orqali bir marta ulang.</p>`;
      } else if (state === 'ready') {
        pub.innerHTML = `<p class="dev-pub-line">GitHub ulangan. <button type="button" class="dev-btn primary" data-a="publish">🚀 GitHub’ga joylash</button></p>`;
      } else if (state === 'busy') {
        pub.innerHTML = `<p class="dev-pub-line dev-pub-busy"><span class="dev-spin"></span> ${escHtml(text)}</p>`;
      } else if (state === 'done') {
        pub.innerHTML = `<p class="dev-pub-line dev-ok">✓ GitHub’ga joylandi (v${escHtml(pack.version)}). Avto-yangilash yoqilgan kompyuterlar savollarni o‘zi yuklab oladi; qolganlarida <b>Sozlamalar → GitHub’dan yangilash</b>. <a href="${escHtml(url)}" target="_blank" rel="noopener">Commit ↗</a></p>`;
      } else if (state === 'error') {
        const badToken = /GitHub 401|Bad credentials/i.test(text);
        pub.innerHTML = `<p class="dev-pub-line dev-warn">GitHub’ga joylanmadi: ${escHtml(text)}</p>` + (badToken
          ? `<p class="dev-note"><b>Token ishlamayapti</b> — GitHub’da o‘chirilgan yoki muddati tugagan. Yangi token yarating, so‘ng dasturchi rejimida <b>🔑 GitHub</b> → yangi tokenni qo‘ying → <b>Tekshirish va saqlash</b>. Keyin <b>⇪ GitHub fayllari</b> → <b>🚀 GitHub’ga joylash</b>. Saqlangan savollar yo‘qolmaydi.</p>`
          : `<p><button type="button" class="dev-btn" data-a="publish">↻ Qayta urinish</button> <span class="dev-muted">yoki pastdagi fayllarni qo‘lda yuklang.</span></p>`);
        qs('.dev-manual', m).open = true;
      }
    };
    const doPublish = async () => {
      if (publishing || !token) return;
      publishing = true;
      try {
        const r = await publishToGithub(pack, token, t => paintPublish('busy', t));
        paintPublish('done', '', r.url);
      } catch (err) { paintPublish('error', err.message || String(err)); }
      finally { publishing = false; }
    };
    if (!token) paintPublish('none');
    else if (justSaved) doPublish();
    else paintPublish('ready');
    m.addEventListener('click', async e => {
      if (e.target === m) { if (!publishing) m.remove(); return; }
      if (e.target.closest('[data-a=publish]')) return doPublish();
      if (publishing && e.target.closest('[data-a=close]')) return toast('GitHub’ga joylash tugashini kuting.', 'warning');
      const dl = e.target.closest('[data-dl]');
      if (dl) { const f = pack.files[Number(dl.dataset.dl)]; download(f.blob, f.name); return; }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'close') m.remove();
      if (a === 'projectFile') download(pack.projectFile.blob, pack.projectFile.name);
      if (a === 'zip') {
        const zip = await makeZip(pack.files.map(f => ({ name: f.name, blob: f.blob })));
        download(zip, `YANGIYER_AVTO_TEST_UPDATE_${pack.version.replaceAll('.', '_')}.zip`);
      }
      if (a === 'folder') {
        try {
          const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
          for (const f of pack.files) {
            const parts = f.name.split('/');
            let d = dir;
            for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
            const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
            const w = await fh.createWritable(); await w.write(f.blob); await w.close();
          }
          toast(`${pack.files.length} ta fayl papkaga yozildi (version.json oxirida).`, 'success', 5000);
        } catch (err) {
          if (err?.name !== 'AbortError') toast('Papkaga yozib bo‘lmadi: ' + (err.message || err), 'error', 6000);
        }
      }
    });
  }

  /* ============================================================
     KIRISH (login/parol) VA REJIMNI YOQISH/O'CHIRISH
     ============================================================ */
  function openLogin() {
    qs('#devLogin')?.remove();
    const m = document.createElement('div');
    m.id = 'devLogin';
    m.className = 'dev-ui dev-modal';
    m.innerHTML = `
      <form class="dev-dialog" autocomplete="off">
        <div class="dev-kicker">&lt;/&gt; DASTURCHI REJIMI</div>
        <h3>Kirish</h3>
        <p class="dev-muted">Rejim faqat dasturchi login va paroli bilan yoqiladi.</p>
        <label class="dev-label">Login<input name="u" autocomplete="username" spellcheck="false" required></label>
        <label class="dev-label">Parol<input name="p" type="password" autocomplete="current-password" required></label>
        <p class="dev-err" role="alert"></p>
        <div class="dev-actions"><button type="button" class="dev-btn" data-a="cancel">Bekor qilish</button><button type="submit" class="dev-btn primary">Kirish</button></div>
      </form>`;
    document.body.appendChild(m);
    const form = qs('form', m);
    const cancel = () => { m.remove(); syncSwitch(); };
    qs('[data-a=cancel]', m).onclick = cancel;
    m.addEventListener('mousedown', e => { if (e.target === m) cancel(); });
    form.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') cancel(); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const err = qs('.dev-err', m);
      try {
        const hash = await sha256(form.u.value.trim() + ':' + form.p.value);
        if (hash !== AUTH_HASH) { err.textContent = 'Login yoki parol noto‘g‘ri.'; form.p.value = ''; form.p.focus(); return; }
        devSecret = form.u.value.trim() + ':' + form.p.value;
        await unlockToken(devSecret);
        m.remove();
        setDevOn(true);
        toast('Dasturchi rejimi yoqildi. Shift + bosish — matnni tahrirlash.', 'success', 4500);
      } catch (ex) { err.textContent = ex.message || String(ex); }
    });
    setTimeout(() => form.u.focus(), 30);
  }
  function exitDev() {
    if (dirty && !confirm('Saqlanmagan o‘zgarishlar bor.\n\nSaqlamasdan chiqilsinmi? (o‘zgarishlar bekor qilinadi)')) { syncSwitch(); return; }
    const hadChanges = dirty;
    dirty = false;
    setDevOn(false);
    if (hadChanges) location.reload();
  }
  function syncSwitch() {
    const sw = qs('#devModeSwitch');
    if (sw) sw.checked = devOn;
    const tb = qs('#devTopBtn');
    if (tb) { tb.classList.toggle('active', devOn); tb.title = devOn ? 'Dasturchi rejimini o‘chirish' : 'Dasturchi rejimi'; }
  }
  function setDevOn(on) {
    devOn = !!on;
    if (devOn) sessionStorage.setItem(SESSION_KEY, '1'); else sessionStorage.removeItem(SESSION_KEY);
    document.body.classList.toggle('dev-on', devOn);
    buildBar();
    qs('#devBar').hidden = !devOn;
    if (!devOn) {
      closeDrawer(false); closePopup(false); setHover(null);
      ghToken = null; devSecret = null; sessionStorage.removeItem(TOKEN_SS);
    }
    syncSwitch();
    paintBar();
    decorateTemplates();
    if (devOn) {
      ensureData().then(async () => {
        paintBar();
        if (sessionStorage.getItem(DRAWER_KEY) && document.body.classList.contains('view-quiz')) openDrawer();
        // Token hali ishlayaptimi? (GitHub'da o'chirilgan yoki muddati tugagan bo'lishi mumkin)
        if (ghToken) {
          try { await ghApi(ghToken, 'GET', `/repos/${repoConfig().repo}`); ghTokenBad = false; }
          catch (err) {
            if (err.status === 401 || err.status === 403 || err.status === 404) {
              ghTokenBad = true;
              toast('GitHub token ishlamayapti (o‘chirilgan yoki muddati tugagan). “🔑 GitHub” tugmasi orqali yangi token kiriting.', 'error', 12000);
            }
          }
          paintBar();
        }
        // Boshqa kompyuter yangiroq savollarni joylagan bo'lsa, eski nusxani tahrirlamaslik uchun ogohlantiramiz.
        const rv = await remoteVersion();
        if (devOn && !dirty && rv && compareVersions(rv, localVersion()) > 0 &&
            confirm(`GitHub’da yangiroq savollar bor: v${rv} (bu kompyuterda v${localVersion()}).\n\nBoshqa kompyuterdagi o‘zgarishlarni o‘chirib yubormaslik uchun avval yangilab olish kerak. Hozir yangilaymizmi?`)) {
          pullGithub();
        }
      }).catch(err => toast('Ma’lumotlar yuklanmadi: ' + (err.message || err), 'error', 8000));
    }
  }

  /* ============================================================
     PASTKI PANEL
     ============================================================ */
  function buildBar() {
    if (qs('#devBar')) return;
    const bar = document.createElement('div');
    bar.id = 'devBar';
    bar.className = 'dev-ui dev-bar';
    bar.hidden = true;
    bar.innerHTML = `
      <span class="dev-badge">&lt;/&gt; DEV</span>
      <span id="devState" class="dev-state">Yuklanmoqda…</span>
      <span class="dev-hint"><kbd>Shift</kbd> + bosish — tahrirlash</span>
      <span class="dev-sep"></span>
      <button type="button" class="dev-btn" data-a="editor">✎ Savol muharriri</button>
      <button type="button" class="dev-btn" data-a="addTpl">＋ Shablon</button>
      <button type="button" class="dev-btn" data-a="cyrCheck" title="Kirill nusxadagi bo‘sh va farq qiladigan matnlar">🔤 Kirill tekshiruvi</button>
      <button type="button" class="dev-btn" data-a="files">⇪ GitHub fayllari</button>
      <button type="button" class="dev-btn" data-a="gh">🔑 GitHub</button>
      <button type="button" class="dev-btn" data-a="pull">↻ GitHub’dan yangilash</button>
      <button type="button" class="dev-btn primary" data-a="save">💾 Saqlash</button>
      <button type="button" class="dev-btn dev-btn-ghost" data-a="exit" title="Dasturchi rejimidan chiqish">Chiqish</button>`;
    document.body.appendChild(bar);
    bar.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'editor') { if (drawer && !drawer.hidden) closeDrawer(); else openDrawer(); }
      if (a === 'addTpl') addTemplate().catch(err => toast(err.message || String(err), 'error'));
      if (a === 'cyrCheck') openCyrCheck().catch(err => toast(err.message || String(err), 'error'));
      if (a === 'files') openFilesFromCurrent();
      if (a === 'save') saveAll();
      if (a === 'exit') exitDev();
      if (a === 'gh') openGithubDialog();
      if (a === 'pull') pullGithub();
    });
  }
  function paintBar() {
    const s = qs('#devState');
    if (!s) return;
    s.textContent = !DS ? 'Ma’lumotlar yuklanmoqda…'
      : dirty ? `${changeLog.size} ta o‘zgarish · saqlanmagan`
      : `v${localVersion()} · o‘zgarish yo‘q`;
    s.classList.toggle('dirty', dirty);
    const ed = qs('#devBar [data-a=editor]');
    if (ed) ed.hidden = !document.body.classList.contains('view-quiz');
    const gh = qs('#devBar [data-a=gh]');
    if (gh) {
      gh.textContent = !ghToken ? '🔑 GitHub ulash' : ghTokenBad ? '🔑 GitHub ⚠ token eskirgan' : '🔑 GitHub ✓';
      gh.classList.toggle('dev-btn-ok', !!ghToken && !ghTokenBad);
      gh.classList.toggle('dev-btn-danger', !!ghToken && ghTokenBad);
    }
  }

  /* ============================================================
     DASTUR FUNKSIYALARIGA ULANISH
     ============================================================ */
  if (typeof showQuestion === 'function') {
    const prevShowQuestion = showQuestion;
    showQuestion = function (n) {
      prevShowQuestion(n);
      applyQuizLabel();
      if (devOn && !suppressEditorReload && drawer && !drawer.hidden && (editorCur !== current || editorIdx !== qIndex)) reloadEditor();
    };
  }
  if (typeof showView === 'function') {
    const prevShowView = showView;
    showView = function (name) {
      prevShowView(name);
      if (name !== 'quiz') closeDrawer(false);
      else if (devOn && sessionStorage.getItem(DRAWER_KEY)) setTimeout(openDrawer, 0);
      paintBar();
      scheduleOverrides();
    };
  }
  if (typeof window.applyAppContentUpdate === 'function') {
    const prevApply = window.applyAppContentUpdate;
    window.applyAppContentUpdate = function (payload) {
      lastPayload = payload || lastPayload;
      if (!savingSelf) {
        if (devOn && dirty) toast('GitHub yangilanishi o‘rnatildi — saqlanmagan o‘zgarishlar bekor qilindi.', 'warning', 7000);
        DS = null; dirty = false; changeLog.clear();
        loadUiText(payload);
        if (devOn) setTimeout(() => ensureData().then(paintBar), 0);
      }
      const r = prevApply.apply(this, arguments);
      loadLocalDict();   // shu kompyuterda o'rgatilgan (hali joylanmagan) so'zlar ustun turadi
      scheduleOverrides();
      paintBar();
      return r;
    };
  }

  window.addEventListener('beforeunload', e => {
    if (devOn && dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // Sozlamalardagi switch va yuqori paneldagi tugma.
  function initControls() {
    const sw = qs('#devModeSwitch');
    if (sw) sw.addEventListener('change', () => { if (sw.checked && !devOn) openLogin(); else if (!sw.checked && devOn) exitDev(); });
    // Bosh sahifada .top-right yashiriladi, shuning uchun tugma topbar'ning o'ziga qo'yiladi.
    const topbar = qs('.topbar');
    if (topbar && !qs('#devTopBtn')) {
      const b = document.createElement('button');
      b.id = 'devTopBtn'; b.type = 'button'; b.className = 'dev-ui dev-top-btn';
      b.innerHTML = '&lt;/&gt; Dev';
      b.onclick = () => (devOn ? exitDev() : openLogin());
      topbar.appendChild(b);
    }
  }
  initControls();
  startupPayload.then(p => loadUiText(p || window.APP_CONTENT_PATCH));
  if (sessionStorage.getItem(SESSION_KEY) === '1') setDevOn(true); else syncSwitch();

  window.DEV_MODE = { open: openLogin, exit: exitDev, save: saveAll, isOn: () => devOn };
})();
