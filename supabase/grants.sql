-- AI Synergy Archive — table grants for Supabase API roles (Stage 2)
-- Run in Supabase Dashboard → SQL Editor AFTER schema.sql and rls-policies.sql
--
-- RLS policies alone are not enough: anon/authenticated roles also need GRANT
-- on tables. Without this, REST API returns 401 "permission denied for table …".

BEGIN;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.roles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.categories TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.materials TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tags TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.access_requests TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.action_log TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comments TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reactions TO anon, authenticated;

GRANT SELECT, INSERT, DELETE ON TABLE public.private_messages TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.group_messages TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.group_read_cursors TO anon, authenticated;

-- service_role (Edge Functions / server) — bypasses RLS but still needs table GRANT
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
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.private_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.group_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.group_read_cursors TO service_role;

COMMIT;

-- Verify (optional):
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.table_privileges
-- WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
-- ORDER BY table_name, grantee;
