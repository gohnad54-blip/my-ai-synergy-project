/** Categories module — taxonomy with guest access flags */

import db from '../core/db.js';
import { generateId } from '../core/crypto.js';
import { logAction } from './log.js';
import { getSession } from '../core/auth.js';

/**
 * @param {object} category
 * @returns {object}
 */
function normalizeCategory(category) {
  return {
    id: category.id ?? generateId('cat'),
    name: (category.name ?? '').trim(),
    parentId: category.parentId ?? null,
    guestAccess: Boolean(category.guestAccess),
    createdBy: category.createdBy,
    createdAt: category.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * @returns {Promise<object[]>}
 */
export async function getAllCategories() {
  const items = await db.getAll('categories');
  return items.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'uk'));
}

/**
 * @param {string} id
 * @returns {Promise<object | null>}
 */
export async function getCategory(id) {
  return db.get('categories', id);
}

/**
 * @param {{ name: string, parentId?: string | null, guestAccess?: boolean }} data
 * @returns {Promise<object>}
 */
export async function createCategory(data) {
  const session = getSession();
  const name = data.name?.trim();

  if (!name) {
    throw new Error('Назва категорії обов\'язкова');
  }

  const category = normalizeCategory({
    name,
    parentId: data.parentId ?? null,
    guestAccess: Boolean(data.guestAccess),
    createdBy: session?.userId ?? null,
    createdAt: Date.now(),
  });

  await db.put('categories', category);

  await logAction(
    'categories.create',
    category.id,
    category.name,
    { guestAccess: category.guestAccess },
    session?.userId ?? null,
  );

  return category;
}

/**
 * @param {string} id
 * @param {Partial<{ name: string, parentId: string | null, guestAccess: boolean }>} data
 * @returns {Promise<object>}
 */
export async function updateCategory(id, data) {
  const session = getSession();
  const existing = await getCategory(id);

  if (!existing) {
    throw new Error('Категорію не знайдено');
  }

  const category = normalizeCategory({
    ...existing,
    ...data,
    id,
    createdBy: existing.createdBy,
    createdAt: existing.createdAt,
  });

  await db.put('categories', category);

  await logAction('categories.update', category.id, category.name, {}, session?.userId ?? null);

  return category;
}

/**
 * @param {string} id
 * @param {boolean} guestAccess
 * @returns {Promise<object>}
 */
export async function setCategoryGuestAccess(id, guestAccess) {
  const session = getSession();
  const existing = await getCategory(id);

  if (!existing) {
    throw new Error('Категорію не знайдено');
  }

  const category = await updateCategory(id, { guestAccess: Boolean(guestAccess) });

  await logAction(
    'categories.visibility',
    category.id,
    category.name,
    { guestAccess: category.guestAccess },
    session?.userId ?? null,
  );

  return category;
}

export default {
  getAllCategories,
  getCategory,
  createCategory,
  updateCategory,
  setCategoryGuestAccess,
};
