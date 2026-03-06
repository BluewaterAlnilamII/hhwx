import {
    CellState,
    PlayerColor,
    getValidMoves,
    countPieces,
    POSITION_WEIGHTS,
    BOARD_SIZE,
    getThreatenedEdgePieces,
    isCorner,
} from "../othello";
import { evaluateHagumiMove } from "./hagumi";
import { evaluateKokoroMove } from "./kokoro";
import { evaluateKanonMove, evaluateKanonEndgameMove } from "./kanon";
import { evaluateMichelleMove } from "./michelle";
import { WeightData } from "@/store/useGameStore";
import { assignProbabilities, getTopRangeMoves, getBottomRangeMoves, getMidRangeMoves, AIRandomContext, isFirstWhiteMove } from "./utils";

/**
 * 计算指定 AI 角色在当前棋盘上所有合法落子点的评分。
 * 返回 8x8 矩阵，合法落子位置填充包含总分和明细的对象，其他位置为 null。
 */
export function computeAIWeights(
    characterId: string,
    board: CellState[][],
    aiColor: PlayerColor,
    randomContext?: AIRandomContext
): (WeightData | null)[][] {
    const weights: (WeightData | null)[][] = Array.from({ length: BOARD_SIZE }, () =>
        Array(BOARD_SIZE).fill(null)
    );

    const moves = getValidMoves(board, aiColor);
    if (moves.length === 0) return weights;

    if (isFirstWhiteMove(board, aiColor)) {
        for (const m of moves) {
            if (m.row === m.col || m.row + m.col === 7) {
                weights[m.row][m.col] = { total: 0, details: "初始随机：0", probability: 0.5 };
            } else {
                weights[m.row][m.col] = { total: 0, details: "初始随机：0", probability: 0.25 };
            }
        }
        return weights;
    }

    switch (characterId) {
        case "kokoro":
            computeKokoroWeights(board, aiColor, moves, weights, randomContext);
            break;
        case "kaoru":
            computeKaoruWeights(board, aiColor, moves, weights);
            break;
        case "hagumi":
            computeHagumiWeights(board, aiColor, moves, weights, randomContext);
            break;
        case "kanon":
            computeKanonWeights(board, aiColor, moves, weights, randomContext);
            break;
        case "michelle":
            computeMichelleWeights(board, aiColor, moves, weights, randomContext);
            break;
        default:
            for (const m of moves) {
                weights[m.row][m.col] = {
                    total: POSITION_WEIGHTS[m.row][m.col],
                    details: `位置权重: ${POSITION_WEIGHTS[m.row][m.col]}`
                };
            }
    }

    return weights;
}

function computeKokoroWeights(
    board: CellState[][],
    aiColor: PlayerColor,
    moves: { row: number; col: number }[],
    weights: (WeightData | null)[][],
    randomContext?: AIRandomContext
) {
    const currentThreatened = getThreatenedEdgePieces(board, aiColor);
    const currentThreatenedSet = new Set(currentThreatened.map(p => `${p.row},${p.col}`));

    for (const m of moves) {
        const { score, details } = evaluateKokoroMove(board, aiColor, m, currentThreatened, currentThreatenedSet);
        weights[m.row][m.col] = { total: score, details };
    }

    const scored = moves.map(m => ({ ...m, score: weights[m.row][m.col]!.total, probability: undefined as number | undefined }));
    const pool = getTopRangeMoves(scored, 0.40);
    assignProbabilities(scored, pool, 1.5); // Kokoro: 1.5
    for (const m of pool) weights[m.row][m.col]!.probability = m.probability;
}

function computeKaoruWeights(
    board: CellState[][],
    aiColor: PlayerColor,
    moves: { row: number; col: number }[],
    weights: (WeightData | null)[][]
) {
    for (const m of moves) {
        weights[m.row][m.col] = {
            total: POSITION_WEIGHTS[m.row][m.col],
            details: `位置权重: ${POSITION_WEIGHTS[m.row][m.col]}\n(Kaoru主要依靠Minimax搜索，此处仅为静态参考)`
        };
    }
}

function computeHagumiWeights(
    board: CellState[][],
    aiColor: PlayerColor,
    moves: { row: number; col: number }[],
    weights: (WeightData | null)[][],
    randomContext?: AIRandomContext
) {
    for (const m of moves) {
        const { score, details } = evaluateHagumiMove(board, aiColor, m);
        weights[m.row][m.col] = { total: score, details };
    }

    const scored = moves.map(m => ({ ...m, score: weights[m.row][m.col]!.total, probability: undefined as number | undefined }));
    const pool = getTopRangeMoves(scored, 0.60);
    assignProbabilities(scored, pool, 0.5); // Hagumi: 0.5
    for (const m of pool) weights[m.row][m.col]!.probability = m.probability;
}

function computeKanonWeights(
    board: CellState[][],
    aiColor: PlayerColor,
    moves: { row: number; col: number }[],
    weights: (WeightData | null)[][],
    randomContext?: AIRandomContext
) {
    const pieces = countPieces(board);
    const emptyCount = BOARD_SIZE * BOARD_SIZE - (pieces.black + pieces.white);

    if (emptyCount <= 12) {
        for (const m of moves) {
            const { score, details } = evaluateKanonEndgameMove(board, aiColor, m);
            weights[m.row][m.col] = { total: score, details };
        }
    } else {
        for (const m of moves) {
            const { score, details } = evaluateKanonMove(board, aiColor, m);
            weights[m.row][m.col] = { total: score, details };
        }
    }

    const scored = moves.map(m => ({ ...m, score: weights[m.row][m.col]!.total, probability: undefined as number | undefined }));

    let isConfused = randomContext?.kanonConfused ?? false;
    const hasCornerMove = moves.some(m => isCorner(m.row, m.col));
    if (hasCornerMove) {
        isConfused = false;
    }

    if (isConfused && scored.length > 1) {
        const pool = getMidRangeMoves(scored, 0.25, 0.80);
        assignProbabilities(scored, pool, 1.5); // Kanon Confused: 1.5
        for (const m of pool) {
            weights[m.row][m.col]!.probability = m.probability;
            weights[m.row][m.col]!.isConfused = true;
        }
    } else {
        const pool = getTopRangeMoves(scored, 0.25);
        assignProbabilities(scored, pool, 2.5); // Kanon Normal: 2.5
        for (const m of pool) weights[m.row][m.col]!.probability = m.probability;
    }
}

function computeMichelleWeights(
    board: CellState[][],
    aiColor: PlayerColor,
    moves: { row: number; col: number }[],
    weights: (WeightData | null)[][],
    randomContext?: AIRandomContext
) {
    const currentThreatened = getThreatenedEdgePieces(board, aiColor);
    const currentThreatenedSet = new Set(currentThreatened.map(p => `${p.row},${p.col}`));

    for (const m of moves) {
        const { score, details } = evaluateMichelleMove(board, aiColor, m, currentThreatened, currentThreatenedSet);
        weights[m.row][m.col] = { total: score, details };
    }

    const scored = moves.map(m => ({ ...m, score: weights[m.row][m.col]!.total, probability: undefined as number | undefined }));
    const pieces = countPieces(board);
    const myCount = aiColor === "black" ? pieces.black : pieces.white;
    const oppCount = aiColor === "black" ? pieces.white : pieces.black;
    const gap = myCount - oppCount;

    if (gap >= 5 && scored.length > 2) {
        // 在新体系中，不再硬编码过滤给对手送角的步，因为势能差评估出的最差得分自然包含那些大失误
        const bottomPool = getBottomRangeMoves(scored, 0.25);

        // 翻转得分以实现“分数越低被选中的概率越大”并在盘面上正确显示概率
        const invertedPool = bottomPool.map(m => {
            const maxScoreInPool = Math.max(...bottomPool.map(p => p.score));
            const invertedScore = maxScoreInPool - m.score + 1;
            return { ...m, score: invertedScore };
        });

        assignProbabilities(invertedPool, invertedPool);

        // 将计算出的概率写回原始 pool，让低分步显示高概率
        for (const invertedM of invertedPool) {
            const originalM = bottomPool.find(p => p.row === invertedM.row && p.col === invertedM.col);
            if (originalM) {
                weights[originalM.row][originalM.col]!.probability = invertedM.probability;
            }
        }
    } else {
        const pool = getTopRangeMoves(scored, 0.10);
        assignProbabilities(scored, pool, 3.0); // Michelle Normal: 3.0
        for (const m of pool) weights[m.row][m.col]!.probability = m.probability;
    }
}
