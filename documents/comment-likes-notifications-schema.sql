-- Incremental migration for event comment likes and account notifications.
-- Run after the baseline comments schema is already installed.

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.comment_likes (
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id_created_at
  ON public.comment_likes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.comment_notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type                TEXT NOT NULL,
  target_type         TEXT NOT NULL,
  target_id           TEXT NOT NULL,
  comment_id          UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  activity_comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (type IN ('comment_reply', 'comment_like')),
  CHECK (target_type IN ('bandori_event')),
  CHECK (char_length(target_id) BETWEEN 1 AND 128),
  CHECK (
    (type = 'comment_reply' AND activity_comment_id IS NOT NULL) OR
    (type = 'comment_like' AND activity_comment_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_comment_notifications_recipient_read_created
  ON public.comment_notifications (recipient_user_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comment_notifications_recipient_created
  ON public.comment_notifications (recipient_user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_comment_notifications_actor_user_id
  ON public.comment_notifications (actor_user_id)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comment_notifications_comment_id
  ON public.comment_notifications (comment_id);

CREATE INDEX IF NOT EXISTS idx_comment_notifications_activity_comment_id
  ON public.comment_notifications (activity_comment_id)
  WHERE activity_comment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_notifications_unique_reply
  ON public.comment_notifications (recipient_user_id, type, activity_comment_id)
  WHERE type = 'comment_reply' AND activity_comment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_notifications_unique_like
  ON public.comment_notifications (recipient_user_id, actor_user_id, type, comment_id)
  WHERE type = 'comment_like';

CREATE OR REPLACE FUNCTION public.update_comment_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.comments
      SET like_count = like_count + 1,
          updated_at = NOW()
      WHERE id = NEW.comment_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.comments
      SET like_count = GREATEST(like_count - 1, 0),
          updated_at = NOW()
      WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS update_comment_like_count ON public.comment_likes;

CREATE TRIGGER update_comment_like_count
  AFTER INSERT OR DELETE ON public.comment_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_comment_like_count();

UPDATE public.comments AS comment
SET like_count = COALESCE(counts.like_count, 0)
FROM (
  SELECT comment_id, COUNT(*)::integer AS like_count
  FROM public.comment_likes
  GROUP BY comment_id
) AS counts
WHERE counts.comment_id = comment.id;

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comment_likes_select_own ON public.comment_likes;
DROP POLICY IF EXISTS comment_likes_insert_own ON public.comment_likes;
DROP POLICY IF EXISTS comment_likes_delete_own ON public.comment_likes;
DROP POLICY IF EXISTS comment_notifications_select_own ON public.comment_notifications;
DROP POLICY IF EXISTS comment_notifications_update_own ON public.comment_notifications;

CREATE POLICY comment_likes_select_own
  ON public.comment_likes FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY comment_likes_insert_own
  ON public.comment_likes FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY comment_likes_delete_own
  ON public.comment_likes FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY comment_notifications_select_own
  ON public.comment_notifications FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = recipient_user_id);

CREATE POLICY comment_notifications_update_own
  ON public.comment_notifications FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = recipient_user_id)
  WITH CHECK ((select auth.uid()) = recipient_user_id);
