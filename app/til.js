/* YANGIYER AVTO TEST — yozuv tanlash: lotin / kirill.
   Bitta index.html ikkala yozuvda ishlaydi (index-kiril.html endi kerak emas).
   1) <head> da ulanadi: tanlangan yozuvni aniqlaydi (<html data-script="latn|cyrl">).
   2) <body> oxirida YOZUV.boot() chaqiriladi: sahifa matnlarini o'giradi, faqat kerakli
      yozuvning savollar faylini yuklaydi va Lotin | Кирилл tugmasini qo'shadi.
   Tanlov shu kompyuterda eslab qolinadi. Havola orqali ham: index.html?yozuv=kiril */
(function () {
  'use strict';
  const KEY = 'yangiyer_yozuv_v1';
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (_) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (_) {} }
  };

  // ?yozuv=kiril / ?yozuv=lotin — tanlovni saqlaydi va manzilni tozalaydi
  const params = new URLSearchParams(location.search);
  const asked = (params.get('yozuv') || '').toLowerCase();
  if (/^(kiril|kirill|cyrl|cy)$/.test(asked)) store.set('cyrl');
  else if (/^(lotin|latn|uz)$/.test(asked)) store.set('latn');
  if (asked) {
    params.delete('yozuv');
    const q = params.toString();
    try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch (_) {}
  }

  const script = store.get() === 'cyrl' ? 'cyrl' : 'latn';
  const IS_CYRL = script === 'cyrl';
  document.documentElement.dataset.script = script;

  // Sahifadagi matnlar: lotin -> kirill (eski index-kiril.html dan olingan)
  const UI_KIRIL = {
    "YANGIYER AVTO TEST": "ЯНГИЙЕР АВТО ТЕСТ",
    "YANGIYER": "ЯНГИЙЕР",
    "AVTO TEST": "АВТО ТЕСТ",
    "HAYDOVCHILIK IMTIHONIGA TAYYORMISIZ?": "ҲАЙДОВЧИЛИК ИМТИҲОНИГА ТАЙЁРМИСИЗ?",
    "Assalomu alaykum!": "Ассалому алайкум!",
    "Xush kelibsiz": "Хуш келибсиз",
    "ga": "га",
    "Bilimingizni sinang. Imtihonga ishonch bilan kiring.": "Билимингизни синанг. Имтиҳонга ишонч билан киринг.",
    "Boshlash": "Бошлаш",
    "YA": "Я",
    "⌂ Bosh sahifa": "⌂ Бош саҳифа",
    "⛶ To‘liq ekran": "⛶ Тўлиқ экран",
    "YANGIYER AVTO TEST · OFFLINE": "ЯНГИЙЕР АВТО ТЕСТ · OFFLINE",
    "Yo‘l qoidalarini o‘rganish va imtihonga tayyorlanish": "Йўл қоидаларини ўрганиш ва имтиҳонга тайёрланиш",
    "Kerakli bo‘limni tanlang, savollarni ishlang va bilimingizni mustahkamlang.": "Керакли бўлимни танланг, саволларни ишланг ва билимингизни мустаҳкамланг.",
    "Imtihonni boshlash": "Имтиҳонни бошлаш",
    "Dastur tarkibi": "Дастур таркиби",
    "Savol": "Савол",
    "Shablon": "Шаблон",
    "O‘quv bo‘limlari": "Ўқув бўлимлари",
    "Kerakli bo‘limni tanlang va boshlang.": "Керакли бўлимни танланг ва бошланг.",
    "Shablonlar": "Шаблонлар",
    "Imtihon savollari jamlanmasi": "Имтиҳон саволлари жамланмаси",
    "Umumiy testlar": "Умумий тестлар",
    "20, 50 yoki 100 ta savol": "20, 50 ёки 100 та савол",
    "Barcha savollar": "Барча саволлар",
    "1 310 ta savol — tartib bo‘yicha": "1 310 та савол — тартиб бўйича",
    "Mavzular bo‘yicha": "Мавзулар бўйича",
    "Yo‘l harakati qoidalari mavzulari": "Йўл ҳаракати қоидалари мавзулари",
    "Natijalar": "Натижалар",
    "Oxirgi test natijangiz": "Охирги тест натижангиз",
    "Sozlamalar": "Созламалар",
    "Test ko‘rinishini sozlash": "Тест кўринишини созлаш",
    "Dastur internet talab qilmaydi. Savollar, rasmlar va videolar kompyuterning o‘zidan ochiladi.": "Дастур интернет талаб қилмайди. Саволлар, расмлар ва видеолар компьютернинг ўзидан очилади.",
    "2-QADAM": "2-ҚАДАМ",
    "⌕  Shablon qidirish...": "⌕  Шаблон қидириш...",
    "MAVZUNI TANLANG": "МАВЗУНИ ТАНЛАНГ",
    "Mavzular bo‘yicha test": "Мавзулар бўйича тест",
    "Kerakli mavzuni tanlang. Shu mavzuga tegishli savollar alohida test bo‘lib ochiladi.": "Керакли мавзуни танланг. Шу мавзуга тегишли саволлар алоҳида тест бўлиб очилади.",
    "← Bosh sahifa": "← Бош саҳифа",
    "Mavzu qidirish...": "Мавзу қидириш...",
    "Mavzular": "Мавзулар",
    "Mavzu guruhlari": "Мавзу гуруҳлари",
    "faylida boshqariladi. Bir savol bir nechta mavzuga tegishli bo‘lishi mumkin.": "файлида бошқарилади. Бир савол бир нечта мавзуга тегишли бўлиши мумкин.",
    "Test uchun savollar sonini tanlang. Savollar va javob variantlari har safar aralashtiriladi.": "Тест учун саволлар сонини танланг. Саволлар ва жавоб вариантлари ҳар сафар аралаштирилади.",
    "ta savol": "та савол",
    "Qisqa test": "Қисқа тест",
    "O‘rta test": "Ўрта тест",
    "To‘liq test": "Тўлиқ тест",
    "Shablonlarda javob variantlarini aralashtirish": "Шаблонларда жавоб вариантларини аралаштириш",
    "Faqat “Shablonlar” bo‘limiga ta’sir qiladi. O‘chirib qo‘yilsa, javoblar asl tartibida ko‘rsatiladi.": "Фақат “Шаблонлар” бўлимига таъсир қилади. Ўчириб қўйилса, жавоблар асл тартибида кўрсатилади.",
    "“Umumiy testlar” va “Barcha savollar” bo‘limlarida javob variantlari doimo aralashtiriladi. Bu sozlama ularga ta’sir qilmaydi.": "“Умумий тестлар” ва “Барча саволлар” бўлимларида жавоб вариантлари доимо аралаштирилади. Бу созлама уларга таъсир қилмайди.",
    "Dasturchi rejimi": "Дастурчи режими",
    "Saytdagi matn, savol, javob, shablon, rasm va videolarni shu yerning o‘zida tahrirlash. Faqat dasturchi login/paroli bilan yoqiladi.": "Сайтдаги матн, савол, жавоб, шаблон, расм ва видеоларни шу ернинг ўзида таҳрирлаш. Фақат дастурчи логин/пароли билан ёқилади.",
    "Dastur versiyasi va yangilanish": "Дастур версияси ва янгиланиш",
    "Manbani o‘zingiz tanlang. GitHub va Google Drive bir-biridan mustaqil tekshiriladi.": "Манбани танланг. GitHub ва Google Drive мустақил текширилади.",
    "Avtomatik yangilash": "Автоматик янгилаш",
    "Yoqilsa, dastur ochiq turganda GitHub har 10 daqiqada tekshiriladi va yangi savollar o‘zi yuklanadi. O‘chiq bo‘lsa — faqat qo‘lda yangilanadi.": "Ёқилса, дастур очиқ турганда GitHub ҳар 10 дақиқада текширилади ва янги саволлар ўзи юкланади. Ўчиқ бўлса — фақат қўлда янгиланади.",
    "GitHub’dan yangilash": "GitHub’дан янгилаш",
    "Google Drive’dan yangilash": "Google Drive’дан янгилаш",
    "Mahalliy versiya:": "Маҳаллий версия:",
    "Yangilanish tekshirilmagan.": "Янгиланиш текширилмаган.",
    "ZIP fayldan qo‘lda yangilash": "ZIP файлдан қўлда янгилаш",
    "Drive brauzer CORS ruxsatini bermasa, yuklab olingan ZIP’ni shu yerdan tanlang.": "Drive браузер CORS рухсатини бермаса, юклаб олинган ZIP’ни шу ердан танланг.",
    "ZIP’dan yangilash": "ZIP’дан янгилаш",
    "⌕  Qidirish...": "⌕  Қидириш...",
    "Jami": "Жами",
    "0 ta fayl": "0 та файл",
    "0 ta savol": "0 та савол",
    "Shablonlar panelidan kerakli shablonni tanlang.": "Шаблонлар панелидан керакли шаблонни танланг.",
    "Ko‘rinish o‘lchami": "Кўриниш ўлчами",
    "Matnni kichraytirish": "Матнни кичрайтириш",
    "Matnni kattalashtirish": "Матнни катталаштириш",
    "Baho": "Баҳо",
    "Xato:": "Хато:",
    "← Oldingi": "← Олдинги",
    "Keyingi →": "Кейинги →",
    "Navigatsiya": "Навигация",
    "Javob berilgan": "Жавоб берилган",
    "Ko‘rib chiqish": "Кўриб чиқиш",
    "Javobsiz savollar": "Жавобсиз саволлар",
    "Rasmlarni ko‘rsatish": "Расмларни кўрсатиш",
    "Videolarni avtomatik ijro etish": "Видеоларни автоматик ижро этиш",
    "Izohlarni avtomatik ochish": "Изоҳларни автоматик очиш",
    "Tugmani alohida ko‘rsatish": "Тугмани алоҳида кўрсатиш",
    "Taymer": "Таймер",
    "Joriy fayl": "Жорий файл",
    "Papka tanlang.": "Папка танланг.",
    "TEST YAKUNLANDI": "ТЕСТ ЯКУНЛАНДИ",
    "Natijangiz": "Натижангиз",
    "0 / 0 to‘g‘ri": "0 / 0 тўғри",
    "To‘g‘ri": "Тўғри",
    "Noto‘g‘ri": "Нотўғри",
    "Javobsiz": "Жавобсиз",
    "← Shablonlar": "← Шаблонлар",
    "↻ Qayta ishlash": "↻ Қайта ишлаш",
    "Xatolarni tozalash": "Хатоларни тозалаш",
    "ESC — yopish": "ESC — ёпиш",
    "© 2026 All Rights Reserved. YANGIYER AVTOTEST": "© 2026 Барча ҳуқуқлар ҳимояланган. ЯНГИЙЕР АВТОТЕСТ",
    "Dastur litsenziyalangan. Ruxsatsiz yuklab olish, nusxalash va tarqatish qat’iyan taqiqlanadi.": "Дастур лицензияланган. Рухсатсиз юклаб олиш, нусхалаш ва тарқатиш қатъиян тақиқланади."
  };

  if (IS_CYRL) {
    document.title = UI_KIRIL[document.title.trim()] || document.title;
    // lotin matn bir lahza ko'rinib qolmasligi uchun sahifa o'girilguncha yashiriladi
    document.write('<style id="yozuvHide">body{visibility:hidden}</style>');
  }

  function translate(root) {
    if (!IS_CYRL) return;
    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const tag = n.parentNode && n.parentNode.nodeName;
      if (tag === 'SCRIPT' || tag === 'STYLE') continue;
      const t = n.nodeValue.trim();
      if (t && UI_KIRIL[t]) n.nodeValue = n.nodeValue.replace(t, UI_KIRIL[t]);
    }
    (root || document.body).querySelectorAll('[placeholder],[title],[aria-label],[alt]').forEach(el => {
      for (const a of ['placeholder', 'title', 'aria-label', 'alt']) {
        const v = el.getAttribute(a);
        if (v && UI_KIRIL[v.trim()]) el.setAttribute(a, UI_KIRIL[v.trim()]);
      }
    });
  }

  function setScript(to) {
    if (to === script) return;
    if (document.body.classList.contains('view-quiz') &&
        !confirm(IS_CYRL ? 'Тест тугамаган. Ёзувни алмаштирсангиз, тест қайтадан бошланади. Давом этасизми?'
                         : 'Test tugamagan. Yozuvni almashtirsangiz, test qaytadan boshlanadi. Davom etasizmi?')) return;
    store.set(to);
    location.reload();
  }

  function switchHtml() {
    return `<div class="yozuv-switch" role="group" aria-label="${IS_CYRL ? 'Ёзув' : 'Yozuv'}">
      <button type="button" data-yozuv="latn" class="${IS_CYRL ? '' : 'active'}">Lotin</button>
      <button type="button" data-yozuv="cyrl" class="${IS_CYRL ? 'active' : ''}">Кирилл</button>
    </div>`;
  }
  function addControls() {
    const topbar = document.querySelector('.topbar');
    if (topbar && !topbar.querySelector('.yozuv-switch')) {
      const right = topbar.querySelector('.top-right');
      const box = document.createElement('div');
      box.className = 'yozuv-top';
      box.innerHTML = switchHtml();
      topbar.insertBefore(box, right || null);
    }
    const panel = document.querySelector('#settingsView .settings-panel');
    const first = panel && panel.querySelector('.settings-option');
    if (first && !panel.querySelector('.yozuv-setting')) {
      const row = document.createElement('div');
      row.className = 'settings-option yozuv-setting';
      row.innerHTML = `<div><b>${IS_CYRL ? 'Ёзув' : 'Yozuv'}</b><p>${IS_CYRL
        ? 'Саволлар ва дастур матнлари қайси ёзувда кўрсатилади. Танлов шу компьютерда эслаб қолинади.'
        : 'Savollar va dastur matnlari qaysi yozuvda ko‘rsatiladi. Tanlov shu kompyuterda eslab qolinadi.'}</p></div>${switchHtml()}`;
      first.parentNode.insertBefore(row, first);
    }
    document.addEventListener('click', e => {
      const b = e.target.closest('.yozuv-switch [data-yozuv]');
      if (b) setScript(b.dataset.yozuv);
    });
  }

  // <body> oxirida, app.js dan OLDIN chaqiriladi
  function boot() {
    translate(document.body);
    addControls();
    const k = IS_CYRL ? '-kiril' : '';
    document.write('<script src="bundled-data' + k + '.js"><\/script><script src="allquest' + k + '.js"><\/script>');
    const hide = document.getElementById('yozuvHide');
    if (hide) hide.remove();
  }

  window.YOZUV = { script, isCyrl: IS_CYRL, boot, translate, set: setScript, UI_KIRIL };
})();
