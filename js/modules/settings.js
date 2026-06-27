/** App settings helpers */

import db from '../core/db.js';

/**
 * @param {string} key
 * @param {unknown} [defaultValue]
 * @returns {Promise<unknown>}
 */
export async function getSetting(key, defaultValue = null) {
  const row = await db.get('settings', key);
  return row?.value ?? defaultValue;
}

/**
 * @param {string} key
 * @param {unknown} value
 * @returns {Promise<void>}
 */
export async function setSetting(key, value) {
  await db.put('settings', { key, value });
}

export default { getSetting, setSetting };
