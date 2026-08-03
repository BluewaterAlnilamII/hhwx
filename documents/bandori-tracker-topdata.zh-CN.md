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

Event Tracker 的所有地区空壳都用 TOP10 替换旧活动榜 T1/T10 入口；歌曲榜和月度榜继续
保留 T1/T10。TOP10 与 T20+ cutoff 面板互斥，页面任何时刻只使用一套排名协议。旧的
活动榜 `tier=1`、`tier=10` URL 和浏览器偏好不迁移，但兼容 cutoff API 仍接受这些档位。

TOP10 面板取最新样本中的 UID，只绘制这些用户的历史；UID 在某个样本中不在榜时中断曲线。
最新样本的数组顺序就是展示排名。玩家行用 `sid` 和 `strained` 显示卡牌头像，并展示纯文本
`name`、不带标签的 `uid` 和以 `P` 为单位的分数；不展示 `introduction`、`degrees` 或表示玩家等级的 `rank`。
空历史沿用通用提示“暂无该排名档位的追踪数据”。

第一阶段只有 `server=3` 历史。日服、国际服和台服前端同步显示 TOP10 入口，但在对应后端
历史上线前不发出必然失败的请求。公开 Bestdori 兼容历史 API 继续忽略 `latest`。每个活动的
HTTP 历史在同一浏览器会话中只读取一次；TOP10 面板没有 30 秒轮询、Supabase 订阅、Private
Broadcast、预测线、投影线或对比线。

## 发布与回滚

先部署 history reader，确保 manifest 不存在时返回空协议，再部署 tracker R2 writer。
启用未来调用方前，至少验证一次普通稀疏历史、一次幂等重试和公开 API 响应。

回滚只回退应用代码；保留 R2 对象和 tracker ledger，确保已经采集的历史仍可恢复。
