# 项目文件结构说明

```
hhwx/
├── .agents/                    # Agent 配置
│   └── rules/
│       └── hhwx.md             # 项目开发规范
├── documents/                  # 项目文档
│   ├── PRD.md                  # 产品需求文档
│   └── layout.md               # 文件结构说明（本文件）
├── public/                     # 静态资源
│   └── res/                    # 角色头像和图标资源
│       ├── kokoro.png
│       ├── kaoru.png
│       ├── hagumi.png
│       ├── kanon.png
│       ├── michelle.png
│       └── band_3.svg          # 飘落动画图案
├── src/
│   ├── app/                    # Next.js App Router 页面
│   │   ├── layout.tsx          # 根布局（字体、元数据）
│   │   ├── page.tsx            # 首页（角色选择/游戏页面路由、续局对话框）
│   │   ├── globals.css         # 全局样式（动画、棋盘、气泡等）
│   │   ├── page.module.css     # 页面模块样式（未使用，Next.js 生成）
│   │   ├── favicon.ico         # 站点图标
│   │   └── bandori/
│   │       ├── eventtracker/   # Bestdori 活动追踪页面
│   │       │   ├── layout.tsx          # 页面布局（元数据）
│   │       │   ├── page.tsx            # 主页面组件（UI 渲染层）
│   │       │   ├── FixedYAxis.tsx      # 图表固定纵坐标组件（与主图共享同一套刻度数据）
│   │       │   ├── types.ts            # 共享 TypeScript 类型定义
│   │       │   ├── constants.ts        # 档位常量、Cookie 读写工具
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
│   │       └── api/
│   │           └── calendar/           # 国服活动日历 API
│   │               ├── check-role/
│   │               │   └── route.ts    # 检查当前登录用户是否具备日历编辑权限
│   │               ├── events/
│   │               │   └── route.ts    # 读取/保存活动排期字段
│   │               ├── holiday-days/
│   │               │   └── route.ts    # 读取中国大陆休假日/调休数据（优先 iCloud，失败时回退本地表）
│   │               └── ics/
│   │                   └── route.ts    # 生成可订阅的 ICS 日历数据
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
│   │   ├── ai/                 # AI 策略模块（每个角色独立文件）
│   │   │   ├── types.ts        # AI 策略通用类型定义
│   │   │   ├── kokoro.ts       # Kokoro AI：高强度，随机+角位锁定
│   │   │   ├── kaoru.ts        # Kaoru AI：最高强度，Minimax + Alpha-Beta
│   │   │   ├── hagumi.ts       # Hagumi AI：最低强度，贪心策略
│   │   │   ├── kanon.ts        # Kanon AI：中等强度，犯迷糊+角位必抢
│   │   │   └── michelle.ts     # Michelle AI：动态强度，放水机制
│   │   ├── characters.ts       # 角色数据定义（台词、思考时间等）
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
├── postcss.config.js           # PostCSS 配置
├── eslint.config.mjs           # ESLint 配置
└── package.json                # 项目依赖和脚本
```
