/** Material page — public view with SEO and media */

import { t } from '../core/i18n.js';
import { loadPublicMaterial, loadPublicCatalogData } from '../modules/public-content.js';
import {
  canShowEditButton,
  escapeHtml,
  formatPublicDate,
  renderMaterialBody,
  setPageMeta,
} from '../ui/public.js';
import { mountCommentsSection } from '../ui/comments.js';

/**
 * @returns {Promise<void>}
 */
async function ensureDOMPurify() {
  if (typeof window.DOMPurify !== 'undefined') {
    return;
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js';
    script.onload = () => resolve(undefined);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * @param {{ params: Record<string, string>, navigate: (path: string) => Promise<void> }} ctx
 */
export default async function init(ctx) {
  await ensureDOMPurify();

  const id = ctx.params?.id;
  if (!id) {
    await ctx.navigate('/404', true);
    return;
  }

  const material = await loadPublicMaterial(id);
  if (!material) {
    await ctx.navigate('/404', true);
    return;
  }

  const { categoryMap } = await loadPublicCatalogData();
  const categoryName = material.categoryId
    ? (categoryMap.get(material.categoryId)?.name ?? '')
    : '';

  const ogImage = material.media?.images?.[0]?.data ?? '/assets/logo.svg';

  setPageMeta({
    title: material.title ?? t('material.noTitle'),
    description: material.description ?? '',
    ogTitle: material.title ?? '',
    ogDescription: material.description ?? '',
    ogImage,
  });

  const breadcrumb = document.getElementById('material-breadcrumb');
  if (breadcrumb) {
    breadcrumb.innerHTML = `
      <a href="/materials" data-spa-nav="/materials" class="text-synapse-blue hover:text-neural-glow">${t('nav.catalog')}</a>
      ${categoryName ? ` <span class="mx-1">›</span> <span>${escapeHtml(categoryName)}</span>` : ''}
      <span class="mx-1">›</span> <span class="text-starfield-white">${escapeHtml(material.title ?? '')}</span>
    `;
  }

  const tags = (material.tags ?? []).map((tag) => (
    `<span class="rounded bg-pulse-violet/15 px-2 py-0.5 text-xs text-dim-text">${escapeHtml(tag)}</span>`
  )).join('');

  const editBtn = canShowEditButton(material)
    ? `<a href="/dashboard/material-edit/${escapeHtml(material.id)}" data-spa-nav="/dashboard/material-edit/${escapeHtml(material.id)}"
        class="rounded-lg border border-pulse-violet/40 px-4 py-2 text-sm text-neural-glow hover:border-neural-glow">${t('material.edit')}</a>`
    : '';

  const article = document.getElementById('material-article');
  if (article) {
    article.innerHTML = `
      <header class="mt-4 border-b border-pulse-violet/20 pb-8">
        <h1 class="font-display text-3xl text-neural-glow md:text-4xl">${escapeHtml(material.title ?? t('material.noTitle'))}</h1>
        <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-dim-text">
          <span>${t('material.author')} ${escapeHtml(material.authorName || '—')}</span>
          <span>${formatPublicDate(material.publishedAt ?? material.updatedAt)}</span>
        </div>
        ${tags ? `<div class="mt-4 flex flex-wrap gap-2">${tags}</div>` : ''}
      </header>

      ${renderMaterialBody(material)}

      <footer class="mt-12 flex flex-wrap gap-4 border-t border-pulse-violet/20 pt-8">
        <a href="/materials" data-spa-nav="/materials" class="text-synapse-blue hover:text-neural-glow">${t('material.backToCatalog')}</a>
        ${editBtn}
      </footer>
    `;
  }

  const commentsSlot = document.getElementById('material-comments');
  if (commentsSlot) {
    await mountCommentsSection(material, commentsSlot);
  }
}
