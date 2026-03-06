import {
    CellState,
    PlayerColor,
    getValidMoves,
    getFlips,
    applyMove,
    isCorner,
    POSITION_WEIGHTS,
    getThreatenedEdgePieces,
    countStableDiscs,
    getStablePositions,
    evaluatePotentialDiff,
    getAssociatedCorner,
    isXSquare,
    isCSquare,
    checkEdgeInsertionVulnerability
} from "../othello";
import { getProportionalRandomMove, getTopRangeMoves, isFirstWhiteMove, handleFirstWhiteMove } from "./utils";

export function evaluateKokoroMove(
    board: CellState[][],
    aiColor: PlayerColor,
    m: { row: number; col: number },
    currentThreatened: ReturnType<typeof getThreatenedEdgePieces>,
    currentThreatenedSet: Set<string>
): { score: number; details: string } {
    let score = 50;
    let details = "基础值: 50\n";

    const newBoard = applyMove(board, m.row, m.col, aiColor);

    const stableSet = getStablePositions(newBoard, aiColor);
    const isStable = stableSet.has(`${m.row},${m.col}`);

    // Kokoro 的“盲区”机制：计算自身位置获利时不模拟翻转，评估敌方位置威胁时也不模拟翻转，产生破绽
    const diff = evaluatePotentialDiff(board, aiColor, m, false);

    // 数学模型评估：2.0 倍新获权重收益 - 1.5 倍敌方潜在这个最高反弹惩罚
    // （由于盲区，这里的 maxOpponentWeight 可能会漏算敌方因吃子打通的角）
    const gainScore = diff.gainedWeight * 2.0;
    const penaltyScore = diff.maxOpponentWeight * 1.5;

    score += gainScore;
    score -= penaltyScore;
    details = `位置获利(2.0x): ${gainScore}\n位置威胁(1.5x): -${penaltyScore}`;

    // 如果该点位变成稳定子，能抵抗诸多不确定性
    if (isStable) {
        const posW = POSITION_WEIGHTS[m.row][m.col];
        if (posW < 0) {
            score -= posW;
            details += `\n稳定子抵消负面权重: +${-posW}`;
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
    if (savedScore > 0) {
        score += savedScore;
        details += `\n边线保护: +${savedScore}`;
    }

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
            const totalPenalty = 50 + newThreatPenalty * 2;
            score -= totalPenalty;
            details += `\n边线威胁: -${totalPenalty}`;
        }
    }

    // --- 稳定子增益偏好 ---
    const stableBefore = countStableDiscs(board, aiColor);
    const stableGain = stableSet.size - stableBefore;
    if (stableGain > 0) {
        score += stableGain * 15;
        details += `\n稳定子增益: +${stableGain * 15}`;
    }

    // --- 危险位惩罚 ---
    const corner = getAssociatedCorner(m.row, m.col);
    if (corner && board[corner.row][corner.col] === null) {
        if (isXSquare(m.row, m.col)) {
            score -= 100;
            details += `\n危险位: -100`;
        } else if (isCSquare(m.row, m.col)) {
            score -= 40;
            details += `\n危险位: -40`;
        }
    }

    // --- 边线防插缝判断 ---
    // 由于此判断需要使用“落子后”的新棋盘才能知道最终连成了什么样
    if (checkEdgeInsertionVulnerability(newBoard, aiColor, m)) {
        score -= 50;
        details += `\n潜在危险: -50`;
    }

    return { score, details };
}

/**
 * Kokoro AI：依靠直觉的战略型选手，热衷于通过对边角的战略性争夺来取得优势。
 */
export function kokoroAI(
    board: CellState[][],
    aiColor: PlayerColor
): { row: number; col: number } {
    if (isFirstWhiteMove(board, aiColor)) return handleFirstWhiteMove(board, aiColor);

    const moves = getValidMoves(board, aiColor);
    if (moves.length === 0) throw new Error("Kokoro AI 无合法落子点");

    const currentThreatened = getThreatenedEdgePieces(board, aiColor);
    const currentThreatenedSet = new Set(currentThreatened.map(p => `${p.row},${p.col}`));

    const scored = moves.map((m) => {
        const { score } = evaluateKokoroMove(board, aiColor, m, currentThreatened, currentThreatenedSet);
        return { ...m, score };
    });

    const poolMoves = getTopRangeMoves(scored, 0.40);
    // 指数 1.5，让 Kokoro 在备选方案中偏好更优解
    return getProportionalRandomMove(scored, poolMoves, 1.5);
}
