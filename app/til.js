/* =====================================================================================
   til.js — YOZUV TANLASH: LOTIN / KIRILL
   index.html <head> ichida eng birinchi ulanadi. Vault ichida: ildizda.
   ===================================================================================== */

/* Bu yerga:
   1) Tanlangan yozuvni aniqlash: index.html?yozuv=kiril havolasi yoki localStorage'dagi oldingi tanlov.
      Natija: <html data-script="latn"> yoki <html data-script="cyrl">.
   2) window.YOZUV = { boot() { ... } }
      boot() — <body> oxirida chaqiriladi:
        • sahifadagi lotin matnlarni kirillga o'giradi (kirill tanlangan bo'lsa);
        • kerakli savollar faylini yuklaydi: bundled-data.js + allquest.js  yoki  bundled-data-kiril.js + allquest-kiril.js;
        • sayt ichiga "Lotin | Кирилл" almashtirish tugmasini qo'shadi. */
