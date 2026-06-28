/** SPA router — navigation, guards, page loading */

import { checkInitialization } from '../../config/init.js';
import {
  getSession,
  hasPermission,
  isAdmin,
  isAuthenticated,
} from './auth.js';
import {
  initDashboardShell,
  isDashboardPath,
  wrapDashboardPage,
} from '../ui/components.js';
import { loadGsap, runPageAnimations } from '../ui/animations.js';
import { initParticles } from '../ui/particles.js';
import { initPublicMobileNav, updatePublicHeaderAuth } from '../ui/public.js';
import {
  applyToDOM,
  initI18n,
  initLangSwitcher,
  mountLangSwitcher,
  t,
} from './i18n.js';
import { preloadSecurityAssets, repairStaleSession } from './security.js';

/** @typedef {{ page: string, auth?: boolean, permission?: string | null, adminOnly?: boolean, setupOnly?: boolean }} RouteConfig */

/** @type {Array<{ pattern: string } & RouteConfig>} */
const routeList = [
  { pattern: '/setup', page: 'setup', auth: false, setupOnly: true },
  { pattern: '/dashboard/material-edit/:id?', page: 'dashboard/material-edit', auth: true, permission: 'content.create' },
  { pattern: '/dashboard/materials', page: 'dashboard/materials', auth: true, permission: 'content.create' },
  { pattern: '/dashboard/user-create', page: 'dashboard/user-create', auth: true, permission: 'users.create' },
  { pattern: '/dashboard/users', page: 'dashboard/users', auth: true, permission: 'users.view' },
  { pattern: '/dashboard/roles', page: 'dashboard/roles', auth: true, adminOnly: true },
  { pattern: '/dashboard/categories', page: 'dashboard/categories', auth: true, permission: 'taxonomy.create' },
  { pattern: '/dashboard/requests', page: 'dashboard/requests', auth: true, permission: 'requests.view' },
  { pattern: '/dashboard/trash', page: 'dashboard/trash', auth: true, permission: 'content.delete.soft' },
  { pattern: '/dashboard/log', page: 'dashboard/log', auth: true, adminOnly: true },
  { pattern: '/dashboard/comments', page: 'dashboard/comments', auth: true, adminOnly: true },
  { pattern: '/dashboard/settings', page: 'dashboard/settings', auth: true, adminOnly: true },
  { pattern: '/dashboard', page: 'dashboard/index', auth: true, permission: null },
  { pattern: '/materials/:id', page: 'material', auth: false },
  { pattern: '/materials', page: 'catalog', auth: false },
  { pattern: '/about', page: 'about', auth: false },
  { pattern: '/login', page: 'login', auth: false },
  { pattern: '/apply', page: 'apply', auth: false },
  { pattern: '/', page: 'home', auth: false },
];

/** @type {AbortController | null} */
let pageController = null;

/** @type {boolean} */
let documentLinkHandlerReady = false;

/** Позначає що SPA (index.html + router.js) активний. */
window.__routerBootstrapped = true;

/**
 * @param {...unknown} args
 */
function routerLog(...args) {
  console.log('[router]', ...args);
}

/**
 * @param {Element} el
 * @returns {string | null}
 */
function getSpaRouteFromElement(el) {
  const spaNav = el.closest('[data-spa-nav]');
  if (spaNav instanceof HTMLElement) {
    const route = spaNav.getAttribute('data-spa-nav');
    return route?.startsWith('/') ? route : null;
  }

  const anchor = el.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) {
    return null;
  }

  return getInternalRoute(anchor);
}

/**
 * @param {HTMLAnchorElement} anchor
 * @returns {string | null}
 */
function getInternalRoute(anchor) {
  if (anchor.target === '_blank' || anchor.hasAttribute('download')) {
    return null;
  }

  const rawHref = anchor.getAttribute('href');
  if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
    return null;
  }

  if (rawHref.startsWith('//')) {
    return null;
  }

  try {
    const url = new URL(rawHref, window.location.origin);
    if (url.origin !== window.location.origin) {
      return null;
    }
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return `${path}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/**
 * @param {MouseEvent} event
 * @returns {boolean}
 */
function handleSpaClick(event) {
  if (!(event.target instanceof Element)) {
    return false;
  }

  if (event.defaultPrevented) {
    return false;
  }

  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }

  const route = getSpaRouteFromElement(event.target);
  routerLog('click', {
    route,
    target: event.target.tagName,
    href: event.target instanceof HTMLAnchorElement ? event.target.href : event.target.closest('a')?.href,
  });

  if (!route) {
    return false;
  }

  event.preventDefault();
  navigate(route);
  return true;
}

/**
 * Перехоплює внутрішні посилання до SPA-навігації (capture — до default action браузера).
 * @param {MouseEvent} event
 */
function onDocumentClick(event) {
  handleSpaClick(event);
}

/** Реєструє глобальний обробник кліків по внутрішніх посиланнях (один раз). */
function initDocumentLinkHandler() {
  if (documentLinkHandlerReady) {
    return;
  }

  document.addEventListener('click', onDocumentClick, true);

  const app = document.getElementById('app');
  if (app) {
    app.addEventListener('click', onDocumentClick, true);
  }

  documentLinkHandlerReady = true;
  routerLog('initDocumentLinkHandler: ready', { app: Boolean(app) });
}

/**
 * @param {string} pathname
 * @returns {string}
 */
function normalizePath(pathname) {
  let path = pathname.split('?')[0].split('#')[0];
  if (!path || path === '/') {
    return '/';
  }
  path = path.replace(/\/+$/, '') || '/';
  if (path.endsWith('.html')) {
    path = path.slice(0, -5) || '/';
  }
  if (path === '/index') {
    return '/';
  }
  return path;
}

/**
 * @param {string} pattern
 * @param {string} path
 * @returns {Record<string, string> | null}
 */
function matchPattern(pattern, path) {
  if (pattern === path) {
    return {};
  }

  const regexSource = pattern
    .replace(/\//g, '\\/')
    .replace(/\\\/:(\w+)\?/g, '(?:\\/(?<$1>[^/]+))?')
    .replace(/:(\w+)/g, '(?<$1>[^/]+)');

  const match = path.match(new RegExp(`^${regexSource}$`));

  if (!match) {
    return null;
  }

  return match.groups ?? {};
}

/**
 * @param {string} path
 * @returns {{ config: RouteConfig, params: Record<string, string> } | null}
 */
function matchRoute(path) {
  for (const route of routeList) {
    const params = matchPattern(route.pattern, path);
    if (params !== null) {
      const { pattern, ...config } = route;
      return { config, params };
    }
  }
  return null;
}

/**
 * @param {string} path
 * @param {boolean} [replace=false]
 */
export async function navigate(path, replace = false) {
  const url = new URL(path, window.location.origin);
  const normalized = normalizePath(url.pathname);
  const fullUrl = `${normalized}${url.search}${url.hash}`;
  const current = `${normalizePath(location.pathname)}${location.search}${location.hash}`;

  if (replace) {
    history.replaceState({ path: normalized }, '', fullUrl);
  } else if (current !== fullUrl) {
    history.pushState({ path: normalized }, '', fullUrl);
  }

  await renderRoute(normalized);
}

/**
 * @param {string} code
 * @param {string} titleKey
 * @param {string} messageKey
 */
function renderErrorPage(code, titleKey, messageKey) {
  const app = document.getElementById('app');
  if (!app) {
    return;
  }

  app.innerHTML = `
    <div class="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p class="font-display text-6xl text-pulse-violet">${code}</p>
      <h1 class="mt-4 font-display text-2xl" data-i18n="${titleKey}">${t(titleKey)}</h1>
      <p class="mt-2 text-dim-text" data-i18n="${messageKey}">${t(messageKey)}</p>
      <a href="/" class="mt-8 inline-block rounded-lg border border-pulse-violet/40 px-6 py-2 text-neural-glow transition hover:border-neural-glow hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]" data-i18n="errors.backHome">
        ${t('errors.backHome')}
      </a>
    </div>
  `;
  mountLangSwitcher();
  applyToDOM();
  initLangSwitcher();
}

/**
 * @param {string} path
 */
async function renderRoute(path) {
  const app = document.getElementById('app');
  if (!app) {
    return;
  }

  repairStaleSession();

  if (pageController) {
    pageController.abort();
    pageController = null;
  }

  if (path === '/403') {
    renderErrorPage('403', 'errors.forbidden', 'errors.forbiddenMsg');
    document.title = `403 — AI Synergy`;
    return;
  }

  if (path === '/404') {
    renderErrorPage('404', 'errors.notFound', 'errors.notFoundMsg');
    document.title = `404 — AI Synergy`;
    return;
  }

  const needsSetup = window.__needsSetup ?? await checkInitialization();

  if (needsSetup && path !== '/setup') {
    await navigate('/setup', true);
    return;
  }

  if (!needsSetup && path === '/setup') {
    await navigate('/', true);
    return;
  }

  const matched = matchRoute(path);

  if (!matched) {
    await navigate('/404', true);
    return;
  }

  const { config, params } = matched;

  if (config.setupOnly && !needsSetup) {
    await navigate('/', true);
    return;
  }

  if (config.auth && !isAuthenticated()) {
    const returnUrl = encodeURIComponent(path);
    await navigate(`/login?return=${returnUrl}`, true);
    return;
  }

  if (config.adminOnly && !isAdmin()) {
    await navigate('/403', true);
    return;
  }

  if (config.permission && !hasPermission(config.permission)) {
    await navigate('/403', true);
    return;
  }

  if (path === '/login' && isAuthenticated()) {
    await navigate('/dashboard', true);
    return;
  }

  try {
    const response = await fetch(`/pages/${config.page}.html`);
    if (!response.ok) {
      throw new Error(`Page not found: ${config.page}`);
    }

    const html = await response.text();
    const isDashboard = isDashboardPath(path);
    app.innerHTML = isDashboard ? wrapDashboardPage(html) : html;

    pageController = new AbortController();
    const signal = pageController.signal;

    mountLangSwitcher();
    applyToDOM();

    try {
      const module = await import(`/js/pages/${config.page}.js`);
      if (typeof module.default === 'function' && !signal.aborted) {
        await module.default({
          params,
          path,
          route: config,
          navigate,
          getSession,
        });
      }
    } catch (importError) {
      if (importError instanceof TypeError || (importError instanceof Error && importError.message.includes('404'))) {
        // Сторінка без JS-контролера — нормально для about, apply тощо
      } else if (!signal.aborted) {
        console.warn(`[router] Page controller error (${config.page}):`, importError);
      }
    }

    initLangSwitcher();

    if (isDashboard && !signal.aborted) {
      initDashboardShell(path);
    }

    bindSpaLinksInApp();

    if (!isDashboard) {
      updateActiveNav(path);
      initPublicMobileNav();
      updatePublicHeaderAuth();
    }

    if (!signal.aborted) {
      runPageAnimations(isDashboard);
    }
  } catch (error) {
    console.error('[router] Render failed:', error);
    renderErrorPage('500', 'errors.general', 'errors.loadFailed');
  }
}

/**
 * Після кожного рендеру — явно прив'язує SPA-кліки в #app (fallback).
 */
function bindSpaLinksInApp() {
  const app = document.getElementById('app');
  if (!app) {
    return;
  }

  app.querySelectorAll('a[href^="/"]:not([data-spa-bound])').forEach((anchor) => {
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }
    anchor.dataset.spaBound = 'true';
    anchor.addEventListener('click', (event) => {
      handleSpaClick(event);
    });
  });

  app.querySelectorAll('[data-spa-nav]:not([data-spa-bound])').forEach((el) => {
    if (!(el instanceof HTMLElement)) {
      return;
    }
    el.dataset.spaBound = 'true';
    el.addEventListener('click', (event) => {
      handleSpaClick(event);
    });
  });
}

/**
 * @deprecated Використовуй bindSpaLinksInApp / initDocumentLinkHandler.
 * @param {ParentNode} [_root]
 */
function bindInternalLinks(_root) {
  bindSpaLinksInApp();
}

/**
 * @param {string} path
 */
function updateActiveNav(path) {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    const href = el.getAttribute('data-nav');
    const active = href === path || (href !== '/' && path.startsWith(href));
    el.classList.toggle('text-neural-glow', active);
    el.classList.toggle('text-dim-text', !active);
  });
}

window.addEventListener('popstate', () => {
  renderRoute(normalizePath(location.pathname));
});

window.addEventListener('app:navigate', (event) => {
  const { path, replace = false } = event.detail ?? {};
  if (path) {
    navigate(path, replace);
  }
});

window.addEventListener('app:localechange', () => {
  renderRoute(normalizePath(location.pathname));
});

initDocumentLinkHandler();
routerLog('router.js loaded', { href: location.href });

checkInitialization().then(async () => {
  routerLog('checkInitialization done', { needsSetup: window.__needsSetup });
  try {
    await initI18n();
    await Promise.all([
      preloadSecurityAssets(),
      initParticles(),
      loadGsap(),
    ]);
  } catch (error) {
    console.warn('[router] Boot preload failed:', error);
  }
  renderRoute(normalizePath(location.pathname));
});

export default { navigate, routeList };
