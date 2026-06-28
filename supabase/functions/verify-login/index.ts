/**
 * Server-side login — verifies PBKDF2 password and creates session in settings.
 * Uses Web Crypto (same as js/core/crypto.js) + service role.
 *
 * Deploy: supabase functions deploy verify-login --no-verify-jwt
 *
 * Secrets: SUPABASE_URL (auto) + SERVICE_ROLE_KEY (manual — Supabase forbids SUPABASE_ prefix on custom secrets).
 * If login fails with "permission denied for table users":
 *   1. Dashboard → Settings → API → copy service_role key (NOT anon)
 *   2. supabase secrets set SERVICE_ROLE_KEY=eyJ...service_role...
 *   3. Run supabase/grants-service-role.sql in SQL Editor
 *   4. Redeploy function
 *
 * Debug (temporary): supabase secrets set VERIFY_LOGIN_DEBUG=true
 * Logs: Supabase Dashboard → Edge Functions → verify-login → Logs
 * Remove secret after fixing login.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1?target=deno';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS')
  ?? 'https://ai-synergy-archive.netlify.app,http://localhost:3456,http://127.0.0.1:3456')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const PBKDF2_ITERATIONS = 310_000;
const PBKDF2_HASH_BITS = 256;
const DEBUG_LOGIN = Deno.env.get('VERIFY_LOGIN_DEBUG') === 'true';

/**
 * @param {string} jwt
 * @returns {string | null}
 */
function parseJwtRole(jwt: string): string | null {
  try {
    const parts = jwt.split('.');
    if (parts.length < 2) {
      return null;
    }
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * @returns {{ url: string, serviceRoleKey: string } | { error: string, code: string }}
 */
function resolveServiceRoleConfig(): { url: string; serviceRoleKey: string } | { error: string; code: string } {
  const url = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')?.trim();

  if (!url || !serviceRoleKey) {
    return {
      error: 'SUPABASE_URL or SERVICE_ROLE_KEY is missing in Edge Function secrets',
      code: 'config_missing',
    };
  }

  const role = parseJwtRole(serviceRoleKey);
  if (role !== 'service_role') {
    return {
      error: role
        ? `SERVICE_ROLE_KEY has role "${role}", expected "service_role" (do not use anon key)`
        : 'SERVICE_ROLE_KEY is not a valid JWT',
      code: 'wrong_api_key',
    };
  }

  return { url, serviceRoleKey };
}

/**
 * Service-role client — ignores caller Authorization header (browser sends anon key).
 * @param {string} supabaseUrl
 * @param {string} serviceRoleKey
 */
function createServiceRoleClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    },
  });
}

/**
 * @param {string | null} origin
 */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) {
    return false;
  }
  if (ALLOWED_ORIGINS.includes(origin)) {
    return true;
  }
  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === 'https:' && hostname.endsWith('.netlify.app');
  } catch {
    return false;
  }
}

/**
 * @param {string | null} origin
 */
function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = isAllowedOrigin(origin);
  return {
    'Access-Control-Allow-Origin': allowed && origin ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

/** Mirrors js/core/crypto.js fromBase64 */
function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Mirrors js/core/crypto.js toBase64 */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * @param {string} b64
 */
function base64RoundtripOk(b64: string): boolean {
  try {
    return toBase64(fromBase64(b64)) === b64;
  } catch {
    return false;
  }
}

/**
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 */
function firstDiffIndex(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) {
      return i;
    }
  }
  return a.length === b.length ? -1 : len;
}

/**
 * Same PBKDF2 as js/core/crypto.js hashPassword (deriveBits 256).
 * @param {string} password
 * @param {string} saltB64
 */
async function computePasswordHashB64(
  password: string,
  saltB64: string,
): Promise<{ hashB64: string; saltBytes: number; hashBytes: number } | null> {
  try {
    const salt = fromBase64(saltB64);
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const derivedBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      PBKDF2_HASH_BITS,
    );
    const derived = new Uint8Array(derivedBuffer);
    return {
      hashB64: toBase64(derived),
      saltBytes: salt.length,
      hashBytes: derived.length,
    };
  } catch (err) {
    if (DEBUG_LOGIN) {
      console.error('[verify-login][debug] computePasswordHashB64 error:', err);
    }
    return null;
  }
}

/**
 * @param {string} login
 * @param {string} password
 * @param {string} dbHashB64
 * @param {string} dbSaltB64
 */
async function verifyPasswordWithDebug(
  login: string,
  password: string,
  dbHashB64: string,
  dbSaltB64: string,
): Promise<boolean> {
  const hashB64 = dbHashB64.trim();
  const saltB64 = dbSaltB64.trim();

  const computed = await computePasswordHashB64(password, saltB64);
  if (!computed) {
    if (DEBUG_LOGIN) {
      console.log('[verify-login][debug]', JSON.stringify({
        login,
        stage: 'compute_failed',
        dbHash: hashB64,
        dbSaltLen: saltB64.length,
      }));
    }
    return false;
  }

  let expectedBytes: Uint8Array;
  try {
    expectedBytes = fromBase64(hashB64);
  } catch (err) {
    if (DEBUG_LOGIN) {
      console.log('[verify-login][debug]', JSON.stringify({
        login,
        stage: 'db_hash_decode_failed',
        dbHash: hashB64,
        error: String(err),
      }));
    }
    return false;
  }

  const derivedBytes = fromBase64(computed.hashB64);
  const match = computed.hashB64 === hashB64
    && derivedBytes.length === expectedBytes.length
    && firstDiffIndex(derivedBytes, expectedBytes) === -1;

  if (DEBUG_LOGIN) {
    console.log('[verify-login][debug]', JSON.stringify({
      login,
      passwordLen: password.length,
      dbHash: hashB64,
      computedHash: computed.hashB64,
      hashesEqual: computed.hashB64 === hashB64,
      dbHashLen: hashB64.length,
      computedHashLen: computed.hashB64.length,
      dbHashBytes: expectedBytes.length,
      computedHashBytes: computed.hashBytes,
      saltLen: saltB64.length,
      saltBytes: computed.saltBytes,
      dbHashTrimmed: hashB64 !== dbHashB64,
      dbSaltTrimmed: saltB64 !== dbSaltB64,
      dbHashBase64Roundtrip: base64RoundtripOk(hashB64),
      dbSaltBase64Roundtrip: base64RoundtripOk(saltB64),
      computedHashBase64Roundtrip: base64RoundtripOk(computed.hashB64),
      firstByteDiff: firstDiffIndex(derivedBytes, expectedBytes),
      pbkdf2: { iterations: PBKDF2_ITERATIONS, hash: 'SHA-256', bits: PBKDF2_HASH_BITS },
    }));
  }

  return match;
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get('Origin'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  const serviceConfig = resolveServiceRoleConfig();
  if ('error' in serviceConfig) {
    console.error('[verify-login] config error:', serviceConfig.error);
    return new Response(JSON.stringify({
      error: 'Login failed',
      code: serviceConfig.code,
    }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  const { url: supabaseUrl, serviceRoleKey } = serviceConfig;

  if (DEBUG_LOGIN) {
    console.log('[verify-login][debug] using service_role key, ref:', parseJwtRole(serviceRoleKey) ?? 'unknown');
  }

  try {
    const body = await req.json();
    const login = typeof body.login === 'string' ? body.login.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const expiresAt = Number(body.expiresAt);

    if (DEBUG_LOGIN) {
      console.log('[verify-login][debug] request', JSON.stringify({
        login,
        passwordLen: password.length,
        expiresAt,
        expiresAtValid: Number.isFinite(expiresAt) && expiresAt > Date.now(),
        now: Date.now(),
      }));
    }

    if (!login || !password || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return new Response(JSON.stringify({
        error: 'Invalid username or password',
        code: 'invalid_request',
      }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createServiceRoleClient(supabaseUrl, serviceRoleKey);

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, login, role, display_name, status, password_hash, password_salt')
      .eq('login', login)
      .maybeSingle();

    if (userError) {
      console.error('[verify-login] user lookup error:', userError.message, login);
      const isPermissionDenied = userError.message.includes('permission denied');
      return new Response(JSON.stringify({
        error: isPermissionDenied ? 'Login failed' : 'Invalid username or password',
        code: isPermissionDenied ? 'service_role_denied' : 'auth_failed',
      }), {
        status: isPermissionDenied ? 500 : 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    if (!user) {
      console.error('[verify-login] user not found:', login);
      return new Response(JSON.stringify({
        error: 'Invalid username or password',
        code: 'auth_failed',
      }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    if (!user.password_hash || !user.password_salt) {
      console.error('[verify-login] missing password hash/salt for login:', login);
      return new Response(JSON.stringify({
        error: 'Invalid username or password',
        code: 'auth_failed',
      }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const passwordOk = await verifyPasswordWithDebug(
      login,
      password,
      user.password_hash,
      user.password_salt,
    );
    if (!passwordOk) {
      console.error('[verify-login] password mismatch for login:', login);
      return new Response(JSON.stringify({
        error: 'Invalid username or password',
        code: 'auth_failed',
      }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    if (user.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Account is deactivated' }), {
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const sessionToken = toBase64(crypto.getRandomValues(new Uint8Array(64)));

    const { error: sessionError } = await supabaseAdmin
      .from('settings')
      .upsert({
        key: `session:${sessionToken}`,
        value: { userId: user.id, expiresAt },
      });

    if (sessionError) {
      console.error('[verify-login] session upsert failed:', sessionError.message);
      return new Response(JSON.stringify({ error: 'Login failed', code: 'session' }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      sessionToken,
      user: {
        id: user.id,
        login: user.login,
        role: user.role,
        displayName: user.display_name ?? user.login,
        passwordSalt: user.password_salt,
        status: user.status,
      },
    }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[verify-login] unhandled:', err);
    return new Response(JSON.stringify({ error: 'Login failed', code: 'exception' }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
});
