# Supabase 设置

`supabase/migrations/20260812043505_add_bandori_card_comment_targets.sql`
允许通用评论和通知表保存 `bandori_card` 目标，同时保持浏览器只读 grants 和
RLS policy 不变。普通卡牌跨服共用 `<card-id>` 目标；已登记的 EN/CN 数字 ID
碰撞使用 `<server-code>:<card-id>`。

这项卡牌评论约束变更必须先迁移、后部署应用：先推送
`20260812043505_add_bandori_card_comment_targets.sql`，再部署会写入
`bandori_card` 行的应用版本。旧应用与扩展后的约束兼容。只有确认 `comments` 和
`comment_notifications` 中都不存在 `bandori_card` 行后，才能安全回滚为仅允许活动评论的约束。

`supabase/migrations/20260812053202_expand_comment_content_length.sql` 将 Bandori
共享评论、回复和编辑内容的上限从 500 个 Unicode 字符放宽到 1000 个，不修改黑白棋旧留言板的
500 字上限，也不修改 grants 或 RLS policy。这项变更同样必须先迁移、后部署应用；旧应用仍只会
提交最多 500 字，因此与新约束兼容。回滚前必须确认 `comments` 中没有超过 500 字的非空内容。

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
- `supabase/schema/bandori_tracker_latest_schema.sql`：仅登录用户可读的 latest snapshot、service-role 合并 RPC 和 cutoff Private Broadcast 读取 policy。
- `supabase/schema/bandori_tracker_topdata_latest_schema.sql`：活动 TOP10 latest 表、service-role merge RPC 与锚定的 Private Broadcast 登录读取 policy。
- `supabase/config.toml`：Supabase CLI 本地项目配置。
- `supabase/migrations/*_baseline_schema.sql`：当前 HHWX 空 Supabase 项目的迁移基线。
- `documents/account-status-schema.sql`：应用侧邮箱验证状态。
- `documents/account-status-backfill-auth-confirmed.sql`：从 Supabase Auth 确认状态回填的可选脚本。
- `documents/account-auth-flow.zh-CN.md`：账号注册、邮箱验证、重发和账号管理行为说明。
- `supabase/migrations/20260630053053_comment_reactions.sql`：评论 reaction 迁移，会把仍存在历史 `comment_likes` 表的部署回填到 reaction key。
- `supabase/migrations/20260630055412_retarget_legacy_comment_reaction_kokoro_yay.sql`：把旧点赞迁移到默认 `KokoroYay` reaction。
- `supabase/migrations/20260630071740_remove_legacy_comment_likes.sql`：在确认 reaction 回填后，移除旧 `comment_likes` 表和 `comments.like_count` 兼容计数字段。
- `supabase/migrations/20260701131822_remove_legacy_like_notifications.sql`：移除旧 `comment_like` 提醒记录，并把 `comment_notifications` 收紧为只支持回复和回应提醒。
- `supabase/migrations/20260728185041_scope_bandori_event_comments_by_server.sql`：把旧的纯数字 Bandori 活动评论和通知目标迁移为统一的 `<server-code>:<event-id>` 格式，并将迁移前的讨论全部视为 CN。
- `supabase/migrations/20260801185414_accept_manual_profile_server.sql`：让仅 service role 可调用的手动档案 RPC 显式保存档案正文中的 Bandori 服务器。
- `supabase/migrations/20260815211415_add_profile_display_degree.sql`：保存公开展示称号、仅允许 service-role RPC 修改，并在最后一个拥有该称号的国服绑定被解绑或转移时回退到日服称号 100。
- `scripts/backfill-user-game-profile-servers.mjs`：根据带校验和的压缩档案正文审计或修复手动档案的服务器摘要字段。
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

`20260728185041_scope_bandori_event_comments_by_server.sql` 必须与应用协调发布：先部署已支持服务器隔离的评论 API，使并发新写入直接使用统一目标格式，再立即执行迁移。两个步骤之间旧讨论可能会暂时不可见，但迁移会保留全部评论和通知记录。

账号展示称号改动采用 migration-first 顺序。先 push `20260815211415_add_profile_display_degree.sql`，再部署账号中心选择器；新的资料读取和保存路由依赖该迁移提供的字段与 service-role RPC。旧应用会忽略带默认值的新字段。迁移还会替换绑定转移和解绑 RPC，使最后一个拥有当前称号的绑定消失时能在同一事务中回退。

CN Degree effect 的私有持久化同样采用 migration-first 顺序。先 push
`20260816024443_add_game_binding_degree_effects.sql`，再部署 effect-aware
账号同步与 Web reader。该迁移只增加绑定表上的单调集合
`owned_degree_effect_ids` 和仅 service role 可调用的
`merge_game_uid_binding_degree_effects` RPC；公开资料选择与渲染属于独立的后续
应用和 schema 发布。

手动档案服务器修复只支持“迁移优先”的向后兼容发布顺序。先 push `20260801185414_accept_manual_profile_server.sql`，随后立即部署应用，再审计历史记录：

```powershell
node --import tsx scripts/backfill-user-game-profile-servers.mjs
```

审计过程只读，并且只输出聚合后的服务器转换数量。如果没有不可读或服务器非法的正文，再执行回填，并用第二次只读审计确认错值归零：

```powershell
node --import tsx scripts/backfill-user-game-profile-servers.mjs --apply
node --import tsx scripts/backfill-user-game-profile-servers.mjs
```

回填只处理手动档案，以通过校验和验证的正文 `bestdoriProfile.server` 为准，并且仅在原 `server` 和 `payload_sha256` 都未变化时更新。只要存在任何无法验证的手动档案正文，apply 就会拒绝执行。

当前 baseline migration 面向全新的空项目。不要直接对现有生产 HHWX 项目执行它。对已 link 的生产项目，保留远端已应用版本对应的历史 no-op 记录；只有在确认线上 schema 已经匹配后，才把 baseline version 标记为 applied。任何生产 push 前都先运行 `npm exec -- supabase db push --dry-run`。

## 旧手动执行顺序

旧的手动部署可在 Supabase SQL editor 或自己的迁移系统中按顺序执行：

1. `supabase/schema/auth_schema.sql`
2. 如果是升级旧部署，执行 `supabase/schema/auth_legacy_patch.sql`
3. `supabase/schema/bandori_calendar_schema.sql`
4. `supabase/schema/bandori_tracker_data_schema.sql`
5. `supabase/schema/bandori_tracker_latest_schema.sql`
6. `supabase/schema/bandori_tracker_topdata_latest_schema.sql`
7. `documents/account-status-schema.sql`
8. `documents/profile-public-uid-schema.sql`
9. `documents/game-account-binding-schema.sql`
10. `documents/game-profile-schema.sql`

只有在从已有 Supabase Auth 项目迁移、并且需要把已确认邮箱用户变为应用侧已验证用户时，才执行 `documents/account-status-backfill-auth-confirmed.sql`。

如果既有项目仍有历史 `comment_likes` 表，按顺序执行从 `supabase/migrations/20260630053053_comment_reactions.sql` 到 `supabase/migrations/20260701131822_remove_legacy_like_notifications.sql` 的 CLI migrations。最终支持状态是 `comment_reactions` 加只支持回复和回应提醒的 `comment_notifications`；旧的点赞提醒桥接脚本不再支持。

## 复查要点

- 用户归属表保持 row-level security 开启。
- 新的 schema 变更使用 `supabase/migrations/`。除非某个迁移明确复用旧 SQL，否则旧的独立 SQL 文件只作为兼容参考。
- Supabase 从 2026-05-30 起不再为新项目自动把 public 新表/函数暴露给 Data API，并会从 2026-10-30 起把同一默认行为应用到既有项目。凡是创建 Data API 对象的 SQL 文件，都应把显式 `GRANT`/`REVOKE` 与 RLS policy 放在一起维护。
- 将 `security definer` 函数视为特权代码：生产前复查参数检查、所有权检查、grants 和 `search_path` 行为。
- 只在应用确实需要时授予直接 table 或 function 访问权限。
- service-role 操作必须保持在服务端。浏览器代码只能使用公开 Supabase key 和已认证用户 session。
- `bandori_tracker_latest` 仅允许登录用户读取，不加入 Postgres Changes publication。tracker 通过仅 service role 可执行的 `upsert_bandori_tracker_latest` RPC 写入，再向匹配的 Private Broadcast topic 发布；不要给浏览器授予 `realtime.messages` INSERT。
- 活动 TOP10 高频 snapshot 使用 `bandori_tracker_topdata_latest_snapshots` 和仅 service role 可执行的 `upsert_bandori_tracker_topdata_latest` RPC。已注册且非匿名的用户可 SELECT latest 行并接收锚定的 `bandori:topdata:cn:events:{eventId}` Private Broadcast。该表不作为 Postgres Changes source；浏览器不能写表、执行 RPC 或插入 Broadcast。
- 客户端必须以 `(topic, revision)` 排序和幂等。`sampleId` 表示顶层最新观测时间；较旧 partial patch 补齐缺失榜线时，顶层 `sampleId` 可以保持不变而 `revision` 继续递增。
- 事件追踪器先订阅，再精确查询 snapshot，并缓存查询期间的 Broadcast；snapshot 瞬时失败时使用有限退避重试。Private 分钟点只保留在当前会话内存中，live 权限未激活时不得显示。
- Supabase Auth 的 Email provider 保持启用，但 Dashboard 的 Confirm email 保持关闭（`mailer_autoconfirm: true`）。HHWX 使用应用侧邮箱验证；Supabase 内置 signup 确认邮件不能完成 `account_status.email_verified_at`。
- 只有 `db reset`、`db diff`、`start` 等本地 Supabase stack 命令需要 Docker。创建 migration 文件和从远程生成 types 可以只用项目本地 CLI。

## 环境变量

Web 应用需要：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

部署 tracker-live migrations 前，必须在本地 Supabase 或隔离的 Supabase branch 执行 `npm run test:supabase`。`supabase/tests/bandori_tracker_latest.sql` 覆盖 cutoff latest，`supabase/tests/bandori_tracker_topdata_latest.sql` 覆盖 TOP10 表、RPC、RLS、并发、payload 上限与锚定 Broadcast policy。

Bandori tracker 实时传输固定使用 Private Broadcast。浏览器只会在恢复的 session 完成登录 bootstrap 后订阅，不再提供环境变量传输开关。

`SUPABASE_SECRET_KEY` 只允许服务端使用，绝不能加 `NEXT_PUBLIC_` 前缀。
