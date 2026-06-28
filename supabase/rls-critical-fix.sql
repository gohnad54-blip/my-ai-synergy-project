-- AI Synergy Archive — CRITICAL security fix (audit C1/C2/C3)
-- Run in Supabase Dashboard → SQL Editor AFTER rls-secure.sql
--
-- 1. Revokes anon access to get_user_for_login (password hash leak)
-- 2. Revokes anon access to create_app_session (session forgery)
-- 3. Adds check_login_available for /setup (no user data exposed)
--
-- REQUIRED: deploy Edge Function before login will work:
--   supabase login
--   supabase link --project-ref YOUR_REF
--   supabase functions deploy verify-login --no-verify-jwt
--
-- Optional: set ALLOWED_ORIGINS secret for verify-login (comma-separated origins)

BEGIN;

-- ---------------------------------------------------------------------------
-- Revoke dangerous RPC grants from API roles
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_user_for_login(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_app_session(TEXT, TEXT, BIGINT) FROM PUBLIC;

-- Keep functions for reference / service-role-only use; anon cannot execute
REVOKE EXECUTE ON FUNCTION public.get_user_for_login(TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_app_session(TEXT, TEXT, BIGINT) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Setup: check login availability without exposing user records
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_login_available(p_login TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.users WHERE login = trim(p_login)
  );
$$;

REVOKE ALL ON FUNCTION public.check_login_available(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_login_available(TEXT) TO anon, authenticated;

COMMIT;
