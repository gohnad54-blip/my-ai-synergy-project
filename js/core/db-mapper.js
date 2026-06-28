/** Maps IndexedDB store names ↔ Supabase tables and camelCase ↔ snake_case */

/** @typedef {{ table: string, key: string }} StoreMeta */

/** @type {Record<string, StoreMeta>} */
export const STORE_META = {
  users: { table: 'users', key: 'id' },
  roles: { table: 'roles', key: 'id' },
  materials: { table: 'materials', key: 'id' },
  categories: { table: 'categories', key: 'id' },
  tags: { table: 'tags', key: 'id' },
  settings: { table: 'settings', key: 'key' },
  accessRequests: { table: 'access_requests', key: 'id' },
  actionLog: { table: 'action_log', key: 'id' },
  comments: { table: 'comments', key: 'id' },
};

/** @type {Record<string, Record<string, string>>} */
export const INDEX_COLUMNS = {
  users: { login: 'login' },
  materials: {
    categoryId: 'category_id',
    status: 'status',
    deletedAt: 'deleted_at',
  },
  comments: {
    materialId: 'material_id',
  },
  categories: { parentId: 'parent_id' },
  tags: { name: 'name' },
  actionLog: { actorId: 'actor_id', timestamp: 'timestamp' },
  accessRequests: { status: 'status', netlifyId: 'netlify_id' },
};

/** @type {Record<string, { created?: boolean, updated?: boolean, timestamp?: boolean }>} */
export const TIMESTAMP_DEFAULTS = {
  users: { created: true, updated: true },
  roles: { created: true, updated: true },
  categories: { created: true, updated: true },
  materials: { created: true, updated: true },
  tags: { created: true },
  comments: { created: true },
  accessRequests: { created: true },
  actionLog: { timestamp: true },
};

/**
 * Fills missing NOT NULL timestamp fields before Supabase upsert.
 * @param {string} store
 * @param {Record<string, unknown>} record
 * @returns {Record<string, unknown>}
 */
export function applyDefaultTimestamps(store, record) {
  const rules = TIMESTAMP_DEFAULTS[store];
  if (!rules) {
    return record;
  }

  const now = Date.now();
  const next = { ...record };

  if (rules.created && next.createdAt == null) {
    next.createdAt = now;
  }
  if (rules.updated && next.updatedAt == null) {
    next.updatedAt = now;
  }
  if (rules.timestamp && next.timestamp == null) {
    next.timestamp = now;
  }

  return next;
}

/**
 * @param {string} str
 * @returns {string}
 */
function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

/**
 * @param {string} str
 * @returns {string}
 */
function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function toDbValue(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toDbValue);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [camelToSnake(key), toDbValue(nested)]),
  );
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function fromDbValue(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(fromDbValue);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [snakeToCamel(key), fromDbValue(nested)]),
  );
}

/**
 * @param {string} store
 * @param {Record<string, unknown>} record
 * @returns {Record<string, unknown>}
 */
export function toDbRow(store, record) {
  const row = /** @type {Record<string, unknown>} */ (toDbValue(record));
  if (store === 'settings' && 'key' in record) {
    row.key = record.key;
  }
  return row;
}

/**
 * @param {Record<string, unknown> | null} row
 * @returns {Record<string, unknown> | null}
 */
export function fromDbRow(row) {
  if (!row) {
    return null;
  }
  return /** @type {Record<string, unknown>} */ (fromDbValue(row));
}

/**
 * @param {string} store
 * @returns {StoreMeta}
 */
export function getStoreMeta(store) {
  const meta = STORE_META[store];
  if (!meta) {
    throw new Error(`Unknown store: ${store}`);
  }
  return meta;
}

/**
 * @param {string} store
 * @param {string} indexName
 * @returns {string}
 */
export function getIndexColumn(store, indexName) {
  const column = INDEX_COLUMNS[store]?.[indexName];
  if (!column) {
    throw new Error(`Unknown index ${indexName} on store ${store}`);
  }
  return column;
}
