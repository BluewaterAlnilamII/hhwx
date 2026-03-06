import {
    CellState,
    PlayerColor,
    getValidMoves,
    getFlips,
    applyMove,
    isCorner,
    opponent,
    POSITION_WEIGHTS,
    evaluatePotentialDiff,
    getAssociatedCorner,
    isXSquare,
    isCSquare,
    countPieces,
    BOARD_SIZE,
    checkEdgeInsertionVulnerability
} from "../othello";
import { getProportionalRandomMove, getTopRangeMoves, getMidRangeMoves, AIRandomContext, isFirstWhiteMove, handleFirstWhiteMove } from "./utils";

export function evaluateKanonMove(
    board: CellState[][],
    aiColor: PlayerColor,
    m: { row: number; col: number }
): { score: number; details: string } {
    const opp = opponent(aiColor);
    const diff = evaluatePotentialDiff(board, aiColor, m, true);

    // 势能收益评估：重视自身获益，同时对敌方的反击潜力有标准的防范（1.0x系数）
    let score = 50 + diff.gainedWeight - diff.maxOpponentWeight;
    let details = `基础值: 50\n位置获利: +${diff.gainedWeight}\n位置威胁: -${diff.maxOpponentWeight}`;

    const newBoard = applyMove(board, m.row, m.col, aiColor);

    // 核心战术：行动力差值判定
    const myNextMoves = getValidMoves(newBoard, aiColor).length;
    const oppNextMoves = getValidMoves(newBoard, opp).length;
    const mobilityDiff = myNextMoves - oppNextMoves;
    const mobilityScore = mobilityDiff * 15;

    score += mobilityScore;
    details += `\n行动力差(${myNextMoves}-${oppNextMoves}): ${mobilityScore > 0 ? '+' : ''}${mobilityScore}`;

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
    if (checkEdgeInsertionVulnerability(newBoard, aiColor, m)) {
        score -= 50;
        details += `\n潜在危险: -50`;
    }

    return { score, details };
}

export function kanonEndgameMinimax(
    board: CellState[][],
    currentPlayer: PlayerColor,
    aiColor: PlayerColor,
    alpha: number,
    beta: number
): number {
    const validMoves = getValidMoves(board, currentPlayer);
    const opp = opponent(currentPlayer);

    if (validMoves.length === 0) {
        const oppValidMoves = getValidMoves(board, opp);
        if (oppValidMoves.length === 0) {
            // 游戏结束
            const pieces = countPieces(board);
            const aiCount = aiColor === "black" ? pieces.black : pieces.white;
            const oppCount = aiColor === "black" ? pieces.white : pieces.black;
            return aiCount - oppCount;
        } else {
            // 弃权
            return kanonEndgameMinimax(board, opp, aiColor, alpha, beta);
        }
    }

    if (currentPlayer === aiColor) {
        let maxEval = -Infinity;
        for (const move of validMoves) {
            const nextBoard = applyMove(board, move.row, move.col, currentPlayer);
            const ev = kanonEndgameMinimax(nextBoard, opp, aiColor, alpha, beta);
            maxEval = Math.max(maxEval, ev);
            alpha = Math.max(alpha, ev);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of validMoves) {
            const nextBoard = applyMove(board, move.row, move.col, currentPlayer);
            const ev = kanonEndgameMinimax(nextBoard, opp, aiColor, alpha, beta);
            minEval = Math.min(minEval, ev);
            beta = Math.min(beta, ev);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

export function evaluateKanonEndgameMove(
    board: CellState[][],
    aiColor: PlayerColor,
    m: { row: number; col: number }
): { score: number; details: string; pieceDiff: number } {
    const nextBoard = applyMove(board, m.row, m.col, aiColor);
    const diff = kanonEndgameMinimax(nextBoard, opponent(aiColor), aiColor, -Infinity, Infinity);
    const score = diff * 100; // 放大分数确保终局优解能超越平常权重
    return {
        score,
        details: `穷举模式启动！\n终局预测子数差: ${diff > 0 ? '+' : ''}${diff}`,
        pieceDiff: diff
    };
}

/**
 * Kanon AI：行动力战术的践行者，但有时容易犯迷糊。
 */
export function kanonAI(
    board: CellState[][],
    aiColor: PlayerColor,
    context?: AIRandomContext
): { row: number; col: number; isConfused?: boolean } {
    if (isFirstWhiteMove(board, aiColor)) return handleFirstWhiteMove(board, aiColor);

    const moves = getValidMoves(board, aiColor);
    if (moves.length === 0) throw new Error("Kanon AI 无合法落子点");

    const pieces = countPieces(board);
    const emptyCount = BOARD_SIZE * BOARD_SIZE - (pieces.black + pieces.white);

    let scored: { row: number; col: number; score: number }[];

    if (emptyCount <= 12) {
        scored = moves.map(m => {
            const { score } = evaluateKanonEndgameMove(board, aiColor, m);
            return { ...m, score };
        });
    } else {
        scored = moves.map((m) => {
            const { score } = evaluateKanonMove(board, aiColor, m);
            return { ...m, score };
        });
    }

    scored.sort((a, b) => b.score - a.score);

    let isConfused = context?.kanonConfused ?? (Math.random() < 0.20);
    const hasCornerMove = moves.some(m => isCorner(m.row, m.col));
    if (hasCornerMove) {
        isConfused = false;
    }

    // 20% 概率犯迷糊：在 25%~80% 权重范围内按比例随机, exponent 1.5 稍微让低分被选中的概率增加
    if (isConfused && scored.length > 1) {
        const midPool = getMidRangeMoves(scored, 0.25, 0.80);
        const move = getProportionalRandomMove(scored, midPool, 1.5);
        return { row: move.row, col: move.col, isConfused: true };
    }

    // 正常：在最高分往下 25% 区间内按比例随机, exponent 2.5 极大增加选中最高分的概率
    const topPool = getTopRangeMoves(scored, 0.25);
    return getProportionalRandomMove(scored, topPool, 2.5);
}
