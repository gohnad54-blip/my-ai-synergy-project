-- AI Synergy Archive — admin can SELECT all comments (dashboard moderation)
-- Run in Supabase Dashboard → SQL Editor if /dashboard/comments shows partial/empty list.

BEGIN;

DROP POLICY IF EXISTS "comments_select_admin" ON public.comments;

CREATE POLICY "comments_select_admin"
  ON public.comments FOR SELECT
  TO anon, authenticated
  USING (public.is_app_admin());

COMMIT;
