# HHWX

English version: [README.md](README.md)

HHWX 是一个基于 Next.js App Router 的社区工具和实验项目，当前包含：

- 带角色互动的黑白棋风格首页；
- BanG Dream! 国服活动日历；
- BanG Dream! 活动追踪数据展示；
- BanG Dream! 游戏档案导入、同步、卡牌、道具和组队工具；
- 基于 Supabase 的账号、邮箱、密码、评论和已验证用户流程。

HHWX 是非官方粉丝/工具项目，不隶属于、未获得、也不代表 BanG Dream!、Bushiroad、Craft Egg、Bestdori、Bilibili、Cloudflare、Supabase 或其他被提及的第三方。第三方名称、商标、游戏数据和媒体素材均归各自权利方所有。

## 状态

本仓库适合本地开发和 Web 应用自托管，但部分生产能力依赖外部或私有服务：

- Supabase 提供认证、数据库、realtime 和服务端 service-role 访问。
- Cloudflare Turnstile 可选，用于保护敏感流程。
- `cdn.hhwx.org` 是当前生产静态资源和 Bandori 资源镜像 CDN。自托管部署应使用自己的 CDN 或资源服务，不应把生产域名视为开源许可的一部分。
- 生产数据采集、资源镜像和游戏账号同步服务属于 HHWX 私有运维能力，不包含在本仓库中。自托管部署如果需要这些流程，必须自行提供兼容私有服务；否则应视为相关功能不可用。

## 需求

- Node.js 20.9 或更新版本
- npm
- 用于账号功能的 Supabase 项目
- 可选：Cloudflare Turnstile site key 和 secret key
- 可选/私有：兼容的 HHWX user fetcher endpoint，用于游戏账号绑定和手动同步。本仓库不包含该服务。

## 快速开始

```bash
npm install
cp .env.example .env.local
npm run dev
```

默认本地地址是 `http://localhost:3000`。

公开 Bandori 元数据页面只需要 public 环境变量即可渲染。账号相关页面和写入 API 需要配置 Supabase schema 和 service key。

## 环境变量

复制 [.env.example](.env.example) 为 `.env.local`，并填入你自己的部署值。

重要规则：

- `NEXT_PUBLIC_*` 会暴露给浏览器。
- `SUPABASE_SECRET_KEY`、`TURNSTILE_SECRET_KEY` 和 `HHWX_USER_FETCHER_TOKEN` 是服务端密钥，不能提交。
- `NEXT_PUBLIC_SITE_ASSET_CDN_BASE_URL` 和 `NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL` 应指向你自己的 CDN。生产 `cdn.hhwx.org` 只是公开静态资源主机，不授予任何第三方游戏素材权利。
- 资源和 CDN 示例只描述部署配置。本仓库只定义 Web 应用期望的 URL 契约，不包含用于填充 HHWX 生产镜像的私有采集工具。镜像、缓存或再分发第三方游戏内容前，请阅读 [NOTICE.zh-CN.md](NOTICE.zh-CN.md)。

## 脚本

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Supabase 设置

基础 schema 位于 [supabase/schema](supabase/schema)。仍以独立 SQL 文件维护的应用功能 schema 位于 [documents](documents)。完整执行顺序、RLS 和 service-role-only 复查说明见 [documents/supabase-setup.zh-CN.md](documents/supabase-setup.zh-CN.md)。

## 仓库结构

```text
hhwx/
|-- documents/      # 产品说明、设置说明和功能 SQL
|-- public/         # 由 Next.js 直接提供的静态资源
|-- src/
|   |-- app/        # App Router 页面、布局、元数据和 API 路由
|   |-- components/ # 共享 React UI 组件
|   |-- hooks/      # 可复用 hooks
|   |-- lib/        # 服务端和共享业务逻辑
|   `-- store/      # 客户端状态
|-- supabase/       # 基础 schema 和手动维护 SQL
`-- package.json    # 脚本和依赖入口
```

更多说明见 [documents/layout.zh-CN.md](documents/layout.zh-CN.md)。

## 文档语言

公开项目文档和部署说明以英文为 canonical。重要协作文档同时维护 `.zh-CN.md` 中文翻译。修改 README、贡献、安全、声明、设置、CDN 或目录结构文档时，应同步更新或明确复查对应中文文档。

用户可见产品文案、中国区运维说明和主要服务现有受众的历史设计说明可以继续使用中文。

## 安全

请私下报告安全问题，不要开公开 issue。见 [SECURITY.zh-CN.md](SECURITY.zh-CN.md)。

## 贡献

贡献时请确保不提交密钥，不在公开文档中写入私有部署细节，并在提交评审前运行 `npm run lint` 和 `npm run build`。见 [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)。

## 许可证

Copyright (c) 2026 BluewaterAlnilamII.

本仓库中的代码、文档和原创项目材料使用 GNU Affero General Public License v3.0 only 授权。见 [LICENSE](LICENSE)。

AGPL 允许学习、修改、再分发和自托管部署。如果你修改本软件并通过网络向用户提供服务，AGPL 要求你向这些用户提供对应源代码。

该许可证不授予任何不属于本仓库的第三方游戏素材、媒体、商标或 CDN 托管内容的权利。见 [NOTICE.zh-CN.md](NOTICE.zh-CN.md)。
