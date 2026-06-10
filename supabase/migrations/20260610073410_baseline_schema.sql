-- HHWX Supabase baseline schema.
--
-- Generated from the repository's existing schema SQL files when adopting the
-- Supabase CLI migration workflow. This migration is intended for new empty
-- HHWX Supabase projects. Do not apply it directly to an existing production
-- project that has already been initialized through the older manual SQL flow;
-- mark it as applied only after verifying that the target schema already matches.

-- -----------------------------------------------------------------------------
-- Source: supabase\schema\auth_schema.sql
-- Core auth, profiles, and comments schema
-- -----------------------------------------------------------------------------

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
  like_count        INTEGER NOT NULL DEFAULT 0,
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
  CHECK (like_count >= 0),
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

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id_created_at
  ON comment_likes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comment_notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_user_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type                TEXT NOT NULL,
  target_type         TEXT NOT NULL,
  target_id           TEXT NOT NULL,
  comment_id          UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  activity_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
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
  ON comment_notifications (recipient_user_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comment_notifications_recipient_created
  ON comment_notifications (recipient_user_id, created_at DESC, id DESC);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_notifications_unique_like
  ON comment_notifications (recipient_user_id, actor_user_id, type, comment_id)
  WHERE type = 'comment_like';

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
DROP TRIGGER IF EXISTS update_comment_like_count ON comment_likes;
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

CREATE TRIGGER update_comment_like_count
  AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_comment_like_count();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile();

REVOKE ALL ON FUNCTION public.update_profiles_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_comment_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_comment_reply_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_comment_like_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_profile() FROM PUBLIC, anon, authenticated;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE guestbook_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;

-- Data API exposure is explicit: grants make tables reachable, RLS policies
-- below decide which rows each role can access.
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guestbook_comments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.comments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.comment_likes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.comment_notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.comment_reports FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

GRANT SELECT ON TABLE public.guestbook_comments TO anon, authenticated;
GRANT INSERT, DELETE ON TABLE public.guestbook_comments TO authenticated;
GRANT ALL ON TABLE public.guestbook_comments TO service_role;

GRANT SELECT ON TABLE public.comments TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.comments TO authenticated;
GRANT ALL ON TABLE public.comments TO service_role;

GRANT SELECT, INSERT, DELETE ON TABLE public.comment_likes TO authenticated;
GRANT ALL ON TABLE public.comment_likes TO service_role;

GRANT SELECT, UPDATE ON TABLE public.comment_notifications TO authenticated;
GRANT ALL ON TABLE public.comment_notifications TO service_role;

GRANT INSERT ON TABLE public.comment_reports TO authenticated;
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
DROP POLICY IF EXISTS comment_likes_select_own ON comment_likes;
DROP POLICY IF EXISTS comment_likes_insert_own ON comment_likes;
DROP POLICY IF EXISTS comment_likes_delete_own ON comment_likes;
DROP POLICY IF EXISTS comment_notifications_select_own ON comment_notifications;
DROP POLICY IF EXISTS comment_notifications_update_own ON comment_notifications;
DROP POLICY IF EXISTS comment_reports_insert_own ON comment_reports;

-- profiles 允许公开读取，仅允许本人创建和更新自己的资料。
CREATE POLICY profiles_select_public
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY profiles_insert_own
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY profiles_update_own
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY guestbook_comments_select_public
  ON guestbook_comments FOR SELECT
  USING (true);

CREATE POLICY guestbook_comments_insert_own
  ON guestbook_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY guestbook_comments_delete_own
  ON guestbook_comments FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY comments_select_public
  ON comments FOR SELECT
  USING (moderation_status = 'visible');

-- comments 允许公开读取，仅允许本人写入和删除自己的评论。
CREATE POLICY comments_insert_own
  ON comments FOR INSERT
  WITH CHECK (auth.uid() = user_id AND moderation_status = 'visible');

CREATE POLICY comments_update_own
  ON comments FOR UPDATE
  USING (auth.uid() = user_id AND deleted_at IS NULL AND moderation_status = 'visible')
  WITH CHECK (auth.uid() = user_id AND moderation_status = 'visible');

CREATE POLICY comment_likes_select_own
  ON comment_likes FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY comment_likes_insert_own
  ON comment_likes FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY comment_likes_delete_own
  ON comment_likes FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY comment_notifications_select_own
  ON comment_notifications FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = recipient_user_id);

CREATE POLICY comment_notifications_update_own
  ON comment_notifications FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = recipient_user_id)
  WITH CHECK ((select auth.uid()) = recipient_user_id);

CREATE POLICY comment_reports_insert_own
  ON comment_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_user_id);

-- -----------------------------------------------------------------------------
-- Source: supabase\schema\bandori_calendar_schema.sql
-- Bandori calendar schema
-- -----------------------------------------------------------------------------

-- Bandori 活动目录、国服日历预测和活动加成基础结构。
-- 这是 hhwx 产品侧的 canonical schema，tracker 只负责写入和同步数据。

CREATE TABLE IF NOT EXISTS bandori_characters (
  character_id        INT PRIMARY KEY,
  character_type      TEXT NOT NULL DEFAULT 'unique',
  band_id             INT NOT NULL,
  color_code          TEXT,
  character_name_jp   TEXT NOT NULL DEFAULT '',
  character_name_en   TEXT NOT NULL DEFAULT '',
  character_name_tw   TEXT,
  character_name_cn   TEXT,
  first_name_jp       TEXT NOT NULL DEFAULT '',
  first_name_en       TEXT NOT NULL DEFAULT '',
  first_name_tw       TEXT,
  first_name_cn       TEXT,
  last_name_jp        TEXT NOT NULL DEFAULT '',
  last_name_en        TEXT NOT NULL DEFAULT '',
  last_name_tw        TEXT,
  last_name_cn        TEXT,
  nickname_jp         TEXT,
  nickname_en         TEXT,
  nickname_tw         TEXT,
  nickname_cn         TEXT
);

CREATE INDEX IF NOT EXISTS idx_bandori_characters_band_id ON bandori_characters (band_id);

CREATE TABLE IF NOT EXISTS bandori_events (
  event_id                  INT PRIMARY KEY,
  event_type                TEXT NOT NULL DEFAULT '',
  event_name_jp             TEXT NOT NULL DEFAULT '',
  event_name_cn             TEXT,
  asset_bundle_name         TEXT NOT NULL DEFAULT '',
  banner_asset_bundle_name  TEXT,
  jp_start_at               BIGINT NOT NULL DEFAULT 0,
  jp_end_at                 BIGINT NOT NULL DEFAULT 0,
  cn_start_at               BIGINT,
  cn_end_at                 BIGINT,
  music_ids_jp              INT[] NOT NULL DEFAULT '{}'::INT[],
  music_ids_cn              INT[] NOT NULL DEFAULT '{}'::INT[],
  band                      TEXT NOT NULL DEFAULT 'mix',
  stamp_character_id        INT
);

CREATE INDEX IF NOT EXISTS idx_bandori_events_jp_start_at ON bandori_events (jp_start_at);
CREATE INDEX IF NOT EXISTS idx_bandori_events_cn_start_at ON bandori_events (cn_start_at);

CREATE TABLE IF NOT EXISTS bandori_event_schedules_cn (
  event_id         INT PRIMARY KEY REFERENCES bandori_events(event_id) ON DELETE CASCADE,
  predicted_start  DATE,
  predicted_end    DATE,
  duration_days    INT NOT NULL DEFAULT 7,
  has_rest_day     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order       INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_bandori_event_schedules_cn_sort_order ON bandori_event_schedules_cn (sort_order);

CREATE TABLE IF NOT EXISTS bandori_event_bonuses (
  event_id             INT PRIMARY KEY REFERENCES bandori_events(event_id) ON DELETE CASCADE,
  attributes_jsonb     JSONB NOT NULL DEFAULT '[]'::JSONB,
  characters_jsonb     JSONB NOT NULL DEFAULT '[]'::JSONB,
  point_percent        INT,
  parameter_percent    INT,
  performance_percent  INT,
  technique_percent    INT,
  visual_percent       INT,
  members_jsonb        JSONB NOT NULL DEFAULT '[]'::JSONB,
  limit_breaks_jsonb   JSONB NOT NULL DEFAULT '[]'::JSONB
);

CREATE TABLE IF NOT EXISTS user_roles (
  -- TODO: user_roles 同时服务账号资料与日历编辑权限，
  -- 后续应迁到独立 access-control schema。
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles (user_id);

ALTER TABLE bandori_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bandori_event_schedules_cn ENABLE ROW LEVEL SECURITY;
ALTER TABLE bandori_event_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bandori_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Explicit Data API grants for projects where public tables are not exposed by default.
REVOKE ALL ON TABLE public.bandori_characters FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bandori_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bandori_event_schedules_cn FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bandori_event_bonuses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_roles FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.bandori_characters TO anon, authenticated;
GRANT SELECT ON TABLE public.bandori_events TO anon, authenticated;
GRANT SELECT ON TABLE public.bandori_event_schedules_cn TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.bandori_event_schedules_cn TO authenticated;
GRANT SELECT ON TABLE public.bandori_event_bonuses TO anon, authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;

GRANT ALL ON TABLE public.bandori_characters TO service_role;
GRANT ALL ON TABLE public.bandori_events TO service_role;
GRANT ALL ON TABLE public.bandori_event_schedules_cn TO service_role;
GRANT ALL ON TABLE public.bandori_event_bonuses TO service_role;
GRANT ALL ON TABLE public.user_roles TO service_role;

DROP POLICY IF EXISTS bandori_characters_select_all ON bandori_characters;
DROP POLICY IF EXISTS bandori_events_select_all ON bandori_events;
DROP POLICY IF EXISTS bandori_event_schedules_cn_select_all ON bandori_event_schedules_cn;
DROP POLICY IF EXISTS bandori_event_bonuses_select_all ON bandori_event_bonuses;
DROP POLICY IF EXISTS bandori_event_schedules_cn_insert_editor ON bandori_event_schedules_cn;
DROP POLICY IF EXISTS bandori_event_schedules_cn_update_editor ON bandori_event_schedules_cn;
DROP POLICY IF EXISTS user_roles_select_own ON user_roles;

CREATE POLICY bandori_characters_select_all
  ON bandori_characters FOR SELECT
  USING (true);

CREATE POLICY bandori_events_select_all
  ON bandori_events FOR SELECT
  USING (true);

CREATE POLICY bandori_event_schedules_cn_select_all
  ON bandori_event_schedules_cn FOR SELECT
  USING (true);

CREATE POLICY bandori_event_bonuses_select_all
  ON bandori_event_bonuses FOR SELECT
  USING (true);

CREATE POLICY bandori_event_schedules_cn_insert_editor
  ON bandori_event_schedules_cn FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'calendar_editor'
    )
  );

CREATE POLICY bandori_event_schedules_cn_update_editor
  ON bandori_event_schedules_cn FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'calendar_editor'
    )
  );

CREATE POLICY user_roles_select_own
  ON user_roles FOR SELECT
  USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Source: supabase\schema\bandori_tracker_data_schema.sql
-- Bandori tracker data schema
-- -----------------------------------------------------------------------------

-- Canonical schema source for tracker_ranking_type and public.bandori_tracker_data.
-- hhwx-tracker writes this data, but hhwx owns the database structure.
-- Do not duplicate this DDL in other SQL files.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typnamespace = 'public'::regnamespace
          AND typname = 'tracker_ranking_type'
    ) THEN
        CREATE TYPE public.tracker_ranking_type AS ENUM ('event', 'song', 'monthly');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.bandori_tracker_data (
    row_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    event_id integer NOT NULL,
    type public.tracker_ranking_type NOT NULL,
    song_id integer NOT NULL DEFAULT 0,
    is_final boolean NOT NULL DEFAULT false,
    tier integer NOT NULL,
    time bigint NOT NULL,
    ep integer NOT NULL,
    CONSTRAINT chk_tracker_non_song_song_id CHECK (
        (type = 'song' AND song_id >= 0)
        OR (type IN ('event', 'monthly') AND song_id = 0)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracker_event_unique
ON public.bandori_tracker_data (event_id, tier, time)
WHERE type = 'event' AND song_id = 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracker_song_unique
ON public.bandori_tracker_data (event_id, tier, song_id, time)
WHERE type = 'song';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracker_monthly_unique
ON public.bandori_tracker_data (event_id, tier, time)
WHERE type = 'monthly' AND song_id = 0;

ALTER TABLE public.bandori_tracker_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bandori_tracker_data_select_all ON public.bandori_tracker_data;

CREATE POLICY bandori_tracker_data_select_all
ON public.bandori_tracker_data
FOR SELECT
USING (true);

-- Tracker rows are public read data, but writes are reserved for server-side
-- ingestion/sync code using the service role.
REVOKE ALL ON TABLE public.bandori_tracker_data FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.bandori_tracker_data TO anon, authenticated;
GRANT ALL ON TABLE public.bandori_tracker_data TO service_role;

DO $$
DECLARE
    tracker_row_id_sequence regclass;
BEGIN
    tracker_row_id_sequence := pg_get_serial_sequence('public.bandori_tracker_data', 'row_id')::regclass;

    IF tracker_row_id_sequence IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', tracker_row_id_sequence);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', tracker_row_id_sequence);
    END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- Source: documents\account-status-schema.sql
-- Application-side account status schema
-- -----------------------------------------------------------------------------

-- Private account authorization state.
-- Apply this after the existing auth/profile schema and before enabling
-- application-side email verification in production.

create table if not exists public.account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_account_status_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_account_status_updated_at on public.account_status;
create trigger set_account_status_updated_at
  before update on public.account_status
  for each row
  execute function public.set_account_status_updated_at();

revoke all on function public.set_account_status_updated_at() from public, anon, authenticated;

alter table public.account_status enable row level security;

drop policy if exists "Users can read own account status" on public.account_status;
create policy "Users can read own account status"
  on public.account_status
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.account_status from public, anon, authenticated;
grant select on public.account_status to authenticated;
grant all on public.account_status to service_role;

create table if not exists public.account_email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists account_email_verifications_user_id_idx
  on public.account_email_verifications(user_id, created_at desc);

alter table public.account_email_verifications enable row level security;

drop policy if exists account_email_verifications_service_only on public.account_email_verifications;
create policy account_email_verifications_service_only
  on public.account_email_verifications
  for all
  using (false)
  with check (false);

revoke all on public.account_email_verifications from public, anon, authenticated;
grant all on public.account_email_verifications to service_role;

-- -----------------------------------------------------------------------------
-- Source: documents\profile-public-uid-schema.sql
-- Public profile UID schema
-- -----------------------------------------------------------------------------

-- Public numeric profile UID for personal homepage links.
-- Keep auth.users.id as the private authorization identifier; public_uid is
-- only for public profile routing such as /u/10001.

create sequence if not exists public.profile_public_uid_seq
  start with 10001
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

revoke all on sequence public.profile_public_uid_seq from public, anon, authenticated;
grant usage, select on sequence public.profile_public_uid_seq to authenticated, service_role;

alter table public.profiles
  add column if not exists public_uid bigint;

-- Backfill profile rows for historical auth users that do not yet have one.
-- The username follows the application fallback rule used by the profile API.
insert into public.profiles (id, username, created_at)
select
  users.id,
  'user_' || left(users.id::text, 8),
  users.created_at
from auth.users as users
where not exists (
  select 1
  from public.profiles as profiles
  where profiles.id = users.id
);

with ordered_profiles as (
  select
    profiles.id,
    10000 + row_number() over (
      order by users.created_at asc, users.id asc
    ) as assigned_public_uid
  from public.profiles as profiles
  join auth.users as users on users.id = profiles.id
  where profiles.public_uid is null
)
update public.profiles as profiles
set public_uid = ordered_profiles.assigned_public_uid
from ordered_profiles
where profiles.id = ordered_profiles.id;

select setval(
  'public.profile_public_uid_seq',
  greatest(
    10000,
    coalesce((select max(public_uid) from public.profiles), 10000)
  ),
  true
);

alter table public.profiles
  alter column public_uid set default nextval('public.profile_public_uid_seq');

alter table public.profiles
  alter column public_uid set not null;

create unique index if not exists profiles_public_uid_key
  on public.profiles(public_uid);

-- -----------------------------------------------------------------------------
-- Source: documents\game-account-binding-schema.sql
-- Game account binding schema
-- -----------------------------------------------------------------------------

-- Game account binding schema for hhwx.
-- Run this in Supabase SQL editor with service-role/admin privileges.

create extension if not exists pgcrypto;

create table if not exists public.user_game_bind_challenges (
  id uuid primary key default gen_random_uuid(),
  web_user_id uuid not null references auth.users(id) on delete cascade,
  game_uid text not null,
  challenge text not null,
  expires_at timestamptz not null,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.user_game_bindings (
  game_uid text primary key,
  web_user_id uuid not null references auth.users(id) on delete cascade,
  bound_at timestamptz not null default now()
);

-- Existing installations may have functions depending on the old table row type.
drop function if exists public.cleanup_old_game_bind_challenges(timestamptz);
drop function if exists public.create_game_uid_bind_challenge(uuid, text, text, timestamptz);
drop function if exists public.complete_game_uid_binding(uuid, text, uuid);
drop function if exists public.increment_game_bind_challenge_attempt(uuid, uuid);
drop function if exists public.unbind_game_uid(text, uuid);

-- Bring older installations to the lean schema.
alter table public.user_game_bind_challenges
  add column if not exists attempt_count integer not null default 0;

alter table public.user_game_bind_challenges
  add column if not exists created_at timestamptz not null default now();

alter table public.user_game_bind_challenges
  drop constraint if exists user_game_bind_challenges_status_check;

alter table public.user_game_bind_challenges
  drop constraint if exists user_game_bind_challenges_attempt_count_check;

alter table public.user_game_bind_challenges
  drop column if exists status;

alter table public.user_game_bind_challenges
  drop column if exists verified_at;

alter table public.user_game_bindings
  add column if not exists bound_at timestamptz not null default now();

alter table public.user_game_bindings
  drop column if exists challenge_id;

alter table public.user_game_bindings
  drop column if exists updated_at;

-- Normalize existing challenge data before tightening generated-code constraints.
delete from public.user_game_bind_challenges
where challenge !~ '^hhwx[0-9]{6}$';

update public.user_game_bind_challenges
set attempt_count = 0
where attempt_count is null or attempt_count < 0;

alter table public.user_game_bind_challenges
  drop constraint if exists user_game_bind_challenges_challenge_check;

alter table public.user_game_bind_challenges
  add constraint user_game_bind_challenges_challenge_check
  check (challenge ~ '^hhwx[0-9]{6}$');

alter table public.user_game_bind_challenges
  add constraint user_game_bind_challenges_attempt_count_check
  check (attempt_count >= 0);

create index if not exists user_game_bind_challenges_user_created_idx
  on public.user_game_bind_challenges(web_user_id, created_at desc);

create index if not exists user_game_bind_challenges_game_uid_idx
  on public.user_game_bind_challenges(game_uid);

create index if not exists user_game_bind_challenges_expires_idx
  on public.user_game_bind_challenges(expires_at);

create index if not exists user_game_bindings_user_idx
  on public.user_game_bindings(web_user_id, bound_at desc);

drop index if exists public.user_game_bind_challenges_status_idx;

alter table public.user_game_bind_challenges enable row level security;
alter table public.user_game_bindings enable row level security;

revoke all on table public.user_game_bind_challenges from public, anon, authenticated;
revoke all on table public.user_game_bindings from public, anon, authenticated;

grant all on table public.user_game_bind_challenges to service_role;
grant all on table public.user_game_bindings to service_role;

drop policy if exists "Users can read own game bind challenges" on public.user_game_bind_challenges;
drop policy if exists "Users can insert own game bind challenges" on public.user_game_bind_challenges;
drop policy if exists "Users can update own game bind challenges" on public.user_game_bind_challenges;
drop policy if exists "Users can delete own game bind challenges" on public.user_game_bind_challenges;

drop policy if exists "Users can read own game uid bindings" on public.user_game_bindings;
drop policy if exists "Users can delete own game uid bindings" on public.user_game_bindings;

create policy "Users can read own game bind challenges"
  on public.user_game_bind_challenges
  for select
  to authenticated
  using (auth.uid() = web_user_id);

create policy "Users can insert own game bind challenges"
  on public.user_game_bind_challenges
  for insert
  to authenticated
  with check (auth.uid() = web_user_id);

create policy "Users can update own game bind challenges"
  on public.user_game_bind_challenges
  for update
  to authenticated
  using (auth.uid() = web_user_id)
  with check (auth.uid() = web_user_id);

create policy "Users can delete own game bind challenges"
  on public.user_game_bind_challenges
  for delete
  to authenticated
  using (auth.uid() = web_user_id);

create policy "Users can read own game uid bindings"
  on public.user_game_bindings
  for select
  to authenticated
  using (auth.uid() = web_user_id);

create policy "Users can delete own game uid bindings"
  on public.user_game_bindings
  for delete
  to authenticated
  using (auth.uid() = web_user_id);

create or replace function public.cleanup_old_game_bind_challenges(
  p_before timestamptz default now() - interval '7 days'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.user_game_bind_challenges
  where created_at < p_before;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.create_game_uid_bind_challenge(
  p_web_user_id uuid,
  p_game_uid text,
  p_challenge text,
  p_expires_at timestamptz
)
returns public.user_game_bind_challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.user_game_bind_challenges;
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;

  if p_game_uid is null or btrim(p_game_uid) = '' then
    raise exception 'game_uid is required';
  end if;

  if p_challenge !~ '^hhwx[0-9]{6}$' then
    raise exception 'challenge format is invalid';
  end if;

  if p_expires_at <= now() then
    raise exception 'expires_at must be in the future';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_web_user_id::text || ':' || p_game_uid)::bigint);

  if not exists (
    select 1
    from public.user_game_bindings
    where web_user_id = p_web_user_id
      and game_uid = p_game_uid
  ) and (
    select count(*)
    from public.user_game_bindings
    where web_user_id = p_web_user_id
  ) >= 5 then
    raise exception 'game uid binding limit reached';
  end if;

  delete from public.user_game_bind_challenges
  where web_user_id = p_web_user_id
    and game_uid = p_game_uid;

  insert into public.user_game_bind_challenges (
    web_user_id,
    game_uid,
    challenge,
    expires_at
  )
  values (
    p_web_user_id,
    p_game_uid,
    p_challenge,
    p_expires_at
  )
  returning * into result;

  return result;
end;
$$;

create or replace function public.complete_game_uid_binding(
  p_challenge_id uuid,
  p_game_uid text,
  p_web_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.user_game_bindings;
  consumed_challenge public.user_game_bind_challenges;
  previous_web_user_id uuid;
  transferred boolean;
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;

  if p_game_uid is null or btrim(p_game_uid) = '' then
    raise exception 'game_uid is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_game_uid)::bigint);

  delete from public.user_game_bind_challenges
  where id = p_challenge_id
    and web_user_id = p_web_user_id
    and game_uid = p_game_uid
    and expires_at > now()
  returning * into consumed_challenge;

  if not found then
    raise exception 'challenge is invalid or expired';
  end if;

  select web_user_id into previous_web_user_id
  from public.user_game_bindings
  where game_uid = p_game_uid;

  transferred := previous_web_user_id is not null and previous_web_user_id <> p_web_user_id;

  if previous_web_user_id is null and (
    select count(*)
    from public.user_game_bindings
    where web_user_id = p_web_user_id
  ) >= 5 then
    raise exception 'game uid binding limit reached';
  end if;

  if transferred and to_regclass('public.user_game_profiles') is not null then
    execute
      'delete from public.user_game_profiles where web_user_id = $1 and source_game_uid = $2'
      using previous_web_user_id, p_game_uid;
  end if;

  insert into public.user_game_bindings as bindings (
    game_uid,
    web_user_id,
    bound_at
  )
  values (
    p_game_uid,
    p_web_user_id,
    now()
  )
  on conflict (game_uid) do update
  set web_user_id = excluded.web_user_id,
      bound_at = now()
  returning * into result;

  return jsonb_build_object(
    'gameUid', result.game_uid,
    'webUserId', result.web_user_id,
    'boundAt', result.bound_at,
    'transferred', transferred
  );
end;
$$;

create or replace function public.increment_game_bind_challenge_attempt(
  p_challenge_id uuid,
  p_web_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_attempt_count integer;
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;

  update public.user_game_bind_challenges
  set attempt_count = attempt_count + 1
  where id = p_challenge_id
    and web_user_id = p_web_user_id
  returning attempt_count into next_attempt_count;

  if not found then
    raise exception 'challenge is invalid';
  end if;

  return next_attempt_count;
end;
$$;

create or replace function public.unbind_game_uid(
  p_game_uid text,
  p_web_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;

  delete from public.user_game_bindings
  where game_uid = p_game_uid
    and web_user_id = p_web_user_id;

  if to_regclass('public.user_game_profiles') is not null then
    execute
      'delete from public.user_game_profiles where web_user_id = $1 and source_game_uid = $2'
      using p_web_user_id, p_game_uid;
  end if;

  delete from public.user_game_bind_challenges
  where game_uid = p_game_uid
    and web_user_id = p_web_user_id;
end;
$$;

revoke all on function public.cleanup_old_game_bind_challenges(timestamptz) from public, anon, authenticated;
revoke all on function public.create_game_uid_bind_challenge(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_game_uid_binding(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.increment_game_bind_challenge_attempt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.unbind_game_uid(text, uuid) from public, anon, authenticated;

grant execute on function public.cleanup_old_game_bind_challenges(timestamptz) to service_role;
grant execute on function public.create_game_uid_bind_challenge(uuid, text, text, timestamptz) to service_role;
grant execute on function public.complete_game_uid_binding(uuid, text, uuid) to service_role;
grant execute on function public.increment_game_bind_challenge_attempt(uuid, uuid) to service_role;
grant execute on function public.unbind_game_uid(text, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Source: documents\game-profile-schema.sql
-- Compressed game profile schema
-- -----------------------------------------------------------------------------

-- Game profile schema for compressed synced and manually uploaded profile data.
-- Run after documents/game-account-binding-schema.sql.
-- This migration intentionally drops the early row-level detail tables; the
-- compressed payload in user_game_profiles is the source of truth.

create extension if not exists pgcrypto;

drop function if exists public.touch_user_game_profile_counts(uuid);
drop function if exists public.create_manual_game_profile(uuid, text, jsonb);
drop function if exists public.upsert_auto_game_profile(uuid, text, text, jsonb, jsonb);
drop function if exists public.create_manual_game_profile(uuid, text, text, text, integer, integer, jsonb);
drop function if exists public.upsert_auto_game_profile(uuid, text, text, text, text, integer, integer, jsonb);

drop table if exists public.user_game_profile_character_mission_bonuses;
drop table if exists public.user_game_profile_character_potentials;
drop table if exists public.user_game_profile_area_items;
drop table if exists public.user_game_profile_cards;

create table if not exists public.user_game_profiles (
  id uuid primary key default gen_random_uuid(),
  web_user_id uuid not null references auth.users(id) on delete cascade,
  profile_kind text not null check (profile_kind in ('auto', 'manual')),
  profile_name text not null check (char_length(profile_name) between 1 and 40),
  server integer not null default 3,
  source_game_uid text null,
  storage_codec text not null default 'hhwx-profile+gzip+base64-v1',
  payload_compressed text not null,
  payload_sha256 text not null,
  payload_size integer not null check (payload_size > 0),
  card_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  synced_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint user_game_profiles_kind_source_check
    check ((profile_kind = 'auto' and source_game_uid is not null)
      or (profile_kind = 'manual' and source_game_uid is null))
);

alter table public.user_game_profiles
  add column if not exists storage_codec text not null default 'hhwx-profile+gzip+base64-v1';
alter table public.user_game_profiles
  add column if not exists payload_compressed text;
alter table public.user_game_profiles
  add column if not exists payload_sha256 text;
alter table public.user_game_profiles
  add column if not exists payload_size integer;

alter table public.user_game_profiles
  drop column if exists is_editable,
  drop column if exists is_active,
  drop column if exists bestdori_profile,
  drop column if exists area_item_count,
  drop column if exists potential_count,
  drop column if exists mission_bonus_count,
  drop column if exists created_at;

delete from public.user_game_profiles
where payload_compressed is null
   or payload_sha256 is null
   or payload_size is null;

alter table public.user_game_profiles
  drop constraint if exists user_game_profiles_auto_source_check,
  drop constraint if exists user_game_profiles_kind_source_check,
  drop constraint if exists user_game_profiles_payload_size_check;

alter table public.user_game_profiles
  alter column storage_codec set not null,
  alter column payload_compressed set not null,
  alter column payload_sha256 set not null,
  alter column payload_size set not null;

alter table public.user_game_profiles
  add constraint user_game_profiles_kind_source_check
    check ((profile_kind = 'auto' and source_game_uid is not null)
      or (profile_kind = 'manual' and source_game_uid is null)),
  add constraint user_game_profiles_payload_size_check
    check (payload_size > 0);

drop index if exists user_game_profiles_auto_uid_idx;
create unique index user_game_profiles_auto_uid_idx
  on public.user_game_profiles(web_user_id, source_game_uid)
  where profile_kind = 'auto';

drop index if exists user_game_profiles_user_kind_idx;
create index user_game_profiles_user_kind_idx
  on public.user_game_profiles(web_user_id, profile_kind, updated_at desc);

alter table public.user_game_profiles enable row level security;

revoke all on table public.user_game_profiles from public, anon, authenticated;
grant all on table public.user_game_profiles to service_role;

drop policy if exists "Users can read own game profiles" on public.user_game_profiles;
drop policy if exists "Users can delete own game profiles" on public.user_game_profiles;

create policy "Users can read own game profiles"
  on public.user_game_profiles
  for select
  to authenticated
  using (auth.uid() = web_user_id);

create policy "Users can delete own game profiles"
  on public.user_game_profiles
  for delete
  to authenticated
  using (auth.uid() = web_user_id);

create or replace function public.create_manual_game_profile(
  p_web_user_id uuid,
  p_profile_name text,
  p_payload_compressed text,
  p_payload_sha256 text,
  p_payload_size integer,
  p_card_count integer,
  p_summary jsonb default '{}'::jsonb
)
returns public.user_game_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.user_game_profiles;
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_web_user_id::text || ':manual-game-profiles')::bigint);

  if (
    select count(*)
    from public.user_game_profiles
    where web_user_id = p_web_user_id
      and profile_kind = 'manual'
  ) >= 10 then
    raise exception 'manual game profile limit reached';
  end if;

  insert into public.user_game_profiles (
    web_user_id,
    profile_kind,
    profile_name,
    server,
    source_game_uid,
    payload_compressed,
    payload_sha256,
    payload_size,
    card_count,
    summary,
    updated_at
  )
  values (
    p_web_user_id,
    'manual',
    p_profile_name,
    3,
    null,
    p_payload_compressed,
    p_payload_sha256,
    p_payload_size,
    greatest(0, p_card_count),
    coalesce(p_summary, '{}'::jsonb),
    now()
  )
  returning * into result;

  return result;
end;
$$;

create or replace function public.upsert_auto_game_profile(
  p_web_user_id uuid,
  p_game_uid text,
  p_profile_name text,
  p_payload_compressed text,
  p_payload_sha256 text,
  p_payload_size integer,
  p_card_count integer,
  p_summary jsonb
)
returns public.user_game_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.user_game_profiles;
begin
  if p_web_user_id is null then
    raise exception 'web_user_id is required';
  end if;

  if not exists (
    select 1
    from public.user_game_bindings
    where web_user_id = p_web_user_id
      and game_uid = p_game_uid
  ) then
    raise exception 'game uid is not bound to user';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_web_user_id::text || ':auto-game-profiles')::bigint);
  perform pg_advisory_xact_lock(hashtext(p_game_uid)::bigint);

  if not exists (
    select 1
    from public.user_game_profiles
    where web_user_id = p_web_user_id
      and profile_kind = 'auto'
      and source_game_uid = p_game_uid
  ) and (
    select count(*)
    from public.user_game_profiles
    where web_user_id = p_web_user_id
      and profile_kind = 'auto'
  ) >= 5 then
    raise exception 'auto game profile limit reached';
  end if;

  insert into public.user_game_profiles as profiles (
    web_user_id,
    profile_kind,
    profile_name,
    server,
    source_game_uid,
    payload_compressed,
    payload_sha256,
    payload_size,
    card_count,
    summary,
    synced_at,
    updated_at
  )
  values (
    p_web_user_id,
    'auto',
    p_profile_name,
    3,
    p_game_uid,
    p_payload_compressed,
    p_payload_sha256,
    p_payload_size,
    greatest(0, p_card_count),
    coalesce(p_summary, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (web_user_id, source_game_uid)
  where profile_kind = 'auto'
  do update
  set profile_name = excluded.profile_name,
      payload_compressed = excluded.payload_compressed,
      payload_sha256 = excluded.payload_sha256,
      payload_size = excluded.payload_size,
      card_count = excluded.card_count,
      summary = excluded.summary,
      synced_at = now(),
      updated_at = now()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.create_manual_game_profile(uuid, text, text, text, integer, integer, jsonb) from public, anon, authenticated;
revoke all on function public.upsert_auto_game_profile(uuid, text, text, text, text, integer, integer, jsonb) from public, anon, authenticated;

grant execute on function public.create_manual_game_profile(uuid, text, text, text, integer, integer, jsonb) to service_role;
grant execute on function public.upsert_auto_game_profile(uuid, text, text, text, text, integer, integer, jsonb) to service_role;
