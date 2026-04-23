# Bandori 资源 CDN 配置说明

## 目标

当前这套配置的目标是让 Bandori 活动横幅按下面这条链路工作：

- 浏览器公开 URL：`https://cdn.hhwx.org/bandori/assets/{region}/event/{assetBundleName}/images_rip/banner.png`
- R2 对象 key：`{region}/event/{assetBundleName}/images_rip/banner.png`
- 资源预抓取命令：`python tracker_job.py --test-sync-event-banners`

注意：

- 存储桶名称现在是 `cdn`
- 公开 URL 前缀仍然保持 `/bandori/assets/`
- 所以这次改动只影响存储桶配置与环境变量，不影响前端 URL 契约

## 1. HHWX Web 应用

部署环境变量请填写：

```dotenv
NEXT_PUBLIC_SITE_URL=https://hhwx.org
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key_here
SUPABASE_SECRET_KEY=your_supabase_secret_key_here
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL=https://cdn.hhwx.org
BANDORI_ASSET_CDN_BASE_URL=https://cdn.hhwx.org
```

本地开发环境 `.env.local` 请填写：

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key_here
SUPABASE_SECRET_KEY=your_supabase_secret_key_here
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL=https://cdn.hhwx.org
BANDORI_ASSET_CDN_BASE_URL=https://cdn.hhwx.org
```

## 2. HHWX Tracker

Tracker 机器上的 `.env.local` 请填写：

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your_supabase_secret_key_here

# 这里既可以填账户端点，也可以直接填 Cloudflare 面板里带 /cdn 的存储桶 S3 API URL。
BANDORI_R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
BANDORI_R2_ACCESS_KEY_ID=your_r2_access_key_id_here
BANDORI_R2_SECRET_ACCESS_KEY=your_r2_secret_access_key_here
BANDORI_R2_BUCKET=cdn
```

`BANDORI_R2_REGION` 这里没有必要填别的值。

说明：

- 对 Cloudflare R2 的 S3 兼容接口，保持 `auto` 即可
- 这个值不是存储桶页面里显示的物理位置
- 所以不要把截图里的 `WNAM` 填到这里

结论：

- 最稳妥的写法就是 `BANDORI_R2_REGION=auto`
- 甚至你不写这一行也行，因为当前代码默认值就是 `auto`

如果你更喜欢 AWS 风格变量名，也可以改成下面这组：

```dotenv
AWS_ACCESS_KEY_ID=your_r2_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_r2_secret_access_key_here
```

可选的 Bilibili Session 覆盖项：

```dotenv
# BILI_USER_ID=your_bili_user_id_here
# BILI_TOKEN=your_bili_token_here
# BILI_SIGNATURE=your_bili_signature_here
# BILI_DEVICE_ID=your_bili_device_id_here
# BILI_INITIAL_ID=your_bili_initial_request_id_here
```

### “令牌值”有没有用？

如果 Cloudflare 还额外给了一个“令牌值”，在当前实现里没有用。

原因：

- 当前代码走的是 `boto3` 的 S3 兼容接口上传对象
- 这条链路只使用 `Access Key ID` 和 `Secret Access Key`
- 那个“令牌值”更适合 Cloudflare 自己的管理 API 场景，不用于现在的对象读写同步

结论：

- 当前 `.env.local` 不需要填写“令牌值”
- 你只需要 `BANDORI_R2_ACCESS_KEY_ID` 和 `BANDORI_R2_SECRET_ACCESS_KEY`

## 3. Cloudflare R2 / CDN

### 存储桶

- 存储桶名称：`cdn`
- 桶内对象 key 继续只保存 canonical 形式，例如：
  - `cn/event/ranmoca_note/images_rip/banner.png`
  - `jp/event/ranmoca_note/images_rip/banner.png`

### S3 API 凭据

创建一组对 `cdn` 存储桶有对象读写权限的 R2 S3 API 凭据。

这里真正要用的是：

- `Access Key ID`
- `Secret Access Key`

### 自定义域

你现在仍然需要在 R2 存储桶设置里补上自定义域。

- Custom domain: `cdn.hhwx.org`

如果这一步没做，截图里的配置还不能算生产可用。

### 公共开发 URL

保持关闭即可。

- 当前生产方案不需要 `r2.dev`
- 公开入口应该只有 `cdn.hhwx.org`

### URL Rewrite 规则

在 `hhwx.org` 这个 Cloudflare Zone 里创建一条 Transform Rules > URL Rewrite 规则：

- 规则名：`bandori-assets-prefix-to-r2-key`
- 匹配表达式：

```text
http.host eq "cdn.hhwx.org" and starts_with(http.request.uri.path, "/bandori/assets/")
```

- Path rewrite expression：

```text
wildcard_replace(http.request.uri.path, "/bandori/assets/*", "/${1}")
```

这条规则的作用是：

- 浏览器继续访问 `/bandori/assets/...`
- Cloudflare 在回源到 R2 前把它改写成 `/{key}`
- 因此即使桶名从 `bandori` 改成了 `cdn`，公开 URL 也不需要变化

### 按你截图里的表单怎么填

如果你现在打开的就是截图这个界面，那就按下面逐栏填写：

1. 规则名称

```text
bandori-assets-prefix-to-r2-key
```

2. 如果传入请求匹配...

- 选择：`自定义筛选表达式`

3. 当传入请求匹配时...

```text
http.host eq "cdn.hhwx.org" and starts_with(http.request.uri.path, "/bandori/assets/")
```

4. 则 > 路径

- 选择：`重写到...`
- 把左侧下拉框从 `Static` 改成 `Dynamic`
- 右侧输入框填写：

```text
wildcard_replace(http.request.uri.path, "/bandori/assets/*", "/${1}")
```

5. 则 > 查询

- 选择：`保留`

6. 最后点击

- `部署`

你截图里当前这一步还差的关键点只有一个：

- 路径那一行左侧下拉框现在还是 `Static`，这里必须切换成 `Dynamic`，否则 `wildcard_replace(...)` 会被当成普通字符串，而不是表达式

### CORS

当前不需要额外配置 CORS。

原因：

- HHWX 当前是把这些 CDN 资源当作普通图片请求来使用。
- 跨子域的普通 `<img>` 请求不需要额外配置自定义 CORS 规则。

只有在未来你开始用 `fetch()`、canvas 像素读取或其他编程式跨域读取这些资源时，才需要再补 CORS。

### 生命周期 / Retention / 事件通知 / 按需迁移

当前都不需要额外配置。

- 生命周期：保留默认 multipart abort rule 即可
- Retention：不需要
- 事件通知：不需要，否则又会把 Workers 计费重新带回来
- 按需迁移：不需要
- R2 数据目录：不需要

### 结合你当前截图，再检查一次

截图里目前需要补的，只有两件事：

1. 给 `cdn` 这个存储桶绑定自定义域 `cdn.hhwx.org`
2. 在 Cloudflare Zone 里加上 `/bandori/assets/*` -> `/*` 的 URL Rewrite

截图里的下面这些项目目前保持现状即可：

- Public Development URL：继续关闭
- CORS：继续不配
- 对象生命周期规则：保留默认项即可
- 存储桶锁定规则：不用配
- 事件通知：不用配
- 按需迁移：不用配
- R2 数据目录：不用配

## 4. 首次验证步骤

1. 安装 tracker 依赖。

```powershell
cd D:\Workspace\hhwx-tracker
d:/Workspace/.venv/Scripts/python.exe -m pip install -r requirements.txt
```

2. 首次执行 event banner 预抓取。

```powershell
cd D:\Workspace\hhwx-tracker
d:/Workspace/.venv/Scripts/python.exe tracker_job.py --test-sync-event-banners
```

3. 在浏览器里验证对象是否已经可访问，例如：

```text
https://cdn.hhwx.org/bandori/assets/cn/event/ranmoca_note/images_rip/banner.png
```

4. 打开 eventtracker 页面，确认 banner 请求不再经过 `/_next/image`。