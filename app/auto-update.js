/* Avtomatik yangilash.
   Sozlamalardagi switch yoqilgan bo'lsa: dastur ochilganda va ochiq turgan paytda har
   AUTO_UPDATE_MINUTES daqiqada GitHub'dagi version.json tekshiriladi; yangi versiya bo'lsa,
   savollar o'zi yuklab olinadi. Switch o'chiq bo'lsa — faqat qo'lda yangilanadi.
   Test ishlanayotgan paytda kelgan yangilanish test tugagach qo'llanadi (testni buzmaydi). */
(function () {
  'use strict';
  // Yangi kompyuterda switch boshlang'ich holati. Yangilash sozlamalari faqat dasturchi
  // rejimida ko'rinadi, shuning uchun kompyuterlar standart holatda o'zi yangilanadi.
  const AUTO_UPDATE_DEFAULT = true;
  const AUTO_UPDATE_MINUTES = 10;    // ochiq turganda tekshirish oralig'i
  const KEY = 'yangiyer_auto_update_v1';
  const IS_CYRL = document.documentElement.dataset.script === 'cyrl';
  const T = IS_CYRL ? {
    updated: v => `Саволлар янгиланди: v${v}`,
    pending: v => `Янги саволлар юкланди (v${v}). Тест тугагач қўлланади.`
  } : {
    updated: v => `Savollar yangilandi: v${v}`,
    pending: v => `Yangi savollar yuklandi (v${v}). Test tugagach qo‘llanadi.`
  };
  let timer = null, running = false;

  const enabled = () => {
    const v = localStorage.getItem(KEY);
    return v === null ? AUTO_UPDATE_DEFAULT : v === 'true';
  };

  function notify(text) {
    let box = document.getElementById('autoUpdateNotice');
    if (!box) {
      box = document.createElement('div');
      box.id = 'autoUpdateNotice';
      box.className = 'auto-update-notice';
      box.setAttribute('role', 'status');
      document.body.appendChild(box);
    }
    box.textContent = '✓ ' + text;
    box.classList.add('show');
    clearTimeout(box._t);
    box._t = setTimeout(() => box.classList.remove('show'), 9000);
  }

  // 30 ta kompyuter bir vaqtda yoqilsa, hammasi bir soniyada GitHub'ga yopishmasin — har biri biroz farqli vaqtda.
  const jitter = maxMs => Math.floor(Math.random() * maxMs);
  let lastCheck = 0, retryTimer = null;
  async function check(force = false) {
    if (running || !enabled() || !window.APP_UPDATER?.checkGithub) return;
    if (force !== true && Date.now() - lastCheck < 60 * 1000) return; // oyna almashganda ortiqcha so'rov yubormaslik
    lastCheck = Date.now();
    if (window.DEV_MODE?.isOn?.()) return;      // dasturchi tahrir qilayotganda ishini o'chirib yubormaymiz
    if (navigator.onLine === false) return;     // internet yo'q — 'online' hodisasida qayta tekshiriladi
    running = true;
    clearTimeout(retryTimer);
    let failed = false;
    try {
      await window.APP_UPDATE_READY;
      const r = await window.APP_UPDATER.checkGithub();
      failed = !r?.ok;
      if (r?.updated) {
        const v = window.APP_UPDATER.getVersion();
        notify(r.applied ? T.updated(v) : T.pending(v));
      }
    } catch (_) { failed = true; }
    finally { running = false; }
    // Xato bo'lsa 10 daqiqa kutmaymiz: 2–4 daqiqadan keyin qayta urinadi (yuklangan media saqlangan, davom etadi).
    if (failed && enabled()) retryTimer = setTimeout(() => check(true), 2 * 60 * 1000 + jitter(2 * 60 * 1000));
  }

  function schedule() {
    clearInterval(timer);
    timer = null;
    if (enabled()) timer = setInterval(() => check(true), AUTO_UPDATE_MINUTES * 60 * 1000 + jitter(2 * 60 * 1000));
  }

  const sw = document.getElementById('autoUpdateSwitch');
  if (sw) {
    sw.checked = enabled();
    sw.addEventListener('change', () => {
      localStorage.setItem(KEY, sw.checked ? 'true' : 'false');
      schedule();
      if (sw.checked) check(true);
    });
  }
  window.addEventListener('online', () => check());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  schedule();
  setTimeout(() => check(true), 3000 + jitter(45 * 1000));

  /* Hamma uchun oddiy "Savollarni yangilash" tugmasi (Sozlamalarda).
     GitHub/Drive tafsilotlari ko'rsatilmaydi — to'liq bo'lim faqat dasturchi rejimida. */
  (function publicUpdateCard() {
    const anchor = document.querySelector('#settingsView .update-settings-card');
    if (!anchor || document.getElementById('publicUpdateCard')) return;
    const L = IS_CYRL ? {
      title: 'Саволларни янгилаш', btn: '↻ Янгилаш', busy: 'Текширилмоқда…', ver: 'Версия',
      done: v => `Янгиланди: v${v}`, latest: v => `Энг сўнгги версия ўрнатилган: v${v}`,
      later: v => `Юкланди (v${v}). Тест тугагач қўлланади.`, fail: 'Янгилаб бўлмади. Интернетни текширинг.',
      auto: 'Автоматик янгилаш ёқиқ.', manual: 'Автоматик янгилаш ўчиқ.'
    } : {
      title: 'Savollarni yangilash', btn: '↻ Yangilash', busy: 'Tekshirilmoqda…', ver: 'Versiya',
      done: v => `Yangilandi: v${v}`, latest: v => `Eng so‘nggi versiya o‘rnatilgan: v${v}`,
      later: v => `Yuklandi (v${v}). Test tugagach qo‘llanadi.`, fail: 'Yangilab bo‘lmadi. Internetni tekshiring.',
      auto: 'Avtomatik yangilash yoqiq.', manual: 'Avtomatik yangilash o‘chiq.'
    };
    const card = document.createElement('div');
    card.id = 'publicUpdateCard';
    card.className = 'settings-admin-card public-update-card';
    card.innerHTML = `<div><b>${L.title}</b><p>${L.ver}: <b class="pub-ver"></b> · <span class="pub-status" role="status"></span></p></div>
      <button type="button" class="next-btn pub-btn">${L.btn}</button>`;
    anchor.parentNode.insertBefore(card, anchor);
    const ver = card.querySelector('.pub-ver'), st = card.querySelector('.pub-status'), btn = card.querySelector('.pub-btn');
    const paint = () => { ver.textContent = window.APP_UPDATER?.getVersion?.() || '1.0.0'; };
    const busyNow = () => !!window.APP_UPDATER?.isBusy?.();
    const idle = () => { if (!busyNow()) st.textContent = enabled() ? L.auto : L.manual; };
    const show = (text, type) => { st.textContent = text; st.style.color = type === 'error' ? '#e5484d' : type === 'warning' ? '#d9a400' : ''; };
    paint(); idle();
    window.APP_UPDATE_READY?.then(paint);
    // Orqada ketayotgan (avto) yangilash jarayoni ham shu yerda ko'rinadi: qaysi fayl, necha MB.
    window.addEventListener('app-update-status', e => {
      paint();
      if (busyNow()) { show(e.detail?.message || L.busy, e.detail?.type); btn.disabled = true; }
      // oxirgi xabar jarayon tugashidan sal oldin keladi — tugma jarayon yopilgach qayta yoqiladi
      setTimeout(() => { if (!busyNow()) btn.disabled = false; }, 50);
    });
    btn.addEventListener('click', async () => {
      btn.disabled = true; show(window.APP_UPDATER?.getLastStatus?.()?.message && busyNow() ? window.APP_UPDATER.getLastStatus().message : L.busy);
      try {
        await window.APP_UPDATE_READY;
        const r = await window.APP_UPDATER.checkGithub(); // ketayotgan bo'lsa — o'shanga qo'shiladi
        const v = window.APP_UPDATER.getVersion();
        if (!r?.ok) show(r?.message || L.fail, 'error');
        else show(r.updated ? (r.applied ? L.done(v) : L.later(v)) : L.latest(v));
      } catch (error) { show(error?.message || L.fail, 'error'); }
      finally { btn.disabled = false; paint(); }
    });
    sw?.addEventListener('change', idle);
  })();

  /* "Dasturni yangilash" — faqat EXE (Secure Media Vault) ichida. GitHub'dagi app/ paketi (imzolangan
     index.html, *.js, *.css) vault ichiga yoziladi; EXE uni o'zi ham har 30 daqiqada tekshiradi. */
  (function publicAppCard() {
    const questions = document.getElementById('publicUpdateCard');
    if (!questions || !window.APP_UPDATER?.isHost?.() || document.getElementById('publicAppCard')) return;
    const L = IS_CYRL ? {
      title: 'Дастурни янгилаш', btn: '↻ Дастурни янгилаш', busy: 'Текширилмоқда…', ver: 'Дастур',
      none: 'ҳали GitHub’дан ўрнатилмаган', done: v => `Янгиланди: v${v}. Саҳифа қайта юкланади…`, latest: 'Энг сўнгги версия ўрнатилган.'
    } : {
      title: 'Dasturni yangilash', btn: '↻ Dasturni yangilash', busy: 'Tekshirilmoqda…', ver: 'Dastur',
      none: 'hali GitHub’dan o‘rnatilmagan', done: v => `Yangilandi: v${v}. Sahifa qayta yuklanadi…`, latest: 'Eng so‘nggi versiya o‘rnatilgan.'
    };
    const card = document.createElement('div');
    card.id = 'publicAppCard';
    card.className = 'settings-admin-card public-update-card';
    card.innerHTML = `<div><b>${L.title}</b><p>${L.ver}: <b class="app-ver"></b> · <span class="app-status" role="status"></span></p></div>
      <button type="button" class="next-btn app-btn">${L.btn}</button>`;
    questions.parentNode.insertBefore(card, questions.nextSibling);
    const ver = card.querySelector('.app-ver'), st = card.querySelector('.app-status'), btn = card.querySelector('.app-btn');
    const show = (text, type) => { st.textContent = text; st.style.color = type === 'error' ? '#e5484d' : type === 'warning' ? '#d9a400' : ''; };
    const paint = async () => {
      const info = await window.APP_UPDATER.hostInfo();
      ver.textContent = info?.appVersion ? 'v' + info.appVersion : L.none;
    };
    paint();
    window.addEventListener('app-host-status', e => show(e.detail?.message || '', e.detail?.level));
    btn.addEventListener('click', async () => {
      btn.disabled = true; show(L.busy);
      try {
        const r = await window.APP_UPDATER.checkApp();
        if (!r?.ok) show(r?.message || 'Xato', 'error');
        else show(r.updated ? L.done(r.version) : (r.message || L.latest));
      } catch (error) { show(error?.message || 'Xato', 'error'); }
      finally { btn.disabled = false; paint(); }
    });
  })();

  window.AUTO_UPDATE = { check, isEnabled: enabled };
})();
