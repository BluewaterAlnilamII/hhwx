"use client";

import { useReducer, useCallback, useEffect, useRef } from "react";
import {
    CellState,
    PlayerColor,
    createInitialBoard,
    getValidMoves,
    applyMove,
    countPieces,
    isGameOver,
} from "@/lib/othello";

export type GamePhase =
    | "playing"       // 玩家回合，等待点击
    | "playerLine"    // 显示玩家对话气泡
    | "aiThinking"    // AI 正在计算
    | "aiLine"        // AI 落子后显示对话气泡
    | "ended";        // 游戏结束

interface GameState {
    board: CellState[][];
    currentPlayer: PlayerColor;
    gamePhase: GamePhase;
    isLocked: boolean;
    lastMove: { row: number; col: number } | null;
    passMessage: string | null;
    playerColor: PlayerColor;
    aiColor: PlayerColor;
}

type GameAction =
    | { type: "PLACE_PIECE"; row: number; col: number; player: PlayerColor }
    | { type: "SET_PHASE"; phase: GamePhase }
    | { type: "SWITCH_TURN" }
    | { type: "PASS_TURN"; message: string }
    | { type: "CLEAR_PASS" }
    | { type: "LOCK" }
    | { type: "UNLOCK" }
    | { type: "END_GAME" }
    | { type: "SET_LAST_MOVE"; row: number; col: number }
    | { type: "RESTORE"; state: Partial<GameState> }
    | { type: "RESET"; playerColor: PlayerColor };

function gameReducer(state: GameState, action: GameAction): GameState {
    switch (action.type) {
        case "PLACE_PIECE": {
            const newBoard = applyMove(state.board, action.row, action.col, action.player);
            return {
                ...state,
                board: newBoard,
                lastMove: { row: action.row, col: action.col },
            };
        }
        case "SET_PHASE":
            return { ...state, gamePhase: action.phase };
        case "SWITCH_TURN":
            return {
                ...state,
                currentPlayer: state.currentPlayer === "black" ? "white" : "black",
            };
        case "PASS_TURN":
            return { ...state, passMessage: action.message };
        case "CLEAR_PASS":
            return { ...state, passMessage: null };
        case "LOCK":
            return { ...state, isLocked: true };
        case "UNLOCK":
            return { ...state, isLocked: false };
        case "END_GAME":
            return { ...state, gamePhase: "ended", isLocked: true };
        case "SET_LAST_MOVE":
            return { ...state, lastMove: { row: action.row, col: action.col } };
        case "RESTORE":
            return { ...state, ...action.state };
        case "RESET":
            return createInitialState(action.playerColor);
        default:
            return state;
    }
}

function createInitialState(playerColor: PlayerColor): GameState {
    return {
        board: createInitialBoard(),
        currentPlayer: "black", // 黑白棋规则：黑方先行
        gamePhase: "playing",
        isLocked: playerColor !== "black", // 若玩家执白，需等待 AI（黑方）先行，因此锁定棋盘
        lastMove: null,
        passMessage: null,
        playerColor,
        aiColor: playerColor === "black" ? "white" : "black",
    };
}

const STORAGE_KEY = "hhwx-othello-game";

export interface SavedGameData {
    board: CellState[][];
    currentPlayer: PlayerColor;
    gamePhase: string;
    isLocked: boolean;
    lastMove: { row: number; col: number } | null;
    passMessage: string | null;
    playerColor: PlayerColor;
    aiColor: PlayerColor;
    playerCharacterId?: string;
    aiCharacterId?: string;
}

/** 从 localStorage 读取已保存的对局数据。 */
export function getSavedGame(): SavedGameData | null {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.board && parsed.currentPlayer) {
                return parsed as SavedGameData;
            }
        }
    } catch (e) {
        // 忽略 JSON 解析错误
    }
    return null;
}

export function useOthelloGame(playerColor: PlayerColor, characterIds?: { playerId: string; aiId: string }) {
    const [state, dispatch] = useReducer(gameReducer, playerColor, createInitialState);
    const initializedRef = useRef(false);

    /**
     * 从 localStorage 恢复对局进度。
     * 为什么必须在 useEffect 中执行：Next.js 采用 SSR，服务端渲染时无法访问 localStorage，
     * 若在组件初始化阶段直接读取会导致 Hydration Error（服务端与客户端渲染结果不一致）。
     * 因此将读取逻辑放在 useEffect 中确保仅在客户端执行。
     */
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.board && parsed.currentPlayer) {
                    dispatch({ type: "RESTORE", state: parsed });
                    return;
                }
            }
        } catch (e) {
            // 忽略 JSON 解析错误
        }
    }, []);

    // 棋盘状态变化时自动保存到 localStorage
    useEffect(() => {
        if (state.gamePhase === "ended") {
            // 游戏结束时清除存档，避免下次打开时恢复已结束的对局
            localStorage.removeItem(STORAGE_KEY);
            return;
        }
        try {
            const toSave: SavedGameData = {
                board: state.board,
                currentPlayer: state.currentPlayer,
                gamePhase: "playing", // 保存时统一记为 playing，恢复后从玩家回合重新开始
                isLocked: false,
                lastMove: state.lastMove,
                passMessage: null,
                playerColor: state.playerColor,
                aiColor: state.aiColor,
                playerCharacterId: characterIds?.playerId,
                aiCharacterId: characterIds?.aiId,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        } catch (e) {
            // 忽略写入错误（如 localStorage 已满）
        }
    }, [state.board, state.currentPlayer, state.gamePhase, state.lastMove, state.playerColor, state.aiColor, characterIds]);

    const placePiece = useCallback(
        (row: number, col: number, player: PlayerColor) => {
            dispatch({ type: "PLACE_PIECE", row, col, player });
        },
        []
    );

    const setPhase = useCallback((phase: GamePhase) => {
        dispatch({ type: "SET_PHASE", phase });
    }, []);

    const switchTurn = useCallback(() => {
        dispatch({ type: "SWITCH_TURN" });
    }, []);

    const showPass = useCallback((message: string) => {
        dispatch({ type: "PASS_TURN", message });
        setTimeout(() => dispatch({ type: "CLEAR_PASS" }), 2000);
    }, []);

    const lock = useCallback(() => dispatch({ type: "LOCK" }), []);
    const unlock = useCallback(() => dispatch({ type: "UNLOCK" }), []);
    const endGame = useCallback(() => dispatch({ type: "END_GAME" }), []);

    const reset = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        dispatch({ type: "RESET", playerColor });
    }, [playerColor]);

    const validMoves = getValidMoves(state.board, state.currentPlayer);
    const pieces = countPieces(state.board);
    const gameOver = isGameOver(state.board);

    return {
        state,
        validMoves,
        pieces,
        gameOver,
        placePiece,
        setPhase,
        switchTurn,
        showPass,
        lock,
        unlock,
        endGame,
        reset,
    };
}
