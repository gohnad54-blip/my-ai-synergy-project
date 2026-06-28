/** Anonymous guest identity for comments — persists until browser tab/window closes */

const GUEST_CODE_KEY = 'ai-synergy-guest-code';
const CODE_CHARS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩ0123456789';
const CODE_LENGTH = 4;

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
 * @returns {string}
 */
export function getGuestCommentCode() {
  let code = sessionStorage.getItem(GUEST_CODE_KEY);
  if (!code || code.length < CODE_LENGTH) {
    code = randomGuestCode();
    sessionStorage.setItem(GUEST_CODE_KEY, code);
  }
  return code;
}

/**
 * @returns {string}
 */
export function getGuestDisplayName() {
  return `Гість #${getGuestCommentCode()}`;
}
