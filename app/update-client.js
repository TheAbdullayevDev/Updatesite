/* GitHub yoki ixtiyoriy to'g'ridan-to'g'ri ZIP havolasidan yangilanish oladi. */
(function () {
  'use strict';

  // 1. GitHub repo manzilini shu yerga yozing: "foydalanuvchi/repo".
  // 2. Branch odatda main bo'ladi.
  // 3. Google Drive ishlatilsa, pastdagi URL maydoniga to'g'ridan-to'g'ri yuklash linkini yozing.
  const GITHUB_REPO = 'TheAbdullayevDev/Updatesite';
  const GITHUB_BRANCH = 'main';
  const GOOGLE_DRIVE_ZIP_URL = 'https://drive.google.com/file/d/1N-27GqlwrV0AJeE5Aqwyz_CImq8tqRNF/view?usp=sharing'; // Yangilanish ZIP fayli
  const GOOGLE_DRIVE_PROXY_URL = ''; // Cloudflare Worker deploy qilingach, URL manzilini shu yerga yozing.
  const BASE_VERSION = '1.0.0';
  const DB_NAME = 'yangiyer-avto-updates';
  const DB_VERSION = 1;

  // Sahifa yozuvi: index-kiril.html da <html data-script="cyrl"> bo'ladi.
  const IS_CYRL = document.documentElement.dataset.script === 'cyrl';
  const L = (lat, cyr) => (IS_CYRL ? cyr : lat);

  let dbPromise, inflight = null, currentVersion = BASE_VERSION, statusCallback = null, lastStatus = null;
  const status = (message, type = 'info') => {
    lastStatus = { message, type, time: Date.now() };
    statusCallback?.(message, type);
    window.dispatchEvent(new CustomEvent('app-update-status', { detail: { message, type } }));
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fmtMb = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';

  /* Tarmoq xatosini tushunarli qilib beradi. "Failed to fetch" (TypeError) — internet yo'q,
     ulanish uzildi yoki dastur (EXE) tashqi saytga ulanishni to'sdi. */
  function netError(error) {
    if (error instanceof TypeError) {
      const e = new Error(navigator.onLine === false
        ? L('Kompyuter internetga ulanmagan.', 'Компьютер интернетга уланмаган.')
        : L('GitHub serveriga (raw.githubusercontent.com) ulanib bo‘lmadi: internet uzildi/sekin yoki dastur tashqi ulanishni to‘smoqda.',
            'GitHub серверига (raw.githubusercontent.com) уланиб бўлмади: интернет узилди/секин ёки дастур ташқи уланишни тўсмоқда.'));
      e.retryable = true;
      return e;
    }
    return error;
  }

  /* Faylni oqim bilan yuklaydi: necha MB kelgani ko'rinadi. stallMs davomida bir bayt ham kelmasa —
     ulanish osilib qolgan deb uziladi va qayta uriniladi. 429/5xx va uzilishlarda kutib qayta uriniladi. */
  async function download(url, { onProgress, onRetry, stallMs = 60000, tries = 4 } = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= tries; attempt++) {
      const ctl = new AbortController();
      let lastMove = Date.now(), stalled = false;
      const dog = setInterval(() => { if (Date.now() - lastMove > stallMs) { stalled = true; ctl.abort(); } }, 2000);
      try {
        const r = await fetch(url, { cache: 'no-store', signal: ctl.signal });
        if (!r.ok) {
          const e = new Error('HTTP ' + r.status + (r.status === 429 ? L(' (GitHub juda ko‘p so‘rov deb vaqtincha cheklagan)', ' (GitHub жуда кўп сўров деб вақтинча чеклаган)') : ''));
          e.status = r.status; e.retryable = r.status === 429 || r.status >= 500;
          throw e;
        }
        const total = Number(r.headers.get('content-length')) || 0;
        if (!r.body?.getReader) { const b = await r.blob(); onProgress?.(b.size, b.size); return b; }
        const reader = r.body.getReader(), chunks = [];
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); got += value.byteLength; lastMove = Date.now();
          onProgress?.(got, total);
        }
        return new Blob(chunks, { type: r.headers.get('content-type') || '' });
      } catch (error) {
        lastError = stalled
          ? Object.assign(new Error(L(`Ulanish ${Math.round(stallMs / 1000)} soniya javob bermadi.`, `Уланиш ${Math.round(stallMs / 1000)} сония жавоб бермади.`)), { retryable: true })
          : netError(error);
        if (!lastError.retryable || attempt === tries) break;
        const wait = lastError.status === 429 ? 60000 : ([5000, 15000, 30000][attempt - 1] || 30000);
        onRetry?.(attempt + 1, wait, lastError);
        await sleep(wait);
      } finally { clearInterval(dog); }
    }
    throw lastError;
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error(L('IndexedDB qo‘llab-quvvatlanmaydi.', 'IndexedDB қўллаб-қувватланмайди.')));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'path' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error(L('Yangilash bazasi ochilmadi.', 'Янгилаш базаси очилмади.')));
    });
    return dbPromise;
  }
  async function get(store, key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function getAll(store) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  // Paketni saqlash. Media to'liq o'chirib qayta yozilmaydi: faqat endi kerak bo'lmaganlari o'chiriladi,
  // yangi/o'zgarganlari yoziladi, kompyuterda allaqachon bor (reused) fayllarga tegilmaydi.
  async function savePackage(payload, media) {
    const db = await openDb();
    const keep = new Set(media.map(item => item.path));
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['meta', 'media'], 'readwrite');
      const meta = tx.objectStore('meta'), files = tx.objectStore('media');
      const keysReq = files.getAllKeys();
      keysReq.onsuccess = () => (keysReq.result || []).forEach(k => { if (!keep.has(k)) files.delete(k); });
      meta.put({ key: 'payload', value: payload });
      meta.put({ key: 'version', value: String(payload.version || BASE_VERSION) });
      media.forEach(item => {
        if (!item.reused) files.put({ path: item.path, blob: item.blob, type: item.type, sha256: item.sha256 || '' });
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error(L('Yangilanishni saqlab bo‘lmadi.', 'Янгиланишни сақлаб бўлмади.')));
      tx.onabort = () => reject(tx.error || new Error(L('Yangilanish bekor qilindi.', 'Янгиланиш бекор қилинди.')));
    });
  }
  async function sha256(blob) {
    if (!crypto?.subtle) throw new Error(L('SHA-256 tekshiruvi uchun Chrome/HTTPS kerak.', 'SHA-256 текшируви учун Chrome/HTTPS керак.'));
    const bytes = blob instanceof Blob ? await blob.arrayBuffer() : blob;
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  function compareVersions(a, b) {
    const aa = String(a || '0').split(/[.-]/).map(x => Number(x) || 0);
    const bb = String(b || '0').split(/[.-]/).map(x => Number(x) || 0);
    for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
      const d = (aa[i] || 0) - (bb[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }
  function rawUrl(path, cacheKey = Date.now()) {
    const safePath = String(path).split('/').map(encodeURIComponent).join('/');
    return `https://raw.githubusercontent.com/${GITHUB_REPO}/${encodeURIComponent(GITHUB_BRANCH)}/${safePath}?v=${encodeURIComponent(cacheKey)}`;
  }
  /* ===== EXE (SecureMediaVault) rejimi =====
     Dastur EXE ichida ochilganda GitHub yangilanishini EXE o'zi yuklaydi va SHIFRLANGAN vault ichiga yozadi.
     Sahifa savollarni https://vault.local/content-update.json dan, videolarni updates/media/... dan o'qiydi.
     Oddiy brauzerda (EXE'siz) eski usul — IndexedDB — ishlayveradi. */
  const HOST = !!(window.__VAULT_HOST__ && window.chrome?.webview);
  let hostSeq = 0;
  const hostWait = new Map();
  if (HOST) {
    window.chrome.webview.addEventListener('message', e => {
      const d = e.data || {};
      if (d.type === 'status') {
        if (d.scope === 'app') window.dispatchEvent(new CustomEvent('app-host-status', { detail: d }));
        else status(d.message, d.level || 'info');
      } else if (d.type === 'result' && hostWait.has(d.id)) {
        hostWait.get(d.id)(d);
        hostWait.delete(d.id);
      }
    });
  }
  function hostCall(cmd) {
    return new Promise(resolve => {
      const id = String(++hostSeq);
      hostWait.set(id, resolve);
      window.chrome.webview.postMessage({ id, cmd });
    });
  }
  async function vaultPayload() {
    try {
      const r = await fetch('content-update.json', { cache: 'no-store' });
      return r.ok ? await r.json() : null;
    } catch (_) { return null; }
  }
  async function checkViaHost() {
    const r = await hostCall('content-update');
    if (!r.ok) throw new Error(String(r.message || '').replace(/^GitHub yangilash amalga oshmadi:\s*/, ''));
    if (!r.updated) {
      const payload = compareVersions(r.version, currentVersion) > 0 ? await vaultPayload() : null;
      return payload ? { hostPayload: payload } : { unchanged: true };
    }
    const payload = await vaultPayload();
    if (!payload) throw new Error(L('vault ichidan content-update.json o‘qilmadi.', 'vault ичидан content-update.json ўқилмади.'));
    return { hostPayload: payload };
  }

  async function loadStored() {
    let best = null;
    currentVersion = String(window.APP_CONTENT_PATCH?.version || window.APP_CONTENT_VERSION || BASE_VERSION);
    try {
      const saved = await get('meta', 'payload');
      const media = await getAll('media');
      window.APP_UPDATE_MEDIA = Object.fromEntries(media.map(item => [item.path, item.blob]));
      if (saved?.value && compareVersions(saved.value.version, currentVersion) > 0) {
        best = saved.value;
        currentVersion = String(best.version || BASE_VERSION);
      }
    } catch (error) { status(L('Saqlangan yangilanishni o‘qib bo‘lmadi: ', 'Сақланган янгиланишни ўқиб бўлмади: ') + error.message, 'warning'); }
    if (HOST) {
      const fromVault = await vaultPayload();
      if (fromVault?.version && compareVersions(fromVault.version, currentVersion) > 0) {
        best = fromVault;
        currentVersion = String(fromVault.version);
        window.APP_UPDATE_MEDIA = {}; // videolar vault ichidan (updates/media/...) olinadi
      }
    }
    return best;
  }
  async function saveLocal(payload, mediaItems = []) {
    await savePackage(payload, mediaItems);
    currentVersion = String(payload.version || BASE_VERSION);
    window.APP_UPDATE_MEDIA = Object.fromEntries(mediaItems.map(item => [item.path, item.blob]));
    if (typeof window.applyAppContentUpdate === 'function') window.applyAppContentUpdate(payload);
    status(L(`Lokal ma'lumot saqlandi. Versiya: ${currentVersion}`, `Локал маълумот сақланди. Версия: ${currentVersion}`), 'success');
    return true;
  }

  // Admin eksport qiladigan ZIP Store formatida. Shu ZIP'ni Drive linkidan ham o'qiy oladi.
  async function readStoreZip(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer()), view = new DataView(bytes.buffer);
    const decoder = new TextDecoder();
    const files = new Map();
    let offset = 0;
    while (offset + 30 < bytes.length && view.getUint32(offset, true) === 0x04034b50) {
      const method = view.getUint16(offset + 8, true);
      const size = view.getUint32(offset + 18, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);
      if (method !== 0) throw new Error(L('ZIP ichidagi siqilgan fayl turi qo‘llanmaydi. Admin eksport ZIP ishlating.', 'ZIP ичидаги сиқилган файл тури қўлланмайди. Админ экспорт ZIP ишлатинг.'));
      const nameStart = offset + 30;
      const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLen));
      const dataStart = nameStart + nameLen + extraLen, dataEnd = dataStart + size;
      if (dataEnd > bytes.length) throw new Error(L('ZIP fayli buzilgan.', 'ZIP файли бузилган.'));
      files.set(name, new Blob([bytes.slice(dataStart, dataEnd)]));
      offset = dataEnd;
    }
    return files;
  }
  async function payloadFromZip(blob) {
    const files = await readStoreZip(blob);
    const manifestFile = files.get('version.json'), payloadFile = files.get('content-update.json');
    if (!manifestFile || !payloadFile) throw new Error(L('ZIP ichida version.json yoki content-update.json topilmadi.', 'ZIP ичида version.json ёки content-update.json топилмади.'));
    const manifest = JSON.parse(await manifestFile.text());
    if (manifest.payload?.sha256 && await sha256(payloadFile) !== manifest.payload.sha256) throw new Error(L('ZIP savol ma’lumotlari xesh tekshiruvidan o‘tmadi.', 'ZIP савол маълумотлари хеш текширувидан ўтмади.'));
    const payload = JSON.parse(await payloadFile.text());
    const media = [];
    for (const item of manifest.assets || []) {
      const file = files.get(item.path);
      if (!file) throw new Error(L('ZIP ichida media yo‘q: ', 'ZIP ичида медиа йўқ: ') + item.path);
      if (item.sha256 && await sha256(file) !== item.sha256) throw new Error(L('Media tekshiruvidan o‘tmadi: ', 'Медиа текширувидан ўтмади: ') + item.path);
      media.push({ path: item.path, blob: file, type: item.type || file.type || 'application/octet-stream', sha256: String(item.sha256 || '').toLowerCase() });
    }
    return { payload, media, manifest };
  }
  async function installZip(blob) {
    const pack = await payloadFromZip(blob);
    if (compareVersions(pack.payload.version, currentVersion) < 0) throw new Error(L('Bu ZIP hozirgi versiyadan eski. Joriy: ', 'Бу ZIP ҳозирги версиядан эски. Жорий: ') + currentVersion);
    await savePackage(pack.payload, pack.media);
    currentVersion = String(pack.payload.version || BASE_VERSION);
    window.APP_UPDATE_MEDIA = Object.fromEntries(pack.media.map(item => [item.path, item.blob]));
    const applied = typeof window.applyAppContentUpdate === 'function' ? window.applyAppContentUpdate(pack.payload) : false;
    const message = L(`ZIP yangilanishi o‘rnatildi. Versiya: ${currentVersion}`, `ZIP янгиланиши ўрнатилди. Версия: ${currentVersion}`) + (applied ? '' : L('. Ochiq test tugagach qo‘llanadi.', '. Очиқ тест тугагач қўлланади.'));
    status(message, 'success');
    return { ok: true, updated: true, applied, message };
  }

  async function installFromDrive() {
    if (!GOOGLE_DRIVE_ZIP_URL && !GOOGLE_DRIVE_PROXY_URL) throw new Error(L('update-client.js ichida GOOGLE_DRIVE_ZIP_URL yoki GOOGLE_DRIVE_PROXY_URL manzilini kiriting.', 'update-client.js ичида GOOGLE_DRIVE_ZIP_URL ёки GOOGLE_DRIVE_PROXY_URL манзилини киритинг.'));
    const requestUrl = GOOGLE_DRIVE_PROXY_URL || normalizeDriveUrl(GOOGLE_DRIVE_ZIP_URL);
    let response;
    try {
      response = await fetch(requestUrl + (requestUrl.includes('?') ? '&' : '?') + 'v=' + Date.now(), {
        cache: 'no-store',
        redirect: 'follow'
      });
    } catch (error) {
      if (!GOOGLE_DRIVE_PROXY_URL && error instanceof TypeError) {
        const corsError = new Error(L('Google Drive brauzerga ZIP faylini bevosita o‘qishga ruxsat bermadi (CORS). ZIP yangi oynada yuklab olinadi; yuklangach pastdagi “ZIP’dan yangilash” orqali tanlang. Bir bosishda avtomatik yangilash uchun Cloudflare Worker proksisini sozlang.', 'Google Drive браузерга ZIP файлини бевосита ўқишга рухсат бермади (CORS). ZIP янги ойнада юклаб олинади; юклангач пастдаги “ZIP’дан янгилаш” орқали танланг. Бир босишда автоматик янгилаш учун Cloudflare Worker проксисини созланг.'));
        corsError.driveManualFallback = true;
        corsError.downloadUrl = normalizeDriveUrl(GOOGLE_DRIVE_ZIP_URL);
        throw corsError;
      }
      throw error;
    }
    if (!response.ok) throw new Error(L('Google Drive ZIP olinmadi: HTTP ', 'Google Drive ZIP олинмади: HTTP ') + response.status);
    const blob = await response.blob();
    const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    if (signature.length < 4 || signature[0] !== 0x50 || signature[1] !== 0x4b) {
      const htmlError = new Error(L('Google Drive ZIP o‘rniga ko‘rish/tasdiqlash sahifasini qaytardi. Faylni yuklab olish havolasi va Anyone with the link ruxsatini tekshiring.', 'Google Drive ZIP ўрнига кўриш/тасдиқлаш саҳифасини қайтарди. Файлни юклаб олиш ҳаволаси ва Anyone with the link рухсатини текширинг.'));
      if (!GOOGLE_DRIVE_PROXY_URL) { htmlError.driveManualFallback = true; htmlError.downloadUrl = normalizeDriveUrl(GOOGLE_DRIVE_ZIP_URL); }
      throw htmlError;
    }
    return payloadFromZip(blob);
  }

  function extractDriveId(value) {
    try {
      const url = new URL(value);
      return url.searchParams.get('id') || url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || '';
    } catch (_) { return ''; }
  }
  function normalizeDriveUrl(value) {
    const id = extractDriveId(value);
    return id ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}` : String(value || '');
  }

  async function installFromGithub() {
    // Maxsus sarlavha qo'shilmaydi: u CORS preflight'ga sabab bo'ladi va raw.githubusercontent uni rad etadi.
    const retryMsg = what => (n, wait, err) => status(L(`GitHub: ${what} — ${err.message} ${Math.round(wait / 1000)} soniyadan keyin ${n}-urinish…`,
                                                         `GitHub: ${what} — ${err.message} ${Math.round(wait / 1000)} сониядан кейин ${n}-уриниш…`), 'warning');
    let manifest;
    try {
      const blob = await download(rawUrl('version.json'), { stallMs: 20000, tries: 3, onRetry: retryMsg('version.json') });
      manifest = JSON.parse(await blob.text());
    } catch (error) {
      if (error.status === 404) return null;
      if (error instanceof SyntaxError) throw new Error(L('version.json formati noto‘g‘ri.', 'version.json формати нотўғри.'));
      throw error;
    }
    if (!manifest.version || !manifest.payload?.path || !manifest.payload?.sha256) throw new Error(L('version.json formati noto‘g‘ri.', 'version.json формати нотўғри.'));
    if (compareVersions(manifest.version, currentVersion) <= 0) return { unchanged: true, version: manifest.version };

    status(L(`GitHub: yangi ${manifest.version} versiya topildi (hozir ${currentVersion}). Savollar yuklanmoqda…`, `GitHub: янги ${manifest.version} версия топилди (ҳозир ${currentVersion}). Саволлар юкланмоқда…`));
    let payloadBlob = null;
    for (let attempt = 1; attempt <= 2 && !payloadBlob; attempt++) {
      let shown = 0;
      const blob = await download(rawUrl(manifest.payload.path, manifest.version), {
        onRetry: retryMsg(manifest.payload.path),
        onProgress: (got, total) => {
          if (Date.now() - shown < 500) return; shown = Date.now();
          status(L(`GitHub: savollar yuklanmoqda — ${fmtMb(got)}${total ? ' / ' + fmtMb(total) : ''}`, `GitHub: саволлар юкланмоқда — ${fmtMb(got)}${total ? ' / ' + fmtMb(total) : ''}`));
        }
      });
      if (await sha256(blob) === String(manifest.payload.sha256).toLowerCase()) payloadBlob = blob;
      else if (attempt === 2) throw new Error(L('GitHub content-update.json SHA-256 xatosi (fayl to‘liq yuklanmadi yoki GitHub’da hali yangilanmoqda).', 'GitHub content-update.json SHA-256 хатоси (файл тўлиқ юкланмади ёки GitHub’да ҳали янгиланмоқда).'));
    }
    const payload = JSON.parse(await payloadBlob.text());
    if (String(payload.version) !== String(manifest.version)) throw new Error(L('GitHub versiya raqamlari mos emas.', 'GitHub версия рақамлари мос эмас.'));

    const media = await syncGithubMedia(manifest);
    return { payload, media, manifest };
  }

  /* Media: faqat yangi yoki o'zgargan fayllar yuklanadi.
     Kompyuterda shu yo'lda xeshi bir xil fayl bo'lsa — qayta yuklanmaydi (reused).
     Yangi yo'ldagi fayl yuklangan zahoti saqlanadi: internet uzilsa, keyingi urinish shu joydan davom etadi. */
  async function syncGithubMedia(manifest) {
    const assets = manifest.assets || [];
    for (const item of assets) {
      if (!item.path || !item.sha256) throw new Error(L('GitHub media ro‘yxati noto‘g‘ri.', 'GitHub медиа рўйхати нотўғри.'));
    }
    const stored = new Map((await getAll('media')).map(x => [x.path, x]));
    const media = [], toFetch = [];
    for (const item of assets) {
      const want = String(item.sha256).toLowerCase(), have = stored.get(item.path);
      let same = false;
      if (have?.blob) {
        // eski versiyada xesh yozilmagan bo'lsa — bir marta hisoblab olinadi
        const hash = have.sha256 || await sha256(have.blob).catch(() => '');
        same = hash === want;
        if (same && !have.sha256) await putMedia({ ...have, sha256: hash }).catch(() => {});
      }
      if (same) media.push({ path: item.path, blob: have.blob, type: have.type || item.type, sha256: want, reused: true });
      else toFetch.push(item);
    }
    if (toFetch.length) {
      status(L(`GitHub: ${assets.length - toFetch.length} ta media kompyuterda bor, ${toFetch.length} ta yuklanadi…`,
               `GitHub: ${assets.length - toFetch.length} та медиа компьютерда бор, ${toFetch.length} та юкланади…`));
    } else if (assets.length) {
      status(L(`GitHub: barcha ${assets.length} ta media kompyuterda bor — qayta yuklanmaydi.`,
               `GitHub: барча ${assets.length} та медиа компьютерда бор — қайта юкланмайди.`));
    }
    let bytes = 0;
    for (let i = 0; i < toFetch.length; i++) {
      const item = toFetch[i], want = String(item.sha256).toLowerCase();
      const name = item.path.split('/').pop();
      const head = L(`GitHub: media ${i + 1}/${toFetch.length} — ${name}`, `GitHub: медиа ${i + 1}/${toFetch.length} — ${name}`);
      status(head + L(' yuklanmoqda…', ' юкланмоқда…'));
      let file = null, lastError = null, shown = 0;
      const started = Date.now();
      for (let attempt = 1; attempt <= 2 && !file; attempt++) {
        try {
          // kesh kaliti — fayl xeshi: bir xil fayl brauzer keshidan ham olinishi mumkin
          const blob = await download(rawUrl(item.path, want.slice(0, 16)), {
            onRetry: (n, wait, err) => status(head + ` — ${err.message} ` + L(`${Math.round(wait / 1000)} soniyadan keyin ${n}-urinish…`, `${Math.round(wait / 1000)} сониядан кейин ${n}-уриниш…`), 'warning'),
            onProgress: (got, total) => {
              if (Date.now() - shown < 500) return; shown = Date.now();
              const secs = (Date.now() - started) / 1000, speed = secs > 1 ? got / secs : 0;
              const pct = total ? ` (${Math.floor(got / total * 100)}%)` : '';
              status(`${head} — ${fmtMb(got)}${total ? ' / ' + fmtMb(total) : ''}${pct}${speed ? ', ' + fmtMb(speed) + '/s' : ''}`);
            }
          });
          if (await sha256(blob) !== want) throw new Error(L('GitHub media xeshi mos emas: ', 'GitHub медиа хеши мос эмас: ') + item.path);
          file = blob;
        } catch (error) {
          lastError = error.status ? new Error(L('GitHub media yuklanmadi: ', 'GitHub медиа юкланмади: ') + item.path + ' (' + error.message + ')') : error;
          if (error.status && !error.retryable) break; // 404 — fayl GitHub'da yo'q, qayta urinish foydasiz
        }
      }
      if (!file) throw lastError;
      bytes += file.size;
      const entry = { path: item.path, blob: file, type: item.type || file.type || 'application/octet-stream', sha256: want };
      // yangi yo'l — darhol saqlanadi (joriy savollar uni ishlatmaydi). O'zgargan eski yo'l — oxirida birga saqlanadi.
      if (!stored.has(item.path)) { await putMedia(entry).catch(() => {}); entry.reused = true; }
      media.push(entry);
    }
    return media;
  }
  async function putMedia(entry) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('media', 'readwrite');
      tx.objectStore('media').put({ path: entry.path, blob: entry.blob, type: entry.type, sha256: entry.sha256 || '' });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function applyRemotePack(pack, sourceName) {
    if (!pack) {
      const message = L(`${sourceName}: yangilanish manifesti topilmadi.`, `${sourceName}: янгиланиш манифести топилмади.`);
      status(message, 'info');
      return { ok: true, updated: false, message };
    }
    if (pack.unchanged) {
      const message = L(`${sourceName}: dastur yangilangan. Joriy versiya: ${currentVersion}`, `${sourceName}: дастур янгиланган. Жорий версия: ${currentVersion}`);
      status(message, 'success');
      return { ok: true, updated: false, message };
    }
    if (pack.hostPayload) {
      // EXE allaqachon fayllarni tekshirib, vault ichiga shifrlab yozgan.
      currentVersion = String(pack.hostPayload.version || currentVersion);
      window.APP_UPDATE_MEDIA = {};
      const applied = typeof window.applyAppContentUpdate === 'function' ? window.applyAppContentUpdate(pack.hostPayload) : false;
      const message = L(`${sourceName} orqali yangilanish o‘rnatildi (shifrlangan). Versiya: ${currentVersion}`, `${sourceName} орқали янгиланиш ўрнатилди (шифрланган). Версия: ${currentVersion}`) + (applied ? '' : L('. Ochiq test tugagach qo‘llanadi.', '. Очиқ тест тугагач қўлланади.'));
      status(message, 'success');
      return { ok: true, updated: true, applied, message };
    }
    if (compareVersions(pack.payload.version, currentVersion) < 0) {
      throw new Error(L(`${sourceName}: bu paket joriy versiyadan eski. Joriy: ${currentVersion}`, `${sourceName}: бу пакет жорий версиядан эски. Жорий: ${currentVersion}`));
    }
    await savePackage(pack.payload, pack.media);
    currentVersion = String(pack.payload.version || BASE_VERSION);
    window.APP_UPDATE_MEDIA = Object.fromEntries(pack.media.map(item => [item.path, item.blob]));
    const applied = typeof window.applyAppContentUpdate === 'function' ? window.applyAppContentUpdate(pack.payload) : false;
    const message = L(`${sourceName} orqali yangilanish o‘rnatildi. Versiya: ${currentVersion}`, `${sourceName} орқали янгиланиш ўрнатилди. Версия: ${currentVersion}`) + (applied ? '' : L('. Ochiq test tugagach qo‘llanadi.', '. Очиқ тест тугагач қўлланади.'));
    status(message, 'success');
    return { ok: true, updated: true, applied, message };
  }

  // Yangilash allaqachon ketayotgan bo'lsa (masalan, avto-yangilash), yangisi boshlanmaydi —
  // tugma o'sha jarayonga qo'shiladi va uning natijasini kutadi.
  function runSource(sourceName, loader) {
    if (inflight) return inflight;
    inflight = runSourceNow(sourceName, loader).finally(() => { inflight = null; });
    return inflight;
  }
  async function runSourceNow(sourceName, loader) {
    try {
      await window.APP_UPDATE_READY;
      status(L(`${sourceName} orqali yangilanish tekshirilmoqda…`, `${sourceName} орқали янгиланиш текширилмоқда…`));
      const pack = await loader();
      return await applyRemotePack(pack, sourceName);
    } catch (error) {
      const message = L(`${sourceName} yangilash amalga oshmadi: `, `${sourceName} янгилаш амалга ошмади: `) + (error.message || error);
      status(message, error.driveManualFallback ? 'warning' : 'error');
      return {
        ok: false,
        message,
        requiresManual: !!error.driveManualFallback,
        downloadUrl: error.downloadUrl || ''
      };
    }
  }

  async function checkGithub() {
    const repoReady = GITHUB_REPO && !/USERNAME|REPOSITORY/i.test(GITHUB_REPO);
    if (!repoReady) {
      const message = L('update-client.js ichidagi GITHUB_REPO qiymatiga repo manzilingizni yozing.', 'update-client.js ичидаги GITHUB_REPO қийматига репо манзилингизни ёзинг.');
      status(message, 'error'); return { ok: false, message };
    }
    return runSource('GitHub', HOST ? checkViaHost : installFromGithub);
  }
  // Dastur (html/js/css) yangilanishi — faqat EXE ichida, imzosi tekshirilgan paket.
  async function checkApp() {
    if (!HOST) return { ok: false, updated: false, message: L('Dasturni yangilash faqat EXE (Secure Media Vault) ichida ishlaydi.', 'Дастурни янгилаш фақат EXE (Secure Media Vault) ичида ишлайди.') };
    return hostCall('app-update');
  }
  const hostInfo = () => (HOST ? hostCall('info') : Promise.resolve(null));
  async function checkDrive() {
    if (!GOOGLE_DRIVE_ZIP_URL && !GOOGLE_DRIVE_PROXY_URL) {
      const message = L('update-client.js ichidagi GOOGLE_DRIVE_ZIP_URL yoki GOOGLE_DRIVE_PROXY_URL manzilini kiriting.', 'update-client.js ичидаги GOOGLE_DRIVE_ZIP_URL ёки GOOGLE_DRIVE_PROXY_URL манзилини киритинг.');
      status(message, 'error'); return { ok: false, message };
    }
    return runSource('Google Drive', installFromDrive);
  }

  window.APP_UPDATE_READY = loadStored();
  window.APP_UPDATER = {
    check: checkGithub,
    checkGithub,
    checkDrive,
    getDriveDownloadUrl: () => normalizeDriveUrl(GOOGLE_DRIVE_ZIP_URL),
    getVersion: () => currentVersion,
    isBusy: () => !!inflight,
    getLastStatus: () => lastStatus,
    isHost: () => HOST,
    checkApp,
    hostInfo,
    saveLocal,
    installZip,
    setStatusCallback: fn => { statusCallback = fn; },
    readStoreZip,
    payloadFromZip,
    getConfig: () => ({ repo: GITHUB_REPO, branch: GITHUB_BRANCH, driveConfigured: !!(GOOGLE_DRIVE_ZIP_URL || GOOGLE_DRIVE_PROXY_URL), driveProxyConfigured: !!GOOGLE_DRIVE_PROXY_URL })
  };
  window.APP_UPDATE_READY.catch(error => console.warn('Offline yangilanish o‘qilmadi:', error));
})();
