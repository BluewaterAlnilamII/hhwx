# Supabase 设置

English version: [supabase-setup.md](supabase-setup.md)

本文档说明 HHWX 全新部署时当前仓库内 SQL 文件的布局。

## 文件

- `supabase/schema/auth_schema.sql`：profiles、comments、基础账号角色和 auth user bootstrap trigger。
- `supabase/schema/auth_legacy_patch.sql`：旧 auth/profile 部署的兼容补丁。
- `supabase/schema/bandori_calendar_schema.sql`：Bandori 角色、活动、国服日程、活动 bonus 和日历编辑角色表。
- `supabase/schema/bandori_tracker_data_schema.sql`：追踪器排名数据表和索引。
- `documents/account-status-schema.sql`：应用侧邮箱验证状态。
- `documents/account-status-backfill-auth-confirmed.sql`：从 Supabase Auth 确认状态回填的可选脚本。
- `documents/account-auth-flow.zh-CN.md`：账号注册、邮箱验证、重发和账号管理行为说明。
- `documents/profile-public-uid-schema.sql`：公开数字 profile UID 支持。
- `documents/game-profile-schema.sql`：持久化用户游戏档案。
- `documents/game-account-binding-schema.sql`：游戏账号绑定验证码和绑定关系。
- `supabase/maintenance/bandori_tracker_maintenance.sql`：仅用于手动观察和维护查询，不要当作迁移执行。

## 建议执行顺序

全新项目可在 Supabase SQL editor 或自己的迁移系统中按顺序执行：

1. `supabase/schema/auth_schema.sql`
2. 如果是升级旧部署，执行 `supabase/schema/auth_legacy_patch.sql`
3. `supabase/schema/bandori_calendar_schema.sql`
4. `supabase/schema/bandori_tracker_data_schema.sql`
5. `documents/account-status-schema.sql`
6. `documents/profile-public-uid-schema.sql`
7. `documents/game-profile-schema.sql`
8. `documents/game-account-binding-schema.sql`

只有在从已有 Supabase Auth 项目迁移、并且需要把已确认邮箱用户变为应用侧已验证用户时，才执行 `documents/account-status-backfill-auth-confirmed.sql`。

## 复查要点

- 用户归属表保持 row-level security 开启。
- 将 `security definer` 函数视为特权代码：生产前复查参数检查、所有权检查、grants 和 `search_path` 行为。
- 只在应用确实需要时授予直接 table 或 function 访问权限。
- service-role 操作必须保持在服务端。浏览器代码只能使用公开 Supabase key 和已认证用户 session。
- Supabase Auth 的 Email provider 保持启用，但 Dashboard 的 Confirm email 保持关闭（`mailer_autoconfirm: true`）。HHWX 使用应用侧邮箱验证；Supabase 内置 signup 确认邮件不能完成 `account_status.email_verified_at`。

## 环境变量

Web 应用需要：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

`SUPABASE_SECRET_KEY` 只允许服务端使用，绝不能加 `NEXT_PUBLIC_` 前缀。
