# HHWX

HHWX 是一个基于 Next.js App Router 的前端站点，当前包含以下主要能力：

- 首页黑白棋与角色交互
- Bandori 国服活动日历
- Bandori 活动分数追踪器展示
- 账号中心、邮箱与密码管理
- 基于 Supabase 的鉴权与服务端 API

## 常用命令

```bash
npm install
npm run dev
npm run build
```

默认开发地址为 http://localhost:3000 。

## 目录概览

```text
hhwx/
├── documents/      # 项目文档
├── public/         # 直接公开的静态资源
├── res/            # 设计源资源
├── src/
│   ├── app/        # App Router 页面、布局和 API 路由
│   ├── components/ # 通用 React 组件
│   ├── hooks/      # 自定义 Hooks
│   ├── lib/        # 服务端与共享业务逻辑
│   └── store/      # Zustand 状态
└── package.json    # 脚本与依赖
```

更细的结构说明见 documents/layout.md。

## 关键约定

- 账号与敏感操作的安全校验放在服务端 API 中完成。
- 全站壳层、页眉和侧边栏由共享组件统一管理。
- 文档只保留长期有效的信息，不记录 .next、node_modules、tsconfig.tsbuildinfo 这类本地产物。
