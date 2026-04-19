# Cloudflare Cache Rules 模板

这份模板的目标不是在 Cloudflare 面板里复制一套新的 TTL，而是只让边缘判断“这个请求有没有资格缓存”。

缓存时长、浏览器 TTL、stale-while-revalidate 和 Next revalidate 继续以 [src/lib/api-cache.ts](../src/lib/api-cache.ts) 为唯一真源。Cloudflare 规则只做两件事：

1. 先把不该缓存的请求前置 bypass。
2. 再把公开只读接口统一标记为 eligible for cache，并让 Cloudflare respect origin cache headers。

## 规则顺序

顺序必须从上到下保持一致。前面的 bypass 规则一旦命中，后面的公共缓存规则就不会再误捕获写接口或带鉴权的请求。

## 面板配置注意事项

Cloudflare Cache Rules 的可视化 Expression Builder 不会显示规则语言支持的全部字段。你截图里看不到 `Request Method`，不代表不能判断请求方法，而是说明这个字段没有被 Builder 暴露出来。

官方文档给出的边界是：

1. Cache Rules 的 Builder 只列出一部分常用字段。
2. 切到 `Edit expression` 后，可以使用 Rules language 的完整字段集。
3. `http.request.method` 是合法字段，返回的是大写字符串，比如 `GET`、`HEAD`、`POST`。

因此这套模板里凡是涉及“按请求方法判断”的规则，都建议直接用 `Edit expression`，不要强行只用 Builder。

另外，路径判断这里应优先使用 `URI 路径`，也就是 `http.request.uri.path`，不要用 `URI 完整`。原因很简单：

1. `URI 完整` 会把协议、主机名和查询字符串一起带进匹配，表达式更脆弱。
2. 你的需求只是判断 `/api/` 前缀，按 path 匹配最稳定。
3. 公开 API 的缓存键是否区分查询参数，应该在 Cache Key 里单独配置，而不是混进过滤条件里。

## Rule 1: Bypass 所有 API 写请求

- 用途：避免 POST、PUT、PATCH、DELETE 这类会改数据的请求进入边缘缓存。
- 建议条件：
  - 用 Expression Editor 写：`starts_with(http.request.uri.path, "/api/") and not http.request.method in {"GET" "HEAD"}`
- 动作：Bypass cache

这条规则会覆盖像 [src/app/api/bandori/calendar/cn/schedules/route.ts](../src/app/api/bandori/calendar/cn/schedules/route.ts) 这样的同路径读写接口，先把 POST 排除掉。

## Rule 2: Bypass 所有带 Authorization 的 API 请求

- 用途：避免未来新增带 Bearer Token 的读取接口被公共 GET 规则误缓存。
- 建议条件：
  - Builder 版：
    - `URI 路径` 开头为 `/api/`
    - `请求标头` 检查 `authorization` 的存在性
  - Expression Editor 版：`starts_with(http.request.uri.path, "/api/") and len(http.request.headers["authorization"]) ge 0`
- 动作：Bypass cache

如果你想完全绕开 Builder，这里用 `len(http.request.headers["authorization"]) ge 0` 会更稳，因为 Cloudflare 的 map 字段不存在时会返回 missing value，而存在时数组长度一定大于等于 0。

## Rule 3: Bypass 实时 tracker 端点

- 用途：保证分钟级或实时刷新数据始终直达源站。
- 建议条件：
  - Builder 版：
    - `URI 路径` 等于 `/api/tracker/data`
    - 或 `URI 路径` 等于 `/api/bandori/tracker/data`
  - Expression Editor 版：`(http.request.uri.path eq "/api/tracker/data") or (http.request.uri.path eq "/api/bandori/tracker/data")`
- 动作：Bypass cache

对应当前代码：

- [src/app/api/tracker/data/route.ts](../src/app/api/tracker/data/route.ts)
- [src/app/api/bandori/tracker/data/route.ts](../src/app/api/bandori/tracker/data/route.ts)

这两个端点已经由 [src/lib/api-cache.ts](../src/lib/api-cache.ts) 下发 `no-store`，Cloudflare 侧再显式 bypass 一次，可以减少规则扩展后被其他泛化条件误命中的风险。

## Rule 4: 统一缓存公开只读 Bandori API

- 用途：把所有公开 GET/HEAD 接口纳入一条复用规则，不再为 events、songs、holidays、assets、ics 分别建规则。
- 建议条件：
  - 用 Expression Editor 写：`starts_with(http.request.uri.path, "/api/bandori/") and http.request.method in {"GET" "HEAD"}`
- 动作：Eligible for cache

推荐设置：

- Edge TTL: Use cache-control header if present, bypass cache if not
- Browser TTL: Respect origin
- Cache key query string: All query parameters
- Query string sort: On

这里的 `Cache key query string: All query parameters` 指的是当前这条 Cache Rule 里的 `缓存密钥 -> 查询字符串` 设置，不是站点外层那个旧的 `缓存级别` 页面。

可以按下面理解：

1. 当前规则内的 `缓存密钥 -> 查询字符串 -> 所有查询字符串参数`：决定这条规则命中的请求，缓存键要不要区分不同查询参数。
2. 外层的 `缓存级别 -> 标准 / 忽略查询字符串 / 没有查询字符串`：是更老的全局缓存层行为入口，不应该拿来代替这条规则的自定义 Cache Key。

对你这个场景，建议是：

1. 外层 `缓存级别` 保持 `标准`。
2. 在 Rule 4 内部的 `缓存密钥` 区域，不要开启 `忽略查询字符串`。
3. `查询字符串` 选择 `所有查询字符串参数`。
4. `对查询字符串排序` 可以保持开启。

如果 Cloudflare 当前中文界面没有把 `所有查询字符串参数` 显式高亮出来，但你已经做到下面两点，效果通常就等价于 `All query parameters`：

1. 没有开启 `忽略查询字符串`。
2. 没有配置“只保留部分参数”或“排除部分参数”的自定义例外。

这条规则会自动覆盖当前这些公开读取接口：

- [src/app/api/bandori/characters/route.ts](../src/app/api/bandori/characters/route.ts)
- [src/app/api/bandori/events/route.ts](../src/app/api/bandori/events/route.ts)
- [src/app/api/bandori/events/bonuses/route.ts](../src/app/api/bandori/events/bonuses/route.ts)
- [src/app/api/bandori/songs/route.ts](../src/app/api/bandori/songs/route.ts)
- [src/app/api/bandori/calendar/cn/schedules/route.ts](../src/app/api/bandori/calendar/cn/schedules/route.ts) 的 GET
- [src/app/api/bandori/calendar/cn/holidays/route.ts](../src/app/api/bandori/calendar/cn/holidays/route.ts)
- [src/app/api/bandori/calendar/cn/bandori-calendar-cn.ics/route.ts](../src/app/api/bandori/calendar/cn/bandori-calendar-cn.ics/route.ts)
- [src/app/api/bandori/assets/[region]/event/[bundleName]/images_rip/banner.png/route.ts](../src/app/api/bandori/assets/[region]/event/[bundleName]/images_rip/banner.png/route.ts)

实际 TTL 仍由各 route 自己的 `Cache-Control` 决定，因此：

- `events` 和 `schedules(GET)` 会继续走短缓存。
- `characters` 和 `songs` 会继续走元数据缓存。
- `holidays` 会继续走外部参考数据缓存。
- `banner.png` 会继续走长缓存。

## 未来新增接口怎么套模板

新增 API 时，优先先判断它属于下面哪一类：

1. 写接口或鉴权接口：直接落进 Rule 1 或 Rule 2，默认 bypass。
2. 实时热数据：和 tracker 一样单独前置 bypass。
3. 公开只读数据：放进公共命名空间，并在 [src/lib/api-cache.ts](../src/lib/api-cache.ts) 里选合适的 cache profile，让 Rule 4 自动接住。

如果以后出现新的公开命名空间，例如 `/api/public/` 或 `/api/catalog/`，复制 Rule 4 的模式即可，不要为单一路径追加零散规则。

## 可直接粘贴的表达式

如果你准备直接切到 `Edit expression`，下面这四条可以直接用：

### Rule 1

```text
starts_with(http.request.uri.path, "/api/") and not http.request.method in {"GET" "HEAD"}
```

### Rule 2

```text
starts_with(http.request.uri.path, "/api/") and len(http.request.headers["authorization"]) ge 0
```

### Rule 3

```text
(http.request.uri.path eq "/api/tracker/data") or (http.request.uri.path eq "/api/bandori/tracker/data")
```

### Rule 4

```text
starts_with(http.request.uri.path, "/api/bandori/") and http.request.method in {"GET" "HEAD"}
```

如果你坚持只用 Builder，不切 Editor，那么 Rule 1 和 Rule 4 很难完整表达，因为 Builder 没有把 `Request Method` 暴露出来。这种情况下，建议不要继续绕，直接用 Editor；这是 Cloudflare 官方允许且推荐的高级用法。

## 上线后检查点

1. 用 Cloudflare Cache Analytics 确认 [src/app/api/bandori/assets/[region]/event/[bundleName]/images_rip/banner.png/route.ts](../src/app/api/bandori/assets/[region]/event/[bundleName]/images_rip/banner.png/route.ts) 仍保持高 HIT。
2. 用实际请求确认 [src/app/api/tracker/data/route.ts](../src/app/api/tracker/data/route.ts) 和 [src/app/api/bandori/tracker/data/route.ts](../src/app/api/bandori/tracker/data/route.ts) 不会被缓存。
3. 用带 Authorization 的请求确认它们不会被公共 GET 规则接住。
4. 新增公开接口时，只改 [src/lib/api-cache.ts](../src/lib/api-cache.ts) 和对应 route，不要先去 Cloudflare 面板硬编码 TTL。