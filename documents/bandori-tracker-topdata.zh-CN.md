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

TOP10 当前只支持 `server=3`。日服、国际服和台服前端同步显示 TOP10 入口，但在对应后端
历史上线前不发出必然失败的请求。公开 Bestdori 兼容历史 API 继续忽略 `latest`。HTTP 历史在首次使用、
切换活动及页面恢复前台时读取，与 cutoff 历史采用同一策略；不进行 30 秒轮询。预测线、投影线和对比线
仍仅属于 cutoff。

## 第二阶段实时对接

前端已经满足互斥要求：选择 TOP10 后会停用 cutoff 数据 hook、对比线和投影线，页面中只有
TOP10 面板继续作为排名数据调用方。TOP10 的历史与实时数据组合由 `useBandoriTop10Data` 负责，
`Top10Panel` 只负责展示。

cutoff 与 TOP10 adapter 共用 `bandori-tracker-live-connection` 中协议无关的订阅生命周期：恢复登录会话、
加入 private topic、在 latest 表 SELECT 完成前缓存 Broadcast、按 revision 合并、有限重试 bootstrap、
卸载或页面长时间隐藏时断开，以及有界缓存。各 adapter 只提供 topic、event、latest 表查询、parser
和 revision 合并规则，不复制第二套连接逻辑。

TOP10 adapter 读取 `bandori_tracker_topdata_latest_snapshots`，监听事件 `topdata_snapshot` 和 topic
`bandori:topdata:cn:events:{eventId}`。当前快照只在渲染时与 HTTP 历史合并：同时间替换、更新时间追加、
更旧快照忽略；latest 用户资料覆盖相同 UID，其他历史用户继续保留。30 秒样本不得写回会话历史缓存，
页面恢复前台时只刷新稀疏 R2 历史基线，并与 live 连接保持相互独立。未登录用户继续只显示稀疏 HTTP 历史。只有
`NEXT_PUBLIC_BANDORI_TRACKER_LIVE_SOURCE=broadcast` 且恢复出的 session 对应真实用户时才启用该 adapter。

## 发布与回滚

第二阶段先应用并验证 additive Supabase migration，再部署仍兼容纯历史模式的前端，然后以 `snapshot`
模式部署 tracker；只有登录 bootstrap 与 private topic 鉴权都通过后才启用 `broadcast`。整个过程不改变
公开历史 API。

回滚只回退应用代码；保留 additive latest 表、RPC、policies、R2 对象和 tracker ledger，确保已经采集的
状态仍可恢复。
