/** Materials module — CRUD, publish, sanitize */

import db from '../core/db.js';
import { generateId } from '../core/crypto.js';
import { logAction } from './log.js';
import { getSession, hasPermission, isAdmin } from '../core/auth.js';
import { getCategory } from './categories.js';
import { stripPlainText } from '../core/security.js';

const MAX_DESCRIPTION = 500;

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * @param {string} html
 * @returns {string}
 */
export function sanitizeContent(html) {
  if (typeof window.DOMPurify === 'undefined') {
    throw new Error('DOMPurify is required to save HTML content');
  }
  return window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

/**
 * @param {object} material
 * @param {boolean} [categoryGuest=false]
 * @returns {object}
 */
function buildPublicSnapshot(material, categoryGuest = false) {
  const visibility = material.visibility ?? {};
  const guestAccess = Boolean(visibility.guestAccess);
  const allAuthenticated = Boolean(visibility.allAuthenticated);
  const published = material.status === 'published';

  const snapshot = {
    guestAccess: published ? guestAccess : false,
    allAuthenticated: published ? allAuthenticated : false,
    title: published ? (material.title ?? '') : '',
    description: published ? (material.description ?? '') : '',
    authorId: material.authorId ?? null,
    authorName: material.authorName ?? '',
    publishedAt: material.publishedAt ?? null,
    updatedAt: material.updatedAt ?? null,
    publicPayload: null,
  };

  const shouldExposeContent = published && (guestAccess || allAuthenticated || categoryGuest);
  if (shouldExposeContent) {
    snapshot.publicPayload = JSON.stringify({
      title: material.title ?? '',
      description: material.description ?? '',
      contentHtml: material.contentHtml ?? '',
      tags: material.tags ?? [],
      categoryId: material.categoryId ?? null,
      authorId: material.authorId ?? null,
      authorName: material.authorName ?? '',
      publishedAt: material.publishedAt ?? null,
      updatedAt: material.updatedAt ?? null,
      visibility: { guestAccess, allAuthenticated },
      media: material.media ?? { images: [], videos: [], pdf: null, links: [] },
    });
  }

  return snapshot;
}

/**
 * @param {object} material
 * @param {boolean} [categoryGuest=false]
 * @returns {object}
 */
function normalizeMaterial(material, categoryGuest = false) {
  const normalized = {
    id: material.id ?? generateId('mat'),
    title: stripPlainText(material.title ?? ''),
    description: stripPlainText(material.description ?? '').slice(0, MAX_DESCRIPTION),
    categoryId: material.categoryId || null,
    status: material.status === 'published' ? 'published' : 'draft',
    tags: (Array.isArray(material.tags) ? material.tags : [])
      .map((tag) => stripPlainText(tag))
      .filter(Boolean),
    contentHtml: sanitizeContent(material.contentHtml ?? ''),
    media: {
      images: material.media?.images ?? [],
      videos: material.media?.videos ?? [],
      pdf: material.media?.pdf ?? null,
      links: material.media?.links ?? [],
    },
    visibility: {
      guestAccess: Boolean(material.visibility?.guestAccess),
      allAuthenticated: Boolean(material.visibility?.allAuthenticated),
      specificUsers: material.visibility?.specificUsers ?? [],
    },
    authorId: material.authorId,
    authorName: material.authorName ?? '',
    createdAt: material.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    publishedAt: material.publishedAt ?? null,
    deletedAt: material.deletedAt ?? null,
    deletedBy: material.deletedBy ?? null,
    commentsAccess: ['all', 'authenticated', 'disabled'].includes(material.commentsAccess)
      ? material.commentsAccess
      : 'disabled',
  };

  return {
    ...normalized,
    ...buildPublicSnapshot(normalized, categoryGuest),
  };
}

/**
 * @param {object} material
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export function canEditMaterial(material, userId) {
  if (isAdmin()) {
    return true;
  }
  if (hasPermission('content.edit.any')) {
    return true;
  }
  return material.authorId === userId;
}

/**
 * @param {boolean} [includeDeleted=false]
 * @returns {Promise<object[]>}
 */
export async function getAllMaterials(includeDeleted = false) {
  const items = await db.getAll('materials');
  const filtered = includeDeleted ? items : items.filter((m) => !m.deletedAt);
  return filtered.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

/**
 * @param {string} id
 * @returns {Promise<object | null>}
 */
export async function getMaterial(id) {
  return db.get('materials', id);
}

/**
 * @param {object} data
 * @param {object | null} [existing]
 * @returns {Promise<object>}
 */
async function resolveCategoryGuest(data, existing = null) {
  const categoryId = data.categoryId ?? existing?.categoryId;
  if (!categoryId) {
    return false;
  }
  const category = await getCategory(categoryId);
  return Boolean(category?.guestAccess);
}

/**
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createMaterial(data) {
  const session = getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  if (!data.title?.trim()) {
    throw new Error('Назва матеріалу обов\'язкова');
  }

  const categoryGuest = await resolveCategoryGuest(data);
  const material = normalizeMaterial({
    ...data,
    authorId: session.userId,
    authorName: session.displayName ?? session.userId,
    createdAt: Date.now(),
  }, categoryGuest);

  await db.put('materials', material);

  await logAction(
    'materials.create',
    material.id,
    material.title,
    { status: material.status },
    session.userId,
  );

  if (material.status === 'published') {
    await logAction('materials.publish', material.id, material.title, {}, session.userId);
  }

  return material;
}

/**
 * @param {string} id
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function updateMaterial(id, data) {
  const session = getSession();
  const existing = await getMaterial(id);

  if (!existing) {
    throw new Error('Матеріал не знайдено');
  }

  if (!canEditMaterial(existing, session?.userId ?? '')) {
    throw new Error('Немає прав на редагування');
  }

  const wasPublished = existing.status === 'published';
  const categoryGuest = await resolveCategoryGuest(data, existing);
  const material = normalizeMaterial({
    ...existing,
    ...data,
    id,
    authorId: existing.authorId,
    authorName: existing.authorName ?? '',
    createdAt: existing.createdAt,
    publishedAt: data.status === 'published'
      ? (existing.publishedAt ?? Date.now())
      : (data.status === 'draft' ? null : existing.publishedAt),
  }, categoryGuest);

  await db.put('materials', material);

  await logAction('materials.update', material.id, material.title, {}, session?.userId ?? null);

  if (!wasPublished && material.status === 'published') {
    await logAction('materials.publish', material.id, material.title, {}, session?.userId ?? null);
  } else if (wasPublished && material.status === 'draft') {
    await logAction('materials.unpublish', material.id, material.title, {}, session?.userId ?? null);
  }

  return material;
}

/**
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function publishMaterial(id) {
  return updateMaterial(id, { status: 'published' });
}

/**
 * @returns {Promise<object[]>}
 */
export async function getDeletedMaterials() {
  const items = await db.getAll('materials', 'deletedAt', IDBKeyRange.lowerBound(1));
  return items.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

/**
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function softDeleteMaterial(id) {
  const session = getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  if (!hasPermission('content.delete.soft') && !isAdmin()) {
    throw new Error('Немає прав на видалення');
  }

  const existing = await getMaterial(id);
  if (!existing) {
    throw new Error('Матеріал не знайдено');
  }

  if (existing.deletedAt) {
    throw new Error('Матеріал уже в кошику');
  }

  if (!canEditMaterial(existing, session.userId) && !hasPermission('content.delete.soft')) {
    throw new Error('Немає прав на видалення');
  }

  const categoryGuest = await resolveCategoryGuest({ categoryId: existing.categoryId }, existing);
  const material = normalizeMaterial({
    ...existing,
    deletedAt: Date.now(),
    deletedBy: session.userId,
  }, categoryGuest);

  await db.put('materials', material);
  await logAction('materials.delete', material.id, material.title, {}, session.userId);

  return material;
}

/**
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function restoreMaterial(id) {
  const session = getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  if (!hasPermission('content.delete.soft') && !isAdmin()) {
    throw new Error('Немає прав на відновлення');
  }

  const existing = await getMaterial(id);
  if (!existing?.deletedAt) {
    throw new Error('Матеріал не знайдено в кошику');
  }

  const categoryGuest = await resolveCategoryGuest({ categoryId: existing.categoryId }, existing);
  const material = normalizeMaterial({
    ...existing,
    deletedAt: null,
    deletedBy: null,
  }, categoryGuest);

  await db.put('materials', material);
  await logAction('materials.restore', material.id, material.title, {}, session.userId);

  return material;
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function hardDeleteMaterial(id) {
  const session = getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  if (!isAdmin()) {
    throw new Error('Лише адміністратор може видаляти назавжди');
  }

  const existing = await getMaterial(id);
  if (!existing?.deletedAt) {
    throw new Error('Матеріал не знайдено в кошику');
  }

  await db.delete('materials', id);
  await logAction('materials.hard_delete', id, existing.title ?? id, {}, session.userId);
}

/**
 * @returns {Promise<number>}
 */
export async function emptyTrash() {
  const session = getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  if (!isAdmin()) {
    throw new Error('Лише адміністратор може очистити кошик');
  }

  const deleted = await getDeletedMaterials();
  for (const material of deleted) {
    await db.delete('materials', material.id);
  }

  if (deleted.length > 0) {
    await logAction(
      'trash.empty',
      null,
      null,
      { count: deleted.length },
      session.userId,
    );
  }

  return deleted.length;
}

/**
 * @param {string} id
 * @param {{ guestAccess?: boolean, allAuthenticated?: boolean, specificUsers?: string[] }} visibility
 * @returns {Promise<object>}
 */
export async function updateMaterialVisibility(id, visibility) {
  const session = getSession();

  if (!hasPermission('content.visibility')) {
    throw new Error('Немає прав на зміну видимості');
  }

  const existing = await getMaterial(id);
  if (!existing) {
    throw new Error('Матеріал не знайдено');
  }

  const nextVisibility = {
    guestAccess: visibility.guestAccess ?? existing.visibility?.guestAccess ?? false,
    allAuthenticated: visibility.allAuthenticated ?? existing.visibility?.allAuthenticated ?? false,
    specificUsers: visibility.specificUsers ?? existing.visibility?.specificUsers ?? [],
  };

  const categoryGuest = await resolveCategoryGuest({ categoryId: existing.categoryId }, existing);
  const material = normalizeMaterial({
    ...existing,
    visibility: nextVisibility,
  }, categoryGuest);

  await db.put('materials', material);

  await logAction(
    'materials.visibility',
    material.id,
    material.title,
    { visibility: nextVisibility },
    session?.userId ?? null,
  );

  return material;
}

/**
 * Перебудовує publicPayload для опублікованих матеріалів категорії.
 * @param {string} categoryId
 * @returns {Promise<number>}
 */
export async function syncCategoryPublicMaterials(categoryId) {
  const category = await getCategory(categoryId);
  if (!category) {
    return 0;
  }

  const materials = await db.getByIndex('materials', 'categoryId', categoryId);
  let updated = 0;

  for (const existing of materials) {
    if (existing.deletedAt || existing.status !== 'published') {
      continue;
    }

    const material = normalizeMaterial(existing, Boolean(category.guestAccess));
    await db.put('materials', material);
    updated += 1;
  }

  return updated;
}

export default {
  getAllMaterials,
  getMaterial,
  createMaterial,
  updateMaterial,
  publishMaterial,
  softDeleteMaterial,
  restoreMaterial,
  hardDeleteMaterial,
  emptyTrash,
  getDeletedMaterials,
  updateMaterialVisibility,
  sanitizeContent,
  isValidUrl,
  canEditMaterial,
  syncCategoryPublicMaterials,
};
