# Фаза 15 — Аудит безпеки та оптимізація

Дата: 2026-06-27

## XSS

| Пункт | Статус | Деталі |
|-------|--------|--------|
| DOMPurify для HTML-контенту | ✅ | `sanitizeContent()` у `materials.js`; preload через `security.js` + `material-edit.js` |
| Екранування user data в шаблонах | ✅ | `escapeHtml()` у dashboard-сторінках, `modal.js`, `public.js` |
| URL-поля валідуються | ✅ | `isValidUrl()` / `new URL()` у `materials.js`, `material-edit.js`, `public.js` |
| Безпечні src зображень | ✅ | `isSafeMediaSrc()` у `public.js` |

## Auth

| Пункт | Статус | Деталі |
|-------|--------|--------|
| `/dashboard/**` перевіряє сесію | ✅ | `router.js` → `isAuthenticated()` |
| `/setup` лише при першому запуску | ✅ | `setupOnly` + `needsSetup` у router |
| Logout очищає session token | ✅ | `auth.js` → `sessionStorage` / `localStorage` |
| Logout очищає `window.__encKey` | ✅ | `db.setEncryptionKey(null)` |
| Stale session після refresh | ✅ | `repairStaleSession()` у `security.js`, виклик у router + `isAuthenticated()` |

## CSP (`netlify.toml`)

| Пункт | Статус | Деталі |
|-------|--------|--------|
| CSP заголовок | ✅ | `[[headers]]` для `/*` |
| CDN з явними схемами | ✅ | `https://cdn.tailwindcss.com`, `https://cdn.jsdelivr.net`, `https://fonts.googleapis.com`, `https://fonts.gstatic.com` |
| `frame-src` embed-платформи | ✅ | YouTube, Vimeo, TikTok, Telegram, Loom |
| `connect-src` Netlify API | ✅ | `https://api.netlify.com` |

## IndexedDB

| Пункт | Статус | Деталі |
|-------|--------|--------|
| Шифрування записів | ✅ | AES-GCM у `db.js` |
| Розшифрування лише з ключем | ✅ | `getEncKey()` перед `decryptData` |
| Без ключа — скидання сесії | ✅ | `repairStaleSession()` |

## Форми

| Пункт | Статус | Деталі |
|-------|--------|--------|
| Client-side валідація | ✅ | setup, login, material-edit, apply, user-create |
| Netlify honeypot | ✅ | `netlify-honeypot="bot-field"` у `pages/apply.html` |

## Оптимізація

| Пункт | Статус | Деталі |
|-------|--------|--------|
| Lazy loading зображень | ✅ | `loading="lazy"` у `public.js` (картки, галерея) |
| Particles + reduced motion | ✅ | ранній `return` у `particles.js`, контейнер приховано |
| IDB indexes (не getAll+filter) | ✅ | `getDeletedMaterials()` через index `deletedAt` |
| Fuse.js індекс один раз | ✅ | кеш `fuseIndex` у `search.js` |

## Фінальне тестування (ручний чеклист)

```
✅ Гість: лише дозволений контент
✅ Користувач без ролі: свої матеріали + закритий контент
✅ Редактор (кастомна роль): за permissions
✅ Адмін: повний доступ
✅ /setup: лише перший запуск
✅ /dashboard → /login без сесії
✅ Бекап export → import
✅ Пошук fuzzy по title/description/tags
✅ Mobile від 320px
✅ i18n UA/EN без reload
```

## Автотест

```bash
npm run dev
# інший термінал:
node scripts/test-phase15.mjs
```

## Готовність до деплою

- `netlify.toml`, `_redirects`, `robots.txt` — на місці
- Форма `account-request` для Netlify Forms
- CSP та security headers налаштовані

**Наступний крок:** деплой на Netlify (див. `Activation_Prompt_AI_Synergy.md`, розділ «ДЕПЛОЙ»).
