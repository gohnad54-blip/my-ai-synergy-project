-- AI Synergy Archive — RLS policies (Stage 2)
-- Run in Supabase Dashboard → SQL Editor AFTER schema.sql
--
-- Custom app auth (not Supabase Auth yet): anon role can read/write all tables.
-- UI permissions still enforced in js/core/auth.js.
-- Tighten these policies when migrating to Supabase Auth or Edge Functions.

BEGIN;

CREATE POLICY "anon_all_users"
  ON public.users FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_roles"
  ON public.roles FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_categories"
  ON public.categories FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_materials"
  ON public.materials FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_tags"
  ON public.tags FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_settings"
  ON public.settings FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_access_requests"
  ON public.access_requests FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_action_log"
  ON public.action_log FOR ALL TO anon
  USING (true) WITH CHECK (true);

COMMIT;
