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
|-- crates/           # 全新的 Bandori 组曲 Rust workspace members
|-- documents/        # 产品说明、设置说明和功能 SQL
|-- messages/         # UI 翻译使用的语言消息目录
|-- public/           # 由 Next.js 直接提供的静态资源
|-- scripts/          # 本地维护和校验脚本
|-- src/
|   |-- app/          # App Router 页面、布局、元数据和 API 路由
|   |-- components/   # 共享 UI 组件和站点壳层组件
|   |-- hooks/        # 可复用状态和数据获取 hooks
|   |-- i18n/         # 语言路由、请求配置和导航封装
|   |-- lib/          # 服务端逻辑、业务服务、校验和工具函数
|   `-- store/        # 共享客户端状态
|-- supabase/         # Supabase CLI 配置、迁移、旧 schema SQL 和维护 SQL
|-- Cargo.toml        # 全新组曲实现的 Rust workspace 定义
`-- package.json      # 前端依赖和脚本入口
```

## crates

- `bandori-medley-model/`：版本化的规范计分输入与严格校验；不包含搜索控制或 UI／网络契约。
- `bandori-medley-reference/`：透明计算显式给定的五卡队伍与固定三队组曲；不包含候选生成、剪枝、枚举或优化逻辑。
- `bandori-medley-search/`：规范搜索输入／输出、资源控制，以及按检查点审查的精确搜索实现；运行时使用 model，reference 只作为开发期 oracle。
- Rust workspace 是独立的全新边界，不依赖现有 `src/lib/bandori/team-builder/` 下的搜索或计分实现。

## src/app

- `[locale]/`：本地化应用路由。默认 `zh-CN` 不带 URL 前缀，非默认语言使用 `/en` 等语言前缀。
- `[locale]/account/`：账号中心、资料、邮箱和密码页面。
- `[locale]/bandori/game-profiles/`：游戏档案卡牌和道具视图。
- `[locale]/auth/`：登录、注册和找回密码页面。
- `[locale]/bandori/events/`：活动追踪器入口和按活动 ID 定位的页面。页面私有的活动信息与追踪器实现分别归入 `_info/`、`_tracker/`；旧 `/bandori/eventtracker` URL 由 `src/proxy.ts` 永久重定向。
- `[locale]/bandori/cards/`：支持服务器上下文的卡牌图鉴与单卡详情页面，页面私有 UI 归入 `_components/`。
- `[locale]/bandori/calendar/`：各服务器的活动日历页面。
- `[locale]/bandori/songs/[songId]/`：仅供开发阶段使用的歌曲详情、完整谱面分析与白名单式谱面模拟器 UI；固定原生舞台只加载逐项确认过的 JP 演出资源。
- `api/`：前端使用的同源 API 路由。
- `api/account/game-bind/`：游戏账号绑定验证码、验证、列表和解绑 API。
- `api/account/game-profiles/`：游戏档案同步、导入、导出、复制和删除 API。
- `api/bandori/`：角色、歌曲、区域道具等 Bandori 公开元数据 API。
- `manifest.ts`：保留在 `/manifest.webmanifest` 的默认语言网页应用清单。
- `globals.css`：全局样式、动画和共享视觉规则。

## messages

- `zh-CN/`：源语言，也是所有命名空间的键结构基线。
- `en/`：英文翻译，命名空间文件和键结构必须与 `zh-CN/` 一致。
- 命名空间文件使用稳定语义 key 和 ICU 风格占位符。修改消息后运行 `npm run i18n:check`。

## src/i18n

- `routing.ts`：支持语言、默认语言、URL 前缀策略和语言路径辅助函数。
- `navigation.ts`：面向 `Link`、router、pathname 和路径生成的语言感知封装。
- `request.ts`：next-intl 请求配置和消息命名空间加载。
- `src/proxy.ts`：语言协商 proxy，排除 API 路由、Next 内部路径、Vercel 内部路径和静态文件。

## src/components

- `AppChrome.tsx`：站点布局壳层，管理共享 header 和 sidebar 状态。
- `Toolbar.tsx`：顶部工具栏。
- `SectionSidebarShell.tsx`：共享侧边栏容器。
- `TurnstileChallenge.tsx`：敏感操作使用的安全验证组件。
- `comments/`：与目标类型无关的评论列表、编辑器、评论项、表情和贴纸选择 UI。
- `bandori/`：跨路由复用的 Bandori 媒体和选择 UI，包括卡面与贴纸渲染。
- 其他组件按首页游戏、账号和复用场景分组。

## src/hooks

- 共享 hook 负责可复用的浏览器状态与请求编排；目标页面特有的路由和查询适配器仍留在对应路由。例如 `useCommentThread.ts` 保持通用，Bandori 活动 URL 适配器留在 events 路由中。

## src/lib

- `auth-*.ts`、`supabase-*.ts`、`turnstile-server.ts` 和 `turnstile-public.ts`：认证、安全验证以及服务端/公开配置封装。
- 根目录中保留的 `bandori-*.ts` 和 `calendar-*.ts`：不属于单一功能目录的跨领域基础设施与兼容入口。
- `bandori/cards/`：卡牌目录、区服数据物化、API 契约与服务、发布/训练规则、生成的卡牌元数据、布局和档案卡牌辅助逻辑。
- `bandori/events/`：活动目录、API 契约与服务、路由/区服/状态辅助逻辑、横幅代理和活动评论目标校验。
- `bandori/event-tracker/`：Event Tracker 的档线、TOP10、实时序列、投影、历史与预测契约/服务，由活动、歌曲和月度追踪模式共同使用。
- `bandori/chart-simulator/`：无损谱面编译、带版本的 Worker 传输、定位状态重建、原生演出／效果／音频运行时，以及 CDN manifest 解析；谱面模拟器实体资源不进入 Web 仓库，而是通过逻辑路径解析，同时这里不包含区服选择。
- `bandori/medley-foundation/`：全新的固定队来源校验，以及向 bit-exact Rust 组曲计分契约的投影；不依赖现有 team-builder 或任何搜索表示。
- `bandori/team-builder/`：组队搜索实现。`core/` 包含共享计算基础设施，`single/` 包含单曲 exact 搜索编排，`medley/` 包含组曲 exact/bounded 搜索编排，并由公开兼容 facade 对外导出。
- `comments/`：与目标类型无关的评论契约、表情/贴纸目录、内容解析和特权持久化服务；各目标类型的存在性与可见性校验留在各自领域中。
- `api-*.ts`：API 响应约定和缓存策略。
- `bestdori-profile-codec.ts` 和 `user-game-*-server.ts`：游戏档案兼容、同步和服务端持久化逻辑。
- `characters.ts`、`othello.ts` 和 `ai/`：首页黑白棋和角色逻辑。

## scripts

- `check-i18n-messages.mjs`：以 `messages/zh-CN` 为基线校验各语言命名空间和占位符一致性。

## supabase

- `config.toml`：Supabase CLI 本地项目配置。它与 HHWX 当前 Data API 策略保持一致，默认不自动暴露新建 public 表。
- `migrations/`：后续 Supabase schema 变更的标准版本化迁移目录。
- `schema/`：迁移优先流程过渡期间保留的旧 baseline 和兼容 SQL。
- `maintenance/`：仅用于手动观察和维护查询，不要当作迁移执行。

## 维护规则

- `README.md` 是项目级入口。
- 本文件只保留稳定目录职责。
- 新增页面或服务时，只有在改变目录职责边界时才更新本文档。
