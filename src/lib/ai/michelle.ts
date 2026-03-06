import {
    CellState,
    PlayerColor,
    getValidMoves,
    countPieces,
    isCorner,
    isEdge,
    evaluatePotentialDiff,
    applyMove,
    opponent,
    POSITION_WEIGHTS,
    getThreatenedEdgePieces
} from "../othello";
import { getProportionalRandomMove, getTopRangeMoves, getBottomRangeMoves, isFirstWhiteMove, handleFirstWhiteMove } from "./utils";

export function evaluateMichelleMove(
    board: CellState[][],
    aiColor: PlayerColor,
    m: { row: number; col: number },
    currentThreatened: ReturnType<typeof getThreatenedEdgePieces>,
    currentThreatenedSet: Set<string>
): { score: number; details: string } {
    const diff = evaluatePotentialDiff(board, aiColor, m, true);

    // 综合评估：重视势能差，1.0 倍收益 - 1.0 倍威胁惩罚
    let score = 50 + diff.gainedWeight - diff.maxOpponentWeight;
    let details = `基础值: 50\n位置获利: +${diff.gainedWeight}\n位置威胁: -${diff.maxOpponentWeight}`;

    const opp = opponent(aiColor);
    const newBoard = applyMove(board, m.row, m.col, aiColor);

    // 行动力差值判定
    const myNextMoves = getValidMoves(newBoard, aiColor).length;
    const oppNextMoves = getValidMoves(newBoard, opp).length;
    const mobilityDiff = myNextMoves - oppNextMoves;
    const mobilityScore = mobilityDiff * 10;

    score += mobilityScore;
    details += `\n行动力差(${myNextMoves}-${oppNextMoves}): ${mobilityScore > 0 ? '+' : ''}${mobilityScore}`;

    // 边线防护
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

    return { score, details };
}

/**
 * Michelle AI：动态强度浮动，中等思考时间。
 * - 若 AI 领先 >= 5 子，启动"放水模式"，选择在底层权重范围（0-25%）按比例抛硬币。
 * - 正常模式使用势能差+边线占角的综合评分。
 */
export function michelleAI(
    board: CellState[][],
    aiColor: PlayerColor
): { row: number; col: number } {
    if (isFirstWhiteMove(board, aiColor)) return handleFirstWhiteMove(board, aiColor);

    const moves = getValidMoves(board, aiColor);
    if (moves.length === 0) throw new Error("Michelle AI 无合法落子点");

    const pieces = countPieces(board);
    const aiCount = aiColor === "black" ? pieces.black : pieces.white;
    const oppCount = aiColor === "black" ? pieces.white : pieces.black;
    const gap = aiCount - oppCount;

    const currentThreatened = getThreatenedEdgePieces(board, aiColor);
    const currentThreatenedSet = new Set(currentThreatened.map(p => `${p.row},${p.col}`));

    const scored = moves.map((m) => {
        const { score } = evaluateMichelleMove(board, aiColor, m, currentThreatened, currentThreatenedSet);
        return { ...m, score };
    });

    // 放水模式：领先 >= 5 子，在最低分往上 25% 区间内按反比例随机
    if (gap >= 5 && scored.length > 2) {
        // 在新体系中，不再硬编码过滤给对手送角的步，因为势能差评估出的最差得分自然包含那些大失误
        const bottomPool = getBottomRangeMoves(scored, 0.25);

        // 翻转得分以实现“分数越低被选中的概率越大”
        const invertedPool = bottomPool.map(m => {
            // 用池内最大分减去当前分来翻转分布
            const maxScoreInPool = Math.max(...bottomPool.map(p => p.score));
            const invertedScore = maxScoreInPool - m.score + 1; // +1 防止权重为0
            return { ...m, score: invertedScore };
        });

        const selectedInverted = getProportionalRandomMove(invertedPool, invertedPool);

        // 返回真实的落点 (放水模式 exponent = 1.0)
        return { row: selectedInverted.row, col: selectedInverted.col };
    }

    // 正常：在最高分往下 10% 区间按比例随机 (极其认真的模式 exponent = 3.0)
    const topPool = getTopRangeMoves(scored, 0.10);
    return getProportionalRandomMove(scored, topPool, 3.0);
}
