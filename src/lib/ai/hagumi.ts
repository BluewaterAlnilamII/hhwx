import {
    CellState,
    PlayerColor,
    getValidMoves,
    getFlips,
    evaluatePotentialDiff
} from "../othello";
import { getProportionalRandomMove, getTopRangeMoves, isFirstWhiteMove, handleFirstWhiteMove } from "./utils";

/** 
 * 计算 Hagumi 根据翻转数量获得的“气势”分数。
 */
export function getHagumiFlipScore(count: number): number {
    let score = 0;
    for (let i = 1; i <= count; i++) {
        score += 10 + (i - 1) * 5;
    }
    return score;
}

export function evaluateHagumiMove(
    board: CellState[][],
    aiColor: PlayerColor,
    m: { row: number; col: number }
): { score: number; details: string } {
    const flips = getFlips(board, m.row, m.col, aiColor);
    const diff = evaluatePotentialDiff(board, aiColor, m, false);

    // 气势加成
    const flipScore = getHagumiFlipScore(flips.length);

    // 数学模型评估：自身获益全盘接受，但几乎忽视敌方的潜在威胁（不怎么受敌方下一步最高权重影响）
    // 为了防止其彻底表现为送角机器，稍微保留一点点防范意识（惩罚系数 0.5）
    const gainScore = diff.gainedWeight;
    const penaltyScore = diff.maxOpponentWeight * 0.5;

    // 增加基础分数50，让整体分值更平滑
    const score = 50 + flipScore + gainScore - penaltyScore;
    const details = `基础值: 50\n翻转数量(${flips.length}): +${flipScore}\n位置获利: +${gainScore}\n忽视威胁(0.5x惩罚): -${penaltyScore}`;

    return { score, details };
}

/**
 * Hagumi AI：黑白棋初学者，常以"气势"一次性翻转大量对手的棋子，但不擅长争夺边角上的战术。
 */
export function hagumiAI(
    board: CellState[][],
    aiColor: PlayerColor
): { row: number; col: number } {
    if (isFirstWhiteMove(board, aiColor)) return handleFirstWhiteMove(board, aiColor);

    const moves = getValidMoves(board, aiColor);
    if (moves.length === 0) throw new Error("Hagumi AI 无合法落子点");

    const scored = moves.map((m) => {
        const { score } = evaluateHagumiMove(board, aiColor, m);
        return { ...m, score };
    });

    const poolMoves = getTopRangeMoves(scored, 0.60);
    // 指数 0.5，Hagumi 更随心所欲，压平分数差距
    return getProportionalRandomMove(scored, poolMoves, 0.5);
}
