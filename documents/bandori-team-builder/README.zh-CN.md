# Bandori 组队计算器

English version: [README.md](README.md)

HHWX 提供两种 Bandori 组队计算器：

- **单曲组队计算器**为一首歌选择一支五人队伍，可以优化歌曲分数或已支持的活动 PT 目标；
- **组曲组队计算器**为三首顺序固定的歌曲分别选择一支五人队伍，三队共用一套区域道具；搜索正常完成时，它会证明所得方案的平均分总和最优。

两种计算器都从 HHWX 游戏档案以及 Bandori 主数据、谱面数据开始。它们共享一部分产品概念，但计分和搜索实现相互独立；不能因为其中一边发生变化，就假定另一边也会随之变化。

## 阅读顺序

了解单曲计算器，请阅读[单曲组队算法](single-song-algorithm.zh-CN.md)。

了解组曲计算器，请依次阅读：

1. [组曲规则与计分](medley-foundation.zh-CN.md)：用户可见行为、输入、卡牌参数、谱面转换和精确计分；
2. [组曲精确搜索](medley-search.zh-CN.md)：搜索空间、上界、剪枝证明、失败语义和资源模型；
3. [组曲测试与验证](medley-testing.zh-CN.md)：仓库内可运行检查，以及可选的私有真实档案回归测试。

三个 Rust crate README 提供更短的实现入口：

- [`bandori-medley-model`](../../crates/bandori-medley-model/README.md) 定义规范化的固定队计分契约；
- [`bandori-medley-reference`](../../crates/bandori-medley-reference/README.md) 是刻意保持直接、便于核对的参考计分器；
- [`bandori-medley-search`](../../crates/bandori-medley-search/README.md) 负责完整卡池的精确搜索和结果补算。

## 基本术语

- **卡牌主数据 ID**用于标识 Bandori 主数据中的一种卡牌。
- **物理卡实例**是规范卡池中一张实际可用的卡；同一实例不能同时出现在两支组曲队伍里。
- **角色不重复**指一支队伍内的五张卡必须属于五个不同角色。同一角色的不同卡仍可分别用于不同歌曲。
- **队长**是在第六次技能触发时再次发动技能的成员。组曲规范输出中的成员索引 2 是队长。
- **道具配置**是一套合法且已经持有的乐团、属性及参数区域道具组合；组曲三队共同使用搜索选出的同一套配置。
- **精确结果**表示每个合法备选都已经计算，或者被具有安全证明的上界排除。它表示搜索完整，不只是“当前分数很高”。
- **未完成结果**表示超时、取消、搜索存储不足，或内部算术／不变量错误等受控搜索中止打断了证明。界面仍可显示当前最好方案，但不能称其为最优解；输入或补算失败则属于请求错误。
- **保留候选**是搜索过程中自然遇到并完整计分的至多十个较强方案，用于结果展示和最高分补算；它们不是经过证明的全局前十名。

## 组曲数据流

```text
HHWX 档案 + Bandori 主数据 + 三张谱面 + 活动设置
    -> TypeScript 校验和规范化
    -> 带版本的 Rust 搜索输入
    -> 编译为 WebAssembly 的 Rust 精确搜索
    -> 对保留的完整方案补算详细结果
    -> Web Worker 发送进度和最终结果
    -> 组队计算器页面
```

前端提供所选档案、临时卡与卡牌偏好设置、顺序固定的三首歌、活动设置、PERFECT 率和时间限制；Worker 再取得所需主数据和谱面。前端不提供三支队伍、队长或最终道具配置；这些都由搜索产生。Web Worker 让高开销搜索离开浏览器主线程，并负责超时检查和进度发送。

## 源码位置

- `src/lib/bandori/team-builder/core/` 和 `single/` 实现单曲计算器。
- `src/lib/bandori/medley-foundation/` 把 HHWX 档案和主数据转换成规范的组曲契约。
- `crates/bandori-medley-model/` 校验固定队计分输入。
- `crates/bandori-medley-reference/` 提供直接枚举 120 种顺序的参考计算，用于核对计分。
- `crates/bandori-medley-search/` 实现生产计分、精确搜索、诊断统计和结果补算。
- `crates/bandori-medley-wasm/` 把搜索和补算能力暴露给浏览器。
- `src/app/[locale]/bandori/teambuilder/team-search-worker.ts` 加载 WebAssembly，并把结果转换为前端契约。

## 最小验证入口

以下检查只使用 Git 仓库内的文件：

```bash
npm run test:medley-foundation:source
npm run test:medley-foundation
npm run check:medley-foundation:wasm
```

如果修改了会发布到浏览器的 Rust 代码，还必须执行 `npm run build:medley-foundation:wasm`；所用 `wasm-bindgen-cli` 必须与锁定的 Rust crate 版本一致。普通 Next.js 构建只会使用已经提交的 WebAssembly 产物，不会自动重新生成或执行它；浏览器运行验证仍是另一项发布检查。

私有档案、历史成绩报告和单次基准测试输出继续保存在被 Git 忽略的 `temp/` 路径。它们用于补充公开检查，但外部协作者不依赖这些资料也应能理解产品契约并审查正确性证明。
