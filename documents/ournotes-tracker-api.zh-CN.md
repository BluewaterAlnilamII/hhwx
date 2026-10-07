# OurNotes 分数 API

Web 提供已发布的活动榜历史。`hhwx-ournotes-backend` 负责采集、本地历史和发布；
请求这些 API 不会查询游戏、写入存储或启动后台任务。生产者合同见后端的
`docs/cutoff-tracker.md`。

## 请求

```text
GET /api/ournotes/tracker/data?server=0&eventId=1&tier=100
GET /api/ournotes/tracker/topdata?server=0&eventId=1
```

两者都是无需登录的公开只读接口。只接受列出的参数，每个必须且只能出现一次。
`eventId` 和 `tier` 必须是规范的正十进制安全整数，不接受前导零、符号、小数或指数。
`server` 只接受 `0`（JP）、`1`（EN）、`2`（TW）、`4`（KR）。`3` 不是榜服；
master API 的 `cn_intl` 投影不构成独立榜线来源或 tracker 别名。

普通接口的档位限定为以下 16 档：

```text
100,101,1000,1001,5000,5001,10000,10001,
20000,20001,30000,30001,50000,50001,100000,100001
```

当前只提供活动榜，不接受 `event`、`type`、`song`、分页或语言参数。
TOP10 包含实际返回的 T1–T11，每次采样最多 11 位不同玩家，不补缺失名次。

## 响应

成功统一返回 `{ "success": true, "data": ... }`，没有 `meta`，不使用 Bandori
的兼容封装。以下均为示例值。

普通历史：

```json
{
  "success": true,
  "data": {
    "cutoffs": [
      { "time": 1791288000000, "value": 123456 },
      { "time": 1791289800000, "value": 128900 }
    ]
  }
}
```

积分点按 Unix 毫秒时间升序排列，`value` 是采集积分，包含合法的零值。
单次响应返回请求档位最早的 5,000 个点；响应上限不删除存储中的历史。

TOP10 历史（以一名玩家展示全部字段）：

```json
{
  "success": true,
  "data": {
    "points": [
      { "time": 1791288000000, "id": "player-a", "value": 1500000 },
      { "time": 1791289800000, "id": "player-a", "value": 1550000 }
    ],
    "users": [
      {
        "id": "player-a",
        "profileId": 900001,
        "name": "玩家甲",
        "rankExp": 4320900,
        "lastUpdatedAt": 1791289700,
        "favoriteMemberCardMasterId": 53
      }
    ]
  }
}
```

`points` 保留采样时间升序和同一采样内的后端排名次序，包含同分玩家的原次序。
不推断缺失位置或增加排名字段。`users` 按字符串 `id` 排序，恰好覆盖历史引用玩家，
每位玩家保存最新已发布资料，不为每个历史采样复制一份资料。

| 公开字段 | 发布字段 | 含义 |
| --- | --- | --- |
| `id` | `id` | 字符串身份，供积分点引用 |
| `profileId` | `profile_id` | 独立整数资料 ID，不由 `id` 转换 |
| `name` | `name` | 姓名，允许空字符串 |
| `rankExp` | `rank_exp` | 整数经验，不换算为玩家等级 |
| `lastUpdatedAt` | `last_updated_at` | 游戏资料时间，原样保留、不换算单位，不是采样时间 |
| `favoriteMemberCardMasterId` | `favorite_member_card_master_id` | 整数成员卡 master ID，允许零 |

公开数字必须是 JavaScript 安全整数；产物中的非法或超范围数字导致读取失败，
不会将身份或积分静默取整。存储中的 snake_case 字段只在 Web 服务边界映射。
不公开卡组或其他资料字段。后端仍执行收尾采样，但积分点和 manifest 都没有收尾标记。

manifest 不存在，或有效普通包中没有请求的受支持档位时，返回 HTTP 200 与
`{ "success": true, "data": { "cutoffs": [] } }`。TOP10 无历史时返回
`{ "success": true, "data": { "points": [], "users": [] } }`。
空结果仅表示没有已发布历史，不证明活动不存在。

失败统一使用 `{ "success": false, "error": { "code", "message", "details"? } }`：

| HTTP 状态 | Code | 含义 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | 参数缺失、重复、未知或格式错误，包括 `server=3` |
| 404 | `TRACKER_TIER_NOT_SUPPORTED` | 档位是合法正整数，但不在支持集合内 |
| 503 | `TRACKER_HISTORY_UNAVAILABLE` | 配置、传输或产物故障，且没有可用的已验证历史 |
| 500 | `INTERNAL_SERVER_ERROR` | 未预期的处理错误 |

错误不公开凭据、存储地址或内部异常。存储故障示例：

```json
{
  "success": false,
  "error": {
    "code": "TRACKER_HISTORY_UNAVAILABLE",
    "message": "Tracker history is temporarily unavailable."
  }
}
```

## 读取与缓存

两类历史位于同一个公开产物 bucket，Web 服务端通过签名 S3 请求读取，
不回退公共 CDN 或其他游戏配置。配置仅服务端使用的 `OURNOTES_R2_ENDPOINT`、
`OURNOTES_R2_ACCESS_KEY_ID`、`OURNOTES_R2_SECRET_ACCESS_KEY` 和
`OURNOTES_PUBLIC_R2_BUCKET`，凭据须有该 bucket 的读取权限。
独立的 master API 继续使用 `OURNOTES_PRIVATE_R2_BUCKET`。

```text
ournotes/trackerdata/events/{eventId}/{server}/manifest.json
ournotes/trackerdata/events/{eventId}/{server}/packs/event/{compressedSha256}.json.gz
ournotes/trackerdata/topdata/events/{eventId}/{server}/manifest.json
ournotes/trackerdata/topdata/events/{eventId}/{server}/packs/event/{compressedSha256}.json.gz
```

读取器核对 schema、目标身份、精确路径、必需描述符、最近引用、压缩大小与 hash、
有界解压、semantic hash 和记录统计。hash 基于公开字段映射前的原始存储 JSON。
普通 manifest 必须包含 `packs.event`；必需描述符缺失、引用包缺失或内容非法均是故障，
不能当成空历史。两个 manifest 独立提交，generation 不要求相同。

成功与失败都返回 `Cache-Control: no-store, max-age=0` 和
`Cloudflare-CDN-Cache-Control: no-store`。服务端 manifest 缓存 60 秒，最多 64 个目标；
两类数据共用的已验证 pack 缓存最多 16 项、估算 32 MiB。并发读取共用在途请求。
单次读取期限 3 秒，失败冷却 15 秒。

读取失败时，可复用仍驻留在缓存、距离最后一次完整验证成功不超过六小时的 pack。
所有目标遵守这一时限，没有收尾历史例外。根不存在会清除旧成功状态。
generation、发布时间和降级读取只用于内部诊断，不进入公开响应。

| 读取边界 | 数值 |
| --- | --- |
| manifest 大小 | 64 KiB |
| 压缩包大小 | 2 MiB |
| 解压 JSON 大小 | 16 MiB |
| 完整普通包记录数 | 200,000 |
| 普通响应行数 | 5,000 |
| TOP10 points / users | 各 20,000，完整返回 |

这些是读取和响应边界，不是后端历史保留上限。修改时须一起核对生产者、读取器和恢复合同。

## 验证与上线

`npm run test:ournotes-tracker` 覆盖 HTTP 处理器、解析器、包含虚构玩家的原始 Rust
发布字节、签名读取、缓存刷新、失败冷却、旧快照过期、损坏、缺失和响应投影。
保留的 fixture 记录来源。集成变更执行 `npm run typecheck`、`npm run lint` 和 `npm run build`。

本地验收使用上述已核实的 R2 配置，运行 `npm run dev`，将四服 HTTP 响应与当前签名读取的
R2 manifest 及引用包逐项对照。此时不要设置 `OURNOTES_TRACKER_LOCAL_STORE_ROOT`。
离线测试可将该变量指向包含 `ournotes/` 子目录的对象目录；生产环境拒绝此覆盖。
两种模式都不调用后端命令。

生产上线前核实明确的公开 bucket 绑定及 Web 主机的签名读取权限。
部署 Web 后，逐一对照 JP/EN/TW/KR 两接口与引用包，检查错误和空结果，并确认 manifest TTL
到期后可以读到新发布。回退 API 不改写后端历史、manifest 或待发布状态。
