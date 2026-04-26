# hhwx Codex 项目规则

本文件是 Codex 在 hhwx 仓库中的规则入口。仓库长期规则源保存在 `.claude/`；执行任务时应先遵循本文件，再按需读取 `.claude/CLAUDE.md` 和匹配路径的 `.claude/rules/*.md`。

## 规则优先级

- 用户当前明确要求优先于仓库规则；但不得绕过安全、鉴权、隐私和数据完整性边界。
- 本文件与 `.claude/CLAUDE.md` 为全局规则入口；路径匹配的 `.claude/rules/*.md` 提供更具体的执行约束。
- 规则与既有公开协议冲突时，先保持兼容并说明原因；需要破坏性变更时必须有迁移方案。
- 规则与现有局部代码风格冲突时，优先遵循规则；但不要在无关任务中做大规模格式化、重命名或结构迁移。

## 全局默认

- 与项目相关的回复、代码注释和文档默认使用简体中文；外部接口或用户明确要求除外。
- 技术栈遵循 Next.js App Router、React、TypeScript strict mode、Tailwind CSS、Supabase。
- 导入路径优先使用 `@/*` 指向 `src/`，减少深层相对路径。
- 新功能和重构必须保持模块边界清晰，避免把多个职责耦合进同一个组件、Hook、路由或服务模块。
- 页面组件负责组合 UI，API 路由负责参数解析、鉴权和响应封装，业务规则下沉到 Hook、`src/lib` 或 `src/lib/*-server.ts`。
- 浏览器端仅使用匿名公钥客户端；service role、私密环境变量、RLS 绕过逻辑仅允许出现在服务端模块中。
- 修改脚本命令、部署方式、环境变量、数据协议或外部依赖约束时，同步更新相关文档。

## `.claude` 规则映射

- 全局基础规则：读取 `.claude/rules/core.md`。
- 文档与注释：读取 `.claude/rules/documentation.md`。
- API 路由 `src/app/api/**/route.ts`：读取 `.claude/rules/api-routes.md`。
- React 组件与页面 `src/components/**/*.tsx`、`src/app/**/*.tsx`：读取 `.claude/rules/frontend-components.md`。
- Hooks 与状态管理 `src/hooks/**/*.{ts,tsx}`、`src/app/**/use*.{ts,tsx}`：读取 `.claude/rules/react-hooks.md`。
- 服务端模块 `src/lib/**/*-server.ts`、资源代理模块：读取 `.claude/rules/server-services.md`。
- 命名、文件组织、API JSON 键名和数据库命名：读取 `.claude/rules/naming-and-contracts.md`。

## 维护要求

- 不要把 `.claude` 规则全文复制到本文件；本文件只保留 Codex 执行所需的入口、摘要和映射，避免双份规则漂移。
- 修改 `.claude` 中会影响 Codex 执行方式的规则时，必须同步更新本文件的摘要或映射。
- 新增、删除、重命名顶层目录、重要业务目录或公共模块目录时，必须同步更新 `documents/layout.md`；普通组件文件、局部样式文件、测试文件变更不要求更新。
