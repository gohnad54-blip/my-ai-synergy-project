/** Users module — CRUD and password management */

import db from '../core/db.js';
import { generateId, hashPassword } from '../core/crypto.js';
import { logAction } from './log.js';
import { getSession } from '../core/auth.js';

const LOGIN_PATTERN = /^[a-zA-Z0-9]{4,}$/;

/**
 * @returns {Promise<object[]>}
 */
export async function getAllUsers() {
  const users = await db.getAll('users');
  return users.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/**
 * @param {string} id
 * @returns {Promise<object | null>}
 */
export async function getUser(id) {
  return db.get('users', id);
}

/**
 * @param {string} login
 * @returns {Promise<boolean>}
 */
export async function isLoginTaken(login) {
  const matches = await db.getByIndex('users', 'login', login.trim());
  return matches.length > 0;
}

/**
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createUser(data) {
  const login = data.login.trim();

  if (!LOGIN_PATTERN.test(login)) {
    throw new Error('Логін: лише латиниця та цифри, мінімум 4 символи');
  }

  if (data.password.length < 8) {
    throw new Error('Пароль має містити мінімум 8 символів');
  }

  if (await isLoginTaken(login)) {
    throw new Error('Цей логін уже зайнятий');
  }

  const { hash, salt } = await hashPassword(data.password);
  const user = {
    id: generateId('usr'),
    login,
    passwordHash: hash,
    passwordSalt: salt,
    displayName: data.displayName.trim(),
    role: data.role,
    status: 'active',
    passwordChangePolicy: data.passwordChangePolicy ?? 'never',
    adminNote: data.adminNote?.trim() ?? '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db.put('users', user);

  const session = getSession();
  await logAction('users.create', user.id, login, {}, session?.userId ?? null);

  return user;
}

/**
 * @param {string} id
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function updateUser(id, data) {
  const existing = await getUser(id);
  if (!existing) {
    throw new Error('Користувача не знайдено');
  }

  if (existing.role === 'admin' && data.role && data.role !== 'admin') {
    const admins = (await getAllUsers()).filter((u) => u.role === 'admin' && u.status !== 'inactive');
    if (admins.length <= 1 && admins[0]?.id === id) {
      throw new Error('Неможливо зняти роль останнього адміністратора');
    }
  }

  const wasInactive = existing.status === 'inactive';
  const user = {
    ...existing,
    displayName: data.displayName?.trim() ?? existing.displayName,
    role: data.role ?? existing.role,
    status: data.status ?? existing.status,
    passwordChangePolicy: data.passwordChangePolicy ?? existing.passwordChangePolicy,
    adminNote: data.adminNote?.trim() ?? existing.adminNote,
    updatedAt: Date.now(),
  };

  await db.put('users', user);

  const session = getSession();
  await logAction('users.update', user.id, user.login, {}, session?.userId ?? null);

  if (!wasInactive && user.status === 'inactive') {
    await logAction('users.deactivate', user.id, user.login, {}, session?.userId ?? null);
  }

  return user;
}

/**
 * @param {string} id
 * @param {string} newPassword
 * @returns {Promise<void>}
 */
export async function changePassword(id, newPassword) {
  if (newPassword.length < 8) {
    throw new Error('Пароль має містити мінімум 8 символів');
  }

  const existing = await getUser(id);
  if (!existing) {
    throw new Error('Користувача не знайдено');
  }

  const { hash, salt } = await hashPassword(newPassword);
  await db.put('users', {
    ...existing,
    passwordHash: hash,
    passwordSalt: salt,
    updatedAt: Date.now(),
  });

  const session = getSession();
  await logAction('users.password_change', id, existing.login, {}, session?.userId ?? null);
}

/**
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function deactivateUser(id) {
  const session = getSession();
  if (session?.userId === id) {
    throw new Error('Не можна деактивувати власний акаунт');
  }

  return updateUser(id, { status: 'inactive' });
}

/**
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function activateUser(id) {
  return updateUser(id, { status: 'active' });
}

export default {
  getAllUsers,
  getUser,
  createUser,
  updateUser,
  changePassword,
  deactivateUser,
  activateUser,
  isLoginTaken,
};
