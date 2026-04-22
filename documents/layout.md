# 项目文件结构说明

这份文档只记录长期稳定的目录职责，不再展开到每个单文件层级，避免随着页面和组件迭代而迅速过期。

同时，以下本地产物不属于源码结构的一部分：

- .next/
- node_modules/
- tsconfig.tsbuildinfo

## 顶层结构

```text
hhwx/
├── .claude/          # 项目规则与协作约束
├── documents/        # 产品和结构文档
├── public/           # 直接对外提供的静态资源
├── res/              # 设计源文件与原始素材
├── src/
│   ├── app/          # App Router 页面、布局、元数据与 API 路由
│   ├── components/   # 通用 UI 组件与全站壳层组件
│   ├── hooks/        # 复用状态与数据获取 Hook
│   ├── lib/          # 服务端逻辑、业务服务、校验与工具函数
│   └── store/        # 全局客户端状态
└── package.json      # 前端依赖与脚本入口
```

## src/app

- account/: 账号中心及资料、邮箱、密码页面
- auth/: 登录、注册、找回密码等认证页面
- bandori/: 日历与活动追踪器页面
- api/: 前端同域 API 路由
- layout.tsx: 根布局与全站壳层入口
- globals.css: 全局样式、动画和共享视觉规则

## src/components

- AppChrome.tsx: 全站布局壳层，统一页眉与侧边栏状态
- Toolbar.tsx: 顶部工具栏
- SectionSidebarShell.tsx: 全站侧边栏容器
- TurnstileChallenge.tsx: 敏感操作用安全验证组件
- 其余组件按功能划分到首页游戏、账号与 Bandori 页面复用场景

## src/lib

- auth-*.ts、supabase-*.ts、turnstile-*.ts: 鉴权、安全验证与服务端客户端封装
- bandori-*.ts、calendar-*.ts: Bandori 页面相关服务逻辑
- api-*.ts: API 响应约定与缓存策略
- characters.ts、othello.ts、ai/: 首页黑白棋与角色逻辑

## 文档维护规则

- README.md 负责项目级入口说明
- 本文件只保留稳定目录职责
- 新增页面或服务时，只在其改变目录职责边界时更新本文档
