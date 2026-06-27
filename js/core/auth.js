/** Authentication — sessions, permissions, login/logout */

import db from './db.js';
import { deriveEncryptionKey, verifyPassword } from './crypto.js';
import { logAction } from '../modules/log.js';
import { repairStaleSession } from './security.js';

const SESSION_KEY = 'ai-synergy-session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @returns {Storage}
 */
function getActiveStorage() {
  return localStorage.getItem(SESSION_KEY) ? localStorage : sessionStorage;
}

/**
 * @param {string} token
 * @returns {string}
 */
function toBase64Token(token) {
  const bytes = new Uint8Array(token);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * @param {object} user
 * @returns {Promise<string[]>}
 */
async function resolvePermissions(user) {
  if (user.role === 'admin') {
    return ['*'];
  }

  const role = await db.get('roles', user.role);
  return role?.permissions ?? [];
}

/**
 * @param {string} loginName
 * @param {string} password
 * @param {boolean} [rememberMe=false]
 * @returns {Promise<{ success: boolean, user?: object, error?: string }>}
 */
export async function login(loginName, password, rememberMe = false) {
  try {
    await db.init();

    const matches = await db.getByIndex('users', 'login', loginName.trim());
    const stub = matches[0];

    if (!stub) {
      return { success: false, error: 'Invalid username or password' };
    }

    const valid = await verifyPassword(
      password,
      stub.passwordHash,
      stub.passwordSalt,
    );

    if (!valid) {
      return { success: false, error: 'Invalid username or password' };
    }

    const encKey = await deriveEncryptionKey(password, stub.passwordSalt);
    db.setEncryptionKey(encKey);

    const user = await db.get('users', stub.id);

    if (!user) {
      db.setEncryptionKey(null);
      return { success: false, error: 'User record not found' };
    }

    if (user.status === 'inactive') {
      db.setEncryptionKey(null);
      return { success: false, error: 'Account is deactivated' };
    }

    const permissions = await resolvePermissions(user);
    const tokenBytes = crypto.getRandomValues(new Uint8Array(64));
    const expiresAt = Date.now() + (rememberMe ? REMEMBER_TTL_MS : SESSION_TTL_MS);

    const session = {
      userId: user.id,
      role: user.role,
      permissions,
      displayName: user.displayName ?? user.login,
      expiresAt,
      token: toBase64Token(tokenBytes),
    };

    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);

    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(SESSION_KEY, JSON.stringify(session));

    await logAction('auth.login', user.id, user.login, {}, user.id);

    return { success: true, user };
  } catch (error) {
    db.setEncryptionKey(null);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Login failed',
    };
  }
}

/** Очищає сесію та ключ шифрування. */
export function logout() {
  const session = getSession();

  if (session && window.__encKey) {
    logAction('auth.logout', session.userId, null, {}, session.userId).catch(() => {});
  }

  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  db.setEncryptionKey(null);

  window.dispatchEvent(new CustomEvent('app:navigate', {
    detail: { path: '/', replace: true },
  }));
}

/**
 * @returns {{ userId: string, role: string, permissions: string[], displayName?: string, expiresAt: number, token: string } | null}
 */
export function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw);

    if (!session.expiresAt || Date.now() > session.expiresAt) {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

/**
 * @param {string} permission
 * @returns {boolean}
 */
export function hasPermission(permission) {
  if (isAdmin()) {
    return true;
  }

  const session = getSession();
  if (!session?.permissions) {
    return false;
  }

  return session.permissions.includes(permission);
}

/** @returns {boolean} */
export function isAdmin() {
  const session = getSession();
  return session?.role === 'admin';
}

/**
 * Чи є активна сесія з ключем шифрування (потрібно для dashboard).
 * @returns {boolean}
 */
export function isAuthenticated() {
  repairStaleSession();
  return Boolean(getSession() && window.__encKey);
}

/**
 * @param {string | null} [permission]
 * @returns {boolean}
 */
export function requireAuth(permission = null) {
  if (!isAuthenticated()) {
    window.dispatchEvent(new CustomEvent('app:navigate', {
      detail: { path: '/login', replace: true },
    }));
    return false;
  }

  if (permission && !hasPermission(permission)) {
    window.dispatchEvent(new CustomEvent('app:navigate', {
      detail: { path: '/403', replace: true },
    }));
    return false;
  }

  return true;
}

export default {
  login,
  logout,
  getSession,
  hasPermission,
  isAdmin,
  isAuthenticated,
  requireAuth,
  repairStaleSession,
};
