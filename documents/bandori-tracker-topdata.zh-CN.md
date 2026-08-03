# Bandori 活动榜 TOP10 后端与 API

本文定义首期国服活动 TOP10 后端。公开历史 API 保持 Bestdori `eventtop` 成功响应的 JSON
结构，便于现有图表调用者直接复用；错误仍由 HHWX 明确表达。这是已登记的兼容适配器，
不是其他新 API 的模板。

## 公开历史 API

```text
GET /api/bandori/tracker/topdata?server=3&event=318&type=event
```

- 必须提供 `server=3`；`event` 必须是 `1..2147483647` 的整数。
- `type` 缺省为 `event`，首期不支持其他类型。
- 只读取 `server`、`event`、`type`。`interval`、`latest`、`mid` 和其他参数一律忽略；
  即使传入 `latest=1`，也仍返回完整稀疏历史。
- 成功体精确为 `{ "points": [...], "users": [...] }`。活动尚无 manifest 时返回
  `200 + { "points": [], "users": [] }`。
- 合同参数错误返回 `400 INVALID_REQUEST`；历史不可用、已引用 pack 缺失、损坏、超限或
  超时返回 `503 TRACKER_HISTORY_UNAVAILABLE`；未知异常返回 `500 INTERNAL_SERVER_ERROR`。
  错误体使用 `{ success: false, error }`。
- 所有响应都是动态响应，并沿用共享 no-store 策略。

point 只包含 `time`、`uid`、`value`；user 只包含 `uid`、`name`、`introduction`、
`rank`、`sid`、`strained`、`degrees`。原始卡组、卡牌和编队字段不存储也不返回。
用户名和签名按 Unicode 文本原样保存：BBCode 不转换，真实换行保持真实换行，文本中的
反斜杠加 `n` 也保持为两个普通字符。

## 私有历史存储

tracker 将不可变 gzip pack 和条件更新 manifest 写入 `BANDORI_PRIVATE_R2_BUCKET`：

```text
bandori/trackerdata/topdata/events/{eventId}/cn/manifest.json
bandori/trackerdata/topdata/events/{eventId}/cn/packs/event/{sha256}.json.gz
```

Web API 复用共享的私有 S3/R2 reader，不读取 `cdn.hhwx.org`，运行时也不回退 Bestdori。
本地开发可设置 `BANDORI_TOPDATA_HISTORY_LOCAL_STORE_ROOT`；生产环境拒绝该覆盖。

reader 限制 manifest 64 KiB、gzip pack 2 MiB、解压后 16 MiB、points/users 各 20,000，
并验证 SHA-256、descriptor 计数以及按时间分组的每份 1–10 人连续榜位样本。0 人榜单不发布
历史 snapshot 或 manifest。manifest TTL 为 60 秒并合并并发请求；manifest 与 pack 合计预算
3 秒，失败 cooldown 为 15 秒。已验证的活动中数据可在失败时 stale 6 小时；含 final 样本的
数据可在有界缓存存活期间长期 stale。

## 前端集成边界

本期不增加面板、hook 或视觉设计。后续前端把旧 T1/T10 入口统一为 TOP10，并让 TOP10 与
T20+ cutoff 面板互斥，任何时刻只使用一套排名协议。公开 Bestdori 兼容历史 API 必须继续
忽略 `latest`；HTTP 历史只在首次加载或切换活动时读取。30 秒 latest、Supabase、Private
Broadcast 和前端面板契约明确延后到下一阶段。

## 发布与回滚

先部署 history reader，确保 manifest 不存在时返回空协议，再部署 tracker R2 writer。
启用未来调用方前，至少验证一次普通稀疏历史、一次幂等重试和公开 API 响应。

回滚只回退应用代码；保留 R2 对象和 tracker ledger，确保已经采集的历史仍可恢复。
