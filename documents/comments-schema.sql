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

CREATE TABLE IF NOT EXISTS public.comment_reactions (
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji_key  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id, emoji_key),
  CHECK (char_length(emoji_key) BETWEEN 1 AND 64),
  CHECK (emoji_key ~ '^[A-Za-z0-9_+-]+$')
);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_emoji_created_at
  ON public.comment_reactions (comment_id, emoji_key, created_at);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_user_id_created_at
  ON public.comment_reactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.comment_notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type                TEXT NOT NULL,
  target_type         TEXT NOT NULL,
  target_id           TEXT NOT NULL,
  comment_id          UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  activity_comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  reaction_emoji_key  TEXT,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (type IN ('comment_reply', 'comment_reaction')),
  CHECK (target_type IN ('bandori_event')),
  CHECK (char_length(target_id) BETWEEN 1 AND 128),
  CHECK (
    reaction_emoji_key IS NULL OR (
      char_length(reaction_emoji_key) BETWEEN 1 AND 64
      AND reaction_emoji_key ~ '^[A-Za-z0-9_+-]+$'
    )
  ),
  CHECK (
    (type = 'comment_reply' AND activity_comment_id IS NOT NULL AND reaction_emoji_key IS NULL) OR
    (type = 'comment_reaction' AND activity_comment_id IS NULL AND reaction_emoji_key IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_comment_notifications_recipient_read_created
  ON public.comment_notifications (recipient_user_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comment_notifications_recipient_created
  ON public.comment_notifications (recipient_user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_comment_notifications_recipient_type_created
  ON public.comment_notifications (recipient_user_id, type, created_at DESC, id DESC);

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
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.increment_comment_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    UPDATE public.comments
      SET reply_count = reply_count + 1,
          updated_at = NOW()
      WHERE id = NEW.parent_id;

    IF NEW.root_id IS NOT NULL AND NEW.root_id <> NEW.parent_id THEN
      UPDATE public.comments
        SET reply_count = reply_count + 1,
            updated_at = NOW()
        WHERE id = NEW.root_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

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

REVOKE ALL ON FUNCTION public.prepare_comment_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_comment_reply_count() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.guestbook_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.guestbook_comments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.comments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.comment_reactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.comment_notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.comment_reports FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.guestbook_comments TO anon, authenticated;
GRANT ALL ON TABLE public.guestbook_comments TO service_role;

GRANT SELECT ON TABLE public.comments TO anon, authenticated;
GRANT ALL ON TABLE public.comments TO service_role;

GRANT ALL ON TABLE public.comment_reactions TO service_role;

GRANT ALL ON TABLE public.comment_notifications TO service_role;

GRANT ALL ON TABLE public.comment_reports TO service_role;

DROP POLICY IF EXISTS guestbook_comments_select_public ON public.guestbook_comments;
DROP POLICY IF EXISTS guestbook_comments_insert_own ON public.guestbook_comments;
DROP POLICY IF EXISTS guestbook_comments_delete_own ON public.guestbook_comments;
DROP POLICY IF EXISTS comments_select_public ON public.comments;
DROP POLICY IF EXISTS comments_insert_own ON public.comments;
DROP POLICY IF EXISTS comments_update_own ON public.comments;
DROP POLICY IF EXISTS comments_delete_own ON public.comments;
DROP POLICY IF EXISTS comment_reactions_select_own ON public.comment_reactions;
DROP POLICY IF EXISTS comment_reactions_insert_own ON public.comment_reactions;
DROP POLICY IF EXISTS comment_reactions_delete_own ON public.comment_reactions;
DROP POLICY IF EXISTS comment_notifications_select_own ON public.comment_notifications;
DROP POLICY IF EXISTS comment_notifications_update_own ON public.comment_notifications;
DROP POLICY IF EXISTS comment_reports_insert_own ON public.comment_reports;

CREATE POLICY guestbook_comments_select_public
  ON public.guestbook_comments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY comments_select_public
  ON public.comments FOR SELECT
  TO anon, authenticated
  USING (moderation_status = 'visible');
