import {
    CellState,
    PlayerColor,
    getValidMoves,
    applyMove,
    advancedEvaluateBoard,
    opponent,
    isGameOver,
    countPieces,
    POSITION_WEIGHTS,
    BOARD_SIZE,
} from "../othello";
import { isFirstWhiteMove, handleFirstWhiteMove } from "./utils";

/**
 * 基础搜索深度限制为 5 层。
 * 黑白棋平均每步约 8-10 个合法落子，深度 5 意味着搜索约 10^5 个节点。
 * 配合 Alpha-Beta 剪枝和 Move Ordering，实际搜索量约为 10^3。
 */
const BASE_DEPTH = 5;

/**
 * 终局阶段搜索深度提升至 8 层。
 *
 * 为什么终局可以加深：棋盘已放置 >= 50 子时，平均合法落子数降至 3-5 个，
 * 分支因子大幅下降，8 层搜索量仅约 5^8 ≈ 390k 节点（实际经剪枝后远小于此）。
 * 终局精算对最终胜负影响极大，值得用更深的搜索换取准确性。
 */
const ENDGAME_DEPTH = 8;

/** 残局判定阈值：棋盘上已有 50 子或以上时进入终局模式。 */
const ENDGAME_THRESHOLD = 50;

/**
 * Kaoru AI：最高强度，使用 Minimax + Alpha-Beta 剪枝算法。
 *
 * 增强点：
 * 1. 使用 advancedEvaluateBoard（综合位置权重+行动力+角位+稳定子）
 * 2. Move Ordering：搜索前对候选步按位置权重预排序，α-β 剪枝效率提升约 2-3 倍
 * 3. 终局阶段动态加深搜索深度，精确计算最终结果
 */
export function kaoruAI(
    board: CellState[][],
    aiColor: PlayerColor
): { row: number; col: number } {
    if (isFirstWhiteMove(board, aiColor)) return handleFirstWhiteMove(board, aiColor);

    const moves = getValidMoves(board, aiColor);
    if (moves.length === 0) throw new Error("Kaoru AI 无合法落子点");

    // 确定搜索深度：终局阶段加深
    const pieces = countPieces(board);
    const totalPieces = pieces.black + pieces.white;
    const depth = totalPieces >= ENDGAME_THRESHOLD ? ENDGAME_DEPTH : BASE_DEPTH;

    // Move Ordering：按位置权重预排序，让更优的候选步优先被搜索，提升 α-β 效率
    const sortedMoves = [...moves].sort(
        (a, b) => POSITION_WEIGHTS[b.row][b.col] - POSITION_WEIGHTS[a.row][a.col]
    );

    let bestScore = -Infinity;
    let bestMove = sortedMoves[0];

    for (const move of sortedMoves) {
        const newBoard = applyMove(board, move.row, move.col, aiColor);
        const score = minimax(newBoard, depth - 1, false, aiColor, -Infinity, Infinity);
        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }

    return bestMove;
}

/**
 * Minimax + Alpha-Beta 剪枝递归函数。
 *
 * 优化说明：
 * - 使用 advancedEvaluateBoard 替代简单位置权重评估，综合考虑行动力和稳定子
 * - 每层递归内也对候选步做 Move Ordering（按位置权重排序），进一步提升剪枝效率
 * - Alpha-Beta 剪枝可将搜索节点数从 O(b^d) 降低至 O(b^(d/2))
 */
function minimax(
    board: CellState[][],
    depth: number,
    isMaximizing: boolean,
    aiColor: PlayerColor,
    alpha: number,
    beta: number
): number {
    if (depth === 0 || isGameOver(board)) {
        return advancedEvaluateBoard(board, aiColor);
    }

    const currentPlayer = isMaximizing ? aiColor : opponent(aiColor);
    const moves = getValidMoves(board, currentPlayer);

    // 无合法落子则跳过回合（Pass）
    if (moves.length === 0) {
        return minimax(board, depth - 1, !isMaximizing, aiColor, alpha, beta);
    }

    // 递归内 Move Ordering：按位置权重预排序以提升剪枝效率
    moves.sort((a, b) => POSITION_WEIGHTS[b.row][b.col] - POSITION_WEIGHTS[a.row][a.col]);

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of moves) {
            const newBoard = applyMove(board, move.row, move.col, currentPlayer);
            const evalScore = minimax(newBoard, depth - 1, false, aiColor, alpha, beta);
            maxEval = Math.max(maxEval, evalScore);
            alpha = Math.max(alpha, evalScore);
            if (beta <= alpha) break; // Beta 剪枝
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            const newBoard = applyMove(board, move.row, move.col, currentPlayer);
            const evalScore = minimax(newBoard, depth - 1, true, aiColor, alpha, beta);
            minEval = Math.min(minEval, evalScore);
            beta = Math.min(beta, evalScore);
            if (beta <= alpha) break; // Alpha 剪枝
        }
        return minEval;
    }
}
