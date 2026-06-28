-- AI Synergy Archive — service_role table grants (for verify-login Edge Function)
-- Run in Supabase Dashboard → SQL Editor if Edge Function logs:
--   "permission denied for table users"
--
-- Also verify Dashboard → Project Settings → API → service_role key is set in
-- Edge Function secrets as SERVICE_ROLE_KEY (NOT the anon key).

BEGIN;

GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.roles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.materials TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tags TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.access_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.action_log TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comments TO service_role;

COMMIT;
