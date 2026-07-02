-- AI Synergy Archive — group chat polls
-- Run in Supabase Dashboard → SQL Editor AFTER:
--   schema.sql, grants.sql, rls-secure.sql,
--   comments-schema.sql (is_app_admin), chat-schema.sql
--
-- Adds:
--   • public.polls            — poll metadata, linked to group_messages
--   • public.poll_options     — answer choices
--   • public.poll_votes       — one row per user per poll (atomic upsert)
--   • public.poll_vote_history — vote-change audit (admin / polls.view_voters only)
--   • Permission helper app_has_permission()
--   • SECURITY DEFINER RPCs (no direct client access to vote rows)
--
-- Permissions (client roles UI — assigned via roles.permissions JSONB):
--   polls.create       — create polls in group chat (admin has implicitly)
--   polls.view_voters  — see who voted, non-voters, vote-change history
--
-- Security model:
--   • poll_votes / poll_vote_history: NO direct SELECT for anon/authenticated
--   • Aggregated results + caller's own vote: get_poll_results()
--   • Voter details: get_poll_voter_details() — polls.view_voters only
--   • Voting: cast_poll_vote() — UNIQUE (poll_id, user_id) upsert in one transaction
--   • After first vote: question + options locked (triggers); admin may close/delete only
--   • DELETE group_messages → CASCADE deletes poll + options + votes + history
--
-- Do NOT run until you confirm. Reply «виконано» after applying in Dashboard.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Permission helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_has_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.app_session_user_id() IS NULL THEN FALSE
    WHEN public.is_app_admin() THEN TRUE
    ELSE EXISTS (
      SELECT 1
      FROM public.users u
      JOIN public.roles r ON r.id = u.role
      WHERE u.id = public.app_session_user_id()
        AND u.status = 'active'
        AND r.permissions @> to_jsonb(ARRAY[p_permission]::text[])
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.app_has_permission(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_has_permission(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.polls (
  id                TEXT PRIMARY KEY,
  group_message_id  TEXT NOT NULL UNIQUE REFERENCES public.group_messages (id) ON DELETE CASCADE,
  question          TEXT NOT NULL,
  poll_type         TEXT NOT NULL,
  created_by        TEXT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at        BIGINT NOT NULL,
  closes_at         BIGINT,
  closed_at         BIGINT,
  status            TEXT NOT NULL DEFAULT 'active',
  locked_at         BIGINT,
  CONSTRAINT polls_question_length CHECK (
    char_length(trim(question)) BETWEEN 1 AND 500
  ),
  CONSTRAINT polls_type_check CHECK (poll_type IN ('single', 'multiple')),
  CONSTRAINT polls_status_check CHECK (status IN ('active', 'closed')),
  CONSTRAINT polls_closed_shape CHECK (
    (status = 'closed' AND closed_at IS NOT NULL)
    OR (status = 'active' AND closed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_polls_status_created
  ON public.polls (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_polls_closes_at
  ON public.polls (closes_at)
  WHERE status = 'active' AND closes_at IS NOT NULL;

COMMENT ON TABLE public.polls IS
  'Group-chat polls; one poll per group_messages row; deleted when message is deleted';
COMMENT ON COLUMN public.polls.locked_at IS
  'Set on first vote — question/options become immutable afterward';
COMMENT ON COLUMN public.polls.closes_at IS
  'Optional auto-close timestamp (epoch ms); enforced by poll_ensure_current_status()';

CREATE TABLE IF NOT EXISTS public.poll_options (
  id         TEXT PRIMARY KEY,
  poll_id    TEXT NOT NULL REFERENCES public.polls (id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT poll_options_label_length CHECK (
    char_length(trim(label)) BETWEEN 1 AND 200
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS poll_options_poll_position
  ON public.poll_options (poll_id, position);

CREATE INDEX IF NOT EXISTS idx_poll_options_poll
  ON public.poll_options (poll_id, position ASC);

COMMENT ON TABLE public.poll_options IS
  'Poll answer choices; immutable after polls.locked_at is set';

CREATE TABLE IF NOT EXISTS public.poll_votes (
  poll_id        TEXT NOT NULL REFERENCES public.polls (id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  option_ids     JSONB NOT NULL,
  voted_at       BIGINT NOT NULL,
  PRIMARY KEY (poll_id, user_id),
  CONSTRAINT poll_votes_option_ids_array CHECK (jsonb_typeof(option_ids) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_voted
  ON public.poll_votes (poll_id, voted_at DESC);

COMMENT ON TABLE public.poll_votes IS
  'Current vote per user per poll; one row — change vote via cast_poll_vote() upsert';
COMMENT ON COLUMN public.poll_votes.option_ids IS
  'JSON array of poll_options.id strings; single-choice polls store exactly one id';

CREATE TABLE IF NOT EXISTS public.poll_vote_history (
  id                   TEXT PRIMARY KEY,
  poll_id              TEXT NOT NULL REFERENCES public.polls (id) ON DELETE CASCADE,
  user_id              TEXT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  previous_option_ids  JSONB,
  new_option_ids       JSONB NOT NULL,
  changed_at           BIGINT NOT NULL,
  CONSTRAINT poll_vote_history_new_array CHECK (jsonb_typeof(new_option_ids) = 'array'),
  CONSTRAINT poll_vote_history_prev_array CHECK (
    previous_option_ids IS NULL OR jsonb_typeof(previous_option_ids) = 'array'
  )
);

CREATE INDEX IF NOT EXISTS idx_poll_vote_history_poll_changed
  ON public.poll_vote_history (poll_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_poll_vote_history_poll_user
  ON public.poll_vote_history (poll_id, user_id, changed_at DESC);

COMMENT ON TABLE public.poll_vote_history IS
  'Append-only vote change log; readable only via get_poll_voter_details()';

-- ---------------------------------------------------------------------------
-- 3. Immutability triggers (lock after first vote)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.poll_lock_on_first_vote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.polls
  SET locked_at = coalesce(locked_at, NEW.voted_at)
  WHERE id = NEW.poll_id
    AND locked_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS poll_votes_lock_poll ON public.poll_votes;
CREATE TRIGGER poll_votes_lock_poll
  AFTER INSERT ON public.poll_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.poll_lock_on_first_vote();

CREATE OR REPLACE FUNCTION public.poll_reject_locked_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked_at BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'polls' THEN
    v_locked_at := OLD.locked_at;
    IF v_locked_at IS NOT NULL THEN
      IF NEW.question IS DISTINCT FROM OLD.question
         OR NEW.poll_type IS DISTINCT FROM OLD.poll_type THEN
        RAISE EXCEPTION 'poll is locked after first vote';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'poll_options' THEN
    SELECT p.locked_at INTO v_locked_at
    FROM public.polls p
    WHERE p.id = OLD.poll_id;

    IF v_locked_at IS NOT NULL THEN
      IF NEW.label IS DISTINCT FROM OLD.label
         OR NEW.position IS DISTINCT FROM OLD.position
         OR NEW.poll_id IS DISTINCT FROM OLD.poll_id THEN
        RAISE EXCEPTION 'poll options are locked after first vote';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS polls_reject_locked_edit ON public.polls;
CREATE TRIGGER polls_reject_locked_edit
  BEFORE UPDATE ON public.polls
  FOR EACH ROW
  EXECUTE FUNCTION public.poll_reject_locked_edit();

DROP TRIGGER IF EXISTS poll_options_reject_locked_edit ON public.poll_options;
CREATE TRIGGER poll_options_reject_locked_edit
  BEFORE UPDATE ON public.poll_options
  FOR EACH ROW
  EXECUTE FUNCTION public.poll_reject_locked_edit();

-- ---------------------------------------------------------------------------
-- 4. Internal helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.poll_ensure_current_status(p_poll_id TEXT)
RETURNS public.polls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll public.polls;
  v_now  BIGINT := (extract(epoch FROM now()) * 1000)::bigint;
BEGIN
  SELECT * INTO v_poll FROM public.polls WHERE id = p_poll_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'poll not found';
  END IF;

  IF v_poll.status = 'active'
     AND v_poll.closes_at IS NOT NULL
     AND v_poll.closes_at <= v_now THEN
    UPDATE public.polls
    SET status = 'closed', closed_at = v_now
    WHERE id = p_poll_id
    RETURNING * INTO v_poll;
  END IF;

  RETURN v_poll;
END;
$$;

CREATE OR REPLACE FUNCTION public.poll_validate_option_ids(
  p_poll_id    TEXT,
  p_poll_type  TEXT,
  p_option_ids JSONB
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_distinct INTEGER;
BEGIN
  IF jsonb_typeof(p_option_ids) <> 'array' OR jsonb_array_length(p_option_ids) = 0 THEN
    RAISE EXCEPTION 'at least one option is required';
  END IF;

  IF p_poll_type = 'single' AND jsonb_array_length(p_option_ids) <> 1 THEN
    RAISE EXCEPTION 'single-choice poll requires exactly one option';
  END IF;

  SELECT count(*)::integer, count(DISTINCT elem)::integer
  INTO v_count, v_distinct
  FROM jsonb_array_elements_text(p_option_ids) AS elem
  JOIN public.poll_options po ON po.id = elem
  WHERE po.poll_id = p_poll_id;

  IF v_count <> jsonb_array_length(p_option_ids) OR v_count <> v_distinct THEN
    RAISE EXCEPTION 'invalid poll options';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.poll_can_manage(p_poll_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_has_permission('polls.create')
    AND EXISTS (
      SELECT 1 FROM public.polls p
      WHERE p.id = p_poll_id
        AND (
          p.created_by = public.app_session_user_id()
          OR public.is_app_admin()
        )
    );
$$;

REVOKE ALL ON FUNCTION public.poll_ensure_current_status(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.poll_validate_option_ids(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.poll_can_manage(TEXT) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 5. RPCs — create / vote / close / read
-- ---------------------------------------------------------------------------

-- Creates group message + poll + options atomically
CREATE OR REPLACE FUNCTION public.create_group_poll(
  p_message_id  TEXT,
  p_poll_id     TEXT,
  p_question    TEXT,
  p_poll_type   TEXT,
  p_option_ids  TEXT[],
  p_option_labels TEXT[],
  p_closes_at   BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user TEXT := public.app_session_user_id();
  v_now  BIGINT := (extract(epoch FROM now()) * 1000)::bigint;
  v_i    INTEGER;
BEGIN
  IF v_user IS NULL OR NOT public.is_active_app_user(v_user) THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.app_has_permission('polls.create') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_poll_type NOT IN ('single', 'multiple') THEN
    RAISE EXCEPTION 'invalid poll type';
  END IF;

  IF p_option_ids IS NULL OR p_option_labels IS NULL
     OR array_length(p_option_ids, 1) IS NULL
     OR array_length(p_option_ids, 1) < 2
     OR array_length(p_option_ids, 1) > 10
     OR array_length(p_option_ids, 1) <> array_length(p_option_labels, 1) THEN
    RAISE EXCEPTION 'poll requires 2–10 options';
  END IF;

  IF p_closes_at IS NOT NULL AND p_closes_at <= v_now THEN
    RAISE EXCEPTION 'closes_at must be in the future';
  END IF;

  INSERT INTO public.group_messages (id, sender_id, body, created_at)
  VALUES (
    p_message_id,
    v_user,
    trim(p_question),
    v_now
  );

  INSERT INTO public.polls (
    id, group_message_id, question, poll_type,
    created_by, created_at, closes_at, status
  ) VALUES (
    p_poll_id,
    p_message_id,
    trim(p_question),
    p_poll_type,
    v_user,
    v_now,
    p_closes_at,
    'active'
  );

  FOR v_i IN 1..array_length(p_option_ids, 1) LOOP
    INSERT INTO public.poll_options (id, poll_id, label, position)
    VALUES (
      p_option_ids[v_i],
      p_poll_id,
      trim(p_option_labels[v_i]),
      v_i - 1
    );
  END LOOP;

  RETURN jsonb_build_object(
    'pollId', p_poll_id,
    'messageId', p_message_id
  );
END;
$$;

-- Atomic vote / change vote (no cancel — always >= 1 option)
CREATE OR REPLACE FUNCTION public.cast_poll_vote(
  p_poll_id    TEXT,
  p_option_ids JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   TEXT := public.app_session_user_id();
  v_now    BIGINT := (extract(epoch FROM now()) * 1000)::bigint;
  v_poll   public.polls;
  v_prev   JSONB;
  v_history_id TEXT;
BEGIN
  IF v_user IS NULL OR NOT public.is_active_app_user(v_user) THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_poll := public.poll_ensure_current_status(p_poll_id);

  IF v_poll.status <> 'active' THEN
    RAISE EXCEPTION 'poll is closed';
  END IF;

  PERFORM public.poll_validate_option_ids(v_poll.id, v_poll.poll_type, p_option_ids);

  SELECT pv.option_ids INTO v_prev
  FROM public.poll_votes pv
  WHERE pv.poll_id = p_poll_id AND pv.user_id = v_user
  FOR UPDATE;

  IF v_prev IS NOT NULL AND v_prev = p_option_ids THEN
    RETURN jsonb_build_object('pollId', p_poll_id, 'changed', FALSE);
  END IF;

  IF v_prev IS NOT NULL THEN
    v_history_id := 'pvh_' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.poll_vote_history (
      id, poll_id, user_id, previous_option_ids, new_option_ids, changed_at
    ) VALUES (
      v_history_id, p_poll_id, v_user, v_prev, p_option_ids, v_now
    );
  END IF;

  INSERT INTO public.poll_votes (poll_id, user_id, option_ids, voted_at)
  VALUES (p_poll_id, v_user, p_option_ids, v_now)
  ON CONFLICT (poll_id, user_id) DO UPDATE
    SET option_ids = EXCLUDED.option_ids,
        voted_at = EXCLUDED.voted_at;

  RETURN jsonb_build_object('pollId', p_poll_id, 'changed', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_group_poll(p_poll_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now BIGINT := (extract(epoch FROM now()) * 1000)::bigint;
BEGIN
  IF NOT public.poll_can_manage(p_poll_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.polls
  SET status = 'closed', closed_at = v_now
  WHERE id = p_poll_id AND status = 'active';

  RETURN jsonb_build_object('pollId', p_poll_id, 'closed', TRUE);
END;
$$;

-- Aggregated results for everyone; includes only caller's own vote
CREATE OR REPLACE FUNCTION public.get_poll_results(p_poll_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll   public.polls;
  v_user   TEXT := public.app_session_user_id();
  v_my     JSONB;
  v_total  INTEGER;
BEGIN
  IF v_user IS NULL OR NOT public.is_active_app_user(v_user) THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_poll := public.poll_ensure_current_status(p_poll_id);

  SELECT pv.option_ids INTO v_my
  FROM public.poll_votes pv
  WHERE pv.poll_id = p_poll_id AND pv.user_id = v_user;

  SELECT count(*)::integer INTO v_total
  FROM public.poll_votes pv
  WHERE pv.poll_id = p_poll_id;

  RETURN jsonb_build_object(
    'poll', jsonb_build_object(
      'id', v_poll.id,
      'groupMessageId', v_poll.group_message_id,
      'question', v_poll.question,
      'pollType', v_poll.poll_type,
      'status', v_poll.status,
      'createdAt', v_poll.created_at,
      'closesAt', v_poll.closes_at,
      'closedAt', v_poll.closed_at,
      'lockedAt', v_poll.locked_at,
      'canManage', public.poll_can_manage(p_poll_id)
    ),
    'options', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'id', po.id,
          'label', po.label,
          'position', po.position,
          'voteCount', coalesce(vc.cnt, 0),
          'percent', CASE
            WHEN v_total = 0 THEN 0
            ELSE round((coalesce(vc.cnt, 0)::numeric / v_total::numeric) * 100, 1)
          END
        )
        ORDER BY po.position
      ), '[]'::jsonb)
      FROM public.poll_options po
      LEFT JOIN LATERAL (
        SELECT count(*)::integer AS cnt
        FROM public.poll_votes pv
        CROSS JOIN LATERAL jsonb_array_elements_text(pv.option_ids) AS oid(opt_id)
        WHERE pv.poll_id = p_poll_id AND oid.opt_id = po.id
      ) vc ON TRUE
      WHERE po.poll_id = p_poll_id
    ),
    'totalVoters', v_total,
    'myOptionIds', coalesce(v_my, '[]'::jsonb)
  );
END;
$$;

-- Voter details — ONLY polls.view_voters (admin implicit)
CREATE OR REPLACE FUNCTION public.get_poll_voter_details(p_poll_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll public.polls;
BEGIN
  IF NOT public.app_has_permission('polls.view_voters') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.polls p WHERE p.id = p_poll_id
  ) THEN
    RAISE EXCEPTION 'poll not found';
  END IF;

  v_poll := public.poll_ensure_current_status(p_poll_id);

  RETURN jsonb_build_object(
    'pollId', p_poll_id,
    'voters', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'userId', pv.user_id,
          'displayName', coalesce(u.display_name, u.login, pv.user_id),
          'optionIds', pv.option_ids,
          'optionLabels', (
            SELECT coalesce(jsonb_agg(po.label ORDER BY po.position), '[]'::jsonb)
            FROM public.poll_options po
            WHERE po.poll_id = p_poll_id
              AND po.id IN (
                SELECT jsonb_array_elements_text(pv.option_ids)
              )
          ),
          'votedAt', pv.voted_at
        )
        ORDER BY pv.voted_at DESC
      ), '[]'::jsonb)
      FROM public.poll_votes pv
      JOIN public.users u ON u.id = pv.user_id
      WHERE pv.poll_id = p_poll_id
    ),
    'notVoted', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'userId', u.id,
          'displayName', coalesce(u.display_name, u.login, u.id)
        )
        ORDER BY coalesce(u.display_name, u.login, u.id)
      ), '[]'::jsonb)
      FROM public.users u
      WHERE u.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM public.poll_votes pv
          WHERE pv.poll_id = p_poll_id AND pv.user_id = u.id
        )
    ),
    'history', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'id', h.id,
          'userId', h.user_id,
          'displayName', coalesce(u.display_name, u.login, h.user_id),
          'previousOptionIds', coalesce(h.previous_option_ids, '[]'::jsonb),
          'newOptionIds', h.new_option_ids,
          'changedAt', h.changed_at
        )
        ORDER BY h.changed_at DESC
      ), '[]'::jsonb)
      FROM public.poll_vote_history h
      JOIN public.users u ON u.id = h.user_id
      WHERE h.poll_id = p_poll_id
    )
  );
END;
$$;

-- Batch fetch polls for group chat render (metadata + options only; results via get_poll_results)
CREATE OR REPLACE FUNCTION public.get_polls_for_messages(p_message_ids TEXT[])
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'pollId', p.id,
      'groupMessageId', p.group_message_id,
      'question', p.question,
      'pollType', p.poll_type,
      'status', p.status,
      'createdAt', p.created_at,
      'closesAt', p.closes_at,
      'closedAt', p.closed_at,
      'canManage', public.poll_can_manage(p.id),
      'options', (
        SELECT coalesce(jsonb_agg(
          jsonb_build_object('id', po.id, 'label', po.label, 'position', po.position)
          ORDER BY po.position
        ), '[]'::jsonb)
        FROM public.poll_options po
        WHERE po.poll_id = p.id
      )
    )
  ), '[]'::jsonb)
  FROM public.polls p
  WHERE p.group_message_id = ANY (p_message_ids)
    AND public.is_app_authenticated()
    AND public.is_active_app_user(public.app_session_user_id());
$$;

REVOKE ALL ON FUNCTION public.create_group_poll(TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT[], BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cast_poll_vote(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_group_poll(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_poll_results(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_poll_voter_details(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_polls_for_messages(TEXT[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_group_poll(TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT[], BIGINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cast_poll_vote(TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_group_poll(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_poll_results(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_poll_voter_details(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_polls_for_messages(TEXT[]) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Table grants — votes/history: no direct client access
-- ---------------------------------------------------------------------------

GRANT SELECT ON TABLE public.polls TO anon, authenticated;
GRANT SELECT ON TABLE public.poll_options TO anon, authenticated;
-- poll_votes / poll_vote_history: intentionally NO grants to anon/authenticated

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.polls TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.poll_options TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.poll_votes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.poll_vote_history TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_vote_history ENABLE ROW LEVEL SECURITY;

-- polls / options: readable by any active group-chat member
CREATE POLICY "polls_select_active_users"
  ON public.polls FOR SELECT
  TO anon, authenticated
  USING (
    public.is_app_authenticated()
    AND public.is_active_app_user(public.app_session_user_id())
  );

CREATE POLICY "poll_options_select_active_users"
  ON public.poll_options FOR SELECT
  TO anon, authenticated
  USING (
    public.is_app_authenticated()
    AND public.is_active_app_user(public.app_session_user_id())
    AND EXISTS (
      SELECT 1 FROM public.polls p
      WHERE p.id = poll_id
    )
  );

-- No direct INSERT/UPDATE/DELETE on polls — RPC only
-- (service_role bypasses RLS for maintenance)

-- poll_votes: deny all direct access — RPC only
CREATE POLICY "poll_votes_deny_all"
  ON public.poll_votes FOR ALL
  TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

CREATE POLICY "poll_vote_history_deny_all"
  ON public.poll_vote_history FOR ALL
  TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

COMMIT;

-- ---------------------------------------------------------------------------
-- Optional verification (run separately):
-- ---------------------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('polls', 'poll_options', 'poll_votes', 'poll_vote_history');
--
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.table_privileges
-- WHERE table_schema = 'public'
--   AND table_name IN ('poll_votes', 'poll_vote_history')
--   AND grantee IN ('anon', 'authenticated');
--   -- expect: no rows
--
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'poll_votes';
