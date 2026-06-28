/** Anonymous guest identity for comments — persists until browser tab/window closes */

const GUEST_CODE_KEY = 'ai-synergy-guest-code';
/** Latin only — HTTP headers (x-guest-code) must be ISO-8859-1 safe */
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 4;

/**
 * @param {string | null} code
 * @returns {boolean}
 */
function isValidGuestCode(code) {
  return typeof code === 'string' && /^[A-Z0-9]{4,32}$/.test(code);
}

/**
 * @returns {string}
 */
function randomGuestCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

/**
 * Latin code for x-guest-code header and DB guest_code (RLS).
 * @returns {string}
 */
export function getGuestCommentCode() {
  let code = sessionStorage.getItem(GUEST_CODE_KEY);
  if (!isValidGuestCode(code)) {
    code = randomGuestCode();
    sessionStorage.setItem(GUEST_CODE_KEY, code);
  }
  return code;
}

/**
 * UI label — Cyrillic prefix, Latin suffix (e.g. "Гість #A3X9").
 * @returns {string}
 */
export function getGuestDisplayName() {
  return `Гість #${getGuestCommentCode()}`;
}
