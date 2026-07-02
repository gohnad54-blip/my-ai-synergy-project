/** Roles module — CRUD and permission definitions */

import db from '../core/db.js';
import { generateId } from '../core/crypto.js';
import { logAction } from './log.js';
import { getSession } from '../core/auth.js';

/** @typedef {{ id: string, label: string, adminOnly?: boolean }} PermissionDef */
/** @typedef {{ id: string, label: string, permissions: PermissionDef[] }} PermissionGroup */

/** Повноваження, які не можна призначити кастомній ролі. */
export const ADMIN_ONLY_PERMISSIONS = [
  'users.create',
  'users.edit',
  'users.assign_role',
  'roles.manage',
  'log.view',
  'backup.import',
];

/** @type {PermissionGroup[]} */
export const PERMISSION_GROUPS = [
  {
    id: 'content',
    label: 'КОНТЕНТ',
    permissions: [
      { id: 'content.view.restricted', label: 'Перегляд закритого контенту' },
      { id: 'content.create', label: 'Створення матеріалів' },
      { id: 'content.edit.any', label: 'Редагування будь-яких матеріалів' },
      { id: 'content.delete.soft', label: 'Видалення в кошик' },
      { id: 'content.publish', label: 'Публікація матеріалів' },
      { id: 'content.visibility', label: 'Управління видимістю' },
    ],
  },
  {
    id: 'taxonomy',
    label: 'ТАКСОНОМІЯ',
    permissions: [
      { id: 'taxonomy.create', label: 'Створення категорій/тегів' },
      { id: 'taxonomy.edit', label: 'Редагування категорій/тегів' },
      { id: 'taxonomy.delete', label: 'Видалення категорій/тегів' },
    ],
  },
  {
    id: 'users',
    label: 'КОРИСТУВАЧІ',
    permissions: [
      { id: 'users.view', label: 'Перегляд списку користувачів' },
      { id: 'users.create', label: 'Створення акаунтів', adminOnly: true },
      { id: 'users.edit', label: 'Редагування акаунтів', adminOnly: true },
      { id: 'users.assign_role', label: 'Призначення ролей', adminOnly: true },
    ],
  },
  {
    id: 'requests',
    label: 'ЗАЯВКИ',
    permissions: [
      { id: 'requests.view', label: 'Перегляд заявок' },
      { id: 'requests.process', label: 'Обробка заявок' },
    ],
  },
  {
    id: 'chat',
    label: 'ЧАТ',
    permissions: [
      { id: 'polls.create', label: 'Створення опитувань у груповому чаті' },
      { id: 'polls.view_voters', label: 'Перегляд хто як голосував' },
    ],
  },
  {
    id: 'system',
    label: 'СИСТЕМА',
    permissions: [
      { id: 'backup.export', label: 'Експорт бекапу' },
      { id: 'backup.import', label: 'Імпорт бекапу', adminOnly: true },
      { id: 'log.view', label: 'Перегляд журналу', adminOnly: true },
      { id: 'roles.manage', label: 'Управління ролями', adminOnly: true },
    ],
  },
];

/**
 * @returns {Promise<object[]>}
 */
export async function getAllRoles() {
  const roles = await db.getAll('roles');
  return roles.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'uk'));
}

/**
 * @param {string} id
 * @returns {Promise<object | null>}
 */
export async function getRole(id) {
  return db.get('roles', id);
}

/**
 * @param {string} roleId
 * @returns {Promise<number>}
 */
export async function countUsersWithRole(roleId) {
  const users = await db.getAll('users');
  return users.filter((u) => u.role === roleId).length;
}

/**
 * @param {{ name: string, permissions: string[] }} data
 * @returns {Promise<object>}
 */
export async function createRole(data) {
  const permissions = filterAssignablePermissions(data.permissions);
  const role = {
    id: generateId('role'),
    name: data.name.trim(),
    permissions,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db.put('roles', role);

  const session = getSession();
  await logAction('roles.create', role.id, role.name, {}, session?.userId ?? null);

  return role;
}

/**
 * @param {string} id
 * @param {{ name: string, permissions: string[] }} data
 * @returns {Promise<object>}
 */
export async function updateRole(id, data) {
  const existing = await getRole(id);
  if (!existing) {
    throw new Error('Роль не знайдено');
  }

  const permissions = filterAssignablePermissions(data.permissions);
  const role = {
    ...existing,
    name: data.name.trim(),
    permissions,
    updatedAt: Date.now(),
  };

  await db.put('roles', role);

  const session = getSession();
  await logAction('roles.update', role.id, role.name, {}, session?.userId ?? null);

  return role;
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteRole(id) {
  const existing = await getRole(id);
  if (!existing) {
    throw new Error('Роль не знайдено');
  }

  const assigned = await countUsersWithRole(id);
  if (assigned > 0) {
    throw new Error(`Роль призначена ${assigned} користувачам. Спочатку змініть їх ролі.`);
  }

  await db.delete('roles', id);

  const session = getSession();
  await logAction('roles.delete', id, existing.name, {}, session?.userId ?? null);
}

/**
 * @param {string[]} permissions
 * @returns {string[]}
 */
export function filterAssignablePermissions(permissions) {
  return permissions.filter((p) => !ADMIN_ONLY_PERMISSIONS.includes(p));
}

/**
 * @param {string} roleId
 * @param {Map<string, object>} [roleMap]
 * @returns {string}
 */
export function getRoleLabel(roleId, roleMap = new Map()) {
  if (roleId === 'admin') {
    return 'Адміністратор';
  }
  return roleMap.get(roleId)?.name ?? roleId;
}

export default {
  getAllRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  PERMISSION_GROUPS,
  ADMIN_ONLY_PERMISSIONS,
  getRoleLabel,
};
