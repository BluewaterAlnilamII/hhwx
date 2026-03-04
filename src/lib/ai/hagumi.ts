import {
    CellState,
    PlayerColor,
    getValidMoves,
    getFlips,
    isDangerousFor,
    givesOpponentCorner,
    POSITION_WEIGHTS,
} from "../othello";

/**
 * Hagumi AI：黑白棋初学者，常以"气势"一次性翻转大量对手的棋子，但不擅长争夺边角上的战术。
 *
 * 策略特点：
 * - 核心：贪心翻转（选翻转数量最多的位置），体现"气势"型人设
 * - 不擅长边角：不会主动优先选择边角位（与 Kokoro 形成对比）
 * - 完全不考虑行动力策略
 * - 有基本的安全意识（避免最严重的送角失误），但不重视位置权重
 * - 10% 概率随机落子，体现初学者的不稳定性
 *
 * 为什么 Hagumi 较弱：
 * 纯贪心策略只看当前能翻多少子，完全忽略位置的长期战略价值。
 * 虽然有基本送角检测，但不会主动争夺边角好位，
 * 这恰好符合 PRD 中"不擅长争夺边角上的战术"的设定。
 */
/** 
 * 计算 Hagumi 根据翻转数量获得的“气势”分数。
 * 公式要求：1个+10, 2个+25, 3个+45, 4个+70, 5个+100...
 * 数学归纳得增量为 10, 15, 20, 25...
 */
export function getHagumiFlipScore(count: number): number {
    let score = 0;
    for (let i = 1; i <= count; i++) {
        score += 10 + (i - 1) * 5;
    }
    return score;
}

import { getProportionalRandomMove, getTopRangeMoves } from "./utils";

export function hagumiAI(
    board: CellState[][],
    aiColor: PlayerColor
): { row: number; col: number } {
    const moves = getValidMoves(board, aiColor);
    if (moves.length === 0) throw new Error("Hagumi AI 无合法落子点");

    // 过滤掉会送角的步（基本安全意识）
    const safeMoves = moves.filter(
        (m) => !givesOpponentCorner(board, m.row, m.col, aiColor)
    );
    const candidates = safeMoves.length > 0 ? safeMoves : moves;

    const scored = candidates.map((m) => {
        const flips = getFlips(board, m.row, m.col, aiColor);
        const flipScore = getHagumiFlipScore(flips.length);
        let score = flipScore + POSITION_WEIGHTS[m.row][m.col];

        if (isDangerousFor(board, m.row, m.col, aiColor)) {
            score -= 30;
        }
        return { ...m, score };
    });

    // Hagumi: 在最高分往下 60% (即 40%~100%) 区间内按比例随机
    const poolMoves = getTopRangeMoves(scored, 0.60);
    return getProportionalRandomMove(scored, poolMoves);
}
