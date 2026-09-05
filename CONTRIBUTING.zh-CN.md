# 贡献指南

English version: [CONTRIBUTING.md](CONTRIBUTING.md)

感谢你愿意改进 HHWX。

## 开发

```bash
npm install
cp .env.example .env.local
npm run dev
```

## 验证

根据受影响的行为和风险选择检查，具体命令以当前 `package.json` 为准。下表说明各检查的适用范围，不要求每次都在本地运行全部测试；必需的 CI 检查仍然适用。

| 变更 | 适用验证 |
| --- | --- |
| 仅文档或 Agent 规则 | 检查差异、链接、规则路径与导入，以及受影响的双语内容。除非同时改变可执行行为或配置，否则不需要应用测试和构建。 |
| 消息目录或本地化配置 | 运行 `npm run i18n:check`；涉及页面显示时检查受影响的文案。 |
| 应用逻辑、类型或 API 契约 | 运行已有的专项行为或契约测试；TypeScript 行为或共享类型变化时运行 `npm run typecheck`。覆盖受影响的授权和回退路径。 |
| 页面呈现或交互 | 在浏览器检查受影响的页面和交互，包括相关视口、可访问性和运行时错误。手工检查不能替代有价值的自动回归覆盖。 |
| Supabase schema、RLS、grants 或特权 SQL | 按 [Supabase 设置](documents/supabase-setup.zh-CN.md)复查并重放受影响的迁移，以预期角色保留允许和拒绝场景的回归测试，并复查适用的 Advisors 结果。 |
| Supabase Auth、会话或 Realtime 客户端行为 | 验证受影响的流程及授权、会话切换。只有数据库行为也发生变化时，才需要重放迁移或新增 SQL 测试。 |
| 构建、依赖或应用集成 | 使用适用的 lint 和生产构建检查，将行为测试扩展到受影响的调用方。 |

先复用已有测试。只有行为缺少有效保护时才补充聚焦的回归检查，避免仅固定偶然源码形式、命名或 CSS class 的测试。保留保护安全、兼容性、可访问性以及独立计分和搜索正确性的检查。

相关代码、依赖、配置和环境等价时，可以复用已通过的本地或 CI 结果。必要检查通过后停止；只有出现相关变更、失败或未解决风险时才重跑或扩展。说明实际运行的检查及重要覆盖限制。性能结论需要适当的前后对比证据，大规模私有基准不是常规前置条件。

### Rust 与 WebAssembly

Rust 修改按受影响的 crate 和行为选择原生测试及格式、lint 检查，保留独立的计分和搜索参考检查。仅修改测试或参考实现不自动触发 WASM 检查；生产代码、依赖、配置或工具链变化影响 WASM 目标时，加入该目标的编译检查。仅修改说明文字时检查文档。以下是完整 workspace 的检查命令：

```bash
npm run format:medley-foundation
npm run lint:medley-foundation
npm run test:medley-foundation
npm run check:medley-foundation:wasm
```

发布到浏览器的 Rust 行为或其构建输入变化时，运行 `npm run build:medley-foundation:wasm`，并提交 `src/lib/bandori/medley-wasm/pkg/` 中更新后的包。按[组曲测试说明](documents/bandori-team-builder/medley-testing.zh-CN.md)验证受影响的来源规范化和浏览器交付行为。Next.js 构建不会重新生成或执行该包。必需的 CI 和发布检查仍然适用。

## 基本准则

- 不要提交密钥和私有部署细节。
- 产品文案使用当前界面的语言。以 `messages/zh-CN` 为消息目录和键的基准，同步更新受影响的其他语言目录。
- 除非变更明确需要迁移，不要随意改内部 route 名称、API path 或数据库标识符。
- 优先提交小而聚焦的变更；行为变化应同步更新文档。
- 修改 Supabase SQL 时，复查 row-level security、grants、`security definer` 函数和 service-role-only 假设。
- 修改 Bandori 或 Bestdori 兼容逻辑时，记录数据来源和兼容边界。

## Pull Request

- 每个 PR 聚焦一个 bug fix、功能或文档更新。
- 说明用户可见行为变化，以及需要的迁移或部署步骤。
- 有明显 UI 变化时，附截图或短录屏。
- 不要包含生成的构建产物、本地缓存、真实环境文件或私有部署脚本。`src/lib/bandori/medley-wasm/pkg/` 下的版本化 WebAssembly 包是明确例外，因为应用会直接导入它。
- 修改命令、环境变量、数据库对象、API 契约或外部服务假设时，同步更新 README、设置文档或 schema 文档。

## 文档语言

公开项目文档和部署说明默认使用英文。重要协作文档同时维护 `.zh-CN.md` 中文翻译。用户可见产品文案、中国区运维说明和历史中文设计笔记，在更服务目标读者时可以继续使用中文。

需要双语的主题，英文文件作为 canonical，中文翻译放在同目录并使用 `.zh-CN.md` 后缀，例如 `guide.md` 和 `guide.zh-CN.md`。

修改重要公开文档时，应在同一个变更中更新或明确复查对应中文文档。中文版本不需要逐字翻译，但必须保持相同的许可证、安全、部署和兼容边界。

## Issue 和安全问题

普通 bug、功能请求和文档问题可以使用公开 issue。安全问题请按 [SECURITY.zh-CN.md](SECURITY.zh-CN.md) 私下报告。
