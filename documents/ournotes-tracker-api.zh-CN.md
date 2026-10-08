# OurNotes 分数与人数 API

Web 提供已发布的活动榜历史与参加/奖励达标人数。`hhwx-ournotes-backend` 负责采集、本地历史和发布；
请求这些 API 不会查询游戏、写入存储或启动后台任务。生产者合同见后端的
`docs/cutoff-tracker.md`。

## 请求

```text
GET /api/ournotes/tracker/data?server=0&eventId=1&tier=100
GET /api/ournotes/tracker/topdata?server=0&eventId=1
GET /api/ournotes/tracker/participation
```

三者都是无需登录的公开只读接口。人数接口不接受任何查询参数，一次返回全部活动与服务器。
普通/TOP10 只接受列出的参数，每个必须且只能出现一次。
`eventId` 和 `tier` 必须是规范的正十进制安全整数，不接受前导零、符号、小数或指数。
`server` 只接受 `0`（JP）、`1`（EN）、`2`（TW）、`4`（KR）。`3` 不是榜服；
master API 的 `cn_intl` 投影不构成独立榜线来源或 tracker 别名。

普通接口的档位限定为以下 9 档：

```text
100,101,1000,5000,10000,20000,30000,50000,100000
```

当前只提供活动榜，不接受 `event`、`type`、`song`、分页或语言参数。
TOP10 包含实际返回的 T1–T11，每次采样最多 11 位不同玩家，不补缺失名次。

已退役的 1001、5001、10001、20001、30001、50001、100001 档位统一返回 HTTP 404
及 `TRACKER_TIER_NOT_SUPPORTED`，历史活动也不例外。部署收紧后的产物校验前，先迁移当前
普通历史；旧不可变 pack URL 不覆盖或删除。人数统计仍按搜索需要查询任意名次。

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

## 参加与奖励达标人数

`GET /api/ournotes/tracker/participation` 返回活动 ID → 五类字段 → 五槽数组。
槽序固定为 `[JP, EN, TW, CN, KR]`，CN 当前恒为 `null`。以下人数为示例：

```json
{
  "success": true,
  "data": {
    "1": {
      "firstCardRewardCount": [12000, 8000, 3000, null, 2000],
      "lastCardRewardCount": [9000, 5000, 2000, null, 1000],
      "allNonEventItemRewardsCount": [7000, 3000, 1500, null, 800],
      "allPointRewardsCount": [5000, 2000, 1000, null, 600],
      "participantCount": [50000, 30000, 10000, null, 7000]
    }
  }
}
```

| 字段 | 含义 |
| --- | --- |
| `firstCardRewardCount` | 达到第一次卡牌累计奖励门槛的人数，包括 MemberCard、SupportCard |
| `lastCardRewardCount` | 达到最后一档正数量 MemberCard / SupportCard 积分奖励的最高门槛，包括重复卡牌奖励 |
| `allNonEventItemRewardsCount` | 排除本期活动专用道具后，其余正数量普通积分奖励全部达标；排除条件为 Item 且 resourceId 等于详情 eventItemId |
| `allPointRewardsCount` | 达到全部普通累计奖励门槛的人数，不包括 Loop |
| `participantCount` | 该次收尾观测中活动榜收录的人数，包括实际上榜的零分记录 |

门槛从每期本服 `pointRewards` 计算，不固定分数或道具 ID；新增两项均排除 Loop。混合资源档按每条奖励筛选，筛选后为空则门槛不适用。早期包缺少新增字段时补为五个 null，保留原有三项；新发布及 HTTP 响应包含五字段。

奖励字段表示积分达标，不能证明玩家已经领取。`null` 表示未完成、未能确认或门槛不适用，
不能换算成 0；`0` 是已验证无人达到奖励门槛。空榜尚不能确认合法零人，仍返回 null。
人数依赖游戏提供唯一连续名次及榜尾省略；未上榜玩家不在计数范围，后续移除玩家也可能改变榜单。
每个非空值是 `0..2147483647` 的整数；存在时遵守全部奖励人数 ≤ 全部非活动道具奖励人数 ≤ 末卡人数 ≤ 首卡人数 ≤ 总人数；中间 null 不影响其余已知值的比较。

各服完成后分别补入自己的槽位，未完成服保留 null，不等待四服一起完成。
没有发布根时返回 `{ "success": true, "data": {} }`；真实读取故障沿上述 503 与缓存降级规则。
无筛选、分页或截断，门槛分数和内部观测时间不出现在响应中。

## 读取与缓存

三类产物位于同一个公开产物 bucket，Web 服务端通过签名 S3 请求读取，
不回退公共 CDN 或其他游戏配置。配置仅服务端使用的 `OURNOTES_R2_ENDPOINT`、
`OURNOTES_R2_ACCESS_KEY_ID`、`OURNOTES_R2_SECRET_ACCESS_KEY` 和
`OURNOTES_PUBLIC_R2_BUCKET`，凭据须有该 bucket 的读取权限。
独立的 master API 继续使用 `OURNOTES_PRIVATE_R2_BUCKET`。

```text
ournotes/trackerdata/events/{eventId}/{server}/manifest.json
ournotes/trackerdata/events/{eventId}/{server}/packs/event/{compressedSha256}.json.gz
ournotes/trackerdata/topdata/events/{eventId}/{server}/manifest.json
ournotes/trackerdata/topdata/events/{eventId}/{server}/packs/event/{compressedSha256}.json.gz
ournotes/trackerdata/participation/manifest.json
ournotes/trackerdata/participation/packs/{compressedSha256}.json.gz
```

读取器核对 schema、目标身份、精确路径、必需描述符、最近引用、压缩大小与 hash、
有界解压、semantic hash 和记录统计。hash 基于公开字段映射前的原始存储 JSON。
普通 manifest 必须包含 `packs.event`；必需描述符缺失、引用包缺失或内容非法均是故障，
不能当成空历史。普通/TOP10 的 manifest 独立提交，generation 不要求相同。
人数使用所有活动和服共用的一个根，pack 为 `{schemaVersion:1,kind:"eventParticipation",events}`。
根的 kind 同为 `eventParticipation`，包含 generation、publishedAt、pack 和 recentPackKeys；
pack 描述符包含 key、双 hash、compressedSize、jsonSize、recordCount（活动数）。
读取器校验精确 JSON 大小、活动数、固定五槽和人数关系，响应直接投影 `events`。

成功与失败都返回 `Cache-Control: no-store, max-age=0` 和
`Cloudflare-CDN-Cache-Control: no-store`。服务端 manifest 缓存 60 秒，最多 64 个目标；
三类数据共用的已验证 pack 缓存最多 16 项、估算 32 MiB。并发读取共用在途请求。
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
| 人数活动数 | 不设数量上限；遵守上述字节预算，完整返回 |

这些是读取和响应边界，不是后端历史保留上限。修改时须一起核对生产者、读取器和恢复合同。

## 验证与上线

`npm run test:ournotes-tracker` 覆盖 HTTP 处理器、解析器、包含虚构玩家的原始 Rust
发布字节、签名读取、缓存刷新、失败冷却、旧快照过期、损坏、缺失和响应投影。
人数测试使用 Rust 生成的合成计数原始压缩字节，覆盖字段、槽序、空值、hash、刷新和故障。
保留的 fixture 记录来源。集成变更执行 `npm run typecheck`、`npm run lint` 和 `npm run build`。

本地验收使用上述已核实的 R2 配置，运行 `npm run dev`，将四服 HTTP 响应与当前签名读取的
R2 manifest 及引用包逐项对照。此时不要设置 `OURNOTES_TRACKER_LOCAL_STORE_ROOT`。
离线测试可将该变量指向包含 `ournotes/` 子目录的对象目录；生产环境拒绝此覆盖。
两种模式都不调用后端命令。

生产上线前核实明确的公开 bucket 绑定及 Web 主机的签名读取权限。
部署 Web 后，逐一对照 JP/EN/TW/KR 两接口与引用包，检查错误和空结果，并确认 manifest TTL
到期后可以读到新发布。用人数全量接口核对四服槽位与全量包，
上线前在明确授权的活动和服核实榜尾与并列名次语义。回退 API 不改写后端历史、manifest 或待发布状态。
