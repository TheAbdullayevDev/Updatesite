/* =====================================================================================
   app.js — DASTURNING ASOSIY MANTIG'I
   Vault ichida: ildizda.  GitHub'da: app/files/app.js
   index.html da update-client.js dan KEYIN, dev-mode.js dan OLDIN ulanadi.
   ===================================================================================== */

/* 1. YORDAMCHILAR
   Bu yerga: $ / $$ (querySelector), matnni tozalash, aralashtirish (shuffle), vaqt formatlash. */

/* 2. SAVOLLARNI YUKLASH
   Bu yerga: globalThis.BUNDLED_TEMPLATES (bundled-data.js) va window.ALL_QUESTIONS (allquest.js) ni o'qish.
   Kirill yozuvida til.js bundled-data-kiril.js / allquest-kiril.js ni yuklaydi — nomlar bir xil.
   Savol maydonlari: savol, variantlar | javob, togri_javob (0 dan), rasm, izoh, izoh_rasm, izoh_video, wrong_video. */

/* 3. MEDIA (rasm/video) YO'LINI TOPISH — assetFor(ref)
   Bu yerga: savoldagi "rasmlar/1-1.jpg", "videolar/1_1.mov" yo'lini haqiqiy manzilga aylantirish:
     • window.APP_UPDATE_MEDIA[yo'l] Blob bo'lsa — URL.createObjectURL (brauzerdagi yangilanish);
     • window.__VAULT_HOST__ bor va yo'l "updates/media/" bilan boshlansa — shu yo'lning o'zi (EXE vault ichidan beradi);
     • aks holda assets/rasmlar/..., assets/shablonlar/videolar/... */

/* 4. SAHIFALAR (view) — showView(nom)
   Bu yerga: home / templates / topics / general / settings / quiz / result oynalarini almashtirish,
   yuqori panel tugmalari, mavzu (qorong'i/yorug') va to'liq ekran. */

/* 5. SHABLONLAR RO'YXATI — renderTemplates()
   Bu yerga: #templateGrid ga har shablon kartasini chizish, qidiruv (#templateSearch). */

/* 6. TEST — savol ko'rsatish, javob tanlash, raqamlar paneli, izoh, taymer, imtihon rejimi, natija.
   Klaviatura: F1..F6 — javob tanlash. */

/* 7. SOZLAMALAR VA YANGILANISH
   Bu yerga: Sozlamalar tugmalarini window.APP_UPDATER (update-client.js) ga ulash:
     checkGithub(), checkDrive(), installZip(file), getVersion(), setStatusCallback(fn).
   SHART: window.applyAppContentUpdate = function (payload) { ... } — yangi savollarni qo'llaydi;
   test ochiq bo'lsa false qaytaradi va test tugagach qo'llaydi. update-client.js va auto-update.js shuni chaqiradi. */
