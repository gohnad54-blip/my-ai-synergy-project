# Activation Prompt: AI Synergy Archive
**Для:** Cursor IDE | **Режим:** Agent | **Мова коду:** English | **Коментарі:** Ukrainian

---

## СИСТЕМНА ІНСТРУКЦІЯ ДЛЯ CURSOR

Ти — Senior Full-Stack Developer. Твоє завдання — побудувати сайт-архів клубу AI Synergy згідно з ТЗ нижче. Працюй СУВОРО по фазах. Не переходь до наступної фази без явної команди користувача «Фаза N — старт».

**Критичні правила:**
- Жодних фреймворків (React, Vue, Angular) — тільки Vanilla JS ES2022 з `type="module"`
- Жодного bundler (Webpack, Vite) — файли підключаються напряму через `<script type="module">`
- Tailwind CSS — через CDN Play (`<script src="https://cdn.tailwindcss.com">`)
- Всі бібліотеки — через CDN (jsDelivr або unpkg)
- Зберігання даних — виключно IndexedDB (через бібліотеку `idb`) + localStorage для сесій
- Після кожної фази — звіт: що створено, що працює, що буде в наступній фазі

---

## ФАЗА 1 — Файлова структура та конфігурація

**Команда старту:** «Фаза 1 — старт»

**Завдання:** Створи повну файлову структуру проєкту з порожніми файлами-заглушками та робочими конфігами.

**Створи таку структуру:**
```
ai-synergy-archive/
├── index.html
├── netlify.toml
├── _redirects
├── robots.txt
├── pages/
│   ├── home.html
│   ├── catalog.html
│   ├── material.html
│   ├── about.html
│   ├── login.html
│   ├── apply.html
│   ├── setup.html
│   └── dashboard/
│       ├── index.html
│       ├── materials.html
│       ├── material-edit.html
│       ├── users.html
│       ├── user-create.html
│       ├── roles.html
│       ├── categories.html
│       ├── requests.html
│       ├── trash.html
│       ├── log.html
│       └── settings.html
├── js/
│   ├── core/
│   │   ├── router.js
│   │   ├── auth.js
│   │   ├── crypto.js
│   │   ├── db.js
│   │   └── i18n.js
│   ├── modules/
│   │   ├── materials.js
│   │   ├── users.js
│   │   ├── roles.js
│   │   ├── categories.js
│   │   ├── visibility.js
│   │   ├── search.js
│   │   ├── log.js
│   │   ├── backup.js
│   │   └── requests.js
│   ├── ui/
│   │   ├── particles.js
│   │   ├── animations.js
│   │   ├── toast.js
│   │   ├── modal.js
│   │   └── components.js
│   └── pages/
│       ├── home.js
│       ├── catalog.js
│       ├── material.js
│       ├── login.js
│       ├── setup.js
│       └── dashboard/
│           ├── index.js
│           ├── materials.js
│           ├── material-edit.js
│           ├── users.js
│           ├── user-create.js
│           ├── roles.js
│           ├── categories.js
│           ├── requests.js
│           ├── trash.js
│           ├── log.js
│           └── settings.js
├── css/
│   ├── main.css
│   ├── particles.css
│   └── animations.css
├── locales/
│   ├── uk.json
│   └── en.json
├── assets/
│   ├── icons/
│   └── logo.svg
└── config/
    └── init.js
```

**Наповнення конфігів (не заглушки — реальний вміст):**

`netlify.toml`:
```toml
[build]
  publish = "."

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'; script-src 'self' cdn.tailwindcss.com cdn.jsdelivr.net unpkg.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src 'self' fonts.gstatic.com; frame-src youtube.com www.youtube.com www.youtube-nocookie.com vimeo.com player.vimeo.com tiktok.com www.tiktok.com t.me loom.com www.loom.com; img-src 'self' data: blob:; connect-src 'self'"
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

`_redirects`:
```
/*  /index.html  200
```

`robots.txt`:
```
User-agent: *
Allow: /
Disallow: /pages/dashboard/
Disallow: /pages/setup.html

Sitemap: https://YOUR_DOMAIN/sitemap.xml
```

**`index.html` — точка входу (роутер):**
```html
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Synergy — Архів клубу</title>
  <meta name="description" content="Архів матеріалів клубу AI Synergy">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/main.css">
  <link rel="stylesheet" href="/css/particles.css">
  <link rel="stylesheet" href="/css/animations.css">
</head>
<body class="bg-space-void text-starfield-white min-h-screen">
  <div id="particles-bg"></div>
  <div id="app"></div>
  <script type="module" src="/js/core/router.js"></script>
</body>
</html>
```

**`css/main.css` — CSS змінні та Tailwind конфіг:**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --space-void: #050510;
  --nebula-deep: #0d0d2b;
  --synapse-blue: #3b82f6;
  --pulse-violet: #7c3aed;
  --neural-glow: #a78bfa;
  --starfield-white: #e2e8f0;
  --dim-text: #94a3b8;
  --border-glow: rgba(124, 58, 237, 0.3);
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;
}

/* Tailwind custom theme через CDN Play */
/* Додай в index.html після <script src="cdn.tailwindcss.com">: */
/*
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          'space-void': '#050510',
          'nebula-deep': '#0d0d2b',
          'synapse-blue': '#3b82f6',
          'pulse-violet': '#7c3aed',
          'neural-glow': '#a78bfa',
          'starfield-white': '#e2e8f0',
          'dim-text': '#94a3b8',
        },
        fontFamily: {
          'display': ['Orbitron', 'sans-serif'],
          'body': ['Inter', 'sans-serif'],
          'mono': ['JetBrains Mono', 'monospace'],
        }
      }
    }
  }
</script>
*/

body {
  font-family: 'Inter', sans-serif;
  background-color: var(--space-void);
  color: var(--starfield-white);
}

h1, h2, h3 {
  font-family: 'Orbitron', sans-serif;
}

code, .mono {
  font-family: 'JetBrains Mono', monospace;
}
```

**`locales/uk.json` — базова структура (заповни ключами):**
```json
{
  "nav.home": "Головна",
  "nav.materials": "Матеріали",
  "nav.about": "Про клуб",
  "nav.login": "Увійти",
  "nav.logout": "Вийти",
  "nav.apply": "Подати заявку",
  "material.readMore": "Читати далі",
  "material.draft": "Чернетка",
  "material.published": "Опублікований",
  "material.types.article": "Стаття",
  "material.types.video": "Відео",
  "material.types.pdf": "PDF",
  "material.types.link": "Посилання",
  "material.types.image": "Зображення",
  "material.types.combined": "Комбінований",
  "dashboard.title": "Панель управління",
  "dashboard.materials": "Матеріали",
  "dashboard.users": "Користувачі",
  "dashboard.roles": "Ролі",
  "dashboard.categories": "Категорії",
  "dashboard.requests": "Заявки",
  "dashboard.trash": "Кошик",
  "dashboard.log": "Журнал дій",
  "dashboard.settings": "Налаштування",
  "auth.login": "Увійти",
  "auth.password": "Пароль",
  "auth.username": "Логін",
  "auth.logout": "Вийти",
  "actions.save": "Зберегти",
  "actions.cancel": "Скасувати",
  "actions.delete": "Видалити",
  "actions.restore": "Відновити",
  "actions.edit": "Редагувати",
  "actions.create": "Створити",
  "actions.publish": "Опублікувати",
  "actions.unpublish": "Зняти з публікації",
  "errors.notFound": "Сторінку не знайдено",
  "errors.forbidden": "Доступ заборонено",
  "errors.general": "Щось пішло не так"
}
```

**`locales/en.json`** — дзеркальна структура з англійськими значеннями.

**Очікуваний результат фази 1:**
- Повна структура папок і файлів створена
- Конфіги netlify.toml, _redirects, robots.txt — робочі
- index.html відкривається в браузері (порожній екран з темним фоном — норма)
- Шрифти завантажуються (перевір у DevTools → Network)

---

## ФАЗА 2 — Ядро: IndexedDB + Шифрування

**Команда старту:** «Фаза 2 — старт»

**Завдання:** Реалізуй два критичних core-модулі: база даних та криптографія.

### `js/core/crypto.js`
```javascript
// Повна реалізація з Web Crypto API:

// 1. hashPassword(password, salt?) → { hash, salt }
//    - Алгоритм: PBKDF2-SHA256, 310000 ітерацій
//    - Якщо salt не передано — генерує crypto.getRandomValues(32 bytes)
//    - Повертає base64-encoded hash та salt

// 2. verifyPassword(password, hash, salt) → boolean
//    - Перевіряє пароль проти збереженого хешу

// 3. deriveEncryptionKey(password, salt) → CryptoKey
//    - Деривує AES-GCM-256 ключ з пароля через PBKDF2
//    - Використовується для шифрування IndexedDB

// 4. encryptData(data, key) → { ciphertext, iv }
//    - AES-GCM-256, генерує унікальний IV для кожного запису
//    - data: будь-який об'єкт (серіалізується через JSON.stringify)

// 5. decryptData(ciphertext, iv, key) → object
//    - Розшифровує та парсить JSON

// 6. generateId(prefix) → string
//    - Генерує nanoid-подібний ID: `${prefix}_${randomBase62(12)}`
//    - Наприклад: generateId('usr') → 'usr_a7Kp2mNx8qRt'
```

### `js/core/db.js`
```javascript
// IndexedDB через бібліотеку idb (CDN: https://cdn.jsdelivr.net/npm/idb@8/build/umd.js)

// Stores (object stores) та їх схема:
const DB_NAME = 'ai-synergy-db';
const DB_VERSION = 1;

// Stores:
// - 'users'      keyPath: 'id'  indexes: ['login']
// - 'roles'      keyPath: 'id'
// - 'materials'  keyPath: 'id'  indexes: ['categoryId', 'status', 'deletedAt']
// - 'categories' keyPath: 'id'  indexes: ['parentId']
// - 'tags'       keyPath: 'id'  indexes: ['name']
// - 'actionLog'  keyPath: 'id'  indexes: ['actorId', 'timestamp']
// - 'settings'   keyPath: 'key'
// - 'accessRequests' keyPath: 'id' indexes: ['status']

// Публічний API модуля:
// db.get(store, id) → object | null
// db.getAll(store, indexName?, query?) → array
// db.put(store, object) → id
// db.delete(store, id) → void
// db.getByIndex(store, indexName, value) → array
// db.clear(store) → void (для import/backup)

// ВАЖЛИВО: всі дані зберігаються у зашифрованому вигляді
// Ключ шифрування зберігається в пам'яті (window.__encKey) — зникає при refresh
// При кожному вході в систему ключ деривується заново з пароля
```

### `config/init.js`
```javascript
// Ініціалізація системи при першому запуску:
// 1. Перевіряє чи існує запис адміна в store 'users'
// 2. Якщо ні — встановлює прапор window.__needsSetup = true
// 3. Router перенаправляє на /setup якщо __needsSetup === true
// 4. Після завершення setup — прапор знімається назавжди (settings: {key: 'initialized', value: true})
```

**Очікуваний результат фази 2:**
- `crypto.js` експортує 6 функцій, всі тестуються через консоль браузера
- `db.js` підключає IndexedDB, всі stores створюються при першому відкритті
- Тест у консолі: `const {hashPassword} = await import('/js/core/crypto.js'); console.log(await hashPassword('test123'))` — повертає об'єкт з hash і salt

---

## ФАЗА 3 — Авторизація та роутер

**Команда старту:** «Фаза 3 — старт»

**Завдання:** Клієнтський роутер + повна система авторизації.

### `js/core/router.js`
```javascript
// SPA роутер без залежностей:

// Таблиця маршрутів:
const routes = {
  '/':                    { page: 'home',              auth: false },
  '/materials':           { page: 'catalog',           auth: false },
  '/materials/:id':       { page: 'material',          auth: false },
  '/about':               { page: 'about',             auth: false },
  '/login':               { page: 'login',             auth: false },
  '/apply':               { page: 'apply',             auth: false },
  '/setup':               { page: 'setup',             auth: false, setupOnly: true },
  '/dashboard':           { page: 'dashboard/index',   auth: true,  permission: null },
  '/dashboard/materials': { page: 'dashboard/materials', auth: true, permission: 'content.create' },
  '/dashboard/material-edit/:id?': { page: 'dashboard/material-edit', auth: true, permission: 'content.create' },
  '/dashboard/users':     { page: 'dashboard/users',   auth: true,  permission: 'users.view' },
  '/dashboard/user-create': { page: 'dashboard/user-create', auth: true, permission: 'users.create' },
  '/dashboard/roles':     { page: 'dashboard/roles',   auth: true,  adminOnly: true },
  '/dashboard/categories':{ page: 'dashboard/categories', auth: true, permission: 'taxonomy.create' },
  '/dashboard/requests':  { page: 'dashboard/requests', auth: true, permission: 'requests.view' },
  '/dashboard/trash':     { page: 'dashboard/trash',   auth: true,  permission: 'content.delete.soft' },
  '/dashboard/log':       { page: 'dashboard/log',     auth: true,  adminOnly: true },
  '/dashboard/settings':  { page: 'dashboard/settings', auth: true,  adminOnly: true },
};

// Логіка роутера:
// 1. Слухає popstate + перехоплює кліки на <a href="...">
// 2. Для кожного маршруту: перевіряє auth → permission → завантажує HTML сторінки fetch()
// 3. Вставляє HTML у #app
// 4. Імпортує та виконує відповідний page-controller з /js/pages/
// 5. Редіректи: /setup якщо !initialized; /login якщо !auth; /403 якщо !permission
```

### `js/core/auth.js`
```javascript
// Публічний API:

// login(login, password) → { success, user, error }
//   - Знаходить user за login в IndexedDB
//   - verifyPassword() → якщо ок: деривує encKey, зберігає в window.__encKey
//   - Створює session token: crypto.getRandomValues(64 bytes) → base64
//   - Зберігає сесію в sessionStorage (або localStorage якщо rememberMe)
//   - Логує дію в actionLog

// logout() → void
//   - Очищає sessionStorage/localStorage
//   - window.__encKey = null
//   - navigate('/')

// getSession() → { userId, role, permissions, expiresAt } | null
//   - Читає та валідує токен з storage
//   - Перевіряє expiresAt

// hasPermission(permission) → boolean
//   - Перевіряє session.permissions.includes(permission) || isAdmin()

// isAdmin() → boolean

// requireAuth(permission?) → перенаправляє якщо немає доступу
```

**Очікуваний результат фази 3:**
- Навігація між публічними сторінками працює без перезавантаження
- `/dashboard` перенаправляє на `/login` якщо немає сесії
- `/setup` доступна лише якщо `!initialized`

---

## ФАЗА 4 — Setup сторінка (перший запуск)

**Команда старту:** «Фаза 4 — старт»

**Завдання:** Сторінка першого запуску — створення адмін-акаунту.

**`pages/setup.html` + `js/pages/setup.js`:**

UI-flow:
```
[Логотип AI Synergy]

Ласкаво просимо до налаштування архіву

Крок 1 з 1: Створення адміністратора

[Логін адміна        ]  ← латиниця, мін. 4 символи
[Ім'я для відображення]
[Пароль              ]  ← мін. 8 символів, показати/приховати
[Підтвердити пароль  ]

[  Створити архів  ]  ← кнопка

⚠ Збережіть логін та пароль в надійному місці.
  Відновлення доступу без них неможливе.
```

Логіка:
1. Валідація форми (client-side)
2. `hashPassword(password)` → зберігає user в IndexedDB з `role: 'admin'`
3. `settings.put({ key: 'initialized', value: true })`
4. Автоматичний вхід → redirect на `/dashboard`
5. Після ініціалізації — `/setup` завжди редіректить на `/`

**Очікуваний результат фази 4:**
- При першому відкритті сайту → `/setup`
- Після заповнення форми → адмін-акаунт створено → вхід в dashboard
- При повторному відкритті `/setup` → redirect на `/`

---

## ФАЗА 5 — Dashboard shell та sidebar

**Команда старту:** «Фаза 5 — старт»

**Завдання:** Загальна оболонка адмін-панелі з навігацією.

**Layout структура dashboard:**
```
┌──────────────────────────────────────────────────┐
│  SIDEBAR (260px, фіксований)  │  MAIN CONTENT    │
│                               │                  │
│  [🔮 AI Synergy]              │  <router-outlet> │
│  ─────────────                │                  │
│  📊 Dashboard                 │                  │
│  📁 Матеріали                 │                  │
│    ├ Всі матеріали            │                  │
│    ├ Мої матеріали            │                  │
│    └ 🗑 Кошик                 │                  │
│  🏷️ Категорії  [якщо право]   │                  │
│  👥 Користувачі [якщо право]  │                  │
│  📋 Заявки [якщо право]       │                  │
│  📜 Журнал [тільки адмін]     │                  │
│  ⚙️ Налаштування [тільки адмін]│                 │
│  ─────────────                │                  │
│  [Avatar] Ім'я користувача    │                  │
│  [Вийти]                      │                  │
└──────────────────────────────────────────────────┘
```

**Правила sidebar:**
- Пункти відображаються лише якщо є відповідне повноваження (перевірка через `hasPermission()`)
- Активний пункт підсвічується `neural-glow` кольором
- Mobile: sidebar ховається, з'являється кнопка-гамбургер → overlay

**Dashboard головна (`/dashboard`):**
```
┌─────────────────────────────────────────────────┐
│  Вітаємо, [Ім'я]!                               │
├──────────┬──────────┬──────────┬────────────────┤
│ [N]      │ [N]      │ [N]      │ [N]            │
│Матеріалів│Користув. │Заявок    │У кошику        │
├──────────┴──────────┴──────────┴────────────────┤
│  Останні дії (журнал, 5 записів)                │
├─────────────────────────────────────────────────┤
│  Нові заявки на акаунт (якщо є)                 │
└─────────────────────────────────────────────────┘
```

**Очікуваний результат фази 5:**
- Dashboard відкривається після логіну
- Sidebar показує лише дозволені пункти
- Stats-картки показують реальні числа з IndexedDB
- Mobile: гамбургер-меню працює

---

## ФАЗА 6 — Система ролей та конструктор акаунтів

**Команда старту:** «Фаза 6 — старт»

**Завдання:** Два модулі: управління ролями + створення/редагування користувачів.

### Сторінка ролей (`/dashboard/roles`) — тільки адмін

**UI:**
```
[+ Створити роль]

┌─────────────────────────────────────────────────┐
│ Назва ролі: [Редактор          ]                │
│                                                 │
│ КОНТЕНТ:                                        │
│ ☑ Перегляд закритого контенту                  │
│ ☑ Створення матеріалів                         │
│ ☐ Редагування будь-яких матеріалів             │
│ ☑ Видалення в кошик                            │
│ ☑ Публікація матеріалів                        │
│ ☐ Управління видимістю                         │
│                                                 │
│ ТАКСОНОМІЯ:                                     │
│ ☐ Створення категорій/тегів                    │
│ ☐ Редагування категорій/тегів                  │
│ ☐ Видалення категорій/тегів                    │
│                                                 │
│ КОРИСТУВАЧІ:                                    │
│ ☐ Перегляд списку користувачів                 │
│ ☐ Створення акаунтів                           │
│ ☐ Редагування акаунтів                         │
│ ☐ Призначення ролей                            │
│                                                 │
│ ЗАЯВКИ:                                         │
│ ☐ Перегляд заявок                              │
│ ☐ Обробка заявок                               │
│                                                 │
│ СИСТЕМА:                                        │
│ ☐ Експорт бекапу                               │
│ ☐ Імпорт бекапу                                │
│                                                 │
│ [Зберегти роль]  [Видалити роль]               │
└─────────────────────────────────────────────────┘
```

**Заблоковані повноваження** (сірі, з tooltip «Лише адмін»):
`users.create`, `users.edit`, `users.assign_role`, `roles.manage`, `log.view`, `backup.import`

### Конструктор акаунтів (`/dashboard/user-create`)

**UI форми:**
```
[Логін               ]  ← унікальний, латиниця+цифри
[Ім'я для відображення]
[Пароль              ]  ← адмін задає вручну
[Підтвердити пароль  ]
[Роль: dropdown      ]  ← список кастомних ролей
[Дозвіл зміни пароля: ○ Ніколи  ○ Одноразово  ○ Завжди]
[Нотатка (лише для адміна)...]

[  Створити акаунт  ]
```

**Після успішного створення — екран з даними:**
```
┌─────────────────────────────────┐
│  ✅ Акаунт створено             │
│                                 │
│  Логін:   username_here         │
│  Пароль:  ••••••••  [👁 показати]│
│                                 │
│  [📋 Скопіювати дані]           │
│                                 │
│  ⚠ Після закриття цього вікна  │
│  пароль більше не відображатиметься │
│                                 │
│  [Закрити]  [Створити ще одного]│
└─────────────────────────────────┘
```

### Список користувачів (`/dashboard/users`)

**Таблиця:**
- Колонки: Ім'я / Логін / Роль / Статус / Дата створення / Дії
- Дії: Редагувати / Змінити пароль / Деактивувати

**Очікуваний результат фази 6:**
- Адмін може створювати/редагувати/деактивувати ролі
- Адмін може створювати акаунти з повним набором налаштувань
- Екран з паролем показується один раз після створення

---

## ФАЗА 7 — CMS: редактор матеріалів

**Команда старту:** «Фаза 7 — старт»

**Завдання:** Повнофункціональний редактор матеріалів з підтримкою всіх типів контенту.

**Бібліотеки для підключення через CDN:**
- Quill.js (rich text): `https://cdn.jsdelivr.net/npm/quill@2/dist/quill.js`
- DOMPurify (XSS): `https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js`

**Структура редактора (`/dashboard/material-edit`):**

```
[←] [Назва матеріалу (обов'язкова)              ]

МЕТА:
[Короткий опис для каталогу (до 500 символів)   ]
[Категорія: dropdown]  [Статус: Чернетка ▼]

ТЕГИ:
[тег1 ×] [тег2 ×] [+ додати тег]

ОСНОВНИЙ ВМІСТ:
┌─ Quill Editor ──────────────────────────────┐
│ [H1][H2][H3][B][I][list][code][link][quote] │
│                                              │
│  (rich text редактор)                        │
│                                              │
└──────────────────────────────────────────────┘

МЕДІА:
[Зображення] [Відео] [PDF] [Посилання]  ← вкладки

  Зображення:
  [drag & drop зона — до 5 файлів, 2MB кожен]
  [превью завантажених зображень з кнопкою ×]

  Відео:
  [URL відео (YouTube/Vimeo/TikTok/Telegram/Loom)]
  [+ Додати ще відео]
  [превью embed після вставки URL]

  PDF:
  ○ Завантажити файл  ○ Вставити посилання
  [якщо файл: drag & drop зона, до 20MB]
  [якщо посилання: поле URL]

  Посилання:
  [URL] [Підпис]  [+ Додати]
  [список доданих посилань]

ВИДИМІСТЬ:
☐ Відкрити для гостей
☐ Доступний для всіх авторизованих користувачів
[Конкретні користувачі: мультиселект]

[Зберегти чернетку]  [Опублікувати]
```

**Логіка збереження:**
- Автозбереження чернетки кожні 60 секунд в localStorage (тимчасово)
- При ручному збереженні — запис в IndexedDB (зашифровано)
- Зображення: FileReader → base64 → IndexedDB
- PDF файл: FileReader → base64 → IndexedDB
- Валідація розміру до запису

**Очікуваний результат фази 7:**
- Редактор відкривається для створення (новий матеріал) та редагування (існуючий)
- Всі типи медіа завантажуються та зберігаються
- Автозбереження працює
- Матеріал зберігається в IndexedDB

---

## ФАЗА 8 — Система видимості контенту

**Команда старту:** «Фаза 8 — старт»

**Завдання:** Реалізувати `js/modules/visibility.js` — центральний алгоритм доступу.

```javascript
// js/modules/visibility.js

// canAccess(material, session) → boolean
// Алгоритм (суворо по порядку):
// 1. material.deletedAt !== null → false (крім адміна)
// 2. material.status === 'draft' && session?.userId !== material.authorId && !isAdmin(session) → false
// 3. isAdmin(session) → true
// 4. material.visibility.specificUsers.includes(session?.userId) → true
// 5. hasPermission(session, 'content.view.restricted') → true
// 6. material.visibility.guestAccess === true → true (навіть без session)
// 7. → false

// getVisibleMaterials(allMaterials, session) → filteredArray
// Застосовує canAccess до кожного матеріалу

// canAccessCategory(category, session) → boolean
// Аналогічно для категорій (для sidebar фільтрів)
```

**UI управління видимістю в адмін-панелі:**

Сторінка матеріалів (`/dashboard/materials`):
- Колонка «Видимість»: іконки 🌐 (гості) / 👤 (авторизовані) / 🔒 (обмежений)
- Quick-toggle: клік на іконку → зміна без відкриття редактора

Категорії (`/dashboard/categories`):
- Перемикач «Відкрити категорію для гостей» на кожній картці категорії

**Очікуваний результат фази 8:**
- Гість бачить лише матеріали з `guestAccess: true`
- Авторизований без спеціальних прав — лише `guestAccess: true` + `specificUsers` де є його id
- Авторизований з `content.view.restricted` — все крім draft чужих
- Адмін — абсолютно все включно з кошиком та чернетками

---

## ФАЗА 9 — Публічна частина сайту

**Команда старту:** «Фаза 9 — старт»

**Завдання:** Головна сторінка, каталог, сторінка матеріалу, сторінка «Про клуб».

### Головна сторінка (`/`)

```
[HEADER: лого | nav | UA/EN | Увійти]

HERO:
  [Велике неонове слово: AI SYNERGY]
  [Підзаголовок: Архів знань клубу]
  [CTA: → Переглянути матеріали]

СЕКЦІЯ: Останні матеріали (3-6 карток, лише публічні)
  [Картка] [Картка] [Картка]
  [→ Переглянути всі матеріали]

СЕКЦІЯ: Про клуб
  [Текст із settings 'about_text']
  [→ Детальніше]

[FOOTER: © AI Synergy | Вхід]
```

### Каталог (`/materials`)

```
[HEADER]

[🔍 Пошук матеріалів...                    ]

┌─ Фільтри ──┐  ┌─ Результати ──────────────────┐
│ Категорії  │  │ Сортування: [Новіші ▼]        │
│ ○ Всі      │  │ Знайдено: N матеріалів        │
│ ○ Кат. 1   │  │                               │
│ ○ Кат. 2   │  │ [Картка] [Картка] [Картка]   │
│            │  │ [Картка] [Картка] [Картка]   │
│ Теги:      │  │ [Картка] [Картка] [Картка]   │
│ [тег][тег] │  │                               │
│            │  │ [← 1 2 3 →] ← пагінація      │
│ Тип:       │  │                               │
│ ☐ Статті   │  └───────────────────────────────┘
│ ☐ Відео    │
│ ☐ PDF      │
│ ☐ Посилання│
└────────────┘
```

### Сторінка матеріалу (`/materials/:id`)

```
[HEADER]

[Категорія > Назва]  ← breadcrumb

# Заголовок матеріалу

[Автор: Ім'я]  [Дата]  [тег1][тег2]

[Основний вміст (sanitized HTML)]

[Галерея зображень — якщо є]
[Embed відео — якщо є]
[PDF viewer / посилання — якщо є]
[Зовнішні посилання — якщо є]

[← Назад до каталогу]
[Редагувати — якщо є право]
```

**SEO для сторінки матеріалу:**
```html
<title>{material.title} | AI Synergy</title>
<meta name="description" content="{material.description}">
<meta property="og:title" content="{material.title}">
<meta property="og:description" content="{material.description}">
<meta property="og:image" content="{firstImage або default}">
```

**Очікуваний результат фази 9:**
- Публічний відвідувач бачить лише дозволений контент
- Пошук, фільтри, пагінація працюють
- SEO мета-теги динамічно оновлюються

---

## ФАЗА 10 — Пошук та фільтрація

**Команда старту:** «Фаза 10 — старт»

**Завдання:** Реалізувати `js/modules/search.js` на базі Fuse.js.

```javascript
// CDN: https://cdn.jsdelivr.net/npm/fuse.js@7/dist/fuse.min.js

// Конфіг Fuse:
const fuseOptions = {
  keys: [
    { name: 'title', weight: 0.5 },
    { name: 'description', weight: 0.3 },
    { name: 'tags', weight: 0.2 }
  ],
  threshold: 0.3,         // чутливість fuzzy (0 = точний збіг, 1 = будь-що)
  includeMatches: true,   // для підсвічування збігів
  minMatchCharLength: 2
};

// search(query, materials) → rankedResults
// Застосовує фільтр видимості ДО передачі в Fuse

// highlightMatches(text, matches) → HTML з <mark> тегами
// Підсвічує знайдені збіги в результатах
```

**UI поведінка пошуку:**
- Debounce 300ms (не пошук при кожному символі)
- При порожньому запиті — показати всі доступні матеріали
- При 0 результатах: «Нічого не знайдено за запитом "..."»
- Підсвічування збігів у назві та описі в результатах

**Очікуваний результат фази 10:**
- Пошук по title + description + tags працює з fuzzy-matching
- Збіги підсвічуються в картках
- Фільтри за категорією + тегами + типом поєднуються з пошуком

---

## ФАЗА 11 — UI: анімації, частинки, адаптивність

**Команда старту:** «Фаза 11 — старт»

**Завдання:** Візуальна оболонка — фоновий ефект, анімації, мобільна адаптація.

**Бібліотеки:**
- tsParticles: `https://cdn.jsdelivr.net/npm/tsparticles@2/tsparticles.bundle.min.js`
- GSAP: `https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js`

### Конфіг tsParticles (`js/ui/particles.js`)
```javascript
// Налаштування:
// - Кількість частинок: 80
// - Кольори: ['#3b82f6', '#7c3aed', '#a78bfa', '#ffffff']
// - Розмір: 1-3px, random
// - Прозорість: 0.3-0.8, random з анімацією пульсування
// - Рух: повільний дрейф (speed: 0.5), без відштовхування
// - Лінії між частинками: увімкнені, колір #7c3aed, opacity 0.15, відстань 120px
// - Інтерактивність: при наведенні мишею — attraction (частинки тягнуться до курсора)
// - На mobile: кількість знижується до 40, лінії вимкнені (performance)
// - Поважає prefers-reduced-motion: якщо true → частинки статичні
```

### GSAP анімації (`js/ui/animations.js`)
```javascript
// pageEnter(element) — анімація появи сторінки:
//   element: opacity 0→1, y: 20→0, duration: 0.4s, ease: 'power2.out'

// staggerCards(cards) — послідовна поява карток:
//   gsap.from(cards, { opacity: 0, y: 30, stagger: 0.06, duration: 0.4 })

// cardHover — CSS через Tailwind (hover:shadow-[0_0_20px_rgba(124,58,237,0.4)] hover:-translate-y-1 transition-all duration-200)

// buttonPulse — CSS glow на кнопках CTA

// Sidebar transition (mobile): slideIn/slideOut, duration: 0.3s
```

### Адаптивність — breakpoints:
```
Mobile  (<640px):  1 колонка, sidebar → overlay, фільтри → collapsible accordion
Tablet  (640-1024px): 2 колонки, sidebar → toggle
Desktop (>1024px): 3 колонки, sidebar постійний
```

**Очікуваний результат фази 11:**
- Фонова анімація частинок на всіх сторінках
- Page transitions при навігації
- Картки з hover-ефектами
- Повна адаптивність від 320px

---

## ФАЗА 12 — Мультимовність (i18n)

**Команда старту:** «Фаза 12 — старт»

**Завдання:** Система перекладів UA/EN з перемикачем у хедері.

**`js/core/i18n.js`:**
```javascript
// Публічний API:
// i18n.setLocale(locale) — зберігає в localStorage, перерендерить
// i18n.t(key, params?) — повертає перекладений рядок
//   приклад: i18n.t('material.count', { n: 42 }) → '42 матеріали'
// i18n.getLocale() → 'uk' | 'en'

// Застосування в HTML через data-атрибути:
// <span data-i18n="nav.home"></span>
// i18n.applyToDOM() — проходить всі [data-i18n] та замінює textContent

// При перемиканні мови:
// 1. Зберегти в localStorage
// 2. i18n.applyToDOM() — оновити всі елементи без перезавантаження
```

**UI перемикача:**
```html
<!-- В хедері -->
<button data-lang="uk" class="...">UA</button>
<span class="text-dim-text">|</span>
<button data-lang="en" class="...">EN</button>
```

**Очікуваний результат фази 12:**
- Перемикач UA/EN в хедері працює
- Весь статичний текст інтерфейсу перемикається без перезавантаження
- Вибір мови зберігається між сесіями

---

## ФАЗА 13 — Журнал дій та кошик

**Команда старту:** «Фаза 13 — старт»

**Завдання:** Журнал дій (лише адмін) + кошик з можливістю відновлення.

### Журнал дій (`/dashboard/log`)

**Що логується** (через `js/modules/log.js`):
```javascript
// logAction(action, targetId, targetTitle, details)
// Викликається автоматично при:
// - Вхід/вихід з системи
// - Створення/редагування/видалення матеріалу
// - Публікація/зняття з публікації
// - Зміна видимості матеріалу
// - Створення/редагування/деактивація користувача
// - Зміна ролі користувача
// - Схвалення/відхилення заявки
// - Експорт/імпорт бекапу
// - Відновлення з кошика
// - Hard delete
```

**UI журналу:**
```
[Фільтр: всі дії ▼]  [Фільтр: всі користувачі ▼]  [Дата від] [Дата до]

┌─────────────────────────────────────────────────────┐
│ 14:32  Іван (Адмін)  Створив матеріал  "Назва"      │
│ 14:15  Петро         Опублікував       "Назва 2"     │
│ 13:50  Іван (Адмін)  Змінив видимість  "Назва"      │
│ ...                                                  │
└─────────────────────────────────────────────────────┘

[Завантажити журнал як CSV]
```

### Кошик (`/dashboard/trash`)

```
[Очистити кошик] ← hard delete всього (підтвердження)

┌─────────────────────────────────────────────────────┐
│ [Назва матеріалу]  Видалив: Іван  Дата: 01.01.2025 │
│ [Відновити]  [Видалити назавжди]                    │
├─────────────────────────────────────────────────────┤
│ [Назва матеріалу 2]  ...                            │
└─────────────────────────────────────────────────────┘
```

**Очікуваний результат фази 13:**
- Журнал показує хронологічний лог всіх дій
- Фільтрація журналу за типом дії та користувачем
- Кошик показує видалені матеріали з можливістю відновлення та hard delete

---

## ФАЗА 14 — Бекап, заявки, Netlify Forms

**Команда старту:** «Фаза 14 — старт»

**Завдання:** JSON бекап/імпорт + інтеграція заявок на акаунт.

### Бекап (`js/modules/backup.js`)

```javascript
// exportBackup() → JSON файл
// Збирає: users, roles, materials, categories, tags, settings, accessRequests
// НЕ включає: actionLog (великий розмір), зашифровані ключі
// Шифрує весь бекап AES-GCM ключем адміна
// Завантажує як: ai-synergy-backup-YYYY-MM-DD.json

// importBackup(file) → void
// 1. Показує modal з попередженням: «Імпорт замінить ВСІ поточні дані. Продовжити?»
// 2. Розшифровує файл
// 3. Валідує схему
// 4. Очищає всі stores
// 5. Записує нові дані
// 6. Логує дію в actionLog
```

**UI в налаштуваннях:**
```
БЕКАП ДАНИХ:
[📥 Експортувати бекап]  Останній бекап: ніколи

ВІДНОВЛЕННЯ:
[📤 Імпортувати бекап]  ⚠ Замінить всі поточні дані
```

### Netlify Forms — заявки на акаунт

**`pages/apply.html`** — форма заявки:
```html
<form name="account-request" method="POST" data-netlify="true" netlify-honeypot="bot-field">
  <input type="hidden" name="form-name" value="account-request">
  <input name="bot-field" class="hidden">
  <!-- Ім'я, Email, Telegram, Причина -->
</form>
```

**Після відправки:**
- Netlify автоматично надсилає email адміну
- Адмін бачить заявки на `app.netlify.com` → Forms
- Адмін також бачить заявки в `/dashboard/requests` (через Netlify Forms API — безкоштовно)
- При схваленні: адмін вручну створює акаунт через конструктор

**`/dashboard/requests` UI:**
```
┌─────────────────────────────────────────────────┐
│ [НОВА] Іван Петренко  ivan@email.com  03.01.2025│
│ Причина: "Хочу долучитися до клубу..."          │
│ [✅ Схвалити] [❌ Відхилити]                    │
├─────────────────────────────────────────────────┤
│ [Схвалено] Марія ...                            │
└─────────────────────────────────────────────────┘
```

**Очікуваний результат фази 14:**
- Бекап завантажується як зашифрований JSON файл
- Імпорт відновлює всі дані з підтвердженням
- Форма заявки надсилається через Netlify Forms
- Адмін бачить заявки в dashboard

---

## ФАЗА 15 — Фінальний аудит безпеки та оптимізація

**Команда старту:** «Фаза 15 — старт»

**Завдання:** Перевірка та закриття всіх вразливостей, оптимізація.

### Чеклист безпеки (перевір кожен пункт):

**XSS:**
- [ ] DOMPurify підключений і застосовується до ВСІХ місць де є `innerHTML`
- [ ] Весь output з IndexedDB проходить через sanitize перед рендером
- [ ] URL-поля валідуються через `new URL()` перед збереженням

**Auth:**
- [ ] Маршрути `/dashboard/**` та `/setup` перевіряють сесію при кожному завантаженні
- [ ] Session token видаляється при logout
- [ ] `window.__encKey` очищається при logout

**CSP:**
- [ ] `netlify.toml` містить правильний CSP заголовок
- [ ] Всі CDN-домени явно перераховані в CSP
- [ ] `frame-src` містить всі embed-платформи (YouTube, Vimeo, TikTok, Telegram, Loom)

**IndexedDB:**
- [ ] Всі записи шифруються перед збереженням
- [ ] Розшифрування відбувається лише при наявності `window.__encKey`
- [ ] При відсутності ключа — logout автоматично

**Форми:**
- [ ] Всі форми мають client-side валідацію
- [ ] Netlify Forms має honeypot поле

### Оптимізація продуктивності:
- [ ] Зображення: lazy loading (`loading="lazy"` на `<img>`)
- [ ] Particles: вимкнути на mobile якщо `prefers-reduced-motion: reduce`
- [ ] IndexedDB запити: використовують indexes (не getAll з фільтрацією)
- [ ] Пошук (Fuse.js): індекс будується один раз, не при кожному запиті

### Фінальне тестування:
```
✅ Гість: бачить лише дозволений контент
✅ Користувач без ролі: лише свої матеріали та закритий контент
✅ Редактор (кастомна роль): відповідно до повноважень
✅ Адмін: повний доступ до всього
✅ /setup: доступна лише при першому запуску
✅ /dashboard: redirect на /login без сесії
✅ Бекап: export → import → дані збережені
✅ Пошук: fuzzy пошук по 3 полях
✅ Mobile: повна функціональність від 320px
✅ i18n: перемикач UA/EN без перезавантаження
```

**Очікуваний результат фази 15:**
- Всі пункти чеклісту виконані
- Сайт готовий до деплою на Netlify
- Фінальний тест: деплой → перший запуск → setup → вхід → публікація матеріалу → перевірка публічної частини

---

## ДЕПЛОЙ (після фази 15)

```bash
# 1. Ініціалізація репозиторію
git init
git add .
git commit -m "feat: AI Synergy Archive v1.0"

# 2. Завантаження на GitHub
git remote add origin https://github.com/YOUR_USERNAME/ai-synergy-archive.git
git push -u origin main

# 3. Netlify
# → netlify.com → Add new site → Import from GitHub
# → обрати репозиторій → Build command: (порожньо) → Publish directory: .
# → Deploy site

# 4. Перший запуск
# → Відкрити сайт → автоматичний redirect на /setup
# → Створити адмін-акаунт → готово
```

---

*Версія Activation Prompt: 1.0 | Відповідає ТЗ v1.0 (фінальна, підтверджена)*
