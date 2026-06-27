/** First-run initialization check */

import db from '../js/core/db.js';

/**
 * Перевіряє стан ініціалізації архіву.
 * Якщо адміністратор ще не створений — встановлює window.__needsSetup = true.
 * @returns {Promise<boolean>} true якщо потрібен setup
 */
export async function checkInitialization() {
  await db.init();

  const userCount = await db.count('users');
  const initialized = await db.isInitialized();

  window.__needsSetup = userCount === 0 || !initialized;

  return window.__needsSetup;
}

/**
 * Позначає архів як ініціалізований (після setup).
 * @returns {Promise<void>}
 */
export async function markInitialized() {
  await db.put('settings', { key: 'initialized', value: true });
  window.__needsSetup = false;
}

export default { checkInitialization, markInitialized };
