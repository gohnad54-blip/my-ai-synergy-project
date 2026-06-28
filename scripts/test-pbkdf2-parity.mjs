/**
 * Verifies client crypto.js and verify-login Edge Function use identical PBKDF2 params.
 * Run: node scripts/test-pbkdf2-parity.mjs
 */

import { webcrypto } from 'node:crypto';

const PBKDF2_ITERATIONS = 310_000;
const subtle = webcrypto.subtle;

function toBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Mirrors js/core/crypto.js hashPassword */
async function clientHashPassword(password, saltBase64 = null) {
  const salt = saltBase64 ? fromBase64(saltBase64) : webcrypto.getRandomValues(new Uint8Array(32));
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const hashBuffer = await subtle.deriveBits(
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

/** Mirrors supabase/functions/verify-login/index.ts verifyPassword */
async function edgeVerifyPassword(password, hashB64, saltB64, deriveBitsLength) {
  const salt = fromBase64(saltB64);
  const expected = fromBase64(hashB64);
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derivedBuffer = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    deriveBitsLength,
  );
  const derived = new Uint8Array(derivedBuffer);
  if (derived.length !== expected.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= derived[i] ^ expected[i];
  }
  return diff === 0;
}

const password = 'TestPass123!';

const { hash, salt } = await clientHashPassword(password);
const fixed256 = await edgeVerifyPassword(password, hash, salt, 256);
const lengthBased = await edgeVerifyPassword(password, hash, salt, fromBase64(hash).length * 8);

console.log('PBKDF2 params: SHA-256, iterations=', PBKDF2_ITERATIONS, ', output=256 bits');
console.log('hash length (bytes):', fromBase64(hash).length);
console.log('salt length (bytes):', fromBase64(salt).length);
console.log('edge verify (256 bits fixed):', fixed256 ? 'PASS' : 'FAIL');
console.log('edge verify (expected.length*8):', lengthBased ? 'PASS' : 'FAIL');
console.log('wrong password rejected:', !(await edgeVerifyPassword('wrong', hash, salt, 256)) ? 'PASS' : 'FAIL');
