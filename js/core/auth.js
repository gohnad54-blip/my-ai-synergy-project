/** Authentication — sessions, permissions, login/logout */

import db from './db.js';
import { deriveEncryptionKey, verifyPassword } from './crypto.js';
import { logAction } from '../modules/log.js';
import { repairStaleSession } from './security.js';

const SESSION_KEY = 'ai-synergy-session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_ATTEMPTS_KEY = 'ai-synergy-login-attempts';
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

/**
 * @returns {{ count: number, lockUntil: number }}
 */
function getLoginAttemptState() {
  try {
    const raw = localStorage.getItem(LOGIN_ATTEMPTS_KEY);
    if (!raw) {
      return { count: 0, lockUntil: 0 };
    }
    return JSON.parse(raw);
  } catch {
    return { count: 0, lockUntil: 0 };
  }
}

/**
 * @returns {number} ms until unlock, 0 if not locked
 */
export function getLoginLockoutRemainingMs() {
  const state = getLoginAttemptState();
  const now = Date.now();

  if (state.lockUntil > now) {
    return state.lockUntil - now;
  }

  if (state.lockUntil > 0 && state.lockUntil <= now) {
    localStorage.removeItem(LOGIN_ATTEMPTS_KEY);
  }

  return 0;
}

function recordLoginFailure() {
  const state = getLoginAttemptState();
  const count = state.count + 1;
  const lockUntil = count >= MAX_LOGIN_ATTEMPTS
    ? Date.now() + LOGIN_LOCKOUT_MS
    : 0;

  localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify({ count, lockUntil }));
}

function clearLoginAttempts() {
  localStorage.removeItem(LOGIN_ATTEMPTS_KEY);
}

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
  const lockRemaining = getLoginLockoutRemainingMs();
  if (lockRemaining > 0) {
    return {
      success: false,
      error: 'LOGIN_LOCKED',
      lockRemainingMs: lockRemaining,
    };
  }

  try {
    await db.init();

    const user = await db.getUserForLogin(loginName.trim());

    if (!user) {
      recordLoginFailure();
      return { success: false, error: 'Invalid username or password' };
    }

    const valid = await verifyPassword(
      password,
      user.passwordHash,
      user.passwordSalt,
    );

    if (!valid) {
      recordLoginFailure();
      return { success: false, error: 'Invalid username or password' };
    }

    if (user.status === 'inactive') {
      return { success: false, error: 'Account is deactivated' };
    }

    const encKey = await deriveEncryptionKey(password, user.passwordSalt);
    db.setEncryptionKey(encKey);

    const tokenBytes = crypto.getRandomValues(new Uint8Array(64));
    const token = toBase64Token(tokenBytes);
    const expiresAt = Date.now() + (rememberMe ? REMEMBER_TTL_MS : SESSION_TTL_MS);

    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);

    const storage = rememberMe ? localStorage : sessionStorage;
    const session = {
      userId: user.id,
      role: user.role,
      permissions: [],
      displayName: user.displayName ?? user.login,
      expiresAt,
      token,
    };
    storage.setItem(SESSION_KEY, JSON.stringify(session));

    await db.createAppSession(token, user.id, expiresAt);

    session.permissions = await resolvePermissions(user);
    storage.setItem(SESSION_KEY, JSON.stringify(session));

    clearLoginAttempts();

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

  if (session?.token) {
    db.deleteAppSession(session.token).catch(() => {});
  }

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
 * Чи є активна сесія (потрібно для dashboard).
 * @returns {boolean}
 */
export function isAuthenticated() {
  repairStaleSession();
  return Boolean(getSession());
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
  getLoginLockoutRemainingMs,
};
