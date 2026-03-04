import {
    CellState,
    PlayerColor,
    getValidMoves,
    getFlips,
    applyMove,
    isCorner,
    isEdge,
    isDangerousFor,
    givesOpponentCorner,
    isStrategicPosition,
    isMoveSafe,
    countPieces,
    opponent,
    getThreatenedEdgePieces,
    POSITION_WEIGHTS,
    BOARD_SIZE,
    isEdgeGapMove,
    countStableDiscs,
    getStablePositions,
} from "../othello";
import { getHagumiFlipScore } from "./hagumi";
import { WeightData } from "@/store/useGameStore";
import { assignProbabilities, getTopRangeMoves, getBottomRangeMoves, getMidRangeMoves, AIRandomContext } from "./utils";

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
        const flips = getFlips(board, m.row, m.col, aiColor);
        let score = 0;
        let details = "";

        if (isCorner(m.row, m.col)) {
            score = 200;
            details = "占角: +200";
        } else {
            const posW = POSITION_WEIGHTS[m.row][m.col];
            score = posW;
            details = `位置权重: ${posW}`;

            // 模拟落子并检测稳定子
            const newBoard = applyMove(board, m.row, m.col, aiColor);
            const stableSet = getStablePositions(newBoard, aiColor);
            const isStable = stableSet.has(`${m.row},${m.col}`);

            if (isStrategicPosition(m.row, m.col)) {
                if (posW >= 20) {
                    score += 15;
                    details += "\n边线位: +15";
                } else {
                    score += 10;
                    details += "\n次边线位: +10";
                }
                if (isMoveSafe(board, m.row, m.col, aiColor)) {
                    score += 10;
                    details += "\n安全位: +10";
                }
            }
            score += flips.length;
            details += `\n翻转: +${flips.length}`;

            // 稳定子抵消负面位置权重
            if (isStable && posW < 0) {
                score -= posW;
                details += `\n稳定子抵消: +${-posW}`;
            }

            // 负面修正：仅在非稳定子时生效
            if (!isStable) {
                if (givesOpponentCorner(board, m.row, m.col, aiColor)) {
                    score -= 50;
                    details += "\n送角: -50";
                }
                if (isDangerousFor(board, m.row, m.col, aiColor)) {
                    score -= 50;
                    details += "\n危险位: -50";
                }
                if (isEdgeGapMove(board, m.row, m.col, aiColor)) {
                    score -= 40;
                    details += "\n边线间隔: -40";
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

            // 稳定子偏好
            const stableBefore = countStableDiscs(board, aiColor);
            const stableGain = stableSet.size - stableBefore;
            if (stableGain > 0) {
                score += stableGain * 15;
                details += `\n稳定子: +${stableGain * 15}`;
            }
        }

        weights[m.row][m.col] = { total: score, details };
    }

    const scored = moves.map(m => ({ ...m, score: weights[m.row][m.col]!.total, probability: undefined as number | undefined }));
    const pool = getTopRangeMoves(scored, 0.40);
    assignProbabilities(scored, pool);
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
        const flips = getFlips(board, m.row, m.col, aiColor);
        const posW = POSITION_WEIGHTS[m.row][m.col];
        const flipScore = getHagumiFlipScore(flips.length);
        let score = flipScore + posW;
        let details = `翻转(${flips.length}): +${flipScore}\n位置权重: +${posW}`;

        if (isDangerousFor(board, m.row, m.col, aiColor)) {
            score -= 30;
            details += "\n危险位: -30";
        }
        if (givesOpponentCorner(board, m.row, m.col, aiColor)) {
            score -= 50;
            details += "\n送角: -50";
        }
        weights[m.row][m.col] = { total: score, details };
    }

    const safeMoves = moves.filter((m) => !givesOpponentCorner(board, m.row, m.col, aiColor));
    const candidates = safeMoves.length > 0 ? safeMoves : moves;
    const scored = candidates.map(m => ({ ...m, score: weights[m.row][m.col]!.total, probability: undefined as number | undefined }));
    const pool = getTopRangeMoves(scored, 0.60);
    assignProbabilities(scored, pool);
    for (const m of pool) weights[m.row][m.col]!.probability = m.probability;
}

function computeKanonWeights(
    board: CellState[][],
    aiColor: PlayerColor,
    moves: { row: number; col: number }[],
    weights: (WeightData | null)[][],
    randomContext?: AIRandomContext
) {
    const opp = opponent(aiColor);

    // 计算当前边线威胁情况
    const currentThreatened = getThreatenedEdgePieces(board, aiColor);
    const currentThreatenedSet = new Set(currentThreatened.map(p => `${p.row},${p.col}`));

    for (const m of moves) {
        const flips = getFlips(board, m.row, m.col, aiColor).length;
        const posW = POSITION_WEIGHTS[m.row][m.col];
        let score = posW + flips * 2;
        let details = `位置权重: ${posW}\n翻转(${flips}): +${flips * 2}`;

        if (isCorner(m.row, m.col)) {
            score += 100;
            details += "\n占角: +100";
        }

        const newBoard = applyMove(board, m.row, m.col, aiColor);
        const myNextMoves = getValidMoves(newBoard, aiColor).length;
        const oppNextMoves = getValidMoves(newBoard, opp).length;
        const mobilityScore = (myNextMoves - oppNextMoves) * 10;
        score += mobilityScore;
        details += `\n行动力差(${myNextMoves}-${oppNextMoves}): ${mobilityScore > 0 ? '+' : ''}${mobilityScore}`;

        if (givesOpponentCorner(board, m.row, m.col, aiColor)) {
            score -= 50;
            details += "\n送角: -50";
        }
        if (isDangerousFor(board, m.row, m.col, aiColor)) {
            score -= 40;
            details += "\n危险位: -40";
        }

        // --- 边线保护 ---
        const newThreatened = getThreatenedEdgePieces(newBoard, aiColor);
        const newThreatenedSet = new Set(newThreatened.map(p => `${p.row},${p.col}`));

        let savedScore = 0;
        for (const p of currentThreatened) {
            if (!newThreatenedSet.has(`${p.row},${p.col}`)) {
                const w = POSITION_WEIGHTS[p.row][p.col];
                savedScore += (20 + Math.max(0, w));
            }
        }
        if (savedScore > 0) {
            score += savedScore;
            details += `\n边线保护: +${savedScore}`;
        }

        let hasNewThreat = false;
        let newThreatPenalty = 0;
        for (const p of newThreatened) {
            if (!currentThreatenedSet.has(`${p.row},${p.col}`)) {
                hasNewThreat = true;
                newThreatPenalty += POSITION_WEIGHTS[p.row][p.col];
            }
        }
        if (hasNewThreat) {
            const totalPenalty = 30 + newThreatPenalty;
            score -= totalPenalty;
            details += `\n边线威胁: -${totalPenalty}`;
        }

        weights[m.row][m.col] = { total: score, details };
    }

    const scored = moves.map(m => ({ ...m, score: weights[m.row][m.col]!.total, probability: undefined as number | undefined }));

    const isConfused = randomContext?.kanonConfused ?? false;
    if (isConfused && scored.length > 1) {
        const pool = getMidRangeMoves(scored, 0.10, 0.75);
        assignProbabilities(scored, pool);
        for (const m of pool) {
            weights[m.row][m.col]!.probability = m.probability;
            weights[m.row][m.col]!.isConfused = true;
        }
    } else {
        const pool = getTopRangeMoves(scored, 0.25);
        assignProbabilities(scored, pool);
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
    for (const m of moves) {
        const flips = getFlips(board, m.row, m.col, aiColor);
        const posW = POSITION_WEIGHTS[m.row][m.col];
        let score = posW;
        let details = `位置权重: ${posW}`;

        score += flips.length * 2;
        details += `\n翻转(${flips.length}): +${flips.length * 2}`;

        if (isCorner(m.row, m.col)) {
            score += 50;
            details += "\n占角: +50";
        }
        if (isEdge(m.row, m.col)) {
            score += 8;
            details += "\n边线位: +8";
        }
        if (givesOpponentCorner(board, m.row, m.col, aiColor)) {
            score -= 50;
            details += "\n送角: -50";
        }
        if (isDangerousFor(board, m.row, m.col, aiColor)) {
            score -= 60;
            details += "\n危险位: -60";
        }
        weights[m.row][m.col] = { total: score, details };
    }

    const scored = moves.map(m => ({ ...m, score: weights[m.row][m.col]!.total, probability: undefined as number | undefined }));
    const pieces = countPieces(board);
    const myCount = aiColor === "black" ? pieces.black : pieces.white;
    const oppCount = aiColor === "black" ? pieces.white : pieces.black;
    const gap = myCount - oppCount;

    if (gap >= 5 && scored.length > 1) {
        const safeMoves = scored.filter(m => !givesOpponentCorner(board, m.row, m.col, aiColor));
        const poolSource = safeMoves.length > 0 ? safeMoves : scored;
        const pool = getBottomRangeMoves(poolSource, 0.60);
        assignProbabilities(poolSource, pool);
        for (const m of pool) weights[m.row][m.col]!.probability = m.probability;
    } else {
        const pool = getTopRangeMoves(scored, 0.10);
        assignProbabilities(scored, pool);
        for (const m of pool) weights[m.row][m.col]!.probability = m.probability;
    }
}
