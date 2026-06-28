-- AI Synergy Archive — secure RLS policies (Stage 2b)
-- Run in Supabase Dashboard → SQL Editor AFTER schema.sql and grants.sql
--
-- Replaces open anon_all_* policies from rls-policies.sql.
--
-- IMPORTANT: App uses custom auth (localStorage), not Supabase Auth.
-- Sessions are stored in settings as rows: session:<token> → { userId, expiresAt }
-- Client must send header: x-app-session: <token>
--
-- After running this script the site WILL break until app code is updated to:
--   1. Send x-app-session header on every Supabase request
--   2. Call create_app_session() after login, delete_app_session() on logout
--   3. Use RPC: get_setup_status(), get_user_for_login(), submit_access_request()
--
-- Do NOT run until you confirm. Reply «виконано» after applying in Dashboard.
-- Applied: secure RLS active; app sends x-app-session header (see js/core/supabase.js).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Drop permissive Stage-2 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "anon_all_users" ON public.users;
DROP POLICY IF EXISTS "anon_all_roles" ON public.roles;
DROP POLICY IF EXISTS "anon_all_categories" ON public.categories;
DROP POLICY IF EXISTS "anon_all_materials" ON public.materials;
DROP POLICY IF EXISTS "anon_all_tags" ON public.tags;
DROP POLICY IF EXISTS "anon_all_settings" ON public.settings;
DROP POLICY IF EXISTS "anon_all_access_requests" ON public.access_requests;
DROP POLICY IF EXISTS "anon_all_action_log" ON public.action_log;

-- ---------------------------------------------------------------------------
-- 2. Session helpers (sessions live in settings, not readable by anon)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_app_session_token()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT nullif(
    trim(both '"' FROM coalesce(
      current_setting('request.headers', true)::json->>'x-app-session',
      ''
    )),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.app_session_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.value->>'userId'
  FROM public.settings s
  WHERE s.key = 'session:' || coalesce(public.request_app_session_token(), '__none__')
    AND coalesce((s.value->>'expiresAt')::bigint, 0)
        > (extract(epoch FROM now()) * 1000)::bigint
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_app_authenticated()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_session_user_id() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.request_app_session_token() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_session_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_app_authenticated() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_app_session_token() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_session_user_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_app_authenticated() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Session RPC (login / logout — called from app after password verify)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_app_session(
  p_token      TEXT,
  p_user_id    TEXT,
  p_expires_at BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RAISE EXCEPTION 'invalid session token';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  INSERT INTO public.settings (key, value)
  VALUES (
    'session:' || p_token,
    jsonb_build_object('userId', p_user_id, 'expiresAt', p_expires_at)
  )
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_app_session(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.settings
  WHERE key = 'session:' || coalesce(p_token, '');
END;
$$;

REVOKE ALL ON FUNCTION public.create_app_session(TEXT, TEXT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_app_session(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_app_session(TEXT, TEXT, BIGINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_app_session(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Setup / login / public form RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_setup_status()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'userCount', (SELECT count(*)::integer FROM public.users),
    'initialized', EXISTS (
      SELECT 1 FROM public.settings
      WHERE key = 'initialized'
        AND value = 'true'::jsonb
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_for_login(p_login TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(u)
  FROM public.users u
  WHERE u.login = trim(p_login)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.submit_access_request(
  p_id         TEXT,
  p_name       TEXT,
  p_email      TEXT,
  p_telegram   TEXT DEFAULT NULL,
  p_reason     TEXT DEFAULT '',
  p_created_at BIGINT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_at BIGINT := coalesce(
    p_created_at,
    (extract(epoch FROM now()) * 1000)::bigint
  );
BEGIN
  IF length(trim(coalesce(p_name, ''))) = 0
     OR length(trim(coalesce(p_email, ''))) = 0 THEN
    RAISE EXCEPTION 'name and email are required';
  END IF;

  INSERT INTO public.access_requests (
    id, name, email, telegram, reason, status, created_at
  ) VALUES (
    p_id,
    trim(p_name),
    trim(p_email),
    nullif(trim(coalesce(p_telegram, '')), ''),
    trim(coalesce(p_reason, '')),
    'pending',
    v_created_at
  );

  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_setup_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_for_login(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_access_request(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_setup_status() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_for_login(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_access_request(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. settings
--    anon: SELECT only public keys (no secrets, no session rows)
--    auth: full CRUD except session:* keys (managed by RPC above)
-- ---------------------------------------------------------------------------

CREATE POLICY "settings_anon_select_public"
  ON public.settings FOR SELECT TO anon
  USING (key IN ('initialized', 'about_text'));

CREATE POLICY "settings_auth_select"
  ON public.settings FOR SELECT TO anon
  USING (
    public.is_app_authenticated()
    AND key NOT LIKE 'session:%'
  );

CREATE POLICY "settings_auth_insert"
  ON public.settings FOR INSERT TO anon
  WITH CHECK (
    public.is_app_authenticated()
    AND key NOT LIKE 'session:%'
  );

CREATE POLICY "settings_auth_update"
  ON public.settings FOR UPDATE TO anon
  USING (
    public.is_app_authenticated()
    AND key NOT LIKE 'session:%'
  )
  WITH CHECK (
    public.is_app_authenticated()
    AND key NOT LIKE 'session:%'
  );

CREATE POLICY "settings_auth_delete"
  ON public.settings FOR DELETE TO anon
  USING (
    public.is_app_authenticated()
    AND key NOT LIKE 'session:%'
  );

-- Setup: mark initialized once (after first admin exists, before session exists)
CREATE POLICY "settings_anon_mark_initialized"
  ON public.settings FOR INSERT TO anon
  WITH CHECK (
    key = 'initialized'
    AND value = 'true'::jsonb
    AND NOT EXISTS (
      SELECT 1 FROM public.settings s WHERE s.key = 'initialized'
    )
    AND EXISTS (SELECT 1 FROM public.users WHERE role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 6. users
--    anon: no SELECT; INSERT first admin only
--    auth: full access with valid session
-- ---------------------------------------------------------------------------

CREATE POLICY "users_anon_insert_first_admin"
  ON public.users FOR INSERT TO anon
  WITH CHECK (
    role = 'admin'
    AND status = 'active'
    AND NOT EXISTS (SELECT 1 FROM public.users)
  );

CREATE POLICY "users_auth_all"
  ON public.users FOR ALL TO anon
  USING (public.is_app_authenticated())
  WITH CHECK (public.is_app_authenticated());

-- ---------------------------------------------------------------------------
-- 7. materials
--    anon: published + guest_access only
--    auth: full access with valid session
-- ---------------------------------------------------------------------------

CREATE POLICY "materials_anon_select_guest"
  ON public.materials FOR SELECT TO anon
  USING (
    status = 'published'
    AND guest_access = TRUE
    AND deleted_at IS NULL
  );

CREATE POLICY "materials_auth_all"
  ON public.materials FOR ALL TO anon
  USING (public.is_app_authenticated())
  WITH CHECK (public.is_app_authenticated());

-- ---------------------------------------------------------------------------
-- 8. categories
--    anon: guest_access only
--    auth: full access with valid session
-- ---------------------------------------------------------------------------

CREATE POLICY "categories_anon_select_guest"
  ON public.categories FOR SELECT TO anon
  USING (guest_access = TRUE);

CREATE POLICY "categories_auth_all"
  ON public.categories FOR ALL TO anon
  USING (public.is_app_authenticated())
  WITH CHECK (public.is_app_authenticated());

-- ---------------------------------------------------------------------------
-- 9. roles, action_log, access_requests, tags — no anon access
--    authenticated app session only
-- ---------------------------------------------------------------------------

CREATE POLICY "roles_auth_all"
  ON public.roles FOR ALL TO anon
  USING (public.is_app_authenticated())
  WITH CHECK (public.is_app_authenticated());

CREATE POLICY "action_log_auth_all"
  ON public.action_log FOR ALL TO anon
  USING (public.is_app_authenticated())
  WITH CHECK (public.is_app_authenticated());

CREATE POLICY "access_requests_auth_all"
  ON public.access_requests FOR ALL TO anon
  USING (public.is_app_authenticated())
  WITH CHECK (public.is_app_authenticated());

CREATE POLICY "tags_auth_all"
  ON public.tags FOR ALL TO anon
  USING (public.is_app_authenticated())
  WITH CHECK (public.is_app_authenticated());

COMMIT;

-- ---------------------------------------------------------------------------
-- Optional verification (run separately):
-- ---------------------------------------------------------------------------
-- SELECT policyname, tablename, cmd, roles
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
--
-- SELECT public.get_setup_status();
-- SELECT public.is_app_authenticated();  -- false without header
