-- Keep public read access for visible public content, but route user mutations
-- through the Next.js API so validation, verification, and side effects stay
-- centralized on the server.

REVOKE INSERT, UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE INSERT, DELETE ON TABLE public.guestbook_comments FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE ON TABLE public.comments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.comment_likes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.comment_notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.comment_reports FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS profiles_select_public ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS guestbook_comments_select_public ON public.guestbook_comments;
DROP POLICY IF EXISTS guestbook_comments_insert_own ON public.guestbook_comments;
DROP POLICY IF EXISTS guestbook_comments_delete_own ON public.guestbook_comments;
DROP POLICY IF EXISTS comments_select_public ON public.comments;
DROP POLICY IF EXISTS comments_insert_own ON public.comments;
DROP POLICY IF EXISTS comments_update_own ON public.comments;
DROP POLICY IF EXISTS comments_delete_own ON public.comments;
DROP POLICY IF EXISTS comment_likes_select_own ON public.comment_likes;
DROP POLICY IF EXISTS comment_likes_insert_own ON public.comment_likes;
DROP POLICY IF EXISTS comment_likes_delete_own ON public.comment_likes;
DROP POLICY IF EXISTS comment_notifications_select_own ON public.comment_notifications;
DROP POLICY IF EXISTS comment_notifications_update_own ON public.comment_notifications;
DROP POLICY IF EXISTS comment_reports_insert_own ON public.comment_reports;

CREATE POLICY profiles_select_public
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY guestbook_comments_select_public
  ON public.guestbook_comments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY comments_select_public
  ON public.comments FOR SELECT
  TO anon, authenticated
  USING (moderation_status = 'visible');

NOTIFY pgrst, 'reload schema';
