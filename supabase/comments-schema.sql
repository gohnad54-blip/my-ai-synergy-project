-- AI Synergy Archive — comments system (Stage: comments)
-- Run in Supabase Dashboard → SQL Editor AFTER schema.sql, grants.sql, rls-secure.sql
--
-- Adds:
--   • materials.comments_access  ('all' | 'authenticated' | 'disabled')
--   • public.comments table
--   • RLS policies + helper functions
--
-- Client headers (see js/core/supabase.js after app update):
--   x-app-session: <token>     — registered users (existing)
--   x-guest-code: <code>       — anonymous guest id for comments (localStorage, session-scoped)
--
-- Do NOT run until you confirm. Reply «виконано» after applying in Dashboard.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. materials.comments_access
-- ---------------------------------------------------------------------------

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS comments_access TEXT NOT NULL DEFAULT 'disabled';

ALTER TABLE public.materials
  DROP CONSTRAINT IF EXISTS materials_comments_access_check;

ALTER TABLE public.materials
  ADD CONSTRAINT materials_comments_access_check
  CHECK (comments_access IN ('all', 'authenticated', 'disabled'));

COMMENT ON COLUMN public.materials.comments_access IS
  'Who may comment: all (incl. guests), authenticated only, or disabled';

-- ---------------------------------------------------------------------------
-- 2. comments table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.comments (
  id           TEXT PRIMARY KEY,
  material_id  TEXT NOT NULL REFERENCES public.materials (id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  author_type  TEXT NOT NULL CHECK (author_type IN ('guest', 'user')),
  author_name  TEXT NOT NULL,
  user_id      TEXT REFERENCES public.users (id) ON DELETE SET NULL,
  guest_code   TEXT,
  created_at   BIGINT NOT NULL,
  CONSTRAINT comments_body_length CHECK (
    char_length(body) <= 1000 AND char_length(trim(body)) > 0
  ),
  CONSTRAINT comments_author_shape CHECK (
    (author_type = 'guest' AND user_id IS NULL AND guest_code IS NOT NULL)
    OR
    (author_type = 'user' AND user_id IS NOT NULL AND guest_code IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_comments_material_id
  ON public.comments (material_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_comments_user_rate
  ON public.comments (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_guest_rate
  ON public.comments (guest_code, created_at DESC)
  WHERE guest_code IS NOT NULL;

COMMENT ON TABLE public.comments IS
  'Comments on published materials; guest_code from x-guest-code header';

-- ---------------------------------------------------------------------------
-- 3. Helper functions
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
      ''
    )),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = public.app_session_user_id()
      AND u.role = 'admin'
      AND u.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.comment_material_visible(p_material_id TEXT)
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
      AND m.comments_access <> 'disabled'
      AND (
        public.is_app_authenticated()
        OR m.guest_access = TRUE
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.comment_can_insert_on_material(p_material_id TEXT)
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
      AND (
        (m.comments_access = 'all')
        OR (
          m.comments_access = 'authenticated'
          AND public.is_app_authenticated()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.comment_rate_limit_ok(
  p_user_id    TEXT,
  p_guest_code TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT count(*)::integer
    FROM public.comments c
    WHERE c.created_at > ((extract(epoch FROM now()) * 1000)::bigint - 60000)
      AND (
        (p_user_id IS NOT NULL AND c.user_id = p_user_id)
        OR (p_guest_code IS NOT NULL AND c.guest_code = p_guest_code)
      )
  ) < 10;
$$;

REVOKE ALL ON FUNCTION public.request_guest_comment_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.comment_material_visible(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.comment_can_insert_on_material(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.comment_rate_limit_ok(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_guest_comment_code() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comment_material_visible(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comment_can_insert_on_material(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comment_rate_limit_ok(TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Grants (RLS still applies)
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, DELETE ON TABLE public.comments TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comments TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone who can view the parent material (comments not disabled)
CREATE POLICY "comments_select_visible"
  ON public.comments FOR SELECT TO anon
  USING (public.comment_material_visible(material_id));

-- INSERT: guest comment (comments_access = 'all')
CREATE POLICY "comments_insert_guest"
  ON public.comments FOR INSERT TO anon
  WITH CHECK (
    author_type = 'guest'
    AND user_id IS NULL
    AND guest_code IS NOT NULL
    AND char_length(guest_code) BETWEEN 4 AND 32
    AND guest_code = public.request_guest_comment_code()
    AND author_name = ('Гість #' || guest_code)
    AND public.comment_can_insert_on_material(material_id)
    AND EXISTS (
      SELECT 1 FROM public.materials m
      WHERE m.id = material_id AND m.comments_access = 'all'
    )
    AND public.comment_rate_limit_ok(NULL, guest_code)
  );

-- INSERT: registered user
CREATE POLICY "comments_insert_user"
  ON public.comments FOR INSERT TO anon
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

-- DELETE: admin — any comment
CREATE POLICY "comments_delete_admin"
  ON public.comments FOR DELETE TO anon
  USING (public.is_app_admin());

-- DELETE: author (registered)
CREATE POLICY "comments_delete_own_user"
  ON public.comments FOR DELETE TO anon
  USING (
    author_type = 'user'
    AND user_id IS NOT NULL
    AND user_id = public.app_session_user_id()
  );

-- DELETE: author (guest, same x-guest-code)
CREATE POLICY "comments_delete_own_guest"
  ON public.comments FOR DELETE TO anon
  USING (
    author_type = 'guest'
    AND guest_code IS NOT NULL
    AND guest_code = public.request_guest_comment_code()
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- Optional verification (run separately):
-- ---------------------------------------------------------------------------
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'materials'
--   AND column_name = 'comments_access';
--
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'comments';
--
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'comments'
-- ORDER BY policyname;
