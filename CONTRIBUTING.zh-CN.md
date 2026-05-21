# 贡献指南

English version: [CONTRIBUTING.md](CONTRIBUTING.md)

感谢你愿意改进 HHWX。

## 开发

```bash
npm install
cp .env.example .env.local
npm run dev
```

提交变更前请运行：

```bash
npm run lint
npm run build
```

## 基本准则

- 不要提交密钥和私有部署细节。
- 除非某个功能已经是英文专用界面，用户可见行为和产品文案默认保持中文。
- 除非变更明确需要迁移，不要随意改内部 route 名称、API path 或数据库标识符。
- 优先提交小而聚焦的变更；行为变化应同步更新文档。
- 修改 Supabase SQL 时，复查 row-level security、grants、`security definer` 函数和 service-role-only 假设。
- 修改 Bandori 或 Bestdori 兼容逻辑时，记录数据来源和兼容边界。

## Pull Request

- 每个 PR 聚焦一个 bug fix、功能或文档更新。
- 说明用户可见行为变化，以及需要的迁移或部署步骤。
- 有明显 UI 变化时，附截图或短录屏。
- 不要包含生成的构建产物、本地缓存、真实环境文件或私有部署脚本。
- 修改命令、环境变量、数据库对象、API 契约或外部服务假设时，同步更新 README、设置文档或 schema 文档。

## 文档语言

公开项目文档和部署说明默认使用英文。重要协作文档同时维护 `.zh-CN.md` 中文翻译。用户可见产品文案、中国区运维说明和历史中文设计笔记，在更服务目标读者时可以继续使用中文。

需要双语的主题，英文文件作为 canonical，中文翻译放在同目录并使用 `.zh-CN.md` 后缀，例如 `guide.md` 和 `guide.zh-CN.md`。

修改重要公开文档时，应在同一个变更中更新或明确复查对应中文文档。中文版本不需要逐字翻译，但必须保持相同的许可证、安全、部署和兼容边界。

## Issue 和安全问题

普通 bug、功能请求和文档问题可以使用公开 issue。安全问题请按 [SECURITY.zh-CN.md](SECURITY.zh-CN.md) 私下报告。
