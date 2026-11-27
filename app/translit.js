/* =====================================================================================
   translit.js — O'ZBEK LOTIN → KIRILL AVTOMATIK O'GIRUVCHI
   Dasturchi rejimida lotin savol kiritilsa, kirill nusxasini shu fayl to'ldiradi. Vault ichida: ildizda.
   ===================================================================================== */

/* Bu yerga:
   window.UZ_TRANSLIT = {
     toCyrillic(matn),           // bitta matnni o'giradi
     setUserDict(lug'at),        // dasturchi o'rgatgan so'zlar (istisnolar)
     fillPayload(payload)        // savollar paketidagi kirill nusxasi yo'q/bo'sh joylarni lotindan to'ldiradi
   };
   Ichida: harf qoidalari (sh→ш, ch→ч, o'→ў, g'→ғ, ye→е ...) va istisno so'zlar ro'yxati (EXCEPTIONS).
   Node'da ham ishlashi uchun oxirida: if (typeof module !== 'undefined') module.exports = ...; */
