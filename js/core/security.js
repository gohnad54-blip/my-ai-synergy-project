/** Security helpers — XSS, session integrity, DOMPurify */

import db from './db.js';

const SESSION_KEY = 'ai-synergy-session';
const DOMPURIFY_SRC = 'https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js';

/** @type {Promise<void> | null} */
let domPurifyPromise = null;

/**
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {string} str
 * @returns {string}
 */
export function stripPlainText(str) {
  return String(str ?? '').replace(/<[^>]*>/g, '').trim();
}

/**
 * Безпечний шлях після login (блокує //evil.com та зовнішні URL).
 * @param {string | null | undefined} raw
 * @param {string} [fallback='/dashboard']
 * @returns {string}
 */
export function safeReturnPath(raw, fallback = '/dashboard') {
  if (!raw) {
    return fallback;
  }

  try {
    const decoded = decodeURIComponent(raw);
    if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('://')) {
      return fallback;
    }

    const url = new URL(decoded, window.location.origin);
    if (url.origin !== window.location.origin) {
      return fallback;
    }

    const path = url.pathname.replace(/\/+$/, '') || '/';
    return `${path}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * @param {string | null | undefined} src
 * @returns {boolean}
 */
export function isSafeMediaSrc(src) {
  if (!src || typeof src !== 'string') {
    return false;
  }

  if (src.startsWith('data:image/') || src.startsWith('blob:')) {
    return true;
  }

  try {
    const url = new URL(src, window.location.origin);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<void>}
 */
export function loadDOMPurify() {
  if (typeof window.DOMPurify !== 'undefined') {
    return Promise.resolve();
  }

  if (!domPurifyPromise) {
    domPurifyPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-dompurify]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('DOMPurify load failed')));
        return;
      }

      const script = document.createElement('script');
      script.src = DOMPURIFY_SRC;
      script.dataset.dompurify = 'true';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('DOMPurify load failed'));
      document.head.appendChild(script);
    });
  }

  return domPurifyPromise;
}

/**
 * @param {string} html
 * @returns {Promise<string>}
 */
export async function sanitizeHtml(html) {
  await loadDOMPurify();
  if (typeof window.DOMPurify !== 'undefined') {
    return window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }
  return escapeHtml(html);
}

/**
 * Скидає сесію якщо токен прострочений (ключ шифрування більше не потрібен для Supabase).
 * @returns {boolean} true якщо сесію скинуто
 */
export function repairStaleSession() {
  const raw = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return false;
  }

  try {
    const session = JSON.parse(raw);
    if (session.expiresAt && Date.now() > session.expiresAt) {
      if (session.token) {
        db.deleteAppSession(session.token).catch(() => {});
      }
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      db.setEncryptionKey(null);
      return true;
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    db.setEncryptionKey(null);
    return true;
  }

  return false;
}

/**
 * Preload security-related assets.
 * @returns {Promise<void>}
 */
export function preloadSecurityAssets() {
  return loadDOMPurify().catch(() => {});
}

export default {
  escapeHtml,
  stripPlainText,
  safeReturnPath,
  isSafeMediaSrc,
  loadDOMPurify,
  sanitizeHtml,
  repairStaleSession,
  preloadSecurityAssets,
};
