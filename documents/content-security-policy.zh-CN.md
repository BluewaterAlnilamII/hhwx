# Content Security Policy 观察与上线

[English](content-security-policy.md)

生产构建（`NODE_ENV=production`，包括本地 `next build` / `next start`）发送 `Content-Security-Policy`，阻断不允许的资源并继续接收违规报告。开发和测试环境发送 `Content-Security-Policy-Report-Only`，避免阻断调试与热更新。部署此修改会将生产切换到强制模式；回滚时不要把生产环境改为开发模式。

## 兼容边界

`next.config.mjs` 向非 API 响应下发所选模式的策略，不依赖请求的 `Accept`，包括页面和同源 Worker/Worklet 脚本。API 响应沿用既有响应头，资源缓存策略不变。

策略以同源为默认边界，只向外部来源授予实际消费者需要的资源权限。为 Next.js 启动和动态样式保留内联脚本/样式许可，因此这是来源白名单策略，不是 nonce/hash 严格 CSP。`'wasm-unsafe-eval'` 允许模拟器的 Signalsmith AudioWorklet 编译 WebAssembly，不会开放 JavaScript `eval`。

- 谱面模拟器引入 `pixi.js/unsafe-eval`。这个名称对应的是 Pixi **避免**动态生成 JavaScript 的兼容实现，策略并未允许 `'unsafe-eval'`。
- `connect-src data:` 用于 Pixi 图片 Worker 的能力探测；`connect-src blob:` 用于通过文件选择器保存聊天中本地待发送的图片。
- Turnstile 的精确 origin 用于脚本、iframe 和反馈连接。既有配置中的 Supabase、聊天、上传和 CDN origin 继续保留。
- 图片仅允许同源、`data:`、`blob:` 和配置中的资源 CDN。Bestdori 不是浏览器图片来源；保留的旧代理由服务端获取上游图片，再通过本站返回。字体仅允许同源：应用使用系统字体，没有内嵌 `data:` 字体依赖。
- 上述连接权限不允许 `data:` 或 `blob:` 脚本。不会仅因浏览器或扩展的未知上报域名出现在日志中，就将其加入策略。

## 报告投递与记录

页面响应同时发送 `Reporting-Endpoints: csp="/api/security/csp-report"`。其策略通过 `report-to csp` 选择此端点，并保留 `report-uri /api/security/csp-report` 兼容不支持 `report-to` 的浏览器。支持新指令的浏览器使用 `report-to` 并忽略 `report-uri`，两个指令并存不会要求重复投递。两种格式使用同一接收端。

`/_next/` 和 `/res/` 下的资源响应，包括应用的 Worker/Worklet 脚本，保留 `report-uri`，不添加 `report-to`。Chrome 156 的受控 HTTPS 验证中，两种策略都拦截了 Worker 的 `eval`，但只有 `report-uri` 配置成功投递 Worker 报告；页面的 Reporting API 投递正常。两类响应保持相同的资源限制，待验证 Worker 投递正常后再统一报告机制。新增 Worker 入口应位于这些路径下，或采用相同的报告处理。

以 `/` 开头的相对端点始终指向响应所在的源，本地化页面和 Worker 脚本也一样。Reporting API 投递需要可信上下文及端点，部署验证使用 HTTPS。浏览器可能批量或延迟发送报告，应比较归一化报告记录，不要求每次违规立即产生一个请求。浏览器选择 `report-to` 后若投递失败，保留的 `report-uri` 不会成为重试通道。

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

## 部署与验证

1. 执行 `npm run test:csp`、受影响的模拟器/聊天检查、类型检查、lint 和构建。在隔离浏览器中对生产构建强制执行候选策略，覆盖模拟器播放与变速、Worker/WASM 初始化、认证/Turnstile、聊天及图片流程。仅在 Report-Only 下浏览正常，不能证明强制策略兼容。
2. 本地验证完成后，以强制模式部署已批准的生产构建。分别使用 `Accept: text/html` 和 `Accept: */*` 检查代表性页面与 Worker 脚本返回 `Content-Security-Policy` 且没有 Report-Only 响应头。页面应携带匹配的 `Reporting-Endpoints` 映射和 `report-to`；Worker 资源应保留 `report-uri`，不含 `report-to`。记录发布版本、部署时间和各份下发策略的 SHA-256 作为基线。确认受控页面报告和 Worker 报告分别经 Reporting API 与旧格式投递到接收端，包含 `disposition: enforce` 和预期的来源标识字段。
3. 在任何日志轮转或删除前，归档旧原始日志和调查汇总。PM2 错误日志还包含其他应用错误，不能为重置 CSP 计数而直接清空。按部署时间和策略摘要筛选新观察窗口；归档/轮转只在明确授权的生产操作范围内执行。
4. 分开统计旧策略和未知策略的报告。旧标签页或缓存文档可能在部署后继续上报。如果浏览器序列化导致原始策略字符串发生变化，应核实并记录等价摘要，不能未经验证就归入当前策略。
5. 以初步 7～14 天为复查窗口；重要流程访问量不足时延长。这是操作上的复查节点，不是仅靠时间给出的安全保证。排查站内违规和来源未明的报告；预期中的浏览器/扩展报告不要求归零。

如果确认强制策略导致站内功能回归，重新部署此前已批准的 Report-Only 构建，同时排查受影响的指令和依赖。继续保留报告。本轮不实施 nonce 严格 CSP，也不移除既有的内联脚本/样式权限；确认没有消费者的许可仍可在复查后移除。

## 既有缓存

本次切换不要求清缓存、增加部署 ID、修改资源 URL 或强制刷新页面。新加载的文档仍会对命中缓存的普通脚本、样式和图片执行自身的 CSP。已经打开的文档在重新加载前保留原策略。同源 Worker 若命中旧响应缓存，其内部可能继续沿用旧策略；新文档的 `worker-src` 仍控制是否允许启动它。

接受的延迟影响强制策略覆盖进度，目前没有证据表明它造成使用故障。不可变资源可缓存一年，因此不声称所有 Worker 会立即受到新策略约束；覆盖随正常资源换版或缓存到期推进。仅在出现实际兼容问题，或明确要求立即全面强制时，重新处理缓存。
