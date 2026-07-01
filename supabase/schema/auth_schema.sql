-- 账号与评论相关的基础结构。
-- 用于新库初始化或完整重建；若数据库已存在旧版 profiles 字段，
-- 请额外执行 auth_legacy_patch.sql 补齐历史字段。
-- account_status / account_email_verifications 是后续应用侧验证补丁，
-- 不在这个基础结构文件中合并。

CREATE TABLE IF NOT EXISTS profiles (
  id                     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username               TEXT NOT NULL UNIQUE,
  avatar_card_id         INTEGER NOT NULL DEFAULT 1,
  avatar_card_train_type TEXT NOT NULL DEFAULT 'normal',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(username) BETWEEN 2 AND 24),
  CHECK (avatar_card_id > 0),
  CHECK (avatar_card_train_type IN ('normal', 'after_training'))
);

CREATE TABLE IF NOT EXISTS guestbook_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(btrim(content)) > 0),
  CHECK (char_length(content) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_guestbook_comments_created_at_desc ON guestbook_comments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_comments_user_id ON guestbook_comments (user_id);

CREATE TABLE IF NOT EXISTS comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type       TEXT NOT NULL,
  target_id         TEXT NOT NULL,
  parent_id         UUID REFERENCES comments(id) ON DELETE RESTRICT,
  root_id           UUID REFERENCES comments(id) ON DELETE RESTRICT,
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content           TEXT,
  depth             INTEGER NOT NULL DEFAULT 0,
  reply_count       INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at         TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  moderation_status TEXT NOT NULL DEFAULT 'visible',
  moderated_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
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
  ON comments (target_type, target_id, created_at, id)
  WHERE parent_id IS NULL AND moderation_status = 'visible';

CREATE INDEX IF NOT EXISTS idx_comments_direct_replies
  ON comments (parent_id, created_at, id)
  WHERE moderation_status = 'visible';

CREATE INDEX IF NOT EXISTS idx_comments_target_root_id
  ON comments (target_type, target_id, root_id);

CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments (user_id);

CREATE TABLE IF NOT EXISTS comment_reactions (
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji_key  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id, emoji_key),
  CHECK (char_length(emoji_key) BETWEEN 1 AND 64),
  CHECK (emoji_key ~ '^[A-Za-z0-9_+-]+$')
);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_emoji_created_at
  ON comment_reactions (comment_id, emoji_key, created_at);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_user_id_created_at
  ON comment_reactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comment_notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_user_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type                TEXT NOT NULL,
  target_type         TEXT NOT NULL,
  target_id           TEXT NOT NULL,
  comment_id          UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  activity_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
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
  ON comment_notifications (recipient_user_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comment_notifications_recipient_created
  ON comment_notifications (recipient_user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_comment_notifications_recipient_type_created
  ON comment_notifications (recipient_user_id, type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_comment_notifications_actor_user_id
  ON comment_notifications (actor_user_id)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comment_notifications_comment_id
  ON comment_notifications (comment_id);

CREATE INDEX IF NOT EXISTS idx_comment_notifications_activity_comment_id
  ON comment_notifications (activity_comment_id)
  WHERE activity_comment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_notifications_unique_reply
  ON comment_notifications (recipient_user_id, type, activity_comment_id)
  WHERE type = 'comment_reply' AND activity_comment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS comment_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id       UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  UNIQUE (comment_id, reporter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_reports_status_created_at
  ON comment_reports (status, created_at);

-- 统一维护 profiles.updated_at。
CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

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

-- 用户注册后自动创建 profiles 记录，优先使用注册时提交的用户名。
-- TODO: 后续评估是否将 SECURITY DEFINER 函数迁到非暴露 schema；
-- 本次只整理文件归属，不改变函数位置或权限行为。
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_username TEXT;
BEGIN
  requested_username := NULLIF(trim(NEW.raw_user_meta_data ->> 'username'), '');

  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(requested_username, 'user_' || left(NEW.id::text, 8))
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 触发器与策略都按可重复执行方式重建，方便在 Supabase SQL 编辑器中反复应用。
DROP TRIGGER IF EXISTS set_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS prepare_comment_insert ON comments;
DROP TRIGGER IF EXISTS increment_comment_reply_count ON comments;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profiles_updated_at();

CREATE TRIGGER prepare_comment_insert
  BEFORE INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_comment_insert();

CREATE TRIGGER increment_comment_reply_count
  AFTER INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_comment_reply_count();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile();

REVOKE ALL ON FUNCTION public.update_profiles_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_comment_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_comment_reply_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_profile() FROM PUBLIC, anon, authenticated;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE guestbook_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;

-- Data API exposure is explicit: grants make tables reachable, RLS policies
-- below decide which rows each role can access.
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guestbook_comments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.comments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.comment_reactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.comment_notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.comment_reports FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.profiles TO anon, authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

GRANT SELECT ON TABLE public.guestbook_comments TO anon, authenticated;
GRANT ALL ON TABLE public.guestbook_comments TO service_role;

GRANT SELECT ON TABLE public.comments TO anon, authenticated;
GRANT ALL ON TABLE public.comments TO service_role;

GRANT ALL ON TABLE public.comment_reactions TO service_role;

GRANT ALL ON TABLE public.comment_notifications TO service_role;

GRANT ALL ON TABLE public.comment_reports TO service_role;

DROP POLICY IF EXISTS profiles_select_public ON profiles;
DROP POLICY IF EXISTS profiles_insert_own ON profiles;
DROP POLICY IF EXISTS profiles_update_own ON profiles;
DROP POLICY IF EXISTS guestbook_comments_select_public ON guestbook_comments;
DROP POLICY IF EXISTS guestbook_comments_insert_own ON guestbook_comments;
DROP POLICY IF EXISTS guestbook_comments_delete_own ON guestbook_comments;
DROP POLICY IF EXISTS comments_select_public ON comments;
DROP POLICY IF EXISTS comments_insert_own ON comments;
DROP POLICY IF EXISTS comments_delete_own ON comments;
DROP POLICY IF EXISTS comments_update_own ON comments;
DROP POLICY IF EXISTS comment_reactions_select_own ON comment_reactions;
DROP POLICY IF EXISTS comment_reactions_insert_own ON comment_reactions;
DROP POLICY IF EXISTS comment_reactions_delete_own ON comment_reactions;
DROP POLICY IF EXISTS comment_notifications_select_own ON comment_notifications;
DROP POLICY IF EXISTS comment_notifications_update_own ON comment_notifications;
DROP POLICY IF EXISTS comment_reports_insert_own ON comment_reports;

-- Public read policies for profile and comment display.
CREATE POLICY profiles_select_public
  ON profiles FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY guestbook_comments_select_public
  ON guestbook_comments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY comments_select_public
  ON comments FOR SELECT
  TO anon, authenticated
  USING (moderation_status = 'visible');
