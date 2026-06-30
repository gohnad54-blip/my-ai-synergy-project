/** Internationalization — Phase 12 */

const STORAGE_KEY = 'locale';
const DEFAULT_LOCALE = 'uk';

/** @type {readonly ['uk', 'en', 'de']} */
export const SUPPORTED_LOCALES = ['uk', 'en', 'de'];

/** @type {'uk' | 'en' | 'de'} */
let currentLocale = DEFAULT_LOCALE;

/** @type {Record<string, string>} */
let messages = {};

/** @type {Record<string, string>} */
let fallbackMessages = {};

/** @type {Promise<void> | null} */
let initPromise = null;

/** @type {boolean} */
let switcherBound = false;

/** @type {Record<'uk' | 'en' | 'de', string>} */
const HTML_LANG = {
  uk: 'uk',
  en: 'en',
  de: 'de',
};

/**
 * @param {string} locale
 * @returns {locale is 'uk' | 'en' | 'de'}
 */
function isSupportedLocale(locale) {
  return SUPPORTED_LOCALES.includes(/** @type {'uk' | 'en' | 'de'} */ (locale));
}

/**
 * @param {'uk' | 'en' | 'de'} locale
 * @returns {Promise<Record<string, string>>}
 */
async function fetchMessages(locale) {
  const response = await fetch(`/locales/${locale}.json`);
  if (!response.ok) {
    throw new Error(`Failed to load locale: ${locale}`);
  }
  return response.json();
}

/**
 * @returns {Promise<Record<string, string>>}
 */
async function ensureFallbackMessages() {
  if (Object.keys(fallbackMessages).length > 0) {
    return fallbackMessages;
  }
  fallbackMessages = await fetchMessages('uk');
  return fallbackMessages;
}

/**
 * @param {'uk' | 'en' | 'de'} locale
 * @returns {Promise<Record<string, string>>}
 */
async function loadMessagesForLocale(locale) {
  await ensureFallbackMessages();
  if (locale === 'uk') {
    return fallbackMessages;
  }
  return fetchMessages(locale);
}

/**
 * @param {'uk' | 'en' | 'de'} locale
 */
function applyDocumentLang(locale) {
  document.documentElement.lang = HTML_LANG[locale] ?? 'uk';
}

/**
 * @param {number} n
 * @returns {string}
 */
function ukMaterialLabel(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return t('material.countOne');
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return t('material.countFew');
  }
  return t('material.countMany');
}

/**
 * @param {number} n
 * @returns {string}
 */
function enMaterialLabel(n) {
  return n === 1 ? t('material.countOne') : t('material.countMany');
}

/**
 * @param {number} n
 * @returns {string}
 */
function deMaterialLabel(n) {
  return n === 1 ? t('material.countOne') : t('material.countMany');
}

/**
 * @returns {'uk' | 'en' | 'de'}
 */
export function getLocale() {
  return currentLocale;
}

/**
 * @returns {string}
 */
export function getDateLocale() {
  switch (currentLocale) {
    case 'en':
      return 'en-US';
    case 'de':
      return 'de-DE';
    default:
      return 'uk-UA';
  }
}

/**
 * Locale tag for sorting and collation.
 * @returns {string}
 */
export function getCollatorLocale() {
  switch (currentLocale) {
    case 'en':
      return 'en';
    case 'de':
      return 'de';
    default:
      return 'uk';
  }
}

/**
 * @returns {Promise<void>}
 */
export async function initI18n() {
  if (!initPromise) {
    initPromise = (async () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      const locale = saved && isSupportedLocale(saved) ? saved : DEFAULT_LOCALE;
      messages = await loadMessagesForLocale(locale);
      currentLocale = locale;
      applyDocumentLang(locale);
    })();
  }
  return initPromise;
}

/**
 * @param {string} key
 * @param {Record<string, string | number> | undefined} [params]
 * @returns {string}
 */
export function t(key, params) {
  if (key === 'material.count' && params && typeof params.n === 'number') {
    const n = params.n;
    const label = currentLocale === 'en'
      ? enMaterialLabel(n)
      : currentLocale === 'de'
        ? deMaterialLabel(n)
        : ukMaterialLabel(n);
    return `${n} ${label}`;
  }

  let text = messages[key];
  if (text === undefined) {
    text = fallbackMessages[key];
  }
  if (text === undefined) {
    console.warn(`[i18n] Missing key: ${key}`);
    return key;
  }

  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{{${name}}}`, String(value));
    }
  }

  return text;
}

/**
 * @param {'uk' | 'en' | 'de'} locale
 * @returns {Promise<void>}
 */
export async function setLocale(locale) {
  if (!isSupportedLocale(locale)) {
    return;
  }

  if (locale === currentLocale && Object.keys(messages).length > 0) {
    return;
  }

  messages = await loadMessagesForLocale(locale);
  currentLocale = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  applyDocumentLang(locale);

  applyToDOM();
  updateLangSwitcherUI();

  window.dispatchEvent(new CustomEvent('app:localechange', { detail: { locale } }));
}

/**
 * @returns {string}
 */
export function renderLangSwitcherHtml() {
  return `
    <div class="lang-switcher flex flex-wrap items-center gap-1 text-sm" role="group" aria-label="${t('lang.label')}">
      <button type="button" data-lang="uk" class="lang-btn rounded px-1.5 py-0.5 transition hover:text-neural-glow">UA</button>
      <span class="text-dim-text" aria-hidden="true">|</span>
      <button type="button" data-lang="en" class="lang-btn rounded px-1.5 py-0.5 transition hover:text-neural-glow">EN</button>
      <span class="text-dim-text" aria-hidden="true">|</span>
      <button type="button" data-lang="de" class="lang-btn rounded px-1.5 py-0.5 transition hover:text-neural-glow">DE</button>
    </div>
  `;
}

/**
 * @returns {void}
 */
export function mountLangSwitcher() {
  document.querySelectorAll('#lang-switcher-slot, #dashboard-lang-switcher-slot, #dashboard-lang-switcher-slot-mobile').forEach((slot) => {
    if (!(slot instanceof HTMLElement)) {
      return;
    }
    slot.dataset.mounted = 'false';
    slot.innerHTML = renderLangSwitcherHtml();
    slot.dataset.mounted = 'true';
  });
}

/**
 * @returns {void}
 */
export function updateLangSwitcherUI() {
  document.querySelectorAll('[data-lang]').forEach((btn) => {
    if (!(btn instanceof HTMLElement)) {
      return;
    }
    const active = btn.getAttribute('data-lang') === currentLocale;
    btn.classList.toggle('text-neural-glow', active);
    btn.classList.toggle('font-medium', active);
    btn.classList.toggle('text-dim-text', !active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

/**
 * @returns {void}
 */
export function initLangSwitcher() {
  mountLangSwitcher();
  updateLangSwitcherUI();

  if (switcherBound) {
    return;
  }
  switcherBound = true;

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const btn = target.closest('[data-lang]');
    if (!(btn instanceof HTMLElement)) {
      return;
    }
    const lang = btn.getAttribute('data-lang');
    if (!lang || !isSupportedLocale(lang)) {
      return;
    }
    if (lang === currentLocale) {
      return;
    }
    event.preventDefault();
    void setLocale(lang);
  });
}

/**
 * @returns {void}
 */
export function applyToDOM() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) {
      return;
    }
    el.textContent = t(key);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      return;
    }
    el.placeholder = t(key);
  });

  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    if (!key) {
      return;
    }
    el.setAttribute('aria-label', t(key));
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (!key) {
      return;
    }
    el.setAttribute('title', t(key));
  });
}

export default {
  SUPPORTED_LOCALES,
  initI18n,
  setLocale,
  getLocale,
  getDateLocale,
  getCollatorLocale,
  t,
  applyToDOM,
  mountLangSwitcher,
  initLangSwitcher,
  updateLangSwitcherUI,
  renderLangSwitcherHtml,
};
