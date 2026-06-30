# Supabase 设置

English version: [supabase-setup.md](supabase-setup.md)

迁移历史说明：`supabase/migrations/` 中 2026-06-02、2026-06-03 和
`20260610030939` 开头的旧版本文件，是接入 CLI baseline 前线上已经通过
MCP/手动流程应用过的历史记录。它们在本地有意保持 no-op，用来让 linked CLI
项目识别远端已存在的 version；全新空库的实际结构仍由
`20260610073410_baseline_schema.sql` 构建。对生产库不要直接执行 baseline SQL，
只能在确认线上 schema 已经匹配后，把 baseline version 标记为 applied，并且任何
生产 push 前都先运行 `npm exec -- supabase db push --dry-run`。

本文档说明 HHWX 的 Supabase schema 工作流。新的 schema 变更应以 Supabase CLI migration 作为事实来源；旧的独立 SQL 文件在过渡期内保留为参考和兼容脚本。

## 文件

- `supabase/schema/auth_schema.sql`：profiles、comments、基础账号角色和 auth user bootstrap trigger。
- `supabase/schema/auth_legacy_patch.sql`：旧 auth/profile 部署的兼容补丁。
- `supabase/schema/bandori_calendar_schema.sql`：Bandori 角色、活动、国服日程、活动 bonus 和日历编辑角色表。
- `supabase/schema/bandori_tracker_data_schema.sql`：追踪器排名数据表和索引。
- `supabase/config.toml`：Supabase CLI 本地项目配置。
- `supabase/migrations/*_baseline_schema.sql`：当前 HHWX 空 Supabase 项目的迁移基线。
- `documents/account-status-schema.sql`：应用侧邮箱验证状态。
- `documents/account-status-backfill-auth-confirmed.sql`：从 Supabase Auth 确认状态回填的可选脚本。
- `documents/account-auth-flow.zh-CN.md`：账号注册、邮箱验证、重发和账号管理行为说明。
- `documents/comment-likes-notifications-schema.sql`：旧版增量迁移，用于已存在 `comments` 部署的历史点赞表和回复/点赞提醒桥接。
- `supabase/migrations/20260630053053_comment_reactions.sql`：评论 reaction 迁移，会把既有点赞回填成旧 reaction key。
- `supabase/migrations/20260630055412_retarget_legacy_comment_reaction_kokoro_yay.sql`：把旧点赞迁移到默认 `KokoroYay` reaction。
- `supabase/migrations/20260630071740_remove_legacy_comment_likes.sql`：在确认 reaction 回填后，移除旧 `comment_likes` 表和 `comments.like_count` 兼容计数字段。
- `documents/profile-public-uid-schema.sql`：公开数字 profile UID 支持。
- `documents/game-profile-schema.sql`：持久化用户游戏档案。
- `documents/game-account-binding-schema.sql`：游戏账号绑定验证码和绑定关系。
- `supabase/maintenance/bandori_tracker_maintenance.sql`：仅用于手动观察和维护查询，不要当作迁移执行。

## 迁移工作流

使用项目本地安装的 Supabase CLI，不需要全局安装。

```powershell
npm exec -- supabase --version
npm exec -- supabase migration new <name>
```

新的 schema 工作按以下流程处理：

1. 用 `npm exec -- supabase migration new <name>` 创建迁移。
2. 把 SQL 变更写入生成的 `supabase/migrations/<timestamp>_<name>.sql`。
3. 应用前复查 grants、RLS policies、函数 `search_path` 和 service-role 边界。
4. 如果本机有 Docker，可用 `npm exec -- supabase db reset` 在本地 Supabase stack 上测试。
5. 对已 link 的远程项目，先用 `npm exec -- supabase db push --dry-run` 复查，再执行 `npm exec -- supabase db push`。

当前 baseline migration 面向全新的空项目。不要直接对现有生产 HHWX 项目执行它。对已 link 的生产项目，保留远端已应用版本对应的历史 no-op 记录；只有在确认线上 schema 已经匹配后，才把 baseline version 标记为 applied。任何生产 push 前都先运行 `npm exec -- supabase db push --dry-run`。

## 旧手动执行顺序

旧的手动部署可在 Supabase SQL editor 或自己的迁移系统中按顺序执行：

1. `supabase/schema/auth_schema.sql`
2. 如果是升级旧部署，执行 `supabase/schema/auth_legacy_patch.sql`
3. `supabase/schema/bandori_calendar_schema.sql`
4. `supabase/schema/bandori_tracker_data_schema.sql`
5. `documents/account-status-schema.sql`
6. `documents/profile-public-uid-schema.sql`
7. `documents/game-account-binding-schema.sql`
8. `documents/game-profile-schema.sql`

只有在从已有 Supabase Auth 项目迁移、并且需要把已确认邮箱用户变为应用侧已验证用户时，才执行 `documents/account-status-backfill-auth-confirmed.sql`。

如果既有项目已经执行过旧版 `auth_schema.sql`，只有在还需要历史点赞/提醒桥接时才执行 `documents/comment-likes-notifications-schema.sql`。随后执行 `supabase/migrations/20260630053053_comment_reactions.sql`，添加 emoji reactions 并回填既有点赞，再执行 `supabase/migrations/20260630055412_retarget_legacy_comment_reaction_kokoro_yay.sql`，把迁移后的旧点赞改为 `KokoroYay`；确认回填无误后执行 `supabase/migrations/20260630071740_remove_legacy_comment_likes.sql`。

## 复查要点

- 用户归属表保持 row-level security 开启。
- 新的 schema 变更使用 `supabase/migrations/`。除非某个迁移明确复用旧 SQL，否则旧的独立 SQL 文件只作为兼容参考。
- Supabase 从 2026-05-30 起不再为新项目自动把 public 新表/函数暴露给 Data API，并会从 2026-10-30 起把同一默认行为应用到既有项目。凡是创建 Data API 对象的 SQL 文件，都应把显式 `GRANT`/`REVOKE` 与 RLS policy 放在一起维护。
- 将 `security definer` 函数视为特权代码：生产前复查参数检查、所有权检查、grants 和 `search_path` 行为。
- 只在应用确实需要时授予直接 table 或 function 访问权限。
- service-role 操作必须保持在服务端。浏览器代码只能使用公开 Supabase key 和已认证用户 session。
- Supabase Auth 的 Email provider 保持启用，但 Dashboard 的 Confirm email 保持关闭（`mailer_autoconfirm: true`）。HHWX 使用应用侧邮箱验证；Supabase 内置 signup 确认邮件不能完成 `account_status.email_verified_at`。
- 只有 `db reset`、`db diff`、`start` 等本地 Supabase stack 命令需要 Docker。创建 migration 文件和从远程生成 types 可以只用项目本地 CLI。

## 环境变量

Web 应用需要：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

`SUPABASE_SECRET_KEY` 只允许服务端使用，绝不能加 `NEXT_PUBLIC_` 前缀。
