# 账号注册和管理流程

English version: [account-auth-flow.md](account-auth-flow.md)

HHWX 改用 Supabase 原生邮箱验证码。本地代码、数据库迁移和托管 Auth 配置需要配套切换；修改仓库不会自动修改线上项目。

## 状态来源和权限

Supabase 负责邮箱归属、密码和会话。`app_metadata.hhwx_registration` 是只能由服务端写入的“注册完成”标记，不是另一套邮箱验证码。完整账号需要同时具备原生 `email_confirmed_at` 和完成标记；用户可修改的 metadata 不能授予权限。`account_status.email_verified_at` 保留为供现有 SQL（包括留言板）读取的注册完成投影。原自定义 `account_email_verifications` 表和链接消费逻辑退役。

新账号验证邮箱后，仍需提交最终用户名和密码，才能获得完整权限。资料读取允许已认证用户使用，资料修改和原有受限操作要求完成注册。只需要身份的评论、通知读取通过已验证 JWT 获取用户 ID，不再额外查询邮箱状态。日历 Data API 在原有编辑者权限之外增加注册完成检查，其他浏览器写入权限保持原状。

## 用户实际操作

1. **注册：** 填邮箱和密码并通过 Turnstile → 收到邮件 → 填写 8 位验证码 → 填用户名 → 完成注册 → 用新密码和 Turnstile 登录。用户名可以重复。密码在最终提交前只保留在组件内存中，不随发码请求发送，也不写入浏览器存储。没有完成注册的邮箱可以直接重新走这条流程；重发按钮就在验证码页面，间隔至少 60 秒。
2. **最终提交：** `/api/auth/signup` 要求真实有效的 Auth 用户，以及 15 分钟内的邮箱 OTP/recovery 认证证明。通过一个 Auth 管理事务写入密码和不可替换的完成标记，数据库触发器在同一事务写入最终用户名和状态。并发提交只能有一个成功，失败的一方不会覆盖成功者密码或资料。管理端改密会撤销临时会话，因此完成后回到正常登录。已完成注册的邮箱验证通过后提示登录或找回，不覆盖账号。
3. **登录：** 邮箱、密码和 Turnstile token 直接提交给 Supabase。保留的历史未完成账号进入共用的邮箱补验证和账号设置流程。
4. **修改／找回密码：** 申请 recovery 验证码 → 验证 → 设置新密码。账号设置和“忘记密码”使用相同组件，不要求填写旧密码。两个原生密码安全开关都开启：普通会话不能省略旧密码直接修改；真正的 recovery 会话有例外。仅开启 Secure password change 只会对较旧会话增加要求，无法单独实现这一边界。
5. **更换邮箱：** 用原生 OTP 验证当前邮箱（`shouldCreateUser: false`）→ 填写新邮箱 → 接收并验证新邮箱验证码 → 完成更换。第一步由 Supabase SMTP 发信，第二步仅向新邮箱发送验证码，由 HHWX 调用 Resend 完成。当前邮箱证明在 **OTP 验证成功后 15 分钟内**允许申请／重发，刷新 JWT 不会延长这个时间。已经获准发出的新邮箱验证码仍可在**签发后 1 小时内**使用，不受前述窗口到期影响。证明过期后，重发或修改目标邮箱需要重新验证当前邮箱，但待完成的新邮箱验证码输入仍然可用。两侧确认和最终邮箱切换继续由原生 Auth 管理。
6. **旧链接：** `/auth/confirm` 说明流程已经更新，并提供注册、找回密码和邮箱设置入口。不再消费旧自定义 token，也不从 URL hash 自动建立登录态。

验证码流程使用独立的内存 Auth 客户端和存储标识。密码恢复和更换邮箱完成后才同步到全站会话。

注册三步保留同一个表单和原始邮箱／密码字段；非当前步骤的字段隐藏且只读，避免密码管理器丢失账号上下文。注册、重置密码都只输入一次密码，并提供显示／隐藏按钮。字段使用稳定标识、`name` 和相应的 `autocomplete`，用户名使用 `nickname`，登录邮箱使用 `username`。`/.well-known/change-password` 跳转到 `/account/password`，未登录时保留登录后的目标路径。密码生成、保存和回填仍需在目标浏览器／密码管理器中实际验收。

### 分步更换邮箱的实现

`/api/auth/email` 接收原登录 bearer token、独立 OTP 会话的 `proofToken` 和 `newEmail`。服务端检查真实用户、已签名证明的签发者／受众／角色、相同账号及当前邮箱，以及 OTP 认证时间。仅密码或 recovery 会话不能替代这一步。证明本身是普通原生 Auth 会话，并非专门限定权限的凭据；HHWX 只在此次流程的内存中保留它。

**Secure email change 继续开启**。服务端先生成 `email_change_current`，再生成 `email_change_new`；两份都生成后才能确认当前邮箱侧，因为每次生成都会重置原生确认进度。新邮箱侧最后生成，确保 token 对应目标邮箱。服务端依据刚检查的证明消费当前侧验证码，此时必须尚未返回完整用户／会话。随后只把新侧验证码发给新邮箱，HHWX API 不返回任何验证码。用户确认新侧后，原生 Auth 才完成更换。直接调用原生邮箱更换仍然需要两侧确认。

私有表 `account_private.email_change_dispatches` 只存尝试时间，不存 OTP 或证明 token。仅服务端可调用的 invoker RPC 原子地预留每账号 60 秒间隔和全应用每小时 60 次新邮箱发信预算，多进程共用。失败尝试也占预算，超过 1 小时的记录在下一次预留时清理。服务端整个操作限时 30 秒。这份预算与 Supabase SMTP 的原有限流分别计算。待更换邮箱和 token 仍归 Auth 管理，不新增自定义验证表或持久化页面流程。投递失败会明确提示；之后重发生成新的原生验证码，使前一轮失效。

## 上线时由操作者配置

| 项目 | 设置 |
| --- | --- |
| Email provider／Allow new signups | 开启 |
| Confirm email | 开启，即 `mailer_autoconfirm: false` |
| Secure email change | 开启 |
| Secure password change | 开启 |
| Require current password when updating | 开启 |
| 匿名登录／手动账号关联 | 保持关闭 |
| 密码要求 | 至少 8 位，包含字母和数字；应用现有长度、字符校验继续保留 |
| 邮箱 OTP | 8 位，3600 秒有效 |
| 邮件限流／同一用户最短间隔 | 每小时 60 封／60 秒 |
| Turnstile | Supabase Auth 中启用，使用现有站点对应的 secret；HHWX 保留相同 site key 和服务端 secret |
| SMTP | 保留现有 Resend：`smtp.resend.com`、465、用户名 `resend` 和已有凭据 |
| 发件地址／名称 | `accounts@hhwx.org`／`HHWX Accounts` |
| Site URL | `https://hhwx.org` |
| Redirect URLs | 保留确实需要的精确生产／本地路径，OTP 不需要通配回跳地址 |
| 密码已修改／邮箱已更换通知 | 开启，使用仓库模板 |

其他已有 Auth 限流可以保持。所有 HHWX 提供的申请或重发验证码操作都需要新的 Turnstile token，登录也保留验证。注册、找回密码、当前邮箱验证把 token 直接交给 Supabase；新邮箱发码／重发由 HHWX 服务端校验另一个新 token，再检查近期 OTP 证明并预留发信额度。应用的 Turnstile site key 或 secret 任一缺失时，返回服务暂时不可用，不生成或发送验证码。每个 token 只由负责该请求的一方消费一次。填写邮件验证码不要求额外 Turnstile，操作成功后自动发送的安全通知不增加用户步骤。

这一边界不会为 Supabase 原生、已认证的 `updateUser({ email })` 接口增加 CAPTCHA。直接调用仍可发送原生更换邮箱邮件，但受原生限流和旧、新邮箱双重确认保护。保留 Secure email change 和 SMTP，不能宣称每次直接调用 Auth 发信都需要 Turnstile。Send Email Hook 会替换 SMTP 投递，不属于本次上线范围。

首次发信显示验证控件。重发保留 60 秒冷却，Turnstile 使用 `interaction-only` 自动运行；普通用户直接点击重发，若结果尚未就绪则等待，只有服务要求额外交互时才显示挑战。失败或超时不会发信，重试取得新的 token。保留 Supabase 原生重发接口的验证要求，不另建重发授权或代发机制。

邮件标题使用 `supabase/templates/auth/subjects.json`，正文使用同目录的 8 份 HTML。认证邮件显示 `.Token`，不包含会被扫描器消耗的验证链接。当前邮箱证明使用中性的 Magic link／OTP 模板；应用发送的新邮箱邮件在 `src/lib/account-email-delivery-server.ts` 使用独立标题和正文。原生更换邮箱模板保留旧／新邮箱的区分文案，供原生直接请求使用。无需自建发信 Hook。模板脚本 `-DryRun` 可以不提供管理凭据进行本地预览，真正更新仍属于需要授权的远程操作。

在**应用服务器配置 `RESEND_API_KEY`**，授权向 `hhwx.org` 域发信。新邮箱邮件发件人为 `HHWX Accounts <accounts@hhwx.org>`。这不替换 Supabase 已有 SMTP 配置。应用通过原生 `fetch` 调用 Resend HTTP API，不新增运行时依赖。生产环境不要设置 `AUTH_EMAIL_TEST_INBOX_URL`。

邮件沿用账号页面的暖色背景、中性标题、中文系统无衬线字体和蓝色操作样式。内联样式与布局表格保证正文不依赖远程资源；响应式和深色样式增强支持它们的客户端。纵向间距由表格单元格内边距控制，文字单元格明确指定字体，并保留 Outlook 宽度与行高兼容处理。通知按钮采用表格背景和可点击的链接边框；不支持圆角的客户端可以显示直角按钮。精简的中英文说明共用一个可复制的验证码。安全通知明确变更结果，邮箱变更通知使用 `OldEmail` 和 `Email`。应用生成的新邮箱 HTML 与纯文本邮件保持内容一致。`config.toml` 和 `subjects.json` 的主题必须一致。检查前先同步隔离测试栈的模板副本和 Auth 主题，再捕获新的 Mailpit 邮件；旧邮件不会自动更新。逐项审阅 HTML Check 警告并检查手机渲染，不把分数当作投递或显示成功率。

Resend 的 SPF/DKIM 保持验证，认证邮件关闭点击／打开跟踪。`accounts@hhwx.org` 不接收回复；安全通知应提示联系网站维护者，不承诺通过回复邮件获得支持。独立发信子域是可选项，不是本次切换前提。验证码邮件移除了跨域验证链接，不需要付费 Supabase 自定义域名。本地邮件箱不能证明公网投递、垃圾箱情况、DNS 或真实 Turnstile 成功，这些保留为上线验收项目。

## 历史账号和切换顺序

此前的 896 个已验证、88 个未验证（其中 5 个正在更换邮箱）是历史审计数据，上线前需重新核对，不能直接当成删除清单。旧部署开启过自动确认，不能把 Supabase 原生“已确认”当成真实邮箱归属证明。旧 `account-status-backfill-auth-confirmed.sql` 已改为拒绝执行，避免误回填。

迁移保留所有账号 ID、公开 UID、资料和绑定。只有原 HHWX 已验证账号被标记为注册完成。历史未完成账号正在进行的邮箱更换和对应 token 会取消，当前登录邮箱保持不变；之后通过同一套 recovery／注册组件证明当前邮箱并设置新密码，不新增迁移专用页面。真正废弃的注册是否删除，需另行审阅候选名单并明确操作授权。本迁移不删除账号。

旧代码依赖将被删除的自定义验证表，因此不能无协调地单独上线迁移：

1. 确认生产目标、迁移、模板、配置和待处理账号清单。
2. 暂停账号写入，在同一个维护窗口应用 `20261022111732_native_auth_otp_registration.sql` 和 `20261022125530_account_email_change_dispatch.sql`、修改托管 Auth 设置／模板、配置应用 Resend key，并部署配套代码。删表后不能继续运行旧账号逻辑。
3. 检查新注册、未完成邮箱重新注册、Turnstile 登录、找回密码、分步更换邮箱／重发，以及已验证历史账号和保留的未完成账号。确认直接调用原生邮箱更换仍需两侧验证。
4. 检查通过后恢复写入。回滚需同时协调数据库、应用和配置，不能直接把应用回退到旧版本。

本地测试不会修改生产配置或删除生产账号。

## 本地测试

隔离项目为 `hhwx-auth-test`，API **55321**、数据库 **55322**、邮件箱 **55324**；保留原 `hhwx` 实例及其数据。把仓库 `supabase/config.toml`、migrations 和 templates 复制到 `temp/auth-otp-local/supabase`，仅把项目 ID 改为上述名称、端口前缀 `543` 改为 `553`：

```powershell
npx --no-install supabase start --workdir temp/auth-otp-local -x realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
$authTest = npx --no-install supabase status --workdir temp/auth-otp-local -o json | ConvertFrom-Json
$env:NEXT_PUBLIC_SUPABASE_URL = $authTest.API_URL
$env:SUPABASE_URL = $authTest.API_URL
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $authTest.PUBLISHABLE_KEY
$env:SUPABASE_SECRET_KEY = $authTest.SECRET_KEY
$env:NEXT_PUBLIC_SITE_URL = 'http://localhost:3100'
$env:NEXT_PUBLIC_TURNSTILE_SITE_KEY = '1x00000000000000000000AA'
$env:TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA'
$env:AUTH_EMAIL_TEST_INBOX_URL = $authTest.MAILPIT_URL
$env:RESEND_API_KEY = ''
npm run dev -- --port 3100
```

另开终端执行测试，不要打印或提交本地凭据对象。`scripts/test-auth-local.mjs` 拒绝非本地地址和错误测试端口；为补足 CLI 2.117 尚未暴露的配置，它只重建这个隔离实例的无状态 Auth 容器，增加 `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true` 并启用 Turnstile 官方测试密钥，然后生成测试用户并在结束后清理。先运行该脚本，再进行手动交互测试；它会保留启用 CAPTCHA 的 Auth 服务。不重置数据库、不访问生产。Auth 邮件由本地 SMTP 捕获，应用的新邮箱邮件通过 `AUTH_EMAIL_TEST_INBOX_URL` 投入 Mailpit API。该覆盖配置拒绝生产模式及非本地 Auth／邮件箱地址。测试只调整自身临时样本的时间戳来检查过期和重发，无需长时间等待。

```powershell
npm run test:auth
node --import tsx --test tests/user-game-profile-sync.test.mjs
node scripts/test-auth-local.mjs
npx --no-install supabase test db --workdir temp/auth-otp-local D:/Workspace/hhwx/supabase/tests/auth_registration.sql
npx --no-install supabase test db --workdir temp/auth-otp-local D:/Workspace/hhwx/supabase/tests/account_email_change.sql
npx --no-install supabase db advisors --workdir temp/auth-otp-local --local --type security
npm run typecheck
npm run i18n:check
npm run lint
npm run build
```

CI 执行 `npm run test:auth`，覆盖注册、更换邮箱、身份校验、表单状态和错误本地化。独立的 `auth-database` 任务通过 `supabase db start` 启动临时数据库、应用正式迁移，并运行 `auth_registration.sql`、`account_email_change.sql` 和 `auto_game_profile_ownership.sql`，不使用线上凭据或邮件服务。完整的本地 Auth／Mailpit 脚本仍作为发布前检查；真实 Turnstile 挑战和 Resend 公网投递另行验收。发布前同时执行生产依赖检查 `npm audit --omit=dev --audit-level=moderate`。

集成测试覆盖错误／重复 OTP、未完成账号权限、并发最终提交、已注册账号不可覆盖、重复用户名、原生 recovery 例外、原生直接双确认和历史账号身份保留。分步更换邮箱检查缺失／密码／其他账号／过期证明拒绝、并发限流、不再次向旧邮箱发信、证明过期后待确认验证码仍可完成、OTP 过期、更换目标／原目标重发，以及旧邮箱证明不能用于已换邮箱的账号。SQL 测试检查真实角色权限、注册完成保护和发信限流。本地使用 [Cloudflare 官方测试密钥](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)，展示自动通过的验证控件并实际调用 Siteverify；集成测试检查缺少 CAPTCHA 时原生注册／找回／登录和应用新邮箱发信被拒绝。测试密钥只能用于本地，生产必须使用真实密钥；真实挑战和 Resend 公网投递仍需上线前验收。需要 CDN 资源的浏览器检查优先使用可用的 `localhost:3000`，其他端口可能不在 CDN CORS 允许范围内。

日历 Data API 写入还要求使用注册完成后签发的 JWT，避免旧的未验证会话在账号完成后获得写权限。已验证历史用户无需重验邮箱；直接调用 Data API 的客户端在切换后刷新会话即可，网站日历接口继续验证当前 Auth 用户。
