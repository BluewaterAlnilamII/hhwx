-- 账号与评论相关的基础结构。
-- 用于新库初始化或完整重建；若数据库已存在旧版 profiles 字段，
-- 请额外执行 auth_legacy_patch.sql 补齐历史字段。
-- account_status / account_email_verifications 是后续应用侧验证补丁，
-- 不在这个基础结构文件中合并。

CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(username) BETWEEN 2 AND 24)
);

CREATE TABLE IF NOT EXISTS comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(btrim(content)) > 0),
  CHECK (char_length(content) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_comments_created_at_desc ON comments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments (user_id);

-- 统一维护 profiles.updated_at。
CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profiles_updated_at();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_public ON profiles;
DROP POLICY IF EXISTS profiles_insert_own ON profiles;
DROP POLICY IF EXISTS profiles_update_own ON profiles;
DROP POLICY IF EXISTS comments_select_public ON comments;
DROP POLICY IF EXISTS comments_insert_own ON comments;
DROP POLICY IF EXISTS comments_delete_own ON comments;

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

CREATE POLICY comments_select_public
  ON comments FOR SELECT
  USING (true);

-- comments 允许公开读取，仅允许本人写入和删除自己的评论。
CREATE POLICY comments_insert_own
  ON comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY comments_delete_own
  ON comments FOR DELETE
  USING (auth.uid() = user_id);
