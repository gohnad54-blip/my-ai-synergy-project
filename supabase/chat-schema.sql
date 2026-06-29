-- AI Synergy Archive — internal chat (Stage: chat)
-- Run in Supabase Dashboard → SQL Editor AFTER schema.sql, grants.sql, rls-secure.sql
--
-- Two channels (registered users + admin only; guests have NO access):
--   1. Private: one thread per user ↔ admin (table private_messages)
--   2. Group:   single shared room for all registered users + admin (group_messages)
--
-- Client: x-app-session header (see js/core/supabase.js)
-- Unread: read_at on private messages; group_read_cursors per user for group chat
--
-- Does NOT alter existing tables (users, materials, comments, …).
--
-- Do NOT run until you confirm. Reply «виконано» after applying in Dashboard.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. private_messages — admin ↔ one registered user per thread_user_id
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.private_messages (
  id             TEXT PRIMARY KEY,
  thread_user_id TEXT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  sender_id      TEXT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  body           TEXT NOT NULL,
  created_at     BIGINT NOT NULL,
  read_at        BIGINT,
  CONSTRAINT private_messages_body_length CHECK (
    char_length(body) <= 2000 AND char_length(trim(body)) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_private_messages_thread_created
  ON public.private_messages (thread_user_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_private_messages_thread_unread
  ON public.private_messages (thread_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_private_messages_sender
  ON public.private_messages (sender_id, created_at DESC);

COMMENT ON TABLE public.private_messages IS
  '1:1 admin↔user chat; thread_user_id is always the non-admin participant';
COMMENT ON COLUMN public.private_messages.read_at IS
  'Set when the other party (not sender) has read the message';

-- ---------------------------------------------------------------------------
-- 2. group_messages — shared room for all registered users + admin
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.group_messages (
  id         TEXT PRIMARY KEY,
  sender_id  TEXT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  CONSTRAINT group_messages_body_length CHECK (
    char_length(body) <= 2000 AND char_length(trim(body)) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_group_messages_created
  ON public.group_messages (created_at ASC);

CREATE INDEX IF NOT EXISTS idx_group_messages_sender
  ON public.group_messages (sender_id, created_at DESC);

COMMENT ON TABLE public.group_messages IS
  'Group chat visible to all authenticated active users (no guests)';

-- ---------------------------------------------------------------------------
-- 3. group_read_cursors — per-user “last seen” for group unread badge
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.group_read_cursors (
  user_id      TEXT PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  last_read_at BIGINT NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.group_read_cursors IS
  'Group chat unread = messages with created_at > last_read_at from other senders';

-- ---------------------------------------------------------------------------
-- 4. Helper functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_active_app_user(p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user_id AND u.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.private_message_target_ok(p_thread_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_active_app_user(p_thread_user_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = p_thread_user_id AND u.role = 'admin'
    );
$$;

-- Mark private messages as read (recipient side only)
CREATE OR REPLACE FUNCTION public.mark_private_messages_read(p_thread_user_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reader TEXT := public.app_session_user_id();
  v_now    BIGINT := (extract(epoch FROM now()) * 1000)::bigint;
  v_count  INTEGER;
BEGIN
  IF v_reader IS NULL OR NOT public.is_active_app_user(v_reader) THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF public.is_app_admin() THEN
    UPDATE public.private_messages
    SET read_at = v_now
    WHERE thread_user_id = p_thread_user_id
      AND sender_id = p_thread_user_id
      AND read_at IS NULL;
  ELSIF v_reader = p_thread_user_id THEN
    UPDATE public.private_messages
    SET read_at = v_now
    WHERE thread_user_id = p_thread_user_id
      AND sender_id <> v_reader
      AND read_at IS NULL;
  ELSE
    RAISE EXCEPTION 'forbidden';
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Mark group chat as read up to now
CREATE OR REPLACE FUNCTION public.mark_group_chat_read()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reader TEXT := public.app_session_user_id();
  v_now    BIGINT := (extract(epoch FROM now()) * 1000)::bigint;
BEGIN
  IF v_reader IS NULL OR NOT public.is_active_app_user(v_reader) THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.group_read_cursors (user_id, last_read_at)
  VALUES (v_reader, v_now)
  ON CONFLICT (user_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at;

  RETURN v_now;
END;
$$;

-- Unread badge counts for sidebar/header: { "private": N, "group": N }
CREATE OR REPLACE FUNCTION public.get_chat_unread_counts()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reader        TEXT := public.app_session_user_id();
  v_private_count INTEGER := 0;
  v_group_count   INTEGER := 0;
  v_last_group    BIGINT := 0;
BEGIN
  IF v_reader IS NULL OR NOT public.is_active_app_user(v_reader) THEN
    RETURN jsonb_build_object('private', 0, 'group', 0);
  END IF;

  IF public.is_app_admin() THEN
    SELECT count(*)::integer INTO v_private_count
    FROM public.private_messages pm
    WHERE pm.sender_id = pm.thread_user_id
      AND pm.read_at IS NULL;
  ELSE
    SELECT count(*)::integer INTO v_private_count
    FROM public.private_messages pm
    WHERE pm.thread_user_id = v_reader
      AND pm.sender_id <> v_reader
      AND pm.read_at IS NULL;
  END IF;

  SELECT coalesce(grc.last_read_at, 0) INTO v_last_group
  FROM public.group_read_cursors grc
  WHERE grc.user_id = v_reader;

  SELECT count(*)::integer INTO v_group_count
  FROM public.group_messages gm
  WHERE gm.created_at > v_last_group
    AND gm.sender_id <> v_reader;

  RETURN jsonb_build_object('private', v_private_count, 'group', v_group_count);
END;
$$;

REVOKE ALL ON FUNCTION public.is_active_app_user(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.private_message_target_ok(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_private_messages_read(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_group_chat_read() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_chat_unread_counts() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_active_app_user(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.private_message_target_ok(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_private_messages_read(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_group_chat_read() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_unread_counts() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Table grants (RLS still applies; no guest/anon access without session)
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, DELETE ON TABLE public.private_messages TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.group_messages TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.group_read_cursors TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.private_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.group_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.group_read_cursors TO service_role;

-- mark_private_messages_read updates read_at via SECURITY DEFINER (no client UPDATE grant needed)

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_read_cursors ENABLE ROW LEVEL SECURITY;

-- ---- private_messages ----

-- SELECT: admin sees all threads; user sees only own thread
CREATE POLICY "private_messages_select"
  ON public.private_messages FOR SELECT
  TO anon, authenticated
  USING (
    public.is_app_authenticated()
    AND public.is_active_app_user(public.app_session_user_id())
    AND (
      public.is_app_admin()
      OR thread_user_id = public.app_session_user_id()
    )
  );

-- INSERT: user → own thread; admin → any non-admin active user thread
CREATE POLICY "private_messages_insert"
  ON public.private_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    public.is_app_authenticated()
    AND public.is_active_app_user(public.app_session_user_id())
    AND sender_id = public.app_session_user_id()
    AND (
      (
        public.is_app_admin()
        AND thread_user_id <> public.app_session_user_id()
        AND public.private_message_target_ok(thread_user_id)
      )
      OR (
        NOT public.is_app_admin()
        AND thread_user_id = public.app_session_user_id()
      )
    )
  );

-- No UPDATE/DELETE on private messages (read via RPC only)

-- ---- group_messages ----

CREATE POLICY "group_messages_select"
  ON public.group_messages FOR SELECT
  TO anon, authenticated
  USING (
    public.is_app_authenticated()
    AND public.is_active_app_user(public.app_session_user_id())
  );

CREATE POLICY "group_messages_insert"
  ON public.group_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    public.is_app_authenticated()
    AND public.is_active_app_user(public.app_session_user_id())
    AND sender_id = public.app_session_user_id()
  );

CREATE POLICY "group_messages_delete_admin"
  ON public.group_messages FOR DELETE
  TO anon, authenticated
  USING (public.is_app_admin());

CREATE POLICY "group_messages_delete_own"
  ON public.group_messages FOR DELETE
  TO anon, authenticated
  USING (
    public.is_app_authenticated()
    AND sender_id = public.app_session_user_id()
  );

-- ---- group_read_cursors ----

CREATE POLICY "group_read_cursors_select_own"
  ON public.group_read_cursors FOR SELECT
  TO anon, authenticated
  USING (
    public.is_app_authenticated()
    AND user_id = public.app_session_user_id()
  );

CREATE POLICY "group_read_cursors_insert_own"
  ON public.group_read_cursors FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    public.is_app_authenticated()
    AND user_id = public.app_session_user_id()
  );

CREATE POLICY "group_read_cursors_update_own"
  ON public.group_read_cursors FOR UPDATE
  TO anon, authenticated
  USING (user_id = public.app_session_user_id())
  WITH CHECK (user_id = public.app_session_user_id());

COMMIT;

-- ---------------------------------------------------------------------------
-- Optional verification (run separately):
-- ---------------------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('private_messages', 'group_messages', 'group_read_cursors');
--
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('private_messages', 'group_messages', 'group_read_cursors')
-- ORDER BY tablename, policyname;
--
-- SELECT public.get_chat_unread_counts();  -- needs x-app-session header
