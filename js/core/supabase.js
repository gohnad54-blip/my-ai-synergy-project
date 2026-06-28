/**
 * Supabase client — shared by db.js data layer.
 * Uses CDN ESM import (no bundler), version pinned via package.json dependency.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.108.2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config/supabase.js';

/** Must match SESSION_KEY in auth.js — read here to avoid circular imports */
const SESSION_KEY = 'ai-synergy-session';

/**
 * @returns {string | null}
 */
function readSessionToken() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const session = JSON.parse(raw);
    if (!session.expiresAt || Date.now() > session.expiresAt) {
      return null;
    }
    return typeof session.token === 'string' ? session.token : null;
  } catch {
    return null;
  }
}

/** @type {import('@supabase/supabase-js').SupabaseClient} */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: (url, options = {}) => {
      const token = readSessionToken();
      const headers = new Headers(options.headers);
      if (token) {
        headers.set('x-app-session', token);
      }
      const guestCode = sessionStorage.getItem('ai-synergy-guest-code');
      if (guestCode) {
        headers.set('x-guest-code', guestCode);
      }
      return fetch(url, { ...options, headers });
    },
  },
});

export default supabase;
