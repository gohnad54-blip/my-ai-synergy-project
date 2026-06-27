/** Data layer — Supabase (replaces IndexedDB from Stage 2) */

import supabase from './supabase.js';
import {
  fromDbRow,
  getIndexColumn,
  getStoreMeta,
  toDbRow,
} from './db-mapper.js';

export const DB_NAME = 'ai-synergy-supabase';
export const DB_VERSION = 2;

/** @type {boolean} */
let ready = false;

/**
 * @param {import('@supabase/supabase-js').PostgrestError} error
 * @param {string} action
 * @returns {never}
 */
function throwDbError(error, action) {
  throw new Error(`${action}: ${error.message}`);
}

/** Відкриває з'єднання з Supabase (ідempotent). */
export async function init() {
  if (ready) {
    return true;
  }

  const { error } = await supabase.from('settings').select('key').limit(1);
  if (error) {
    throw new Error(`Supabase unavailable: ${error.message}`);
  }

  ready = true;
  return true;
}

/**
 * @param {string} store
 * @returns {Promise<number>}
 */
export async function count(store) {
  await init();
  const { table } = getStoreMeta(store);
  const { count: total, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (error) {
    throwDbError(error, `count(${store})`);
  }

  return total ?? 0;
}

/**
 * @param {string} store
 * @param {string} id
 * @returns {Promise<object | null>}
 */
export async function get(store, id) {
  await init();
  const { table, key } = getStoreMeta(store);
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq(key, id)
    .maybeSingle();

  if (error) {
    throwDbError(error, `get(${store}, ${id})`);
  }

  return fromDbRow(data);
}

/**
 * @param {string} store
 * @param {string} [indexName]
 * @param {IDBKeyRange} [query]
 * @returns {Promise<object[]>}
 */
export async function getAll(store, indexName, query) {
  await init();
  const { table } = getStoreMeta(store);

  let request = supabase.from(table).select('*');

  if (indexName === 'deletedAt' && query instanceof IDBKeyRange) {
    request = request.not('deleted_at', 'is', null).gt('deleted_at', 0);
  } else if (indexName) {
    throw new Error(`getAll with index ${indexName} is not supported; use getByIndex`);
  }

  const { data, error } = await request;
  if (error) {
    throwDbError(error, `getAll(${store})`);
  }

  return (data ?? []).map((row) => fromDbRow(row)).filter(Boolean);
}

/**
 * @param {string} store
 * @param {object} object
 * @returns {Promise<string>}
 */
export async function put(store, object) {
  await init();
  const { table, key } = getStoreMeta(store);
  const row = toDbRow(store, /** @type {Record<string, unknown>} */ (object));
  const { error } = await supabase.from(table).upsert(row, { onConflict: key });

  if (error) {
    throwDbError(error, `put(${store})`);
  }

  return /** @type {string} */ (object[key]);
}

/**
 * @param {string} store
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteRecord(store, id) {
  await init();
  const { table, key } = getStoreMeta(store);
  const { error } = await supabase.from(table).delete().eq(key, id);

  if (error) {
    throwDbError(error, `delete(${store}, ${id})`);
  }
}

/** @deprecated Alias for deleteRecord */
export const deleteItem = deleteRecord;

/**
 * @param {string} store
 * @param {string} indexName
 * @param {IDBValidKey} value
 * @returns {Promise<object[]>}
 */
export async function getByIndex(store, indexName, value) {
  await init();
  const { table } = getStoreMeta(store);
  const column = getIndexColumn(store, indexName);

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq(column, value);

  if (error) {
    throwDbError(error, `getByIndex(${store}, ${indexName})`);
  }

  return (data ?? []).map((row) => fromDbRow(row)).filter(Boolean);
}

/**
 * @param {string} store
 * @returns {Promise<void>}
 */
export async function clear(store) {
  await init();
  const { table, key } = getStoreMeta(store);
  const { error } = await supabase.from(table).delete().not(key, 'is', null);

  if (error) {
    throwDbError(error, `clear(${store})`);
  }
}

/**
 * Залишено для сумісності з backup.js (експорт бекапу шифрується окремо).
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
