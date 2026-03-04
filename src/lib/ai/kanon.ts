import {
    CellState,
    PlayerColor,
    getValidMoves,
    getFlips,
    applyMove,
    isCorner,
    isDangerousFor,
    givesOpponentCorner,
    opponent,
    POSITION_WEIGHTS,
    getThreatenedEdgePieces
} from "../othello";
import { getProportionalRandomMove, getTopRangeMoves, getMidRangeMoves, AIRandomContext } from "./utils";

/**
 * Kanon AI：行动力战术的践行者，但有时容易犯迷糊。
 *
 * 策略特点：
 * - 核心：行动力（mobility）导向 —— 优先选择能让自己下一步可落子数最多、
 *   同时限制对手可落子数的位置
 * - 角位绝不放过（保持人设中的清醒面）
 * - 20% 概率犯迷糊（在 10%~75% 权重范围内选择较差的落子）
 * - 综合考虑位置权重+行动力+翻转数+边线保护
 *
 * 为什么行动力在黑白棋中重要：
 * 可落子数多 = 选择多 = 灵活性强。通过限制对手的选择，迫使对手走出劣步。
 * 这是黑白棋中高水平玩家的核心策略之一。
 */
export function kanonAI(
    board: CellState[][],
    aiColor: PlayerColor,
    context?: AIRandomContext
): { row: number; col: number; isConfused?: boolean } {
    const moves = getValidMoves(board, aiColor);
    if (moves.length === 0) throw new Error("Kanon AI 无合法落子点");

    const opp = opponent(aiColor);

    // 计算当前边线威胁情况
    const currentThreatened = getThreatenedEdgePieces(board, aiColor);
    const currentThreatenedSet = new Set(currentThreatened.map(p => `${p.row},${p.col}`));

    // 综合评分：行动力为核心 + 位置权重 + 翻转数 + 边线保护
    const scored = moves.map((m) => {
        const flips = getFlips(board, m.row, m.col, aiColor).length;
        let score = POSITION_WEIGHTS[m.row][m.col];

        /**
         * 行动力评估：模拟落子后计算双方的可落子数差。
         * 己方可落子数越多越好，对手可落子数越少越好。
         * 行动力差每 1 步 ≈ 10 分位置价值（Kanon 非常重视这一维度）。
         */
        const newBoard = applyMove(board, m.row, m.col, aiColor);
        const myNextMoves = getValidMoves(newBoard, aiColor).length;
        const oppNextMoves = getValidMoves(newBoard, opp).length;
        const mobilityDiff = myNextMoves - oppNextMoves;
        score += mobilityDiff * 10;

        // 翻转数加成
        score += flips * 2;

        // 送角惩罚
        if (givesOpponentCorner(board, m.row, m.col, aiColor)) {
            score -= 50;
        }
        // 危险位惩罚
        if (isDangerousFor(board, m.row, m.col, aiColor)) {
            score -= 40;
        }

        // --- 边线保护 ---
        const newThreatened = getThreatenedEdgePieces(newBoard, aiColor);
        const newThreatenedSet = new Set(newThreatened.map(p => `${p.row},${p.col}`));

        // 拯救边线棋子加分
        let savedScore = 0;
        for (const p of currentThreatened) {
            if (!newThreatenedSet.has(`${p.row},${p.col}`)) {
                const w = POSITION_WEIGHTS[p.row][p.col];
                savedScore += (20 + Math.max(0, w));
            }
        }
        score += savedScore;

        // 边线威胁惩罚
        let hasNewThreat = false;
        let newThreatPenalty = 0;
        for (const p of newThreatened) {
            if (!currentThreatenedSet.has(`${p.row},${p.col}`)) {
                hasNewThreat = true;
                newThreatPenalty += POSITION_WEIGHTS[p.row][p.col];
            }
        }
        if (hasNewThreat) {
            score -= 30;
            score -= newThreatPenalty;
        }

        return { ...m, score };
    });

    // 按分数降序排列
    scored.sort((a, b) => b.score - a.score);

    const isConfused = context?.kanonConfused ?? (Math.random() < 0.20);
    // 20% 概率犯迷糊：在 10%~75% 权重范围内按比例随机
    if (isConfused && scored.length > 1) {
        const midPool = getMidRangeMoves(scored, 0.10, 0.75);
        const move = getProportionalRandomMove(scored, midPool);
        return { row: move.row, col: move.col, isConfused: true };
    }

    // 正常：在最高分往下 25% 区间内按比例随机
    const topPool = getTopRangeMoves(scored, 0.25);
    return getProportionalRandomMove(scored, topPool);
}
