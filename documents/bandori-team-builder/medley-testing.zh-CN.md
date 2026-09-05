# Bandori 组曲测试与验证

English version: [medley-testing.md](medley-testing.md)

## 1. 测试需要证明什么

组曲计算器有三个相互独立的正确性问题：

1. **输入与计分：**HHWX 档案和当前主数据、谱面能否得到预期的卡牌参数、技能、音符和精确队伍分数？
2. **搜索完整性：**优化搜索能否得到与完整穷举相同的最优解，每次剪枝能否由安全上界证明？
3. **浏览器交付：**Web Worker 是否运行当前 WebAssembly 产物，并保留进度、超时、未完成结果和详细补算语义？

任何单次基准测试都不能同时回答这三个问题。分数更高不代表计分正确，因为多算也会抬高结果；达到历史分数不代表最优，因为历史搜索本身可能没有完成；运行很快也不能证明上界安全。

## 2. 仓库内可运行检查

安装仓库依赖和 Rust 工具链后，任何协作者都能只使用 Git 跟踪文件运行以下检查。按受影响的正确性边界选择检查，不要求每次修改都运行清单中的全部命令。仅修改 Rust 测试或参考实现不自动触发 WASM 检查，仅修改说明文字时检查文档。

### TypeScript 来源规范化

```bash
npm run test:medley-foundation:source
```

这组 Node 专项测试覆盖档案解码、角色加成、卡牌参数、区域道具、活动参数、技能规范化、谱面转换、固定队计分、搜索输入构造和前端来源契约。样本刻意保持很小，以便在不运行大规模搜索的情况下定位规则错误。

### Rust 格式、静态检查与测试

```bash
npm run format:medley-foundation
npm run lint:medley-foundation
npm run test:medley-foundation
npm run check:medley-foundation:wasm
```

`test:medley-foundation` 运行锁定依赖的完整 Rust workspace 测试。关键证据包括：

- 固定输入 JSON 校验；
- 生产计分器与直接枚举 120 种顺序的参考计分器一致；
- 极小精确搜索与独立完整穷举一致；
- 单队和三队联合上界覆盖每个合法的极小完成；
- 前后表条件值与完整剩余分配一致；
- 物理卡冲突、角色唯一性、必选角色和稳定同分；
- 扫描与索引两种精确局部连接一致；
- 严格剪枝会保留等分候选；
- 搜索存储预算为零时返回 `incomplete`，并分别检查停止原因保留、严格输入校验和补算分数不一致处理。

这些公开证据在源码中的分布如下：

| 被检查的结论 | 测试源码 | 具体检查方式 |
| --- | --- | --- |
| 档案、参数、技能、谱面和来源请求规范化 | [`tests/bandori-medley-*.test.mjs`](../../tests) | 从 HHWX 形状的来源数据调用公开 TypeScript 构造器，直到生成规范的固定队与搜索请求。 |
| 带版本的 Rust 输入契约 | [`json_contract.rs`](../../crates/bandori-medley-model/tests/json_contract.rs) | 接受仓库中的合法样本，并拒绝未知计分规则版本。 |
| 优化计分与直接枚举 120 种顺序一致 | [`exact_score.rs`](../../crates/bandori-medley-search/src/exact_score.rs) | `production_song_scores_match_reference_bits`、`score_range_matches_all_120_reference_orders` 及重叠／概率用例比较两条实现。 |
| 搜索在保留的有限空间上与完整枚举一致 | [`tiny_exact_search.rs`](../../crates/bandori-medley-search/tests/tiny_exact_search.rs) | `tiny_search_matches_the_independent_exhaustive_reference_across_memory_budgets` 覆盖对称的五角色用例；`tiny_search_matches_the_reference_when_characters_and_cards_can_be_unused` 覆盖六个合格角色、一张未使用的合格卡、各队省略不同角色，以及一张数值很高但被排除的卡。两者都比较精确分数和稳定同分代表。 |
| 上界和结构推论保持安全 | [`fast_upper.rs`](../../crates/bandori-medley-search/src/fast_upper.rs)、[`joint_upper.rs`](../../crates/bandori-medley-search/src/joint_upper.rs)、[`search.rs`](../../crates/bandori-medley-search/src/search.rs) | 用极小完成穷举检查单队上界、联合前后表和角色占用模式；专项用例检查实际去向单例闭包及索引／扫描连接一致。 |
| 各类失败保留各自结果 | [`control.rs`](../../crates/bandori-medley-search/src/control.rs)、[`validation.rs`](../../crates/bandori-medley-search/src/validation.rs)、[`hydration.rs`](../../crates/bandori-medley-search/src/hydration.rs)、[`tiny_exact_search.rs`](../../crates/bandori-medley-search/tests/tiny_exact_search.rs) | 存储预算为零时搜索返回 `incomplete`；控制器保留 `TimedOut`；非法请求和补算分数不一致返回错误，不会成为虚假的 `exact`。 |

### WebAssembly 产物

发布到浏览器的 Rust 行为或其构建输入变化时，需要重新生成已提交的包：

```bash
npm run build:medley-foundation:wasm
```

该命令要求 `wasm-bindgen-cli` 与 workspace 中锁定的 `wasm-bindgen` crate 版本一致。验证受影响的 TypeScript 契约和生成后的浏览器绑定。如果 Rust 源码、依赖、配置和工具链均未变化，可复用已通过的 Rust 检查，不必仅因生成产物而重跑。普通 Next.js 构建只会读取 `src/lib/bandori/medley-wasm/pkg/`，不会重新生成或执行它；只测试原生 Rust 代码可能导致浏览器仍使用旧求解器。

发布前的应用级检查还包括：

```bash
npm run typecheck
npm run lint
npm run build
```

仓库目前没有端到端执行生成后 JavaScript／WebAssembly 绑定的自动命令。发布前应手动启动应用，在组队计算器页面运行一个保留的组曲用例，并确认搜索进度、最终状态和补算结果都能显示。应把它记录为手工检查，不能声称 `cargo check` 或 `next build` 已经覆盖浏览器运行。

## 3. 计分测试应比较什么

固定队路径把计分验证与搜索分开。有效的计分用例应记录：

- 来源档案及其游戏服务器；
- 实际使用的卡牌、角色、技能、区域道具、活动、歌曲和谱面记录；
- 三首有序歌曲的 ID 和难度；
- PERFECT 率；
- 所选卡牌、队长位置和区域道具 ID；
- 算出的卡牌、道具和活动参数；
- 规范化音符及技能触发；
- 每曲分数和组曲总分；
- 计分 schema 与规则版本。

直接参考实现逐音符计算前五次技能的全部 120 种顺序。生产计分使用[组曲规则与计分](medley-foundation.zh-CN.md)中说明的代数化简。两者一致，可以在不假定“两份相同优化必然正确”的情况下检查生产计分路径。

两条 Rust 计分路径刻意共用同一份规范音符输入，因此它们彼此一致并不能独立发现 TypeScript 谱面规范化错误。这个边界应使用保留的原始谱面样本，直接断言预期的计分音符、触发标记和锚定时间；之后再用两条计分路径核对对该规范输入的计算。

## 4. 精确搜索测试应比较什么

对极小卡池，独立完整穷举是最清楚的参考结果：枚举每套合法道具、由未排除物理卡组成的每支合法五角色队伍、三支队伍之间每种无卡牌冲突的分配，以及每种队长，再把完整最优解及同分代表与优化搜索比较。参考代码不得调用优化搜索的候选生成、上界、结构推论或局部连接。

保留的五角色用例要求使用所有卡牌，重点检查三队争用。六角色用例还明确要求两条路径都留下一张合格卡不用、让不同队伍省略不同角色，并忽略一张若未被排除就会获胜的高数值卡。两个用例都在不同内存预算下运行，以覆盖不同搜索形态；但任何有限样本本身都不应被表述为对任意卡池的单独证明。

针对上界的测试更容易定位错误。对一个部分搜索状态，完整枚举它的每个合法完成，并验证：

```text
报告的上界 >= 合法完成中的最高精确分数
```

测试必须包括相等情况，因为生产搜索只有在上界严格低于当前最好分时才会剪枝。卡牌去向和角色占用等条件上界，也要在施加相应条件后进行同样比较。

改变内存限制、缓存容量、分支顺序或启发式方案，不得改变一次 `exact` 搜索的分数和稳定同分代表。这些设置可以改变耗时、诊断数据，以及限时搜索能否完成。

## 5. 可选的真实档案回归

HHWX 维护者还可以使用 `temp/medley-regression-fixtures/` 下被 Git 忽略的档案库。其中包含私有档案、缓存主数据与谱面、历史报告、规范输入和运行输出。这些资料可能包含账号数据，不得提交或公开。

较小的选择性验收入口为：

```powershell
$env:HHWX_MEDLEY_ACCEPTANCE_ROOT='<私有样本包>'
npm run accept:medley-search:real
```

没有设置 `HHWX_MEDLEY_ACCEPTANCE_ROOT` 时，脚本会明确报告私有检查已跳过。跳过私有检查不代表公开测试失败，但也不能作为真实档案已经运行的证据。

较大的本地比较器读取 `temp/medley-regression-fixtures/manifest.json`：

```bash
node --import tsx scripts/compare-bandori-medley-search.mjs --case 119-no-event
node --import tsx scripts/compare-bandori-medley-search.mjs --remaining
node --import tsx scripts/compare-bandori-medley-search.mjs --completed-profiles
node --import tsx scripts/compare-bandori-medley-search.mjs --high-pressure
node --import tsx scripts/compare-bandori-medley-search.mjs --all-profiles
```

这些是维护者工具，不是仓库内可直接运行的公开检查。只有 `--diagnose` 模式接受诊断参数；这些参数用于测量不同阈值，不会改变生产默认值。

## 6. 历史比较规则

只有归档档案和旧报告明确记录的全部请求设置一致时，才可以比较历史分数：歌曲 ID 与顺序、难度、PERFECT 率和活动设置都必须相同。档案标签不是 payload 版本，名为 `main` 或 `dev` 的目录也不能证明报告由哪个提交生成。

许多旧报告没有保存源码提交，也没有保存实际使用的主数据与谱面哈希。这类分数是在明确记录的快照假设下采用的回归目标，不能证明新旧运行使用了逐字节相同的输入。报告必须区分：

- **已证明：**有保留的 payload、设置、哈希和当前输出支持；
- **假设：**旧资料来源不完整，只能明确依赖某项假设；
- **无法恢复：**现有证据无法重建。

对同输入回归目标，当前搜索找到不低于参考的分数时，通过分数检查；只有返回 `exact` 时才通过精确性检查。这是两个不同结论：未完成搜索即使已经达到参考分，也不能证明全局最优。

## 7. 运行产物

私有运行会在 `temp/medley-regression-fixtures/runs/<时间>/` 下写入 `run.json`、`summary.json` 和逐场输入、输出及结果。有效的运行记录应包含：

- 源码提交和未提交差异；
- 运行环境与搜索限制；
- 档案 payload 和规范输入哈希；
- 实际使用的每个主数据／谱面文件哈希；
- 完整结果和最终状态；
- 总耗时、找到最好分用时和补算耗时；
- 启用采样时的进程工作集；
- 搜索预算统计的内存峰值。

单次运行的表格和解释应与这些被忽略的产物保存在一起。稳定公开文档记录测试方法和字段含义，不保存最新的特定机器测量结果。
