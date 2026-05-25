-- Migration sketch for the baseline comments system.
-- Run in Supabase SQL editor after reviewing existing data and backups.

ALTER TABLE IF EXISTS public.comments RENAME TO guestbook_comments;

ALTER INDEX IF EXISTS idx_comments_created_at_desc RENAME TO idx_guestbook_comments_created_at_desc;
ALTER INDEX IF EXISTS idx_comments_user_id RENAME TO idx_guestbook_comments_user_id;

CREATE TABLE IF NOT EXISTS public.comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type       TEXT NOT NULL,
  target_id         TEXT NOT NULL,
  parent_id         UUID REFERENCES public.comments(id) ON DELETE RESTRICT,
  root_id           UUID REFERENCES public.comments(id) ON DELETE RESTRICT,
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content           TEXT,
  depth             INTEGER NOT NULL DEFAULT 0,
  reply_count       INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at         TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  moderation_status TEXT NOT NULL DEFAULT 'visible',
  moderated_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  moderated_at      TIMESTAMPTZ,
  moderation_reason TEXT,
  CHECK (target_type IN ('bandori_event')),
  CHECK (char_length(target_id) BETWEEN 1 AND 128),
  CHECK (content IS NULL OR (char_length(btrim(content)) > 0 AND char_length(content) <= 500)),
  CHECK (depth >= 0),
  CHECK (reply_count >= 0),
  CHECK (moderation_status IN ('visible', 'removed_by_admin', 'hidden')),
  CHECK (
    (deleted_at IS NULL AND content IS NOT NULL) OR
    (deleted_at IS NOT NULL AND content IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_comments_target_roots
  ON public.comments (target_type, target_id, created_at, id)
  WHERE parent_id IS NULL AND moderation_status = 'visible';

CREATE INDEX IF NOT EXISTS idx_comments_direct_replies
  ON public.comments (parent_id, created_at, id)
  WHERE moderation_status = 'visible';

CREATE INDEX IF NOT EXISTS idx_comments_target_root_id
  ON public.comments (target_type, target_id, root_id);

CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments (user_id);

CREATE TABLE IF NOT EXISTS public.comment_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id       UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  UNIQUE (comment_id, reporter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_reports_status_created_at
  ON public.comment_reports (status, created_at);

CREATE OR REPLACE FUNCTION public.prepare_comment_insert()
RETURNS TRIGGER AS $$
DECLARE
  parent_comment public.comments%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.root_id := NEW.id;
    NEW.depth := 0;
    RETURN NEW;
  END IF;

  SELECT *
    INTO parent_comment
    FROM public.comments
    WHERE id = NEW.parent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'parent comment does not exist';
  END IF;

  IF parent_comment.target_type <> NEW.target_type OR parent_comment.target_id <> NEW.target_id THEN
    RAISE EXCEPTION 'parent comment target mismatch';
  END IF;

  NEW.root_id := parent_comment.root_id;
  NEW.depth := parent_comment.depth + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.increment_comment_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    UPDATE public.comments
      SET reply_count = reply_count + 1,
          updated_at = NOW()
      WHERE id = NEW.parent_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prepare_comment_insert ON public.comments;
DROP TRIGGER IF EXISTS increment_comment_reply_count ON public.comments;

CREATE TRIGGER prepare_comment_insert
  BEFORE INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_comment_insert();

CREATE TRIGGER increment_comment_reply_count
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_comment_reply_count();

ALTER TABLE public.guestbook_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guestbook_comments_select_public ON public.guestbook_comments;
DROP POLICY IF EXISTS guestbook_comments_insert_own ON public.guestbook_comments;
DROP POLICY IF EXISTS guestbook_comments_delete_own ON public.guestbook_comments;
DROP POLICY IF EXISTS comments_select_public ON public.comments;
DROP POLICY IF EXISTS comments_insert_own ON public.comments;
DROP POLICY IF EXISTS comments_update_own ON public.comments;
DROP POLICY IF EXISTS comments_delete_own ON public.comments;
DROP POLICY IF EXISTS comment_reports_insert_own ON public.comment_reports;

CREATE POLICY guestbook_comments_select_public
  ON public.guestbook_comments FOR SELECT
  USING (true);

CREATE POLICY guestbook_comments_insert_own
  ON public.guestbook_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY guestbook_comments_delete_own
  ON public.guestbook_comments FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY comments_select_public
  ON public.comments FOR SELECT
  USING (moderation_status = 'visible');

CREATE POLICY comments_insert_own
  ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = user_id AND moderation_status = 'visible');

CREATE POLICY comments_update_own
  ON public.comments FOR UPDATE
  USING (auth.uid() = user_id AND deleted_at IS NULL AND moderation_status = 'visible')
  WITH CHECK (auth.uid() = user_id AND moderation_status = 'visible');

CREATE POLICY comment_reports_insert_own
  ON public.comment_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_user_id);

