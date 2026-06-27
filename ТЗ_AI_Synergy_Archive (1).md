# Технічне Завдання: Сайт-архів клубу AI Synergy
**Версія:** 1.0 | **Статус:** Фінальна | **Платформа:** Cursor IDE

---

## РОЗДІЛ 1. Огляд проєкту та обмеження

### 1.1 Мета проєкту
Публічний сайт-архів клубу AI Synergy — платформа для зберігання, структурування та надання доступу до матеріалів клубу з гнучкою системою ролей і рівнів видимості контенту.

### 1.2 Ключові обмеження
| Параметр | Рішення |
|---|---|
| Бекенд | Відсутній — виключно клієнтська сторона |
| Зовнішні API | Заборонені (крім CDN для бібліотек та embed-плеєрів) |
| Хостинг | Netlify (обґрунтування: drag-and-drop деплой + форми для заявок на акаунт через Netlify Forms — безкоштовно) |
| Сховище даних | IndexedDB (основне) + localStorage (сесії та налаштування) |
| Бюджет | $0 — лише безкоштовні рівні сервісів |

### 1.3 Обмеження безклієнтського підходу (фіксуємо чесно)
- **Безпека відносна:** дані в IndexedDB доступні через DevTools — пом'якшується шифруванням (AES-256) та хешуванням паролів (bcrypt/PBKDF2 через Web Crypto API)
- **Відео:** лише embed (YouTube, Vimeo, TikTok, Telegram, Loom) — завантаження відеофайлів неможливе без бекенду
- **Фото:** зберігання в IndexedDB у форматі base64, ліміт 2 МБ/зображення, max 5 зображень/матеріал
- **PDF:** або base64 в IndexedDB (до 20 МБ/файл) або посилання на Google Drive — адмін обирає при завантаженні
- **Синхронізація між браузерами:** неможлива — дані прив'язані до браузера пристрою; вирішується через функцію JSON-бекап (адмін може його увімкнути)

---

## РОЗДІЛ 2. Технічний стек та обґрунтування архітектури

### 2.1 Архітектурне рішення: Multi-file SPA без bundler

**Обрано:** Multi-file структура з vanilla JS модулями (`type="module"`) без Webpack/Vite.

**Обґрунтування:**
- Cursor IDE ефективніше редагує окремі файли, ніж моноліт
- Не потрібен build-процес — деплой папкою на Netlify
- ES-модулі підтримуються всіма сучасними браузерами нативно
- Простота підтримки: кожен модуль відповідає за одну зону відповідальності

### 2.2 Стек технологій
| Шар | Технологія | Версія/CDN |
|---|---|---|
| Markup | HTML5 | — |
| Стилі | Tailwind CSS | CDN Play (без збірки) |
| Логіка | Vanilla JS (ES2022, модулі) | — |
| Сховище | IndexedDB (через idb wrapper) | CDN: idb@8 |
| Шифрування | Web Crypto API | Вбудований у браузер |
| Хешування паролів | PBKDF2 (Web Crypto API) | Вбудований у браузер |
| Rich Text Editor | Quill.js або TipTap lite | CDN |
| Пошук | Fuse.js (fuzzy search) | CDN |
| Анімації | GSAP (particles + transitions) | CDN |
| Частинки (фон) | tsParticles | CDN |
| i18n | Власна реалізація (JSON-словники) | — |
| Деплой | Netlify | Free tier |

### 2.3 Принципи реалізації безпеки
- Паролі: PBKDF2 з 310 000 ітерацій + унікальний salt на кожен акаунт (Web Crypto API)
- Дані в IndexedDB: шифрування AES-GCM 256-bit, ключ деривується з пароля адміна
- Сесія: sessionStorage (зникає при закритті вкладки) + опціональний "запам'ятати мене" (7 днів, localStorage, зашифрований токен)
- Адмін-панель: захист маршруту на рівні JS — redirect при відсутності валідного токена
- Захист від XSS: DOMPurify для всього HTML-вмісту з редактора
- CSP-заголовки: налаштовані через `netlify.toml`

---

## РОЗДІЛ 3. Файлова структура проєкту

```
ai-synergy-archive/
├── index.html                    # Точка входу (роутер)
├── netlify.toml                  # CSP-заголовки, редиректи
├── _redirects                    # SPA fallback для Netlify
│
├── pages/
│   ├── home.html                 # Головна (публічна)
│   ├── catalog.html              # Каталог матеріалів
│   ├── material.html             # Сторінка матеріалу
│   ├── about.html                # Про клуб
│   ├── login.html                # Вхід
│   ├── apply.html                # Заявка на акаунт
│   │
│   ├── dashboard/
│   │   ├── index.html            # Dashboard (спільний shell)
│   │   ├── materials.html        # Управління матеріалами
│   │   ├── material-edit.html    # Редактор матеріалу
│   │   ├── users.html            # Управління користувачами (адмін)
│   │   ├── user-create.html      # Конструктор акаунту
│   │   ├── roles.html            # Управління ролями (адмін)
│   │   ├── categories.html       # Управління категоріями/тегами
│   │   ├── requests.html         # Заявки на акаунт (адмін)
│   │   ├── trash.html            # Кошик
│   │   ├── log.html              # Журнал дій (лише адмін)
│   │   └── settings.html         # Налаштування системи
│
├── js/
│   ├── core/
│   │   ├── router.js             # Client-side routing
│   │   ├── auth.js               # Авторизація, сесії, токени
│   │   ├── crypto.js             # Шифрування/дешифрування (Web Crypto)
│   │   ├── db.js                 # IndexedDB через idb wrapper
│   │   └── i18n.js               # Система перекладів
│   │
│   ├── modules/
│   │   ├── materials.js          # CRUD матеріалів
│   │   ├── users.js              # CRUD користувачів
│   │   ├── roles.js              # Управління ролями та повноваженнями
│   │   ├── categories.js         # Управління категоріями/тегами
│   │   ├── visibility.js         # Система видимості контенту
│   │   ├── search.js             # Fuse.js пошук
│   │   ├── log.js                # Журналювання дій
│   │   ├── backup.js             # JSON export/import
│   │   └── requests.js           # Заявки на акаунт
│   │
│   ├── ui/
│   │   ├── particles.js          # tsParticles конфіг (фоновий ефект)
│   │   ├── animations.js         # GSAP анімації переходів
│   │   ├── toast.js              # Сповіщення
│   │   ├── modal.js              # Модальні вікна
│   │   └── components.js         # Переиспользувані UI-компоненти
│   │
│   └── pages/                    # Page-specific controllers
│       ├── home.js
│       ├── catalog.js
│       ├── material.js
│       ├── login.js
│       ├── dashboard/*.js        # По одному файлу на сторінку дашборду
│
├── css/
│   ├── main.css                  # Tailwind directives + CSS variables
│   ├── particles.css             # Фоновий ефект
│   └── animations.css            # Кастомні анімації (keyframes)
│
├── locales/
│   ├── uk.json                   # Українські переклади
│   └── en.json                   # Англійські переклади
│
├── assets/
│   ├── fonts/                    # Локальні шрифти (woff2)
│   ├── icons/                    # SVG іконки
│   └── logo.svg                  # Логотип AI Synergy
│
└── config/
    └── init.js                   # Ініціалізація БД при першому запуску
```

---

## РОЗДІЛ 4. Система ролей: специфікація та реалізація

### 4.1 Рольова ієрархія

```
ADMIN (1 особа)
  └── Суперроль: всі повноваження системи без виключення
  └── Єдиний, хто не може бути понижений або видалений
  └── Може делегувати майже всі повноваження, але не статус адміна

CUSTOM ROLES (створюються адміном, необмежена кількість)
  └── Набір повноважень з чекліста (див. 4.2)
  └── Призначаються конкретним користувачам

USER (базовий рівень без ролі)
  └── Лише перегляд дозволеного контенту

GUEST (без акаунту)
  └── Лише публічно відкритий адміном контент
  └── Може подати заявку на акаунт
```

### 4.2 Повний перелік повноважень (чеклист для конструктора ролей)

**Контент:**
- `content.view.restricted` — перегляд матеріалів, закритих для гостей
- `content.create` — створення нових матеріалів
- `content.edit.own` — редагування власних матеріалів
- `content.edit.any` — редагування будь-яких матеріалів (з нотаткою для автора)
- `content.delete.soft` — переміщення матеріалів у кошик
- `content.publish` — зміна статусу чернетка → опублікований
- `content.visibility` — управління видимістю матеріалів (гість/користувачі)

**Категорії та теги:**
- `taxonomy.create` — створення нових категорій/тегів
- `taxonomy.edit` — редагування існуючих
- `taxonomy.delete` — видалення

**Користувачі:**
- `users.view` — перегляд списку користувачів
- `users.create` — створення нових акаунтів
- `users.edit` — редагування акаунтів
- `users.assign_role` — призначення ролей

**Заявки:**
- `requests.view` — перегляд заявок на акаунт
- `requests.process` — схвалення/відхилення заявок

**Система:**
- `backup.export` — експорт JSON-бекапу
- `backup.import` — імпорт JSON-бекапу

> **Примітка:** Повноваження `users.create`, `users.edit`, `users.assign_role`, `roles.manage`, `log.view`, `backup.import` адмін **не може** делегувати — вони зарезервовані за адміном.

### 4.3 Технічна реалізація авторизації

```javascript
// Структура сесійного токена (sessionStorage)
{
  userId: "usr_abc123",
  role: "editor_custom_1",
  permissions: ["content.create", "content.edit.own", "content.publish"],
  sessionToken: "encrypted_random_64_bytes",
  expiresAt: 1700000000000,
  rememberMe: false
}

// Верифікація при кожному захищеному запиті
async function checkPermission(permission) {
  const session = getSession(); // decrypt from sessionStorage
  if (!session || Date.now() > session.expiresAt) return redirect('/login');
  return session.permissions.includes(permission) || session.role === 'admin';
}
```

### 4.4 Конструктор акаунтів (адмін-панель)

**Поля форми створення акаунту:**
- Ім'я (відображуване)
- Логін (унікальний, латиниця)
- Пароль (задає адмін вручну)
- Підтвердження пароля
- Призначена роль (dropdown з кастомних ролей)
- Дозвіл змінювати пароль: `Ніколи / Одноразово / Завжди`
- Нотатка (внутрішня, видна лише адміну)

**Після створення:**
- Екран показує: логін + пароль у читабельному вигляді (один раз)
- Кнопка «Скопіювати дані для передачі»
- Після закриття — пароль більше не відображається (лише хеш у БД)

### 4.5 Одноразова зміна пароля

```javascript
// Якщо дозвіл = 'once':
// 1. Користувач входить зі старим паролем
// 2. Система показує форму зміни пароля (обов'язкову)
// 3. Після зміни: прапор password_change_permission = 'never'
```

---

## РОЗДІЛ 5. Модуль CMS: функціональні вимоги

### 5.1 Типи контенту

| Тип | Зберігання | Обмеження |
|---|---|---|
| Текстова стаття | IndexedDB (HTML з Quill/TipTap) | До 500 КБ тексту |
| Зображення | IndexedDB (base64) | 2 МБ/файл, max 5/матеріал |
| PDF-файл | IndexedDB (base64) або URL | До 20 МБ/файл (якщо base64) |
| Посилання на PDF | Текстове поле URL | Google Drive/інше |
| Відео embed | URL рядок | YouTube, Vimeo, TikTok, Telegram, Loom |
| Зовнішнє посилання | URL + опис | — |
| Комбінований матеріал | Поєднання будь-яких типів | Сумарно всі обмеження |

### 5.2 Структура редактора матеріалу

**Секції форми редактора:**
1. **Заголовок** — обов'язковий, до 200 символів
2. **Короткий опис** — до 500 символів (використовується в картці каталогу та пошуку)
3. **Категорія** — dropdown, обов'язковий
4. **Теги** — мультиселект або введення вручну через кому
5. **Основний вміст** — Rich Text Editor (Quill) з підтримкою: H1-H3, bold, italic, lists, code blocks, blockquote, посилання
6. **Медіа-блок** — компонент з вкладками:
   - `Зображення`: drag-and-drop завантаження (до 5 файлів)
   - `Відео`: поле URL embed
   - `PDF`: вибір між «Завантажити файл» та «Вставити посилання»
   - `Зовнішні посилання`: список URL з підписами
7. **Статус:** `Чернетка` / `Опублікований`
8. **Видимість:**
   - Загальна: `Лише авторизовані` / `Відкрити для гостей`
   - Індивідуальна: мультиселект конкретних користувачів (понад загальне правило)
9. **Автор** — автоматично (поточний користувач), не редагується

### 5.3 Система видимості контенту (детальна)

```
Алгоритм визначення доступу до матеріалу:

1. Чи є матеріал у кошику? → НЕ ДОСТУПНИЙ нікому (крім адміна)
2. Чи матеріал опублікований? → якщо ні (чернетка) → лише автор + адмін
3. Чи USER є адміном? → ПОВНИЙ ДОСТУП
4. Чи матеріал відкритий для конкретного userId? → ДОСТУП
5. Чи USER має permission 'content.view.restricted'? → ДОСТУП
6. Чи матеріал відкритий для гостей? → ДОСТУП (навіть без акаунту)
7. → НЕ ДОСТУПНИЙ
```

**Рівні управління видимістю (адмін-панель):**
- **Категорія:** перемикач «гості бачать всю категорію»
- **Матеріал:** чекбокс «відкрити для гостей» (переважає над категорією якщо вимкнено)
- **Конкретний користувач:** мультиселект у картці матеріалу

### 5.4 Кошик та видалення

```javascript
// Soft delete: матеріал НЕ видаляється фізично
material.deletedAt = Date.now();
material.deletedBy = currentUserId;

// Кошик: показує матеріали де deletedAt !== null
// Відновлення: deletedAt = null
// Hard delete: лише адмін, лише з кошика, з підтвердженням
```

### 5.5 Редагування чужих матеріалів

При редагуванні матеріалу іншого автора користувачем з повноваженням `content.edit.any`:
```javascript
// До матеріалу додається запис:
material.editHistory.push({
  editedBy: editorUserId,
  editedByName: "Ім'я редактора",
  editedAt: Date.now(),
  isAdmin: (editorRole === 'admin'),
  note: "Опціональна нотатка від редактора"
});
```
Автор бачить у своєму матеріалі повідомлення: _«Цей матеріал редагував [Ім'я] (Адмін) — [дата]»_

### 5.6 Управління категоріями та тегами

- Адмін: повний CRUD категорій і тегів
- Користувачі з `taxonomy.create`: можуть додавати нові категорії/теги
- Категорії: деревовидна структура (батьківська → дочірня, 2 рівні)
- Теги: плоский список, без обмежень кількості

---

## РОЗДІЛ 6. Публічний інтерфейс: функціональні вимоги

### 6.1 Навігація (для гостя)

```
HEADER: [Logo AI Synergy]  [Головна] [Матеріали] [Про клуб]  [UA|EN]  [Увійти]
```

### 6.2 Головна сторінка

- Hero-секція: назва клубу + короткий опис + CTA «Переглянути матеріали»
- Блок «Останні матеріали» (лише публічно доступні)
- Блок «Про клуб» (короткий текст + CTA «Детальніше»)
- Фонова анімація tsParticles (постійна)

### 6.3 Каталог матеріалів

- Грід карток матеріалів (адаптивний: 3 колонки → 2 → 1)
- **Фільтри (ліва панель або top-bar):**
  - Категорія (dropdown/accordion)
  - Теги (мультиселект)
  - Тип контенту (checkbox: стаття / відео / PDF / посилання)
- **Пошук:** Fuse.js по полях `title`, `description`, `tags` (fuzzy search з підсвічуванням збігів)
- Пагінація: 12 карток / сторінка
- Сортування: новіші / старіші / за назвою A-Z

### 6.4 Сторінка матеріалу

- Заголовок + автор + дата + теги
- Основний вміст (HTML з редактора, санітизований через DOMPurify)
- Медіа-блок: галерея зображень / embed відео / PDF viewer або посилання
- Кнопка «Назад до каталогу»
- Для авторизованих з правами: кнопка «Редагувати»

### 6.5 Заявка на акаунт

**Форма (Netlify Forms — безкоштовно, до 100 заявок/місяць):**
- Ім'я (обов'язкове)
- Email (обов'язковий)
- Telegram username (необов'язковий)
- Причина вступу (textarea, обов'язкова)
- Honeypot-поле (захист від ботів)

**Після відправки:**
- Netlify надсилає email-нотифікацію адміну
- Адмін бачить заявки також в розділі `Заявки` адмін-панелі (через Netlify Forms API — безкоштовно)

### 6.6 SEO

- `<title>` та `<meta description>` на кожній сторінці
- Open Graph теги на сторінці матеріалу (назва, опис, перше зображення матеріалу)
- `robots.txt`: дозволяємо індексацію публічних сторінок, забороняємо `/dashboard/`
- `sitemap.xml`: генерується динамічно з публічних матеріалів (JS при завантаженні)

---

## РОЗДІЛ 7. Модель даних (IndexedDB схема)

### 7.1 Store: `users`
```javascript
{
  id: "usr_[nanoid]",              // PK
  login: "string",                  // унікальний
  passwordHash: "string",           // PBKDF2 hash
  passwordSalt: "string",           // base64
  displayName: "string",
  role: "admin" | "role_[nanoid]", // роль
  passwordChangePermission: "never" | "once" | "always",
  passwordChanged: false,           // для режиму 'once'
  note: "string",                   // внутрішня нотатка адміна
  createdAt: 1700000000000,
  createdBy: "usr_admin",
  isActive: true
}
```

### 7.2 Store: `roles`
```javascript
{
  id: "role_[nanoid]",
  name: "string",                   // назва ролі (задає адмін)
  permissions: ["content.create", "content.publish", ...],
  createdAt: 1700000000000
}
```

### 7.3 Store: `materials`
```javascript
{
  id: "mat_[nanoid]",
  title: "string",
  description: "string",            // короткий опис
  contentHtml: "string",            // sanitized HTML
  type: ["article", "image", "video", "pdf", "link"], // масив типів
  categoryId: "cat_[nanoid]",
  tags: ["tag1", "tag2"],
  status: "draft" | "published",
  visibility: {
    guestAccess: false,             // відкритий для гостей
    userAccess: "role_based",       // або "all_users"
    specificUsers: ["usr_abc"]      // індивідуальний доступ
  },
  media: {
    images: [{
      id: "img_[nanoid]",
      data: "base64...",            // IndexedDB окремий store
      mimeType: "image/jpeg",
      sizeBytes: 1024000
    }],
    videoUrls: ["https://youtube.com/embed/..."],
    pdfFiles: [{
      type: "file" | "url",
      data: "base64..." | null,
      url: null | "https://drive.google.com/...",
      filename: "document.pdf"
    }],
    externalLinks: [{
      url: "https://...",
      label: "Назва посилання"
    }]
  },
  authorId: "usr_[nanoid]",
  editHistory: [{
    editedBy: "usr_[nanoid]",
    editedByName: "string",
    editedAt: 1700000000000,
    isAdmin: true,
    note: "string"
  }],
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  deletedAt: null | 1700000000000,
  deletedBy: null | "usr_[nanoid]"
}
```

### 7.4 Store: `categories`
```javascript
{
  id: "cat_[nanoid]",
  name: "string",
  parentId: null | "cat_[nanoid]",  // для дочірніх категорій
  guestAccess: false,               // адмін відкриває всю категорію для гостей
  createdBy: "usr_[nanoid]",
  createdAt: 1700000000000
}
```

### 7.5 Store: `tags`
```javascript
{
  id: "tag_[nanoid]",
  name: "string",
  createdBy: "usr_[nanoid]"
}
```

### 7.6 Store: `actionLog`
```javascript
{
  id: "log_[nanoid]",
  actorId: "usr_[nanoid]",
  actorName: "string",
  action: "material.edit" | "user.create" | "role.assign" | ...,
  targetId: "mat_[nanoid]" | "usr_[nanoid]" | ...,
  targetTitle: "string",
  details: "string",               // опис дії у читабельній формі
  timestamp: 1700000000000
}
```

### 7.7 Store: `settings`
```javascript
{
  key: "site_name" | "site_description" | "backup_enabled" | ...,
  value: "any"
}
```

### 7.8 Store: `accessRequests` (заявки — дублікат від Netlify Forms)
```javascript
{
  id: "req_[nanoid]",
  name: "string",
  email: "string",
  telegram: "string" | null,
  reason: "string",
  status: "pending" | "approved" | "rejected",
  processedAt: null | 1700000000000,
  processedBy: null | "usr_admin",
  createdAt: 1700000000000
}
```

---

## РОЗДІЛ 8. UI/UX специфікація

### 8.1 Кольорова палітра

| Назва | HEX | Використання |
|---|---|---|
| `space-void` | `#050510` | Основний фон |
| `nebula-deep` | `#0d0d2b` | Фон карток, панелей |
| `synapse-blue` | `#3b82f6` | Primary accent, CTA-кнопки |
| `pulse-violet` | `#7c3aed` | Secondary accent, теги, highlights |
| `neural-glow` | `#a78bfa` | Hover-стани, активні елементи |
| `starfield-white` | `#e2e8f0` | Основний текст |
| `dim-text` | `#94a3b8` | Другорядний текст, підписи |
| `border-glow` | `rgba(124,58,237,0.3)` | Бордери карток |
| `success` | `#10b981` | Успішні дії |
| `danger` | `#ef4444` | Помилки, видалення |
| `warning` | `#f59e0b` | Попередження |

### 8.2 Типографіка

| Роль | Шрифт | Параметри |
|---|---|---|
| Display (заголовки H1-H2) | **Orbitron** (Google Fonts) | 700-900 weight, letter-spacing: 0.05em |
| Body (основний текст) | **Inter** (Google Fonts) | 400/500, line-height: 1.6 |
| Mono (код, ID, теги) | **JetBrains Mono** (Google Fonts) | 400, для технічних елементів |

### 8.3 Анімації

**Фонова анімація (tsParticles) — постійна на всіх сторінках:**
- Частинки: дрібні зірки (#3b82f6, #7c3aed, #ffffff) з різною яскравістю
- Лінії між частинками (constellation effect) при наближенні
- Повільне обертання constellation-мережі
- Щільність: низька (не відволікає від контенту)

**Transitions:**
- Page transition: fade + slide-up (300ms, GSAP)
- Card hover: підняття на 4px + glow-shadow фіолетового кольору (200ms)
- Button hover: subtle glow pulse (150ms)

**Завантаження:**
- Skeleton screens для карток (замість спінера)
- Staggered reveal при першій появі списку карток (GSAP, 50ms між картками)

### 8.4 Компонентна структура

**Картка матеріалу:**
```
┌─────────────────────────────┐  ← border-glow, border-radius: 12px
│ [TYPE BADGE]    [DATE]      │  ← тип контенту + дата
│                             │
│ Заголовок матеріалу         │  ← Orbitron, 16px, bold
│                             │
│ Короткий опис тексту...     │  ← Inter, 14px, dim-text, 2 рядки
│                             │
│ [тег1] [тег2]               │  ← pill-стиль, pulse-violet
│                             │
│ [Автор]          [→ читати] │  ← CTA кнопка
└─────────────────────────────┘
```

**Dashboard sidebar (для авторизованих):**
```
[Logo]
─────────
📊 Dashboard
📁 Матеріали
  ├ Всі матеріали
  ├ Мої матеріали
  └ Кошик
🏷️ Категорії (якщо є право)
👥 Користувачі (якщо є право)
📋 Заявки (якщо є право)
📜 Журнал (тільки адмін)
⚙️ Налаштування (тільки адмін)
─────────
[Аватар] [Ім'я]
[Вийти]
```

### 8.5 Адаптивність

| Breakpoint | Tailwind | Поведінка |
|---|---|---|
| Mobile | < 640px | 1 колонка, sidebar → bottom nav |
| Tablet | 640–1024px | 2 колонки, sidebar → collapsible |
| Desktop | > 1024px | 3 колонки, sidebar постійний |

### 8.6 Мультимовність

- Перемикач UA/EN у хедері
- Вибір мови зберігається в localStorage
- Структура словника:
```javascript
// locales/uk.json
{
  "nav.home": "Головна",
  "nav.materials": "Матеріали",
  "material.readMore": "Читати далі",
  ...
}
```

---

## РОЗДІЛ 9. Безпека

### 9.1 Захист паролів
- Алгоритм: PBKDF2-SHA256, 310 000 ітерацій (рекомендація OWASP 2024)
- Унікальний cryptographically random salt (32 bytes) для кожного акаунту
- Реалізація: Web Crypto API (без зовнішніх бібліотек)

### 9.2 Шифрування даних в IndexedDB
```javascript
// Ключ шифрування деривується з пароля адміна при кожному вході
const encKey = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
  baseKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt']
);
// Всі записи в IndexedDB шифруються AES-GCM-256 перед записом
```

### 9.3 Захист маршрутів
```javascript
// router.js: перевірка перед кожним рендером захищеної сторінки
const protectedRoutes = ['/dashboard/**'];
if (isProtectedRoute(path)) {
  const session = await verifySession();
  if (!session) return navigate('/login?redirect=' + path);
  if (!hasPermission(session, requiredPermission)) return navigate('/403');
}
```

### 9.4 CSP заголовки (netlify.toml)
```toml
[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'; script-src 'self' cdn.jsdelivr.net unpkg.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src fonts.gstatic.com; frame-src youtube.com www.youtube.com vimeo.com player.vimeo.com tiktok.com t.me; img-src 'self' data: blob:; connect-src 'self'"
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

### 9.5 XSS захист
- DOMPurify підключається з CDN, очищує весь HTML перед рендером з редактора
- `innerHTML` забороняється скрізь, крім sanitized-блоків
- Всі зовнішні URL валідуються через `URL()` конструктор перед збереженням

### 9.6 Чесне обмеження підходу
> **Увага:** Оскільки немає серверного бекенду, технічно підготовлений зловмисник з фізичним доступом до браузера може через DevTools отримати зашифровані дані з IndexedDB. Без пароля адміна розшифрувати їх неможливо. Для клубного інструменту з довіреною аудиторією цей рівень захисту є достатнім.

---

## РОЗДІЛ 10. Деплой та підтримка

### 10.1 Початковий деплой на Netlify

**Крок 1. Підготовка репозиторію**
```bash
git init ai-synergy-archive
cd ai-synergy-archive
# Додати всі файли проєкту
git add .
git commit -m "feat: initial project setup"
```

**Крок 2. Підключення до Netlify**
- Зайти на netlify.com → «Add new site» → «Import from GitHub»
- Або: drag-and-drop папки проєкту на netlify.com/drop

**Крок 3. Налаштування**
```toml
# netlify.toml
[build]
  publish = "."

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Крок 4. Перший запуск**
- При першому відкритті сайту: система виявляє відсутність адміна в IndexedDB
- Автоматично відкривається `/setup` — сторінка ініціалізації
- Адмін задає логін і пароль → дані зберігаються (зашифровані) → `/setup` назавжди відключається

### 10.2 Оновлення контенту через CMS
- Адмін/редактор входять через `/login`
- Всі зміни контенту зберігаються напряму в IndexedDB браузера
- **Важливо:** дані прив'язані до браузера — рекомендується регулярний JSON-бекап

### 10.3 Оновлення коду сайту
```bash
# Внести зміни в Cursor IDE
git add .
git commit -m "fix: ..."
git push origin main
# Netlify автоматично перерозгортає сайт (CI/CD вбудований)
```

### 10.4 Бекап даних (JSON export/import)

**Export (адмін):**
```javascript
// Збирає всі stores крім сесій, шифрує AES-GCM ключем адміна
const backup = await exportAllStores();
downloadJSON(backup, `ai-synergy-backup-${Date.now()}.json`);
```

**Import:**
```javascript
// Парсить JSON, валідує схему, розшифровує, імпортує в IndexedDB
// УВАГА: import замінює всі поточні дані
await importBackup(file); // з підтвердженням через modal
```

---

## РОЗДІЛ 11. Перелік відкритих питань

На момент написання ТЗ всі критичні питання отримали відповіді. Нижче — технічні рішення, прийняті архітектором самостійно, які потребують підтвердження перед стартом розробки:

| № | Рішення | Обґрунтування | Потребує підтвердження? |
|---|---|---|---|
| 1 | Netlify як хостинг | Forms для заявок + автодеплой з GitHub | ✅ Підтвердити |
| 2 | Vanilla JS без фреймворку | Простота для Cursor, без bundler | ✅ Підтвердити |
| 3 | Fuse.js для пошуку (по title + description + tags) | Оптимальний баланс функціональності та складності | ✅ Підтвердити |
| 4 | Відео: YouTube / Vimeo / TikTok / Telegram / Loom | Всі безкоштовні embed-платформи | ✅ Підтвердити |
| 5 | Шрифти: Orbitron + Inter + JetBrains Mono | Відповідають космічному стилю та функціональності | ✅ Підтвердити |
| 6 | `/setup` сторінка для першого запуску | Зручніше за ручне редагування конфігу | ✅ Підтвердити |
| 7 | Netlify Forms для заявок (100/міс безкоштовно) | Єдиний спосіб отримувати форми без бекенду | ✅ Підтвердити |

---

*ТЗ готове до передачі в Cursor IDE. Рекомендований порядок розробки: core/db.js → core/auth.js → core/crypto.js → router.js → setup сторінка → dashboard → публічна частина.*
