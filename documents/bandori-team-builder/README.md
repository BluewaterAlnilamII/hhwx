# Bandori 组队计算文档索引

本目录记录 Bandori 组队计算器的正式设计说明。临时脚本、fixture、缓存和验证报告保存在 `temp/bandori-team-builder/`，不作为产品源码的一部分。

## 文档

- `algorithm-notes.md`：单曲 exact 搜索的完整算法说明、分数公式、活动 PT、支援队伍和正确性证明。
- `single-song-search-optimization.md`：单曲搜索优化结构、共享缓存、剪枝策略和后续优化方向。
- `benchmark-results-and-next-plan.md`：当前验证结果、Supabase 实际卡池矩阵、与 Bestdori 兼容基线的性能对比和发布门禁。
- `public-algorithm-report.md`：可对外发布的脱敏算法说明，包含实现方法、正确性证明和匿名聚合性能对比。
- `medley-algorithm-notes.md`：组曲搜索的独立问题建模和后续设计记录。

## 维护要求

- 任何会影响分数、PT、支援队伍或剪枝正确性的代码改动，都需要同步更新 `algorithm-notes.md`。
- 任何性能优化若引入新的上界、压缩或缓存策略，需要同步更新 `single-song-search-optimization.md`。
- 任何发布门禁、benchmark 结果或兼容基线口径变化，需要同步更新 `benchmark-results-and-next-plan.md`。
