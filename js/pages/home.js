/** Home page — hero, recent public materials, about excerpt */

import { t } from '../core/i18n.js';
import { loadPublicCatalogData, getPublicSetting } from '../modules/public-content.js';
import {
  renderMaterialCard,
  setPageMeta,
} from '../ui/public.js';

export default async function init() {
  setPageMeta({
    title: t('home.meta.title'),
    description: t('home.meta.description'),
  });

  const [{ materials, categoryMap }, aboutText] = await Promise.all([
    loadPublicCatalogData(),
    getPublicSetting(
      'about_text',
      'AI Synergy — спільнота ентузіастів штучного інтелекту. Архів зберігає матеріали зустрічей, статті та записи для членів клубу.',
    ),
  ]);

  const grid = document.getElementById('recent-materials-grid');
  const recent = materials
    .sort((a, b) => (b.publishedAt ?? b.updatedAt ?? 0) - (a.publishedAt ?? a.updatedAt ?? 0))
    .slice(0, 6);

  if (grid) {
    grid.innerHTML = recent.length
      ? recent.map((m) => renderMaterialCard(m, categoryMap)).join('')
      : `<p class="text-dim-text">${t('home.emptyMaterials')}</p>`;
  }

  const aboutEl = document.getElementById('home-about-text');
  if (aboutEl) {
    const excerpt = aboutText.length > 280 ? `${aboutText.slice(0, 277).trim()}…` : aboutText;
    aboutEl.textContent = excerpt;
    aboutEl.removeAttribute('data-i18n');
  }
}
