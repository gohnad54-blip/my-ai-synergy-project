/** IndexedDB layer (idb) with AES-GCM record encryption */

import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/+esm';
import { decryptData, encryptData } from './crypto.js';

export const DB_NAME = 'ai-synergy-db';
export const DB_VERSION = 1;

/** @type {import('idb').IDBPDatabase | null} */
let dbInstance = null;

const STORE_DEFS = {
  users: {
    keyPath: 'id',
    indexes: [{ name: 'login', keyPath: 'login', options: { unique: true } }],
    plaintextKeys: ['login', 'passwordHash', 'passwordSalt'],
  },
  roles: {
    keyPath: 'id',
    indexes: [],
    plaintextKeys: [],
  },
  materials: {
    keyPath: 'id',
    indexes: [
      { name: 'categoryId', keyPath: 'categoryId' },
      { name: 'status', keyPath: 'status' },
      { name: 'deletedAt', keyPath: 'deletedAt' },
    ],
    plaintextKeys: [
      'categoryId',
      'status',
      'deletedAt',
      'deletedBy',
      'title',
      'description',
      'authorId',
      'authorName',
      'publishedAt',
      'updatedAt',
      'guestAccess',
      'allAuthenticated',
      'publicPayload',
    ],
  },
  categories: {
    keyPath: 'id',
    indexes: [{ name: 'parentId', keyPath: 'parentId' }],
    plaintextKeys: ['parentId', 'name', 'guestAccess'],
  },
  tags: {
    keyPath: 'id',
    indexes: [{ name: 'name', keyPath: 'name', options: { unique: true } }],
    plaintextKeys: ['name'],
  },
  actionLog: {
    keyPath: 'id',
    indexes: [
      { name: 'actorId', keyPath: 'actorId' },
      { name: 'timestamp', keyPath: 'timestamp' },
    ],
    plaintextKeys: ['actorId', 'timestamp'],
  },
  settings: {
    keyPath: 'key',
    indexes: [],
    plaintextKeys: ['key'],
    bootstrapKeys: ['initialized'],
    publicKeys: ['about_text', 'site_name', 'site_description'],
  },
  accessRequests: {
    keyPath: 'id',
    indexes: [{ name: 'status', keyPath: 'status' }],
    plaintextKeys: ['status', 'name', 'email', 'telegram', 'reason', 'createdAt', 'processedAt', 'processedBy', 'netlifyId'],
  },
};

/**
 * @returns {CryptoKey | null}
 */
function getEncKey() {
  return window.__encKey ?? null;
}

/**
 * @param {string} store
 * @returns {boolean}
 */
function isBootstrapSetting(store, record) {
  const def = STORE_DEFS[store];
  return (
    store === 'settings'
    && (def.bootstrapKeys?.includes(record.key) || def.publicKeys?.includes(record.key))
  );
}

/**
 * @param {string} store
 * @param {Record<string, unknown>} record
 * @returns {Record<string, unknown>}
 */
function splitRecord(store, record) {
  const def = STORE_DEFS[store];
  const keyPath = def.keyPath;
  const plaintext = {};
  const sensitive = { ...record };

  plaintext[keyPath] = record[keyPath];
  delete sensitive[keyPath];

  for (const key of def.plaintextKeys) {
    if (key in record) {
      plaintext[key] = record[key];
      delete sensitive[key];
    }
  }

  return { plaintext, sensitive };
}

/**
 * @param {string} store
 * @param {Record<string, unknown>} record
 * @returns {Promise<Record<string, unknown>>}
 */
async function wrapRecord(store, record) {
  if (isBootstrapSetting(store, record)) {
    return { ...record };
  }

  const key = getEncKey();
  if (!key) {
    throw new Error('Encryption key not set. Log in to write encrypted data.');
  }

  const { plaintext, sensitive } = splitRecord(store, record);
  const { ciphertext, iv } = await encryptData(sensitive, key);

  return {
    ...plaintext,
    ciphertext,
    iv,
  };
}

/**
 * @param {string} store
 * @param {Record<string, unknown>} stored
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function unwrapRecord(store, stored) {
  if (!stored) {
    return null;
  }

  if (isBootstrapSetting(store, stored)) {
    return { ...stored };
  }

  const { plaintext } = splitRecord(store, stored);

  if (!stored.ciphertext || !stored.iv) {
    return { ...plaintext };
  }

  const key = getEncKey();
  if (!key) {
    return { ...plaintext };
  }

  const sensitive = await decryptData(
    /** @type {string} */ (stored.ciphertext),
    /** @type {string} */ (stored.iv),
    key,
  );

  return { ...plaintext, ...sensitive };
}

/**
 * @returns {Promise<import('idb').IDBPDatabase>}
 */
async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      for (const [name, def] of Object.entries(STORE_DEFS)) {
        let objectStore;
        if (!database.objectStoreNames.contains(name)) {
          objectStore = database.createObjectStore(name, { keyPath: def.keyPath });
        } else {
          objectStore = database.transaction(name, 'versionchange').objectStore(name);
        }

        for (const index of def.indexes) {
          if (!objectStore.indexNames.contains(index.name)) {
            objectStore.createIndex(index.name, index.keyPath, index.options ?? {});
          }
        }
      }
    },
  });

  return dbInstance;
}

/** Відкриває БД (ідempotent). */
export async function init() {
  return getDb();
}

/**
 * @param {string} store
 * @returns {Promise<number>}
 */
export async function count(store) {
  const database = await getDb();
  return database.count(store);
}

/**
 * @param {string} store
 * @param {string} id
 * @returns {Promise<object | null>}
 */
export async function get(store, id) {
  const database = await getDb();
  const stored = await database.get(store, id);
  return unwrapRecord(store, stored);
}

/**
 * @param {string} store
 * @param {string} [indexName]
 * @param {IDBValidKey | IDBKeyRange} [query]
 * @returns {Promise<object[]>}
 */
export async function getAll(store, indexName, query) {
  const database = await getDb();
  let rows;

  if (indexName) {
    rows = await database.getAllFromIndex(store, indexName, query);
  } else {
    rows = await database.getAll(store, query);
  }

  return Promise.all(rows.map((row) => unwrapRecord(store, row)));
}

/**
 * @param {string} store
 * @param {object} object
 * @returns {Promise<string>}
 */
export async function put(store, object) {
  const database = await getDb();
  const def = STORE_DEFS[store];
  const wrapped = await wrapRecord(store, /** @type {Record<string, unknown>} */ (object));
  await database.put(store, wrapped);
  return /** @type {string} */ (object[def.keyPath]);
}

/**
 * @param {string} store
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteRecord(store, id) {
  const database = await getDb();
  await database.delete(store, id);
}

/** @deprecated Alias for deleteRecord — avoid shadowing JS delete keyword at call sites. */
export const deleteItem = deleteRecord;

/**
 * @param {string} store
 * @param {string} indexName
 * @param {IDBValidKey} value
 * @returns {Promise<object[]>}
 */
export async function getByIndex(store, indexName, value) {
  const database = await getDb();
  const rows = await database.getAllFromIndex(store, indexName, value);
  return Promise.all(rows.map((row) => unwrapRecord(store, row)));
}

/**
 * @param {string} store
 * @returns {Promise<void>}
 */
export async function clear(store) {
  const database = await getDb();
  await database.clear(store);
}

/**
 * @param {CryptoKey | null} key
 */
export function setEncryptionKey(key) {
  window.__encKey = key;
}

/**
 * @returns {Promise<boolean>}
 */
export async function isInitialized() {
  const setting = await get('settings', 'initialized');
  return setting?.value === true;
}

const db = {
  init,
  count,
  get,
  getAll,
  put,
  delete: deleteRecord,
  getByIndex,
  clear,
  setEncryptionKey,
  isInitialized,
  DB_NAME,
  DB_VERSION,
};

export default db;
