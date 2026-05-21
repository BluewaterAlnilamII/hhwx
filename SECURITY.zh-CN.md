# 安全政策

English version: [SECURITY.md](SECURITY.md)

## 报告方式

请通过邮件私下报告安全问题：

```text
bluewater.alnilam.ii@gmail.com
```

请不要为漏洞、凭据泄露、认证绕过、私有用户数据暴露或生产基础设施细节创建公开 GitHub issue。

## 敏感区域

本项目最敏感的部分包括：

- Supabase service-role 访问和 row-level security policy；
- 账号、邮箱、密码重置和已验证用户授权流程；
- 游戏档案导入、同步、导出和绑定 API；
- Cloudflare Turnstile 验证；
- HHWX user fetcher service token；
- CDN 和资源代理行为。

## 密钥处理

不要提交真实值：

- `.env.local` 或任何 `.env*` 文件，`.env.example` 除外；
- `SUPABASE_SECRET_KEY`；
- `TURNSTILE_SECRET_KEY`；
- `HHWX_USER_FETCHER_TOKEN`；
- Cloudflare R2 access key 或 secret key；
- Bilibili session token 或签名；
- 包含 hostname、port 或 SSH key 的私有部署脚本。

如果密钥被误提交，请立即轮换密钥，并在公开仓库前从仓库历史中移除。
