# 项目文件结构说明

```
hhwx/
├── .claude/                    # Claude Code 规则目录
│   ├── CLAUDE.md               # Claude Code 项目级入口规则
│   └── rules/
│       ├── core.md             # 全局基础规则（技术栈、架构模式、禁忌）
│       ├── naming-and-contracts.md # 命名、JSON 键名与数据库命名规范
│       ├── documentation.md    # 文档与注释规则
│       ├── frontend-components.md # React 组件路径规则
│       ├── react-hooks.md      # Hooks 与状态管理路径规则
│       ├── api-routes.md       # Next.js API 路由路径规则
│       └── server-services.md  # 服务端模块与数据库边界路径规则
├── .agents/                    # Agent 配置
│   └── rules/
│       └── hhwx.md             # 项目开发规范
├── documents/                  # 项目文档
│   ├── prd.md                  # 产品需求文档
│   └── layout.md               # 文件结构说明（本文件）
├── public/                     # 静态资源
│   ├── favicon.ico             # 浏览器标签页 favicon 主入口
│   ├── favicon/                # 安装态/PWA 图标固定尺寸资源
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   └── res/                    # 前端直接访问的角色头像和图标资源
│       ├── kokoro.png
│       ├── kaoru.png
│       ├── hagumi.png
│       ├── kanon.png
│       ├── michelle.png
│       └── band_3.svg          # 飘落动画图案
├── res/                        # 设计源资源；站点图标运行时入口已迁到 src/app 与 public/favicon
│   ├── band_3.png              # 飘落图案源 PNG
│   ├── band_3.svg              # 飘落图案源 SVG
│   ├── kokoro.png              # 角色头像源图
│   ├── kaoru.png
│   ├── hagumi.png
│   ├── kanon.png
│   └── michelle.png
├── src/
│   ├── app/                    # Next.js App Router 页面
│   │   ├── layout.tsx          # 根布局（字体、元数据）
│   │   ├── manifest.ts         # Web App Manifest（应用名、主题色、安装图标）
│   │   ├── page.tsx            # 首页（角色选择/游戏页面路由、续局对话框）
│   │   ├── globals.css         # 全局样式（动画、棋盘、气泡等）
│   │   ├── page.module.css     # 页面模块样式（未使用，Next.js 生成）
│   │   ├── icon.png            # App Router 通用站点图标
│   │   ├── apple-icon.png      # iOS 主屏图标
│   │   ├── api/
│   │   │   ├── bandori/        # Bandori 游戏相关 API 主命名空间
│   │   │   │   ├── characters/
│   │   │   │   │   └── route.ts    # 读取角色目录
│   │   │   │   ├── assets/
│   │   │   │   │   └── [region]/
│   │   │   │   │       └── event/
│   │   │   │   │           └── [bundleName]/
│   │   │   │   │               └── images_rip/
│   │   │   │   │                   └── banner.png/
│   │   │   │   │                       └── route.ts # 以接近 Bestdori 原始路径的方式同域代理活动横幅
│   │   │   │   ├── events/
│   │   │   │   │   ├── route.ts    # 读取结构化活动目录
│   │   │   │   │   ├── bonuses/
│   │   │   │   │   │   └── route.ts # 读取活动加成，可按 event 查询（主路径）
│   │   │   │   ├── songs/
│   │   │   │   │   └── route.ts    # 读取 challenge 歌曲标题
│   │   │   │   ├── tracker/
│   │   │   │   │   └── data/
│   │   │   │   │       └── route.ts # 读取 tracker 追踪数据主入口
│   │   │   │   └── calendar/
│   │   │   │       └── cn/
│   │   │   │           ├── holidays/
│   │   │   │           │   └── route.ts # 读取中国大陆休假日/调休数据
│   │   │   │           ├── schedules/
│   │   │   │           │   └── route.ts # 薄路由：读取/保存国服活动排期，实际逻辑下沉到服务层
│   │   │   │           └── bandori-calendar-cn.ics/
│   │   │   │               └── route.ts # 生成可订阅的国服活动 ICS
│   │   │   └── tracker/
│   │   │       └── data/
│   │   │           └── route.ts    # tracker 旧兼容入口，内部复用 Bandori 主处理器
│   │   └── bandori/
│   │       ├── eventtracker/   # Bestdori 活动追踪页面
│   │       │   ├── layout.tsx          # 页面布局（元数据）
│   │       │   ├── page.tsx            # 主页面组件（UI 渲染层）
│   │       │   ├── FixedYAxis.tsx      # 图表固定纵坐标组件（与主图共享同一套刻度数据）
│   │       │   ├── types.ts            # 共享 TypeScript 类型定义
│   │       │   ├── constants.ts        # 档位常量、Cookie 读写工具
│   │       │   ├── useProjectionPreference.ts # 投影显示偏好持久化 Hook
│   │       │   ├── useTrackerData.ts   # 数据获取层（HTTP + Supabase 实时订阅）
│   │       │   ├── useChartData.ts     # 数据派生层（速度计算、投影、Y 轴刻度）
│   │       │   └── TrackerTooltip.tsx  # 图表 Tooltip 组件
│   │       └── calendar/       # 国服活动日历页面
│   │           ├── layout.tsx          # 页面布局（元数据）
│   │           ├── page.tsx            # 主页面（日历视图 + 订阅 + 编辑入口）
│   │           ├── CalendarGrid.tsx    # 月视图日历网格组件（支持纯色/条纹活动横条）
│   │           ├── chinaMainlandHolidayCalendar.ts # 中国大陆休假日/调休判断与本地回退数据
│   │           ├── EventEditor.tsx     # 活动日程编辑面板（仅未来活动排期编辑）
│   │           ├── options.ts          # 订阅乐队筛选选项
│   │           └── useCalendarData.ts  # 数据获取/权限/角色解析/编辑提交 Hooks
│   ├── components/             # React 组件
│   │   ├── AuthModal.tsx       # 登录/注册弹窗
│   │   ├── Board.tsx           # 8x8 黑白棋盘组件
│   │   ├── CharacterAvatar.tsx # 角色立绘/占位组件
│   │   ├── CharacterSelect.tsx # 角色选择界面
│   │   ├── CommentSection.tsx  # 游戏评论区
│   │   ├── FallingPatterns.tsx # 背景飘落图案动画
│   │   ├── GamePage.tsx        # 游戏主页面（棋盘+角色+AI流程编排）
│   │   ├── ResultPanel.tsx     # 游戏结算面板
│   │   ├── SpeechBubble.tsx    # 对话气泡组件
│   │   └── Toolbar.tsx         # 顶部工具栏（登录/账号管理）
│   ├── hooks/                  # 自定义 Hooks
│   │   ├── useCachedFetch.ts   # 通用 HTTP 缓存 Hook（支持 merge 策略防止 WS 数据回退）
│   │   └── useOthelloGame.ts   # 黑白棋游戏状态管理（useReducer + localStorage）
│   ├── lib/                    # 工具库和核心逻辑
│   │   ├── api-cache.ts        # 统一定义 API、订阅源与静态资源代理的缓存 profile
│   │   ├── api-contracts.ts    # success/data JSON envelope 类型与错误解析辅助
│   │   ├── api-response.ts     # API 路由统一 success/error 响应构造器
│   │   ├── ai/                 # AI 策略模块（每个角色独立文件）
│   │   │   ├── types.ts        # AI 策略通用类型定义
│   │   │   ├── kokoro.ts       # Kokoro AI：高强度，随机+角位锁定
│   │   │   ├── kaoru.ts        # Kaoru AI：最高强度，Minimax + Alpha-Beta
│   │   │   ├── hagumi.ts       # Hagumi AI：最低强度，贪心策略
│   │   │   ├── kanon.ts        # Kanon AI：中等强度，犯迷糊+角位必抢
│   │   │   └── michelle.ts     # Michelle AI：动态强度，放水机制
│   │   ├── bandori-asset-proxy.ts # Bestdori 资源路径拼装与安全校验
│   │   ├── bandori-event-banner-proxy.ts # 活动横幅共享代理逻辑（供原始语义路径复用）
│   │   ├── characters.ts       # 角色数据定义（台词、思考时间等）
│   │   ├── bandori-events-server.ts # Bandori 活动/角色聚合与 DTO 转换服务
│   │   ├── bandori-schedule-server.ts # 国服排期服务：鉴权后编辑校验、冲突检测与写入
│   │   ├── bandori-tracker-server.ts # tracker data 共享服务端处理器（新旧路由共用）
│   │   ├── calendar-character-service.ts # 日历角色解析/标题/颜色/角色筛选统一服务
│   │   ├── othello.ts          # 黑白棋核心规则（纯函数、位置权重矩阵）
│   │   ├── supabase.ts         # Supabase 浏览器端客户端初始化
│   │   ├── supabase-server.ts  # Supabase 服务端客户端初始化（API 路由使用 service role）
│   │   └── utils.ts            # 通用工具函数（cn 类名合并）
│   └── store/                  # Zustand 全局状态
│       └── useGameStore.ts     # 游戏全局状态（角色选择、用户认证）
├── components.json             # Shadcn UI 配置
├── tailwind.config.ts          # Tailwind CSS 配置
├── tsconfig.json               # TypeScript 配置
├── next.config.mjs             # Next.js 配置
├── postcss.config.mjs          # PostCSS 配置
├── eslint.config.mjs           # ESLint 配置
└── package.json                # 项目依赖和脚本
```
