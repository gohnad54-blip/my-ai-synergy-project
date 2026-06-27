/** Fuse.js search — fuzzy matching with highlight support */

import { getSession } from '../core/auth.js';
import { getVisibleMaterials } from './visibility.js';

/** @typedef {{ indices: [number, number][], key?: string, value?: string }} FuseMatch */

export const FUSE_OPTIONS = {
  keys: [
    { name: 'title', weight: 0.5 },
    { name: 'description', weight: 0.3 },
    { name: 'tags', weight: 0.2 },
  ],
  threshold: 0.3,
  includeMatches: true,
  minMatchCharLength: 2,
};

/** @type {typeof Fuse | null} */
let FuseClass = null;

/** @type {InstanceType<typeof Fuse> | null} */
let fuseIndex = null;

/** @type {object[]} */
let indexedMaterials = [];

/**
 * @returns {Promise<typeof Fuse>}
 */
export function loadFuse() {
  if (FuseClass) {
    return Promise.resolve(FuseClass);
  }

  if (window.Fuse) {
    FuseClass = window.Fuse;
    return Promise.resolve(FuseClass);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-fuse]');
    if (existing) {
      existing.addEventListener('load', () => {
        FuseClass = window.Fuse;
        resolve(FuseClass);
      });
      existing.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/fuse.js@7/dist/fuse.min.js';
    script.dataset.fuse = 'true';
    script.async = true;
    script.onload = () => {
      FuseClass = window.Fuse;
      resolve(FuseClass);
    };
    script.onerror = () => reject(new Error('Failed to load Fuse.js'));
    document.head.appendChild(script);
  });
}

/**
 * @param {object[]} materials
 * @returns {Promise<void>}
 */
export async function buildSearchIndex(materials) {
  const Fuse = await loadFuse();
  indexedMaterials = materials;
  fuseIndex = new Fuse(materials, FUSE_OPTIONS);
}

/**
 * @param {object[]} allMaterials
 * @param {object | null} [session]
 * @param {Map<string, object> | null} [categoryMap]
 * @returns {object[]}
 */
export function filterVisibleMaterials(allMaterials, session = getSession(), categoryMap = null) {
  return getVisibleMaterials(allMaterials, session, categoryMap);
}

/**
 * @typedef {{ item: object, matches: FuseMatch[] | undefined }} SearchHit
 */

/**
 * @param {string} query
 * @param {object[]} [materials]
 * @returns {SearchHit[]}
 */
export function search(query, materials = indexedMaterials) {
  const trimmed = query.trim();

  if (!trimmed || trimmed.length < FUSE_OPTIONS.minMatchCharLength) {
    return materials.map((item) => ({ item, matches: undefined }));
  }

  if (!FuseClass) {
    return materials
      .filter((item) => matchesPlaintext(item, trimmed))
      .map((item) => ({ item, matches: undefined }));
  }

  const instance = materials === indexedMaterials && fuseIndex
    ? fuseIndex
    : new FuseClass(materials, FUSE_OPTIONS);

  return instance.search(trimmed).map((result) => ({
    item: result.item,
    matches: /** @type {FuseMatch[] | undefined} */ (result.matches),
  }));
}

/**
 * @param {object} item
 * @param {string} query
 * @returns {boolean}
 */
function matchesPlaintext(item, query) {
  const q = query.toLowerCase();
  const haystack = [item.title, item.description, ...(item.tags ?? [])].join(' ').toLowerCase();
  return haystack.includes(q);
}

/**
 * @param {string} str
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {[number, number][]} indices
 * @returns {[number, number][]}
 */
function mergeIndices(indices) {
  if (!indices.length) {
    return [];
  }

  const sorted = [...indices].sort((a, b) => a[0] - b[0]);
  /** @type {[number, number][]} */
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * @param {string} text
 * @param {FuseMatch[] | null | undefined} matches
 * @param {string} key
 * @returns {string}
 */
export function highlightMatches(text, matches, key) {
  const safeText = String(text ?? '');
  if (!safeText || !matches?.length) {
    return escapeHtml(safeText);
  }

  const relevant = matches.filter((m) => m.key === key);
  if (!relevant.length) {
    return escapeHtml(safeText);
  }

  /** @type {[number, number][]} */
  const allIndices = [];
  for (const match of relevant) {
    for (const indexPair of match.indices ?? []) {
      allIndices.push(indexPair);
    }
  }

  const merged = mergeIndices(allIndices);
  if (!merged.length) {
    return escapeHtml(safeText);
  }

  let html = '';
  let cursor = 0;

  for (const [start, end] of merged) {
    if (start > cursor) {
      html += escapeHtml(safeText.slice(cursor, start));
    }
    html += `<mark class="search-highlight">${escapeHtml(safeText.slice(start, end + 1))}</mark>`;
    cursor = end + 1;
  }

  if (cursor < safeText.length) {
    html += escapeHtml(safeText.slice(cursor));
  }

  return html;
}

export default {
  FUSE_OPTIONS,
  loadFuse,
  buildSearchIndex,
  filterVisibleMaterials,
  search,
  highlightMatches,
};
