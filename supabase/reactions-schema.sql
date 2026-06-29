-- AI Synergy Archive — reactions on comments, private chat, group chat
-- Run in Supabase Dashboard → SQL Editor AFTER:
--   schema.sql, grants.sql, rls-secure.sql,
--   comments-schema.sql, chat-schema.sql
--
-- Adds:
--   • public.reactions — one row per actor per target (emoji can be updated)
--   • Helper functions + RLS
--
-- Reaction keys (client maps to emoji):
--   thumbs_up → 👍   thumbs_down → 👎   heart → ❤️
--   laugh → 😂       wow → 😮           sad → 😢
--
-- Targets (target_type + target_id):
--   comment          → comments.id
--   private_message  → private_messages.id
--   group_message    → group_messages.id
--
-- Actor:
--   Registered user → user_id = app_session_user_id(), guest_code NULL
--   Guest (comments only) → guest_code from x-guest-code header, user_id NULL
--
-- Client headers (unchanged):
--   x-app-session  — registered users
--   x-guest-code   — guest identity (sessionStorage, Latin A-Z0-9)
--
-- Does NOT alter comments, private_messages, group_messages (no new columns).
--
-- Do NOT run until you confirm. Reply «виконано» after applying in Dashboard.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. reactions table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reactions (
  id           TEXT PRIMARY KEY,
  target_type  TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  reaction     TEXT NOT NULL,
  user_id      TEXT REFERENCES public.users (id) ON DELETE CASCADE,
  guest_code   TEXT,
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL,
  CONSTRAINT reactions_target_type_check
    CHECK (target_type IN ('comment', 'private_message', 'group_message')),
  CONSTRAINT reactions_reaction_check
    CHECK (reaction IN ('thumbs_up', 'thumbs_down', 'heart', 'laugh', 'wow', 'sad')),
  CONSTRAINT reactions_actor_shape CHECK (
    (user_id IS NOT NULL AND guest_code IS NULL)
    OR (user_id IS NULL AND guest_code IS NOT NULL)
  ),
  CONSTRAINT reactions_guest_only_on_comments CHECK (
    guest_code IS NULL OR target_type = 'comment'
  ),
  CONSTRAINT reactions_chat_requires_user CHECK (
    target_type = 'comment' OR user_id IS NOT NULL
  )
);

-- One registered user → one reaction row per target
CREATE UNIQUE INDEX IF NOT EXISTS reactions_unique_user_target
  ON public.reactions (target_type, target_id, user_id)
  WHERE user_id IS NOT NULL;

-- One guest → one reaction row per comment
CREATE UNIQUE INDEX IF NOT EXISTS reactions_unique_guest_target
  ON public.reactions (target_type, target_id, guest_code)
  WHERE guest_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reactions_target
  ON public.reactions (target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_reactions_user_rate
  ON public.reactions (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reactions_guest_rate
  ON public.reactions (guest_code, created_at DESC)
  WHERE guest_code IS NOT NULL;

COMMENT ON TABLE public.reactions IS
  'Emoji reactions on comments and chat messages; one row per actor per target';
COMMENT ON COLUMN public.reactions.target_type IS
  'comment | private_message | group_message';
COMMENT ON COLUMN public.reactions.reaction IS
  'thumbs_up | thumbs_down | heart | laugh | wow | sad';

-- ---------------------------------------------------------------------------
-- 2. Helper functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reaction_guest_code_valid(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_code IS NOT NULL
    AND char_length(p_code) BETWEEN 4 AND 32
    AND p_code ~ '^[A-Z0-9]+$';
$$;

CREATE OR REPLACE FUNCTION public.reaction_target_visible(
  p_target_type TEXT,
  p_target_id   TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_target_type
    WHEN 'comment' THEN EXISTS (
      SELECT 1
      FROM public.comments c
      WHERE c.id = p_target_id
        AND public.comment_material_visible(c.material_id)
    )
    WHEN 'private_message' THEN EXISTS (
      SELECT 1
      FROM public.private_messages pm
      WHERE pm.id = p_target_id
        AND public.is_app_authenticated()
        AND public.is_active_app_user(public.app_session_user_id())
        AND (
          public.is_app_admin()
          OR pm.thread_user_id = public.app_session_user_id()
        )
    )
    WHEN 'group_message' THEN EXISTS (
      SELECT 1
      FROM public.group_messages gm
      WHERE gm.id = p_target_id
        AND public.is_app_authenticated()
        AND public.is_active_app_user(public.app_session_user_id())
    )
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE FUNCTION public.reaction_is_own_row(
  p_user_id    TEXT,
  p_guest_code TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (
    p_user_id IS NOT NULL
    AND public.is_app_authenticated()
    AND p_user_id = public.app_session_user_id()
    AND public.is_active_app_user(public.app_session_user_id())
  )
  OR (
    p_guest_code IS NOT NULL
    AND p_guest_code = public.request_guest_comment_code()
    AND public.reaction_guest_code_valid(p_guest_code)
  );
$$;

CREATE OR REPLACE FUNCTION public.reaction_rate_limit_ok(
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
    FROM public.reactions r
    WHERE r.created_at > ((extract(epoch FROM now()) * 1000)::bigint - 60000)
      AND (
        (p_user_id IS NOT NULL AND r.user_id = p_user_id)
        OR (p_guest_code IS NOT NULL AND r.guest_code = p_guest_code)
      )
  ) < 10;
$$;

REVOKE ALL ON FUNCTION public.reaction_guest_code_valid(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reaction_target_visible(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reaction_is_own_row(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reaction_rate_limit_ok(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reaction_guest_code_valid(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reaction_target_visible(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reaction_is_own_row(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reaction_rate_limit_ok(TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Grants (RLS still applies)
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reactions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reactions TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone who can see the parent comment/message
CREATE POLICY "reactions_select_visible"
  ON public.reactions FOR SELECT
  TO anon, authenticated
  USING (public.reaction_target_visible(target_type, target_id));

-- INSERT: registered user (comments, private chat, group chat)
CREATE POLICY "reactions_insert_user"
  ON public.reactions FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    user_id IS NOT NULL
    AND guest_code IS NULL
    AND user_id = public.app_session_user_id()
    AND public.is_app_authenticated()
    AND public.is_active_app_user(public.app_session_user_id())
    AND public.reaction_target_visible(target_type, target_id)
    AND public.reaction_rate_limit_ok(user_id, NULL)
    AND target_type IN ('comment', 'private_message', 'group_message')
  );

-- INSERT: guest on comments only (same guest_code rules as comments)
CREATE POLICY "reactions_insert_guest_comment"
  ON public.reactions FOR INSERT
  TO anon
  WITH CHECK (
    target_type = 'comment'
    AND user_id IS NULL
    AND guest_code IS NOT NULL
    AND public.reaction_guest_code_valid(guest_code)
    AND guest_code = public.request_guest_comment_code()
    AND public.reaction_target_visible('comment', target_id)
    AND public.reaction_rate_limit_ok(NULL, guest_code)
  );

-- UPDATE: change emoji on own reaction (one actor = one row)
CREATE POLICY "reactions_update_own"
  ON public.reactions FOR UPDATE
  TO anon, authenticated
  USING (
    public.reaction_target_visible(target_type, target_id)
    AND public.reaction_is_own_row(user_id, guest_code)
  )
  WITH CHECK (
    public.reaction_target_visible(target_type, target_id)
    AND public.reaction_is_own_row(user_id, guest_code)
  );

-- DELETE: remove own reaction (toggle off)
CREATE POLICY "reactions_delete_own"
  ON public.reactions FOR DELETE
  TO anon, authenticated
  USING (
    public.reaction_target_visible(target_type, target_id)
    AND public.reaction_is_own_row(user_id, guest_code)
  );

-- DELETE: admin may remove any reaction on comments (moderation)
CREATE POLICY "reactions_delete_admin_comments"
  ON public.reactions FOR DELETE
  TO anon, authenticated
  USING (
    target_type = 'comment'
    AND public.is_app_admin()
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- Optional verification (run separately):
-- ---------------------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'reactions';
--
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'reactions';
--
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'reactions'
-- ORDER BY policyname;
