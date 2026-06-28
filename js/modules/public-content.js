/** Public content loading — hydrate materials for unauthenticated viewers */

import db from '../core/db.js';
import { getSession } from '../core/auth.js';
import { getVisibleMaterials, canAccessCategory } from './visibility.js';

/**
 * @param {object} record
 * @returns {object}
 */
export function hydrateMaterial(record) {
  if (!record) {
    return record;
  }

  let material = { ...record };

  if (record.publicPayload && typeof record.publicPayload === 'string') {
    try {
      const payload = JSON.parse(record.publicPayload);
      material = {
        ...material,
        ...payload,
        visibility: {
          guestAccess: Boolean(payload.visibility?.guestAccess ?? record.guestAccess),
          allAuthenticated: Boolean(payload.visibility?.allAuthenticated ?? record.allAuthenticated),
          specificUsers: material.visibility?.specificUsers ?? [],
        },
      };
    } catch {
      // ignore invalid payload
    }
  }

  if (!material.visibility) {
    material.visibility = {
      guestAccess: Boolean(record.guestAccess),
      allAuthenticated: Boolean(record.allAuthenticated),
      specificUsers: record.visibility?.specificUsers ?? [],
    };
  }

  if (!material.title && record.title) {
    material.title = record.title;
  }
  if (!material.description && record.description) {
    material.description = record.description;
  }
  if (!material.authorName && record.authorName) {
    material.authorName = record.authorName;
  }
  if (!material.commentsAccess && record.commentsAccess) {
    material.commentsAccess = record.commentsAccess;
  }
  if (!material.commentsAccess) {
    material.commentsAccess = 'disabled';
  }

  return material;
}

/**
 * @returns {Promise<{ materials: object[], categories: object[], categoryMap: Map<string, object>, session: object | null }>}
 */
export async function loadPublicCatalogData() {
  await db.init();

  const session = getSession();
  const [rawMaterials, categories] = await Promise.all([
    db.getAll('materials'),
    db.getAll('categories'),
  ]);

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const published = rawMaterials
    .filter((m) => m.status === 'published' && !m.deletedAt)
    .map(hydrateMaterial);

  const materials = getVisibleMaterials(published, session, categoryMap);

  return {
    materials,
    categories: categories.filter((c) => canAccessCategory(c, session)),
    categoryMap,
    session,
  };
}

/**
 * @param {string} id
 * @returns {Promise<object | null>}
 */
export async function loadPublicMaterial(id) {
  const { categoryMap, session } = await loadPublicCatalogData();
  const stored = await db.get('materials', id);
  if (!stored || stored.deletedAt) {
    return null;
  }

  const material = hydrateMaterial(stored);
  const visible = getVisibleMaterials([material], session, categoryMap);
  return visible[0] ?? null;
}

/**
 * @param {string} key
 * @param {string} [fallback='']
 * @returns {Promise<string>}
 */
export async function getPublicSetting(key, fallback = '') {
  await db.init();
  const setting = await db.get('settings', key);
  return typeof setting?.value === 'string' ? setting.value : fallback;
}

/**
 * @param {object} material
 * @returns {string[]}
 */
export function getMaterialTypes(material) {
  /** @type {string[]} */
  const types = [];
  if (material.contentHtml?.replace(/<[^>]+>/g, '').trim()) {
    types.push('article');
  }
  if (material.media?.images?.length) {
    types.push('image');
  }
  if (material.media?.videos?.length) {
    types.push('video');
  }
  if (material.media?.pdf) {
    types.push('pdf');
  }
  if (material.media?.links?.length) {
    types.push('link');
  }
  return types.length ? types : ['article'];
}

export default {
  hydrateMaterial,
  loadPublicCatalogData,
  loadPublicMaterial,
  getPublicSetting,
  getMaterialTypes,
};
