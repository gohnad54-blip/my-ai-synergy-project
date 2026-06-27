/** Web Crypto API helpers — PBKDF2 + AES-GCM */

const PBKDF2_ITERATIONS = 310000;
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * @param {ArrayBuffer | Uint8Array} buffer
 * @returns {string}
 */
function toBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * @param {string} base64
 * @returns {Uint8Array}
 */
function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * @param {number} length
 * @returns {string}
 */
function randomBase62(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += BASE62[bytes[i] % 62];
  }
  return result;
}

/**
 * @param {string} password
 * @param {string} [saltBase64]
 * @returns {Promise<{ hash: string, salt: string }>}
 */
export async function hashPassword(password, saltBase64 = null) {
  const salt = saltBase64
    ? fromBase64(saltBase64)
    : crypto.getRandomValues(new Uint8Array(32));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return { hash: toBase64(hashBuffer), salt: toBase64(salt) };
}

/**
 * @param {string} password
 * @param {string} hash
 * @param {string} salt
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, hash, salt) {
  const { hash: computed } = await hashPassword(password, salt);
  return computed === hash;
}

/**
 * @param {string} password
 * @param {string} saltBase64
 * @returns {Promise<CryptoKey>}
 */
export async function deriveEncryptionKey(password, saltBase64) {
  const salt = fromBase64(saltBase64);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * @param {unknown} data
 * @param {CryptoKey} key
 * @returns {Promise<{ ciphertext: string, iv: string }>}
 */
export async function encryptData(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );
  return { ciphertext: toBase64(ciphertextBuffer), iv: toBase64(iv) };
}

/**
 * @param {string} ciphertext
 * @param {string} iv
 * @param {CryptoKey} key
 * @returns {Promise<object>}
 */
export async function decryptData(ciphertext, iv, key) {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

/**
 * @param {string} prefix
 * @returns {string}
 */
export function generateId(prefix) {
  return `${prefix}_${randomBase62(12)}`;
}
