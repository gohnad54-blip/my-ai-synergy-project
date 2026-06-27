/** Backup export/import — encrypted JSON */

import db from '../core/db.js';
import { encryptData, decryptData } from '../core/crypto.js';
import { logAction } from './log.js';
import { getSession } from '../core/auth.js';
import { getSetting, setSetting } from './settings.js';

export const BACKUP_FORMAT = 'ai-synergy-backup';
export const BACKUP_VERSION = 1;

/** @type {readonly string[]} */
export const BACKUP_STORES = [
  'users',
  'roles',
  'materials',
  'categories',
  'tags',
  'settings',
  'accessRequests',
];

/**
 * @returns {CryptoKey}
 */
function requireEncKey() {
  const key = window.__encKey;
  if (!key) {
    throw new Error('Encryption key missing. Sign in again.');
  }
  return key;
}

/**
 * @returns {Promise<object>}
 */
export async function collectBackupPayload() {
  const payload = {};

  for (const store of BACKUP_STORES) {
    payload[store] = await db.getAll(store);
  }

  return payload;
}

/**
 * @param {object} payload
 */
function validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid backup payload');
  }

  for (const store of BACKUP_STORES) {
    if (!Array.isArray(payload[store])) {
      throw new Error(`Invalid backup: missing store "${store}"`);
    }
  }

  for (const user of payload.users) {
    if (!user?.id || !user?.login) {
      throw new Error('Invalid backup: user records must have id and login');
    }
  }

  for (const material of payload.materials) {
    if (!material?.id) {
      throw new Error('Invalid backup: material records must have id');
    }
  }
}

/**
 * @returns {Promise<object>}
 */
export async function exportBackup() {
  const key = requireEncKey();
  const payload = await collectBackupPayload();
  const { ciphertext, iv } = await encryptData(payload, key);

  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    ciphertext,
    iv,
  };

  await setSetting('last_backup_at', backup.exportedAt);

  const session = getSession();
  await logAction('backup.export', null, null, { exportedAt: backup.exportedAt }, session?.userId ?? null);

  return backup;
}

/**
 * @param {object} backup
 */
export function downloadBackupFile(backup) {
  const date = new Date(backup.exportedAt ?? Date.now()).toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ai-synergy-backup-${date}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {string} text
 * @returns {Promise<object>}
 */
export async function parseBackupFile(text) {
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON backup file');
  }

  if (parsed.format !== BACKUP_FORMAT) {
    throw new Error('Unsupported backup format');
  }

  if (parsed.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${parsed.version}`);
  }

  if (!parsed.ciphertext || !parsed.iv) {
    throw new Error('Backup file is missing encrypted payload');
  }

  return parsed;
}

/**
 * @param {object} backupFile
 * @returns {Promise<object>}
 */
export async function decryptBackup(backupFile) {
  const key = requireEncKey();
  const payload = await decryptData(backupFile.ciphertext, backupFile.iv, key);
  validateBackupPayload(payload);
  return payload;
}

/**
 * @param {object} payload
 * @returns {Promise<void>}
 */
export async function importBackupPayload(payload) {
  validateBackupPayload(payload);

  for (const store of BACKUP_STORES) {
    await db.clear(store);
  }

  for (const store of BACKUP_STORES) {
    for (const record of payload[store]) {
      await db.put(store, record);
    }
  }

  const session = getSession();
  await logAction('backup.import', null, null, { importedAt: Date.now() }, session?.userId ?? null);
}

/**
 * @param {File} file
 * @returns {Promise<void>}
 */
export async function importBackupFile(file) {
  const text = await file.text();
  const backupFile = await parseBackupFile(text);
  const payload = await decryptBackup(backupFile);
  await importBackupPayload(payload);
}

/**
 * @returns {Promise<number | null>}
 */
export async function getLastBackupAt() {
  const value = await getSetting('last_backup_at');
  return typeof value === 'number' ? value : null;
}

export default {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BACKUP_STORES,
  exportBackup,
  downloadBackupFile,
  parseBackupFile,
  decryptBackup,
  importBackupPayload,
  importBackupFile,
  getLastBackupAt,
};
