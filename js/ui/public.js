/** Public site UI — header, cards, SEO, media blocks */

import { getSession, isAuthenticated } from '../core/auth.js';
import { getDateLocale, t } from '../core/i18n.js';
import { canEditMaterial, sanitizeContent } from '../modules/materials.js';
import { highlightMatches } from '../modules/search.js';
import { isSafeMediaSrc } from '../core/security.js';

/**
 * @param {string} str
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {number | null | undefined} ts
 */
export function formatPublicDate(ts) {
  if (!ts) {
    return '—';
  }
  return new Date(ts).toLocaleDateString(getDateLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * @param {{ title?: string, description?: string, ogTitle?: string, ogDescription?: string, ogImage?: string | null }} meta
 */
export function setPageMeta(meta) {
  const title = meta.title ?? 'AI Synergy';
  document.title = title.includes('AI Synergy') ? title : `${title} | AI Synergy`;

  setMetaTag('name', 'description', meta.description ?? t('home.meta.description'));
  setMetaTag('property', 'og:title', meta.ogTitle ?? meta.title ?? 'AI Synergy');
  setMetaTag('property', 'og:description', meta.ogDescription ?? meta.description ?? '');
  if (meta.ogImage) {
    setMetaTag('property', 'og:image', meta.ogImage);
  }
}

/**
 * @param {'name' | 'property'} attr
 * @param {string} key
 * @param {string} content
 */
function setMetaTag(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Оновлює навігацію публічного header (кнопка вхід / dashboard).
 */
export function updatePublicHeaderAuth() {
  const slot = document.getElementById('public-auth-slot');
  if (!slot) {
    return;
  }

  const session = getSession();
  if (isAuthenticated()) {
    slot.innerHTML = `
      <a href="/dashboard" data-nav="/dashboard"
        class="rounded border border-pulse-violet/40 px-3 py-1 text-neural-glow transition hover:border-neural-glow">
        ${t('nav.panel')}
      </a>
    `;
    return;
  }

  if (session) {
    slot.innerHTML = `
      <a href="/login" data-nav="/login"
        class="rounded border border-synapse-blue/40 px-3 py-1 text-synapse-blue transition hover:border-synapse-blue">
        ${t('nav.loginAgain')}
      </a>
    `;
    return;
  }

  slot.innerHTML = `
    <a href="/login" data-nav="/login"
      class="rounded border border-synapse-blue/40 px-3 py-1 text-synapse-blue transition hover:border-synapse-blue hover:shadow-[0_0_12px_rgba(59,130,246,0.3)]">
      ${t('nav.login')}
    </a>
  `;
}

/**
 * @param {object} material
 * @param {Map<string, object>} [categoryMap]
 * @param {{ matches?: import('../modules/search.js').FuseMatch[] }} [searchHit]
 * @returns {string}
 */
export function renderMaterialCard(material, categoryMap = new Map(), searchHit = null) {
  const categoryName = material.categoryId
    ? (categoryMap.get(material.categoryId)?.name ?? '')
    : '';
  const matches = searchHit?.matches;

  const tags = (material.tags ?? []).slice(0, 3).map((tag) => {
    const label = matches
      ? highlightMatches(tag, matches, 'tags')
      : escapeHtml(tag);
    return `<span class="rounded bg-pulse-violet/15 px-2 py-0.5 text-xs text-dim-text">${label}</span>`;
  }).join('');

  const titleHtml = matches
    ? highlightMatches(material.title ?? '', matches, 'title')
    : escapeHtml(material.title || t('material.noTitle'));
  const descriptionHtml = matches
    ? highlightMatches(material.description ?? '', matches, 'description')
    : escapeHtml(material.description || '');

  const thumbSrc = material.media?.images?.[0]?.data;
  const thumb = thumbSrc && isSafeMediaSrc(thumbSrc)
    ? `<img src="${escapeHtml(thumbSrc)}" alt="" class="h-40 w-full object-cover" loading="lazy" decoding="async">`
    : `<div class="flex h-40 items-center justify-center bg-nebula-deep/80 text-4xl text-pulse-violet/40">📄</div>`;

  return `
    <a href="/materials/${escapeHtml(material.id)}" data-spa-nav="/materials/${escapeHtml(material.id)}"
      class="material-card group">
      ${thumb}
      <div class="flex flex-1 flex-col p-4">
        ${categoryName ? `<p class="text-xs uppercase tracking-wide text-dim-text">${escapeHtml(categoryName)}</p>` : ''}
        <h3 class="mt-1 font-medium text-starfield-white group-hover:text-neural-glow">${titleHtml || t('material.noTitle')}</h3>
        <p class="mt-2 line-clamp-2 flex-1 text-sm text-dim-text">${descriptionHtml}</p>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          ${tags}
        </div>
        <p class="mt-3 text-xs text-dim-text">${formatPublicDate(material.publishedAt ?? material.updatedAt)}</p>
      </div>
    </a>
  `;
}

/**
 * @param {string} url
 * @returns {string | null}
 */
export function toVideoEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'youtu.be') {
      const id = host === 'youtu.be'
        ? parsed.pathname.slice(1)
        : parsed.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host === 'vimeo.com') {
      const id = parsed.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }

    if (host === 'loom.com') {
      const id = parsed.pathname.split('/').filter(Boolean).pop();
      return id ? `https://www.loom.com/embed/${id}` : null;
    }

    return url;
  } catch {
    return null;
  }
}

/**
 * @param {object} material
 * @returns {string}
 */
export function renderMaterialBody(material) {
  const parts = [];

  const html = sanitizeContent(material.contentHtml ?? '');
  if (html.trim()) {
    parts.push(`<div class="prose-public">${html}</div>`);
  }

  const images = material.media?.images ?? [];
  if (images.length) {
    parts.push(`
      <section class="mt-10">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-dim-text">${t('material.gallery')}</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          ${images.map((img) => {
            if (!isSafeMediaSrc(img.data)) {
              return '';
            }
            return `
            <img src="${escapeHtml(img.data)}" alt="" class="rounded-lg border border-pulse-violet/20 object-cover" loading="lazy" decoding="async">
          `;
          }).filter(Boolean).join('')}
        </div>
      </section>
    `);
  }

  const videos = material.media?.videos ?? [];
  if (videos.length) {
    parts.push(`
      <section class="mt-10 space-y-4">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-dim-text">${t('material.video')}</h2>
        ${videos.map((video) => {
          const embed = toVideoEmbedUrl(video.url ?? '');
          if (!embed) {
            return `<a href="${escapeHtml(video.url)}" class="text-synapse-blue hover:text-neural-glow" target="_blank" rel="noopener">${escapeHtml(video.url)}</a>`;
          }
          return `
            <div class="aspect-video overflow-hidden rounded-lg border border-pulse-violet/20">
              <iframe src="${escapeHtml(embed)}" class="h-full w-full" allowfullscreen loading="lazy" title="${escapeHtml(t('material.video'))}"></iframe>
            </div>
          `;
        }).join('')}
      </section>
    `);
  }

  const pdf = material.media?.pdf;
  if (pdf) {
    const pdfUrl = pdf.type === 'url' ? pdf.url : pdf.data;
    const label = pdf.name ?? pdf.filename ?? t('material.pdfDoc');
    parts.push(`
      <section class="mt-10">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-dim-text">PDF</h2>
        <a href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener"
          class="inline-flex items-center gap-2 rounded-lg border border-pulse-violet/30 px-4 py-2 text-sm text-neural-glow hover:border-neural-glow">
          📄 ${escapeHtml(label)}
        </a>
      </section>
    `);
  }

  const links = material.media?.links ?? [];
  if (links.length) {
    parts.push(`
      <section class="mt-10">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-dim-text">${t('material.link')}</h2>
        <ul class="space-y-2">
          ${links.map((link) => `
            <li>
              <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener"
                class="text-synapse-blue hover:text-neural-glow">${escapeHtml(link.label || link.url)}</a>
            </li>
          `).join('')}
        </ul>
      </section>
    `);
  }

  return parts.join('');
}

/**
 * @param {object} material
 * @returns {boolean}
 */
export function canShowEditButton(material) {
  const session = getSession();
  if (!session || !isAuthenticated()) {
    return false;
  }
  return canEditMaterial(material, session.userId);
}

/**
 * Мобільне меню для публічних header (<640px).
 */
export function initPublicMobileNav() {
  const headerRow = document.querySelector('#app > header > div');
  const nav = headerRow?.querySelector('nav');
  if (!headerRow || !nav || headerRow.querySelector('#public-nav-toggle')) {
    return;
  }

  nav.id = 'public-nav-links';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'public-nav-toggle';
  toggle.className = 'rounded-lg border border-pulse-violet/30 p-2 text-neural-glow sm:hidden';
  toggle.setAttribute('aria-label', t('common.openMenu'));
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = `
    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
    </svg>
  `;

  headerRow.classList.add('w-full');
  headerRow.parentElement?.classList.add('relative');
  headerRow.appendChild(toggle);

  /**
   * @param {boolean} mobile
   */
  function syncNavVisibility(mobile) {
    if (mobile) {
      nav.classList.add('hidden', 'absolute', 'left-0', 'right-0', 'top-full', 'z-50', 'mt-2', 'flex-col', 'rounded-xl', 'border', 'border-pulse-violet/25', 'bg-nebula-deep', 'p-4', 'shadow-lg');
      nav.classList.remove('flex-wrap');
      toggle.setAttribute('aria-expanded', 'false');
    } else {
      nav.classList.remove('hidden', 'absolute', 'left-0', 'right-0', 'top-full', 'z-50', 'mt-2', 'flex-col', 'rounded-xl', 'border', 'border-pulse-violet/25', 'bg-nebula-deep', 'p-4', 'shadow-lg', 'shadow-none');
      nav.classList.add('flex-wrap');
    }
  }

  const mq = window.matchMedia('(max-width: 639px)');
  syncNavVisibility(mq.matches);
  mq.addEventListener('change', (event) => syncNavVisibility(event.matches));

  toggle.addEventListener('click', () => {
    if (!mq.matches) {
      return;
    }
    const willShow = nav.classList.contains('hidden');
    nav.classList.toggle('hidden', !willShow);
    toggle.setAttribute('aria-expanded', willShow ? 'true' : 'false');
  });
}

export default {
  escapeHtml,
  formatPublicDate,
  setPageMeta,
  updatePublicHeaderAuth,
  renderMaterialCard,
  renderMaterialBody,
  canShowEditButton,
  initPublicMobileNav,
};
