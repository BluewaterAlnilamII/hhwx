"use client";

import { create } from "zustand";
import { type Character, CHARACTERS } from "@/lib/characters";

export interface WeightData {
    total: number;
    details: string;
    probability?: number;
    isConfused?: boolean;
}

interface GameStore {
    // 角色选择
    playerCharacter: Character | null;
    aiCharacter: Character | null;
    selectionStep: "pickPlayer" | "pickAI" | "pickColor" | "ready";

    // 玩家选色（黑方或白方）
    playerColor: "black" | "white";

    // 终局回看模式
    reviewingBoard: boolean;

    // 用户认证状态
    userId: string | null;
    username: string | null;

    // 调试模式：显示 AI 落子权重
    debugMode: boolean;
    /** 8x8 矩阵，null 表示该位置无权重（非合法落子点） */
    aiWeights: (WeightData | null)[][];

    // 操作方法
    setPlayerCharacter: (char: Character) => void;
    setAICharacter: (char: Character) => void;
    setPlayerColor: (color: "black" | "white") => void;
    resetSelection: () => void;
    setCharactersById: (playerId: string, aiId: string) => void;
    setAuth: (userId: string | null, username: string | null) => void;
    logout: () => void;
    toggleDebugMode: () => void;
    setAIWeights: (weights: (WeightData | null)[][]) => void;
    clearAIWeights: () => void;
    setReviewingBoard: (val: boolean) => void;
}

/** 创建空的 8x8 权重矩阵 */
function emptyWeights(): (WeightData | null)[][] {
    return Array.from({ length: 8 }, () => Array(8).fill(null));
}

export const useGameStore = create<GameStore>((set) => ({
    playerCharacter: null,
    aiCharacter: null,
    selectionStep: "pickPlayer",

    playerColor: "black",
    reviewingBoard: false,

    userId: null,
    username: null,

    debugMode: false,
    aiWeights: emptyWeights(),

    setPlayerCharacter: (char) =>
        set({ playerCharacter: char, selectionStep: "pickAI" }),

    setAICharacter: (char) =>
        set({ aiCharacter: char, selectionStep: "pickColor" }),

    setPlayerColor: (color) =>
        set({ playerColor: color, selectionStep: "ready" }),

    resetSelection: () =>
        set({
            playerCharacter: null,
            aiCharacter: null,
            selectionStep: "pickPlayer",
            playerColor: "black",
            reviewingBoard: false,
        }),

    setCharactersById: (playerId, aiId) => {
        const player = CHARACTERS.find((c) => c.id === playerId) || null;
        const ai = CHARACTERS.find((c) => c.id === aiId) || null;
        if (player && ai) {
            set({ playerCharacter: player, aiCharacter: ai, selectionStep: "ready" });
        }
    },

    setAuth: (userId, username) => set({ userId, username }),

    logout: () => set({ userId: null, username: null }),

    toggleDebugMode: () => set((s) => ({ debugMode: !s.debugMode })),

    setAIWeights: (weights) => set({ aiWeights: weights }),

    clearAIWeights: () => set({ aiWeights: emptyWeights() }),

    setReviewingBoard: (val) => set({ reviewingBoard: val }),
}));

