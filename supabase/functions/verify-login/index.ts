/**
 * Server-side login — verifies PBKDF2 password and creates session in settings.
 * Uses Web Crypto (same as js/core/crypto.js) + service role.
 *
 * Deploy: supabase functions deploy verify-login --no-verify-jwt
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1?target=deno';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS')
  ?? 'https://ai-synergy-archive.netlify.app,http://localhost:3456,http://127.0.0.1:3456')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const PBKDF2_ITERATIONS = 310_000;

/**
 * @param {string | null} origin
 */
function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

/**
 * @param {string} base64
 */
function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * @param {Uint8Array} bytes
 */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Matches js/core/crypto.js verifyPassword (PBKDF2-SHA256, 310k iterations).
 * @param {string} password
 * @param {string} hashB64
 * @param {string} saltB64
 */
async function verifyPassword(
  password: string,
  hashB64: string,
  saltB64: string,
): Promise<boolean> {
  try {
    const salt = fromBase64(saltB64);
    const expected = fromBase64(hashB64);
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
      expected.length * 8,
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
  } catch {
    return false;
  }
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Login failed', code: 'config' }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const login = typeof body.login === 'string' ? body.login.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const expiresAt = Number(body.expiresAt);

    if (!login || !password || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return new Response(JSON.stringify({ error: 'Invalid username or password' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, login, role, display_name, status, password_hash, password_salt')
      .eq('login', login)
      .maybeSingle();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid username or password' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const passwordOk = await verifyPassword(password, user.password_hash, user.password_salt);
    if (!passwordOk) {
      return new Response(JSON.stringify({ error: 'Invalid username or password' }), {
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
