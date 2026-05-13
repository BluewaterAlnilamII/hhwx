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
