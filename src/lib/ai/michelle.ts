import {
    CellState,
    PlayerColor,
    getValidMoves,
    getFlips,
    countPieces,
    isCorner,
    isEdge,
    isDangerousFor,
    givesOpponentCorner,
    POSITION_WEIGHTS,
} from "../othello";

/**
 * Michelle AI：动态强度浮动，中等思考时间。
 * - 若 AI 领先 >= 5 子，启动"放水模式"，选择中等偏下的落子。
 * - 正常模式使用位置权重+翻转数+边线加分的综合评分。
 * - 全程通过 givesOpponentCorner 避免送角（放水模式下也不送角）。
 */
import { getProportionalRandomMove, getTopRangeMoves, getBottomRangeMoves } from "./utils";

export function michelleAI(
    board: CellState[][],
    aiColor: PlayerColor
): { row: number; col: number } {
    const moves = getValidMoves(board, aiColor);
    if (moves.length === 0) throw new Error("Michelle AI 无合法落子点");

    const pieces = countPieces(board);
    const aiCount = aiColor === "black" ? pieces.black : pieces.white;
    const oppCount = aiColor === "black" ? pieces.white : pieces.black;
    const gap = aiCount - oppCount;

    // 综合评分
    const scored = moves.map((m) => {
        const flips = getFlips(board, m.row, m.col, aiColor);
        let score = POSITION_WEIGHTS[m.row][m.col];
        score += flips.length * 2;
        if (isCorner(m.row, m.col)) score += 50;
        if (isEdge(m.row, m.col)) score += 8;

        if (givesOpponentCorner(board, m.row, m.col, aiColor)) score -= 50;
        if (isDangerousFor(board, m.row, m.col, aiColor)) score -= 60;

        return { ...m, score };
    });

    // 放水模式：领先 >= 5 子，在最低分往上 60% 区间内随机
    // （为了保持原味，滤去送角选项以免被看作弱智而不是放水）
    if (gap >= 5 && scored.length > 2) {
        const safeMoves = scored.filter(m => !givesOpponentCorner(board, m.row, m.col, aiColor));
        const waterScored = safeMoves.length > 0 ? safeMoves : scored;
        const bottomPool = getBottomRangeMoves(waterScored, 0.60);
        return getProportionalRandomMove(waterScored, bottomPool);
    }

    // 正常：在最高分往下 10% 区间按比例随机
    const topPool = getTopRangeMoves(scored, 0.10);
    return getProportionalRandomMove(scored, topPool);
}
