/*
 * MAVZU SOZLAMALARI
 * Yangi mavzu qo‘shish/o‘chirish uchun faqat TOPIC_RULES ro‘yxatini tahrirlang.
 * keywords: savol matnida uchrashi kerak bo‘lgan so‘z yoki iboralar.
 * Bir savol bir nechta mavzuga tushishi mumkin.
 */
(function () {
  const isCyrillic = document.documentElement.dataset.script === 'cyrl' ||
    document.documentElement.lang === 'uz-Cyrl';

  const TOPIC_RULES = [
    { id:'signs', icon:'🚦', title:['Yo‘l belgilari','Йўл белгилари'], desc:['Yo‘l belgilari va ularning guruhlari.','Йўл белгилари ва уларнинг гуруҳлари.'], keywords:['belgi','belgilar','belgisini','belgilari','yo‘l belgi','yo\'l belgi','qo‘shimcha axborot'] },
    // Yo‘l belgilari bo‘limining qo‘shimcha kichik mavzulari.
    // Savollar matnida yoki javob variantlarida guruh nomi uchrasa, shu kartaga qo‘shiladi.
    { id:'warning-signs', icon:'⚠️', title:['Ogohlantiruvchi belgilar','Огоҳлантирувчи белгилар'], desc:['Xavfli yo‘l qismlari haqida ogohlantiruvchi belgilar.','Хавфли йўл қисмлари ҳақида огоҳлантирувчи белгилар.'], keywords:['ogohlantiruvchi belgi','ogohlantiruvchi belgilar'], searchAnswers:true, alwaysShow:true },
    { id:'priority-signs', icon:'🔶', title:['Imtiyoz belgilari','Имтиёз белгилари'], desc:['Chorraha va yo‘l qismlarida harakatlanish imtiyozini belgilovchi ishoralar.','Чорраҳа ва йўл қисмларида ҳаракатланиш имтиёзини белгиловчи ишоралар.'], keywords:['imtiyoz belgi','imtiyoz belgisi','imtiyoz belgilari'], searchAnswers:true, alwaysShow:true },
    { id:'prohibitory-signs', icon:'⛔', title:['Taqiqlovchi belgilar','Тақиқловчи белгилар'], desc:['Harakatni yoki ayrim harakatlarni taqiqlovchi belgilar.','Ҳаракатни ёки айрим ҳаракатларни тақиқловчи белгилар.'], keywords:['taqiqlovchi belgi','taqiqlovchi belgilar'], searchAnswers:true, alwaysShow:true },
    { id:'mandatory-signs', icon:'🔵', title:['Buyuruvchi belgilar','Буюрувчи белгилар'], desc:['Haydovchiga bajarilishi shart bo‘lgan harakat yo‘nalishini ko‘rsatuvchi belgilar.','Ҳайдовчига бажарилиши шарт бўлган ҳаракат йўналишини кўрсатувчи белгилар.'], keywords:['buyuruvchi belgi','buyuruvchi belgilar'], searchAnswers:true, alwaysShow:true },
    { id:'information-signs', icon:'ℹ️', title:['Axborot-ko‘rsatkich belgilari','Ахборот-кўрсаткич белгилари'], desc:['Yo‘l, yo‘nalish va harakat tartibi haqida axborot beruvchi belgilar.','Йўл, йўналиш ва ҳаракат тартиби ҳақида ахборот берувчи белгилар.'], keywords:['axborot-ko‘rsatkich','axborot-ko‘rsatgich','axborot ko‘rsatkich','axborot ko‘rsatgich','axborot-ishora','axborot ishora'], searchAnswers:true, alwaysShow:true },
    { id:'service-signs', icon:'🛎️', title:['Servis belgilari','Сервис белгилари'], desc:['Yo‘l bo‘yidagi servis obyektlari haqida ma’lumot beruvchi belgilar.','Йўл бўйидаги сервис объектлари ҳақида маълумот берувчи белгилар.'], keywords:['servis belgisi','servis belgilari','servis belgi'], searchAnswers:true, alwaysShow:true },
    { id:'additional-information-signs', icon:'🪧', title:['Qo‘shimcha axborot belgilari','Қўшимча ахборот белгилари'], desc:['Asosiy yo‘l belgilariga qo‘shimcha ma’lumot beruvchi belgilar.','Асосий йўл белгиларига қўшимча маълумот берувчи белгилар.'], keywords:['qo‘shimcha axborot','qo\'shimcha axborot'], searchAnswers:true, alwaysShow:true },
    { id:'markings', icon:'〰️', title:['Yo‘l chiziqlari','Йўл чизиқлари'], desc:['Yo‘l chiziqlari va ularni kesib o‘tish qoidalari.','Йўл чизиқлари ва уларни кесиб ўтиш қоидалари.'], keywords:['chiziq','chiziqlar','uzluksiz chiziq','yo‘l chizig','yo\'l chizig'] },
    { id:'traffic-lights', icon:'🚥', title:['Svetofor va tartibga soluvchi','Светофор ва тартибга солувчи'], desc:['Svetofor ishoralari va harakatni tartibga solish.','Светофор ишоралари ва ҳаракатни тартибга солиш.'], keywords:['svetofor','tartibga soluvchi','tartibga solin','xodim ishora','tartibga solish'] },
    { id:'intersections', icon:'↗️', title:['Chorraha va yo‘l berish','Чорраҳа ва йўл бериш'], desc:['Chorrahadan o‘tish, navbat va ustunlik qoidalari.','Чорраҳадан ўтиш, навбат ва устунлик қоидалари.'], keywords:['chorraha','chorrahadan','chorrahada','yo‘l ber','yo\'l ber','ustunlik'] },
    { id:'stopping', icon:'🅿️', title:['To‘xtash va to‘xtab turish','Тўхташ ва тўхтаб туриш'], desc:['To‘xtash, to‘xtab turish va taqiqlangan joylar.','Тўхташ, тўхтаб туриш ва тақиқланган жойлар.'], keywords:['to‘xt','to\'xt','toxt','to‘xtab','to\'xtab'] },
    { id:'speed', icon:'⏱️', title:['Tezlik, masofa va quvib o‘tish','Тезлик, масофа ва қувиб ўтиш'], desc:['Tezlik me’yorlari, xavfsiz masofa va quvib o‘tish.','Тезлик меъёрлари, хавфсиз масофа ва қувиб ўтиш.'], keywords:['tezlik','quvib','masofa','tormoz yo','tormoz masof'] },
    { id:'maneuvers', icon:'↪️', title:['Manyovr va burilishlar','Манёвр ва бурилишлар'], desc:['Burilish, qayrilish, qayta saflanish va orqaga yurish.','Бурилиш, қайрилиш, қайта сафланиш ва орқага юриш.'], keywords:['burilish','qayril','orqaga harakat','manyovr','qayta safl','yo‘nalishlarda harakat','yo\'nalishlarda harakat'] },
    { id:'pedestrians', icon:'🚶', title:['Piyodalar va yo‘lovchilar','Пиёдалар ва йўловчилар'], desc:['Piyodalar o‘tish joylari, yo‘lovchi va bolalarni tashish.','Пиёдалар ўтиш жойлари, йўловчи ва болаларни ташиш.'], keywords:['piyoda','yo‘lovchi','yo\'lovchi','bolalar','odam tashish','piyodalar'] },
    { id:'driver-duties', icon:'🪪', title:['Haydovchi va hujjatlar','Ҳайдовчи ва ҳужжатлар'], desc:['Haydovchining majburiyatlari, hujjatlar va javobgarlik.','Ҳайдовчининг мажбуриятлари, ҳужжатлар ва жавобгарлик.'], keywords:['haydovchi','guvohnoma','hujjat','javobgarlik','ypx','sug‘urta','sug\'urta','inspektor'] },
    { id:'first-aid', icon:'➕', title:['Birinchi yordam','Биринчи ёрдам'], desc:['Yo‘l-transport hodisasida jabrlanuvchiga yordam ko‘rsatish.','Йўл-транспорт ҳодисасида жабрланувчига ёрдам кўрсатиш.'], keywords:['jabrlanuvchi','birinchi yordam','tibbiyot','qon ket','sun’iy nafas','sun\'iy nafas','shikast','dastlabki yordam'] },
    { id:'vehicles', icon:'🚗', title:['Transport va texnik holat','Транспорт ва техник ҳолат'], desc:['Transport vositalari, yuk, tirkama va texnik talablar.','Транспорт воситалари, юк, тиркама ва техник талаблар.'], keywords:['transport vositasi','texnik','nosoz','tirkama','shatakka','yuk avtomobili','tibbiyot qutichasi'] },
    { id:'railway', icon:'🚆', title:['Temir yo‘l kesishmalari','Темир йўл кесишмалари'], desc:['Temir yo‘l kesishmalaridan o‘tish qoidalari.','Темир йўл кесишмаларидан ўтиш қоидалари.'], keywords:['temir yo‘l','temir yo\'l','temiryo‘l','temiryo\'l','poyezd','poezd'] },
    { id:'road-types', icon:'🛣️', title:['Avtomagistral va aholi punktlari','Автомагистрал ва аҳоли пунктлари'], desc:['Avtomagistral va aholi punktlaridagi harakat qoidalari.','Автомагистрал ва аҳоли пунктларидаги ҳаракат қоидалари.'], keywords:['avtomagistral','aholi punkti','turar joy','aholi punktida'] }
  ];

  const CYR_MAP = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'j','з':'z','и':'i','й':'y',
    'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
    'х':'x','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'i','ь':'','э':'e','ю':'yu','я':'ya',
    'ғ':'g','қ':'q','ў':"o'",'ҳ':'h'
  };

  // Latin va kirill matnlarini bir xil ko‘rinishga keltiradi.
  function normalize(value) {
    let text = String(value || '').toLowerCase()
      .replace(/[’‘ʻʼ`´]/g, "'")
      .replace(/[“”]/g, '"');
    return text.replace(/[а-яёғқўҳ]/g, ch => CYR_MAP[ch] || ch);
  }

  const cache = new Map();
  function buildTopics() {
    if (cache.size) return [...cache.values()];
    const questions = Array.isArray(window.ALL_QUESTIONS) ? window.ALL_QUESTIONS : [];
    TOPIC_RULES.forEach(rule => {
      const words = rule.keywords.map(normalize);
      const matched = questions.filter(question => {
        const parts = [question.savol || question.question || ''];
        // Belgilar kichik mavzularida javob variantlarini ham tekshiramiz.
        if (rule.searchAnswers) {
          const answers = question.javob || question.variantlar || question.answers || question.options;
          if (Array.isArray(answers)) parts.push(...answers.map(value => typeof value === 'object' ? (value.text || value.label || value.name || '') : value));
        }
        const text = normalize(parts.join(' '));
        return words.some(word => word && text.includes(word));
      });
      if (matched.length || rule.alwaysShow) {
        cache.set(rule.id, { ...rule, title:rule.title[isCyrillic?1:0], desc:rule.desc[isCyrillic?1:0], questions:matched });
      }
    });
    return [...cache.values()];
  }

  // Mavzu kartalarini chizadi. Har bir karta o‘z savollar to‘plamini ochadi.
  function renderTopics() {
    const grid = document.getElementById('topicGrid');
    if (!grid) return;
    const topics = buildTopics();
    const search = normalize(document.getElementById('topicSearch')?.value || '');
    const shown = topics.filter(topic => !search || normalize(topic.title).includes(search) || normalize(topic.desc).includes(search));
    const countLabel = document.getElementById('topicCountLabel');
    if (countLabel) countLabel.textContent = `${shown.length} / ${topics.length} ${isCyrillic?'мавзу':'mavzu'}`;
    grid.innerHTML = '';

    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'topic-empty panel';
      empty.textContent = isCyrillic ? 'Мавзу топилмади.' : 'Mos mavzu topilmadi.';
      grid.appendChild(empty);
      return;
    }

    shown.forEach(topic => {
      const card = document.createElement('article');
      card.className = 'topic-card panel';
      const icon = document.createElement('div'); icon.className = 'topic-icon'; icon.textContent = topic.icon;
      const amount = document.createElement('span'); amount.className = 'topic-count';
      amount.textContent = `${topic.questions.length} ${isCyrillic?'та савол':'ta savol'}`;
      const heading = document.createElement('h3'); heading.textContent = topic.title;
      if (topic.questions.length === 1) amount.title = isCyrillic ? 'Базада бу мавзу учун ҳозирча битта савол аниқланди.' : 'Hozirgi savollar bazasida bu mavzu uchun faqat bitta savol aniqlandi.';
      const description = document.createElement('p'); description.textContent = topic.desc;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'topic-open';
      button.textContent = topic.questions.length === 1
        ? (isCyrillic ? '1 та саволни очиш →' : '1 ta savolni ochish →')
        : (isCyrillic ? 'Тестни бошлаш →' : 'Testni boshlash →');
      button.disabled = topic.questions.length === 0;
      if (button.disabled) {
        button.textContent = isCyrillic ? 'Саволлар ҳали бириктирилмаган' : 'Savollar hali biriktirilmagan';
        button.title = isCyrillic ? 'Бу гуруҳ учун саволлар аниқланмади' : 'Bu guruh uchun savollar manbada aniq belgilanmagan';
      } else {
        button.addEventListener('click', () => {
          if (typeof window.startSpecialTest === 'function') {
            window.startSpecialTest('topic', topic.questions.length, topic.questions, topic.title);
          }
        });
      }
      const top = document.createElement('div'); top.className = 'topic-card-top'; top.append(icon, amount);
      card.append(top, heading, description, button);
      grid.appendChild(card);
    });
  }

  window.renderTopics = renderTopics;
  window.resetTopicsCache = () => cache.clear();
  window.TOPIC_RULES = TOPIC_RULES; // Admin/editor dasturi ham shu ro‘yxatdan foydalanishi mumkin.
})();
