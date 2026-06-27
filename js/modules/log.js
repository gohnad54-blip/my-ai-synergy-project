/** Action log — write entries, query, export */

import db from '../core/db.js';
import { generateId } from '../core/crypto.js';
import { getDateLocale, t } from '../core/i18n.js';

/** @type {Record<string, string>} */
export const ACTION_I18N_KEYS = {
  'auth.login': 'log.action.authLogin',
  'auth.logout': 'log.action.authLogout',
  'users.create': 'log.action.usersCreate',
  'users.update': 'log.action.usersUpdate',
  'users.deactivate': 'log.action.usersDeactivate',
  'users.password_change': 'log.action.usersPasswordChange',
  'roles.create': 'log.action.rolesCreate',
  'roles.update': 'log.action.rolesUpdate',
  'roles.delete': 'log.action.rolesDelete',
  'materials.create': 'log.action.materialsCreate',
  'materials.update': 'log.action.materialsUpdate',
  'materials.publish': 'log.action.materialsPublish',
  'materials.unpublish': 'log.action.materialsUnpublish',
  'materials.delete': 'log.action.materialsDelete',
  'materials.restore': 'log.action.materialsRestore',
  'materials.hard_delete': 'log.action.materialsHardDelete',
  'materials.visibility': 'log.action.materialsVisibility',
  'categories.create': 'log.action.categoriesCreate',
  'categories.update': 'log.action.categoriesUpdate',
  'categories.delete': 'log.action.categoriesDelete',
  'backup.export': 'log.action.backupExport',
  'backup.import': 'log.action.backupImport',
  'requests.approve': 'log.action.requestsApprove',
  'requests.reject': 'log.action.requestsReject',
  'trash.empty': 'log.action.trashEmpty',
};

/**
 * @param {string} action
 * @returns {string}
 */
export function formatActionLabel(action) {
  const key = ACTION_I18N_KEYS[action];
  return key ? t(key) : action;
}

/**
 * @param {number} ts
 * @returns {string}
 */
export function formatLogTime(ts) {
  if (!ts) {
    return '—';
  }
  return new Date(ts).toLocaleString(getDateLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * @param {number} ts
 * @returns {string}
 */
export function formatLogTimeShort(ts) {
  if (!ts) {
    return '—';
  }
  return new Date(ts).toLocaleString(getDateLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

/**
 * @param {string} action
 * @param {string | null} [targetId]
 * @param {string | null} [targetTitle]
 * @param {Record<string, unknown>} [details]
 * @param {string | null} [actorId]
 */
export async function logAction(
  action,
  targetId = null,
  targetTitle = null,
  details = {},
  actorId = null,
) {
  await db.put('actionLog', {
    id: generateId('log'),
    action,
    targetId,
    targetTitle,
    details,
    actorId: actorId ?? 'system',
    timestamp: Date.now(),
  });
}

/**
 * @param {{ action?: string, actorId?: string, dateFrom?: number | null, dateTo?: number | null }} [filters]
 * @returns {Promise<object[]>}
 */
export async function getActionLog(filters = {}) {
  const entries = await db.getAll('actionLog');
  let list = entries.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

  if (filters.action) {
    list = list.filter((entry) => entry.action === filters.action);
  }

  if (filters.actorId) {
    list = list.filter((entry) => entry.actorId === filters.actorId);
  }

  if (filters.dateFrom) {
    list = list.filter((entry) => (entry.timestamp ?? 0) >= filters.dateFrom);
  }

  if (filters.dateTo) {
    list = list.filter((entry) => (entry.timestamp ?? 0) <= filters.dateTo);
  }

  return list;
}

/**
 * @param {object} entry
 * @param {Map<string, string>} [cache]
 * @returns {Promise<string>}
 */
export async function resolveActorName(entry, cache = new Map()) {
  if (!entry.actorId || entry.actorId === 'system') {
    return t('log.system');
  }

  if (cache.has(entry.actorId)) {
    return cache.get(entry.actorId) ?? t('log.system');
  }

  const user = await db.get('users', entry.actorId);
  let name = user?.displayName ?? user?.login ?? t('common.user');
  if (user?.role === 'admin') {
    name += ` (${t('common.admin')})`;
  }
  cache.set(entry.actorId, name);
  return name;
}

/**
 * @param {object[]} entries
 * @returns {Promise<string>}
 */
export async function exportLogCsv(entries) {
  const cache = new Map();
  const header = [
    t('log.csv.timestamp'),
    t('log.csv.actor'),
    t('log.csv.action'),
    t('log.csv.target'),
  ].map(csvEscape).join(',');

  const rows = await Promise.all(entries.map(async (entry) => {
    const actor = await resolveActorName(entry, cache);
    return [
      formatLogTime(entry.timestamp),
      actor,
      formatActionLabel(entry.action),
      entry.targetTitle ?? '',
    ].map(csvEscape).join(',');
  }));

  return `\uFEFF${header}\n${rows.join('\n')}`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export default {
  logAction,
  getActionLog,
  formatActionLabel,
  formatLogTime,
  formatLogTimeShort,
  resolveActorName,
  exportLogCsv,
  ACTION_I18N_KEYS,
};
