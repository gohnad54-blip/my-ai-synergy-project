/** Data layer — Supabase (replaces IndexedDB from Stage 2) */

import supabase from './supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config/supabase.js';
import {
  applyDefaultTimestamps,
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
  const normalized = applyDefaultTimestamps(
    store,
    /** @type {Record<string, unknown>} */ (object),
  );
  const row = toDbRow(store, normalized);
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

/**
 * @returns {Promise<{ userCount: number, initialized: boolean }>}
 */
export async function getSetupStatus() {
  await init();
  const { data, error } = await supabase.rpc('get_setup_status');
  if (error) {
    throwDbError(error, 'getSetupStatus');
  }
  return {
    userCount: data?.userCount ?? 0,
    initialized: Boolean(data?.initialized),
  };
}

/**
 * Server-side login via Edge Function (never use get_user_for_login RPC).
 * @param {string} login
 * @param {string} password
 * @param {number} expiresAt
 * @returns {Promise<{ success: boolean, sessionToken?: string, user?: object, error?: string }>}
 */
export async function verifyAppLogin(login, password, expiresAt) {
  await init();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ login, password, expiresAt }),
  });

  /** @type {{ sessionToken?: string, user?: object, error?: string } | null} */
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (payload?.error === 'Account is deactivated') {
    return { success: false, error: 'Account is deactivated' };
  }

  if (!response.ok || !payload?.sessionToken || !payload?.user) {
    const fallback = response.status === 500 ? 'Login failed' : 'Invalid username or password';
    return {
      success: false,
      error: typeof payload?.error === 'string' ? payload.error : fallback,
      status: response.status,
      code: typeof payload?.code === 'string' ? payload.code : undefined,
    };
  }

  return {
    success: true,
    sessionToken: payload.sessionToken,
    user: fromDbRow(payload.user),
    status: response.status,
  };
}

/**
 * @param {string} login
 * @returns {Promise<boolean>}
 */
export async function isLoginAvailable(login) {
  await init();
  const { data, error } = await supabase.rpc('check_login_available', { p_login: login });
  if (error) {
    throwDbError(error, 'isLoginAvailable');
  }
  return Boolean(data);
}

/**
 * @param {string} token
 * @returns {Promise<void>}
 */
export async function deleteAppSession(token) {
  if (!token) {
    return;
  }
  await init();
  const { error } = await supabase.rpc('delete_app_session', { p_token: token });
  if (error) {
    throwDbError(error, 'deleteAppSession');
  }
}

/**
 * @param {object} request
 * @returns {Promise<string>}
 */
export async function submitAccessRequestPublic(request) {
  await init();
  const { data, error } = await supabase.rpc('submit_access_request', {
    p_id: request.id,
    p_name: request.name,
    p_email: request.email,
    p_telegram: request.telegram,
    p_reason: request.reason,
    p_created_at: request.createdAt,
  });
  if (error) {
    throwDbError(error, 'submitAccessRequest');
  }
  return /** @type {string} */ (data);
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
  getSetupStatus,
  verifyAppLogin,
  isLoginAvailable,
  deleteAppSession,
  submitAccessRequestPublic,
  DB_NAME,
  DB_VERSION,
};

export default db;
