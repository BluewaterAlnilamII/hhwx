// Web Worker for Kaoru AI (Minimax) — runs off main thread.
// This file must be self-contained because workers can't share module imports.

const BOARD_SIZE = 8;
const BASE_DEPTH = 5;

/**
 * 终局阶段搜索深度提升至 8 层。
 * 棋盘已放置 >= 50 子时，平均合法落子数降至 3-5 个，分支因子大幅下降，
 * 8 层搜索量经剪枝后性能可控。终局精算对最终胜负影响极大。
 */
const ENDGAME_DEPTH = 8;
const ENDGAME_THRESHOLD = 50;

const DIRECTIONS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1],
];

const POSITION_WEIGHTS = [
    [120, -20, 20, 5, 5, 20, -20, 120],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [120, -20, 20, 5, 5, 20, -20, 120],
];

function inBounds(r, c) {
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function opp(color) {
    return color === "black" ? "white" : "black";
}

function getFlips(board, row, col, player) {
    if (board[row][col] !== null) return [];
    const o = opp(player);
    const allFlips = [];
    for (const [dr, dc] of DIRECTIONS) {
        const lineFlips = [];
        let r = row + dr, c = col + dc;
        while (inBounds(r, c) && board[r][c] === o) {
            lineFlips.push([r, c]);
            r += dr; c += dc;
        }
        if (lineFlips.length > 0 && inBounds(r, c) && board[r][c] === player) {
            allFlips.push(...lineFlips);
        }
    }
    return allFlips;
}

function getValidMoves(board, player) {
    const moves = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (getFlips(board, r, c, player).length > 0) moves.push({ row: r, col: c });
        }
    }
    return moves;
}

function applyMove(board, row, col, player) {
    const flips = getFlips(board, row, col, player);
    const nb = board.map(r => [...r]);
    nb[row][col] = player;
    for (const [fr, fc] of flips) nb[fr][fc] = player;
    return nb;
}

function isGameOver(board) {
    return getValidMoves(board, "black").length === 0 && getValidMoves(board, "white").length === 0;
}

/** 计算棋盘上的棋子总数，用于判断是否进入终局。 */
function countTotalPieces(board) {
    let total = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] !== null) total++;
        }
    }
    return total;
}

/**
 * 计算沿边线的稳定子数量。
 * 从己方占领的角位出发，沿边线扩展连续己方棋子即为稳定子。
 */
function countStableDiscs(board, player) {
    let stable = 0;
    const corners = [[0, 0], [0, 7], [7, 0], [7, 7]];
    const marked = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));

    for (const [cr, cc] of corners) {
        if (board[cr][cc] !== player) continue;
        const hDir = cc === 0 ? 1 : -1;
        for (let c = cc; c >= 0 && c < BOARD_SIZE; c += hDir) {
            if (board[cr][c] !== player) break;
            if (!marked[cr][c]) { marked[cr][c] = true; stable++; }
        }
        const vDir = cr === 0 ? 1 : -1;
        for (let r = cr; r >= 0 && r < BOARD_SIZE; r += vDir) {
            if (board[r][cc] !== player) break;
            if (!marked[r][cc]) { marked[r][cc] = true; stable++; }
        }
    }
    return stable;
}

/**
 * 增强版评估函数：综合位置权重 + 行动力 + 角位 + 稳定子。
 * 与 othello.ts 中的 advancedEvaluateBoard 保持一致。
 */
function advancedEvaluateBoard(board, player) {
    const o = opp(player);

    // 1. 位置权重得分
    let positionScore = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === player) positionScore += POSITION_WEIGHTS[r][c];
            else if (board[r][c] === o) positionScore -= POSITION_WEIGHTS[r][c];
        }
    }

    // 2. 行动力得分
    const myMoves = getValidMoves(board, player).length;
    const oppMoves = getValidMoves(board, o).length;
    const mobilityScore = (myMoves - oppMoves) * 8;

    // 3. 角位占有得分
    let cornerScore = 0;
    const corners = [[0, 0], [0, 7], [7, 0], [7, 7]];
    for (const [cr, cc] of corners) {
        if (board[cr][cc] === player) cornerScore += 30;
        else if (board[cr][cc] === o) cornerScore -= 30;
    }

    // 4. 稳定子得分
    const myStable = countStableDiscs(board, player);
    const oppStable = countStableDiscs(board, o);
    const stabilityScore = (myStable - oppStable) * 10;

    return positionScore + mobilityScore + cornerScore + stabilityScore;
}

/**
 * Minimax + Alpha-Beta 剪枝 + Move Ordering。
 * 每层对候选步按位置权重排序，提升剪枝效率。
 */
function minimax(board, depth, isMax, aiColor, alpha, beta) {
    if (depth === 0 || isGameOver(board)) return advancedEvaluateBoard(board, aiColor);
    const cur = isMax ? aiColor : opp(aiColor);
    const moves = getValidMoves(board, cur);
    if (moves.length === 0) return minimax(board, depth - 1, !isMax, aiColor, alpha, beta);

    // Move Ordering：按位置权重排序
    moves.sort((a, b) => POSITION_WEIGHTS[b.row][b.col] - POSITION_WEIGHTS[a.row][a.col]);

    if (isMax) {
        let maxEval = -Infinity;
        for (const m of moves) {
            const nb = applyMove(board, m.row, m.col, cur);
            const ev = minimax(nb, depth - 1, false, aiColor, alpha, beta);
            maxEval = Math.max(maxEval, ev);
            alpha = Math.max(alpha, ev);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const m of moves) {
            const nb = applyMove(board, m.row, m.col, cur);
            const ev = minimax(nb, depth - 1, true, aiColor, alpha, beta);
            minEval = Math.min(minEval, ev);
            beta = Math.min(beta, ev);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

self.onmessage = (e) => {
    const { board, aiColor } = e.data;
    const moves = getValidMoves(board, aiColor);
    if (moves.length === 0) {
        self.postMessage({ error: "No valid moves" });
        return;
    }

    // 适配白棋第一步固定概率的需求（Web Worker需要独立实现因为不能import）
    if (aiColor === "white") {
        let pieceCount = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] !== null) pieceCount++;
            }
        }
        if (pieceCount === 5) {
            const diagMove = moves.find(m => m.row === m.col || m.row + m.col === 7);
            const otherMoves = moves.filter(m => m !== diagMove);
            const rand = Math.random();
            let selectedMove;
            if (rand < 0.50 && diagMove) {
                selectedMove = diagMove;
            } else {
                if (!diagMove) selectedMove = moves[0];
                else selectedMove = rand < 0.75 ? otherMoves[0] : otherMoves[1];
            }
            self.postMessage({ move: selectedMove });
            return;
        }
    }

    // 动态搜索深度：终局阶段加深
    const totalPieces = countTotalPieces(board);
    const depth = totalPieces >= ENDGAME_THRESHOLD ? ENDGAME_DEPTH : BASE_DEPTH;

    // Move Ordering：按位置权重预排序
    const sortedMoves = [...moves].sort(
        (a, b) => POSITION_WEIGHTS[b.row][b.col] - POSITION_WEIGHTS[a.row][a.col]
    );

    let bestScore = -Infinity;
    let bestMove = sortedMoves[0];
    for (const move of sortedMoves) {
        const nb = applyMove(board, move.row, move.col, aiColor);
        const score = minimax(nb, depth - 1, false, aiColor, -Infinity, Infinity);
        if (score > bestScore) { bestScore = score; bestMove = move; }
    }

    self.postMessage({ move: bestMove });
};
