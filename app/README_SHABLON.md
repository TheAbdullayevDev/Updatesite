# SHABLON — fayllar tuzilishi va qaysi faylga nima yoziladi

Bu papka **ishlaydigan dastur emas**. Har bir fayl ichida faqat izoh bor: unga nima yoziladi va u nima bilan bog'langan.
Ishlaydigan asl fayllar `..\VAULT_UCHUN_SAYT\` va loyiha ildizida turadi.

To'liq kod faqat ikki faylda qoldirilgan:
- `update-client.js` — versiyani tekshirish va yangilash (GitHub yoki EXE vault).
- `auto-update.js` — avtomatik yangilash va Sozlamalardagi "Savollarni yangilash" / "Dasturni yangilash" kartalari.

## 1. Vault ichiga kiradigan fayllar (sayt papkasi)
EXE birinchi ochilganda shu tuzilishdagi papka tanlanadi va hammasi shifrlanadi.

| Fayl | Nima |
|---|---|
| `index.html` | Yagona sahifa: bo'limlar va skriptlar tartibi |
| `index-kiril.html` | `index.html?yozuv=kiril` ga yo'naltiradi |
| `style.css`, `dev-mode.css` | Ko'rinish |
| `til.js` | Lotin/kirill tanlash, kerakli savollar faylini yuklash |
| `app.js` | Asosiy mantiq: test, sahifalar, media |
| `topics.js` | Mavzular ro'yxati (`TOPIC_RULES`) |
| `translit.js` | Lotin → kirill o'giruvchi |
| `content-update.js` | Lokal yangilanish uchun joy (odatda bo'sh) |
| `update-client.js` | **To'liq kod** — yangilanish |
| `auto-update.js` | **To'liq kod** — avtomatik yangilash, kartalar |
| `dev-mode.js` | Dasturchi rejimi |
| `github-token.js` | Shifrlangan token (dastur yasaydi) |
| `bundled-data.js`, `bundled-data-kiril.js` | Shablon savollari — **SHART** |
| `allquest.js`, `allquest-kiril.js` | Umumiy savollar bazasi — **SHART** |
| `icon.ico` | Ikonka |
| `assets/rasmlar/` | Savol rasmlari (`1-1.jpg`) |
| `assets/shablonlar/videolar/` | Izoh videolari (`1_1.mov`) |
| `assets/template-icons/` | Shablon ikonkalari |

EXE ishga tushishi uchun vault ichida albatta bo'lishi kerak: `index.html`, `style.css`, `app.js`, `bundled-data.js`, `allquest.js`.

## 2. GitHub repo (`TheAbdullayevDev/Updatesite`) — `GITHUB_REPO_NAMUNA/`
| Yo'l | Nima | Kim yasaydi |
|---|---|---|
| `version.json` | Savollar versiyasi + har bir fayl xeshi (**hozirgi haqiqiy fayl**) | Dasturchi rejimi |
| `content-update.json` | Barcha savollar (namuna) | Dasturchi rejimi |
| `updates/media/` | Yangi rasm/videolar | Dasturchi rejimi |
| `app/` | Dastur kodi (imzolangan) | `SecureMediaVault.exe --publish-app` |

`version.json` har doim **eng oxirida** yangilanadi — kompyuterlar shu faylga qarab yangi versiyani ko'radi.
