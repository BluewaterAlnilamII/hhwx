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
 */
export function advancedEvaluateBoard(board: CellState[][], player: PlayerColor): number {
    const opp = opponent(player);

    let positionScore = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === player) positionScore += POSITION_WEIGHTS[r][c];
            else if (board[r][c] === opp) positionScore -= POSITION_WEIGHTS[r][c];
        }
    }

    const myMoves = getValidMoves(board, player).length;
    const oppMoves = getValidMoves(board, opp).length;
    const mobilityScore = (myMoves - oppMoves) * 8;

    let cornerScore = 0;
    const corners: [number, number][] = [[0, 0], [0, 7], [7, 0], [7, 7]];
    for (const [cr, cc] of corners) {
        if (board[cr][cc] === player) cornerScore += 30;
        else if (board[cr][cc] === opp) cornerScore -= 30;
    }

    const myStable = countStableDiscs(board, player);
    const oppStable = countStableDiscs(board, opp);
    const stabilityScore = (myStable - oppStable) * 10;

    return positionScore + mobilityScore + cornerScore + stabilityScore;
}

/**
 * 评估落子后的势力差（Potential Difference）。
 * 
 * @param board 当前棋盘
 * @param myColor 当前落子玩家颜色
 * @param move 即将落子的位置
 * @param simulateFlipForThreat 是否在生成敌方用来计算反击威胁的棋盘时考虑己方翻转带来的改变。
 *        如果设为 false（盲区机制），AI 会幻想自己仅仅多下了一颗子没有吃子。
 *        但此时会进行双重校验，排除掉“因为己方（在幻想中）没有吃子而产生的不仅不应该存在、甚至连原版规则都不允许的空气威胁”。
 * 
 * @returns 包含:
 *   - gainedWeight: 我方新占据的所有点位的基础权重之和（仅计入这单颗子，不计翻转）。
 *   - maxOpponentWeight: 敌方在下一步所有合法落子中，能踩中的最高权重（潜在最大反击威胁）。
 */
export function evaluatePotentialDiff(
    board: CellState[][],
    myColor: PlayerColor,
    move: { row: number; col: number },
    simulateFlipForThreat: boolean = true
): { gainedWeight: number; maxOpponentWeight: number } {
    const oppColor = opponent(myColor);
    const flips = getFlips(board, move.row, move.col, myColor);

    // 计算我方新获得的基础权重之和（仅计入当前这一颗子）
    const gainedWeight = POSITION_WEIGHTS[move.row][move.col];

    // --- 真实棋盘（包含了合法的翻转结果，代表客观即将发生的未来） ---
    let trueBoard = cloneBoard(board);
    trueBoard[move.row][move.col] = myColor;
    for (const [fr, fc] of flips) {
        trueBoard[fr][fc] = myColor;
    }
    const trueOppMoves = getValidMoves(trueBoard, oppColor);

    let maxOpponentWeight = -Infinity;

    if (simulateFlipForThreat) {
        // 正常推演模式：直接使用真实棋盘去探测敌方威胁
        if (trueOppMoves.length === 0) {
            maxOpponentWeight = -100; // 敌方无路可走，形成压制，给予负向极低威胁
        } else {
            for (const oppMove of trueOppMoves) {
                const weight = POSITION_WEIGHTS[oppMove.row][oppMove.col];
                if (weight > maxOpponentWeight) {
                    maxOpponentWeight = weight;
                }
            }
        }
    } else {
        // 盲区机制（破绽）：AI “瞎了眼”以为自己没有吃子，只放下了这一颗棋子。
        // --- 盲棋盘（仅放下子，没有翻转） ---
        let blindBoard = cloneBoard(board);
        blindBoard[move.row][move.col] = myColor;
        const blindOppMoves = getValidMoves(blindBoard, oppColor);

        // 过滤掉那些在真实棋盘中根本不合法的“幻觉落子点”，消除“自己吓自己”的现象。
        // 例如：本来敌方可以通过某颗垫脚石下在角落，但在真实棋盘里那颗垫脚石已经被我方翻转了。
        const validBlindOppMoves = blindOppMoves.filter(blindMove =>
            trueOppMoves.some(trueMove => trueMove.row === blindMove.row && trueMove.col === blindMove.col)
        );

        if (validBlindOppMoves.length === 0) {
            maxOpponentWeight = -100;
        } else {
            for (const oppMove of validBlindOppMoves) {
                const weight = POSITION_WEIGHTS[oppMove.row][oppMove.col];
                if (weight > maxOpponentWeight) {
                    maxOpponentWeight = weight;
                }
            }
        }
    }

    return { gainedWeight, maxOpponentWeight };
}

/**
 * 检查边缘插入漏洞 (Edge Insertion Vulnerability)
 * 当我们在边缘落子时，如果留下了一个单格空位隔开我们现有的棋子（例如: 己-空-己 新下），
 * 这个单格空位就成为了极度危险的"楔子"打入点，对手一旦下入将获得绝对稳定子。
 * 
 * @param board 模拟落子后的棋盘（必须是包含新落子和翻转结果的棋盘）
 * @param aiColor 判断的玩家颜色（落子方）
 * @param move 本次落子的坐标
 * @returns 如果发现构成了危险的插入漏洞，返回 true
 */
export function checkEdgeInsertionVulnerability(
    board: CellState[][],
    aiColor: PlayerColor,
    move: { row: number; col: number }
): boolean {
    // 1. 如果本手就下在角落，不视为危险漏洞（占角收益极大）
    if (isCorner(move.row, move.col)) return false;

    // 2. 检查是否在边线上
    if (!isEdge(move.row, move.col)) return false;

    // 3. 构建当前所在边的 1D 数组表示
    // 分四个方向边：上边(r=0), 下边(r=7), 左边(c=0), 右边(c=7)
    // 为了统一步骤扫描，我们将整条边提取出来放进一个长度为8的数组里。
    let edgeValues: CellState[] = [];
    let moveIdx = -1; // 记录当前落子在一条边(1D数组)上的索引

    if (move.row === 0) { // 上边缘
        edgeValues = board[0].slice();
        moveIdx = move.col;
    } else if (move.row === BOARD_SIZE - 1) { // 下边缘
        edgeValues = board[BOARD_SIZE - 1].slice();
        moveIdx = move.col;
    } else if (move.col === 0) { // 左边缘
        edgeValues = board.map(r => r[0]);
        moveIdx = move.row;
    } else if (move.col === BOARD_SIZE - 1) { // 右边缘
        edgeValues = board.map(r => r[BOARD_SIZE - 1]);
        moveIdx = move.row;
    }

    // 4. 重中之重：分别向沿着边的两个方向扫描，看是否存在 [新下的子] - [唯一的空格] - [我方棋子]
    // 这种结构极为致命，因为如果这是唯一的空格，对方下入将没有翻转风险。

    // 向前看 (i = moveIdx - 1)
    if (moveIdx >= 2) {
        // 如果前一格是空，前前格是我方的棋子 (注意这里是在新棋盘上检查，所以新落子的位置必定是我方的)
        if (edgeValues[moveIdx - 1] === null && edgeValues[moveIdx - 2] === aiColor) {
            return true;
        }
    }

    // 向后看 (i = moveIdx + 1)
    if (moveIdx <= BOARD_SIZE - 3) {
        if (edgeValues[moveIdx + 1] === null && edgeValues[moveIdx + 2] === aiColor) {
            return true;
        }
    }

    return false;
}
