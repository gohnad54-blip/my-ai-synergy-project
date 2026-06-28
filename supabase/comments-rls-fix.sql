-- AI Synergy Archive — fix comments INSERT for anon/guest
-- Run in Supabase Dashboard → SQL Editor
--
-- Symptoms: put(comments): permission denied for table comments
--
-- Root causes fixed here:
--   1. db.put() uses UPSERT → PostgREST requires UPDATE grant on table (not only INSERT)
--   2. INSERT policy had a direct SELECT on materials as anon (blocked by materials RLS)
--   3. Policies targeted only role "anon"; use anon + authenticated (Supabase API roles)
--
-- Do NOT run until you confirm. Reply «виконано» after applying in Dashboard.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Table grants (UPSERT needs UPDATE privilege)
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comments TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_guest_comment_code()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT nullif(
    trim(both '"' FROM coalesce(
      current_setting('request.headers', true)::json->>'x-guest-code',
      current_setting('request.headers', true)::json->>'X-Guest-Code',
      ''
    )),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.comment_material_comments_access(
  p_material_id TEXT,
  p_access      TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.materials m
    WHERE m.id = p_material_id
      AND m.status = 'published'
      AND m.deleted_at IS NULL
      AND m.comments_access = p_access
  );
$$;

REVOKE ALL ON FUNCTION public.request_guest_comment_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.comment_material_comments_access(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_guest_comment_code() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comment_material_comments_access(TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Replace policies (drop + recreate)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "comments_select_visible" ON public.comments;
DROP POLICY IF EXISTS "comments_insert_guest" ON public.comments;
DROP POLICY IF EXISTS "comments_insert_user" ON public.comments;
DROP POLICY IF EXISTS "comments_delete_admin" ON public.comments;
DROP POLICY IF EXISTS "comments_delete_own_user" ON public.comments;
DROP POLICY IF EXISTS "comments_delete_own_guest" ON public.comments;

-- SELECT
CREATE POLICY "comments_select_visible"
  ON public.comments FOR SELECT
  TO anon, authenticated
  USING (public.comment_material_visible(material_id));

-- INSERT: guest (comments_access = 'all', x-guest-code header)
CREATE POLICY "comments_insert_guest"
  ON public.comments FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    author_type = 'guest'
    AND user_id IS NULL
    AND guest_code IS NOT NULL
    AND char_length(guest_code) BETWEEN 4 AND 32
    AND guest_code ~ '^[A-Z0-9]+$'
    AND guest_code = public.request_guest_comment_code()
    AND author_name = ('Гість #' || guest_code)
    AND public.comment_can_insert_on_material(material_id)
    AND public.comment_material_comments_access(material_id, 'all')
    AND public.comment_rate_limit_ok(NULL, guest_code)
  );

-- INSERT: registered user (comments_access = all | authenticated)
CREATE POLICY "comments_insert_user"
  ON public.comments FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    author_type = 'user'
    AND guest_code IS NULL
    AND public.is_app_authenticated()
    AND user_id = public.app_session_user_id()
    AND author_name = (
      SELECT u.display_name
      FROM public.users u
      WHERE u.id = public.app_session_user_id()
        AND u.status = 'active'
    )
    AND public.comment_can_insert_on_material(material_id)
    AND public.comment_rate_limit_ok(user_id, NULL)
  );

-- DELETE
CREATE POLICY "comments_delete_admin"
  ON public.comments FOR DELETE
  TO anon, authenticated
  USING (public.is_app_admin());

CREATE POLICY "comments_delete_own_user"
  ON public.comments FOR DELETE
  TO anon, authenticated
  USING (
    author_type = 'user'
    AND user_id IS NOT NULL
    AND user_id = public.app_session_user_id()
  );

CREATE POLICY "comments_delete_own_guest"
  ON public.comments FOR DELETE
  TO anon, authenticated
  USING (
    author_type = 'guest'
    AND guest_code IS NOT NULL
    AND guest_code = public.request_guest_comment_code()
  );

COMMIT;

-- Verify (run separately):
-- SELECT grantee, privilege_type FROM information_schema.table_privileges
--   WHERE table_schema = 'public' AND table_name = 'comments'
--   ORDER BY grantee, privilege_type;
--
-- SELECT policyname, cmd, roles FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'comments'
--   ORDER BY policyname;
