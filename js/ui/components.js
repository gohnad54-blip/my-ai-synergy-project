/** Shared UI — dashboard shell, sidebar, mobile menu */

import { getSession, hasPermission, isAdmin, logout } from '../core/auth.js';
import { t } from '../core/i18n.js';
import { sidebarSlide } from './animations.js';

/** @typedef {{ href?: string, labelKey: string, icon?: string, permission?: string, adminOnly?: boolean, always?: boolean, children?: NavItem[], type?: string }} NavItem */

/** @type {NavItem[]} */
const SIDEBAR_NAV = [
  { href: '/dashboard', labelKey: 'dashboard.home', icon: '📊', always: true },
  {
    type: 'group',
    labelKey: 'dashboard.materials',
    icon: '📁',
    permission: 'content.create',
    children: [
      { href: '/dashboard/materials', labelKey: 'dashboard.materialsAll' },
      { href: '/dashboard/materials?mine=1', labelKey: 'dashboard.materialsMine' },
      { href: '/dashboard/trash', labelKey: 'dashboard.trash', permission: 'content.delete.soft' },
    ],
  },
  { href: '/dashboard/categories', labelKey: 'dashboard.categories', icon: '🏷️', permission: 'taxonomy.create' },
  { href: '/dashboard/users', labelKey: 'dashboard.users', icon: '👥', permission: 'users.view' },
  { href: '/dashboard/requests', labelKey: 'dashboard.requests', icon: '📋', permission: 'requests.view' },
  { href: '/dashboard/roles', labelKey: 'dashboard.roles', icon: '🛡️', adminOnly: true },
  { href: '/dashboard/log', labelKey: 'dashboard.log', icon: '📜', adminOnly: true },
  { href: '/dashboard/settings', labelKey: 'dashboard.settings', icon: '⚙️', adminOnly: true },
];

/**
 * @param {NavItem} item
 * @returns {boolean}
 */
function canSeeNavItem(item) {
  if (item.always) {
    return true;
  }
  if (item.adminOnly && !isAdmin()) {
    return false;
  }
  if (item.permission && !hasPermission(item.permission)) {
    return false;
  }
  if (item.type === 'group' && item.children) {
    return item.children.some((child) => canSeeNavItem(child));
  }
  return true;
}

/**
 * @param {string} href
 * @returns {boolean}
 */
export function isDashboardNavActive(href) {
  const url = new URL(href, window.location.origin);
  const navPath = url.pathname.replace(/\/+$/, '') || '/';
  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';

  if (navPath === '/dashboard' && !url.search) {
    return currentPath === '/dashboard';
  }

  if (currentPath !== navPath) {
    return false;
  }

  if (url.search.includes('mine=1')) {
    return window.location.search.includes('mine=1');
  }

  if (navPath === '/dashboard/materials' && !url.search) {
    return !window.location.search.includes('mine=1');
  }

  return window.location.search === url.search || (!url.search && !window.location.search);
}

/**
 * @param {NavItem} item
 * @returns {string}
 */
function renderNavLink(item) {
  const href = item.href ?? '#';
  const active = item.href ? isDashboardNavActive(href) : false;
  const activeClass = active
    ? 'bg-pulse-violet/20 text-neural-glow border-l-2 border-neural-glow'
    : 'text-dim-text hover:bg-nebula-deep hover:text-starfield-white border-l-2 border-transparent';

  return `
    <a href="${href}" data-dashboard-nav="${href}"
      class="flex items-center gap-3 rounded-r-lg px-4 py-2.5 text-sm transition ${activeClass}">
      ${item.icon ? `<span class="text-base" aria-hidden="true">${item.icon}</span>` : ''}
      <span data-i18n="${item.labelKey}">${t(item.labelKey)}</span>
    </a>
  `;
}

/**
 * @param {NavItem} item
 * @returns {string}
 */
function renderNavItem(item) {
  if (item.type === 'group' && item.children) {
    const visibleChildren = item.children.filter((child) => canSeeNavItem(child));
    if (visibleChildren.length === 0) {
      return '';
    }

    const childLinks = visibleChildren.map((child) => {
      const href = child.href ?? '#';
      const active = isDashboardNavActive(href);
      const activeClass = active ? 'text-neural-glow' : 'text-dim-text hover:text-starfield-white';

      return `
        <a href="${href}" data-dashboard-nav="${href}"
          class="block rounded-lg py-2 pl-11 pr-3 text-sm transition ${activeClass}">
          <span data-i18n="${child.labelKey}">${t(child.labelKey)}</span>
        </a>
      `;
    }).join('');

    return `
      <div class="py-1">
        <p class="flex items-center gap-3 px-4 py-2 text-xs font-medium uppercase tracking-wider text-dim-text">
          <span aria-hidden="true">${item.icon ?? ''}</span>
          <span data-i18n="${item.labelKey}">${t(item.labelKey)}</span>
        </p>
        ${childLinks}
      </div>
    `;
  }

  return renderNavLink(item);
}

/**
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * @returns {string}
 */
function renderSidebarNav() {
  return SIDEBAR_NAV
    .filter((item) => canSeeNavItem(item))
    .map((item) => renderNavItem(item))
    .join('');
}

/**
 * @param {string} pageHtml
 * @returns {string}
 */
export function wrapDashboardPage(pageHtml) {
  const session = getSession();
  const displayName = session?.displayName ?? session?.userId ?? t('common.user');
  const initials = getInitials(displayName);
  const navHtml = renderSidebarNav();

  return `
    <div class="dashboard-layout flex min-h-screen">
      <div id="sidebar-overlay" class="fixed inset-0 z-40 bg-space-void/80 opacity-0 pointer-events-none transition-opacity duration-300 lg:hidden" aria-hidden="true"></div>

      <aside id="dashboard-sidebar"
        class="dashboard-sidebar fixed inset-y-0 left-0 z-50 flex w-[260px] -translate-x-full flex-col border-r border-pulse-violet/20 bg-nebula-deep transition-transform duration-300 lg:static lg:translate-x-0">
        <div class="border-b border-pulse-violet/20 px-5 py-5">
          <div class="flex items-center justify-between gap-2">
            <a href="/dashboard" class="flex items-center gap-2 font-display text-lg text-neural-glow">
              <span aria-hidden="true">🔮</span>
              AI Synergy
            </a>
            <span id="dashboard-lang-switcher-slot"></span>
          </div>
        </div>

        <nav class="flex-1 space-y-1 overflow-y-auto py-4" aria-label="Dashboard navigation">
          ${navHtml}
        </nav>

        <div class="border-t border-pulse-violet/20 p-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pulse-violet/30 text-sm font-medium text-neural-glow" aria-hidden="true">
              ${initials}
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">${displayName}</p>
              <p class="truncate text-xs text-dim-text" data-i18n="${isAdmin() ? 'common.admin' : 'common.user'}">${t(isAdmin() ? 'common.admin' : 'common.user')}</p>
            </div>
          </div>
          <button type="button" id="dashboard-logout"
            class="mt-3 w-full rounded-lg border border-pulse-violet/30 px-3 py-2 text-sm text-dim-text transition hover:border-neural-glow hover:text-neural-glow"
            data-i18n="auth.logout">
            ${t('auth.logout')}
          </button>
        </div>
      </aside>

      <div class="flex min-h-screen min-w-0 flex-1 flex-col">
        <header class="sticky top-0 z-30 flex items-center gap-4 border-b border-pulse-violet/20 bg-nebula-deep/95 px-4 py-3 backdrop-blur-sm lg:hidden">
          <button type="button" id="sidebar-toggle" data-i18n-aria="common.openMenu"
            class="rounded-lg border border-pulse-violet/30 p-2 text-neural-glow hover:border-neural-glow">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
          <span class="font-display text-sm text-neural-glow">AI Synergy</span>
          <span id="dashboard-lang-switcher-slot-mobile" class="ml-auto"></span>
        </header>

        <main id="dashboard-outlet" class="flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8">
          ${pageHtml}
        </main>
      </div>
    </div>
  `;
}

/**
 * @param {string} path
 */
export function initDashboardShell(path) {
  const sidebar = document.getElementById('dashboard-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const toggle = document.getElementById('sidebar-toggle');
  const logoutBtn = document.getElementById('dashboard-logout');

  /**
   * @param {boolean} open
   */
  function setSidebarOpen(open) {
    const isMobile = window.innerWidth < 1024;

    if (!isMobile) {
      overlay?.classList.add('opacity-0', 'pointer-events-none');
      overlay?.classList.remove('opacity-100');
      document.body.classList.remove('overflow-hidden');
      return;
    }

    sidebarSlide(
      sidebar instanceof HTMLElement ? sidebar : null,
      overlay instanceof HTMLElement ? overlay : null,
      open,
    );
    document.body.classList.toggle('overflow-hidden', open);
  }

  setSidebarOpen(false);

  toggle?.addEventListener('click', () => {
    const isClosed = sidebar?.classList.contains('-translate-x-full');
    setSidebarOpen(Boolean(isClosed));
  });

  overlay?.addEventListener('click', () => setSidebarOpen(false));

  logoutBtn?.addEventListener('click', () => logout());

  document.querySelectorAll('[data-dashboard-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
      setSidebarOpen(true);
      document.body.classList.remove('overflow-hidden');
    } else {
      setSidebarOpen(false);
    }
  }, { once: false });

  document.title = `${getDashboardTitle(path)} — AI Synergy`;
}

/**
 * @param {string} path
 * @returns {string}
 */
function getDashboardTitle(path) {
  const titles = {
    '/dashboard': t('dashboard.home'),
    '/dashboard/materials': t('dashboard.materials'),
    '/dashboard/trash': t('dashboard.trash'),
    '/dashboard/categories': t('dashboard.categories'),
    '/dashboard/users': t('dashboard.users'),
    '/dashboard/user-create': t('dashboard.newUser'),
    '/dashboard/roles': t('dashboard.roles'),
    '/dashboard/requests': t('dashboard.requests'),
    '/dashboard/log': t('dashboard.log'),
    '/dashboard/settings': t('dashboard.settings'),
  };

  if (path.startsWith('/dashboard/material-edit')) {
    return t('dashboard.materialEditor');
  }

  return titles[path] ?? t('dashboard.title');
}

/** @param {string} path @returns {boolean} */
export function isDashboardPath(path) {
  return path === '/dashboard' || path.startsWith('/dashboard/');
}

export default {
  wrapDashboardPage,
  initDashboardShell,
  isDashboardPath,
  isDashboardNavActive,
};
