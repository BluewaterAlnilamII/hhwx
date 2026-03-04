import {
    CellState,
    PlayerColor,
    getValidMoves,
    getFlips,
    applyMove,
    isCorner,
    isDangerousFor,
    givesOpponentCorner,
    isStrategicPosition,
    isMoveSafe,
    POSITION_WEIGHTS,
    getThreatenedEdgePieces,
    isEdgeGapMove,
    countStableDiscs,
    getStablePositions
} from "../othello";
import { getProportionalRandomMove, getTopRangeMoves } from "./utils";

/**
 * Kokoro AI：依靠直觉的战略型选手，热衷于通过对边角的战略性争夺来取得优势。
 *
 * 策略优先级（从高到低）：
 * 1. 占角（权重 120）：最高优先级，遇到角位机会直接占领
 * 2. 边线位（权重 20，如 A3/C1 类位置）：次优先级，积极争夺
 * 3. 次边线位（权重 15，如 C3 类位置）：再次优先级
 * 4. 其他位置：按权重评分选择
 *
 * 特性：
 * - 完全不考虑行动力策略（纯直觉型）
 * - 重视位置安全性（不会让争夺到的位置被对手翻转）
 * - 全程避免送角
 * - 当落子后成为稳定子时，忽略所有负面修正
 */
export function kokoroAI(
    board: CellState[][],
    aiColor: PlayerColor
): { row: number; col: number } {
    const moves = getValidMoves(board, aiColor);
    if (moves.length === 0) throw new Error("Kokoro AI 无合法落子点");

    // 计算当前边线威胁情况
    const currentThreatened = getThreatenedEdgePieces(board, aiColor);
    const currentThreatenedSet = new Set(currentThreatened.map(p => `${p.row},${p.col}`));

    // 为每步落子综合评分
    const scored = moves.map((m) => {
        const flips = getFlips(board, m.row, m.col, aiColor);
        const newBoard = applyMove(board, m.row, m.col, aiColor);

        // 检查落子后该位置是否成为稳定子（不可翻转的安全棋子）
        const stableSet = getStablePositions(newBoard, aiColor);
        const isStable = stableSet.has(`${m.row},${m.col}`);

        let score = POSITION_WEIGHTS[m.row][m.col];

        /**
         * 战略位加分逻辑：
         * - 权重 20 的边线位（A3/C1 类）：加 15 分基础 + 安全加分
         * - 权重 15 的次边线位（C3 类）：加 10 分基础 + 安全加分
         */
        if (isStrategicPosition(m.row, m.col)) {
            const posWeight = POSITION_WEIGHTS[m.row][m.col];
            if (posWeight >= 20) {
                score += 15;
            } else {
                score += 10;
            }
            if (isMoveSafe(board, m.row, m.col, aiColor)) {
                score += 10;
            }
        }

        // 翻转数作为微弱加分
        score += flips.length;

        // 如果位置是负权重，但落子后成为稳定子，则忽略负面位置权重的影响
        if (isStable && POSITION_WEIGHTS[m.row][m.col] < 0) {
            score -= POSITION_WEIGHTS[m.row][m.col]; // 抵消负面位置权重
        }

        /**
         * 负面修正：仅在落子后不会成为稳定子时生效。
         * 稳定子一旦确立就不可能被翻转，因此送角、危险位等惩罚对其没有意义。
         */
        if (!isStable) {
            if (givesOpponentCorner(board, m.row, m.col, aiColor)) {
                score -= 50;
            }
            if (isDangerousFor(board, m.row, m.col, aiColor)) {
                score -= 50;
            }
            // 边线间隔惩罚
            if (isEdgeGapMove(board, m.row, m.col, aiColor)) {
                score -= 40;
            }
        }

        // --- 护边策略 ---
        const newThreatened = getThreatenedEdgePieces(newBoard, aiColor);
        const newThreatenedSet = new Set(newThreatened.map(p => `${p.row},${p.col}`));

        let savedScore = 0;
        for (const p of currentThreatened) {
            if (!newThreatenedSet.has(`${p.row},${p.col}`)) {
                const w = POSITION_WEIGHTS[p.row][p.col];
                savedScore += (30 + Math.max(0, w) * 2);
            }
        }
        score += savedScore;

        // 威胁增多惩罚（即使自身稳定，仍可能威胁到其他边线棋子）
        if (!isStable) {
            let hasNewThreat = false;
            let newThreatPenalty = 0;
            for (const p of newThreatened) {
                if (!currentThreatenedSet.has(`${p.row},${p.col}`)) {
                    hasNewThreat = true;
                    newThreatPenalty += POSITION_WEIGHTS[p.row][p.col];
                }
            }
            if (hasNewThreat) {
                score -= 50;
                score -= (newThreatPenalty * 2);
            }
        }

        // --- 稳定子偏好 ---
        const stableBefore = countStableDiscs(board, aiColor);
        const stableGain = stableSet.size - stableBefore;
        if (stableGain > 0) {
            score += stableGain * 15;
        }

        return { ...m, score };
    });

    // Kokoro: 在最高分往下 40% (即 60%~100%) 区间内按比例随机
    const poolMoves = getTopRangeMoves(scored, 0.40);
    return getProportionalRandomMove(scored, poolMoves);
}
