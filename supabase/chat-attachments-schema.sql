-- AI Synergy Archive — chat attachments (Storage + message columns)
-- Run in Supabase Dashboard → SQL Editor AFTER chat-schema.sql
--
-- Adds:
--   • Storage bucket "chat-attachments" (50 MB per file, private)
--   • RLS on storage.objects (custom auth via x-app-session helpers)
--   • Attachment columns on private_messages + group_messages
--
-- Storage paths:
--   private/{thread_user_id}/{message_id}/{filename}
--   group/{message_id}/{filename}
--
-- attachment_type: image | video | file | video_link
--   video_link — external URL (YouTube/Vimeo/…), no Storage object
--
-- Does NOT alter users, materials, comments, or other existing tables.
--
-- Do NOT run until you confirm. Reply «виконано» after applying in Dashboard.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Message columns — allow text-only, attachment-only, or both
-- ---------------------------------------------------------------------------

ALTER TABLE public.private_messages
  ADD COLUMN IF NOT EXISTS attachment_url   TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type  TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name  TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size  BIGINT;

ALTER TABLE public.group_messages
  ADD COLUMN IF NOT EXISTS attachment_url   TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type  TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name  TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size  BIGINT;

ALTER TABLE public.private_messages
  DROP CONSTRAINT IF EXISTS private_messages_body_length;

ALTER TABLE public.group_messages
  DROP CONSTRAINT IF EXISTS group_messages_body_length;

ALTER TABLE public.private_messages
  DROP CONSTRAINT IF EXISTS private_messages_attachment_type_check;

ALTER TABLE public.private_messages
  ADD CONSTRAINT private_messages_attachment_type_check
  CHECK (
    attachment_type IS NULL
    OR attachment_type IN ('image', 'video', 'file', 'video_link')
  );

ALTER TABLE public.group_messages
  DROP CONSTRAINT IF EXISTS group_messages_attachment_type_check;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_attachment_type_check
  CHECK (
    attachment_type IS NULL
    OR attachment_type IN ('image', 'video', 'file', 'video_link')
  );

ALTER TABLE public.private_messages
  DROP CONSTRAINT IF EXISTS private_messages_content_check;

ALTER TABLE public.private_messages
  ADD CONSTRAINT private_messages_content_check
  CHECK (
    char_length(body) <= 2000
    AND (
      char_length(trim(body)) > 0
      OR attachment_type IS NOT NULL
    )
    AND (
      attachment_type IS NULL
      OR (
        attachment_type = 'video_link'
        AND attachment_url IS NOT NULL
        AND char_length(trim(attachment_url)) > 0
      )
      OR (
        attachment_type IN ('image', 'video', 'file')
        AND attachment_url IS NOT NULL
        AND char_length(trim(attachment_url)) > 0
        AND attachment_name IS NOT NULL
        AND attachment_size IS NOT NULL
        AND attachment_size > 0
        AND attachment_size <= 52428800
      )
    )
  );

ALTER TABLE public.group_messages
  DROP CONSTRAINT IF EXISTS group_messages_content_check;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_content_check
  CHECK (
    char_length(body) <= 2000
    AND (
      char_length(trim(body)) > 0
      OR attachment_type IS NOT NULL
    )
    AND (
      attachment_type IS NULL
      OR (
        attachment_type = 'video_link'
        AND attachment_url IS NOT NULL
        AND char_length(trim(attachment_url)) > 0
      )
      OR (
        attachment_type IN ('image', 'video', 'file')
        AND attachment_url IS NOT NULL
        AND char_length(trim(attachment_url)) > 0
        AND attachment_name IS NOT NULL
        AND attachment_size IS NOT NULL
        AND attachment_size > 0
        AND attachment_size <= 52428800
      )
    )
  );

COMMENT ON COLUMN public.private_messages.attachment_url IS
  'Storage path in chat-attachments bucket, or external URL when attachment_type = video_link';
COMMENT ON COLUMN public.private_messages.attachment_type IS
  'image | video | file | video_link';

-- ---------------------------------------------------------------------------
-- 2. Storage bucket (50 MB per object)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  52428800,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 3. Storage path helpers (SECURITY DEFINER — use app session, not Supabase Auth)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_storage_private_can_access(p_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_app_authenticated()
    AND public.is_active_app_user(public.app_session_user_id())
    AND coalesce(split_part(p_path, '/', 1), '') = 'private'
    AND (
      public.is_app_admin()
      OR split_part(p_path, '/', 2) = public.app_session_user_id()
    );
$$;

CREATE OR REPLACE FUNCTION public.chat_storage_private_can_write(p_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_app_authenticated()
    AND public.is_active_app_user(public.app_session_user_id())
    AND coalesce(split_part(p_path, '/', 1), '') = 'private'
    AND char_length(split_part(p_path, '/', 2)) > 0
    AND char_length(split_part(p_path, '/', 3)) > 0
    AND (
      (
        public.is_app_admin()
        AND public.private_message_target_ok(split_part(p_path, '/', 2))
      )
      OR (
        NOT public.is_app_admin()
        AND split_part(p_path, '/', 2) = public.app_session_user_id()
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.chat_storage_group_can_access(p_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_app_authenticated()
    AND public.is_active_app_user(public.app_session_user_id())
    AND coalesce(split_part(p_path, '/', 1), '') = 'group'
    AND char_length(split_part(p_path, '/', 2)) > 0;
$$;

CREATE OR REPLACE FUNCTION public.chat_storage_can_delete(p_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_app_authenticated()
    AND public.is_active_app_user(public.app_session_user_id())
    AND (
      public.is_app_admin()
      OR (
        coalesce(split_part(p_path, '/', 1), '') = 'private'
        AND EXISTS (
          SELECT 1
          FROM public.private_messages pm
          WHERE pm.id = split_part(p_path, '/', 3)
            AND pm.sender_id = public.app_session_user_id()
        )
      )
      OR (
        coalesce(split_part(p_path, '/', 1), '') = 'group'
        AND EXISTS (
          SELECT 1
          FROM public.group_messages gm
          WHERE gm.id = split_part(p_path, '/', 2)
            AND gm.sender_id = public.app_session_user_id()
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.chat_storage_private_can_access(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chat_storage_private_can_write(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chat_storage_group_can_access(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chat_storage_can_delete(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.chat_storage_private_can_access(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_storage_private_can_write(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_storage_group_can_access(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_storage_can_delete(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Storage RLS (storage.objects)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "chat_attachments_select" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_delete" ON storage.objects;

CREATE POLICY "chat_attachments_select"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (
      public.chat_storage_private_can_access(name)
      OR public.chat_storage_group_can_access(name)
    )
  );

CREATE POLICY "chat_attachments_insert"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (
      public.chat_storage_private_can_write(name)
      OR public.chat_storage_group_can_access(name)
    )
  );

CREATE POLICY "chat_attachments_delete"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND public.chat_storage_can_delete(name)
  );

-- ---------------------------------------------------------------------------
-- 5. Extend message INSERT policies — validate attachment fields
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "private_messages_insert" ON public.private_messages;

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
    AND (
      attachment_type IS NULL
      OR (
        attachment_type = 'video_link'
        AND attachment_url IS NOT NULL
      )
      OR (
        attachment_type IN ('image', 'video', 'file')
        AND attachment_url IS NOT NULL
        AND attachment_name IS NOT NULL
        AND attachment_size IS NOT NULL
        AND attachment_size > 0
        AND attachment_size <= 52428800
        AND coalesce(split_part(attachment_url, '/', 1), '') = 'private'
        AND split_part(attachment_url, '/', 2) = thread_user_id::text
        AND split_part(attachment_url, '/', 3) = id
      )
    )
  );

DROP POLICY IF EXISTS "group_messages_insert" ON public.group_messages;

CREATE POLICY "group_messages_insert"
  ON public.group_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    public.is_app_authenticated()
    AND public.is_active_app_user(public.app_session_user_id())
    AND sender_id = public.app_session_user_id()
    AND (
      attachment_type IS NULL
      OR (
        attachment_type = 'video_link'
        AND attachment_url IS NOT NULL
      )
      OR (
        attachment_type IN ('image', 'video', 'file')
        AND attachment_url IS NOT NULL
        AND attachment_name IS NOT NULL
        AND attachment_size IS NOT NULL
        AND attachment_size > 0
        AND attachment_size <= 52428800
        AND coalesce(split_part(attachment_url, '/', 1), '') = 'group'
        AND split_part(attachment_url, '/', 2) = id
      )
    )
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- Optional verification (run separately):
-- ---------------------------------------------------------------------------
-- SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'chat-attachments';
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'private_messages'
--   AND column_name LIKE 'attachment%';
--
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
--   AND policyname LIKE 'chat_attachments%';
