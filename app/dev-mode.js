/* =====================================================================================
   dev-mode.js — DASTURCHI REJIMI (savollarni dastur ichida tahrirlash va GitHub'ga joylash)
   Sozlamalar → "Dasturchi rejimi" (login/parol bilan). Vault ichida: ildizda.
   ===================================================================================== */

/* 1. KIRISH — dasturchi login/paroli tekshiruvi, rejimni yoqish/o'chirish (window.DEV_MODE.isOn()). */

/* 2. TAHRIRLASH — savol matni, variantlar, to'g'ri javob, rasm/video almashtirish (lotin va kirill),
      yangi savol qo'shish, "bir xil savollarni ham yangilash". Kirill bo'sh bo'lsa — translit.js to'ldiradi. */

/* 3. SAQLASH — versiyani oshirish (1.0.20 → 1.0.21), paket yasash:
      content-update.json (barcha savollar) + updates/media/* (yangi media) + version.json (xeshlar).
      Saqlashdan oldin GitHub'dagi versiya tekshiriladi — boshqa kompyuter o'zgarishi ustidan yozmaslik uchun.
      EXE ichida: GitHub'dan kelgan media vault ichidan (fetch) o'qiladi. */

/* 4. GITHUB'GA JOYLASH — github-token.js dagi shifrlangan token (dasturchi paroli bilan ochiladi),
      hamma fayl bitta commit bo'lib api.github.com orqali yuboriladi; version.json eng oxirida. */
