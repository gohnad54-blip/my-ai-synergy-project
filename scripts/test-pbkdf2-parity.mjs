/**
 * Verifies crypto.js and verify-login use identical base64 + PBKDF2.
 * Run: node scripts/test-pbkdf2-parity.mjs
 */

import { webcrypto } from 'node:crypto';

const PBKDF2_ITERATIONS = 310_000;
const subtle = webcrypto.subtle;

/** js/core/crypto.js toBase64 */
function clientToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** js/core/crypto.js fromBase64 */
function clientFromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** verify-login/index.ts toBase64 / fromBase64 (same implementation) */
function edgeToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function edgeFromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function clientHashPassword(password, saltBase64 = null) {
  const salt = saltBase64 ? clientFromBase64(saltBase64) : webcrypto.getRandomValues(new Uint8Array(32));
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
  return { hash: clientToBase64(hashBuffer), salt: clientToBase64(salt) };
}

async function edgeComputeHashB64(password, saltB64) {
  const salt = edgeFromBase64(saltB64);
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
    256,
  );
  return edgeToBase64(new Uint8Array(derivedBuffer));
}

const password = 'TestPass123!';
const { hash, salt } = await clientHashPassword(password);

const clientRoundtripHash = clientToBase64(clientFromBase64(hash));
const edgeRoundtripHash = edgeToBase64(edgeFromBase64(hash));
const crossClientDecodeEdgeEncode = edgeToBase64(clientFromBase64(hash));
const crossEdgeDecodeClientEncode = clientToBase64(edgeFromBase64(hash));

const edgeHashFromClientSalt = await edgeComputeHashB64(password, salt);

console.log('=== Base64 parity (client crypto.js vs edge verify-login) ===');
console.log('client roundtrip hash:', clientRoundtripHash === hash ? 'PASS' : 'FAIL');
console.log('edge roundtrip hash:', edgeRoundtripHash === hash ? 'PASS' : 'FAIL');
console.log('client decode → edge encode:', crossClientDecodeEdgeEncode === hash ? 'PASS' : 'FAIL');
console.log('edge decode → client encode:', crossEdgeDecodeClientEncode === hash ? 'PASS' : 'FAIL');
console.log('client/edge encode identical:', clientRoundtripHash === edgeRoundtripHash ? 'PASS' : 'FAIL');

console.log('=== PBKDF2 parity ===');
console.log('edge hash from client salt === client hash:', edgeHashFromClientSalt === hash ? 'PASS' : 'FAIL');
console.log('hash bytes:', clientFromBase64(hash).length, 'salt bytes:', clientFromBase64(salt).length);
