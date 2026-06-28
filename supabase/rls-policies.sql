-- AI Synergy Archive — RLS policies (Stage 2) — DEPRECATED
-- Use rls-secure.sql instead. This file kept for reference only.

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
