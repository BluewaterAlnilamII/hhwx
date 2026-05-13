-- 仅对早期数据库执行一次。
-- 这个补丁用于给旧版 profiles 表补齐 created_at 和 updated_at 字段，
-- 并统一默认值与非空约束。
-- 新库初始化请使用 auth_schema.sql，不需要执行本补丁。

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 历史数据回填，避免新增非空约束时失败。
UPDATE public.profiles
SET created_at = COALESCE(created_at, NOW())
WHERE created_at IS NULL;

UPDATE public.profiles
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;
