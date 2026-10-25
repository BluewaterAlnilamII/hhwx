# Content Security Policy 观察与上线

[English](content-security-policy.md)

应用当前发送 `Content-Security-Policy-Report-Only`，记录违规但不阻断资源。在兼容性观察期保持此模式；启用强制拦截属于独立的部署决定。

## 兼容边界

`next.config.mjs` 向非 API 响应下发 Report-Only 策略，不再依赖请求的 `Accept`，包括页面和同源 Worker/Worklet 脚本。API 响应沿用既有响应头，资源缓存策略不变。

- 谱面模拟器引入 `pixi.js/unsafe-eval`。这个名称对应的是 Pixi **避免**动态生成 JavaScript 的兼容实现，策略并未允许 `'unsafe-eval'`。
- `connect-src data:` 用于 Pixi 图片 Worker 的能力探测；`connect-src blob:` 用于通过文件选择器保存聊天中本地待发送的图片。
- Turnstile 的精确 origin 用于脚本、iframe 和反馈连接。既有配置中的 Supabase、聊天、上传和 CDN origin 继续保留。
- 上述连接权限不允许 `data:` 或 `blob:` 脚本。不会仅因浏览器或扩展的未知上报域名出现在日志中，就将其加入策略。

## 报告记录

`POST /api/security/csp-report` 接受传统 CSP 报告和 Reporting API 格式，返回 `204` 与 `no-store`，并在应用 stderr 中以 `CSP report received:` 为前缀写入一行 JSON 数组。使用 PM2 时，这些记录混在应用错误日志里；此路由没有独立数据库或日志保留机制。

每条归一化报告包含：

| 字段 | 含义 |
| --- | --- |
| `receivedAt` | 服务端收到报告的 UTC ISO 时间，不是浏览器最初遇到违规的时间。 |
| `originalPolicyHash` | 浏览器提供的 `original-policy` / `originalPolicy` 原始字符串按 UTF-8 计算的 SHA-256；缺失时为 `null`。它标识所报告的策略内容，不代表应用构建版本或经过认证的客户端。 |
| `source`、指令、`disposition` | 报告格式、涉及的资源规则和浏览器报告的模式。 |
| `documentUri`、`blockedUri`、`sourceFile` | HTTP(S)/WebSocket URL 去掉内嵌凭据、查询参数和片段；其他 URL 仅保留 scheme 名称；保留 `inline`、`eval`、`wasm-eval` 等标记。路径仍可能包含标识符，因此日志仍属于私有运维数据。 |
| 行列号、状态码、浏览器标识 | 可用的诊断上下文。 |
| `sample` | 始终为 `null`，不保存脚本片段内容。 |

不记录原始策略文本和不支持格式的原始请求体。不支持格式的诊断也包含接收时间。报告是未经信任的客户端输入，不能证明具体厂商的行为或用户操作成功。

## 开始新的观察期

1. 执行 `npm run test:csp`、受影响的模拟器/聊天检查、类型检查、lint 和构建。在隔离浏览器中对生产构建强制执行候选策略，覆盖模拟器播放与变速、Worker/WASM 初始化、认证/Turnstile、聊天及图片流程。仅在 Report-Only 下浏览正常，不能证明强制策略兼容。
2. 以 **Report-Only** 模式部署修复版本。分别使用 `Accept: text/html` 和 `Accept: */*` 检查代表性页面的实际响应头，记录发布版本、部署时间和下发策略的 SHA-256 作为基线。确认一条受控报告可到达接收端，并包含预期的来源标识字段。
3. 在任何日志轮转或删除前，归档旧原始日志和调查汇总。PM2 错误日志还包含其他应用错误，不能为重置 CSP 计数而直接清空。按部署时间和策略摘要筛选新观察窗口；归档/轮转只在明确授权的生产操作范围内执行。
4. 分开统计旧策略和未知策略的报告。旧标签页或缓存文档可能在部署后继续上报。如果浏览器序列化导致原始策略字符串发生变化，应核实并记录等价摘要，不能未经验证就归入当前策略。
5. 以初步 7～14 天为复查窗口；重要流程访问量不足时延长。这是操作上的复查节点，不是仅靠时间给出的安全保证。排查站内违规和来源未明的报告；预期中的浏览器/扩展报告不要求归零。

只有关键流程在强制模式下通过，且新策略报告未发现无法解释的站内故障后，才启用强制拦截。切换后继续接收报告，并保留部署回退到 Report-Only 的路径。本轮不实施 nonce 严格 CSP，也不移除既有的内联脚本/样式权限。
