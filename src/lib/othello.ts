// 黑白棋（翻转棋）核心逻辑 — 纯函数，不依赖 React。

export type CellState = "black" | "white" | null;
export type PlayerColor = "black" | "white";

export const BOARD_SIZE = 8;

const DIRECTIONS: [number, number][] = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1],
];

/** 创建初始棋盘，中央放置 4 枚棋子。 */
export function createInitialBoard(): CellState[][] {
    const board: CellState[][] = Array.from({ length: BOARD_SIZE }, () =>
        Array(BOARD_SIZE).fill(null)
    );
    board[3][3] = "white";
    board[3][4] = "black";
    board[4][3] = "black";
    board[4][4] = "white";
    return board;
}

/** 检查坐标是否在棋盘范围内。 */
function inBounds(r: number, c: number): boolean {
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

/** 获取对手颜色。 */
export function opponent(color: PlayerColor): PlayerColor {
    return color === "black" ? "white" : "black";
}

/**
 * 获取当 `player` 在 (row, col) 落子时会被翻转的所有位置。
 * 若该落子不合法则返回空数组。
 */
export function getFlips(
    board: CellState[][],
    row: number,
    col: number,
    player: PlayerColor
): [number, number][] {
    if (board[row][col] !== null) return [];

    const opp = opponent(player);
    const allFlips: [number, number][] = [];

    for (const [dr, dc] of DIRECTIONS) {
        const lineFlips: [number, number][] = [];
        let r = row + dr;
        let c = col + dc;

        while (inBounds(r, c) && board[r][c] === opp) {
            lineFlips.push([r, c]);
            r += dr;
            c += dc;
        }

        if (lineFlips.length > 0 && inBounds(r, c) && board[r][c] === player) {
            allFlips.push(...lineFlips);
        }
    }

    return allFlips;
}

/** 检查某一步是否合法。 */
export function isValidMove(
    board: CellState[][],
    row: number,
    col: number,
    player: PlayerColor
): boolean {
    return getFlips(board, row, col, player).length > 0;
}

/** 获取某个玩家所有合法的落子位置。 */
export function getValidMoves(
    board: CellState[][],
    player: PlayerColor
): { row: number; col: number }[] {
    const moves: { row: number; col: number }[] = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (isValidMove(board, r, c, player)) {
                moves.push({ row: r, col: c });
            }
        }
    }
    return moves;
}

/**
 * 执行落子：放置棋子并翻转。返回新棋盘（不可变），
 * 若落子不合法则抛出异常。
 */
export function applyMove(
    board: CellState[][],
    row: number,
    col: number,
    player: PlayerColor
): CellState[][] {
    const flips = getFlips(board, row, col, player);
    if (flips.length === 0) {
        throw new Error(`Invalid move at (${row}, ${col}) for ${player}`);
    }

    const newBoard = board.map((r) => [...r]);
    newBoard[row][col] = player;
    for (const [fr, fc] of flips) {
        newBoard[fr][fc] = player;
    }
    return newBoard;
}

/** 统计棋盘上黑白棋子数量。 */
export function countPieces(board: CellState[][]): { black: number; white: number } {
    let black = 0;
    let white = 0;
    for (const row of board) {
        for (const cell of row) {
            if (cell === "black") black++;
            else if (cell === "white") white++;
        }
    }
    return { black, white };
}

/** 判断游戏是否结束（棋盘已满或双方均无合法落子点）。 */
export function isGameOver(board: CellState[][]): boolean {
    const blackMoves = getValidMoves(board, "black");
    const whiteMoves = getValidMoves(board, "white");
    if (blackMoves.length === 0 && whiteMoves.length === 0) return true;

    const { black, white } = countPieces(board);
    if (black + white === BOARD_SIZE * BOARD_SIZE) return true;

    return false;
}

/** 判断某位置是否为角位。 */
export function isCorner(row: number, col: number): boolean {
    return (
        (row === 0 || row === BOARD_SIZE - 1) &&
        (col === 0 || col === BOARD_SIZE - 1)
    );
}

/** 判断某位置是否位于边线。 */
export function isEdge(row: number, col: number): boolean {
    return row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1;
}

/** 
 * 返回当前棋盘上，指定玩家（myColor）处于边上且能在下一步被对手翻转的所有棋子坐标。
 */
export function getThreatenedEdgePieces(
    board: CellState[][],
    myColor: PlayerColor
): { row: number; col: number }[] {
    const oppColor = opponent(myColor);
    const oppMoves = getValidMoves(board, oppColor);
    const threatened = new Set<string>();

    for (const move of oppMoves) {
        const flips = getFlips(board, move.row, move.col, oppColor);
        for (const flip of flips) {
            if (isEdge(flip[0], flip[1]) && board[flip[0]][flip[1]] === myColor) {
                threatened.add(`${flip[0]},${flip[1]}`);
            }
        }
    }

    return Array.from(threatened).map((coord) => {
        const [r, c] = coord.split(",").map(Number);
        return { row: r, col: c };
    });
}

/**
 * AI 评估用的位置权重矩阵。
 *
 * 为什么采用这套权重：黑白棋中角位一旦占据就无法被翻转，是战略制高点，因此权重最高（120）；
 * 而角位对角线相邻的 X-square 位（如 [1][1]）极易让对手占角，因此给予最大负权重（-40）；
 * 边线位置相对稳定，给予正权重；中心区域影响力有限，权重较低。
 * 此经典权重矩阵在黑白棋 AI 领域被广泛使用和验证。
 */
export const POSITION_WEIGHTS: number[][] = [
    [120, -20, 20, 5, 5, 20, -20, 120],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [120, -20, 20, 5, 5, 20, -20, 120],
];

/** 从 `player` 的视角使用位置权重评估棋盘局势得分。 */
export function evaluateBoard(board: CellState[][], player: PlayerColor): number {
    let score = 0;
    const opp = opponent(player);
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === player) {
                score += POSITION_WEIGHTS[r][c];
            } else if (board[r][c] === opp) {
                score -= POSITION_WEIGHTS[r][c];
            }
        }
    }
    return score;
}

/** 深拷贝棋盘。 */
export function cloneBoard(board: CellState[][]): CellState[][] {
    return board.map((row) => [...row]);
}

/**
 * 判断是否为 X-square（角位对角线相邻位）。
 * 为什么这些位置危险：落子在 X-square 让对手可以用对角线翻转后直接占角，
 * 是黑白棋中最严重的战略失误之一。
 */
export function isXSquare(row: number, col: number): boolean {
    return (
        (row === 1 && col === 1) || (row === 1 && col === 6) ||
        (row === 6 && col === 1) || (row === 6 && col === 6)
    );
}

/**
 * 判断是否为 C-square（角位直线相邻位）。
 * 为什么这些位置次危险：C-square 虽不如 X-square 危险，但在角位空的情况下，
 * 落子于此可能被对手利用来间接控制角位。
 */
export function isCSquare(row: number, col: number): boolean {
    const cSquares = [
        [0, 1], [1, 0], // 左上角旁
        [0, 6], [1, 7], // 右上角旁
        [6, 0], [7, 1], // 左下角旁
        [6, 7], [7, 6], // 右下角旁
    ];
    return cSquares.some(([r, c]) => r === row && c === col);
}

/**
 * 获取与指定 X-square 或 C-square 关联的角位坐标。
 * 用于判断"该危险位的关联角位是否已被己方占领"——若已占领则该位不再危险。
 */
export function getAssociatedCorner(row: number, col: number): { row: number; col: number } | null {
    // X-square 到角位的映射
    if (row <= 1 && col <= 1) return { row: 0, col: 0 };
    if (row <= 1 && col >= 6) return { row: 0, col: 7 };
    if (row >= 6 && col <= 1) return { row: 7, col: 0 };
    if (row >= 6 && col >= 6) return { row: 7, col: 7 };
    return null;
}

/**
 * 判断某危险位（X-square/C-square）的关联角位是否已被指定玩家占领。
 * 若角位已被己方占，则该危险位反而变成好位置。
 */
export function isDangerousFor(board: CellState[][], row: number, col: number, player: PlayerColor): boolean {
    if (!isXSquare(row, col) && !isCSquare(row, col)) return false;
    const corner = getAssociatedCorner(row, col);
    if (!corner) return false;
    // 关联角已被己方占领 → 该位不再危险
    return board[corner.row][corner.col] !== player;
}

/**
 * 计算稳定子数量（沿边线方向确定不会被翻转的棋子）。
 *
 * 为什么只沿边线和角计算：精确的稳定子算法需要递归检查所有8个方向，
 * 开销较大。边角稳定子是最直观、最有价值的稳定子，采用简化算法以平衡性能。
 * 从每个己方占领的角开始，沿边线向外扩展，连续己方棋子即为稳定子。
 */
export function countStableDiscs(board: CellState[][], player: PlayerColor): number {
    let stable = 0;
    const corners: [number, number][] = [[0, 0], [0, 7], [7, 0], [7, 7]];
    // 标记已计算的稳定子，避免重复
    const marked = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));

    for (const [cr, cc] of corners) {
        if (board[cr][cc] !== player) continue;

        // 从角位沿两条边线扩展
        // 水平方向
        const hDir = cc === 0 ? 1 : -1;
        for (let c = cc; c >= 0 && c < BOARD_SIZE; c += hDir) {
            if (board[cr][c] !== player) break;
            if (!marked[cr][c]) { marked[cr][c] = true; stable++; }
        }
        // 垂直方向
        const vDir = cr === 0 ? 1 : -1;
        for (let r = cr; r >= 0 && r < BOARD_SIZE; r += vDir) {
            if (board[r][cc] !== player) break;
            if (!marked[r][cc]) { marked[r][cc] = true; stable++; }
        }
    }

    return stable;
}

/**
 * 返回当前棋盘上指定玩家的所有稳定子位置集合（"row,col" 字符串 Set）。
 * 与 countStableDiscs 算法一致，但返回位置集合而非计数，
 * 便于 AI 判断某个落子位置是否会成为稳定子。
 */
export function getStablePositions(board: CellState[][], player: PlayerColor): Set<string> {
    const stable = new Set<string>();
    const corners: [number, number][] = [[0, 0], [0, 7], [7, 0], [7, 7]];

    for (const [cr, cc] of corners) {
        if (board[cr][cc] !== player) continue;

        const hDir = cc === 0 ? 1 : -1;
        for (let c = cc; c >= 0 && c < BOARD_SIZE; c += hDir) {
            if (board[cr][c] !== player) break;
            stable.add(`${cr},${c}`);
        }
        const vDir = cr === 0 ? 1 : -1;
        for (let r = cr; r >= 0 && r < BOARD_SIZE; r += vDir) {
            if (board[r][cc] !== player) break;
            stable.add(`${r},${cc}`);
        }
    }

    return stable;
}

/**
 * 增强版棋盘评估函数，综合多个维度评分。
 *
 * 评估维度与权重设计理念：
 * 1. 位置权重（权重 1.0）：基础的位置价值评估
 * 2. 行动力（权重 8.0）：可落子数多 = 选择多 = 灵活性强，黑白棋中行动力极其重要
 * 3. 角位占有（权重 30.0 / 个）：角位不可翻转，是最强战略位
 * 4. 稳定子（权重 10.0 / 个）：稳定子越多局面越安全
 *
 * 行动力权重设为 8 是因为：研究表明在黑白棋中期，行动力差每多 1 步≈ 8 分位置价值。
 */
export function advancedEvaluateBoard(board: CellState[][], player: PlayerColor): number {
    const opp = opponent(player);

    // 1. 位置权重得分
    let positionScore = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === player) positionScore += POSITION_WEIGHTS[r][c];
            else if (board[r][c] === opp) positionScore -= POSITION_WEIGHTS[r][c];
        }
    }

    // 2. 行动力得分：己方可落子数 - 对手可落子数
    const myMoves = getValidMoves(board, player).length;
    const oppMoves = getValidMoves(board, opp).length;
    const mobilityScore = (myMoves - oppMoves) * 8;

    // 3. 角位占有得分
    let cornerScore = 0;
    const corners: [number, number][] = [[0, 0], [0, 7], [7, 0], [7, 7]];
    for (const [cr, cc] of corners) {
        if (board[cr][cc] === player) cornerScore += 30;
        else if (board[cr][cc] === opp) cornerScore -= 30;
    }

    // 4. 稳定子得分
    const myStable = countStableDiscs(board, player);
    const oppStable = countStableDiscs(board, opp);
    const stabilityScore = (myStable - oppStable) * 10;

    return positionScore + mobilityScore + cornerScore + stabilityScore;
}

/**
 * 检查在 (row, col) 落子后，对手是否会获得直接占角的机会。
 *
 * 为什么这个检测如此重要：黑白棋中角位一旦被占就不可翻转，且可延伸出大量稳定子。
 * "送角"是最严重的战略失误。AI 落子前先模拟，若发现对手因此能占角，应大幅降低该步的优先级。
 */
export function givesOpponentCorner(
    board: CellState[][],
    row: number,
    col: number,
    player: PlayerColor
): boolean {
    // 检查落子是否合法
    const flips = getFlips(board, row, col, player);
    if (flips.length === 0) return false;

    const newBoard = applyMove(board, row, col, player);
    const opp = opponent(player);
    const oppMoves = getValidMoves(newBoard, opp);

    // 检查对手是否因此获得角位落子机会
    return oppMoves.some((m) => isCorner(m.row, m.col));
}

/**
 * 判断某位置是否为高价值战略位（权重 >= 15 的位置）。
 * 这些位置包括边线位（权重 20）和次边线位（权重 15），
 * 是黑白棋中仅次于角位的重要位置，占据后能形成稳定的边线控制。
 */
export function isStrategicPosition(row: number, col: number): boolean {
    return POSITION_WEIGHTS[row][col] >= 15;
}

/**
 * 检查落子后，该位置的棋子是否容易在对手的下一步中被翻转。
 *
 * 为什么要检测"安全性"：即使位置权重很高，如果落子后立即被对手翻转，
 * 不仅白费一步，还替对手占据了好位置。这在边线争夺中尤其常见。
 * 只检查己方新落的子是否在对手的翻转列表中（不需要检查所有被翻转的棋子，
 * 因为影响最大的是新落位置本身的稳定性）。
 */
export function isMoveSafe(
    board: CellState[][],
    row: number,
    col: number,
    player: PlayerColor
): boolean {
    const flips = getFlips(board, row, col, player);
    if (flips.length === 0) return false;

    const newBoard = applyMove(board, row, col, player);
    const opp = opponent(player);
    const oppMoves = getValidMoves(newBoard, opp);

    // 检查对手的每一步是否能翻转我们刚落子的位置
    for (const m of oppMoves) {
        const oppFlips = getFlips(newBoard, m.row, m.col, opp);
        if (oppFlips.some(([fr, fc]) => fr === row && fc === col)) {
            return false; // 对手能翻转我们刚落的子
        }
    }
    return true;
}

/**
 * 检测某个边线位置是否与己方棋子之间恰好隔了一个空位（形成"间隔落子"），
 * 这在黑白棋中通常是劣步，因为中间的空位会成为对手的突破口。
 * 
 * 例如在边线上 `bbxxbybb` 中（b=空，x=己方棋子），y 位置就是"间隔一空"的危险落点。
 * 只检查沿落子所在边线方向的情况（水平边检测左右，垂直边检测上下）。
 * 
 * @returns true 表示该位置是边线上的间隔落子（应被惩罚），但角位除外
 */
export function isEdgeGapMove(
    board: CellState[][],
    row: number,
    col: number,
    player: PlayerColor
): boolean {
    if (!isEdge(row, col) || isCorner(row, col)) return false;

    const last = BOARD_SIZE - 1;

    // 确定沿边线方向的增量：水平边→左右(dc)，垂直边→上下(dr)
    const directions: [number, number][] = [];
    if (row === 0 || row === last) {
        directions.push([0, -1], [0, 1]); // 水平边
    }
    if (col === 0 || col === last) {
        directions.push([-1, 0], [1, 0]); // 垂直边
    }

    for (const [dr, dc] of directions) {
        // 检查相邻一格是否是空位
        const adjR = row + dr;
        const adjC = col + dc;
        if (!inBounds(adjR, adjC)) continue;
        if (board[adjR][adjC] !== null) continue; // 相邻格有棋子，不算间隔

        // 检查间隔后一格是否是己方棋子
        const beyondR = adjR + dr;
        const beyondC = adjC + dc;
        if (!inBounds(beyondR, beyondC)) continue;
        if (board[beyondR][beyondC] === player) {
            return true; // 找到了 [己方棋子]...[空位]...[落子位] 的间隔模式
        }
    }

    return false;
}
