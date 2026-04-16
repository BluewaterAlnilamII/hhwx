# 全局基础规则

## 技术栈与首选库

- 前端框架使用 Next.js App Router、React、TypeScript strict mode。
- 样式优先使用 Tailwind CSS；需要可复用交互原语时优先使用 Shadcn UI / Radix UI。
- 跨页面或跨组件共享状态优先使用 Zustand；局部流程状态优先使用 React Hooks 或 useReducer。
- 数据与鉴权统一使用 Supabase；浏览器端仅使用匿名公钥客户端，service role 仅限服务端模块。
- 图表优先使用 Recharts；拖拽交互优先使用 dnd-kit；类名合并统一使用 clsx + tailwind-merge。
- 导入路径优先使用 @/* 指向 src/，减少深层相对路径。

## 常用命令

- 开发服务器：`npm run dev`
- 生产构建：`npm run build`
- 启动生产服务：`npm run start`
- 代码检查：`npm run lint`

## 架构模式

- 遵循“薄页面/薄路由，厚服务模块”的分层：页面组件负责组合 UI，API 路由负责参数解析、鉴权和响应封装，业务规则下沉到 hooks、lib 或 lib/*-server.ts。
- 纯计算逻辑、规则判断和数据转换优先写成可复用的纯函数，不要与 JSX、DOM 事件或网络请求耦合。
- 共享数据获取、缓存策略和订阅合并逻辑应集中在通用 Hook 或公共服务中，不要在多个页面重复维护相似请求代码。
- 涉及高计算量的前端逻辑，应优先考虑 Web Worker 或其他异步隔离手段，避免阻塞主线程。
- 需要缓存时，优先复用集中定义的缓存策略与缓存标签，不要在各个路由中散落硬编码 TTL、revalidate 或标签名。

## 避免的模式

- 在页面组件或 JSX 内直接堆叠大量业务规则、权限判断和数据转换。
- 在多个 API 路由中复制同一份查询、格式化或错误处理逻辑。
- 在客户端代码中直接读取 service role，或假设前端权限判断足以保护写操作。
- 为了局部修复而绕过既有服务层、缓存层或类型边界。