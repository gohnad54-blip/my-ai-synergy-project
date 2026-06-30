/** Catalog page — filters, Fuse search, pagination */

import { getCollatorLocale, t } from '../core/i18n.js';
import {
  getMaterialTypes,
  loadPublicCatalogData,
} from '../modules/public-content.js';
import { buildSearchIndex, search } from '../modules/search.js';
import {
  escapeHtml,
  renderMaterialCard,
  setPageMeta,
} from '../ui/public.js';

const PAGE_SIZE = 12;

/** @type {object[]} */
let allMaterials = [];
/** @type {Map<string, object>} */
let categoryMap = new Map();
/** @type {object[]} */
let categories = [];
/** @type {number} */
let currentPage = 1;

/**
 * @returns {{ categoryId: string | null, tags: Set<string>, types: Set<string>, query: string, sort: string }}
 */
function readFilters() {
  const params = new URLSearchParams(window.location.search);
  const categoryId = params.get('category') || null;
  const tags = new Set(params.getAll('tag'));
  const types = new Set(params.getAll('type'));
  return {
    categoryId,
    tags,
    types,
    query: document.getElementById('catalog-search')?.value ?? params.get('q') ?? '',
    sort: /** @type {HTMLSelectElement | null} */ (document.getElementById('catalog-sort'))?.value ?? 'newest',
  };
}

/**
 * @param {object[]} list
 * @param {string} sort
 * @returns {object[]}
 */
function sortHits(list, sort) {
  const items = [...list];

  if (sort === 'oldest') {
    items.sort((a, b) => (a.item.publishedAt ?? a.item.updatedAt ?? 0) - (b.item.publishedAt ?? b.item.updatedAt ?? 0));
  } else if (sort === 'title') {
    items.sort((a, b) => (a.item.title ?? '').localeCompare(b.item.title ?? '', getCollatorLocale()));
  } else {
    items.sort((a, b) => (b.item.publishedAt ?? b.item.updatedAt ?? 0) - (a.item.publishedAt ?? a.item.updatedAt ?? 0));
  }

  return items;
}

/**
 * @param {ReturnType<typeof readFilters>} filters
 * @returns {import('../modules/search.js').SearchHit[]}
 */
function applyFilters(filters) {
  let list = [...allMaterials];

  if (filters.categoryId) {
    list = list.filter((m) => m.categoryId === filters.categoryId);
  }

  if (filters.tags.size) {
    list = list.filter((m) => (m.tags ?? []).some((tag) => filters.tags.has(tag)));
  }

  if (filters.types.size) {
    list = list.filter((m) => getMaterialTypes(m).some((type) => filters.types.has(type)));
  }

  const hits = search(filters.query, list);
  return sortHits(hits, filters.sort);
}

function renderFilters() {
  const catRoot = document.getElementById('filter-categories');
  const tagRoot = document.getElementById('filter-tags');
  const filters = readFilters();

  if (catRoot) {
    const items = [
      `<label class="flex cursor-pointer items-center gap-2">
        <input type="radio" name="category-filter" value="" ${!filters.categoryId ? 'checked' : ''} class="category-filter">
        <span>${t('catalog.filterAll')}</span>
      </label>`,
      ...categories.map((c) => `
        <label class="flex cursor-pointer items-center gap-2">
          <input type="radio" name="category-filter" value="${escapeHtml(c.id)}" ${filters.categoryId === c.id ? 'checked' : ''} class="category-filter">
          <span>${escapeHtml(c.name)}</span>
        </label>
      `),
    ];
    catRoot.innerHTML = items.join('');
  }

  if (tagRoot) {
    const tagSet = new Set();
    allMaterials.forEach((m) => (m.tags ?? []).forEach((t) => tagSet.add(t)));
    const tags = [...tagSet].sort((a, b) => a.localeCompare(b, getCollatorLocale()));

    tagRoot.innerHTML = tags.length
      ? tags.map((tag) => `
        <label class="cursor-pointer">
          <input type="checkbox" class="tag-filter sr-only" value="${escapeHtml(tag)}" ${filters.tags.has(tag) ? 'checked' : ''}>
          <span class="inline-block rounded-full border px-2 py-0.5 text-xs transition ${filters.tags.has(tag) ? 'border-neural-glow text-neural-glow' : 'border-pulse-violet/30 text-dim-text hover:border-neural-glow/50'}">${escapeHtml(tag)}</span>
        </label>
      `).join('')
      : '<span class="text-xs text-dim-text">—</span>';
  }

  document.querySelectorAll('.type-filter').forEach((input) => {
    if (input instanceof HTMLInputElement) {
      input.checked = filters.types.has(input.value);
    }
  });
}

/**
 * @param {import('../modules/search.js').SearchHit[]} hits
 * @param {string} query
 */
function renderResults(hits, query) {
  const grid = document.getElementById('catalog-grid');
  const countEl = document.getElementById('catalog-count');
  const pagination = document.getElementById('catalog-pagination');

  const totalPages = Math.max(1, Math.ceil(hits.length / PAGE_SIZE));
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = hits.slice(start, start + PAGE_SIZE);
  const trimmedQuery = query.trim();

  if (countEl) {
    countEl.textContent = t('catalog.foundCount', { count: t('material.count', { n: hits.length }) });
  }

  if (grid) {
    if (pageItems.length) {
      grid.innerHTML = pageItems.map((hit) => renderMaterialCard(hit.item, categoryMap, hit)).join('');
    } else if (trimmedQuery.length >= 2) {
      grid.innerHTML = `<p class="text-dim-text">${t('catalog.noResults', { query: escapeHtml(trimmedQuery) })}</p>`;
    } else {
      grid.innerHTML = `<p class="text-dim-text">${t('catalog.empty')}</p>`;
    }
  }

  if (pagination) {
    if (totalPages <= 1) {
      pagination.innerHTML = '';
      return;
    }

    const buttons = [];
    if (currentPage > 1) {
      buttons.push(`<button type="button" data-page="${currentPage - 1}" class="catalog-page rounded border border-pulse-violet/30 px-3 py-1 text-sm hover:border-neural-glow">←</button>`);
    }
    for (let i = 1; i <= totalPages; i += 1) {
      const active = i === currentPage
        ? 'border-neural-glow text-neural-glow'
        : 'border-pulse-violet/30 text-dim-text hover:border-neural-glow/50';
      buttons.push(`<button type="button" data-page="${i}" class="catalog-page rounded border px-3 py-1 text-sm ${active}">${i}</button>`);
    }
    if (currentPage < totalPages) {
      buttons.push(`<button type="button" data-page="${currentPage + 1}" class="catalog-page rounded border border-pulse-violet/30 px-3 py-1 text-sm hover:border-neural-glow">→</button>`);
    }
    pagination.innerHTML = buttons.join('');
  }
}

function refresh() {
  const filters = readFilters();
  renderFilters();
  renderResults(applyFilters(filters), filters.query);
}

function bindEvents() {
  let searchTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);

  const filtersToggle = document.getElementById('catalog-filters-toggle');
  const filtersPanel = document.getElementById('catalog-filters-panel');
  const filtersChevron = document.getElementById('catalog-filters-chevron');

  filtersToggle?.addEventListener('click', () => {
    if (!filtersPanel) {
      return;
    }
    const willOpen = filtersPanel.classList.contains('hidden');
    filtersPanel.classList.toggle('hidden', !willOpen);
    filtersToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    filtersChevron?.classList.toggle('rotate-180', willOpen);
  });

  document.getElementById('catalog-search')?.addEventListener('input', () => {
    if (searchTimer) {
      clearTimeout(searchTimer);
    }
    searchTimer = setTimeout(() => {
      currentPage = 1;
      refresh();
    }, 300);
  });

  document.getElementById('catalog-sort')?.addEventListener('change', () => {
    currentPage = 1;
    refresh();
  });

  document.getElementById('filter-categories')?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains('category-filter')) {
      return;
    }
    currentPage = 1;
    refresh();
  });

  document.getElementById('filter-tags')?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains('tag-filter')) {
      return;
    }
    currentPage = 1;
    refresh();
  });

  document.getElementById('filter-types')?.addEventListener('change', () => {
    currentPage = 1;
    refresh();
  });

  document.getElementById('catalog-pagination')?.addEventListener('click', (event) => {
    const btn = event.target instanceof HTMLElement ? event.target.closest('.catalog-page') : null;
    if (!(btn instanceof HTMLButtonElement) || !btn.dataset.page) {
      return;
    }
    currentPage = Number(btn.dataset.page);
    refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

export default async function init() {
  setPageMeta({
    title: t('catalog.meta.title'),
    description: t('catalog.meta.description'),
  });

  const data = await loadPublicCatalogData();
  allMaterials = data.materials;
  categories = data.categories;
  categoryMap = data.categoryMap;

  await buildSearchIndex(allMaterials);

  bindEvents();
  refresh();
}
