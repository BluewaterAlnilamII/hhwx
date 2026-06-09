# 多语言工作流

English version: [localization.md](localization.md).

HHWX 使用 `next-intl`，翻译消息存放在 `messages/<locale>/<namespace>.json`。

## 源语言

- `zh-CN` 是源语言，也是 key 结构基线。
- 其他语言必须与 `zh-CN` 保持相同的命名空间文件、key 结构和 ICU 风格占位符。
- 中文默认 URL 不加语言前缀。非默认语言使用 `/en` 等语言前缀。

## Key 规则

- 使用稳定语义 key，不使用源文案作为 key。
- 命名空间按模块归属维护：
  - `common`：共享操作和通用状态。
  - `navigation`：顶部工具栏和侧边栏标签。
  - `metadata`：页面元数据和 manifest 文案。
  - `auth`：登录、注册、找回密码、邮箱确认和认证校验。
  - `account`：账号中心、公开主页、资料、密码、邮箱和提醒页面。
  - `othello`：首页黑白棋体验文案。
  - `errors`：稳定 API `error.code` 的前端本地化映射。
- 除非同一次改动同步更新所有语言文件和调用点，否则不要重命名已有 key。

## 占位符

- 各语言必须保留完全相同的占位符。例如 `{username}`、`{status}`、`{count}`。
- 不要翻译占位符名称。
- 即使句序不同，也要保留相同数量和含义的占位符。

## 过期翻译

- 如果源文案已更新但暂时无法同步所有语言，可以保留旧译文，并在 issue 或 PR 说明中记录后续更新。
- 不要通过删除目标语言 key 表示过期；删除会破坏运行时查找和 `npm run i18n:check`。
- 优先提交小范围、按命名空间组织的翻译 PR，方便审阅者直接对比源文案和译文。

## 校验

修改消息文件后运行：

```bash
npm run i18n:check
```

该检查会以 `messages/zh-CN` 为基线比较所有语言，报告缺失/多余 key，并校验占位符一致性。

## 未来翻译平台

当前 JSON 结构保留了未来接入 Crowdin 或 Weblate 的余地。首版 i18n 不要求接入外部翻译管理平台。
