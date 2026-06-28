/**
 * Server-side login — verifies PBKDF2 password and creates session in settings.
 * Uses service role; never returns password_hash to the client.
 *
 * Deploy: supabase functions deploy verify-login --no-verify-jwt
 * (anon key invokes this from the browser; JWT verify is handled in function logic)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1?target=deno';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

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
 * @param {string} password
 * @param {string} hashB64
 * @param {string} saltB64
 */
function verifyPassword(password: string, hashB64: string, saltB64: string): boolean {
  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, expected.length, 'sha256');
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * @param {Uint8Array} bytes
 */
function toBase64Token(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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
    return new Response(JSON.stringify({ error: 'Login failed' }), {
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

    if (userError || !user || !verifyPassword(password, user.password_hash, user.password_salt)) {
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

    const sessionToken = toBase64Token(randomBytes(64));

    const { error: sessionError } = await supabaseAdmin
      .from('settings')
      .upsert({
        key: `session:${sessionToken}`,
        value: { userId: user.id, expiresAt },
      });

    if (sessionError) {
      return new Response(JSON.stringify({ error: 'Login failed' }), {
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
  } catch {
    return new Response(JSON.stringify({ error: 'Login failed' }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
});
