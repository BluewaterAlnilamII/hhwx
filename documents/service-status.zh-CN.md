# 服务状态 API

English: [service-status.md](service-status.md).

`GET /api/status` 是公开、只读接口，提供 16 项后端服务的当前内存状态。采集随 Node 服务启动，每 60 秒执行一次，不依赖访客请求。不保存历史，不使用数据库或对象存储。

## 响应

沿用现有成功响应封装，`data.hhwxBandoriBackend` 包含以下服务字段。每类服务始终按顺序包含 `jp`、`en`、`tw`、`cn`。

| 公开字段 | 私有来源服务字段 | 含义 |
| --- | --- | --- |
| `cutoffTracker` | `scoreTracking` | 分数追踪 |
| `userFetcher` | `userFetch` | 用户抓取 |
| `masterBuilder` | `dataBuild` | 数据构建 |
| `assetsBuilder` | `assetBuild` | 资源构建，包含协调和执行结果 |

以下示例省略其他项；完整响应包含四类服务，每类四服：

```json
{
  "success": true,
  "data": {
    "hhwxBandoriBackend": {
      "cutoffTracker": {
        "jp": {
          "status": "error",
          "observedAt": "2026-09-07T06:00:00.000Z",
          "reasonCode": "update_required"
        }
      }
    }
  },
  "meta": {
    "checkedAt": "2026-09-07T06:00:02.000Z"
  }
}
```

| 字段 | 契约 |
| --- | --- |
| `status` | `operational`（正常）、`maintenance`（服务器维护中）、`error`（异常）；首次尚未确认时为 `null` |
| `reasonCode` | 可选；目前只有 `update_required`，且仅用于 `status: "error"`，显示“需要版本更新” |
| `observedAt` | 后端最近一次确认该项状态的时间，统一为 UTC；尚未确认过则为 `null` |
| `meta.checkedAt` | HHWX 最近完成一轮采集的时间，包括失败的尝试；首次采集尚未结束时为 `null` |

`observedAt` 不是最近一次业务任务成功时间。后端可确认正常空闲就绪，也可确认仍在维护或异常。读取公开 API 不会刷新这两个时间。上游原始错误、地址、凭据和诊断信息均不进入响应。

维护及服务异常仍返回 HTTP 200、`success: true`，表示状态查询成功。缺少或无效的私有配置返回 HTTP 503、`success: false`，且 `error.code` 为 `SERVICE_STATUS_NOT_CONFIGURED`。配置有效但采集器不可用时使用 `SERVICE_STATUS_UNAVAILABLE`。两者均沿用现有脱敏错误封装。

## 确认与缓存行为

- 已确认的正常、维护和异常立即生效。恢复会替换旧结果及其原因码。
- 请求失败、单项缺失或重复、无效状态、无效确认时间，都不能续期该项的确认；其余有效项正常更新。
- 连续无法确认未满 180 秒时保留上次确认值。启动时没有任何确认的项使用 `status: null`、`observedAt: null`，从开始采集起计时。
- 满 180 秒后返回 `status: "error"`，不带原因码。保留上次 `observedAt`；从未确认过则保持 `null`，不伪造后端观察时间。使用单调时钟衡量经过时间，不按失败次数或最近业务成功时间判断。
- 采集循环停止或延迟，也不能无限维持旧确认：从错过下一轮采集时起使用相同宽限期。之后一次失败的采集不会重新开始计时。

路由只读取内存并计算经过时间，不请求上游或写入存储。浏览器和 CDN 均沿用现有 no-store 策略，避免额外缓存延后状态变化。浏览器消费方应每 60 秒读取一次公开接口。

## 状态页面

HHWX 侧栏提供 `/status`（中文）和 `/en/status`（英文）入口。页面按 JP / EN / TW / CN 顺序展示四类服务，手机端每类服务下的地区采用紧凑双列布局。配色复用共用浅深主题：正常使用成功色，维护和未知使用中性色，异常（包括需要版本更新）使用危险色。每种状态均同时提供文字标签。

浏览器进入页面时及之后每 60 秒读取 `/api/status`，不使用浏览器缓存。请求不重叠，十秒超时，离开页面时取消。请求反馈统一放在页头的更新时间位置：首次读取显示“加载中”，成功后显示“最近更新”及时间或“未知”。请求失败或响应无效时在同一处显示“更新失败”，保留已有的上次时间和服务结果，不把各项服务改为异常。后台刷新保留原显示，下次读取成功后清除失败标记。页头与服务分组之间不另加加载、错误或自动刷新说明。最近更新时间来自 `meta.checkedAt`，按访客本地时区格式化。前端不重新判定后端健康状态，也不展示原始错误详情。

## 配置与部署

使用 [.env.example](../.env.example) 中的 `HHWX_USER_FETCHER_BASE_URL` 和 `HHWX_BANDORI_BACKEND_TOKEN`。用户抓取与状态采集共用后端 token。迁移期间，新名称去除首尾空白后非空时优先使用，否则兼容旧 `HHWX_USER_FETCHER_TOKEN`。改名时保留现有 token 值，待所有消费者支持新名称后删除旧配置。地址为 HTTP(S) base，可带路径前缀，不包含内嵌凭据、查询参数或 fragment。采集器追加 `/internal/service-health`，仅通过服务端 Bearer 请求头发送 token。拒绝重定向。每次请求及响应体读取共用五秒超时，响应上限 64 KiB；不立即重试，也不重叠采集。

私有响应为 `{ schemaVersion: 1, components: [...] }`。每项通过 `service`、`server` 标识；已确认项包含 `reportState: "confirmed"`、受支持状态和 UTC `observedAt`。未确认项不能清除旧故障。未知私有字段丢弃。HHWX 将这些既有汇报分组，不改变私有 API。

先部署兼容的后端健康接口，再部署 HHWX。确认配置的 base 除现有 user-fetcher 路径外，也提供汇总健康路径；仅在连接经过代理时更新相应代理路由。私有 token 不交给浏览器。公开仓库无需记录私有部署地址。

`src/instrumentation.ts` 使用 Next.js 的 Node 启动钩子，在 `next dev` 和 `next start` 中启动采集；构建进程及 Edge 执行不会启动。未配置时网站其他功能继续运行，启动时输出配置提示，本接口明确返回 503。更改配置后重启 Node 服务。

采集器及缓存属于单个 Node 进程。单个常驻 Node 实例不需要额外调度器；多个实例会各自采集并维护缓存。会被冻结的 serverless 实例无法保证后台每 60 秒执行。重启会丢弃健康缓存，重新进入初始宽限期。汇总还依赖私有 user-fetcher 进程；该进程不可达时，全部 16 项都将无法确认。

## 验证

运行 `npm run test:service-status`、`npm run i18n:check`、`npm run typecheck`、`npm run lint` 和 `npm run build`。专项测试使用模拟汇报和可控时钟，不请求游戏服务器。页面验证覆盖中英文、浅深主题、桌面与手机布局，以及初始读取、全部状态文案、刷新失败与恢复。普通异常的更多解释留待后续讨论。
