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
- `supabase/migrations/20260602*_*.sql`、`supabase/migrations/202606030*_*.sql` 和 `supabase/migrations/20260610030939_*.sql`：接入 CLI baseline 前通过 MCP/手动流程应用的线上历史记录，本地有意保持 no-op，以便 linked CLI 识别远端已有版本；空库结构由 `20260610073410_baseline_schema.sql` 构建。
- `documents/account-status-schema.sql`：应用侧邮箱验证状态。
- `documents/account-status-backfill-auth-confirmed.sql`：已退役的不安全历史回填脚本，不要执行。
- `documents/account-auth-flow.zh-CN.md`：账号注册、邮箱验证、重发和账号管理行为说明。
- `supabase/migrations/20260630053053_comment_reactions.sql`：评论 reaction 迁移，会把仍存在历史 `comment_likes` 表的部署回填到 reaction key。
- `supabase/migrations/20260630055412_retarget_legacy_comment_reaction_kokoro_yay.sql`：把旧点赞迁移到默认 `KokoroYay` reaction。
- `supabase/migrations/20260630071740_remove_legacy_comment_likes.sql`：在确认 reaction 回填后，移除旧 `comment_likes` 表和 `comments.like_count` 兼容计数字段。
- `supabase/migrations/20260701131822_remove_legacy_like_notifications.sql`：移除旧 `comment_like` 提醒记录，并把 `comment_notifications` 收紧为只支持回复和回应提醒。
- `supabase/migrations/20260728185041_scope_bandori_event_comments_by_server.sql`：把旧的纯数字 Bandori 活动评论和通知目标迁移为统一的 `<server-code>:<event-id>` 格式，并将迁移前的讨论全部视为 CN。
- `supabase/migrations/20260801185414_accept_manual_profile_server.sql`：让仅 service role 可调用的手动档案 RPC 显式保存档案正文中的 Bandori 服务器。
- `supabase/migrations/20260815211415_add_profile_display_degree.sql`：保存公开展示称号、仅允许 service-role RPC 修改，并在最后一个拥有该称号的国服绑定被解绑或转移时回退到日服称号 100。
- `scripts/backfill-user-game-profile-servers.mjs`：根据带校验和的压缩档案正文审计或修复手动档案的服务器摘要字段。
- `scripts/update-supabase-auth-email-templates.ps1`：预览或更新远程 Auth 邮件模板，操作范围见下文。
- `documents/profile-public-uid-schema.sql`：公开数字 profile UID 支持。
- `documents/game-profile-schema.sql`：持久化用户游戏档案。
- `documents/game-account-binding-schema.sql`：游戏账号绑定验证码和绑定关系。
- `supabase/maintenance/bandori_tracker_maintenance.sql`：仅用于手动观察和维护查询，不要当作迁移执行。

## 四服绑定与公开资料

四服绑定迁移把旧验证码、绑定关系、主页账号排序与可见性归为国服。游戏账号以区服及 UID 联合标识。先暂停 Web 流量，等待在途写入结束后停掉旧 Web，再执行迁移、更新私有后端并启动新版 Web。确认就绪后恢复访问。解绑请求必须带区服，主页设置统一写入 `PATCH /api/account/homepage/settings`。停机前已打开的页面若保存失败，刷新后即可重试。产生多服绑定后，回滚版本也必须识别区服。公开观察表和合并函数仅供服务端使用，数据来自玩家查询、签名验码和国服完整同步中按公开设置过滤的 `profile`。 [SQL](../supabase/migrations/20261127060443_regional_game_bindings_and_public_players.sql)

先应用[档案同步优化迁移](../supabase/migrations/20261127075659_optimize_player_profile_sync.sql)，再部署调用 `merge_game_uid_binding_titles` 的 Web 版本。旧 Web 在切换期间仍可调用原称号函数。公开玩家表在合并结果与已有记录相同时跳过行更新。

## 本地个人主页开发

2026-11-17 建立的主页开发环境使用独立本地项目 `hhwx-profile-dev`，配置目录为 `temp/profile-dev/supabase`。配置、迁移和邮件模板均复制自仓库。原 `hhwx` 数据卷已保留：其表结构与迁移记录不一致，因此没有清空或修复。新库从头应用了仓库全部 47 条迁移，最新为 `20261116105541_profile_homepage.sql`。

升级从 CLI v2 复制的本地工作目录时，在该目录的 `supabase/config.toml` 中将 `[inbucket]` 改为 `[local_smtp]`，将 `[auth.email]` 和 `[auth.sms]` 下的 `enable_signup` 改为 `enabled`，保留原值。保留该工作目录的项目 ID 和端口，以便复用已有容器和数据库卷。

先启动 Docker Desktop，再从仓库根目录运行：

```powershell
npx --no-install supabase start --workdir temp/profile-dev -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor
npm run dev -- --hostname localhost
```

打开 `http://localhost:3000/auth?next=%2Fuser%2F10001`。本地测试凭据保存在 Git 忽略的 `temp/profile-dev/test-account.json`，不能用于远端登录。测试账号包含 24 个英文/空格字符的用户名和两个示例 CN 绑定：一个具有十个汉字的游戏名，另一个没有保存游戏档案。数据库管理界面为 `http://localhost:54323`，测试邮箱为 `http://localhost:54324`。

Git 忽略的 `.env.development.local` 同时覆盖开发环境的两个 Supabase URL 和 publishable/secret key，原 `.env.local` 保持不变。本地连接值来自 `supabase status --workdir temp/profile-dev -o json`，不提交到仓库。该覆盖文件还把应用邮件导向 Mailpit，并关闭真实邮件发送、聊天发布和私有游戏同步；目录读取与 CDN 图片继续沿用原数据源。本地 Auth CAPTCHA 和应用 Turnstile 已关闭，原因是 Docker 请求外部验证服务失败。正常登录、账号已验证检查与数据库权限仍执行；该环境用于主页开发，不代表验证码和更换邮箱流程已完整验收。

国服预计排期来自当前环境的日历表。本地主页开发库已于 2026-11-19 导入当时公开的 20 条国服排期及其关联活动。核对后续排期变更时，可对照本地和线上 `/api/bandori/calendar/cn/schedules` 的结果。

数据持久保存在 Docker 数据卷。停止时运行 `npx --no-install supabase stop --project-id hhwx-profile-dev`，不要加 `--no-backup`；重启开发不需要重置数据库。仓库新增迁移后，把规范 SQL 文件复制到 `temp/profile-dev/supabase/migrations`，再运行 `npx --no-install supabase migration up --workdir temp/profile-dev`。主页数据权限变化时，在这个本地工作目录重跑 `supabase/tests/profile_homepage.sql`。凭据与生成的夹具不要提交 Git。需要恢复开发环境的原连接时，移开 `.env.development.local` 并重启 Next；远端配置没有修改。

## 迁移工作流

在个人主页迁移之后、收藏功能发布之前应用 `20261118121214_bandori_favorites.sql`。每位用户对同一内容只占一行，新增顺序由数据库序列决定。统计以这些记录为准，包含私密收藏。只有服务端角色能读取明细或调用 `read_bandori_favorites`，该函数按主页模块顺序和可见性返回条目。单项收藏接口只接受写入。本地回归使用 `supabase/tests/bandori_favorites.sql`。回滚应用版本时保留新增表，以保留用户收藏。

发布收藏卡牌编辑功能前应用 `20261118181306_favorite_card_layout.sql`。它为现有收藏保留加入顺序，为卡牌增加可选的个人排列，并将预览数量默认设为 6。本人经验证后通过 `PATCH /api/bandori/favorites` 原子保存排序和展示数。收藏成员有增删时返回 409，客户端重新读取。

随后应用 `20261118183905_grow_favorite_card_preview.sql`。展示上限 6 表示跟随末尾；迁移将已展示全部卡牌的旧设置转换为此状态。新增卡牌只插入收藏。保存布局或取消收藏时，数据库会将已到末尾的分界线归入自动状态。

上线歌单编辑控件前应用 `20261120022240_favorite_song_order.sql`。已有歌曲沿用收藏顺序，直至本人首次调整排序。

发布本轮优化前，依次应用 `20261121115452_streamline_profile_favorites.sql` 和 `20261121120352_compact_favorite_song_move.sql`。第一份迁移合并两列自定义排序并重建收藏主键，转换期间需要锁表。回滚应用时保留两份迁移。旧版分组读取和完整列表排序接口继续可用。

将 `20261121124240_simplify_favorite_layout_saves.sql` 与对应 Web 版本配套发布。迁移移除卡牌布局版本列，并替换仅服务端可调用的排序函数。升级前已打开的编辑器需刷新。新 Web 接口也接受旧的歌曲排序请求格式。若回滚到检查卡牌版本号的旧 Web 版本，数据库结构也需与之配套。

| 表 | 字段与约束 | 用途 |
| --- | --- | --- |
| `profile_homepages` | `user_id uuid` 为主键，外键指向 `profiles.id` 并级联删除。`preferences jsonb` 为非空对象，默认 `{}`。`card_preview_count smallint` 默认 6，范围 1–6。 | 每位用户至多一行。偏好存签名、封面及焦点、栏目与绑定账号的顺序和隐私设置。没有记录时使用默认值。展示数为 6 时，随收藏自然增长，最多显示六张。 |
| `bandori_favorites` | 唯一索引是复合主键 `(user_id uuid, kind text, target text)`。`user_id` 外键指向 `profiles.id` 并级联删除。`position bigint generated always as identity` 记录加入顺序。`display_order bigint` 是卡牌和歌曲可选的正整数排序值。`normal_art boolean not null default false` 记录卡牌是否选择特训前卡面。 | 每位用户对同一内容一行。歌曲与普通卡牌使用数字 ID 的文本形式，撞号卡牌用 `en:id` 或 `cn:id`，活动使用区服码加 ID。取消后重新收藏会获得新的加入序号。 |

编辑器用目标 ID 数组提交展示顺序。数据库中每项收藏占一行，单项增删、卡面选择和跨用户按目标计数共用这条记录，小范围调序通常只需更新移动的条目。

两表均启用 RLS，原始数据只允许服务端角色访问。离线统计按 `(kind, target)` 汇总所有收藏记录，私密主页也计入。网页不读取全站收藏数。登录后的 `GET /api/bandori/favorites?view=keys` 只返回无序的收藏标识数组。本人主页每次读取完整收藏后会更新当前账号的星标缓存，同时保留读取期间已确认的增删。卡牌和歌曲均提交排好序的目标 ID 数组。同一账号、同一栏目的排序按数据库实际保存顺序生效，两页仅排列不同时都能保存。收藏成员有增删时返回 409 并刷新。使用默认分界线时，单纯调整卡牌顺序无需创建主页设置记录。

个人主页版本新增 `20261116105541_profile_homepage.sql`，必须先迁移、后部署应用。`profile_homepages` 保存签名、封面焦点、模块/账号顺序与隐私设置；启用 RLS，浏览器角色没有表或 RPC 权限。经验证的 Web API 通过仅 service role 可执行的 invoker 函数 `update_profile_homepage` 原子合并修改字段；公开读取按账号/称号层级过滤，不返回私有设置。Advisor 的 `rls_enabled_no_policy` 信息级提示符合这张服务端专用表的设计。保留的 `supabase/tests/profile_homepage.sql` 验证客户端拒绝访问、不同用户隔离、局部合并和删除清理。旧版应用仍兼容；回滚应用时保留新增表，避免丢失已保存的设置。

聊天房间版本在此前四份聊天迁移后增加 `20261024162353_chat_rooms_and_bounded_retention.sql`。先应用迁移，再部署对应应用：旧记录及省略房间参数的调用仍使用 `main`，仅服务端可调用的 RPC 签名和分页索引增加房间范围，同时修正清理批次。回滚应用时保留新结构。范围见[聊天接入文档](realtime-message-board.zh-CN.md)，本地升级、权限及查询计划证据见[验证记录](realtime-message-board-validation.zh-CN.md)。

评论 UID 发布包含 `20260908145451_add_comment_reaction_public_uid.sql`。先应用迁移再部署应用，回应预览和完整用户列表才能都显示公开 UID。迁移只在现有回应汇总 JSON 中增加 `profiles.public_uid`，不改变仅 service role 可执行的边界、排序、数量限制或 RLS。旧应用会忽略新增字段；新应用也兼容旧 RPC，只是不显示预览中的 UID。回滚应用时无需撤销这份迁移。

使用项目本地安装的 Supabase CLI，不需要全局安装。依赖版本相关行为前，检查对应命令的 `--help` 和当前 [Supabase 官方迁移说明](https://supabase.com/docs/guides/deployment/database-migrations)。

```powershell
npm exec -- supabase --version
npm exec -- supabase migration new --help
```

新的 schema 工作按以下流程处理：

1. 可用 `npm exec -- supabase migration new <name>` 创建迁移并编写 SQL，也可通过明确指向本地 Supabase stack 的 SQL 连接先行试验。试验成功后用 CLI 捕获最终变更，例如 `npm exec -- supabase db pull <name>`。最终变更必须进入 `supabase/migrations/`，不要自行编造带时间戳的文件名，也不要留下未捕获的本地漂移。
2. 复查生成 SQL 的约束、索引、grants、RLS、函数 `search_path`、service-role 边界以及发布和数据迁移要求。生成的差异不能替代安全审查；检查是否有对象或数据变更需要显式补充 SQL。
3. 在可重建的本地 stack 上通过 `npm exec -- supabase db reset` 重放，验证受影响的 SQL 行为。修改 RLS、grants 或特权 SQL 时，复用或扩展保留的 SQL 测试，以预期角色和所有权、会话状态检查允许与拒绝场景，不能只用数据库 owner 或 service role。临时查询可以辅助迭代，但不能保留回归覆盖。性能敏感 SQL 的修改需要查询计划证据。本地 stack 需要 Docker；无法执行的检查应明确说明。
4. 运行适用的 [Supabase Advisors](https://supabase.com/docs/guides/observability/advisors)，例如 `npm exec -- supabase db advisors --type all`。评估变更范围内的安全、性能发现；Advisors 补充角色行为测试，不要求顺带清理无关历史问题。
5. 对已获授权的 linked 项目检查，核实目标后运行 `npm exec -- supabase db push --dry-run --remote`。只有已明确授权远程写入范围，且满足发布顺序时，才能通过 `npm exec -- supabase db push --remote` 应用。

CLI v3 的 `db pull`、`db push` 和 `db reset` 默认使用本地数据库。从远程数据库执行 `db pull` 可能更新其迁移历史。`db reset` 会清除本地数据库内容，应先捕获预期变更并保留所需本地数据。本地 SQL 试验、dry run 和现有凭据都不代表已获授权执行远程 SQL、修复迁移历史、修改配置或写入生产环境。目标和操作已经得到明确授权时，沿用该授权。

`20260728185041_scope_bandori_event_comments_by_server.sql` 必须与应用协调发布：先部署已支持服务器隔离的评论 API，使并发新写入直接使用统一目标格式，再立即执行迁移。两个步骤之间旧讨论可能会暂时不可见，但迁移会保留全部评论和通知记录。

账号展示称号改动采用 migration-first 顺序。先 push `20260815211415_add_profile_display_degree.sql`，再部署账号中心选择器；新的资料读取和保存路由依赖该迁移提供的字段与 service-role RPC。旧应用会忽略带默认值的新字段。迁移还会替换绑定转移和解绑 RPC，使最后一个拥有当前称号的绑定消失时能在同一事务中回退。

CN Degree effect 的私有持久化同样采用 migration-first 顺序。先 push
`20260816024443_add_game_binding_degree_effects.sql`，再部署 effect-aware
账号同步与 Web reader。该迁移只增加绑定表上的单调集合
`owned_degree_effect_ids` 和仅 service role 可调用的
`merge_game_uid_binding_degree_effects` RPC；公开资料选择与渲染属于独立的后续
应用和 schema 发布。

公开 Degree effect 选择属于后续的 migration-first 发布。先 push
`20260816092425_add_profile_display_degree_effect.sql`，再部署支持 effect 的选择器
和渲染器。该迁移增加可空的 `display_degree_effect_id`，保留旧应用使用的三参数
`set_profile_display_degree`，并增加用于选择已拥有 effect 变体的四参数合同。绑定
转移或解绑后，如果普通 Degree 仍由其他绑定拥有，则只清除失效的 effect；普通
Degree 也失去所有权时才回退到 JP Degree 100。

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

当前 baseline migration 面向全新的空项目。不要直接对现有生产 HHWX 项目执行它。对已 link 的生产项目，保留远端已应用版本对应的历史 no-op 记录；只有在确认线上 schema 已经匹配后，才把 baseline version 标记为 applied。任何生产 push 前都先运行 `npm exec -- supabase db push --dry-run --remote`。

## 特权脚本

上述档案回填脚本默认执行只读审计，`--apply` 需要远程写入授权。邮件模板脚本不同：本地预览使用 `scripts/update-supabase-auth-email-templates.ps1 -DryRun`。它要求提供项目 ref，无需 Management API token，并会在网络调用前退出。不带 `-DryRun` 时，它可能读取备份并 PATCH 项目的 Auth 配置；单独使用 `-WhatIf` 也不会跳过备份读取。核实目标和授权操作，保留备份，不要把 token 或私有输出写入提交或日志。

## 旧手动执行顺序

以下顺序仅供旧手动部署兼容参考，不能替代新 schema 工作的迁移流程。只在明确限定范围的旧部署设置或修复中使用：

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

不要执行 `documents/account-status-backfill-auth-confirmed.sql`：历史 Auth 自动确认不能证明邮箱归属。遵循正式迁移和[账号流程切换说明](account-auth-flow.zh-CN.md)。

如果既有项目仍有历史 `comment_likes` 表，按顺序执行从 `supabase/migrations/20260630053053_comment_reactions.sql` 到 `supabase/migrations/20260701131822_remove_legacy_like_notifications.sql` 的 CLI migrations。最终支持状态是 `comment_reactions` 加只支持回复和回应提醒的 `comment_notifications`；旧的点赞提醒桥接脚本不再支持。

## 复查要点

- 暴露的 schema 中每一张表都保持 RLS 开启。分别复查 grants 和行策略，对象访问权限不等于行所有权。`TO authenticated` 也包含匿名登录用户；不要通过可修改的 `user_metadata` 授权，修改 Auth 规则时应考虑 JWT 声明滞后。见 [Supabase RLS 官方说明](https://supabase.com/docs/guides/database/postgres/row-level-security)。
- 新的 schema 变更使用 `supabase/migrations/`。除非某个迁移明确复用旧 SQL，否则旧的独立 SQL 文件只作为兼容参考。
- Data API 对象应将显式最小权限 `GRANT`/`REVOKE` 与行策略一同维护，不依赖项目创建日期或默认暴露设置。
- 用户归属 UPDATE policy 应显式编写 `USING`、`WITH CHECK` 和所需 SELECT policy。省略 `WITH CHECK` 时，PostgreSQL 会复用 `USING`；显式编写是为了清楚表达旧行与新行的所有权约束。见 [CREATE POLICY](https://www.postgresql.org/docs/current/sql-createpolicy.html)。
- 将 `security definer` 函数视为特权代码：生产前复查参数检查、所有权检查、grants 和 `search_path` 行为。
- 只在应用确实需要时授予直接 table 或 function 访问权限。
- service-role 操作必须保持在服务端。浏览器代码使用配置的 publishable key 和已认证用户 session，不回退到旧 anon key。
- `bandori_tracker_latest` 仅允许登录用户读取，不加入 Postgres Changes publication。tracker 通过仅 service role 可执行的 `upsert_bandori_tracker_latest` RPC 写入，再向匹配的 Private Broadcast topic 发布；不要给浏览器授予 `realtime.messages` INSERT。
- 活动 TOP10 高频 snapshot 使用 `bandori_tracker_topdata_latest_snapshots` 和仅 service role 可执行的 `upsert_bandori_tracker_topdata_latest` RPC。已注册且非匿名的用户可 SELECT latest 行并接收锚定的 `bandori:topdata:cn:events:{eventId}` Private Broadcast。该表不作为 Postgres Changes source；浏览器不能写表、执行 RPC 或插入 Broadcast。
- 客户端必须以 `(topic, revision)` 排序和幂等。`sampleId` 表示顶层最新观测时间；较旧 partial patch 补齐缺失榜线时，顶层 `sampleId` 可以保持不变而 `revision` 继续递增。
- 事件追踪器先订阅，再精确查询 snapshot，并缓存查询期间的 Broadcast；snapshot 瞬时失败时使用有限退避重试。Private 分钟点只保留在当前会话内存中，live 权限未激活时不得显示。
- 原生 OTP 代码和迁移切换时，启用 Email provider 和 Confirm email（`mailer_autoconfirm: false`）。配置和顺序见[账号流程](account-auth-flow.zh-CN.md)，不能把旧自定义验证代码和新数据库结构混用。
- 只有 `db reset`、`db diff`、`start` 等本地 Supabase stack 命令需要 Docker。创建 migration 文件和从远程生成 types 可以只用项目本地 CLI。

## 环境变量

Web 应用需要：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `RESEND_API_KEY`（仅服务端，用于分步更换邮箱的新邮箱邮件；原生 Auth SMTP 继续单独配置）

本地邮箱更换测试可以将 `AUTH_EMAIL_TEST_INBOX_URL` 设为隔离 Mailpit 地址，生产环境不要设置。发信限流迁移需要与配套应用同时切换，详见[账号流程配置和上线顺序](account-auth-flow.zh-CN.md)。

部署 tracker-live migrations 前，必须在本地 Supabase 或隔离的 Supabase branch 执行 `npm run test:supabase`。`supabase/tests/bandori_tracker_latest.sql` 覆盖 cutoff latest，`supabase/tests/bandori_tracker_topdata_latest.sql` 覆盖 TOP10 表、RPC、RLS、并发、payload 上限与锚定 Broadcast policy。

Bandori tracker 实时传输固定使用 Private Broadcast。浏览器只会在恢复的 session 完成登录 bootstrap 后订阅，不再提供环境变量传输开关。

`SUPABASE_SECRET_KEY` 只允许服务端使用，绝不能加 `NEXT_PUBLIC_` 前缀。

可选的[即时留言板](realtime-message-board.zh-CN.md)使用私有 `chat_private` 表和仅服务端 public RPC。迁移创建两张私有表及 `pg_cron` 保留期任务，不创建 outbox、消费者登录或真实管理员授权。修改事务提交后，由网站调用 Centrifugo 私有 HTTP 发布 API；Centrifugo 不连接数据库。启用前在隔离栈验证 `supabase/tests/realtime_message_board.sql`、多连接并发和提交后广播；浏览器复用既有账号会话，不能直接访问私有表或这些 RPC。

聊天增量迁移 `20261023205032_chat_sending_and_query_cleanup.sql` 保留既有消息和禁言，将三秒时间戳替换为每账号 20 条/60 秒计数，删除聊天的邮箱状态读取并合并作者/状态查询。迁移和应用切换期间关闭聊天；新 RPC 不再返回 viewer 的 emailVerified 字段。浏览器表/RPC 授权仍被撤销。

留言板图片扩展迁移 `20261024065425_chat_images.sql` 在既有消息/账号状态表上增加图片字段和上传计数，未新增表或 cron。另运行 `supabase/tests/chat_images.sql` 验证共享额度、上传限频、去重、禁言、删除、回滚及权限；公开 R2 配置见留言板接入说明。


留言板摘要迁移 `20261026072628_chat_activity_and_snapshot.sql` 必须先于新应用部署。它只新增 `read_chat_activity` 和 `read_chat_snapshot` 两个 service-role-only invoker RPC，固定空 search_path，复用已有房间游标索引，不新增表或已读写入。运行 `supabase/tests/chat_activity.sql` 检查空房间、自发排除、删除、保留期、房间隔离及真实 anon/authenticated 拒绝。之后更新 [Centrifugo 配置与应用](realtime-message-board.zh-CN.md)；回滚可保留这两个新增 RPC。
