/**
 * 按分数权重进行比例随机选择（支持负数）。
 * 
 * 核心方案（化解负数）：
 * 将池子中所有的分数减去**池内**的最低分，使其全部转换为非负数，
 * 并且加上基础值 1，确保即使是最差的符合范围的落点也有极小的概率被选中。
 * 
 * 为什么使用池内最低分而非全局最低分：
 * 当存在极端低分异常值时（如 -138），若用全局最低分偏移，
 * 会严重压缩池内高分和低分之间的差距（87 vs 5 变成 226 vs 144）。
 * 使用池内最低分则能准确反映池内分数的相对差异（84 vs 2）。
 */
export function getProportionalRandomMove<T extends { score: number }>(
    allScoredMoves: T[],
    poolMoves: T[]
): T {
    if (poolMoves.length === 0) return allScoredMoves[0]; // 兜底
    if (poolMoves.length === 1) return poolMoves[0];

    // 使用池内最低分进行偏移，而非全局最低分
    const minScore = Math.min(...poolMoves.map((m) => m.score));

    // 计算映射权重（偏移至非负数 + 1）
    const weights = poolMoves.map((m) => Math.max(0, m.score - minScore) + 1);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    let randomVal = Math.random() * totalWeight;
    for (let i = 0; i < weights.length; i++) {
        randomVal -= weights[i];
        if (randomVal <= 0) return poolMoves[i];
    }

    return poolMoves[poolMoves.length - 1]; // 兜底
}

/**
 * 获取处于最高分往下 Top X% 范围内的所有候选步。
 * 例如 topPercent = 0.4 (40%)，即 [max - range * 0.4, max] 区间的方案。
 */
export function getTopRangeMoves<T extends { score: number }>(
    scoredMoves: T[],
    topPercent: number
): T[] {
    if (scoredMoves.length <= 1) return scoredMoves;
    const scores = scoredMoves.map((m) => m.score);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const range = max - min;
    const threshold = max - range * topPercent;

    return scoredMoves.filter((m) => m.score >= threshold);
}

/**
 * 获取处于最低分往上 Bottom X% 范围内的所有候选步。
 * 例如 bottomPercent = 0.75 (75%)，即 [min, min + range * 0.75] 区间的方案。
 */
export function getBottomRangeMoves<T extends { score: number }>(
    scoredMoves: T[],
    bottomPercent: number
): T[] {
    if (scoredMoves.length <= 1) return scoredMoves;
    const scores = scoredMoves.map((m) => m.score);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const range = max - min;
    const threshold = min + range * bottomPercent;

    return scoredMoves.filter((m) => m.score <= threshold);
}

/**
 * 获取处于 [min + range * lowPercent, min + range * highPercent] 中间区间的候选步。
 * 例如 lowPercent=0.10, highPercent=0.75，即 10%~75% 权重范围内的落子位置。
 * 如有 100, 5, -75, -100 四个点位（range=200），
 * 下界 = -100 + 200*0.10 = -80，上界 = -100 + 200*0.75 = 50，
 * 则只有 5 和 -75 满足条件。
 */
export function getMidRangeMoves<T extends { score: number }>(
    scoredMoves: T[],
    lowPercent: number,
    highPercent: number
): T[] {
    if (scoredMoves.length <= 1) return scoredMoves;
    const scores = scoredMoves.map((m) => m.score);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const range = max - min;
    const lowerBound = min + range * lowPercent;
    const upperBound = min + range * highPercent;

    const result = scoredMoves.filter((m) => m.score >= lowerBound && m.score <= upperBound);
    // 兜底：如果过滤后为空，返回最接近中间值的一个
    return result.length > 0 ? result : [scoredMoves[Math.floor(scoredMoves.length / 2)]];
}

export interface AIRandomContext {
    kanonConfused?: boolean;
}

/**
 * 计算选中各落子的概率，并将其赋加在对象的 probability 字段中。
 * 使用池内最低分进行偏移，与 getProportionalRandomMove 保持一致。
 */
export function assignProbabilities<T extends { score: number, probability?: number }>(
    allScoredMoves: { score: number }[],
    poolMoves: T[]
): void {
    if (poolMoves.length === 0) return;
    if (poolMoves.length === 1) {
        poolMoves[0].probability = 1;
        return;
    }
    // 使用池内最低分而非全局最低分，避免极端异常值压缩概率差异
    const minScore = Math.min(...poolMoves.map((m) => m.score));
    const weights = poolMoves.map((m) => Math.max(0, m.score - minScore) + 1);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    for (let i = 0; i < poolMoves.length; i++) {
        poolMoves[i].probability = weights[i] / totalWeight;
    }
}
