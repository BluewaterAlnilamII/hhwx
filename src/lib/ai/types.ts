import { CellState, PlayerColor } from "../othello";

/** 所有 AI 策略函数的通用类型（同步）。 */
export type AIStrategy = (
    board: CellState[][],
    aiColor: PlayerColor
) => { row: number; col: number };

/** 所有 AI 策略函数的通用类型（异步）。 */
export type AIStrategyAsync = (
    board: CellState[][],
    aiColor: PlayerColor
) => Promise<{ row: number; col: number }>;
