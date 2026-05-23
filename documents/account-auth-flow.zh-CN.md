# 账号注册和管理流程

English version: [account-auth-flow.md](account-auth-flow.md)

本文档说明 HHWX 的账号注册、邮箱验证、登录状态边界和账号管理行为。当前设计刻意将 Supabase Auth 登录状态和 HHWX 应用侧邮箱验证状态分开。

## 状态来源

- Supabase Auth 负责用户身份、密码登录、密码找回和登录 session。
- `public.account_status.email_verified_at` 是 HHWX 应用侧邮箱验证状态的唯一来源。
- `public.account_email_verifications` 保存一次性验证 token 的 hash。原始 token 只通过邮件回跳 URL 发送，不落库。
- 需要完整账号权限的服务端操作使用 `requireVerifiedAccount(request)`。账号管理和验证流程使用 `requireAuthenticatedUser(request)`，因此未验证邮箱的用户仍可登录、管理账号并重新发送验证邮件。

## 必要 Supabase Auth 配置

- Email provider 必须保持启用。
- Supabase Dashboard 的 **Confirm email** 必须保持关闭。公开 Auth settings 中对应为 `mailer_autoconfirm: true`。
- 如果重新开启 Confirm email，Supabase 可能会额外发送自己的 signup 确认邮件。该内置 signup 邮件不携带 HHWX 的应用侧验证 token，不能完成 `account_status.email_verified_at`。
- 浏览器代码只能使用 Supabase publishable key。service-role 或 secret key 操作必须保持在服务端。

## 注册流程

1. 注册页向 `/api/auth/signup` 提交用户名、邮箱、密码、Turnstile token 和回跳地址。
2. API 校验用户名、密码、邮箱，检查用户名和邮箱是否已占用，然后调用 Supabase `auth.signUp`。
3. Supabase 返回 user 后，API 确保该用户存在 `account_status` 行。
4. API 创建 HHWX 应用侧邮箱验证 token，并通过 Supabase magic link 邮件发送带以下参数的回跳地址：
   - `verify_email=1`
   - `verification_token=<raw one-time token>`
5. 响应仍返回 `requiresEmailVerification: true`。如果 Supabase 返回 session，前端可以建立“已登录但未验证邮箱”的登录态。

运维注意：如果 Supabase 用户创建成功但 HHWX 验证邮件发送失败，该用户可能已经存在。此时用户应登录后在账号邮箱设置页重新发送验证邮件。

## 登录、重发和确认

- 邮箱未验证也允许登录。
- 未验证用户可以访问账号管理页面，包括 `/account/email`。
- 当 `emailVerified` 为 false 时，`/account/email` 显示“重新发送验证邮件”。
- 重发验证邮件调用 `/api/auth/email`，`action` 为 `resend-verification`。该接口只要求登录，不要求已验证邮箱。
- 每次新发送验证邮件都会删除该用户旧的验证 token，并创建一个 24 小时有效的新 token。
- `/auth/confirm` 处理 Supabase magic-link callback 状态，然后向 `/api/auth/email` 提交 `action: "confirm"` 和 HHWX `verificationToken`。
- 确认成功后消费 token，并写入 `account_status.email_verified_at`。

## 账号管理

- 更换邮箱调用 `/api/auth/email`，`action` 为 `update`。
- 更换邮箱会使用提交的 access token 和 refresh token 设置 Supabase session，调用 Supabase `updateUser({ email })`，并发送带新 HHWX 验证 token 的回跳地址。
- 请求更换邮箱后，HHWX 会清空应用侧邮箱验证状态，直到确认流程重新写入 `email_verified_at`。
- 密码找回使用 Supabase password recovery，不会把 HHWX 邮箱状态标记为已验证。
- 资料读取和资料编辑允许已登录用户使用。评论、游戏账号绑定、云端游戏档案、游戏档案同步和 Bandori 排期写入要求邮箱已验证。

## 已知风险和改进项

- 当前验证 token 绑定 `user_id`，但没有显式绑定 `purpose` 或目标邮箱。对于当前“每个用户只保留一个 token”的流程可以接受；后续硬化建议增加 `purpose` 和 `email` 字段，并在确认时校验。
- `/auth/confirm` 可以在已有 session 加有效 HHWX `verification_token` 的情况下完成应用侧验证，即使 Supabase callback 已不再包含 `token_hash` 或 URL hash session 字段。这是当前流程的有意设计；如果未来要求每次验证都必须经过新的 Supabase OTP callback，需要重新收紧。
- 注册流程没有把 Supabase 用户创建和 HHWX 验证邮件发送做成事务。如果用户已创建但发信失败，账号会保留，用户需要登录后重发验证邮件。
- Supabase 的 Confirm email 必须保持关闭。任何 `mailer_autoconfirm` 变更都应视为影响兼容性的 auth 改动，并重新测试注册、登录、重发和确认。

## Smoke Test

- 注册一个新邮箱，确认 `/api/auth/signup` 成功，并只收到一封 HHWX 验证邮件。
- 验证前登录，确认可以进入 `/account/email`。
- 在 `/account/email` 重发验证邮件，确认旧 token 不再可用。
- 打开最新验证链接，确认 `account_status.email_verified_at` 被写入。
- 用未验证 session 访问受限 API，应返回 `EMAIL_VERIFICATION_REQUIRED`；账号管理 API 仍应可用。
