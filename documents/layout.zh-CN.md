# 项目结构

English version: [layout.md](layout.md)

本文档只记录长期稳定的目录职责，不展开每个单文件层级，避免随着页面和组件迭代而快速过期。

以下本地产物不属于源码结构：

- `.next/`
- `node_modules/`
- `tsconfig.tsbuildinfo`

## 顶层结构

```text
hhwx/
|-- .claude/          # 项目规则和协作约束
|-- documents/        # 产品说明、设置说明和功能 SQL
|-- public/           # 由 Next.js 直接提供的静态资源
|-- src/
|   |-- app/          # App Router 页面、布局、元数据和 API 路由
|   |-- components/   # 共享 UI 组件和站点壳层组件
|   |-- hooks/        # 可复用状态和数据获取 hooks
|   |-- lib/          # 服务端逻辑、业务服务、校验和工具函数
|   `-- store/        # 共享客户端状态
|-- supabase/         # 基础 Supabase schema 和手动维护 SQL
`-- package.json      # 前端依赖和脚本入口
```

## src/app

- `account/`：账号中心、资料、邮箱和密码页面。
- `bandori/game-profiles/`：游戏档案卡牌和道具视图。
- `auth/`：登录、注册和找回密码页面。
- `bandori/`：日历和活动追踪器页面。
- `api/`：前端使用的同源 API 路由。
- `api/account/game-bind/`：游戏账号绑定验证码、验证、列表和解绑 API。
- `api/account/game-profiles/`：游戏档案同步、导入、导出、复制和删除 API。
- `api/bandori/`：角色、歌曲、区域道具等 Bandori 公开元数据 API。
- `layout.tsx`：根布局和站点壳层入口。
- `globals.css`：全局样式、动画和共享视觉规则。

## src/components

- `AppChrome.tsx`：站点布局壳层，管理共享 header 和 sidebar 状态。
- `Toolbar.tsx`：顶部工具栏。
- `SectionSidebarShell.tsx`：共享侧边栏容器。
- `TurnstileChallenge.tsx`：敏感操作使用的安全验证组件。
- 其他组件按首页游戏、账号和 Bandori 复用场景分组。

## src/lib

- `auth-*.ts`、`supabase-*.ts`、`turnstile-server.ts` 和 `turnstile-public.ts`：认证、安全验证以及服务端/公开配置封装。
- `bandori-*.ts` 和 `calendar-*.ts`：Bandori 页面和公开元数据相关兼容入口与服务逻辑。
- `bandori/`：按领域整理的 Bandori 模块。`bandori/data/` 包含生成数据和参考数据，`bandori/team-builder/core/` 包含组队搜索共享基础设施和计算辅助逻辑，`bandori/team-builder/single/` 包含单曲 exact 搜索编排，`bandori/team-builder/medley/` 包含组曲 exact/bounded 搜索编排，并由公开兼容 facade 对外导出。
- `api-*.ts`：API 响应约定和缓存策略。
- `bestdori-profile-codec.ts` 和 `user-game-*-server.ts`：游戏档案兼容、同步和服务端持久化逻辑。
- `characters.ts`、`othello.ts` 和 `ai/`：首页黑白棋和角色逻辑。

## 维护规则

- `README.md` 是项目级入口。
- 本文件只保留稳定目录职责。
- 新增页面或服务时，只有在改变目录职责边界时才更新本文档。
